import os, sys, json, time, shutil
from tc_executor.constants import DATE_NOW, TIME_NOW 
from tc_executor.logger_config import logger as system_logger
from gcp_upload.log_states import uploadGeneratorState

class State:
    def __init__(self, state_id, root_dirpath,
                 before_ss, after_ss, before_ss_adb, after_ss_adb, combined_ss, 
                 step, atomic_steps, step_verifier_resp, 
                 user_goal, start_time, all_steps=[]):
        """
        Generator's state class.
        """
        self.user_goal = user_goal
        self.start_time = start_time
        self.state_id = state_id
        self.before_ss = before_ss
        self.after_ss = after_ss
        self.combined_ss = combined_ss
        self.before_ss_adb = before_ss_adb
        self.after_ss_adb = after_ss_adb
        self.step = step
        self.all_steps = all_steps
        self.atomic_steps = atomic_steps
        self.step_verifier_response = step_verifier_resp
        self.anomaly_detector_response = None
        self.expected_results = None
        self.backtracker_status = None
        self.get_next_step_prompt = ""
        self.step_verifier_prompt = ""
        self.anomaly_detector_prompt = ""
        self.expected_results_gen_prompt = ""
        
        self.test_case_id = -1
        self.test_case_under_execution_id = -1
        self.test_run_id = -1
        self.status = "EXECUTING" # PASSED / FAILED / EXECUTING / RETRYING
        self.gcp_root_path = ""
        self.before_ss_url = ""
        self.after_ss_url = ""
        self.execution_video_url = ""

        self.exceptions = []
        self.explanation = ""

        if (not step_verifier_resp) or step_verifier_resp['status']:
            self.outdirpath = os.path.join(root_dirpath, f'state_{state_id}')
        else:
            self.outdirpath = os.path.join(root_dirpath, f'state_{state_id}_unsuccessful')
        os.makedirs(self.outdirpath, exist_ok=True)

    def changeStatusToPass(self):
        """
        Sets the status from PASSED. Indicates that the test case has passed.
        """
        self.status = "PASSED"
    def changeStatusToFail(self):
        """
        Sets the status from FAILED. Indicates that the test case has failed.
        """
        self.status = "FAILED"
    def changeStatusToExecuting(self):
        """
        Sets the status to EXECUTING. Indicates that the test case is still executing
        """
        self.status = "EXECUTING"
    def changeStatusToRetrying(self):
        """
        Sets the status to RETRYING. Indicates that, something went wrong during the execution of blind run. Hence, retrying from the scratch.
        """
        self.status = "RETRYING"
    def changeStateToAttemptFailed(self):
        """
        Sets the status to ATTEMPT_FAILED. Indicates that the exception was raised while running the blind run
        """
        self.status = "ATTEMPT_FAILED"
    
    def addExplanation(self, explanation):
        """
        Saves Explanation behind test-case pass/fail to current state.

        Args:
            explanation (str): anomaly_detector_response for tc fail. next_step_gen_response for tc pass
        """
        self.explanation = explanation
    def addExceptions(self, exceptions):
        """
        Saves the exceptions to current state if raised any. Any exception raised results in attempt fail.

        Args:
            exceptions (List[str]): It can be timeout exception or assert fail exception, or retry exceeded exception. After multiple retries, the exceptions are appended in list and passed on to this function
        """
        self.exceptions = exceptions
    def addAnomalyDetectorResponse(self, response):
        """
        Adds Anomaly Detector response - checks whether the app responses as the human expects or not

        Args:
            response (Dict[str, Any]): Response returned by the anomaly_detector
        """
        self.anomaly_detector_response = response
    def addExpectedResults(self, expected_results):
        """
        Adds expected results gen response - Generated expected results for the current tc

        Args:
            expected_results (Dict[str, Any]): Response returned by the expected_results_gen module
        """
        self.expected_results = expected_results
    def addBacktrackerStatus(self, status):
        """
        Adds the backtracker status 

        Args:
            status (str): any string - whether the backtracker was able to backtrack or not
        """
        self.backtracker_status = status
    def addPrompts(self,
            get_next_step_prompt, step_verifier_prompt,
            anomaly_detector_prompt, 
            expected_results_gen_prompt):
        """
        Saves various prompts in the current state for debug purposes

        Args:
            get_next_step_prompt (str): next step gen prompt
            step_verifier_prompt (str): step varifier's prompt
            anomaly_detector_prompt (str): anomaly detector's prompt
            expected_results_gen_prompt (str): expcted results generator's prmpt

        Returns:
            None: Saves the prompts to state variables
        """
        self.get_next_step_prompt = get_next_step_prompt
        self.step_verifier_prompt = step_verifier_prompt
        self.anomaly_detector_prompt = anomaly_detector_prompt
        self.expected_results_gen_prompt = expected_results_gen_prompt
    def addIds(self, test_case_id, test_case_under_execution_id, test_run_id, product_id):
        """
        Saves various ids provided by the backend - test_case_id, test_case_under_execution_id, test_run_id, product_id.

        Returns:
            None: This function uses the ids to set the gcp path where the states will be logged.
        """
        self.test_case_id = test_case_id
        self.test_case_under_execution_id = test_case_under_execution_id
        self.test_run_id = test_run_id
        self.product_id = product_id
        self.gcp_root_path = f"{product_id}/{test_run_id}/{test_case_under_execution_id}/state_{self.state_id}"
        self.before_ss_url = os.path.join(self.gcp_root_path, 'before_ss.png')
        self.after_ss_url = os.path.join(self.gcp_root_path, 'after_ss.png')
        self.execution_video_url = os.path.join(
            f"{product_id}/{test_run_id}/{test_case_under_execution_id}", 'execution_video.mp4')

    def log(self, bucket_name='nova_assets', upload_to_gcp=False, video_url=""):
        """
        Logs the current state. Writes to following files
        1. log.json
        2. before_ss.png
        3. after_ss.png
        Other files are saved for debug purposes.

        Writes to local vm and also on gcp bucket - 'nova_assets'
        """
        def writeToFile(filepath, content):
            with open(filepath, 'w') as outfileobj:
                outfileobj.write(content)

        system_logger.debug(f'Logging state {self.state_id} in {self.outdirpath} directory')
        logfilepath = os.path.join(self.outdirpath, f'log.json')
        test_case = self.step
        test_case['expected_results'] = self.expected_results
        test_case['preconditions']=[]
        with open(logfilepath, 'w') as outfileobj:
            output_data = {
                "user_goal":self.user_goal,
                "time_spent_min": (time.time() - self.start_time)/60,
                "state_id": self.state_id,
                "all_steps": self.all_steps,
                "test_case": test_case,
                "executor_response" : json.dumps({"atomic_steps": self.atomic_steps}, indent=2),
                "step_verifier_response": self.step_verifier_response,
                "anomaly_detector_response": self.anomaly_detector_response,
                "backtracker_status": self.backtracker_status,

                "test_case_id": self.test_case_id,
                "test_case_under_execution_id": self.test_case_under_execution_id,
                "test_run_id": self.test_run_id,
                'product_id': self.product_id,
                'status': self.status,
                'before_ss_url':self.before_ss_url,
                'after_ss_url': self.after_ss_url,
                'execution_video_url': video_url,

                'exceptions': self.exceptions,
                'explanation': self.explanation
            }
            json.dump(output_data, outfileobj, indent=2)
        
        if self.state_id == 'final':
            debug_path = os.path.join(os.getcwd(), 'debug.log')
            shutil.copy(debug_path, os.path.join(self.outdirpath, 'debug.log'))
        
        """
        writeToFile(os.path.join(self.outdirpath, 'get_next_step_prompt.txt'), self.get_next_step_prompt)
        writeToFile(os.path.join(self.outdirpath, 'step_verifier_prompt.txt'), self.step_verifier_prompt)
        writeToFile(os.path.join(self.outdirpath, 'anomaly_detector_prompt.txt'), self.anomaly_detector_prompt)
        writeToFile(os.path.join(self.outdirpath, 'expected_results_gen_prompt.txt'),
                                                    self.expected_results_gen_prompt)
        self.combined_ss.save(os.path.join(self.outdirpath, 'combined_ss.png'))
        system_logger.debug(f'State {self.state_id} logged locally')
        """

        self.before_ss.save(os.path.join(self.outdirpath, 'before_ss.png'))
        self.after_ss.save(os.path.join(self.outdirpath, 'after_ss.png'))
        self.before_ss_adb.save(os.path.join(self.outdirpath, 'before_ss_adb.png'))
        self.after_ss_adb.save(os.path.join(self.outdirpath, 'after_ss_adb.png'))
        if upload_to_gcp:
            system_logger.info(f'Logging state on gcp bucket - {bucket_name}')
            uploadGeneratorState(
                local_dir_path = self.outdirpath,
                bucket_name=bucket_name,
                remote_dir_prefix=self.gcp_root_path
            )
            system_logger.info('Logging state on gcp bucket done')


            
