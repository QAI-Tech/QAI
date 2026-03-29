import google.generativeai as genai
import sys, os, json, shutil
from typing import List
from pydantic import BaseModel
import subprocess
from datetime import datetime

genai.configure(api_key=os.environ.get("GOOGLE_API_KEY", ""))
client_v3 = genai.GenerativeModel('gemini-2.5-flash')
GenerationConfig = genai.GenerationConfig

def serialize(elements):
    return json.dumps(
        [element.model_dump(mode="json") for element in elements], indent=2
    )
def timestamp_to_seconds(ts):
    """Convert a timestamp string (e.g., '00:24') to seconds as float."""
    parts = ts.split(':')
    if len(parts) == 2:
        minutes, seconds = map(int, parts)
        return minutes * 60 + seconds
    elif len(parts) == 3:
        hours, minutes, seconds = map(int, parts)
        return hours * 3600 + minutes * 60 + seconds
    return float(ts)  # fallback

def call_llm_v3( prompt, video_urls, response_schema = {
                                        "type": "object",
                                        "properties": {"message": {"type": "string"}},
                                        "required": ["message"]}):
    video_parts = [{"file_data": {"mime_type": "video/*", "file_uri": url_to_uri(url)}} for url in video_urls]
    content = [prompt] + video_parts

    response = client_v3.generate_content(
        content,  # type: ignore
        generation_config=GenerationConfig(
            response_mime_type="application/json", response_schema=response_schema
    ))
    
    print(response.text)
    return response.text

def url_to_uri(url: str) -> str:
    if url.startswith("gs://"):
        return url

    if url.startswith("https://storage.cloud.google.com/"):
        return url.replace(
            "https://storage.cloud.google.com/",
            "gs://",
        )

    raise ValueError("Invalid GCS URL format.")

