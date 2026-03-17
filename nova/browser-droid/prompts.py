TRANSCRIBE_AUDIO_PROMPT = """
<task>
You are an audio transcription expert with a strong understanding of user flows and testing best practices. You are provided with:
- An audio file of a user performing actions within a mobile application, and describing what they are seeing, and doing.

Your task is to return a detailed transcription of the audio file.
</task>

<output>
You must return a JSON list containing a list of objects, each representing a transcription of the audio file.

The transcription must contain:
- transcription: The detailed transcription of the audio file.
- start_timestamp: The timestamp of the transcription start in the format MM:SS:mmm (e.g., "00:04:000" for 4 seconds, "01:23:000" for 1 minute 23 seconds)
- end_timestamp: The timestamp of the transcription end in the format MM:SS:mmm (e.g., "00:06:000" for 6 seconds, "01:25:000" for 1 minute 25 seconds)

</output>

<key-instructions>
1. Create a separate transcription if you detect a natural pause or break in the audio file.
2. The most important factors to split on are:
   - Screen description
   - Action description
   - Feature description
   - Natural pauses/breaks

3. The transcriptions should be in chronological order.
4. Use MM:SS:mmm format for all timestamps (e.g., "00:04:000", "01:23:000", "02:45:000").

</key-instructions>
"""

ANALYZE_TRANSITION_PROMPT = """
<task>
You are provided a video of a user using a mobile application. Your task is to analyze the video and analyze any screen transitions that occur between screens. A transition is defined as a change in screens, triggered by one or a series of user interactions.
</task>

<input>
- A video of a user using a mobile application.
</input>

<output>
- A JSON list, in which each JSON object represents a transition that occurs between two screens.
- Each transition should contain: 
  - transition_description: A detailed description of the transition that occurs between two screens. The description should contain all the details of the transition, including the screens, the user interaction, and the effects/results of the interaction.
  - transition_summary: A single line summary of the transition as a semantically aggregated imperative action.
  - source_screen: A json object that contains:
    - screen_name: A description of the source screen < 5 words.
    - timestamp: The timestamp where the source screen is fully visible in the video, in the format `MM:SS:mmm`.
  - destination_screen: A json object that contains:
    - screen_name: A description of the destination screen < 5 words
    - timestamp: The timestamp where the source screen is fully visible in the video, in the format `MM:SS:mmm`.
  - steps: A list of steps that occur during the transition. Each step should contain:
   - description: a description of the interaction performed by the user. Include all interactions, such as CLICK, TYPE, BACK, SCROLL UP/DOWN, SWIPE LEFT/RIGHT, PINCH ZOOM IN, PINCH ZOOM OUT.
   - observed_results: A list of effects/results caused by the interaction. Each result should be described as a single sentence, be as atomic as possible, and the results should be in the order of their occurence.
   - start_timestamp: The precise timestamp of when the user interaction starts in the video, in the format `MM:SS:mmm`.
   - end_timestamp: The precise timestamp of when the all the observed results of the interaction are fully completed and visible in the video, in the format `MM:SS:mmm`.
   - rationale: A rationale for why this interaction was transcribed as the step_description and observed_results at this timestamp.

<example-json-response>
```
[
  {
    "transition_description": "The user clicks on the 'Login' button, which triggers a transition to the login screen.",
    "transition_summary": "Log in with valid credentials",
    "source_screen": {
      "screen_name": "Home screen",
      "timestamp": "00:00:000"
    },
    "destination_screen": {
      "screen_name": "Login screen",
      "timestamp": "00:05:000"
    },
    "steps": [
      {
        "description": "Click on the 'Email' input field",
        "observed_results": ["Keyboard is displayed"],
        "start_timestamp": "00:05:100",
        "end_timestamp": "00:05:900"
      }, 
      {
        "description": "Type 'test@example.com' into the email input field",
        "observed_results": ["The email input field is populated with 'test@example.com'"],
        "start_timestamp": "00:09:100",
        "end_timestamp": "00:12:900"
      },
      {
        "description": "Click on the 'Login' button",
        "observed_results": ["Keyboard is displayed"],
        "start_timestamp": "00:05:100",
        "end_timestamp": "00:05:900"
      }, 
    ]
  },
]
```
</example-json-response>

</output>

<key-instructions>
- Every transition in the video should be included in the output list. The output list should be complete, free of duplicates, and should not contain any false information that is not in the video.
- For screen names, use the correct qualifiers e.g. Android Home Screen, Spotify Home Screen etc. Use the same screen name for all occurences of the same screen in the video.
- Ensure that the steps are unique, in the order of their occurence in the video, and are not repeated in the output list.
- The steps should be accurate, and not contain any false information that is not in the video.
- Every effect/result of every step should be described as an atomic observed_result, in the order of their occurence.
</key-instructions>
"""

