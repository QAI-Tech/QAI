import os, shutil, json, argparse
from PIL import Image
import logging

logging.getLogger("PIL").setLevel(logging.WARNING)
from io import BytesIO
from utils.utils import nova_log
import requests
import google.generativeai as genai
from tc_executor.constants import GOOGLE_API_KEY

genai.configure(api_key=GOOGLE_API_KEY)
GEMINI_MODEL_NAME = "gemini-2.5-flash"
gemini_client = genai.GenerativeModel(GEMINI_MODEL_NAME)
GenerationConfig = genai.GenerationConfig


def geminiMultiImageQuery(
    images,
    prompt,
    response_schema={
        "type": "object",
        "properties": {
            "rationale": {"type": "string"},
            "status": {"type": "boolean"},
        },
        "required": ["status", "rationale"],
    },
    retry=5,
):
    content = [prompt]
    if images:
        for img in images:
            img_bytes_io = BytesIO()
            img.convert("RGB").save(img_bytes_io, format="JPEG")
            img_bytes = img_bytes_io.getvalue()
            img_part = {"mime_type": "image/jpeg", "data": img_bytes}
            content.append(img_part)

    for i in range(retry):
        nova_log(f"Calling gemini for {i + 1} the time")
        try:
            response = gemini_client.generate_content(
                content,
                generation_config=GenerationConfig(
                    response_mime_type="application/json",
                    response_schema=response_schema,
                ),
            )
            return json.loads(response.text)
        except Exception as e:
            nova_log(f"Gemini raised exception", e)
            continue

    nova_log(f"Gemini raised exceptions for {retry} number of times")
    nova_log("Terminating the execution")
    raise Exception(f"Gemini raised exception for {retry} number of times, terminating")


def parseArgs():
    # required params
    parser = argparse.ArgumentParser(description="Monkeyrun Parser")
    parser.add_argument(
        "--monkey_n_smoke_test_output_dirpath",
        type=str,
        help="dir = smoke tests + monkey run results",
        required=True,
    )
    parser.add_argument(
        "--user_goal_filepath",
        type=str,
        help="where to save the user goals",
        required=True,
    )
    args = parser.parse_args()
    return args


def getSS(path):
    return Image.open(path)


def printUserGoal(dt):
    print("\n\n------------ User goal ------------")
    print(json.dumps(dt, indent=2))
    print("-----------------------------------")


# USER_GOAL_PROMPT for new approach
USER_GOAL_PROMPT = (
    "<TASK>\n",
        "You are provided a test case for a mobile application. ",
        "There is a computer program that takes a user goal and executes it in automated way. ",
        "You have to precisely formulate the user goal such that, the program can replicate the ",
        "same steps and execute the exact same flow\n",
        
        "A test case starts from a particular screen x. The information to reach screen x will also be provided - reachability_actions\n",
        "You will also be provided with an ordered list of screenshots corresponding to the preconditions and the actual test case\n",

        "You may or may not be provided with TO_BE_USED_CREDENTIALS. If you are not provided with the credentials, then use the ",
        'masking as per MASKING_ONLY_IF_NO_CREDENTIALS section. \n',
        'If you are provided with TO_BE_USED_CREDENTIALS then consider following scenarios. If the user goal involves - ',
        'registration or deleting an account then do not use TO_BE_USED_CREDENTIALS and instead use masks from MASKING_ONLY_IF_NO_CREDENTIALS. ',
        'For any other usergoal, use TO_BE_USED_CREDENTIALS. \n',
    "</TASK>\n\n",

    "<TO_BE_USED_CREDENTIALS>\n",
        '<CREDENTIALS>\n',
    "</TO_BE_USED_CREDENTIALS>\n\n",

    "<MASKING_ONLY_IF_NO_CREDENTIALS>\n",
        "You have to mask the following Personal Identifiable Information only if they are ",
        "explicitly provided with a value and to_be_used_credentials field is empty. \n",
        "email id - <EMAIL_ID>\n",
        "password - <PASSWORD>\n",
        "username - <USERNAME>\n",
    "</MASKING_ONLY_IF_NO_CREDENTIALS>\n\n",

    "<GENERATLIZATION_FROM_TEST_CASE_TO_USER_GOAL>\n",
        "1. The items listed keep reordering. So certain items may not be accessed by following the steps.\n",
            "Hence, keep the depth same - section->category->sub-category -> but keep the item general like - ",
            "choose the first item instead of specifying any specific name of the item.\n",
        "2. Similar goes with websites - a product can be available in any website like ebay, amazon, etc. ",
            "Hence do not hard code any particular website, instead keep it general\n",
        "3. The test steps involving typing a phrase may be broken down into multiple steps. e.g. - ",
            "type iph, type onesd, delete d, type 10, etc. You have to collate them and use only one command ",
            "like type iphone10 in user goal formulation\n",
        "4. For usergoals regarding liking a product, it is possible that a product is already liked hence ",
            "keep the user-goal general like - like an item which is not liked yet\n",
        "5. If you are provided with some example of UI elements to interact with, even then ",
            "strictly consider the corresponding UI element mentioned in the steps while returning the user goal. ",
            "With the user goal, we are trying to replicate the execution run provided in steps\n",
    "</GENERATLIZATION_FROM_TEST_CASE_TO_USER_GOAL>\n\n",

    "<OUTPUT_FORMAT>\n",
        "precondition_steps - sequence of actions to reach screen x. Make use of precondition actions and screenshots to create the list of preconditions. Precondition steps should consist of all the pre-requisite steps necessary to reach to the screen x.\n",
        "Auth_status - LOGGED_IN if precondition steps do not include the registration steps. Else ",
                "if precondition steps do include the registration steps(not the login steps), then LOGGED_OUT.\n",
        "UI_elements_involved - starting from the first test step, sequence of UI elements which will be ",
            "involved in end-to-end execution of the test case\n",
        "user_goal - the user goal that the tester will try to test on the app\n",
        "user_interactions - ordered list of all the interactions that the program will have on or after screen x",
            "while executing the test case, it includes clicks to ",
            "buttons, searching for keywords, typing on the keyboard, input field values, scrolling, ",
            "etc. Make use of TestCase actions and the screenshots to list out user interactions\n",
        "pass_and_fail_criteria - under what circumstances, should the test case be passed and failed. ",
            "Do not include Pass and fail criteria for intermediate step. Consider the overall ",
            "user journey and decide high level pass and fail criteria - one line each. To be precise - \n",
            "<CRITERIA_STRING>\n",
        "termination_condition - under what state of app, the program has to terminate the test case testing\n",
    "</OUTPUT_FORMAT>\n\n",

    "<INPUT>\n",
        "Test Case - <TEST_CASE>\n",
        "Precondition Actions - <PRECON_ACTIONS>\n",
        "TestCase Actions - <TC_ACTIONS>\n",
    "</INPUT>\n\n",
)
USER_GOAL_PROMPT = "".join(USER_GOAL_PROMPT)


