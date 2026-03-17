SCREEN_DETECTION_PROMPT = """
<task>
You are analyzing a video of a user interacting with a mobile or web application.
Your task is to identify EVERY unique screen appearance in the video in STRICT TEMPORAL ORDER.

CRITICAL: Each screen appearance is UNIQUE, even if the same UI appears multiple times.
For example, if the user opens an app, closes it, then reopens it, you must create
SEPARATE screen entries for each appearance:
- screen-001: App opened (first time)
- screen-002: App closed screen
- screen-003: App opened (second time)

This ensures the graph maintains a STRICTLY LINEAR temporal flow with NO back-transitions.
</task>

<input>
A video recording of a user interacting with a mobile or web application.
</input>

<output>
1. A JSON object containing:
   - "video_fps": The FPS (frames per second) you are using to analyze this video (typically 30 or the video's native FPS)
   - "screens": Array of screen objects

Each screen object must contain:

   a. "id": Unique identifier in format "screen-XXX" (e.g., "screen-001", "screen-002")
      - Use sequential numbering in temporal order
      - Never reuse IDs, even for visually similar screens

   b. "title": Short descriptive title (MAXIMUM 7 words)
      - Must be concise and descriptive
      - Examples: "Home Screen", "Login Page", "Settings Menu"

   c. "description": What the user can do on this screen
      - Describe functionality and visible UI elements
      - Be specific about buttons, forms, content visible

   d. "appearance_timestamp": PRECISE timestamp with frame number (format: "HH:MM:SS:FF")
      - HH = hours (00-99)
      - MM = minutes (00-59)
      - SS = seconds (00-59)
      - FF = frame number within that second (00 to FPS-1)
      - Example at 30 FPS: "00:01:23:15" means 1 minute, 23 seconds, frame 15 (which is 1:23.5 seconds)
      - Use the EXACT frame when the screen becomes fully visible and stable
      - This precision ensures we capture the exact frame you are seeing

2. A field "flow_description" of type string which tells clearly the business or user goal achievement that is being performed.
   Prioritize information from interactions happening in the video. Along with that, also include the overall user goal summary.

Example JSON Response:
```json
{
  "video_fps": 30,
  "screens": [
    {
      "id": "screen-001",
      "title": "Android Home Screen",
      "description": "Device home screen with app icons and navigation",
      "appearance_timestamp": "00:00:00:00"
    },
    {
      "id": "screen-002",
      "title": "FlixBus App Launch",
      "description": "FlixBus app opening with splash screen",
      "appearance_timestamp": "00:00:03:15"
    },
    {
      "id": "screen-003",
      "title": "FlixBus Search Screen",
      "description": "Search interface for bus routes with from/to inputs",
      "appearance_timestamp": "00:00:07:22"
    }
  ],
  "flow_description": "Verify that the user can navigate from the Home Screen to the Settings screen using the 'Menu' button."
}
```
</output>

<critical-rules>
1. TEMPORAL UNIQUENESS:
   - Each screen appearance is a UNIQUE entry, even if the UI looks identical to a previous screen
   - NEVER create back-references or cycles
   - If user goes back to a previous screen, create a NEW screen entry with a new ID
   - Example: Home → Settings → Home should be 3 screens, NOT 2

2. STRICTLY SEQUENTIAL:
   - List screens in the EXACT order they appear in the video
   - IDs must be sequential: screen-001, screen-002, screen-003, etc.
   - Never skip numbers or reorder

3. EVERY SCREEN COUNTS:
   - Include ALL visible screens, including:
     * Splash screens
     * Loading screens (if they show distinct content)
     * Dialog boxes and popups
     * Error messages
     * Confirmation screens
   - EXCEPTION: Skip rapid loading states that are identical (e.g., "Loading 25%, 50%, 75%")

4. NO DUPLICATES:
   - Each screen ID must be unique
   - Same UI appearing twice = two different screen IDs

5. PRECISE TIMESTAMPS WITH FRAME NUMBERS:
   - Use the EXACT frame when the screen becomes fully visible and STABLE
   - Format: HH:MM:SS:FF (e.g., "00:00:05:15" for 5 seconds and 15 frames)
   - FF is the frame number within that second (0 to FPS-1)
   - Timestamps must be in ascending order
   - This precision is CRITICAL - we will extract this exact frame for the screenshot
   - Choose a frame where the screen is fully rendered, not during a transition or animation

6. TITLE CONSTRAINTS:
   - Maximum 7 words
   - Clear and descriptive
   - Avoid vague terms like "Screen 1" or "Page"

7. COMPREHENSIVE DESCRIPTIONS:
   - Describe what is visible and what actions are possible
   - Include key UI elements (buttons, forms, text)
   - Be specific but concise

8. VIDEO FPS:
   - Always include the "video_fps" field in your response
   - Use the video's native FPS or 30 if uncertain
   - This is used to correctly interpret frame numbers in timestamps
</critical-rules>

<examples-of-temporal-uniqueness>
Example 1: App reopen scenario
Video sequence: Home → Open App → App Screen → Close App → Home → Open App → App Screen
Correct output: 7 screens (screen-001 through screen-007)
WRONG: 4 screens with back-transitions ❌

Example 2: Navigation back scenario
Video sequence: Main Menu → Settings → Profile → Back to Settings → Back to Main Menu
Correct output: 5 screens (screen-001 through screen-005)
WRONG: 3 screens with cycles ❌

Example 3: Form re-entry scenario
Video sequence: Form Screen → Fill field → Submit → Error Screen → Form Screen (again)
Correct output: 5 screens (the Form Screen appears twice with different IDs)
WRONG: 4 screens with the form appearing once ❌
</examples-of-temporal-uniqueness>

<validation-checklist>
Before submitting your response, verify:
✓ video_fps field is included
✓ All screens are listed in strict temporal order
✓ Each screen has a unique sequential ID (no gaps, no duplicates)
✓ All titles are 7 words or less
✓ All timestamps are in HH:MM:SS:FF format (with frame number)
✓ All timestamps are in ascending order
✓ Frame numbers (FF) are valid (0 to FPS-1)
✓ No screen ID is reused (even for identical-looking UIs)
✓ All visible screens are captured (no gaps in the flow)
✓ Each timestamp points to a STABLE frame (not during transition/animation)
</validation-checklist>

Now analyze the video and identify ALL screens in strict temporal order along with the flow description.
"""
