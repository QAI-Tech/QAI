"""
Prompts for Flow Recommendation Service LLM calls
"""

SCREEN_DESCRIPTION_MATCHING_PROMPT = """You are analyzing mobile app screens to identify which screens from different user flows might be the SAME screen.

I have two user flows from a mobile app. Each flow is a sequence of screens the user navigates through.

## Flow A - Screen Descriptions:
{flow_a_descriptions}

## Flow B - Screen Descriptions:
{flow_b_descriptions}

## Task:
Analyze the screen descriptions and identify which screens from Flow A might be the SAME screen as screens in Flow B.

IMPORTANT - Be AGGRESSIVE in finding matches. Consider screens as potential matches if they:
1. Have similar names even with different wording (e.g., "Intro Animation" and "Animated Splash Screen" are the SAME)
2. Describe the same type of screen (e.g., "Sign-In Options" and "Sign-In/Sign-Up Options" are the SAME)
3. Have similar functionality or purpose (e.g., "Loading" screens, "Home" screens, "Login" screens)
4. Represent the same step in user journey (e.g., splash screens, onboarding screens, authentication screens)
5. Use synonyms or paraphrasing (e.g., "Account Setup Loading" and "Setup Loading" are the SAME)
6. Are entry points to the same app (e.g., "Play Store Listing" and "Play Store App Page" are the SAME - both show the app in Play Store)
7. Are consecutive screens of the same type that should collapse (e.g., "Splash Screen" followed by "Loading Screen" in one flow should match a single "Splash Screen" in another flow - LLM video analysis may capture 1 or 2 frames of splash/loading sequences)

SPECIAL CASE - Splash/Loading sequences:
- Apps often have splash -> loading -> content sequences
- LLM video analysis may capture this as 1, 2, or more screens depending on timing
- "Splash Screen" + "Loading Screen" in Flow A should match "App Splash" in Flow B
- When you see consecutive splash/loading/intro screens, treat them as ONE logical entry sequence

Examples of screens that SHOULD match:
- "App Intro Animation" <-> "Animated Splash Screen" (both are splash/intro screens)
- "Sign-In Options" <-> "Sign-In/Sign-Up Options" (both are login choice screens)
- "Home Dashboard" <-> "Main Screen" (both are home screens)
- "Account Setup Loading" <-> "Setup Loading Screen" (both are loading states)
- "Play Store Listing" <-> "Google Play Store App Page" (both are app store entry points)
- "Splash Screen" + "Loading Screen" <-> "App Splash" (splash/loading sequence = single splash)

When in doubt, INCLUDE the match - we will verify with images later.

## Response Format:
Return a JSON object with:
- "potential_matches": Array of objects, each with "flow_a_node_id" and "flow_b_node_id" for screens that appear to be the same
- "reasoning": Brief explanation of your matching logic

If no screens appear to match, return an empty array for potential_matches.
"""

IMAGE_VERIFICATION_PROMPT = """You are verifying whether two mobile app screenshots show the SAME screen from the SAME app.

I will show you two screenshots. Analyze them carefully.

## Task:
Determine:
1. Are these screenshots showing the SAME screen (same UI layout, same purpose)?
2. Are these screenshots from the SAME mobile app?

Consider:
- Overall layout and structure
- UI elements present (buttons, text fields, navigation)
- Color scheme and design language
- Text content and labels
- Brand elements or logos

## Response Format:
Return a JSON object with:
- "is_same_screen": boolean - true if these appear to be the same screen
- "is_same_app": boolean - true if these appear to be from the same app
- "confidence": float between 0.0 and 1.0
- "reasoning": Brief explanation of your decision
"""

EDGE_COMPARISON_PROMPT = """You are comparing user actions (edges) that lead to the same screen in a mobile app.

## Context:
Two different user flows both reach a common screen. I need to determine if the ACTIONS taken to reach that screen are the same or different.

## Edge from Flow A:
- Source Screen: {flow_a_source_description}
- Action Description: {flow_a_edge_description}
- Target Screen: {common_screen_description}

## Edge from Flow B:
- Source Screen: {flow_b_source_description}
- Action Description: {flow_b_edge_description}
- Target Screen: {common_screen_description}

## Task:
Determine if these two edges describe the SAME user action or DIFFERENT user actions.

Same action examples:
- "Tap Login button" vs "Click on Login" (same action, different wording)
- "Press Submit" vs "Tap Submit button" (same action)

Different action examples:
- "Tap Login button" vs "Swipe left" (different actions to reach same screen)
- "Enter email and tap Next" vs "Tap Skip" (different paths to same screen)

## Response Format:
Return a JSON object with:
- "are_same_action": boolean - true if these describe the same user action
- "reasoning": Brief explanation of your decision
"""

