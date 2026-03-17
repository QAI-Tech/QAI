import os, json, shutil, time, copy
from tc_executor.master import main as executor_main
from tc_generator.main import main as generator_main
from tc_executor.constants import EMAIL_ID, PASSWORD, USERNAME, PROD_BUCKET_PREFIX, BUCKET_NAME, PRODUCTION_ENVIRONMENT
import sentry_sdk
from utils.create_executable_tcs import createExecutableTCs
from utils.arg_parser import parseArgs
from utils.utils import processFlowDir, printJudgement, logFinalState, saveVideoLocally, createNUploadVideo 
from utils.adb_utils import adbKillApp, adbOpenApp, adbInstallApp
from tc_executor.constants import SENTRY_DSN
from monkey_run_main import monkey_main
from goal_planner import goalPlannerMain
from gcp_upload.google_cloud_wrappers import GCPFileStorageWrapper
from utils.utils import nova_log, construct_bucket_name, storeKGSSs, fetchPreconFromKG

import requests

sentry_sdk.init(
    dsn=SENTRY_DSN,
    send_default_pii=True,
    traces_sample_rate=1.0,
)

def installApp(args):
    try: # install an app
        adbInstallApp(args)
    except Exception as e:
        nova_log(f'Terminating - Exception raised while installing an app', e)
        logFinalState("attempt_failed", args)
        exit(0)

def exploreUserGoal(args, auth_status, tc_ss_paths=[]):
    try:
        # installApp(args)
        is_tc_pass = None
        adbKillApp(args, auth_status)
        # adbOpenApp(args)
        nova_log('Calling the generator...')
        if os.path.exists(args.tc_dirpath):  shutil.rmtree(args.tc_dirpath) # log directory for generator
        if os.path.exists(f'{args.tc_dirpath}_raw'): shutil.rmtree(f'{args.tc_dirpath}_raw') # with unsucc states
        is_tc_pass, explanation, video_url = generator_main(args.tc_dirpath, args.user_goal, 
                                    args.email_format, args.time_out_in_mins,
                                    args.test_case_id, args.test_case_under_execution_id,
                                    args.test_run_id, args.product_id,
                                    args.delay_in_sec, args.assert_semantics,
                                    args.EXPECTED_APP_BEHAVIOUR, args.WHEN_TO_USE_WHICH_UI_ELEMENT, args.environment, args.interactions, 
                                    args.app_name, args.app_link, args.credentials, tc_ss_paths, args.precon_flowids)
        # processFlowDir(args.tc_dirpath)
        # createExecutableTCs(args.tc_dirpath)
        # createNUploadVideo(args)
        if video_url and "gs://" in video_url:
            video_url = "/".join(video_url.split("/")[3:])
        if (is_tc_pass == "passed"):
            logFinalState('pass', args, explanation=explanation, video_url=video_url)
            printJudgement('TC passed')
            return True, 'pass', explanation
        else:
            logFinalState('fail', args, explanation=explanation, video_url=video_url)
            printJudgement('TC failed')
            return False, 'fail', explanation
    except Exception as e:
        nova_log('Encountered an exception. Retrying to see if we can execute tc again - ', e)
        exception = str(e)
        nova_log('ERROR - user goal can not be acheieved - Exception raised!!')
        logFinalState("attempt_failed", args, exceptions=[exception])
        printJudgement('Attempt Failed')
        return None, 'attempt_failed', [exception]

def downloadFromGCP(args):
    if os.path.exists(args.monkey_n_smoke_test_output_dirpath):
        shutil.rmtree(args.monkey_n_smoke_test_output_dirpath)
    os.makedirs(args.monkey_n_smoke_test_output_dirpath, exist_ok=True)
    storage_wrapper = GCPFileStorageWrapper()
    bucket = construct_bucket_name(BUCKET_NAME, args.environment)
    storage_wrapper.download_latest_timestamp_dir(args.monkey_run_output,
                                  args.monkey_n_smoke_test_output_dirpath, bucket)
    nova_log(f'Donwloading to {args.monkey_n_smoke_test_output_dirpath} completed...')
    nova_log('Following files have been downloaded')
    nova_log(os.listdir(args.monkey_n_smoke_test_output_dirpath))