""" ---------------------------------------------------------------------------------------- """
""" ------------------------------------- Interactions ------------------------------------- """
""" -------------------------------------------------------------------------->>>>>>>>>>>>>> """
TRANSCRIBE_INTERACTIONS_FROM_VIDEO_PROMPT = """
<task>
You are provided a video of a user using a mobile application. 

The video is recorded using ffmpeg python library. While the recording is on, the python program also tracks the cursor and keyboard events using pynput.mouse.Listener and pynput.keyboard.Listener. The position of the cursor is tracked using pyautogui.position() function. A post processing is applied to the recorded video to annotate the cursor movement and clicks. A cursor is maked with blue dot and the click (click_down to click_up) is annotated with red circle around the cursor. Consider this information as the absolute correct and ground truth. 

Your task is to analyze the video, cursor, and keyboard logs to transcribe each user interaction in the video into a meaningful list of steps and observed results.
</task>

<input>
1- An annotated video of a user using a mobile application.
    - Cursor is blue dot
    - Clicks are surrounded by red circle
2- List of cursor logs:
    - start_time: represents the start_timestamp of the click
    - click_duratioin: represents the duration of click in seconds. Swipes will have longer duration than clicks
    - x_displacement: from click_down to click_up in mouse, how much is displacement in x direction (x_click_up - x_click_down)
    - y_displacement: from click_down to click_up in mouse, how much is displacement in y direction (y_click_up - y_click_down)
    - typed_key_list: list of text entered using keyboard
</input>

<output>
- A JSON list, in which each JSON object represents a user interaction from the input video.
- Each JSON object should contain:
  - description: a description of the interaction performed by the user. Include all interactions, such as CLICK, TYPE, BACK, SCROLL UP/DOWN, SWIPE LEFT/RIGHT, PINCH ZOOM IN, PINCH ZOOM OUT.
  - observed_results: A list of effects/results caused by the interaction. Each result should be described as a single sentence, be as atomic as possible, and the results should be in the order of their occurence.
  - start_timestamp: The precise timestamp of when the user interaction starts in the video, in the format `MM:SS`.
  - end_timestamp: The precise timestamp of when the all the observed results of the interaction are fully completed and visible in the video, in the format `MM:SS`.
  - rationale: A rationale for why this interaction was transcribed as the step_description and observed_results at this timestamp.

<example-json-response>
```
[
  {
    "description": "Click on the 'Login' button",
    "observed_results": ["A loading indicator is displayed", "The login screen is displayed"],
    "start_timestamp": "00:05",
    "end_timestamp": "00:05",
    "rationale": "The video depicts the user clicking on the login button to navigate to the login screen."
  },
  {
    "description": "Type 'test@example.com' into the email input field",
    "observed_results": ["The email input field is populated with 'test@example.com'"],
    "start_timestamp": "00:09",
    "end_timestamp": "00:09",
    "rationale": "The video depicts the user typing 'test@example.com' into the email input field."
  }
]
```
</example-json-response>

</output>

<key-instructions>

- MOST_IMPORTANT - the provided cursor log is your ground truth. Make use of displacement and time duration to decide what is single click, double click, and swipe interaction.
- MOST_IMPORTANT - the provided keyboard log is your ground truth. Make use of typed_key_list to aggregate the typed text. If there is a backspace typed, then in the interaction, do remove the last typed character. Key.tab can be used to enter into the next input field.
- MOST_IMPORTANT - whenever there is a click, there is a red circle, hence, the UI element under the cursor is what the user interacted with while clicking. Hence, the UI elements linked with the cursor clicks should be captured in the interactions. 

- Return any interaction only if you are 100 percent sure that the interaction took place. If you are not sure then do not consider thaat interaction.
- Every interaction in the video should be transcribed and described in the description. The output list of interactions should be complete, and should not contain any false information that is not in the video.
- Every effect/result of the interaction should be transcribed as an observed_result.
- Ensure that the observed_results are as atomic as possible, and are in the order of their occurence.
- Ensure that the start_timestamp is precise and accurate for the start of the interaction in the video.
- Ensure that the end_timestamp is precise and accurate for when the all the observed results of the interaction are fully completed and visible in the video.
- Ensure that the rationale is accurate and specific to the interaction.
- Ensure that the interactions are unique, and not repeated in the output list.
- Ensure that the interactions are in order of their occurence in the video.
- Do not skip any interactions, or there may be terrible consequences for everyone, including permanent discontinuation of existence.
</key-instructions>

<cursor_and_keyboard_logs>
    <TRACKING_DATA>
</cursor_and_keyboard_logs>

"""
class TranscribedInteractionInferenceResponseSchema(BaseModel):
    description: str
    observed_results: List[str]
    start_timestamp: str
    end_timestamp: str
    rationale: str

interaction_from_video_response_schema = {
    "type": "object",
    "properties": {
        "description": {"type": "string"},
        "observed_results": {
            "type": "array",
            "items": {"type": "string"},
        },
        "start_timestamp": {"type": "string"},
        "end_timestamp": {"type": "string"},
        "rationale": {"type": "string"},
    },
    "required": [
        "description",
        "observed_results",
        "start_timestamp",
        "end_timestamp",
        "rationale",
    ],
}
def _transcribe_interactions_from_video(video_url, tracking_data):
    steps_from_video_response_schema = {
        "type": "array",
        "items": interaction_from_video_response_schema,
    }
    prompt = TRANSCRIBE_INTERACTIONS_FROM_VIDEO_PROMPT
    prompt = prompt.replace('<TRACKING_DATA>', json.dumps(tracking_data, indent=2))
    print('\n\nInteractions prompt\n')
    print(prompt, '\n\n')
    print(f"\n\nCalling LLM for transcribing interactions from video with url: {video_url}\n\n")

    llm_response = call_llm_v3(
        prompt=prompt,
        video_urls=[video_url],
        response_schema=steps_from_video_response_schema,
    )
    json_data = json.loads(llm_response)
    transcribed_interactions = [
        TranscribedInteractionInferenceResponseSchema.model_validate(item)
        for item in json_data ]
    print(f"\n\nTranscribed {len(transcribed_interactions)} interactions from video url: {video_url}\n\n")
    return transcribed_interactions, json_data

