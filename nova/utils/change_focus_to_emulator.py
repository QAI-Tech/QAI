import platform
import subprocess
import sys
import re
import time

def get_emulator_window_title_macos():
    """Returns the title of the emulator window on macOS."""
    try:
        output = subprocess.check_output([
            "osascript", "-e",
            'tell application "System Events" to get the name of every window of every process'
        ], text=True)
        matches = re.findall(r"Android Emulator.*?Pixel.*?:\d+", output)
        return matches[0] if matches else None
    except Exception as e:
        print(f"[macOS] Failed to detect window: {e}")
        return None

def focus_emulator_macos(window_title_substring):
    """Brings the window to front using AppleScript."""
    script = f'''
    tell application "System Events"
        repeat with proc in every process
            repeat with win in every window of proc
                if name of win contains "{window_title_substring}" then
                    set frontmost of proc to true
                    return
                end if
            end repeat
        end repeat
    end tell
    '''
    subprocess.run(["osascript", "-e", script])

def get_emulator_window_title_linux():
    """Returns the emulator window title using wmctrl or xdotool (Linux)."""
    try:
        output = subprocess.check_output(["xdotool", "search", "--name", "Android Emulator"], text=True)
        window_ids = output.strip().splitlines()
        return window_ids[0] if window_ids else None
    except Exception as e:
        print(f"[Linux] Failed to detect emulator window: {e}")
        return None

def focus_emulator_linux(window_id):
    """Brings the emulator window to focus using xdotool (Linux)."""
    subprocess.run(["xdotool", "windowactivate", window_id])

def focusToEmulator():
    start = time.time()
    system = platform.system()

    if system == "Darwin":
        print("Running on macOS...")
        title = get_emulator_window_title_macos()
        if title:
            print(f"Focusing emulator: {title}")
            focus_emulator_macos(title)
        else:
            raise Exception("Emulator window not found.")
    elif system == "Linux":
        print("Running on Linux...")
        window_id = get_emulator_window_title_linux()
        if window_id:
            print(f"Focusing emulator window ID: {window_id}")
            focus_emulator_linux(window_id)
        else:
            raise Exception("Emulator window not found.")
    else:
        raise Exception(f"Unsupported platform: {system}")

    print(f'Time spent to change the focus to emulator in {system} device -', time.time()-start, 'seconds')

"""
if __name__ == "__main__":
    focusToEmulator()
"""

