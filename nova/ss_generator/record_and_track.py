import subprocess
import threading
import signal, json
import time
import sys, os, shutil
import pyautogui
from pynput import mouse
from pynput.mouse import Listener
import cv2
import numpy as np
from pynput import keyboard
from change_focus_to_emulator import focusToEmulator

cursor_events = []
record_start_time = None
running = True
video_file = "cursor_logs/screen_record_output.mkv"
ffmpeg_process = None
running = True

def record_screen():
    global ffmpeg_process, record_start_time
    command = [
        'ffmpeg',
        '-f', 'avfoundation',
        '-framerate', '24',
        '-i', '2:none',  # Replace 2 with your screen device index
        '-pix_fmt', 'yuv420p',
        '-preset', 'ultrafast',
        '-vsync', 'vfr',
        '-y',
        video_file
    ]
    ffmpeg_process = subprocess.Popen(
                    command,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
    )

def post_process_video(
    input_video="cursor_logs/screen_record_output.mkv",
    event_file="cursor_logs/cursor_events.json",
    output_video="cursor_logs/screen_record_annotated.mp4"
):
    print("Post-processing video...")

    # Load mouse events
    with open(event_file, "r") as f:
        events = json.load(f)

    cap = cv2.VideoCapture(input_video)
    if not cap.isOpened():
        print("❌ Failed to open video.")
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    print('fps loaded - ', fps)
    fps = 24 
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    out = cv2.VideoWriter(
        output_video,
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height)
    )

    frame_idx = 0
    cursor_pos = None
    click_timer = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        #current_time = frame_idx / fps
        current_time = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0  # in seconds
        events_this_frame = [e for e in events if abs(e["time"] - current_time) < (1 / fps)]

        for e in events_this_frame:
            if e['type'] == 'key_down' or e['type'] == 'key_up':
                continue
            x, y = int(e["x"]), int(e["y"])
            SCALE_FACTOR = 2  # Usually 2 for Retina
            x, y = int(e["x"] * SCALE_FACTOR), int(e["y"] * SCALE_FACTOR)
            if e["type"] == "move":
                cursor_pos = (x, y)
            elif e["type"] == "click_down":
                cursor_pos = (x, y)
                click_timer = 10  # show red ring for 10 frames
            elif e['type'] == 'click_up':
                cursor_pos = (x, y)
                click_timer = 0

        # Draw mouse
        if cursor_pos:
            cv2.circle(frame, cursor_pos, 10, (255, 0, 0), -1)  # green dot
            if click_timer > 0:
                cv2.circle(frame, cursor_pos, 35, (0, 0, 255), 5)
                #click_timer -= 1

        out.write(frame)
        frame_idx += 1

    cap.release()
    out.release()
    print(f"✅ Annotated video saved as: {output_video}")


def handle_exit(sig, frame):
    global running
    print("\nStopping recording...")
    running = False

    if ffmpeg_process:
        try:
            ffmpeg_process.stdin.write(b'q\n')  # ✅ Graceful stop via stdin
            ffmpeg_process.stdin.flush()
        except Exception as e:
            print("Failed to send 'q' to FFmpeg:", e)

        ffmpeg_process.wait()
        time.sleep(2)
        print(f"Recording saved to {video_file}")
    
    with open("cursor_logs/cursor_events.json", "w") as f:
        json.dump(cursor_events, f, indent=2)
    print("Mouse events saved to cursor_events.json")
    post_process_video()
    sys.exit(0)

signal.signal(signal.SIGINT, handle_exit)

def on_click(x, y, button, pressed):
    timestamp = time.time() - record_start_time
    cursor_events.append({
        "time": round(timestamp, 3),
        "type": "click_down" if pressed else "click_up",
        "x": x,
        "y": y,
        "button": str(button)
    })

def on_scroll(x, y, dx, dy):
    timestamp = time.time() - record_start_time
    cursor_events.append({
        "time": round(timestamp, 3),
        "type": "scroll",
        "x": x,
        "y": y,
        "dx": dx,
        "dy": dy
    })

def track_mouse_movement():
    while running:
        x, y = pyautogui.position()
        timestamp = time.time() - record_start_time
        cursor_events.append({
            "time": round(timestamp, 3),
            "type": "move",
            "x": x,
            "y": y
        })
        time.sleep(0.01)

def on_key_press(key):
    timestamp = time.time() - record_start_time
    try:
        key_str = key.char  # Single character key
    except AttributeError:
        key_str = str(key)  # Special key (e.g., Key.enter, Key.space)

    cursor_events.append({
        "time": round(timestamp, 3),
        "type": "key_down",
        "key": key_str
    })

def on_key_release(key):
    timestamp = time.time() - record_start_time
    try:
        key_str = key.char
    except AttributeError:
        key_str = str(key)

    cursor_events.append({
        "time": round(timestamp, 3),
        "type": "key_up",
        "key": key_str
    })

    if key == keyboard.Key.esc:
        # Optional: stop listener on ESC key
        return False

if __name__ == "__main__":
    focusToEmulator()
    print("Recording started. Press Ctrl+C to stop.")
    if os.path.exists('cursor_logs'):
        shutil.rmtree('cursor_logs')
    os.makedirs('cursor_logs', exist_ok=True)


    # Start FFmpeg recording thread
    t = threading.Thread(target=record_screen)
    t.start()
    time.sleep(0.3)
    record_start_time = time.time()  # ✅ Initialize this before anything else
 
    # Start mouse tracking
    from pynput.mouse import Listener
    Listener(on_click=on_click, on_scroll=on_scroll).start()
    keyboard.Listener(on_press=on_key_press, on_release=on_key_release).start()
    threading.Thread(target=track_mouse_movement, daemon=True).start()

    while running:
        time.sleep(0.5)