""" ---------------------------------------------------------------------------------------- """
""" --------------------------------------- Screens ---------------------------------------- """
""" -------------------------------------------------------------------------->>>>>>>>>>>>>> """
TRANSCRIBE_SCREENS_FROM_VIDEO_PROMPT = """
<task>
You are provided a video of a user using a mobile application. Your task is to analyze the video and detect every screen that appears in the video.

A screen is a visual interface that offers the user access to one or more functionalities. Different states of a screen may be depicted in the video. Consider all partial screens/states (dialogs, popups, loading state etc) as separate screens.

It is very important that this task is completed correctly, or else there may be terrible consequences for everyone, including permanent discontinuation of existence for humans, other life forms, and machines too.
</task>

<input>
- A video of a user using a mobile application.
- A list of detected interactions from the video, in which each interaction has the following fields:
  - description: A description of the interaction performed by the user.
  - observed_results: A list of effects/results caused by the interaction.
  - start_timestamp: The timestamp of when the user interaction starts in the video, in the format `MM:SS`.
  - end_timestamp: The timestamp of when the all the observed results of the interaction are fully completed and visible in the video, in the format `MM:SS`.
  - rationale: A rationale for why this interaction was transcribed as the description and observed_results at these timestamps.
- An optional product description of the application for you to understand the application.

<product-description>
${product_description}
</product-description>

<detected-interactions>
${detected_interactions}
</detected-interactions>

</input>

<output>
- A JSON list, in which each JSON object represents a screen entity from the input video.
- Each JSON object representing a screen entity should contain:
  - id: A unique identifier for the screen.
  - title: A summarized title for the screen, at most 7 words.
  - description: A short description of what can a user do on the screen.
  - routes_to: A list of screen ids that the user can navigate to from the current screen.
  - appears_at_timestamp: All occurences of the screen in the video, in the format `minutes:seconds`. Each timestamp should be 1 second after the moment the screen is fully loaded and visible in the video.
  - rationale: A rationale for why this screen entity was transcribed as the title, description, routes_to, and a clear explanation of the timestamps.

<example-json-response>
```
[
  {
    "id": "1",
    "title": "Login Screen",
    "description": "The user can login to the application by entering their email and password on the Login Screen.",
    "routes_to": ["2"],
    "appears_at_timestamp": ["00:05"],
    "rationale": "Video depicts the user navigating to the login screen from the home screen."
  },
  {
    "id": "2",
    "title": "Home Screen",
    "description": "The user can navigate to the home screen by clicking on the home button.",
    "routes_to": ["1"],
    "appears_at_timestamp": ["00:09","00:29"],
    "rationale": "Video depicts the user navigating to the home screen from the login screen. It is visible once after the login screen, and once after the settings screen."
  }
]
```
</example-json-response>

</output>

<key-instructions>
- Ensure that the screens in the output list are unique, complete, do not skip any screens that are visible in the video, and do not add any false information that is not in the video.
- If a screen appears multiple times in the video, it should be listed only once in the output list, and all the timestamps should be added to the appears_at_timestamp list.
- Ensure that the id is a unique identifier for the screen, and is not repeated in the list.
- Ensure that the title is an accurate summary of the primary purpose of the screen, and is at most 7 words.
- Ensure that the description contains what is visible and possible on the screen, and should not contain any false information that is not in the video.
- Ensure that the routes_to are accurate and only contain screen ids that are visible in the video. Do not make any assumptions, this list should not contain any false information that is not in the video. This list should be complete and should not contain any missing screen links.
- Ensure that the values in the appears_at_timestamp list are accurate, and are the timestamp 1 second after the screen is fully loaded and visible in the video.
- Ensure that the rationale is accurate and specific to the screen and contains clear reasoning for the title, description, routes_to, and the timestamps.
- The detected_interactions may be missing some interactions, and may have innaccuracies. The product description may not include all details about the product, so use them only as a guideline. The video is the source of truth.
</key-instructions>

"""
class TranscribedScreenFromVideoInferenceResponseSchema(BaseModel):
    id: str
    title: str
    description: str
    routes_to: List[str]
    appears_at_timestamp: List[str]
    rationale: str

