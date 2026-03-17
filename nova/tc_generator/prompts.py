EXPECTED_RESULTS_GEN_PROMPT = (
    "<CONTEXT>\n",
        "A step has been executed on an emulator. The before and after state of the emulator ",
        "has been captured in screenshots. The (step, before_screenshot, after_screenshot) ",
        "then is passed through a step_execution_verifier which checks whether the step ",
        "was executed or not. Now the similar inputs are passed through an anomaly detector ",
        "whose job is to confirm whether the after-state-of-emulator is what a human expects or not. ",
        "You will generate the expected results using the above context. Then the expected results ",
        "will be fed to an output_verifier module. The output_verifier verifies whether in the after ",
        "state of emulator, the expected_results is consistent or not. Ideally, output_verifier ",
        "and anomaly_detector (human expectations) should agree on same output. Once you ",
        "generate the expected_results, it will be passed to output_verifier, and if output_verifier and ",
        "anomaly_detector does not agree, then you will be asked again with wrongly predicted ",
        "expected_results and output_verifier response. So if you are given such wrongly predicted expected ",
        "results then do improvise to return better expected_results that the output_verifier and ",
        "anomaly_detector can agree upon.\n",
    "<CONTEXT>\n\n",

    "<INPUT_DESCRIPTION>\n",
        "step: the step that was executed\n",
        "before_ss, after_ss: before and after state of the emulator after executing the step\n",
        "step_verifier_response: whether the step was executed or not\n",
        "anomaly_detector_response: whether the outcome is what human expects\n",
        "wrongly_predicted_expected_results [optional]: Your past response\n",
        "output_verifier_response [optional]: whether the expected_results is consistent in after state of ",
                                                "emulator or not\n",
        "user_goal: The overall agenda behind taking the step\n",
    "</INPUT_DESCRIPTION>\n\n",

    "<TASK>\n",
        "You have to return expected_results. Once a step executes ",
        "there are couple of scenarios - the screen remains same or it may change. Depending upon the ",
        "scenarios, return the expected_results. Use OCR whenever possible. Consider following examples ",
        "as a reference \n",
        "The returned expected results can come in two pointers. First for functionality expectations ",
        "and second for semantic expectations. The functionality expectations cover the behaviour of ",
        "UI elements upon taking a particular action. The semantic expectations cover the ",
        "semantic-action-consequences of the current step\n",
        '1 - After clicking google application button ',
            "a new screen with text 'Search google or type URL' appears\n",
        "2 - After typing email address in the 'Email' field, full or partial email address appears\n",
        "3 - After scrolling the screen, the continued screen appears\n",
        "4 - After clicking on input field, there may be no difference in the before and after screenshots\n",
        "5 - After applying a filter of type x, the items returned must be of type x\n",
    "</TASK>\n\n",

    "<IMPORTANT>\n",
        "For any kind of confidential information such as name, email, gender, or any field that is ",
        "entered by a user, do not use the exact text. For example, do not return as below\n",
        "- User entered 'gmailid@gamil.com' email in Email field\n",
        "Instead for such manually entered fields, return generalized expected results\n"
    "<IMPORTANT>\n\n",

    "<INPUT>\n",
        'user_goal - <USER_GOAL>\n\n',
        'step - \n<STEP_TAKEN>\n\n',
        "step_verifier_response - \n<STEP_VERIFIER_RESPONSE>\n\n",
        "anomaly_detector_response - \n<ANOMALY_DETECTOR_RESPONSE>\n\n",
        "wrongly_predicted_expected_results - \n<WRONG_EXPECTED_RESULTS>\n\n",
        "output_verifier_response - \n<OUTPUT_VERIFIER_RESPONSES>\n\n",
    "</INPUT>\n\n",
)
EXPECTED_RESULTS_GEN_PROMPT = ''.join(EXPECTED_RESULTS_GEN_PROMPT)

