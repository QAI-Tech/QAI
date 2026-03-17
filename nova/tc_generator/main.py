import sys, os, json
import time
import asyncio

# Add droidrun to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../droidrun')))

# MailSlurp integration for email testing
from mailSlurp import get_client as get_mailslurp_client

from tc_executor.logger_config import logger as system_logger

from tc_generator.step_generator import singleStepGen
from tc_generator.anomaly_detector import anomalyDetector, verifyPrecondition
from tc_generator.expected_results_generator import getExpectedResults 
from utils.utils import construct_bucket_name
from utils.change_focus_to_emulator import focusToEmulator
from droidrun.cli.main import run_command, TestRunResult

from tc_executor.llm import geminiTwoImageQuery
from PIL import Image

from tc_generator.prompts import EXPECTED_RESULTS_FROM_IMAGES_PROMPT


def create_test_email_inbox():
    """
    Create a MailSlurp inbox for email verification during tests.

    Returns:
        dict: Contains 'email_address' and 'inbox_id' for the created inbox
    """
    try:
        client = get_mailslurp_client()
        inbox = client.create_inbox(prefix="qai_executor")
        system_logger.info(f"Created MailSlurp inbox: {inbox['emailAddress']}")
        return {
            "email_address": inbox["emailAddress"],
            "inbox_id": inbox["id"]
        }
    except Exception as e:
        system_logger.error(f"Failed to create MailSlurp inbox: {e}")
        return None


def convert_interactions_to_prompt(interactions, precondition_steps, credentials, app_name, tc_ss_paths):
    preconditions = precondition_steps
    steps = interactions.get('test_case_steps', [])
    test_case_description = interactions.get('test_case_description')

    # Create MailSlurp inbox for sign-up flows
    mailslurp_inbox = create_test_email_inbox()
    signup_credentials = {}
    if mailslurp_inbox:
        signup_credentials["email"] = mailslurp_inbox["email_address"]
        signup_credentials["mailslurp_inbox_id"] = mailslurp_inbox["inbox_id"]

    prompt = "Execute this UI/UX test case.\n"
    # prompt += "App:" + app_name + "\n"
     
    prompt += "To execute this test case, you must first navigate through the precondition steps \n"
    prompt += ""
    prompt += "to reach the test starting point, then execute the actual test case steps.\n\n"
    prompt += "================================================================================\n"
    prompt += "USER GOAL  \n"
    prompt += "================================================================================\n"
    prompt += test_case_description + "\n\n"

    if preconditions:
        prompt += "================================================================================\n"
        prompt += "PRECONDITION NAVIGATION  \n"
        prompt += "================================================================================\n"
        prompt += "These steps navigate you to the test case starting point. Execute each step\n"
        prompt += "successfully without verification. If any navigation step fails, abort the test.\n\n"
    
        for i, step in enumerate(preconditions, 1):
            prompt += f"NAVIGATE {i}: {step}\n"
        
        prompt += "\n"
        starting_point = interactions.get('starting_point', 'User is at the starting point ready for test execution')
        prompt += f"STARTING POINT: {starting_point}\n\n"
    if credentials or signup_credentials:
        prompt += "================================================================================\n"
        prompt += "CREDENTIALS\n"
        prompt += "================================================================================\n"
        prompt += "Use the following credentials for performing sign-up related steps (if part of preconditions or test case step or goal):\n"
        prompt += json.dumps(signup_credentials, indent=2) + "\n\n"
        prompt += "Use the following credentials for performing sign-in related steps/flow (if part of preconditions or test case step or goal):\n"
        prompt += json.dumps(credentials, indent=2) + "\n\n"
        prompt += "For SIGN-IN: Simply use the credentials above to log in.\n"
        prompt += "IMPORTANT - Email Verification Flow:\n"
        prompt += "If the test requires email verification (OTP code, verification link, confirmation email):\n"
        prompt += "1. Use the email address from sign-up credentials for registration in the app\n"
        prompt += "2. After submitting the sign-up form, call `get_email(email_address)`\n"
        prompt += "3. The function returns ONE of these formats:\n"
        prompt += "   - 'VERIFICATION_LINK: <url>' → Call `open_url(url)` to complete verification\n"
        prompt += "   - 'OTP_CODE: <digits>' → Type this code into the OTP field using `type(code, index)`\n"
        prompt += "   - 'ERROR: <message>' → Verification retrieval failed\n"
        prompt += "4. No need to manually extract codes - the function does it automatically!\n"
        prompt += "NOTE: The `get_email()` function waits up to 15 seconds for the email to arrive.\n"
        prompt += "\n"
    prompt += "================================================================================\n"
    prompt += "TEST CASE EXECUTION\n"
    prompt += "================================================================================\n"
    prompt += "Once at the starting point, execute and verify each step below.\n"
    prompt += "Report PASS or FAIL for each step with actual observations vs expected results.\n\n"
    prompt += "Try to attempt the complete test case even if the step fails but we are able to proceed with the USER GOAL.\n\n"
    prompt += "Verify the expected results from the overall screen. Avoid dynamically changing elements like texts, colours etc."        

    for i, step in enumerate(steps, 1):
        desc = step.get('step_description', '')
        expected = step.get('expected_results', [])
        
        prompt += f"STEP {i}: {desc}\n"
        if expected:
            expected_texts = expected if isinstance(expected, list) else [str(expected)]
            combined_expected = ", ".join(expected_texts)
            prompt += f"        EXPECTED: {combined_expected}\n"
            prompt += f"        VERIFY: Verify that Expected result is achieved. Do not take into account any dynamically changing elements of the screen like texts, images or colours\n"
            prompt += f"                Just Make sure the Page is similar to what was expected\n"
            prompt += "\n"
        
    prompt += "================================================================================\n"
    prompt += "JUDGEMENT CRITERIA\n"
    prompt += "================================================================================\n"
    prompt += "IMPORTANT: Your judgement of PASS or FAIL must be based ONLY on:\n"
    prompt += f"- The TEST CASE EXECUTION steps (STEP 1{f' to STEP {len(steps)}' if steps else ''})\n"
    prompt += "- The EXPECTED results for each step\n"
    prompt += "- The OBSERVED results during execution\n\n"
    prompt += "- Do not get swayed away in your desicion by dynamically changing elements of the screen like texts, images or colours\n"
    prompt += "- If you believe the screen is similar to what was expected, mark the step as PASS not considering the dynamic elements\n"

    prompt += "Do NOT base pass/fail judgement on the PRECONDITION NAVIGATION steps.\n"
    prompt += f"Navigation steps (NAVIGATE 1-{len(preconditions)}) are only for reaching the test starting point.\n\n"
    prompt += "- If you believe we are distracted from the goal, try to backtrack and verify the previous steps\n"
    
    prompt += "================================================================================\n"
    prompt += "FINAL VERDICT\n"
    prompt += "================================================================================\n"
    prompt += "After all steps, provide:\n"
    prompt += "- Individual step results (PASS/FAIL with observations for each TEST CASE step)\n"
    prompt += "- Overall test case result: PASS (all test steps passed) or FAIL (any test step failed)"
    
    return prompt


