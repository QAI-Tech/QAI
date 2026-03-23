import argparse, os, sys, json, shutil

class ARGS:
    def __init__(self,
                 mode,
                 app_link,

                 test_case_id=None,
                 test_case_under_execution_id=None,
                 test_run_id=None,
                 product_id=None,
                 user_goal=None,
                 smoke_test_cases=None,
                 app_installation_time_sec: int = 240,
                 delay_in_sec: int = 18,
                 tc_dirpath: str = "flows",
                 app_name: str = "Faircado",
                 log_dirpath: str = "./executor_logs/",
                 email_format: str = "qai_agent_faircado_<UID>@yopmain.com",
                 time_out_in_mins: int = 40,
                 duration_per_image: int = 1,
                 fps: int = 30,
                 text_based_goal="",

                 ss_dirpath:str = None,
                 monkey_timeout_in_mins:int = 7,

                 monkey_run_output="",
                 user_goal_filepath='user_goals.txt',
                 monkey_n_smoke_test_output_dirpath=None,

                 video_url=None,
                 screens_list_url=None,
                 interactions=None,

                 EXPECTED_APP_BEHAVIOUR="No information available",
                 WHEN_TO_USE_WHICH_UI_ELEMENT = 'No information available',
                 environment='staging',  # default to staging if not provided

                 kg_gcp_path=None,
                 flows_gcp_path=None,
                 tc_flowid=None,
                 kg_version=None,
                 precon_flowids=None,
                 credentials={},
    ):
        self.test_case_id = test_case_id
        self.test_case_under_execution_id = test_case_under_execution_id
        self.test_run_id = test_run_id
        self.product_id = product_id
        self.user_goal = user_goal
        self.app_link = app_link
        self.app_installation_time_sec = app_installation_time_sec
        self.delay_in_sec = delay_in_sec
        self.delay_in_sec = 10 # TODO - only for local testing
        self.mode = mode
        self.tc_dirpath = tc_dirpath
        self.app_name = app_name
        self.log_dirpath = log_dirpath
        self.email_format = email_format
        #self.time_out_in_mins = time_out_in_mins
        self.time_out_in_mins = 40
        self.duration_per_image = duration_per_image
        self.fps = fps
        self.ss_dirpath = ss_dirpath
        self.monkey_timeout_in_mins = monkey_timeout_in_mins
        self.user_goal_filepath=user_goal_filepath
        self.monkey_n_smoke_test_output_dirpath=monkey_n_smoke_test_output_dirpath
        self.smoke_test_cases = smoke_test_cases
        self.monkey_run_output = monkey_run_output
        self.assert_semantics = False
        self.video_url = video_url
        self.screens_list_url = screens_list_url
        self.interactions = interactions
        self.EXPECTED_APP_BEHAVIOUR = EXPECTED_APP_BEHAVIOUR
        self.WHEN_TO_USE_WHICH_UI_ELEMENT = WHEN_TO_USE_WHICH_UI_ELEMENT
        self.environment = environment
        self.flows_gcp_path=flows_gcp_path
        self.kg_gcp_path = kg_gcp_path
        self.tc_flowid = tc_flowid
        self.kg_version = kg_version
        self.precon_flowids = precon_flowids
        self.credentials = credentials
        self.text_based_goal = text_based_goal
        
    def __repr__(self):
        return f"{self.__class__.__name__}(\n{json.dumps(self.__dict__, indent=2)}\n)" 

def returnMonkeyRunArgs(mode, req):
    product_id = req['product_id']
    product_name = req['product_name']
    executable_url = req['executable_url']
    test_run_id = req['test_run_id']
    args = ARGS(mode, executable_url, product_id=product_id, app_name=product_name, test_run_id=test_run_id)
    if 'app_installation_time_sec' in req: args.app_installation_time_sec = req['app_installation_time_sec']
    if 'delay_in_sec' in req: args.delay_in_sec = req['delay_in_sec']
    if 'monkey_timeout_in_mins' in req: args.monkey_timeout_in_mins=req['monkey_timeout_in_mins']
    return args

def parseInteractions(dts):
    out_dts = []
    for dt in dts:
        out_dt = {}
        out_dt['description'] = dt['step_description']
        out_dt['observed_results'] = dt['expected_results']
        out_dts.append(out_dt)
    return out_dts