def formulateUserGoal(assert_semantics, test_case, precon_actions, tc_actions, ss_paths, credentials):
    prompt = USER_GOAL_PROMPT
    prompt = prompt.replace("<TEST_CASE>", json.dumps(test_case, indent=2))
    prompt = prompt.replace('<PRECON_ACTIONS>', json.dumps(precon_actions, indent=2))
    prompt = prompt.replace('<TC_ACTIONS>', json.dumps(tc_actions, indent=2))
    prompt = prompt.replace('<CREDENTIALS>', json.dumps(credentials, indent=2))

    if assert_semantics:
        criteria_string = "Pass and fail criteria should consider both functionality and semantic aspect of the user journey. For example, if the user is testing out filters then after applying filters, the results must load - that is functionality aspect, the results shown must be consistent with the filters applied, this is semantic aspect."
    else:
        criteria_string = "Pass and fail criteria should only consider the functionality aspect of the user journey and not the semantic aspect. For example, after applying a filter, retrieval of results corresponds to functionality aspect but in this case, are the results relevant to the filters, that we are not checking which is a semantic aspect. In this scenario, strictly consider the functionality aspect only. Semantics should be ignored."
    prompt = prompt.replace("<CRITERIA_STRING>", criteria_string)
    nova_log(f'user-goal prompt - \n\n{prompt}\n\n')

    sss = []
    for ss_path in ss_paths:
        sss.append(Image.open(ss_path))

    response_schema = {
        "type": "object",
        "properties": {
            "precondition_steps": {"type": "array", "items": {"type": "string"}},
            "Auth_status": {"type": "string"},
            "UI_elements_involved": {"type": "array", "items": {"type": "string"}},
            "user_goal": {"type": "string"},
            "user_interactions": {"type": "array", "items": {"type": "string"}},
            "pass_and_fail_criteria": {"type": "string"},
            "termination_condition": {"type": "string"},
        },
        "required": [
            "precondition_steps",
            "UI_elements_involved",
            "Auth_status",
            "user_interactions",
            "user_goal",
            "pass_and_fail_criteria",
            "termination_condition",
        ],
    }
    response = geminiMultiImageQuery(sss, prompt, response_schema=response_schema)
    return response


def downloadScreenshot(screenshot_url, dirpath):
    """Download screenshot from URL and save to local directory"""
    if not screenshot_url:
        nova_log("No screenshot URL provided")
        return None

    try:
        # Create directory if it doesn't exist
        os.makedirs(dirpath, exist_ok=True)

        # Download the image
        response = requests.get(screenshot_url)
        response.raise_for_status()

        # Save to local file
        image_path = os.path.join(dirpath, "screenshot.png")
        with open(image_path, "wb") as f:
            f.write(response.content)

        nova_log(f"Downloaded screenshot to {image_path}")
        return image_path

    except Exception as e:
        nova_log(f"Error downloading screenshot: {e}")
        return None

def goalPlannerMain(args, precon_actions, tc_actions, ss_paths):
    outfileobj = open(args.user_goal_filepath, "w")
    user_goal = formulateUserGoal(args.assert_semantics, args.interactions, precon_actions, tc_actions, ss_paths, args.credentials)
    printUserGoal(user_goal)
    outfileobj.write(json.dumps(user_goal).replace("'", "") + "\n\n\n")
    outfileobj.close()
    return json.dumps(user_goal, indent=2), user_goal['Auth_status']

"""
if __name__ == '__main__':
    args = parseArgs()
    goalPlannerMain(args)
"""