SEMANTIC_ASPECT = (
    "Semantic aspect - Summarize both the screenshots. The summary should contain detailed analysis - ",
    "OCR texts, objects visible, colors of the objects visible.\n",
    "Check what you see on screenshot is semantically consistent with overall steps taken.\n",
    
    "For Example:\n",
    '1 - Semantic - When applied with red coat filter, if there is any image with blue coat then ',
        'it is semantically incorrect\n',
    '2 - Semantic - When applied with red coat filter, if i see an image of shoe, it is semantically ',
        'incorrect\n',
)
SEMANTIC_ASPECT = ''.join(SEMANTIC_ASPECT)

ANOMALY_AND_GOAL_REACHED_DETECTION_PROMPT = (
    '<TASK>\n',
        'Assume you are a human exploring an application. Given the list of steps you have performed. ',
        'You are given a before and after emulator state. Now, as a human, is this how ',
        'you would expect the step results?\n',
        'You have to check the correctness considering the following aspects:\n',
        
        'Functionality aspect - You have to check the functionality of the element/action under consideration\n',
        'Couple of examples - \n',
        '1 - Functionality - Upon clicking a signup button, a human may expect an account creation form\n',
        '2 - Functionality - Upon clicking and typing on input field, ',
             'human expects that the typed text appears on the field\n',
        '3 - Functionality - For some fields, the text wrapping may not be enabled, ',
             'hence, it is possible that the complete ',
            'typed text may not be visible but only the parital text is visible - which is okay!\n\n',

        '<SEMANTIC_ASPECT>\n',
        
        'you also have to decide whether the user goal is satisfied or not\n\n',
    '</TASK>\n\n',
    
    '<DEFINITION-USER_GOAL_SATISFIED>\n',
        'when the pass_n_fail_criteria or termination_condition is executed, then consider that ',
        'the user goal is fully satisfied.\n',
    '</DEFINITION-USER_GOAL_SATISFIED>\n\n',

    "<CONSTRAINTS>\n",
        "1. When you check for relevant items using swipe command, only check for 2 times. If you have already ",
            "executed the swipe command twice then no need to execute the swipe command\n",
    "</CONSTRAINTS>\n\n",
    
    '<WILDCARD_PASS>\n',
        "1. Swipe command is not easy to carry out, it may be possible that, the swipe command was ",
            "executed but it started from non-swipable area of the screen. In such cases ",
            "the screen will not scroll and you will see the same before and after screen. ",
            "Hence, in such cases, always keep the status as True\n",
    '<WILDCARD_PASS>\n\n',

    '<GOAL_THAT_USER_IS_TRYING_TO_ACHIEVE>\n',
        "<USER_GOAL>\n",
    '</GOAL_THAT_USER_IS_TRYING_TO_ACHIEVE>\n\n',
    
    '<HISTORY-STEPS_TAKEN_SO_FAR>\n',
        '<STEPS_TAKEN>\n',
    '</HISTORY-STEPS_TAKEN_SO_FAR>\n\n',

    "<EXPECTED_BEHAVIOUR_OF_AN_APP>\n",
        "<EXPECTED_APP_BEHAVIOUR>\n",
        "For negative test cases where we test for applications behavior with not filling certain fields and try to proceed further, ",
        "in such cases, the application may or may not show any error but it must not let user proceed to next screen\n",
    "</EXPECTED_BEHAVIOUR_OF_AN_APP>\n\n",

    '<OUTPUT_FORMAT>\n',
        'how_far_from_achieving_goal - Considering the user goal and the steps taken so far, how far are we from the goal\n',
        'is_goal_reached - True if goal is satisfied as defined otherwise false\n',
        'human_judgement - True if after-execution-emulator-state is consistent with the correctness aspects\n',
    '</OUTPUT_FORMAT>\n\n',
)
ANOMALY_AND_GOAL_REACHED_DETECTION_PROMPT = ''.join(ANOMALY_AND_GOAL_REACHED_DETECTION_PROMPT)