def returnGoalFormulationAndExecutionArgs(mode, req):
    test_run_id = req['test_run_id']
    product_id, product_name = req['product_id'], req['product_name']
    executable_url = req['executable_url']
    WHEN_TO_USE_WHICH_UI_ELEMENT = req.get('WHEN_TO_USE_WHICH_UI_ELEMENT', 'No information available')
    EXPECTED_APP_BEHAVIOUR = req.get('EXPECTED_APP_BEHAVIOUR', 'No information available')
    environment = req.get('environment', 'staging')  # default to staging if not provided
    if environment == 'staging':
        kg_gcp_path = f'gs://graph-editor/qai-upload-temporary/productId_{product_id}/graph-export.json'
    else: kg_gcp_path = f'gs://graph-editor-prod/qai-upload-temporary/productId_{product_id}/graph-export.json'
    if environment == 'staging':
        flows_gcp_path = f'gs://graph-editor/qai-upload-temporary/productId_{product_id}/flows-export.json'
    else: flows_gcp_path = f'gs://graph-editor-prod/qai-upload-temporary/productId_{product_id}/flows-export.json'

    args_list = []
    for test_case_ref in req['test_case_reference']:
        kg_version = test_case_ref['kg_version']
        precon_flowids = test_case_ref['precon_flow_ids']
        test_case = json.loads(test_case_ref['test_case']) 
        video_url = None 
        screens_list_url = None
        interactions = {
            "title": test_case['title'],
            "preconditions": test_case['preconditions'],
            "test_case_description": test_case['test_case_description'],
            "test_case_steps": test_case['test_case_steps']
        }
        request_id = test_case['request_id']
        
        tcue_id = test_case_ref['tcue_id']
        test_case_id = test_case_ref['test_case_id']
        credentials = test_case_ref.get('credentials_value', {})
        args = ARGS(mode, executable_url, test_run_id=test_run_id, product_id=product_id, app_name=product_name,
                    video_url=video_url, screens_list_url=screens_list_url, interactions=interactions,
                    test_case_under_execution_id=tcue_id, test_case_id=test_case_id,
                    WHEN_TO_USE_WHICH_UI_ELEMENT=WHEN_TO_USE_WHICH_UI_ELEMENT, 
                    EXPECTED_APP_BEHAVIOUR=EXPECTED_APP_BEHAVIOUR, environment=environment,
                    kg_gcp_path=kg_gcp_path, flows_gcp_path=flows_gcp_path, tc_flowid=test_case['flow_id'], kg_version=kg_version, precon_flowids=precon_flowids,
                    credentials=credentials)
        if 'app_installation_time_sec' in req: args.app_installation_time_sec = req['app_installation_time_sec']
        if 'delay_in_sec' in req: args.delay_in_sec = req['delay_in_sec']
        if 'assert_semantics' in req: args.assert_semantics = req['assert_semantics']
        args_list.append(args)
    return args_list

def returnGoalBasedRunArgs(mode, req):
    product_id = req['product_id']
    product_name = req['product_name']
    executable_url = req['executable_url']
    environment = req['environment']
    text_based_goal = req['text_based_goal']

    args = ARGS(mode, executable_url, 
                product_id=product_id,
                app_name=product_name, 
                environment=environment,
                text_based_goal=text_based_goal)
    
    return [args]

def returnArgClassObj(testing_request):
    req = json.loads(testing_request)
    mode = req['mode']
    print(f'Current mode of execution - {mode}')

    if mode == 'MONKEY_RUN':
        return returnMonkeyRunArgs(mode, req)
    if mode == 'GOAL_FORMULATION_AND_EXECUTION':
        return returnGoalFormulationAndExecutionArgs(mode, req)
    if mode == 'EXECUTION':
        raise Exception("Execution mode implemented yet")
    if mode == 'GOAL_BASED_RUN':
        return returnGoalBasedRunArgs(mode, req)
    raise Exception(f'Entered mode is not supported - {mode}')

def validateArgs(args):
    for arg_list in args:
        # Flow IDs are only required for ANDROID platform (knowledge graph based execution)
        # WEB platform doesn't use knowledge graphs, so flow IDs are optional
        if hasattr(arg_list, 'platform') and arg_list.platform == 'ANDROID':
            #if len(arg_list.precon_flowids) == 0:
            #    raise Exception('current test case flow id is not present')
            if arg_list.kg_version == None:
                arg_list.kg_version = "something"
                return
                raise Exception('None kg_version is not handled yet in nova')
        # For WEB platform, set default values if not present
        elif hasattr(arg_list, 'platform') and arg_list.platform == 'WEB':
            if not hasattr(arg_list, 'precon_flowids') or arg_list.precon_flowids is None:
                arg_list.precon_flowids = []
            if not hasattr(arg_list, 'kg_version') or arg_list.kg_version is None:
                arg_list.kg_version = "not_applicable"

def parseArgs():
    parser = argparse.ArgumentParser(description="AutoExecution Parser")
    parser.add_argument('--testing_request',
                        type=str, help='A json string containing all necessary fields to run nova',
                        required=True)
    parser.add_argument('--platform', 
                        type=str, 
                        default='ANDROID',
                        choices=['ANDROID', 'WEB'],
                        help='Execution platform (ANDROID or WEB)')
    args = parser.parse_args()
    args_list = returnArgClassObj(args.testing_request)
    
    # Add platform to each args object
    for arg_obj in args_list:
        arg_obj.platform = args.platform
    
    print('\n', args_list, '\n')
    validateArgs(args_list)
    return args_list
