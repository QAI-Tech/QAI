"""
Prompt generation for browser-use web executor.
Converts test case interactions to browser-use compatible prompts.
"""


def convert_interactions_to_browser_prompt(
    interactions: dict,
    precondition_steps: list,
    credentials: dict,
    app_name: str,
    base_url: str
) -> str:
    """
    Convert test case interactions to browser-use compatible prompt.
    Similar to tc_generator/main.py convert_interactions_to_prompt() but for web.
    
    Args:
        interactions: Test case interactions dictionary
        precondition_steps: List of precondition steps
        credentials: User credentials (email, password, etc.)
        app_name: Name of the web application
        base_url: Starting URL for the test
    
    Returns:
        str: Formatted prompt for browser-use agent
    """
    prompt = f"Execute this web test case for {app_name}.\n"
    prompt += f"Navigate to: {base_url}\n\n"
    
    # Add preconditions
    if precondition_steps:
        prompt += "=" * 80 + "\n"
        prompt += "PRECONDITION NAVIGATION\n"
        prompt += "=" * 80 + "\n"
        prompt += "These steps navigate you to the test case starting point.\n"
        prompt += "Execute each step successfully. If any navigation step fails, abort the test.\n\n"
        
        for i, step in enumerate(precondition_steps, 1):
            prompt += f"NAVIGATE {i}: {step}\n"
        prompt += "\n"
        
        starting_point = interactions.get('starting_point', 'Ready for test execution')
        prompt += f"STARTING POINT: {starting_point}\n\n"
    
    # Add credentials
    prompt += "=" * 80 + "\n"
    prompt += "CREDENTIALS\n"
    prompt += "=" * 80 + "\n"
    if credentials:
        for key, value in credentials.items():
            prompt += f"{key.upper()}: {value}\n"
        prompt += "\n"
        prompt += "For SIGN-IN: Use the credentials above to log in.\n"
    else:
        prompt += "NOTE: No existing login credentials are provided.\n"
        prompt += "If the app requires authentication, you may need to REGISTER a new account.\n\n"

    prompt += "REGISTRATION (if login credentials not provided or login fails):\n"
    prompt += "- For EMAIL: Use the MailSlurp module to create a fresh inbox\n"
    prompt += "  Call: mailslurp_client.create_inbox() to get a new email address\n"
    prompt += "- For PASSWORD: Use a secure password like 'TestPass123!'\n"
    prompt += "- Complete the registration flow before proceeding with test steps\n\n"

    prompt += "EMAIL VERIFICATION FLOW (if required):\n"
    prompt += "1. After submitting form that triggers verification\n"
    prompt += "2. Use MailSlurp to wait for the verification email:\n"
    prompt += "   mailslurp_client.wait_for_latest_email(inbox_email=your_email)\n"
    prompt += "3. Extract the verification code or link from the email body\n"
    prompt += "4. Return to app and complete verification\n\n"
    
    # Add test steps
    steps = interactions.get('test_case_steps', [])
    if steps:
        prompt += "=" * 80 + "\n"
        prompt += "TEST CASE EXECUTION\n"
        prompt += "=" * 80 + "\n"
        prompt += "Execute and verify each step below.\n"
        prompt += "Report PASS or FAIL for each step with actual observations.\n\n"
        
        for i, step in enumerate(steps, 1):
            desc = step.get('step_description', '')
            expected = step.get('expected_results', [])
            
            prompt += f"STEP {i}: {desc}\n"
            if expected:
                expected_texts = expected if isinstance(expected, list) else [str(expected)]
                combined_expected = ", ".join(expected_texts)
                prompt += f"        EXPECTED: {combined_expected}\n"
                prompt += f"        VERIFY: Verify that {combined_expected}\n"
            prompt += "\n"
    
    # Add judgement criteria
    prompt += "=" * 80 + "\n"
    prompt += "JUDGEMENT CRITERIA\n"
    prompt += "=" * 80 + "\n"
    prompt += "Your judgement of PASS or FAIL must be based ONLY on:\n"
    prompt += f"- The TEST CASE EXECUTION steps (STEP 1{f' to STEP {len(steps)}' if steps else ''})\n"
    prompt += "- The EXPECTED results for each step\n"
    prompt += "- The OBSERVED results during execution\n\n"
    
    prompt += "Do NOT base pass/fail judgement on PRECONDITION NAVIGATION steps.\n"
    if precondition_steps:
        prompt += f"Navigation steps (NAVIGATE 1-{len(precondition_steps)}) are only for reaching the test starting point.\n\n"
    
    # Add final verdict
    prompt += "=" * 80 + "\n"
    prompt += "FINAL VERDICT\n"
    prompt += "=" * 80 + "\n"
    prompt += "After all steps, provide:\n"
    prompt += "- Individual step results (PASS/FAIL with observations for each TEST CASE step)\n"
    prompt += "- Overall test case result: PASS (all test steps passed) or FAIL (any test step failed)\n"
    
    return prompt


