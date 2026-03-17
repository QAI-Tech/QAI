import argparse, os, sys, json, shutil, time, random
from utils.adb_utils import adbKillApp, adbOpenApp, adbInstallApp, saveAdbSS
from PIL import Image
from tc_executor.llm import geminiSingleImageQuery
from tc_executor.constants import PASSWORD, USERNAME, DATE_NOW, TIME_NOW
from tc_executor.executor import execute
from gcp_upload.log_states import upload_state_to_gcs # (local_dirpath, bucket_name, remote_dir_prefix, filenames)
from datetime import datetime
from utils.utils import nova_log
from tc_executor.constants import BUCKET_NAME, PROD_BUCKET_PREFIX, PRODUCTION_ENVIRONMENT

def get_current_timestamp():
    return datetime.now().strftime("%Y%m%d_%H%M%S")

def parseArgs():
    # required params
    parser = argparse.ArgumentParser(description="Monkeyrun Parser")
    parser.add_argument('--app_link',
                        type=str, help='playstore/appstore/apk_file link', required=True)
    parser.add_argument("--app_name",
                        type=str, help="Name of the application", required=True)
    
    # default params
    parser.add_argument('--app_installation_time_sec',    # required for generator
                        type=int, help='how many seconds to wait after clicking on install button', default=240)
    parser.add_argument('--delay_in_sec',    # required for generator
                        type=int, help='how many seconds to wait after the execution of each step', default=18)
    parser.add_argument('--ss_dirpath', 
                        type=str, help='Where to save the screenshots', default="monkey_run_sss")    
    parser.add_argument('--email_format', # required for generator
                        type=str, help='Enter the email format - agent+spoony_<UID>@qaitech.ai',
                        default="agent+spoony_<UID>@qaitech.ai")
    parser.add_argument('--monkey_timeout_in_mins',
                        type=int, help='For how long to keep running the program', default=15)

    args = parser.parse_args()
    return args

def openFreshApp(args):
    try: # install an app
        adbInstallApp(args)
        adbKillApp(args)
        adbOpenApp(args)
    except Exception as e:
        nova_log(f'Terminating - Exception raised while opening an app', e)
        exit(0)
def saveMonkeyRunToGCP(ss_dirpath, product_id, test_run_id, environment):
    filenames = os.listdir(ss_dirpath)
    bucket = BUCKET_NAME + (PROD_BUCKET_PREFIX if environment == PRODUCTION_ENVIRONMENT else "")
    gcp_path = os.path.join(str(product_id), str(test_run_id), 'monkey_run_output', get_current_timestamp())
    nova_log(f'Uploading {len(filenames)} files to gcp - {gcp_path}...')
    upload_state_to_gcs(ss_dirpath, bucket, gcp_path, filenames, bucket)
    return gcp_path

def checkTimeout(start, args, steps_taken):
    end = time.time()
    time_spent = (end-start)/60
    if time_spent > args.monkey_timeout_in_mins:
        nova_log('Terminating - Monkey run time out')
        with open(os.path.join(args.ss_dirpath, 'steps_taken.json'), 'w') as outfileobj:
            json.dump(steps_taken, outfileobj, indent=2)
        gcp_path = saveMonkeyRunToGCP(args.ss_dirpath, args.product_id, args.test_run_id, args.environment)
        return gcp_path
    nova_log(f'Time spent so far - {time_spent} mins')
    return None

def checkDeadEnd(ss):
    prompt = (
        "You are given a screenshot of a mobile phone. A human wants to explore the current application. ",
        "You have to check if it's a dead end. The human wants to stay on the same app. Do not want to open ",
        "any third party link e.g. Ebay, Amazon, etc. from the current application. ",
        "return True if you think there is no more exploration can be done given the current state of the app.",
        "If you return True, in rationale, return what possible actions you think are possible. ",
        "If you return False, in rationale, return why do you think its a dead end\n",
        "Something is dead end if there is nothing left to exploer on the application or ",
        "a third party app page got opened - chrome page or email page. Don't be very strict. ",
        "you can mark it as dead end even if you have some doubt about third party app."
    )
    prompt = ''.join(prompt)
    response = geminiSingleImageQuery(ss, prompt)
    nova_log(f'Check Dead end response - \n{json.dumps(response, indent=2)}')
    return response['status']

def handleDeadEnd(args):
    adbKillApp(args)
    adbOpenApp(args)

