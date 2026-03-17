SMOKE_TEST_PLANNING_PROMPT = """
<task>
I want a list of smoke tests for the following functionality. A smoke test contains detailed instructions on how to test the end-to-end functionality.
</task>

<input>
- A functionality object that contains the following fields:
  - functionality_name: The name of the functionality
  - feature_name: The name of the feature that this functionality belongs to
  - interactions: A list of interactions that are required to complete the functionality
  - The functionality is described, depicted, or demonstrated in the provided input images, acceptance criteria, and some existing test cases included in the input.
- A list of input image descriptions to help you identify and reference the images, containing the image_index and description for each image.
- Optionally, there may be additional context in the form of acceptance criteria and test cases that may help you identify the functionalities.


<functionality>

${functionality}

</functionality>

<input-image-descriptions>
```
${input_image_descriptions}
```
</input-image-descriptions>

</input>

<output>
- A JSON list, where each object represents a Smoke Test for the functionality.
- Each Smoke Test object contains:
  - test_case_description: A description of the test case that clearly outlines the objective of the test case.
  - design_frame_index: The index of the image from the input images that best depicts the starting point and/or expected end state for the test case.
  - preconditions: A list of preconditions for the test case that must be met before the test case can be run. These preconditions should be as atomic as possible.
  - test_case_steps: A list of steps that clearly outline the necessary user interactions required to complete the test case.
  - expected_results: A list of expected results for each step of the test case. These results should be as atomic as possible.
  - rationale: A short explanation of the negative impact of this test case failing, both from a user as well as business perspective.

<example-json-response>  
```
    [
      {
        "test_case_description": "Verify that the user can navigate from the Home screen to the Settings screen using the 'Menu Icon' button.",
        "preconditions": ["User is on the Home screen"],
        "design_frame_index": 101,
        "test_case_steps": [
          {
            "step_description": "On the Home screen, tap the 'Menu Icon' button.",
            "expected_results": [
              "The navigation menu expands, displaying available options."
            ]
          },
          {
            "step_description": "Select 'Settings' from the navigation menu.",
            "expected_results": [
              "The Settings screen is displayed."
            ]
          }
        ]
      }
    ]```

</example-json-response>

</output>

<key-instructions>
- Think from an end user's perspective, but also from the quality analyst's perspective.
- Each smoke test should cover a critical part of the functionality included above, and should be complete in itself.
- Treat each test case as a distinct and atomic test case. Do not combine multiple test cases into a single test case, and avoid overlaps between test cases.
- Ensure that the test cases are atomic and can be run independently, with detailed step-by-step pre-conditions and expected results.
- Ensure that the test case steps are logically ordered, and that they contain all the necessary user interactions required to complete and verify the test case.
- The test cases must be listed in **the order they first appear** logically, and from the provided inputs and context.
</key-instructions>

<context>
<list-of-test-cases>
${input_test_cases}
</list-of-test-cases>

<acceptance-criteria-and-instructions>
${acceptance_criteria}
</acceptance-criteria-and-instructions>
</context>
"""