STEP_VERIFIER_PROMPT = (
    '<TASK>\n',
        '<INPUT>\n',
            'You are given two screenshots. ',
            "Screenshots depict emulators before and after taking a step. \n",
            'First screenshot corresponds to the state of the emulator before taking the step\n',
            'Second screenshot corresponds to the state of the emulator after taking the step\n',
        '<INPUT>\n',
    'You will be given before, after emulator state, the step that was taken and ',
    'you have to check if the step intended is performed or not.\n',
    "YOU DON'T HAVE TO CHECK CORRECTNESS OF EXECUTED STEP, JUST CHECK WHETHER INTENDED ACTION IS TAKEN OR NOT\n",
    '</TASK>\n\n',

    '<SET_STATUS_TO_TRUE>\n',
        '1 - For a move and click command, it is possible that a new screen appears or nothing happens. ',
             'If the step is about clicking an input field then ',
             'there will not be any difference in two screens\n',
        '2 - After a click, you may or may not notice any changes. If the functionality does not work ',
            'properly, then there might be no difference after the action. You have to keep the status ',
            'True in such case and put the reasoning in the rationale. \n',
        '2 - For a type command - it is possible that full or partially typed text appears, ',
             'it is possible that some input fields have wrap text disabled so the entire entered text ',
             'may not be visible\n',
        '3 - Password may look masked so if you have to verify whether some confidential information ',
             'is typed or not, then do consider that they may be masked after typing.\n',

        '<ANTICIPATE_ERROR>\n',
            "1. Suppose there is issue with UI element. And you click on that UI element then it is likely that ",
            "an unexpected screen/behavior may appear. In such case, the status should be true. that the step ",
            "is taken but there is an error on UI element implementation side.\n",
            "2. Swipe command is not easy to carry out, so you can be lenient with swipe command checking. ",
                "Even if the swipe command did not seem to be carried out, you can pass this command \n",
        '</ANTICIPATE_ERROR>\n\n',
    '</SET_STATUS_TO_TRUE>\n\n',

    '<SET_STATUS_TO_FALSE>\n',
        '1. After the type command, you do not see a single character written\n',
        '2. After the click command, a very different screen or random behavior appears which is not expected\n',
        'In short - when the uninteded step has been taken you have to set the status as False\n',
    '</SET_STATUS_TO_FALSE>\n\n',

    '<STEP>\n',
    '<STEP_TAKEN>\n'
    '</STEP>\n\n',

    '<OUTPUT_FORMAT>\n',
        "Status: True or false\n",
        "Rationale: rationale behind the status\n",
    '</OUTPUT_FORMAT>\n\n',
)
STEP_VERIFIER_PROMPT = ''.join(STEP_VERIFIER_PROMPT)

IS_GOAL_REACHED_PROMPT = (
    '<TASK>\n',
    "You will be given a screenshot of an emulator. The tester is trying to test a test case. ",
    "The test case is framed as a user goal. You will be provided with the user goal as well. ",
    "You will be also provided all the steps taken so far. The tester is testing an application ",
    "on an emulator. Given such information, you have to decide whether the user goal is satisfied or not\n ",
    '</TASK>\n\n',

    "<CONSTRAINTS>\n",
        "1. When you check for relevant items using swipe command, only check for 2 times. If you have already ",
            "executed the swipe command twice then no need to execute the swipe command\n",
    "</CONSTRAINTS>\n\n",
    
    '<GOAL_THAT_USER_IS_TRYING_TO_ACHIEVE>\n',
        "<USER_GOAL>\n",
    '</GOAL_THAT_USER_IS_TRYING_TO_ACHIEVE>\n\n',
    
    '<HISTORY-STEPS_TAKEN_SO_FAR>\n',
        '<STEPS_TAKEN>\n',
    '</HISTORY-STEPS_TAKEN_SO_FAR>\n\n',

    '<DEFINITION-USER_GOAL_SATISFIED>\n',
        'when the pass_n_fail_criteria or termination_condition is executed, then consider that ',
        'the user goal is fully satisfied.\n',
    '</DEFINITION-USER_GOAL_SATISFIED>\n\n',
)
IS_GOAL_REACHED_PROMPT = ''.join(IS_GOAL_REACHED_PROMPT)