def getAllSteps(args, ss):
    EMAIL_ID = args.email_format.replace('<UID>', '{DATE_NOW}_{TIME_NOW}')
    prompt = (
    '<TASK>\n',
        'You are a user trying to nevigate through an app for the first time. ',
        'The screenshot shows an image of an application. ',
        'The step format is also provided to you below. You have to formulate all possible steps possible ',
        'Consider all the UI elements visible on the screenshot. For every UI element, formulate atleast ',
        'one step. The steps returned should be elobarated such that they follow the step_format guidelines\n',
    '</TASK>\n\n',

    '<STEP_FORMAT>\n',
        'The step you will return should be in one of the below format:\n',
        '<Move_and_click>\n',
            'Use combination of Move cursor, and click command. Also use nearby text or spacial information ',
            'to encode the step. Some of cases you can handle as below. For other cases, handle it yourself\n',
            'Case 1 - Click an icon - describe the icon by name or symbol or locality\n',
            'Case 2 - Click an input field - if there is a text inside the field then use that text as - ',
                      'e.g. "click on search bar with text - Search Google or type URL"\n',
            'Case 3 - Click an input field - if there is text above or below the input field but not on field ',
                      'then use the command like - e.g. "Move the cursor to the email field which is below ',
                      'the text - Enter Email id - and click"\n',
        '</Move_and_click>\n',

        '<Move_and_DoubleClick_and_KeyboardType>\n',
            "Use Combination of Move cursor, double click, and type command. Usually, this combination is used ",
            "to replace a piece of text. Following is an example - \n",
            "1 - Move the cursor to the center of the written text - <text>, double-click, type <new_text>\n",
        '</Move_and_DoubleClick_and_KeyboardType>\n\n',

        '<Type>\n',
            'Type <text> in <field name/identifier> field\n',
            "Press <key-backspace/enter/up-arrow/...> on keyboard\n",
        '<Type>\n',

        '<Swipe left/right/up/down>\n',
            "Use the following information to make a swipe instruction\n",
            "1 - swipe-direction (Up/Down/Left/Right)\n",
                 'swipe-up - content scrolls down - from bottom to top\n',
                 'swipe-down - content scrolls up - from top to bottom\n',
                 'swipe-right - content moves left - from left to right\n',
                 'swipe-left - content moves right - from right to left\n',
            "2 - Move cursor - Whenever you want to swipe, first move the cursor to one ",
                 'of the item which you think is part of swiping. ',
                 "Use color/shape/relative-position(top-left, top-right, bottom-left, bottom-right) to describe ",
                 "the item where we want to place the cursor.\n",
            "3 - swipe - Specify how much to swipe\n",
            "In your instruction, incude the following title - \n",
            "<swipe-direction>-<starting_relative_pos>-<ending_relative_pos>: ",
            "<Instruction info>\n",
            "Use above 3 parameters to describe the scroll/swipe instruction precisily.\n",
            "In the instruction, always use one of the item as a reference as a starting point of swipe\n",
        '</Swipe left/right/up/down>\n',
    '</STEP_FORMAT>\n\n',

    '<CREDENTIALS>\n',
        'Use the following credentials whenever needed\n',
        f'USERNAME: {USERNAME}\n',
        f'PASSWORD: {PASSWORD}\n',
        f'EMAIL_ID: {EMAIL_ID}\n',
    '<CREDENTIALS>\n\n',

    '<OUTPUT_FORMAT>\n',
        'all_steps_possible: all probable steps which follows the step_format above\n',
    '</OUTPUT_FORMAT>\n\n',
    )
    prompt = ''.join(prompt)
    response_schema={"type": "object",
                     "properties": {
                         "all_steps_possible": {
                                "type": "array",
                                "items": {"type": "string"}},
                     }, "required": ["all_steps_possible"],}
    response = geminiSingleImageQuery(ss, prompt, response_schema=response_schema)
    nova_log(f'all steps possible response - \n{response}')
    return response['all_steps_possible']

def monkey_main(args):
    if os.path.exists(args.ss_dirpath):  shutil.rmtree(args.ss_dirpath) # log directory for generator
    openFreshApp(args)
    os.makedirs(args.ss_dirpath, exist_ok=True)
    start = time.time()
    counter = 0
    steps_taken = []
    while True:
        outfilepath = os.path.join(args.ss_dirpath, f'{counter}.png')
        counter += 1
        saveAdbSS(outfilepath)
        ss = Image.open(outfilepath)

        gcp_path = checkTimeout(start, args, steps_taken)
        if gcp_path: return gcp_path

        is_dead_end = checkDeadEnd(ss)
        if is_dead_end: 
            handleDeadEnd(args)
            continue

        all_steps = getAllSteps(args, ss)
        step = random.choice(all_steps)
        nova_log(f'chosen step ---- {step}')

        execute({'step_description':step}, delay_in_sec=args.delay_in_sec)
        steps_taken.append(step)