def convert_interactions_to_goal_driven_browser_prompt(
    interactions: dict,
    credentials: dict,
    app_name: str,
    base_url: str,
    goal_context: str = None
) -> str:
    """
    Convert test case interactions to goal-driven browser-use prompt.
    In goal-driven mode, NO explicit navigation steps are provided.
    Agent autonomously navigates to goal context before executing test steps.
    
    Args:
        interactions: Test case interactions dictionary
        credentials: User credentials (email, password, etc.)
        app_name: Name of the web application
        base_url: Starting URL for the test
        goal_context: High-level goal description (e.g., "product page", "cart", "settings")
    
    Returns:
        str: Formatted goal-driven prompt for browser-use agent
    """
    prompt = f"Execute this web test case for {app_name} in GOAL-DRIVEN MODE.\n"
    prompt += f"Starting URL: {base_url}\n\n"
    
    # Determine goal context
    if not goal_context:
        # Infer from starting point or first step
        starting_point = interactions.get('starting_point', '')
        if starting_point:
            goal_context = starting_point
        else:
            steps = interactions.get('test_case_steps', [])
            if steps:
                first_step = steps[0].get('step_description', '')
                # Extract context from first step (e.g., "Click Add to Cart" -> "product page")
                goal_context = "the page where test execution begins"
            else:
                goal_context = "the application"
    
    # Goal-driven navigation section
    prompt += "=" * 80 + "\n"
    prompt += "GOAL-DRIVEN NAVIGATION\n"
    prompt += "=" * 80 + "\n"
    prompt += f"GOAL CONTEXT: {goal_context}\n\n"
    
    prompt += "You must autonomously navigate from the starting URL to the goal context.\n"
    prompt += "NO explicit navigation steps are provided - you decide the path.\n\n"
    
    prompt += "NAVIGATION STRATEGY:\n"
    prompt += "1. Analyze current page state (URL, title, visible elements)\n"
    prompt += "2. Determine what actions lead to the goal\n"
    prompt += "3. Handle interruptions (cookie banners, popups, login prompts)\n"
    prompt += "4. Execute navigation actions (click menus, search, follow links)\n"
    prompt += "5. Verify goal reached (page matches goal description)\n\n"
    
    prompt += "HANDLE INTERRUPTIONS:\n"
    prompt += "- Cookie banners → Click 'Accept', 'Reject', or 'OK'\n"
    prompt += "- Login prompts → Use credentials provided below (if available)\n"
    prompt += "- Popups/modals → Click 'Close', 'Dismiss', 'No thanks'\n"
    prompt += "- Age verification → Click 'Yes, I am 18+' or similar\n"
    prompt += "- Newsletter signups → Click 'Skip', 'Maybe later'\n\n"

    prompt += "CLOUDFLARE / BOT PROTECTION:\n"
    prompt += "- If you see 'Checking your browser', 'Just a moment', or CloudFlare challenge page\n"
    prompt += "- First attempt: WAIT 30 seconds in a SINGLE wait action\n"
    prompt += "- Do NOT click anything - the page will redirect after verification\n"
    prompt += "- If still on CloudFlare after 30s, refresh page and wait 40 seconds\n"
    prompt += "- If still stuck, refresh and wait 50 seconds, then 60 seconds\n"
    prompt += "- Maximum total wait: 80 seconds (30+40+50+60 with refreshes = stop after 80s total)\n"
    prompt += "- If a CAPTCHA appears, attempt to solve it if possible\n"
    prompt += "- After 80 seconds total, proceed anyway or report CloudFlare blocking issue\n\n"

    prompt += "GOAL REACHED WHEN:\n"
    prompt += f"- Page matches goal description: {goal_context}\n"
    prompt += "- Key elements for test execution are visible\n"
    prompt += "- You can proceed with TEST CASE EXECUTION steps\n\n"
    
    prompt += "ABORT NAVIGATION IF:\n"
    prompt += "- 10-15 navigation attempts without reaching goal\n"
    prompt += "- Critical errors (404, 500, site crash)\n"
    prompt += "- Authentication fails and cannot proceed\n"
    prompt += "- Goal is unreachable (functionality doesn't exist)\n\n"
    
    # Add credentials
    if credentials:
        prompt += "=" * 80 + "\n"
        prompt += "CREDENTIALS\n"
        prompt += "=" * 80 + "\n"
        prompt += "Use these credentials if authentication is required:\n"
        for key, value in credentials.items():
            prompt += f"{key.upper()}: {value}\n"
        prompt += "\n"

        prompt += "If login credentials are not provided or login fails, REGISTER a new account:\n"
        prompt += "- For EMAIL: Use the MailSlurp module to create a fresh inbox\n"
        prompt += "  Call: mailslurp_client.create_inbox() to get a new email address\n"
        prompt += "- For PASSWORD: Use a secure password like 'TestPass123!'\n"
        prompt += "- Complete the registration flow before proceeding with test steps\n\n"

        prompt += "EMAIL VERIFICATION FLOW (if needed):\n"
        prompt += "1. Submit form that triggers verification\n"
        prompt += "2. Use MailSlurp to wait for the verification email:\n"
        prompt += "   mailslurp_client.wait_for_latest_email(inbox_email=your_email)\n"
        prompt += "3. Extract the verification code or link from the email body\n"
        prompt += "4. Return to app and complete verification\n\n"

    # Add test steps
    steps = interactions.get('test_case_steps', [])
    if steps:
        prompt += "=" * 80 + "\n"
        prompt += "TEST CASE EXECUTION\n"
        prompt += "=" * 80 + "\n"
        prompt += "Once you reach the goal context, execute these test steps:\n"
        prompt += "Report PASS or FAIL for each step with actual observations.\n\n"
        
        for i, step in enumerate(steps, 1):
            desc = step.get('step_description', '')
            expected = step.get('expected_results', [])
            
            prompt += f"STEP {i}: {desc}\n"
            if expected:
                expected_texts = expected if isinstance(expected, list) else [str(expected)]
                combined_expected = ", ".join(expected_texts)
                prompt += f"        EXPECTED: {combined_expected}\n"
            prompt += "\n"
    
    # Add judgement criteria
    prompt += "=" * 80 + "\n"
    prompt += "JUDGEMENT CRITERIA\n"
    prompt += "=" * 80 + "\n"
    prompt += "Your PASS/FAIL judgement must be based ONLY on:\n"
    prompt += f"- TEST CASE EXECUTION steps (STEP 1{f' to STEP {len(steps)}' if steps else ''})\n"
    prompt += "- EXPECTED results vs OBSERVED results\n\n"
    
    prompt += "Do NOT fail the test for:\n"
    prompt += "- Navigation attempts (expected in goal-driven mode)\n"
    prompt += "- Cookie banner handling (normal procedure)\n"
    prompt += "- Login process (if credentials work correctly)\n"
    prompt += "- Minor UI differences (color, spacing, wording)\n\n"
    
    prompt += "IGNORE dynamic content:\n"
    prompt += "- Prices (may vary by location/time)\n"
    prompt += "- Timestamps ('2 minutes ago', 'Last updated...')\n"
    prompt += "- User-specific data (usernames, avatars)\n"
    prompt += "- Recommendations ('You might also like...')\n\n"
    
    prompt += "FOCUS on structural elements:\n"
    prompt += "- Correct page loaded?\n"
    prompt += "- Expected buttons/forms present?\n"
    prompt += "- Functionality works as described?\n\n"
    
    # Add final verdict
    prompt += "=" * 80 + "\n"
    prompt += "FINAL VERDICT\n"
    prompt += "=" * 80 + "\n"
    prompt += "Provide a structured verdict:\n\n"
    
    prompt += "NAVIGATION SUMMARY:\n"
    prompt += "- Started from: [initial page/state]\n"
    prompt += "- Actions taken: [list key navigation steps]\n"
    prompt += "- Goal reached: [Yes/No]\n\n"
    
    prompt += "TEST CASE RESULTS:\n"
    if steps:
        for i in range(len(steps)):
            prompt += f"STEP {i+1}: [PASS/FAIL] - [observation vs expected]\n"
    prompt += "\n"
    
    prompt += "OVERALL VERDICT: [PASS/FAIL]\n"
    prompt += "REASON: [1-2 sentence explanation]\n"

    return prompt