FLOW_DEPTH_CLASSIFICATION_PROMPT = """You are analyzing mobile app user flows to determine their DEPTH in the app's navigation hierarchy.

## Context:
I have multiple user flows from a mobile app that don't share any common screens. I need to understand which flows are "shallow" (close to app entry points like splash, login, home) and which are "deep" (further into the app like settings, checkout, detailed views).

## Flows to Analyze:

{flows_context}

## Task:
For each flow, classify it as:
- "SHALLOW": Flow starts near app entry (splash, login, home, main menu)
- "DEEP": Flow is deeper in app hierarchy (settings, checkout, profiles, detailed views)

Also suggest a position hint for graph layout:
- "left": Shallower flows (closer to app start)
- "center": Medium depth
- "right": Deeper flows

## Response Format:
Return a JSON object with:
- "classifications": Array of objects, each with:
  - "flow_id": The flow's ID
  - "depth": "SHALLOW" or "DEEP"
  - "position_hint": "left", "center", or "right"
  - "reasoning": Brief explanation

Order the classifications from shallowest to deepest.
"""

MULTI_FLOW_SCREEN_MATCHING_PROMPT = """You are analyzing mobile app screens from multiple user flows to identify COMMON screens.

I have {num_flows} user flows from a mobile app. I need to find which screens across ALL flows might be the SAME screen.

## Flows:

{flows_descriptions}

## Task:
Analyze all screen descriptions and identify groups of screens that appear to be the SAME screen across different flows.

IMPORTANT - Be AGGRESSIVE in finding matches. Consider screens as potential matches if they:
1. Have similar names even with different wording (e.g., "Intro Animation" and "Animated Splash Screen" are the SAME)
2. Describe the same type of screen (e.g., "Sign-In Options" and "Sign-In/Sign-Up Options" are the SAME)
3. Have similar functionality or purpose (e.g., "Loading" screens, "Home" screens, "Login" screens)
4. Represent the same step in user journey (e.g., splash screens, onboarding screens, authentication screens)
5. Use synonyms or paraphrasing (e.g., "Account Setup Loading" and "Setup Loading" are the SAME)
6. Are entry points to the same app (e.g., "Play Store Listing" and "Play Store App Page" are the SAME - both show the app in Play Store)
7. Are consecutive screens of the same type that should collapse (e.g., "Splash Screen" followed by "Loading Screen" in one flow should match a single "Splash Screen" in another flow - LLM video analysis may capture 1 or 2 frames of splash/loading sequences)

SPECIAL CASE - Splash/Loading sequences:
- Apps often have splash -> loading -> content sequences
- LLM video analysis may capture this as 1, 2, or more screens depending on timing
- "Splash Screen" + "Loading Screen" in Flow A should match "App Splash" in Flow B
- When you see consecutive splash/loading/intro screens, treat them as ONE logical entry sequence

Examples of screens that SHOULD match:
- "App Intro Animation" <-> "Animated Splash Screen" (both are splash/intro screens)
- "Sign-In Options" <-> "Sign-In/Sign-Up Options" (both are login choice screens)
- "Home Dashboard" <-> "Main Screen" (both are home screens)
- "Account Setup Loading" <-> "Setup Loading Screen" (both are loading states)
- "Play Store Listing" <-> "Google Play Store App Page" (both are app store entry points)
- "Splash Screen" + "Loading Screen" <-> "App Splash" (splash/loading sequence = single splash)

When in doubt, INCLUDE the match - we will verify with images later.

## Response Format:
Return a JSON object with:
- "screen_groups": Array of groups, where each group is an array of {{"flow_id": "...", "node_id": "..."}} objects representing the same screen
- "reasoning": Brief explanation of your grouping logic

Example:
{{
  "screen_groups": [
    [
      {{"flow_id": "flow-1", "node_id": "node-001"}},
      {{"flow_id": "flow-2", "node_id": "node-005"}},
      {{"flow_id": "flow-3", "node_id": "node-002"}}
    ],
    [
      {{"flow_id": "flow-1", "node_id": "node-003"}},
      {{"flow_id": "flow-2", "node_id": "node-007"}}
    ]
  ],
  "reasoning": "..."
}}

If no common screens are found, return an empty array for screen_groups.
"""