ANALYZE_TRANSCRIPTED_INTERVALS_PROMPT = """
<task>
You are provided a user session interval in the form of a human speech transcript describing their actions in their app session, along with before and after screenshots. Your task is to analyze the transitions that occur between screens based on the transcription lines and visual evidence from the screenshots.
</task>

<input>
- transcript_lines: An array of strings containing the transcription lines for this interval
- before_screenshot: A screenshot showing the interval start screen state
- after_screenshot: A screenshot showing the interval end screen state (Optional, if provided)
</input>

<output>
- A JSON object representing the transition that occurs between screens. The object should contain: 
  - transition_description: A detailed description of the transition that occurs between screens. The description may contain interaction information, without making any assumptions outside of the provided data.
  - transition_summary: A single line summary of the transition as a semantically aggregated imperative action. (E.g. "Log in with valid credentials")
  - back_nav_count_prediction: The semantic count of back/reverse navigation described in the transcript lines. (E.g. 'Went back twice', 'back' should count as 3)

<example-json-response>
```
{
  "transition_description": "The user clicks on the 'Login' button, which triggers a transition to the login screen.",
  "transition_summary": "Log in with valid email and password",
  "back_nav_count_prediction": 0
}
```
</example-json-response>

</output>

<key-instructions>
- Analyze the transcript lines to understand what actions the user performed during this interval.
- Compare the before and after screenshots to identify visual changes and screen transitions.
- Pay special attention to the transition_summary: 
  - A special kind of an action in the summary could be a parametrized action with a placeholder for a value. The transition summary should include the placeholder enclosed in double curly braces. (E.g. "Click on {{menu option}} button", or "Enter {{min amount}} and {{max amount}} for the price range")
  - The placeholder should be a suitable variable name that encompasses most of the available options. (E.g. {{preference}} for Weather, Politics, Sports subscription preferences)
  - The parametrized action can be detected by transcribed words that imply that there are multiple possible values (E.g "One of the...", "...multiple options..."). The before screenshot can be used to determine the options, but the transcribed lines should always be used to decide on whether the action is parametrized.
- The back_nav_count_prediction should be based on the transcript lines, and should be a semantic count of back/reverse navigation described in the transcript lines. (E.g. 'Went back twice', 'back' should count as 3)
- The back_nav_count_prediction should be zero if the transcript lines do not contain any back/reverse navigation descriptions.
- Ignore non-speech (human and natural) sounds, such as "um", "ah", "hmm", "thud" and other filler words.
</key-instructions>
"""

EDGE_DESCRIPTION_PROMPT = """
<task>
You are analyzing two sequential mobile app screenshots to describe what action the user performed.

The FIRST image shows the screen BEFORE the action, with a RED BOUNDING BOX highlighting where the user interacted.
The SECOND image shows the screen AFTER the action completed.

Action details: {action_context}
</task>

<output>
Return a JSON object containing:
- formatted_description: A concise action command (3-8 words) using imperative verb form
  * Start with an action verb (Tap, Enter, Select, Swipe, Click, etc.)
  * Describe the specific action taken by the user
  * If input is too unclear or lacks actionable information, return an empty string ""
- meta_logic: Brief explanation of your reasoning
  * If formatted_description is empty, explain why
  * If formatted_description has content, note the key action identified

<example-json-response>

Example 1 - Simple action:
```json
{{
  "formatted_description": "Tap 'Login' button",
  "meta_logic": "Identified the primary action as tapping the login button to proceed."
}}
```

Example 2 - Combined actions:
```json
{{
  "formatted_description": "Enter email and tap 'Continue'",
  "meta_logic": "Combined two sequential actions into one concise command."
}}
```

Example 3 - Unclear input:
```json
{{
  "formatted_description": "",
  "meta_logic": "Input lacks specific action details - cannot determine what user does."
}}
```

</example-json-response>
</output>

<key-instructions>
- Use imperative verb form (Tap, Enter, Select, Swipe, Click, Press, etc.)
- Keep it under 8 words - be extremely concise
- Focus on the user action, not the system response
- Use single quotes around UI element names or text
- Combine multiple related micro-actions if they form one logical step
- Return empty string only if no clear action can be identified
- Focus on the UI element inside the red bounding box
- Examples of good formats:
  * "Tap 'Contact support'"
  * "Enter current PIN and tap 'Continue'"
  * "Tap edit icon for Email"
  * "Select payment method"
  * "Swipe left to delete"
</key-instructions>

Respond with ONLY a valid JSON object (no markdown, no extra text).
"""