GET_ALL_NEXT_STEPS_PROMPT = (
    '<TASK>\n',
        'You are a user trying to nevigate through an app for the first time. You have some goal in mind. ',
        'The screenshot shows an image of an emulator. You have to formulate 1st level steps from the given ',
        'screenshot. The step format is also provided to you below. You have to do in the following manner. ',
        'Consider all the UI elements visible on the screenshot. For every UI element, formulate atleast ',
        'one step. The formulated step may or may not lead to the goal. That is ok. ',
        'Along with UI elements, also consider keyboard key press commands like press enter on keyboard. ',
        'The steps returned should be elobarated such that they follow the step_format guidelines\n',
    '</TASK>\n\n',

    '<GOAL_THAT_USER_IS_TRYING_TO_ACHIEVE>\n',
        "<USER_GOAL>\n",
    '</GOAL_THAT_USER_IS_TRYING_TO_ACHIEVE>\n\n',

    '<HISTORY-STEPS_TAKEN_SO_FAR>\n',
        '<STEPS_TAKEN>\n',
    '</HISTORY-STEPS_TAKEN_SO_FAR>\n\n',

    '<STEP_FORMAT>\n',
        'The step you will return should be in one of the below format:\n',
        '<Move_and_click>\n',
            'Use combination of Move cursor, and click command. Also use nearby text or spacial information ',
            'to encode the step. Some of cases you can handle as below. For other cases, handle it yourself\n',
            'Case 1 - Click an icon - describe the icon by name or symbol or locality\n',
            'Case 2 - Click an input field - if there is a text inside the field then use that text as - ',
                      'e.g. "click on search bar with text - Search Google or type URL"\n',
            'Case 3 - Click an input field - if there is text above or below the input field but not on field ',
                      'then use the command like - e.g. "Move the cursor to the email field which is below ',
                      'the text - Enter Email id - and click"\n',
        '</Move_and_click>\n',

        '<Move_and_DoubleClick_and_KeyboardType>\n',
            "Use Combination of Move cursor, double click, and type command. Usually, this combination is used ",
            "to replace a piece of text. Following is an example - \n",
            "1 - Move the cursor to the center of the written text - <text>, double-click, type <new_text>\n",
        '</Move_and_DoubleClick_and_KeyboardType>\n\n',

        '<Type>\n',
            'Type <text> in <field name/identifier> field\n',
            'Type <text> in <field name/identifier> field and ',
            'press enter on the keyboard - useful for searching for a keyword\n',
            "Press <key-backspace/enter/up-arrow/...> on keyboard\n",
        '<Type>\n',

        '<Swipe left/right/up/down>\n',
            "Use the following information to make a swipe instruction\n",
            "1 - swipe-direction (Up/Down/Left/Right)\n",
                 'swipe-up - content scrolls down - from bottom to top\n',
                 'swipe-down - content scrolls up - from top to bottom\n',
                 'swipe-right - content moves left - from left to right\n',
                 'swipe-left - content moves right - from right to left\n',
            "2 - Move cursor - Whenever you want to swipe, first move the cursor to one ",
                 'of the item which you think is part of swiping. ',
                 "Use color/shape/relative-position(top-left, top-right, bottom-left, bottom-right) to describe ",
                 "the item where we want to place the cursor.\n",
            "3 - swipe - Specify how much to swipe\n",
            "In your instruction, incude the following title - \n",
            "<swipe-direction>-<starting_relative_pos>-<ending_relative_pos>: ",
            "<Instruction info>\n",
            "Use above 3 parameters to describe the scroll/swipe instruction precisily.\n",
            "In the instruction, always use one of the item as a reference as a starting point of swipe\n",
        '</Swipe left/right/up/down>\n',
    '</STEP_FORMAT>\n\n',

    '<OUTPUT_FORMAT>\n',
        'all_steps_possible: all probable steps which follows the step_format above\n',
    '</OUTPUT_FORMAT>\n\n',
)
GET_ALL_NEXT_STEPS_PROMPT = ''.join(GET_ALL_NEXT_STEPS_PROMPT)

