CREATE_NEG_TEST_CASES_FROM_FLOW_PROMPT = """
<task>
You are a software Quality Assurance expert with a strong understanding of user flows, testing best practices, and input validation principles. You are provided with:
- An ordered list of screenshots representing a user performing actions within a mobile application
- Ordered list of Actions with business logic describing what each interaction does and the underlying business rules
- A corresponding happy test case based on those screenshots

Your task is to generate **negative test cases** corresponding to each step of the happy test case. Consider both UI-level validations (missing required fields) AND business logic violations.
</task>

<definition>
A **negative test case** is designed to verify how an application behaves when the user deviates from expected behavior. This includes:
1. **Input Validation**: Omitting or incorrectly filling required fields (must-input-fields)
2. **Business Logic Violations**: Violating business rules described in the action's business_logic field

These test cases ensure the application properly handles invalid inputs and business rule violations by blocking progression, displaying error messages, or maintaining stability. The goal is **not** to explore alternate paths or edge cases, but to test how the application handles invalid inputs and business rule violations.
</definition>

<output>
You must return a JSON object representing **step-level negative test cases**. For each step in the happy path, generate a list of negative test cases that isolate and validate:
1. Incorrect or missing input for must-input-fields
2. Business logic rule violations (if business_logic is provided for that action)

If no must-input-fields or business logic violations exist for a step, return an empty list.

Each negative test case must contain:
- **title**: A concise title (max 7 words)
- **description**: A brief explanation of the test case's goal and context. If testing a business logic violation, mention the specific rule being violated.
- **preconditions**: In the format — *User is on <screen name>* (based on the first screenshot)
- **test_case_steps**: A list of user interactions simulating the negative path. Copy steps from the happy test case where appropriate, but modify the relevant step to reflect invalid input or business rule violation. Always include a final step summarizing the outcome.
  - **step_description**: What the user does in the step
  - **expected_results**: Only include **one** high-level expected result such as:
    - *The application should block the action or show an error.*
    - *The user should not be able to continue.*
    - *The business rule validation should fail with appropriate error message.*
- **screen_index**: considering 0-indexing, the negative test case generated corresponds to which screen.
- **rationale**: Why this negative test case is important from a user or business point of view. If testing business logic, explain the impact of the violated rule.

</output>

<key-instructions>
1. **Generate negative test cases for TWO scenarios:**
   a. **Must-input-fields** (UI validation):
      - Email field, Password field, Username field
      - Privacy policy consent checkbox
      - Any mandatory form input

   b. **Business Logic Violations** (when business_logic is provided):
      - Authentication requirements (e.g., "user must be authenticated")
      - Authorization rules (e.g., "user must have admin privileges")
      - Data validation rules (e.g., "discount code must be valid and not expired")
      - State requirements (e.g., "cart must not be empty")
      - Workflow rules (e.g., "payment must be completed before order confirmation")

2. If a step has business_logic defined, prioritize generating negative tests for business rule violations in addition to UI validation.

3. If a step **does not involve must-input-fields AND has no business_logic**, return an empty list for that step.

4. The negative step must be **practical and executable** — for example, submitting a form without filling a required field, or attempting an action without proper authentication.

5. Do **not** generate any of the following:
   - Alternate navigation branches (e.g., clicking a different button)
   - Internet, Bluetooth, or system-level issues
   - Backend/frontend failures
   - App/system crashes
   - System permission prompts
   - Skipping dropdown selections (they are still part of valid positive flows)
   - search-bar is not must-input-field. Hence No test case should involve search bar scenarios

6. Keep the flow intact. Only modify the step under test to simulate missing/incorrect required input or business rule violation. Do not fabricate steps that aren't in the happy test case.

7. For each negative test case, ensure that the step sequence mirrors the happy case, with the negative deviation introduced at the specific step under test.

8. Always include a final step summarizing what did or didn't happen as a result of the user flow.

</key-instructions>

<input>
- Ordered list of screenshots showing the user flow
- Ordered list of Actions performed by the user. Each action is a JSON object containing:
  - edge_id: The unique identifier for this action
  - description: What the user did (e.g., "Tap Login button")
  - business_logic: (Optional) The underlying business rules or system behavior for this action. Use this to generate business logic violation scenarios.
- Happy test case based on the screenshots, with:
  - title
  - description
  - preconditions
  - test_case_steps (each with step_description and expected_results)
  - rationale

<user_actions>
<ACTIONS>
</user_actions>

<generated_test_case>
    <HAPPY_TEST_CASE>
</generated_test_case>
</input>
"""


