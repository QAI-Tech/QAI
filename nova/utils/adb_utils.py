import time, subprocess
from tc_executor.executor import execute
from tc_executor.llm import geminiSingleImageQuery # ss, prompt
from tc_executor.vision import getSS 
from utils.utils import nova_log
import xml.etree.ElementTree as ET
import re, os

def saveAdbSS(outfilepath):
    subprocess.run(f'adb exec-out screencap -p > {outfilepath}', shell=True)
    nova_log(f'adb screenshot saved to {outfilepath}')

def adbKillApp(args, auth_status):
    package_name = args.app_link.split('id=')[1].split('&')[0]
    nova_log(f'Killing the app - {package_name}')
    if auth_status == 'LOGGED_IN':
        subprocess.run(f'adb shell am force-stop {package_name}', shell=True) # quit but stay logged in
    elif auth_status == 'LOGGED_OUT':
        subprocess.run(f'adb shell pm clear {package_name}', shell=True) # similar to fresh install
    else:
        raise Exception(f'Auth_status is neither LOGGED_IN, nor LOGGED_OUT - {auth_status}')
    subprocess.run('adb shell am force-stop com.android.chrome', shell=True)
    nova_log(f'Adb kill command executed. waiting for {args.delay_in_sec} seconds')
    time.sleep(args.delay_in_sec)

def adbOpenApp(args):
    package_name = args.app_link.split('id=')[1].split('&')[0]
    nova_log(f'Starting the app - {package_name}')
    subprocess.run(f"adb shell monkey -p {package_name} -c android.intent.category.LAUNCHER 1", shell=True)
    nova_log(f'Adb open command executed. waiting for {args.delay_in_sec} seconds')
    time.sleep(args.delay_in_sec)

def adbInstallApp(args):
    app_name, app_link, app_installation_time_sec = args.app_name, args.app_link, args.app_installation_time_sec
    if "play.google.com" in app_link:
        retries = 0
        retry_limit = 1
        while True:
            # open app page
            adb_command = f'adb shell am start -a android.intent.action.VIEW -d "{app_link}"'
            subprocess.run(adb_command, shell=True)
            nova_log(f'adb command ran to open the playstore page')
            nova_log(f'Waiting for {args.delay_in_sec} seconds after executing the adb command')
            time.sleep(args.delay_in_sec)
            
            # check if installed correctly
            prompt = (
                'There is an emulator in the image. You have to check if a certain application is installed ',
                'on the emulator or not\n',
                f'Do you see the application installed? If it is installed, you will see ',
                'a button named - Open - or - Update. If it is not installed then you will see ',
                'a button named as - Install.\n'
            )
            prompt = ''.join(prompt)
            ss = getSS()
            response = geminiSingleImageQuery(ss, prompt)
            if response['status']:
                nova_log('App installed successfully')
                return
            nova_log(f'App was not installed successfully. LLM replied - {response['rationale']}')
            nova_log('Installing the application')
            
            if retries == retry_limit:
                nova_log('Retry limit exceeded for installing an app - Terminating', Exception("Retry limit exceeded"))
                raise Exception('Retry limit exceeded for installing an app - Terminating')
            retries += 1

            # execute the install if necessary
            step_description = (
                "Click on 'Install' button\n"
            )
            step_description = ''.join(step_description)
            tc = {
                "test_case_description": "Install an application",
                "step_description": step_description,
                "expected_results":[],
                "preconditions": []
            }
            execute(tc)
            nova_log(f'app is being installed - waiting for {app_installation_time_sec} sec...')
            time.sleep(app_installation_time_sec) 
        raise Exception(f'Couldnt install an app')
    else:
        raise Exception(f'{app_link} installement not supported')


def adbDumpUI(xml_name="ui_dump.xml"):
    """
    Dumps current emulator UI hierarchy to XML,
    pulls it locally,
    parses it, and returns a dictionary of important UI elements.
    """
    # 1. Run uiautomator dump on device
    remote_path = f"/sdcard/{xml_name}"
    subprocess.run(["adb", "shell", "uiautomator", "dump", remote_path], check=True)

    # 2. Pull the file to current directory
    local_path = os.path.join(os.getcwd(), xml_name)
    subprocess.run(["adb", "pull", remote_path, local_path], check=True)

    # 3. Parse XML
    tree = ET.parse(local_path)
    root = tree.getroot()

    def parse_bounds(bounds_str):
        nums = list(map(int, re.findall(r"\d+", bounds_str)))
        x1, y1, x2, y2 = nums
        return [[x1, y1], [x2, y2]], ((x1 + x2)//2, (y1 + y2)//2)

    result = {}

    important_classes = [
        "android.widget.Button",
        "android.widget.EditText",
        "android.widget.CheckBox",
        "android.widget.Switch",
        "android.widget.RadioButton",
        "android.widget.TextView"
    ]

    for idx, node in enumerate(root.iter("node")):
        clazz = node.attrib.get("class", "")
        text = node.attrib.get("text", "").strip()
        rid = node.attrib.get("resource-id", "").strip()
        bounds = node.attrib.get("bounds", "")

        # Filter out unimportant nodes
        if not (text or rid or clazz in important_classes):
            continue

        if bounds:
            bounds_parsed, center = parse_bounds(bounds)
        else:
            bounds_parsed, center = None, None

        # Create readable key
        key = rid if rid else f"{clazz}_{idx}"

        # Structure
        result[key] = {
            "class": clazz,
            "text": text,
            "bounds": bounds_parsed,
            "center": center
        }

    return result