CHOOSE_STEP_PROMPT = (
    '<TASK>\n',
        'You are a user trying to nevigate through an app for the first time. ',
        'The screenshot shows an image of an emulator. You will be given a list of potential steps ',
        'which can be taken in order to achieve the user goal. Given the screenshot of the emulator, ',
        'you have to choose one step from the list provided which is most likely to lead towards user goal.',
        'When you choose a step, consider pass_n_fail_criteria, termination_condition, and user_interactions ',
        'to decide which step to take. ',
        'The ultimate aim is to execute the termination condition. ',
        "Note that, overall idea is to exactly replicate the user_interactions. It is possible that ",
        "certain step might be missing or certain step can be incorrectly formulated. You have to ",
        "use your intelligence as well in such scenarios so that we can reach and execute the ",
        "termination condition or pass_n_fail_criteria\n",
    '</TASK>\n\n',

    "<WHICH_UI_ELEMENT_TO_USE_WHEN>\n",
        "<WHEN_TO_USE_WHICH_UI_ELEMENT>\n",
    "</WHICH_UI_ELEMENT_TO_USE_WHEN>\n\n",

    '<MUST_FOLLOW>\n',
        '1 - You will be provided with steps taken so far and you have to predict the next task.\n',
        '2 - If you see an opened keyboard, and if you feel that it is blocking the screen then you can ',
            'consider clicking the back button which is located in the verticle bar next to the emulator screen',
            '. The back button is like a small triangle like button\n',
    '</MUST_FOLLOW>\n\n',

    '<GOAL_THAT_USER_IS_TRYING_TO_ACHIEVE>\n',
        "<USER_GOAL>\n",
    '<GOAL_THAT_USER_IS_TRYING_TO_ACHIEVE>\n\n',

    '<HISTORY-STEPS_TAKEN_SO_FAR>\n',
        '<STEPS_TAKEN>\n',
    '</HISTORY-STEPS_TAKEN_SO_FAR>\n\n',
    
    '<ALL_POSSIBLE_STEPS>\n',
        "<ALL_STEPS>\n",
    '<ALL_POSSIBLE_STEPS>\n\n',

    '<OUTPUT_FORMAT>\n',
        'test_case_description: In natural lang, what goal a user is trying to achieve by executing the step\n',
        'step_description: the chosen step from the list\n',
    '</OUTPUT_FORMAT>\n\n'
)
CHOOSE_STEP_PROMPT = ''.join(CHOOSE_STEP_PROMPT)