def formulateGCPFilepaths(prefix, local_dirpath):
    filenames = [f for f in os.listdir(local_dirpath) if '.png' in f]
    n = len(filenames)
    paths = []
    bucket = BUCKET_NAME + (PROD_BUCKET_PREFIX if args.environment == PRODUCTION_ENVIRONMENT else "")
    for i in range(n):
        filename = f'{i}.png'
        paths.append(f'https://storage.cloud.google.com/{bucket}/{prefix}/{filename}')
        assert filename in filenames, f"{filename} not found in {local_dirpath} directory"
    nova_log(f'GCP filepaths prepared - {json.dumps(paths, indent=2)}')
    return paths

def triggerSmokeTestPlanner(args, gcp_filepaths, gcp_prefix):
    nova_log('About to trigger smoke test planner...')
    url = "https://europe-west3-qai-tech-staging.cloudfunctions.net/RequestSmokeTestPlanning"
    headers = {
        "Content-Type": "application/json",
        "Authorization": "debug_token:12345"
    }
    payload = {
        "test_run_id": str(args.test_run_id),
        "product_id": str(args.product_id),
        "executable_url": args.app_link,
        "platform": "ANDROID",
        "design_frame_urls": gcp_filepaths,
        "monkey_run_output": gcp_prefix,
        "user_flow_video_urls": [],
        "input_test_cases": [],
        "acceptance_criteria": "",
        "product_name": args.app_name
    }

    response = requests.post(url, headers=headers, json=payload)
    nova_log(f"Status Code: {response.status_code}")
    nova_log("Response JSON:", response.json() if response.headers.get('Content-Type') == 'application/json' else response.text)

def fillPII(user_goal):
    user_goal = user_goal.replace('<USERNAME>', USERNAME)
    user_goal = user_goal.replace('<EMAIL_ID>', EMAIL_ID)
    user_goal = user_goal.replace('<PASSWORD>', PASSWORD)
    print('\n------ Updated Usergoal ------ ')
    print(user_goal, '\n')
    return user_goal

if __name__ == "__main__":
    try:
        args_list = parseArgs()
    except Exception as e:
        nova_log('Input request issue', e)
        exit(0)
    all_times = []
    for args in args_list:
        start = time.time()
        print('\n\n---- Processing the following argument list ----\n', args, '\n------------------------------\n\n')
        if args.mode == 'MONKEY_RUN':
            gcp_prefix = monkey_main(args)
            print('monkey run output saved in the following gcp prefix - ', gcp_prefix)
            gcp_filepaths = formulateGCPFilepaths(gcp_prefix, args.ss_dirpath)
            triggerSmokeTestPlanner(args, gcp_filepaths, gcp_prefix)
        if args.mode == 'GOAL_FORMULATION_AND_EXECUTION':
            root_kg_path, kg, flows = storeKGSSs(args)
            precon_actions, tc_actions, ss_paths, tc_ss_paths = fetchPreconFromKG(root_kg_path, args.precon_flowids, kg, flows)
            user_goal, auth_status = goalPlannerMain(args, precon_actions, tc_actions, ss_paths)
            user_goal = fillPII(user_goal)
            args.user_goal = user_goal
            
            # Route based on platform
            platform = getattr(args, 'platform', 'ANDROID')  # Default to ANDROID for backward compatibility
            nova_log(f'Platform: {platform}')
            
            if platform == 'WEB':
                # Web execution using browser-use
                nova_log('Starting WEB execution using browser-use...')
                from web_executor.main import execute_web_test
                execute_web_test(args, auth_status)
            else:
                # Android execution using DroidRun (existing flow)
                nova_log('Starting ANDROID execution using DroidRun...')
                exploreUserGoal(args, auth_status, tc_ss_paths)
            
            end = time.time()
            all_times.append(f'{json.loads(user_goal)["user_goal"]} - {round(end-start, 2)} secs')
        if args.mode == 'GOAL_BASED_RUN':
            platform = getattr(args, 'platform', 'ANDROID')  # Default to ANDROID for backward compatibility
            nova_log(f'Platform: {platform}')
            if platform == 'WEB':
                nova_log('Starting WEB execution using browser-use...')
                from web_executor.main import execute_test_based_goal
                execute_test_based_goal(args)
            else:
                nova_log('GOAL Based Run not implemented for ANDROID...')
                raise Exception('GOAL Based Run not implemented for ANDROID...')
            
        if args.mode == 'EXECUTION':
            raise Exception('Execution mode not implemented...')

    for goal_time in all_times:
        nova_log(f' ---- {goal_time} ---- ')
