INTERACTION_DETECTION_PROMPT = """
<task>
You are analyzing a SHORT video segment showing a screen transition in a mobile or web application.

The video shows the transition from {from_screen_title} (ID: {from_screen_id}) to {to_screen_title} (ID: {to_screen_id}).

Your task is to identify the EXACT user interaction that caused this screen transition.
</task>

<screen-context>
FROM SCREEN ({from_screen_id}):
- Title: {from_screen_title}
- Description: {from_screen_description}
- Timestamp: {from_screen_timestamp}

TO SCREEN ({to_screen_id}):
- Title: {to_screen_title}
- Description: {to_screen_description}
- Timestamp: {to_screen_timestamp}
</screen-context>

<input>
A short video segment showing the transition between these two screens.
The video starts at {from_screen_timestamp} and ends at {to_screen_timestamp}.
</input>

<output>
A JSON object containing a single "interaction" object with the following fields:

1. "from_screen_id": Must be exactly "{from_screen_id}"

2. "to_screen_id": Must be exactly "{to_screen_id}"

3. "interaction_description": Precise description of what the user did
   - Be SPECIFIC about which element was interacted with
   - Include element labels, button text, or identifiable features
   - Use action verbs: "Tap", "Swipe", "Type", "Select", "Scroll"
   - Examples:
     * "Tap 'Login' button in top right corner"
     * "Swipe left on the image carousel"
     * "Type 'Berlin' in the destination field"
     * "Scroll down to the bottom of the page"

4. "timestamp": When the interaction occurred (format: "HH:MM:SS:FF")
   - HH = hours (00-99)
   - MM = minutes (00-59)
   - SS = seconds (00-59)
   - FF = frame number within that second (00 to FPS-1, typically 00-29 for 30fps)
   - Use the moment the user ACTION began (e.g., when finger touches screen)
   - Must be between {from_screen_timestamp} and {to_screen_timestamp}
   - Example: "00:00:41:15" means 41 seconds and 15 frames

5. "observed_results": Array of effects caused by the interaction
   - List ALL observable changes in order
   - Be specific and atomic (one effect per item)
   - Include UI changes, navigation, data loading, etc.
   - Examples:
     * ["Navigation menu slides in from left"]
     * ["Login form appears", "Keyboard opens at bottom"]
     * ["Loading spinner shown", "Search results displayed"]

Example JSON Response:
```json
{{
  "interaction": {{
    "from_screen_id": "{from_screen_id}",
    "to_screen_id": "{to_screen_id}",
    "interaction_description": "Tap 'Search' button in the center of the screen",
    "timestamp": "00:00:12:00",
    "observed_results": [
      "Search button animates with ripple effect",
      "Screen transitions to results page",
      "Loading indicator appears briefly"
    ]
  }}
}}
```
</output>

<critical-rules>
1. ACCURACY:
   - Describe ONLY what you SEE in the video segment
   - Do not infer or assume interactions not visible
   - If multiple interactions occur, describe the PRIMARY one that caused the transition

2. SPECIFICITY:
   - Always include element identifiers (button text, icon type, field labels)
   - Specify location when helpful (e.g., "top right", "bottom navigation bar")
   - Use precise action verbs

3. TEMPORAL CORRECTNESS:
   - from_screen_id and to_screen_id must NEVER be the same (no self-loops)
   - Timestamp must be within the segment time range
   - Timestamp should be the moment of user action, not the result

4. OBSERVED RESULTS:
   - List effects in chronological order
   - Each item should be atomic (one effect)
   - Include immediate visual feedback (animations, transitions)
   - Include resulting screen changes

5. NO ASSUMPTIONS:
   - Only describe visible interactions
   - If interaction is ambiguous, describe what is most likely based on visible evidence
   - Do not describe backend processes (e.g., "API call made") unless visible in UI
</critical-rules>

<interaction-types>
Common interaction patterns to watch for:

1. TAP/TOUCH:
   - Tap on buttons, icons, links, cards
   - Example: "Tap 'Submit' button", "Tap profile icon"

2. SWIPE/GESTURE:
   - Swipe up/down/left/right
   - Pinch to zoom
   - Example: "Swipe left on carousel", "Swipe up to dismiss"

3. TEXT INPUT:
   - Type in text fields
   - Example: "Type 'username' in email field"

4. SCROLL:
   - Scroll up/down/left/right
   - Example: "Scroll down to load more items"

5. SELECT/CHOOSE:
   - Select from dropdown, radio buttons, checkboxes
   - Example: "Select 'Economy' from class options"

6. SYSTEM ACTIONS:
   - Back button press
   - Home button press
   - App switch
   - Example: "Press Android back button"
</interaction-types>

<validation-checklist>
Before submitting, verify:
✓ from_screen_id is exactly "{from_screen_id}"
✓ to_screen_id is exactly "{to_screen_id}"
✓ from_screen_id ≠ to_screen_id (no self-loops)
✓ interaction_description is specific and actionable
✓ timestamp is in HH:MM:SS:FF format (e.g., "00:00:41:15")
✓ timestamp is between {from_screen_timestamp} and {to_screen_timestamp}
✓ observed_results is a non-empty array of strings
✓ All observed results are specific and in chronological order
</validation-checklist>

Now analyze the video segment and identify the interaction that caused this screen transition.
"""