GET_NEXT_STEP_PROMPT = (
    '<TASK>\n',
        'You are a user trying to nevigate through an app for the first time. You have some goal in mind. ',
        'The screenshot shows an image of an emulator. You will also be provided with the output of the following adb command. \n',

        'adb shell dump uiautomator dump <path>\n. You will be given important extracted information from this command. ',
        'You have to formulate 1st level step from the given ',
        'screenshot and the adb dump. The step format is also provided to you below. You have to do in the following manner. ',
        'Consider all UI elements visible on the screenshot. The best possible action can belong to any of the UI element. ',
        'The formulated step may or may not lead to the goal. That is ok. ',
        'Along with UI elements, also consider keyboard key press commands like press enter on keyboard. ',
        'The step returned should be elobarated such that they follow the step_format guidelines\n',

        'For click and type actions, you have to directly generate the adb command to carry out the action. ',
        'Also introduce sleep of 0.5 seconds between all the consecutive adb commands\n',

        'Trivial step definition - the chosen step is trivial if it is not expected to change the current screen. ',
        'For example, clicking on email id field, typeing email id, clicking on password field, etc. are ',
        'example of trivial steps. Where after executing the step, we still stay on the same screen. \n',
    '</TASK>\n\n',

    '<MUST_FOLLOW>\n',
        '1 - You will be provided with steps taken so far and you have to predict the next task.\n',
        '2 - In any state, in a screenshot you see a opened keyboard then the first command should be go-back adb command - ',
            'adb shell input keyevent KEYCODE_BACK - then you can append other commands\n',
        '3 - For the typable input fields, consider the following sequence of commands - if you see an opened keyboard, then first ',
            'command is go-back command. Second command about clicking on input field box. And third command is type text.\n',
        '4 - For search related steps, after writing the search query, alwasy include the next step as pressing enter key\n',
    '</MUST_FOLLOW>\n\n',

    '<ADB_DUMP>\n',
        '<SCREEN_XML>\n',
    '<ADB_DUMP\n\n>',

    '<GOAL_THAT_USER_IS_TRYING_TO_ACHIEVE>\n',
        "<USER_GOAL>\n",
    '</GOAL_THAT_USER_IS_TRYING_TO_ACHIEVE>\n\n',

    '<HISTORY-STEPS_TAKEN_SO_FAR>\n',
        '<STEPS_TAKEN>\n',
    '</HISTORY-STEPS_TAKEN_SO_FAR>\n\n',
    
    "<WHICH_UI_ELEMENT_TO_USE_WHEN>\n",
        "<WHEN_TO_USE_WHICH_UI_ELEMENT>\n",
    "</WHICH_UI_ELEMENT_TO_USE_WHEN>\n\n",
    
    '<STEP_FORMAT>\n',
        'The step you will return should be in one of the below format:\n',
        '<Move_and_click>\n',
            'Use combination of Move cursor, and click command. Also use nearby text or spacial information ',
            'to encode the step. Some of cases you can handle as below. For other cases, handle it yourself\n',
            'Case 1 - Click an icon - describe the icon by name or symbol or locality\n',
            'Case 2 - Click an input field - if there is a text inside the field then use that text as - ',
                      'e.g. "click on search bar with text - Search Google or type URL"\n',
            'Case 3 - Click an input field - if there is text above or below the input field but not on field ',
                      'then use the command like - e.g. "Move the cursor to the email field which is below ',
                      'the text - Enter Email id - and click"\n',
        '</Move_and_click>\n',

        '<Move_and_DoubleClick_and_KeyboardType>\n',
            "Use Combination of Move cursor, double click, and type command. Usually, this combination is used ",
            "to replace a piece of text. Following is an example - \n",
            "1 - Move the cursor to the center of the written text - <text>, double-click, type <new_text>\n",
        '</Move_and_DoubleClick_and_KeyboardType>\n\n',

        '<Type>\n',
            'Type <text> in <field name/identifier> field\n',
            'Type <text> in <field name/identifier> field and ',
            'press enter on the keyboard - useful for searching for a keyword\n',
            "Press <key-backspace/enter/up-arrow/...> on keyboard\n",
        '<Type>\n',

        '<Swipe left/right/up/down>\n',
            "Use the following information to make a swipe instruction\n",
            "1 - swipe-direction (Up/Down/Left/Right)\n",
                 'swipe-up - content scrolls down - from bottom to top\n',
                 'swipe-down - content scrolls up - from top to bottom\n',
                 'swipe-right - content moves left - from left to right\n',
                 'swipe-left - content moves right - from right to left\n',
            "2 - Move cursor - Whenever you want to swipe, first move the cursor to one ",
                 'of the item which you think is part of swiping. ',
                 "Use color/shape/relative-position(top-left, top-right, bottom-left, bottom-right) to describe ",
                 "the item where we want to place the cursor.\n",
            "3 - swipe - Specify how much to swipe\n",
            "In your instruction, incude the following title - \n",
            "<swipe-direction>-<starting_relative_pos>-<ending_relative_pos>: ",
            "<Instruction info>\n",
            "Use above 3 parameters to describe the scroll/swipe instruction precisily.\n",
            "In the instruction, always use one of the item as a reference as a starting point of swipe\n",
        '</Swipe left/right/up/down>\n',
    '</STEP_FORMAT>\n\n',

    '<OUTPUT_FORMAT>\n',
        'step_description: the chosen step either following the step_format provided or for click and type, directly the sequence of adb commands\n',
        'test_case_description: In natural lang, what goal a user is trying to achieve by executing the step if the step_description is not a sequence of adb commands. If the step_description is a sequence of adb commands then in natural language, what does that sequence of steps achieve\n',
        'is_adb_step: if the step_description is a sequence of adb commands and can be executed directly using shutil by feeding the step_description string value, then True else False\n',
        'is_verification_needed: Whether the chosen step is `trivial` or not. Verification is not needed for `trivial` step\n',
        'step_cachable_keywords: the current screen and step will be cached. Extract list of keywords - verbs (e.g. click, double-click, type) and interaction targeted UI elements (submit, Allow, ...) from step_description. target UI elements must be represented using the text that appears on the screen. If the interaction is about typing a text then include that text as a targetted UI element. Note that, the step_description can change in how it is presented but semantically they might mean the same thing, hence, I want you to return a very robust keywords that for the same screen and given step to be taken, the keyword list comes out to be same.\n',
            'if the step_description is a sequence of adb command then extract all the keywords from all the commands which can be cached and looked up for exact sequence of adb commands\n',
        'is_precondition: the step generated - step_description - is part of the precondition or not. The user goal lists down the precondition steps. Consider steps taken so far, current step, and provided precondition steps, and decide whether the current step is precondition or not. Note that once the precondition steps are executed, all the remaining steps will always be - non precondition steps -. Precondition steps may or may not be executed in the starting of the execution.\n',
    '</OUTPUT_FORMAT>\n\n'
)
GET_NEXT_STEP_PROMPT = ''.join(GET_NEXT_STEP_PROMPT)