CREATE_RAW_TEST_CASE_FROM_FLOW_PROMPT = """
<task>
You are a software Quality Assurance expert, with a deep understanding of testing and safety principles. You are given a list of ordered screenshots of user using an application. You will also be provided with description of each screenshot. The provided screenshots are result of a human interactions with the application. Hence you will also be provided the parameterized actions that human performed to transition to different screens(or screenshots). Each action contains a description and optional business logic. If there are n number of screenshots then there will be n descriptions and (n-1) actions. Your task is to create a user's perspective test case from the given set of interactions.

When generating test cases, prioritize the action descriptions and business logic over the screenshots and their descriptions. These fields provide the most important context about what the interaction does and what should be validated. If there is any conflict between what you see in screenshots versus what the actions describe, trust the action descriptions and business logic.

Parameterized actions are enclosed between double curly braces. Parameterization is done to generalize the test cases. You have the preserve all the parameters while generating the test case. Each Parameter must be present in atleast one of the following - Description, Precondition, step, or expected_results.

It is very important that this task is completed correctly, or else there may be terrible consequences for everyone, including permanent discontinuation of existence for humans, other life forms, and machines too.
</task>

<input>
- An ordered list of screenshots which are result of human interactions with an application
- Ordered list of descriptions of each screenshot/screen
- Ordered list of Actions performed by the user. Each action is a JSON object containing:
  - edge_id: The unique identifier for this action
  - description: What the user did (e.g., "Tap Login button")
  - business_logic: (Optional) The underlying business rules or system behavior for this action. When provided, this must be validated in the expected results.
- List of parameters which must be covered in the generated test case.

<screen_descriptions>
<DESCRIPTIONS>
</screen_descriptions>

<user_actions>
<ACTIONS>
</user_actions>

<parameters>
<PARAMS>
</parameters>
</input>

<output>
- A JSON object, which represents a raw test case for the functionality, correctness, and goal oriented behaviour of the application.
- Each test case object should contain:
  - title: A <7 word title for the test case.
  - description: A description of the test case that clearly outlines the business or user goal achievement that is under test. Prioritize information from action descriptions and business logic.
  - preconditions: A string in the following format - User is on <screen name>. The screen name corresponds to the first input screenshot.
  - test_case_steps: A list of steps that clearly outline the necessary user interactions required to achieve the business or user goal. Each step contains:
    - step_description: A description of the user interaction, derived from the action description.
    - expected_results: A list of expected results caused by the step. If business logic is provided for the action, ensure the expected results validate that business logic. The results may be within the application, or outside the application, such as a user receiving an email, or a user receiving a notification.
    - edge_id: For every input actions, you are also provided with the corresponding edge_id. The value of the edge_id field should be edge_id that corresponds to the step_description-action's edge_id.
  - rationale: A short explanation of the negative impact of this test case failing, from a user or business perspective. Reference the business logic when explaining importance. And any other relevant reasoning on its formulation.

</output>

<example-json-response>
```
    [
      {
        "title": "Settings screen navigation from {{screen_name}}",
        "description": "Verify that the user can navigate from the {{screen_name}} to the Settings screen using the 'Menu' button.",
        "preconditions": ["User is on {{screen_name}} screen"],
        "test_case_steps": [
          {
            "step_description": "Click the 'Menu' button in the top left corner of the screen.",
            "expected_results": [
              "The navigation menu expands, displaying available sections Profile, Settings, and Payment Methods"
            ],
            "edge_id": "lsadjfoij1oj234je"
          },

          {
            "step_description": "Click 'Settings' in the menu",
            "expected_results": [
              "The Settings screen is displayed."
            ],
            "edge_id": "aksikdjfioj123lkkj"
          }
        ],
        "rationale": "The user cannot navigate to the Settings screen if the Menu button is invisible or unclickable."
      },
    ]
```
"""