def convert_goal_to_exploratory_browser_prompt(
    goal: str,
    app_name: str,
    base_url: str,
    additional_context: str = None
) -> str:
    """
    Convert a high-level test goal to an exploratory browser-use prompt.
    In exploratory mode, NO test steps or expected results are provided.
    Agent autonomously:
    1. Navigates to relevant area of the app
    2. Infers what steps to test based on the goal
    3. Infers expected results based on common UX patterns
    4. Executes and reports findings

    Args:
        goal: High-level test goal (e.g., "Test the checkout flow", "Verify login works")
        app_name: Name of the web application
        base_url: Starting URL for the test
        additional_context: Optional hints about the app (e.g., "e-commerce site", "banking app")

    Returns:
        str: Formatted exploratory prompt for browser-use agent
    """
    prompt = f"Execute an EXPLORATORY TEST for {app_name}.\n"
    prompt += f"Starting URL: {base_url}\n\n"

    # Exploratory test goal section
    prompt += "=" * 80 + "\n"
    prompt += "TEST GOAL\n"
    prompt += "=" * 80 + "\n"
    prompt += f"GOAL: {goal}\n\n"

    if additional_context:
        prompt += f"APP CONTEXT: {additional_context}\n\n"

    prompt += "You are performing an EXPLORATORY TEST. This means:\n"
    prompt += "- NO explicit test steps are provided\n"
    prompt += "- NO expected results are predefined\n"
    prompt += "- YOU must infer what to test based on the goal\n"
    prompt += "- YOU must determine what behavior is expected\n"
    prompt += "- YOU must execute and verify the inferred test cases\n\n"

    # Navigation section
    prompt += "=" * 80 + "\n"
    prompt += "NAVIGATION\n"
    prompt += "=" * 80 + "\n"
    prompt += "Navigate to the relevant area of the application for your test goal.\n\n"

    prompt += "NAVIGATION STRATEGY:\n"
    prompt += "1. Analyze current page state (URL, title, visible elements)\n"
    prompt += "2. Identify how to reach the functionality related to your goal\n"
    prompt += "3. Handle interruptions (cookie banners, popups, login prompts)\n"
    prompt += "4. Navigate to the relevant page/feature\n"
    prompt += "5. Confirm you're in the right area to begin testing\n\n"

    prompt += "HANDLE INTERRUPTIONS:\n"
    prompt += "- Cookie banners → Click 'Accept', 'Reject All', or 'OK'\n"
    prompt += "- Login prompts → Use credentials provided below (if available)\n"
    prompt += "- Popups/modals → Click 'Close', 'Dismiss', 'No thanks'\n"
    prompt += "- Age verification → Click 'Yes, I am 18+' or similar\n"
    prompt += "- Newsletter signups → Click 'Skip', 'Maybe later'\n\n"

    prompt += "CLOUDFLARE / BOT PROTECTION:\n"
    prompt += "- If you see 'Checking your browser', 'Just a moment', or CloudFlare challenge page\n"
    prompt += "- First attempt: WAIT 30 seconds in a SINGLE wait action\n"
    prompt += "- Do NOT click anything - the page will redirect after verification\n"
    prompt += "- If still on CloudFlare after 30s, refresh page and wait 40 seconds\n"
    prompt += "- If still stuck, refresh and wait 50 seconds, then 60 seconds\n"
    prompt += "- Maximum total wait: 80 seconds (30+40+50+60 with refreshes = stop after 80s total)\n"
    prompt += "- If a CAPTCHA appears, attempt to solve it if possible\n"
    prompt += "- After 80 seconds total, proceed anyway or report CloudFlare blocking issue\n\n"

    # Test inference section
    prompt += "=" * 80 + "\n"
    prompt += "TEST INFERENCE\n"
    prompt += "=" * 80 + "\n"
    prompt += "Based on the TEST GOAL, you must INFER:\n\n"

    prompt += "1. WHAT TO TEST:\n"
    prompt += "   - Identify the key user flows related to the goal\n"
    prompt += "   - Break down the goal into specific, testable steps\n"
    prompt += "   - Consider positive scenarios (happy path)\n"
    prompt += "   - Consider edge cases if obvious (empty inputs, invalid data)\n\n"

    prompt += "2. EXPECTED BEHAVIOR:\n"
    prompt += "   - Infer expected results based on standard UX patterns\n"
    prompt += "   - Forms should validate inputs and show errors/success\n"
    prompt += "   - Buttons should trigger appropriate actions\n"
    prompt += "   - Navigation should lead to expected destinations\n"
    prompt += "   - Data operations should reflect in the UI\n\n"

    prompt += "3. SUCCESS CRITERIA:\n"
    prompt += "   - The feature works as a reasonable user would expect\n"
    prompt += "   - No obvious errors, crashes, or broken functionality\n"
    prompt += "   - User can complete the intended flow\n\n"

    # Execution section
    prompt += "=" * 80 + "\n"
    prompt += "TEST EXECUTION\n"
    prompt += "=" * 80 + "\n"
    prompt += "Execute your inferred test steps:\n\n"

    prompt += "FOR EACH INFERRED STEP:\n"
    prompt += "1. STATE what you're testing and why\n"
    prompt += "2. STATE what you expect to happen\n"
    prompt += "3. EXECUTE the action\n"
    prompt += "4. OBSERVE the actual result\n"
    prompt += "5. COMPARE expected vs actual\n"
    prompt += "6. RECORD PASS if expected matches actual, FAIL if not\n\n"

    prompt += "EXAMPLE FORMAT:\n"
    prompt += "INFERRED STEP 1: [Description of what you're testing]\n"
    prompt += "  EXPECTED: [What should happen based on standard UX]\n"
    prompt += "  ACTION: [What you did]\n"
    prompt += "  OBSERVED: [What actually happened]\n"
    prompt += "  RESULT: [PASS/FAIL]\n\n"

    # Judgement section
    prompt += "=" * 80 + "\n"
    prompt += "JUDGEMENT CRITERIA\n"
    prompt += "=" * 80 + "\n"
    prompt += "Base your PASS/FAIL judgement on:\n"
    prompt += "- Does the feature work for its intended purpose?\n"
    prompt += "- Can a user complete the goal successfully?\n"
    prompt += "- Are there any blocking issues or errors?\n\n"

    prompt += "PASS if:\n"
    prompt += "- Core functionality works as expected\n"
    prompt += "- User can achieve the stated goal\n"
    prompt += "- No critical errors encountered\n\n"

    prompt += "FAIL if:\n"
    prompt += "- Core functionality is broken\n"
    prompt += "- User cannot complete the intended flow\n"
    prompt += "- Critical errors prevent goal completion\n\n"

    prompt += "IGNORE:\n"
    prompt += "- Minor visual/styling differences\n"
    prompt += "- Dynamic content (prices, timestamps, recommendations)\n"
    prompt += "- Non-blocking warnings that don't affect functionality\n\n"

    # Final verdict section
    prompt += "=" * 80 + "\n"
    prompt += "FINAL VERDICT\n"
    prompt += "=" * 80 + "\n"
    prompt += "Provide a structured verdict:\n\n"

    prompt += "NAVIGATION SUMMARY:\n"
    prompt += "- Started from: [initial page/state]\n"
    prompt += "- Navigated to: [where you reached]\n"
    prompt += "- Navigation successful: [Yes/No]\n\n"

    prompt += "INFERRED TEST STEPS:\n"
    prompt += "[List each step you inferred and tested]\n"
    prompt += "STEP 1: [description] - [PASS/FAIL]\n"
    prompt += "STEP 2: [description] - [PASS/FAIL]\n"
    prompt += "... (as many steps as you inferred)\n\n"

    prompt += "OBSERVATIONS:\n"
    prompt += "- What worked well: [list positives]\n"
    prompt += "- Issues found: [list any problems]\n"
    prompt += "- Edge cases tested: [list if any]\n\n"

    prompt += "OVERALL VERDICT: [PASS/FAIL]\n"
    prompt += "REASON: [1-2 sentence explanation based on goal achievement]\n"

    return prompt