def convert_interactions_to_goal_driven_prompt(interactions, credentials, app_name, tc_ss_paths):
    steps = interactions.get('test_case_steps', [])
    starting_point = interactions.get('starting_point', 'User is at the starting point ready for test execution')
    application_context = interactions.get('application_context', f'{app_name} is a mobile application.')
    test_case_description = interactions.get('test_case_description')

    # Create MailSlurp inbox for sign-up flows
    mailslurp_inbox = create_test_email_inbox()
    signup_credentials = {}
    if mailslurp_inbox:
        signup_credentials["email"] = mailslurp_inbox["email_address"]
        signup_credentials["mailslurp_inbox_id"] = mailslurp_inbox["inbox_id"]

    prompt = "Execute this UI/UX test case.\n"
    # prompt += "App: " + app_name + "\n\n"

    prompt += "To execute this test case, you must reason about the current state of the app,\n"
    prompt += "navigate through the UI as needed to reach a suitable context, and then execute\n"
    prompt += "the test case steps to achieve the defined goal.\n\n"

    # prompt += "================================================================================\n"
    # prompt += "APPLICATION CONTEXT\n"
    # prompt += "================================================================================\n"
    # prompt += f"{application_context}\n\n"
    # prompt += "Users may encounter onboarding screens, authentication prompts, permission\n"
    # prompt += "dialogs, or may already be inside the app on an arbitrary screen.\n\n"

    prompt += "================================================================================\n"
    prompt += "GOAL-DRIVEN NAVIGATION (NO FIXED PRECONDITIONS)\n"
    prompt += "================================================================================\n"
    prompt += "There are NO guaranteed precondition steps.\n\n"
    prompt += "The test may start from:\n"
    prompt += "- The app launch screen\n"
    prompt += "- Onboarding or welcome screens\n"
    prompt += "- Authentication screens\n"
    prompt += "- Any intermediate or in-app screen\n\n"
    prompt += "You must:\n"
    prompt += "- Analyze the currently visible UI\n"
    prompt += "- Navigate through the app using visible UI elements\n"
    prompt += "- Handle interruptions (onboarding, login, permissions) minimally\n"
    prompt += "- Reach the defined GOAL CONTEXT (TARGET STATE)\n\n"
    prompt += "If it is not possible to reach such a state due to app limitations or blockers,\n"
    prompt += "abort the test and report failure with reasoning.\n\n"

    prompt += "================================================================================\n"
    prompt += "USER GOAL\n"
    prompt += "================================================================================\n"
    prompt += "The test case goal context is defined as:\n\n"
    prompt += f"{test_case_description}\n\n"

    if credentials or signup_credentials:
        prompt += "================================================================================\n"
        prompt += "CREDENTIALS\n"
        prompt += "================================================================================\n"
        prompt += "Use the following credentials for performing sign-up related steps (if part of preconditions or test case step or goal):\n"
        prompt += json.dumps(signup_credentials, indent=2) + "\n\n"
        prompt += "Use the following credentials for performing sign-in related steps/flow (if part of preconditions or test case step or goal):\n"
        prompt += json.dumps(credentials, indent=2) + "\n\n"
        prompt += "For SIGN-IN: Simply use the credentials above to log in.\n"
        prompt += "IMPORTANT - Email Verification Flow:\n"
        prompt += "If the test requires email verification (OTP code, verification link, confirmation email):\n"
        prompt += "1. Use the email address from sign-up credentials for registration in the app\n"
        prompt += "2. After submitting the sign-up form, call `get_email(email_address)`\n"
        prompt += "3. The function returns ONE of these formats:\n"
        prompt += "   - 'VERIFICATION_LINK: <url>' → Call `open_url(url)` to complete verification\n"
        prompt += "   - 'OTP_CODE: <digits>' → Type this code into the OTP field using `type(code, index)`\n"
        prompt += "   - 'ERROR: <message>' → Verification retrieval failed\n"
        prompt += "4. No need to manually extract codes - the function does it automatically!\n"
        prompt += "NOTE: The `get_email()` function waits up to 15 seconds for the email to arrive.\n"
        prompt += "\n"

    prompt += "================================================================================\n"
    prompt += "TEST CASE EXECUTION\n"
    prompt += "================================================================================\n"
    prompt += "Once you believe the GOAL CONTEXT has been reached, execute and verify each step below.\n"
    prompt += "Report PASS or FAIL for each step with actual observations vs expected results.\n\n"

    for i, step in enumerate(steps, 1):
        desc = step.get('step_description', '')
        expected = step.get('expected_results', [])
        expected = []
        
        prompt += f"STEP {i}: {desc}\n"
        if expected:
            expected_texts = expected if isinstance(expected, list) else [str(expected)]
            combined_expected = ", ".join(expected_texts)
            prompt += f"        EXPECTED: {combined_expected}\n"
            prompt += f"        VERIFY: Verify that {combined_expected}\n"
        prompt += "\n"
        
    prompt += "================================================================================\n"
    prompt += "JUDGEMENT CRITERIA\n"
    prompt += "================================================================================\n"
    prompt += "IMPORTANT: PASS or FAIL judgement must be based ONLY on:\n"
    prompt += f"- The TEST CASE EXECUTION steps (STEP 1{f' to STEP {len(steps)}' if steps else ''})\n"
    prompt += "- The EXPECTED results for each step\n"
    prompt += "- The OBSERVED results during execution\n\n"
    prompt += "Do NOT base judgement on:\n"
    prompt += "- Navigation attempts\n"
    prompt += "- Onboarding or authentication behavior\n"
    prompt += "- App startup behavior\n"
    prompt += "- Intermediate screens encountered while reaching the goal context\n\n"
    prompt += "If any test step fails verification, but we are able to reach the goal context, report PASS.\n"
    prompt += "Try to attempt the complete test case even if the step fails but we are able to proceed with the USER GOAL.\n\n"


    prompt += "================================================================================\n"
    prompt += "FINAL VERDICT\n"
    prompt += "================================================================================\n"
    prompt += "After all steps, provide:\n"
    prompt += "- Individual step results (PASS/FAIL with observations for each TEST CASE step)\n"
    prompt += "- Overall test case result: PASS (all test steps passed) or FAIL (any test step failed)"
    
    return prompt


