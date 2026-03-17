"""
Prompts for analyzing execution videos and validating graph flows

NOTE: Graph generation is handled programmatically in TCGraphGenerator.generate_tc_graph()
"""

TRANSCRIBE_SCREENS_AND_INTERACTIONS_PROMPT = """
<task>
You are analyzing a video of a user interacting with a mobile application. Your task is to:
1. Identify every unique screen that appears in the video
2. Detect all user interactions (clicks, swipes, typing, etc.)
3. Map the flow between screens based on these interactions
4. Ensure the all screens have interactions leading to different screens (no self-loops).

This will be used to generate a test case graph (tc_graph) representing the execution flow.
</task>

<input>
- A video of a user using a mobile application
</input>

<output>
A JSON object with two main sections:

1. "screens": A list of unique screens that appear in the video. Each screen object contains:
   - id: Unique identifier (e.g., "screen-001")
   - title: Short descriptive title (max 7 words)
   - description: What the user can do on this screen
   - first_appearance_timestamp: When this screen first appears (format: "MM:SS")
   - all_appearances: List of all timestamps when this screen appears

2. "interactions": A list of user interactions in chronological order. Each interaction contains:
   - from_screen_id: ID of the screen where the interaction starts
   - to_screen_id: ID of the screen that appears after the interaction
   - interaction_description: What the user did (e.g., "Tap 'Login' button")
   - timestamp: When the interaction occurred (format: "MM:SS")
   - observed_results: List of effects caused by the interaction

<example-json-response>
```json
{
  "screens": [
    {
      "id": "screen-001",
      "title": "Home Screen",
      "description": "Main landing page with navigation options",
      "first_appearance_timestamp": "00:02",
      "all_appearances": ["00:02", "00:45"]
    },
    {
      "id": "screen-002",
      "title": "Login Screen",
      "description": "User can enter email and password to log in",
      "first_appearance_timestamp": "00:08",
      "all_appearances": ["00:08"]
    }
  ],
  "interactions": [
    {
      "from_screen_id": "screen-001",
      "to_screen_id": "screen-002",
      "interaction_description": "Tap 'Login' button in top right corner",
      "timestamp": "00:05",
      "observed_results": ["Navigation menu closes", "Login screen is displayed"]
    }
  ]
}
```
</example-json-response>
</output>

<key-instructions>
- CRITICAL: Every screen MUST appear in at least one interaction (as from_screen_id OR to_screen_id)
- Do NOT create orphan screens with no interactions - every screen must be connected to the flow
- CRITICAL: Create separate screen entries for each temporal occurrence to maintain linear flow
- Example: Login → Home → Logout → Login → Home should create 5 screens (Login-1, Home-1, Logout, Login-2, Home-2), NOT 3
- CRITICAL: If a screen's state changes significantly (e.g., item favorited, filter applied), treat it as a SEPARATE screen
- Example: "Feed Screen" + tap heart → "Feed Screen with Favorited Item" = TWO different screens
- CRITICAL: NEVER create self-loops (screen-X → screen-X) - always transition to a different screen or different state
- Every interaction must move to a new screen entry, ensuring no circular references
- Skip redundant loading/progress states: "Installing 25%" → "Installing 50%" → "Installing 100%" should be just "Installing"
- Every interaction must be captured chronologically in the exact order they occur
- Interaction descriptions should be clear and actionable
- Observed results should be atomic and in order of occurrence
- Timestamps must be precise (format: MM:SS)
- The video is the source of truth - do not add information not shown in the video
</key-instructions>
"""

VALIDATE_GRAPH_FLOW_PROMPT = """
<task>
You are validating a test case flow graph for completeness and logical consistency.
Your task is to check if the graph has any disconnections or missing interactions that would make the flow incomplete.
</task>

<input>
Screens:
{screens}

Interactions:
{interactions}
</input>

<instructions>
1. Check if every screen (except the first) can be reached from a previous screen through a forward path
2. Check if the flow makes logical sense temporally (timestamps should be in order)
3. Identify any disconnected screens that cannot be reached from the start
4. If you find issues, suggest new interactions to fix them

CRITICAL RULES:
- Only suggest new interactions if there are screens that are COMPLETELY UNREACHABLE from the start
- Do NOT suggest connections just because some screens appear "later" in the list - temporal order matters
- Do NOT try to connect every screen in sequence - some screens may be intentionally skipped or filtered
- If the graph has a valid path from start to end, even if not every screen is visited, it is COMPLETE
- Return empty suggested_interactions array if the main flow is connected
</instructions>

<output>
Return a JSON object with:
{{
  "is_complete": boolean,
  "issues_found": ["list of issues if any"],
  "suggested_interactions": [
    {{
      "from_screen_id": "screen-XXX",
      "to_screen_id": "screen-YYY",
      "interaction_description": "description",
      "timestamp": "MM:SS",
      "observed_results": ["result"],
      "rationale": "why this connection is needed"
    }}
  ]
}}
</output>
"""