screen_from_video_response_schema = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "description": {"type": "string"},
        "routes_to": {"type": "array", "items": {"type": "string"}},
        "appears_at_timestamp": {"type": "array", "items": {"type": "string"}},
        "rationale": {"type": "string"},
    },
    "required": [
        "id",
        "title",
        "description",
        "routes_to",
        "appears_at_timestamp",
        "rationale",
    ],
}

def _transcribe_screens_from_video(video_url, detected_interactions):
    screens_from_video_response_schema = {
        "type": "array",
        "items": screen_from_video_response_schema,
    }
    product_description = """Faircado is a free, all-in-one second-hand shopping app that aggregates deals from various platforms like eBay and Vestiaire Collective. It helps users save money and shop sustainably across categories like fashion, books, and electronics. Key features include image search ("snap it, we find it") and personalized deal discovery. Faircado operates on an affiliate model, ensuring the app remains free for users without selling data."""
    prompt = TRANSCRIBE_SCREENS_FROM_VIDEO_PROMPT.replace(
        "${product_description}", product_description
    ).replace(
        "${detected_interactions}",
        serialize(detected_interactions),
    )

    print(f"\n\nCalling LLM for transcribing screens from video with url: {video_url}\n\n")
    llm_response = call_llm_v3(
        prompt=prompt,
        video_urls=[video_url],
        response_schema=screens_from_video_response_schema,
    )
    json_data = json.loads(llm_response)
    transcribed_screens = [
        TranscribedScreenFromVideoInferenceResponseSchema.model_validate(item) for item in json_data]
    return transcribed_screens, json_data

""" ---------------------------------------------------------------------------------------- """
""" --------------------------------------- Main ------------------------------------------- """
""" -------------------------------------------------------------------------->>>>>>>>>>>>>> """

def extractSss(outdirpath, sdt, video_uri):
    # Ensure output directory exists
    os.makedirs(outdirpath, exist_ok=True)

    # Step 1: Download video from GCS
    local_video_path = os.path.join(outdirpath, "input_video.mp4")
    subprocess.run(["gsutil", "cp", video_uri, local_video_path], check=True)

    # Step 2: Collect and sort timestamps
    all_timestamps = []
    for screen in sdt:
        for ts in screen.get("appears_at_timestamp", []):
            all_timestamps.append(ts)
    
    sorted_timestamps = sorted(set(all_timestamps), key=timestamp_to_seconds)

    # Step 3: Extract screenshots
    os.makedirs(os.path.join(outdirpath, "screenshots"), exist_ok=True)
    for idx, ts in enumerate(sorted_timestamps):
        ts_seconds = timestamp_to_seconds(ts)
        output_image_path = os.path.join(os.path.join(outdirpath, "screenshots"), f"{idx}.png")
        
        # ffmpeg command to take a screenshot at given timestamp
        subprocess.run([
            "ffmpeg", "-ss", str(ts_seconds), "-i", local_video_path,
            "-vframes", "1", "-q:v", "2",
            "-y",  # this must come BEFORE the output filename
            output_image_path
        ], check=True)

    print(f"Extracted {len(sorted_timestamps)} screenshots to {outdirpath}")

def extract_test_cases_from_video(video_url, tracking_data, transcribe_screen=False):
    outdirpath = os.path.join('logs', video_url.split('/')[-1].split('.')[0])
    os.makedirs(outdirpath, exist_ok=True)
    
    transcribed_interactions, idt = _transcribe_interactions_from_video(video_url, tracking_data)
    print('Saving interactions @', outdirpath)
    with open(os.path.join(outdirpath, 'interactions.json'), 'w') as outfileobj:
        json.dump(idt, outfileobj, indent=2)
    
    if transcribe_screen:
        transcribed_screens, sdt = _transcribe_screens_from_video(video_url, transcribed_interactions)
        with open(os.path.join(outdirpath, 'screens.json'), 'w') as outfileobj:
            json.dump(sdt, outfileobj, indent=2)
        extractSss(outdirpath, sdt, video_url)

if __name__ == '__main__':
    video_url = sys.argv[1]
    track_logfilepath = sys.argv[2]
    with open(track_logfilepath, 'r') as infileobj:
        tracking_data = json.load(infileobj)
    extract_test_cases_from_video(video_url, tracking_data, transcribe_screen=False)