GOAL_PLANNER_PROMPT_PART_ONE = """
You are a specialist **QA Engineer** and **User Experience Analyst**.
Your task is to deeply analyze the given app description and **generate realistic**, **user-centric goals** for how users would interact with the app, keeping in mind both **business objectives** and **user needs**.
Goals should try to cover most of the app's functionalities.

**Key Instructions**:

1. Think from the business perspective:
   - Identify key actions the **business** would want users to perform (e.g., Sign-Up, Subscribe to a Service, Complete a Purchase, Engage with Features, Invite Friends, Upgrade Account, etc.).
   - Include goals that improve user retention, engagement, monetization, or brand loyalty.
2. Think from the user’s task perspective:
   - Imagine typical **user behaviors** based on the app’s purpose (e.g., book a workout class, chat with a friend, manage budget, read an article, listen to a podcast, search for restaurants, etc.).
   - Frame the **goals** around intuitive activities that users would naturally want to accomplish.
3. Formulate each goal clearly:
   - Be **action-oriented** ("Navigate", "Search", "Filter", "Subscribe", "Verify").
   - Reference UI components when needed (e.g., Search Bar, Filters, Tabs, Forms, Menus).
   - Include validation steps where applicable ("Verify correct results", "Confirm successful action", "Ensure expected behavior").
   - Each goal should focus on **one coherent flow** at a time.
4. Express the goals like manual QA instructions:
   - Clear, sequential, unambiguous — easy for a tester or automation system to interpret.
5. Format examples:
   - "Navigate to [Feature/Section], perform [Action], verify [Expected Outcome]."
   - "Use [Tool/Feature] to [Achieve Goal] and confirm [Result]."
   - "Sign up with [Method] and verify account creation."
   - "Search for [Item/Service], apply [Filter], scroll [X times], verify results."
   - "Perform [Action] and confirm [Feedback or Notification]."

Here is one example of description and User goals: 
**Description:**
    We are currently in beta and working around the clock to make it even better.

    Faircado is your all-in-one second-hand shopping app, designed to help you save money and shop sustainably – effortlessly!

    Discover billions of hot deals, and get ready to save money 💸 & the planet 🌍 ...for FREE!

    THE ALL-IN-ONE SECOND-HAND STORE
    Find the best of eBay, Vestiaire Collective, BackMarket, Sellpy, World of Books & many more... in one place.

    FASHION, BOOKS, ELECTRONICS & MORE
    See this app as your new shopping bestie. Helping you find everything, everywhere, all at once.

    SNAP IT, WE FIND IT
    Take a picture or upload a screenshot of anything, we'll match it with the second-hand products available. Just like that.

    DISCOVER THE BEST DEALS FOR YOU
    Find unique items, personalise your feed (coming soon), create alerts and favourite lists.

    SUSTAINABLE SHOPPING MADE EASY, HOT & AFFORDABLE
    Finally. Less hustle for more *warm glow*. Because doing the right thing should also be the easiest.

    Featured by The Independent, Glamour, TechCrunch, Yahoo Finance, Arte, Handelsblatt, Business Insider & many more soon.

    Ps: Faircado uses an affiliate model, which means our resale partners pay us a small fee as a thank-you for bringing them more potential customers. This is how Faircado can remain entirely free for you (oh and no, we don't sell you data, that's not how we roll).

    For love letters & awesome ideas, we haven't thought of yet: @Faircado on socials, or contact@faircado.com via email

**User Goals:**
    "User is currently on woman's clothing. There are various categories visible on the screen - brands, size, .... User wants to select the woman gender and then the user wants to see pink colored clothing. Select such options from the category and terminate the program."
    "Do the horizontal swipe where you see various categories like - Brands, Size, etc. There is one more category called as color and select pink color."
    "user is currently in woman's red tops page. Check if all the items listed are red tops. Use scrolling to check"
    "Navigate to womans -> clothing -> tops page"
    "click on Sunglasses and explore all the sunglasses"
    "user is currently in woman's red tops page. Check if all the items listed are red tops. Use scrolling to check"
    "Navigate to woman's tops page under clothing"
    "User has searched for tote bags. User expects to see tote bags only. Scroll and see if all tote bags are available"
    "User has fired a query on red tote bags. User expects to see only red tote bags. Scroll and check out all the red tote bags"
    "Functionality goal - scroll and new items should appear until the end of the list.\n Semantic goal - Each item must be woman's shoe and not any other category like chappal, heels, etc."
    "In the woman section, select clothing, then select dresses, and scroll through 5 times one at a time and check whether all the items listed are dresses or not. All of them should be dresses." \
    "In the woman section, select clothing, then select dresses, and scroll through 5 times one at a time and check whether all the items listed are dresses or not. All of them should be dresses." \
    "Scroll the screen to see if all the items listed are women coats or not" 

Input:
{description} 
"""

GOAL_PLANNER_PROMPT_PART_TWO = """
You are given a list of user goals/tasks for an app.

Step 1: Categorize each goal into one of the following categories:

  - Functional Goals: Tasks related to using the app’s features, navigating, searching, buying, account actions, personalization, customer support, etc.
  - Performance/System Goals: Tasks related to app speed, responsiveness, scrolling performance, battery usage, network conditions, device orientation, hardware compatibility, or system-level behavior.

Step 2: Filtering

  - Keep only the Functional Goals.
  - Remove any Performance/System Goals.

Rules:

  - Focus on user-facing actions and experience.
  - Ignore anything dealing with the technical performance or system behavior.
  - Keep the original phrasing of the retained goals unchanged.
  - Finally, return only the cleaned list of user goals (without any categorization label).

Input: 
{goals}
"""
