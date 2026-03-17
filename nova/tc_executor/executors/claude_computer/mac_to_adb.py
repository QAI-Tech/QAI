import subprocess
from utils.utils import nova_log

def getEmulatorGeo():
    script = '''
    tell application "System Events"
        set theProcess to first process whose name is "qemu-system-aarch64"
        set biggestArea to 0
        set finalBounds to "0,0,0,0"
        repeat with win in windows of theProcess
            try
                set winName to name of win
                if winName starts with "Android Emulator -" then
                    set {xPos, yPos} to position of win
                    set {w, h} to size of win
                    set area to w * h
                    if area > biggestArea then
                        set biggestArea to area
                        set finalBounds to xPos & "," & yPos & "," & w & "," & h
                    end if
                end if
            end try
        end repeat
        return finalBounds
    end tell
    '''
    try:
        result = subprocess.check_output(["osascript", "-e", script]).decode().strip()
        # Clean out any empty parts caused by extra commas
        parts = [p.strip() for p in result.split(",") if p.strip().isdigit()]
        if len(parts) != 4:
            raise ValueError(f"Expected 4 values, got: {parts}")
        x, y, w, h = map(int, parts)
        print('Emulator x, y, w, h -', x, y, w, h)
        return x, y, w, h
    except subprocess.CalledProcessError as e:
        nova_log("Could not locate emulator window.", Exception("stderr:", e.stderr.decode() if e.stderr else "No stderr available"))
        print("stderr:", e.stderr.decode() if e.stderr else "No stderr available")
        raise
    except ValueError as ve:
        nova_log("Error parsing geometry:", ve)
        raise

def getAndroidScreenSize():
    try:
        output = subprocess.check_output(["adb", "shell", "wm", "size"]).decode().strip()
        # Example output: "Physical size: 1280x2856"
        if "Physical size:" in output:
            size_str = output.split("Physical size:")[-1].strip()
            android_screen_w, android_screen_h = map(int, size_str.split("x"))
            print('android w, h -', android_screen_w, android_screen_h)
            return android_screen_w, android_screen_h
        else:
            raise ValueError(f"Unexpected output format: {output}")
    except subprocess.CalledProcessError as e:
        nova_log("Error running adb command:", e)
        raise
    except Exception as e:
        nova_log("Error parsing screen size:", e)
        raise

def convertMacToEmulator(x_mac, y_mac, 
                         emulator_x, emulator_y, emulator_w, emulator_h,
                         android_screen_w, android_screen_h):
    # Get position relative to emulator window
    rel_x = x_mac - emulator_x
    rel_y = y_mac - emulator_y

    # Scale to Android device pixel dimensions
    scale_x = android_screen_w / emulator_w
    scale_y = android_screen_h / emulator_h

    adb_x = int(rel_x * scale_x)
    adb_y = int(rel_y * scale_y)
    return adb_x, adb_y

def macToAdb(x_mac, y_mac):
    emulator_x, emulator_y, emulator_w, emulator_h = getEmulatorGeo()
    android_screen_w, android_screen_h = getAndroidScreenSize()
    x_adb, y_adb = convertMacToEmulator(x_mac, y_mac,
                                        emulator_x, emulator_y, emulator_w, emulator_h,
                                        android_screen_w, android_screen_h)
    print(f'Mac coords - ({x_mac}, {y_mac})')
    print(f'ADB coords - ({x_adb}, {y_adb})\n')

macToAdb(364, 734)
macToAdb(364, 497)
