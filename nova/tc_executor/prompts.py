POSITION_IDENTIFICATION_PROMPT = (
    "Put your prompt here"
)
POSITION_IDENTIFICATION_PROMPT = ''.join(POSITION_IDENTIFICATION_PROMPT)

IS_BUFFER_STATE_PROMPT = (
    "You will be given an emulator screen on the left side. ",
    "I suspect that there is either of the following case: \n",
    
    "1. Loading - There is something loading on the emulator\n",
    "2. System pop up - There is some system notification. It can be about allowing for permissions, ",
    "or it can be about accessing contact/gallery/audio/video/file system permission, .... ",
    'Such notifications clearly ask for permission with well formed question. Do not mis-classify ',
    'any screen with notification screen unless you see such well formed question asking explicitly for ',
    'permissions\n',
    '3. Black blank screen\n',
    
    "If you see any of the above case then return true else return false along with its rationale\n"
)
IS_BUFFER_STATE_PROMPT = ''.join(IS_BUFFER_STATE_PROMPT)

BUFFER_STATE_EXECUTION_PROMPT = (
    "You will be given an emulator screen on the left side. Consider the following fact\n",
    "<EXISTENCE_RATIONALE>\n"

    "I want you to do the following depending upon the case\n",
    
    '1. Loading - wait for 5 secs\n',
    '2. System pop up - click on the button that will allow the phone to access the respective media. ',
    'Note that, you have to perform only one (Mouse move + left click ) command\n',
    '3. Black Blank screen - click on power button. Power button is located on the right verticle ',
        'panel of the emulator.\n',

    "If you do not see any of the above case then do not do anything, just return empty string\n"
)
BUFFER_STATE_EXECUTION_PROMPT = ''.join(BUFFER_STATE_EXECUTION_PROMPT)

OUTPUT_VERIFIER_PROMPT = (
    "Does the screenshot reflect the following expected outcome?\n",
    '<EXPECTED_OUTCOME>\n',
    '<EXPECTED_RESULTS>\n'
    '</EXPECTED_OUTCOME>\n',
)
OUTPUT_VERIFIER_PROMPT = ''.join(OUTPUT_VERIFIER_PROMPT)

EXECUTOR_PROMPT = (
    '<instruction>\n',
    "You will see an emulator, on the left. You will be given instructions regarding, ",
    'executing a test case. you have to execute the instructions on the emulator. ',
    'Do not return any extra text. Do not verify if the expected results are achieved or not.\n',
    '</instruction>\n\n',

    '<test_case_format>\n',
    'test_case_description - only for reference\n',
    'preconditions - only for reference\n',
    'Step description - meant to execute\n',
    'Expected outcome\n',
    'preconditions represents the state on the app. The steps must be executed only if the ',
    'preconditions are met. You do not have to execute any preconditions. They are only ',
    'meant to check. If you see that the preconditions are not matched then only execute ',
    'necessary steps by your own intelligance to meet the preconditions\n',
    '</test_case_format>\n\n',

    '<mobile_usage_guidelines>\n',
    '1 - If you want to scroll, first click the left mouse key and drag the mouse down/up to scroll down/up on the mobile screen\n',
    '</mobile_usage_guidelines>\n\n',

    '<strict_instructions>\n',
        '1 - Always double check the cursor coordinates\n',
        '2 - Some actions might introduce loading, if you see any loading symbol on button or ',
        'somewhere else, introduce wait for 2 seconds until loading is finished and then ',
        'take the screenshot.\n',
        '3 - for commands like - type <text> in <field_name> field. You have to first click the field ',
            'and they type the text.\n',
        '4 - All the interaction must happen inside the emulator screen. You will be provided the ',
            "screenshot of the entire computer screen, but you are only allowed to interact with the ",
            "emulator. All the coordinates you come up with must lie inside the emulator screen. ",
            "This is an extremely important instruction which must be followed at any cost.\n",
        '5 - For input fields only  - There are two scenarios while clicking a <field_name>. First, <field_name> is contained in the input field, ',
            'in which case ',
            'you can consider clicking on the <field_name> itself. Second scenario can be, <field_name> can be above or below the ',
            'input field. in which case, you have to click on the input field corresponding to the <field_name>\n',
        '6 - For clicking on a button (not the input fields) always bring the cursor in the center of the text of the button and then click\n',
    '</strict_instructions>\n\n',

    'Following is the test case details:\n',
    '<TC_STRING>'
)
EXECUTOR_PROMPT = ''.join(EXECUTOR_PROMPT)

ATOMIC_EXECUTOR_PROMPT = (
    '<INSTRUCTION>\n',
    'You have to perform following actions.\n',
    'Do not take any screenshot. Do not return any explaination. \n',
    'Just execute the commands\n',
    '</INSTRUCTION>\n\n',

    '<COMMANDS>\n',
    '<TC_STRING>\n',
    '</COMMANDS>\n\n'
)
ATOMIC_EXECUTOR_PROMPT = ''.join(ATOMIC_EXECUTOR_PROMPT)