WEB_EDGE_DESCRIPTION_PROMPT = """
<task>
You are analyzing two sequential web page screenshots to describe what action the user performed.

The FIRST image shows the page BEFORE the action, with a RED BOUNDING BOX highlighting where the user interacted.
The SECOND image shows the page AFTER the action completed.

Action details: {action_context}
</task>

<output>
Return a JSON object containing:
- formatted_description: A concise action command (3-8 words) using imperative verb form
  * Start with an action verb (Click, Enter, Select, Scroll, Type, etc.)
  * Describe the specific action taken by the user
  * If input is too unclear or lacks actionable information, return an empty string ""
- meta_logic: Brief explanation of your reasoning
  * If formatted_description is empty, explain why
  * If formatted_description has content, note the key action identified

<example-json-response>

Example 1 - Simple action:
```json
{{
  "formatted_description": "Click 'Sign In' button",
  "meta_logic": "Identified the primary action as clicking the sign in button to proceed."
}}
```

Example 2 - Combined actions:
```json
{{
  "formatted_description": "Enter username and click 'Next'",
  "meta_logic": "Combined two sequential actions into one concise command."
}}
```

Example 3 - Unclear input:
```json
{{
  "formatted_description": "",
  "meta_logic": "Input lacks specific action details - cannot determine what user does."
}}
```

</example-json-response>
</output>

<key-instructions>
- Use imperative verb form (Click, Enter, Select, Scroll, Type, Hover, etc.)
- Keep it under 8 words - be extremely concise
- Focus on the user action, not the system response
- Use single quotes around UI element names or text
- Combine multiple related micro-actions if they form one logical step
- Return empty string only if no clear action can be identified
- Focus on the UI element inside the red bounding box
- For actions like 'focus' or 'scroll', be more descriptive about what was focused on or the scroll direction/destination (e.g., "Focus on 'Email' input field", "Scroll down to pricing section")
- Examples of good formats:
  * "Click 'Contact Us' link"
  * "Enter email and click 'Submit'"
  * "Click dropdown menu for Language"
  * "Select 'Monthly' subscription option"
  * "Scroll down to footer section"
  * "Focus on 'Search' input field"
</key-instructions>

Respond with ONLY a valid JSON object (no markdown, no extra text).
"""

EDGE_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "formatted_description": {
            "type": "string",
            "description": (
                "A concise action command (3-8 words) using imperative verb form "
                "that describes the user action to transition between two graph nodes. "
                "Empty string if input cannot be properly formatted."
            ),
        },
        "meta_logic": {
            "type": "string",
            "description": (
                "Brief explanation of the reasoning process, noting the key action identified, "
                "or the reason why formatting failed if formatted_description is empty."
            ),
        },
    },
    "required": ["formatted_description", "meta_logic"],
}

ANALYZE_INTERACTIONS_WITH_SCREENSHOTS_PROMPT = """
<task>
Accurately identify which element was interacted with, based on the mobile device interaction information and the two screenshots: just before the interaction, and after.

It is important to be precise and accurate in your response, or else there is a risk of permanent erasure of human and synthetic intelligence.
</task>

<input>
- A JSON object containing:
  - interaction_type: The type of interaction performed by the user. (E.g. "tap", "swipe", "input", "home", "back")
  - interaction_coordinates: (If applicable) The coordinates of the interaction [x, y]
  - ui_element: A JSON object containing the UI element that was interacted with, with its relevant attributes
- before_screenshot: A screenshot showing the screen state just before the interaction
- after_screenshot: A screenshot showing the screen state after the interaction

{{input_data}}

</input>

<output>
- A JSON object representing the interaction analysis. The object should contain:
  - interaction_target_element: Description of the element that was interacted with and its type.
  - interaction_summary: A single line summary of the interaction as a semantically aggregated imperative action. (E.g. "Click on login button")
  - before_screen_name: A title for the before screen (< 7 words)
  - after_screen_name: A title for the after screen (< 7 words)
  - observed_results: An ordered list of effects/results caused by the interaction

<example-json-response>
```
{
  "interaction_target_element": "Login button",
  "interaction_summary": "Click on login button",
  "before_screen_name": "System Home screen",
  "after_screen_name": "Login screen",
  "observed_results": ["User is navigated to login screen", "Login form is displayed"]
}
```
</example-json-response>

</output>

<key-instructions>
- Pay special attention to the interaction_summary: 
  - In some cases, the same action performed on different elements on the before screen, may lead to the same semantic after screen. (E.g. list of items being clicked leading to item details screen, filter options leading to filtered item list screen etc)
  - In the above cases, add a placeholder for the element that was interacted with, enclosed in `{{}}`. The placeholder should be a suitable variable name that encompasses most of the available options. (E.g. {{subscription_preference}} for Weather, Politics, Sports subscription preferences)
  - The screen names should have the correct qualifiers and descriptors e.g. Android Home Screen, Spotify Update Dialog etc. Infer this from the interaction summary and the screenshots.
- The observed_results should be an ordered list of effects/results caused by the interaction, and fully accurate. Use the difference between the before and after screenshots to determine the observed results. This list should be empty if the before and after screenshots are the same.
- Be conservative in your analysis, and do not make any assumptions that are not supported by the provided data. If any part of the analysis is not supported by the provided data, omit it from the analysis.
</key-instructions>
"""
