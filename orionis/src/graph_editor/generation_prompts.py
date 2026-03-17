GENERATE_NODE_TITLE_PROMPT = """
<task>
You are a specialist in UI/UX analysis and content generation.
Your task is to analyze the provided image and generate a concise title and brief description for a graph node.

The image represents a screen, interface, or visual element from a mobile application that will be used as a node in a graph visualization.
You need to create content that helps users quickly understand what this node represents.
</task>

<input>
- An image of a mobile application screen, interface, or visual element
- The image may contain UI components, text, buttons, forms, or other interface elements

</input>

<output>
- A JSON object containing:
  - title: A concise, descriptive title (2-5 words maximum) that clearly identifies the main purpose or content of the screen
  - description: A brief description (1-2 sentences maximum) explaining what the user sees in the image

<example-json-response>
```
{
  "title": "Login Screen",
  "description": "A mobile app login interface with username and password input fields, along with a sign-in button."
}
```

</example-json-response>

</output>

<key-instructions>
- Focus on the main visual elements and primary purpose of the screen
- The title should be suitable for a graph node label - concise but descriptive
- The description should help users understand the context and functionality
- Consider the most prominent UI components, text labels, or visual cues
- If the screen contains forms, focus on the main action or purpose
- If the screen shows navigation elements, describe the primary destination or section
- Keep titles short and memorable for graph visualization
- Descriptions should be informative but not overly detailed
- Avoid technical jargon unless it's essential for understanding
- If multiple elements are present, prioritize the most important or central one
</key-instructions>

<guidelines>
- For login/authentication screens: Focus on the authentication method or user type
- For navigation screens: Emphasize the destination or section name
- For form screens: Highlight the main action or data being collected
- For content screens: Describe the primary content type or category
- For settings screens: Mention the main configuration area
- For dashboard screens: Focus on the primary metrics or overview type
- For error screens: Mention the error type or context
- For loading screens: Describe what is being loaded or processed
</guidelines>
"""


TITLE_GENERATION_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {
            "type": "string",
            "description": "A concise title for the image (2-5 words)",
        },
        "description": {
            "type": "string",
            "description": "A brief description of the image (1-2 sentences)",
        },
    },
    "required": ["title", "description"],
}

FORMAT_BUSINESS_LOGIC_PROMPT = """
<task>
You are a specialist in business logic text rephrasing and formatting.
Your task is to take the provided business logic text and rephrase it into a clear, concise, and well-formatted description.

The business logic text may be unstructured, informal, or poorly written. You need to transform it into professional,
readable content that clearly communicates the intended logic or process.
</task>

<input>
- Raw business logic text that needs to be rephrased and formatted
- The text may be unstructured, informal, or poorly formatted
- May contain technical jargon, incomplete sentences, or unclear language

</input>

<output>
- A JSON object containing:
  - formatted_business_logic: A clear, concise, and well-formatted version of the business logic (maximum 2-3 sentences)
    * If the input text is too unclear, incomplete, or cannot be properly formatted, return an empty string ""
  - meta_logic: An explanation of your reasoning process and the changes you made
    * If formatted_business_logic is empty, explain why the text could not be formatted properly
    * If formatted_business_logic has content, explain what improvements you made (e.g., grammar fixes, clarity improvements, restructuring)
  - Use proper grammar, clear language, and logical flow
  - Make it professional and easy to understand
  - Keep it concise but complete

<example-json-response>
```
{
  "formatted_business_logic": "User authenticates with valid credentials and is redirected to the dashboard.
  Session is established and navigation is activated.",
  "meta_logic": "Restructured the informal text into two clear sentences. Fixed grammar and converted passive voice to active.
  Added clarity about session establishment and navigation activation sequence."
}
```

Example with unclear input:
```
{
  "formatted_business_logic": "",
  "meta_logic": "The input text is too vague and lacks specific actions or outcomes.
  Unable to determine the intended business logic without more context about what happens or what the user does."
}
```

</example-json-response>

</output>

<key-instructions>
- Rephrase the text to be clear and professional
- Fix grammar, spelling, and sentence structure
- Use proper punctuation and capitalization
- Keep the original meaning and intent
- Make it concise but complete
- Use simple, clear language
- Ensure logical flow and readability
- Remove unnecessary words or redundancy
- Convert informal language to professional tone
- Always provide meta_logic explaining your reasoning or why formatting failed
- Return empty formatted_business_logic only if the input is genuinely unclear, incomplete, or incomprehensible
</key-instructions>
"""

FORMAT_BUSINESS_LOGIC_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "formatted_business_logic": {
            "type": "string",
            "description": (
                "A short, concise description of the edge relationship between two graph nodes "
                "(maximum 2-3 sentences). Empty string if input cannot be properly formatted."
            ),
        },
        "meta_logic": {
            "type": "string",
            "description": (
                "Explanation of the reasoning process and changes made during formatting, "
                "or the reason why formatting failed if formatted_business_logic is empty."
            ),
        },
    },
    "required": ["formatted_business_logic", "meta_logic"],
}


FORMAT_EDGE_DESCRIPTION_PROMPT = """
<task>
You are a specialist in converting edge descriptions into concise action commands.
Your task is to transform the provided edge description text into a short,
imperative action command that describes what the user does to transition between two nodes.
</task>

<input>
- Raw edge description text that may be unstructured, informal, or verbose
- Text describing a transition, navigation, or action between two nodes in a graph
</input>

<output>
- A JSON object containing:
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
{
  "formatted_description": "Tap 'Login' button",
  "meta_logic": "Identified the primary action as tapping the login button to proceed."
}
```

Example 2 - Combined actions:
```json
{
  "formatted_description": "Enter email and tap 'Continue'",
  "meta_logic": "Combined two sequential actions into one concise command."
}
```

Example 3 - Unclear input:
```json
{
  "formatted_description": "",
  "meta_logic": "Input lacks specific action details - cannot determine what user does."
}
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
- Examples of good formats:
  * "Tap 'Contact support'"
  * "Enter current PIN and tap 'Continue'"
  * "Tap edit icon for Email"
  * "Select payment method"
  * "Swipe left to delete"
</key-instructions>
"""

FORMAT_EDGE_DESCRIPTION_RESPONSE_SCHEMA = {
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
