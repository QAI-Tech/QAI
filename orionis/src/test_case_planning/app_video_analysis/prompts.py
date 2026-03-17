TRANSCRIBE_INTERACTIONS_FROM_VIDEO_PROMPT = """
<task>
You are provided a video of a user using a mobile application. Your task is to analyze the video and transcribe each user interaction in the video into a meaningful list of steps and observed results.
</task>

<input>
- A video of a user using a mobile application.
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

"""

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

FORMULATE_TEST_CASES_FROM_VIDEO_V0 = """
<task>
You are a software Quality Assurance expert, with a deep understanding of testing and safety principles. You are given a video of a user using a mobile app. Your task is to formulate a test case of the user flow depicted in the video.

It is very important that this task is completed correctly, or else there may be terrible consequences for everyone, including permanent discontinuation of existence for humans, other life forms, and machines too.
</task>

<input>
- A video of a user using a mobile application.
- An optional product description of the application for you to understand the application.
- A list of transcribed interactions from the video, in which each interaction has the following fields:
  - description: a description of the interaction performed by the user, such as CLICK, TYPE, BACKTRACK, VERTICAL SCROLL UP/DOWN, HORIZONTAL SCROLL LEFT/RIGHT, PINCH ZOOM IN, PINCH ZOOM OUT.
  - observed_results: A list of effects/results caused by the interaction.
  - start_timestamp: The timestamp of when the user interaction starts in the video, in the format `MM:SS`.
  - end_timestamp: The timestamp of when the observed results of the interaction are fully completed and visible in the video, in the format `MM:SS`.
- The transcribed interactions may be missing some interactions and effects/results, and may have innaccuracies in the timestamps. The video is the source of truth.

<product-description>
${product_description}
</product-description>

<transcribed-interactions>
${transcribed_interactions}
</transcribed-interactions>

</input>

<output>
- A JSON list, where each object represents a test case for the functionality, correctness, and goal oriented behaviour of the application.
- Each test case object should contain:
  - title: A <7 word title for the test case.
  - description: A description of the test case that clearly outlines the business or user goal achievement that is under test.
  - preconditions: A list of preconditions for the test case that must be met before the test case can be run. Preconditions are of the type AUTHENTICATION (logged in/out), SCREEN_LOADED (which screen is displayed), AND ENVIRONMENT_STATE (Wifi off, battery low etc). Preconditions should not contain user inputs.
  - test_case_steps: A list of steps that clearly outline the necessary user interactions required to achieve the business or user goal. Each step contains:
    - step_description: A description of the user interaction required to achieve the business or user goal.
    - expected_results: A list of expected results caused by the step. These results should be as atomic as possible. The results can be within the application, or outside the application, such as a user receiving an email, or a user receiving a notification.
  - rationale: A short explanation of the negative impact of this test case failing, from a user or business perspective. And any other relevant reasoning on its formulation.

<example-json-response>  
```
    [
      {
        "title": "Settings screen navigation from Home",
        "description": "Verify that the user can navigate from the Home screen to the Settings screen using the 'Menu' button.",
        "preconditions": ["AUTHENTICATION: LOGGED_IN", "SCREEN: HOME"],
        "test_case_steps": [
          {
            "step_description": "Click the 'Menu' button in the top left corner of the screen.",
            "expected_results": [
              "The navigation menu expands, displaying available sections Profile, Settings, and Payment Methods"
            ]
          },

          {
            "step_description": "Click 'Settings' in the menu",
            "expected_results": [
              "The Settings screen is displayed."
            ]
          }
        ],
        "rationale": "The user cannot navigate to the Settings screen if the Menu button is invisible or unclickable."
      },
    ]
```
</example-json-response>

</output>

<key-instructions>
- Transcribe the entire user flow depicted in the video into a single test case. Do not split the user flow into multiple test cases.
- Ensure that the title is no longer than 7 words and is descriptive of the test case.
- Ensure that the description describes the business or user goal that is under test.
- Ensure that the preconditions are of the type AUTHENTICATION (logged in/out), SCREEN_LOADED (which screen is displayed), AND ENVIRONMENT_STATE (Wifi off, battery low etc). Preconditions should not contain user inputs/interactions.
- Ensure that the test case steps contain the complete and correct sequence of user interactions, from the start to the end of the user flow depicted in the video.
- Ensure that the test steps are logically ordered, and contain the complete sequence of user interactions required to complete the test case. The final step should described as a successful termination step on the achievement of the business or user goal, as depicted in the video.
- Ensure that the expected results are as atomic as possible, and contain in-app and out-of-app effects/results, and should not contain any false information. The expected results should be in the order of their occurence.
- Ensure that the rationale is clear and concise, and should not contain any false information. The rationale should be a short explanation of the negative impact of this test case failing, from a user or business perspective.
- In cases where the input video is not complete, complete the functionality for the achievement of the business or user goal to the best of your ability. Include an explanation in the rationale.
- The transcribed_interactions and product_description are only a guideline, and should not be used as the source of truth. The video is the source of truth. If you find any discrepancies between the video and the transcribed_interactions, use the video as the source of truth and include correct information in the response.
</key-instructions>
"""