EXPECTED_RESULTS_FROM_IMAGES_PROMPT = (
    "<TASK>\n",
        "You are an intelligent QA assistant. You will be provided with two images of an emulator screen: \n",
        "1. 'Before' image: Check state before the step was performed.\n",
        "2. 'After' image: Check state after the step was performed.\n",
        "You will also be provided with the 'Step Description' describing the action taken.\n",
        "Your goal is to analyze the visual changes between the two images to determine the Expected Result of the step.\n",
    "</TASK>\n\n",

    "<INPUT>\n",
        "- Image 1: Before Screenshot\n",
        "- Image 2: After Screenshot\n",
        "- Step Description: <STEP_DESCRIPTION>\n",
    "</INPUT>\n\n",

    "<INSTRUCTIONS>\n",
        "1. Visually compare the 'Before' and 'After' images.\n",
        "2. Identify any meaningful changes (e.g., new screen, popup, keyboard appearance, text change, navigation).\n",
        "3. Do not include dynamic elements like texts and colours in expected results. Focus on what is page is meant for designed."
        "4. correlate these changes with the 'Step Description'.\n",
        "5. Formulate a concise 'Expected Result' statement that describes the successful outcome of the step based on the visual evidence.\n",
        "   - Example: If the step was 'Click Login' and the screen changed to a dashboard, the expected result is 'User is navigated to the Dashboard screen'.\n",
        "   - Example: If the step was 'Enter email', and text appeared, the expected result is 'Email text is visible in the input field'.\n",
        "6. If there are no visible changes but the action was trivial (e.g., clicking a field that was already focused), state that 'No visual change observed, but field is active'.\n",
    "</INSTRUCTIONS>\n\n",

    "<OUTPUT_FORMAT>\n",
        "Return the response in JSON format:\n",
        "{\n",
        "  \"status\": true/false, // true if a valid expected result could be inferred\n",
        "  \"rationale\": \"Concise expected result description based on visual analysis\"\n",
        "}\n",
    "</OUTPUT_FORMAT>\n\n"
)
EXPECTED_RESULTS_FROM_IMAGES_PROMPT = "".join(EXPECTED_RESULTS_FROM_IMAGES_PROMPT)