def main(tc_dirpath, user_goal, email_format, TIME_OUT_IN_MIN,
         test_case_id, test_case_under_execution_id, test_run_id, product_id,
         delay_in_sec, assert_semantics, EXPECTED_APP_BEHAVIOUR, WHEN_TO_USE_WHICH_UI_ELEMENT, environment, 
         interactions, app_name, app_link, credentials, tc_ss_paths, precon_flowids):
    start_time = time.time()
    states = []
    state_id = 0

    prev_step, prev_step_verifier_response = None, None
    last_step, last_step_verifier_response = None, None
    steps_taken = []
    explanation = ""
    
    user_goal_in_json = json.loads(user_goal)
    precondition_steps = user_goal_in_json.get('precondition_steps', [])
    print("I will print precondition for life: ", precondition_steps, len(precon_flowids))
    if interactions:
        if len(precon_flowids) > 1:
            user_goal = convert_interactions_to_prompt(interactions, precondition_steps, credentials, app_name, tc_ss_paths)
        else:
            user_goal = convert_interactions_to_goal_driven_prompt(interactions, credentials, app_name, tc_ss_paths)

        system_logger.info(f"Generated user goal from interactions: {user_goal}")

    print("User Goal is \n", user_goal)

    # Construct bucket name with environment suffix (e.g., nova_assets-prod for production)
    gcp_bucket = construct_bucket_name("nova_assets", environment)

    result: TestRunResult = asyncio.run(run_command(
        command=user_goal,
        device="emulator-5554",
        model="models/gemini-2.5-flash",
        provider="GoogleGenAI",
        vision=True,
        steps=100,
        save_trajectory="action",
        product_id=product_id,
        test_run_id=test_run_id,
        test_case_id="test_case_id",
        tcue_id=test_case_under_execution_id,
        app_name=app_name,
        app_link=app_link,
        gcp_bucket=gcp_bucket,
    ))

    return result.status, result.final_reason, result.video_url
    # return "passed", "TC is passed brother"
    # while True:
    #     # focusToEmulator() #TODO
    #     is_step_possible, step_gen_output = singleStepGen(states, state_id, tc_dirpath, user_goal, email_format,
    #                                       prev_step, prev_step_verifier_response,
    #                                       last_step, last_step_verifier_response,
    #                                       steps_taken, delay_in_sec, start_time, WHEN_TO_USE_WHICH_UI_ELEMENT)
    #     end_time = time.time()
    #     time_spent_min = (end_time-start_time)/60
    #     system_logger.info(f'Time spent so far - {time_spent_min} mins')
    #     if ((end_time-start_time)/60) >= TIME_OUT_IN_MIN: 
    #         system_logger.error(f'{TIME_OUT_IN_MIN} reached. Terminating the blind run')
    #         raise RuntimeError(f"{TIME_OUT_IN_MIN} mins reached. Terminating the blind run")
        
    #     state_id += 1
    #     prev_step, prev_step_verifier_response = step_gen_output[0], step_gen_output[1]
    #     last_step, last_step_verifier_response = step_gen_output[2], step_gen_output[3]
    #     step_gen_is_successful = step_gen_output[4]
    #     get_next_step_prompt, step_verifier_prompt = step_gen_output[5], step_gen_output[6]
    #     steps_taken.append(step_gen_output[7])
    #     is_precondition = step_gen_output[8]

    #     if not step_gen_is_successful:
    #         system_logger.info('Step gen is not successful, hence continuing again on step_gen process')
    #         continue
    #     else:
    #         system_logger.info('Step gen is successful and hence moving with expected result gen & ver')

    #     if is_precondition:
    #         system_logger.info('Skipping anomaly detector for precondition step')
    #         anomaly_detector_response, anomaly_detector_prompt, human_jdgment = {'is_goal_reached': False, 'how_far_from_achieving_goal': 'Precondition step, goal not reached', 'human_judgement': True}, "", True
    #     else:
    #         anomaly_detector_response, anomaly_detector_prompt, human_jdgment = anomalyDetector(states[-1],
    #                                                                             user_goal,steps_taken,
    #                                                                             assert_semantics,
    #                                                                             EXPECTED_APP_BEHAVIOUR)
    #     states[-1].addAnomalyDetectorResponse(anomaly_detector_response)

    #     expected_results, expected_results_gen_prompt = [], ""
    #     states[-1].addExpectedResults(expected_results)
    #     states[-1].addPrompts(
    #         get_next_step_prompt, step_verifier_prompt,
    #         anomaly_detector_prompt, 
    #         expected_results_gen_prompt
    #     )
    #     states[-1].addIds(test_case_id, test_case_under_execution_id, test_run_id, product_id)
    #     bucket_name = construct_bucket_name("nova_assets", environment)
    #     states[-1].log(bucket_name=bucket_name) #TODO let's not log for now
    #     if anomaly_detector_response['is_goal_reached']:
    #         explanation = anomaly_detector_response['how_far_from_achieving_goal']
    #         break
        
    #     if (human_jdgment == False): 
    #         return False, anomaly_detector_response['how_far_from_achieving_goal']

        

    system_logger.info('----- User goal reached -----')
    return True, explanation
