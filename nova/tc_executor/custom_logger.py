from tc_executor.logger_config import logger as system_logger
import os, sys, json
from tc_executor.constants import TIME_NOW, DATE_NOW
from gcp_upload.log_states import uploadExecutorState

class Logger:
    def __init__(self, rootdirpath):
        self.rootdirpath = os.path.join(rootdirpath, f"{DATE_NOW}_{TIME_NOW}")
        os.makedirs(self.rootdirpath, exist_ok = True)
        self.state_index = 0
        self.remembered_state_ids = set()

    def log(self, state):
        tc_id = state.test_case_id
        status = state.verifier_response['status'] if state.verifier_response else False
        suffix = ""
        if tc_id not in self.remembered_state_ids:
            if status and (tc_id >= 0):
                suffix = "_remember"
            self.remembered_state_ids.add(tc_id)
        
        system_logger.debug('Entered into custom logger')
        dirpath = os.path.join(self.rootdirpath, f'state_{self.state_index}{suffix}')
        self.state_index += 1
        os.makedirs(dirpath)
        output_dict = {
            'mode':state.mode,
            'test_case': state.test_case,
            'test_case_id': state.test_case_id,
            'executor_response': {
                'response': state.executor_response['response'],
                'atomic_steps': state.executor_response['atomic_steps']
            },
            'verifier_response': state.verifier_response
        }
        before_ss = state.executor_response['before_ss']
        after_ss = state.executor_response['after_ss']

        system_logger.debug('Saving the before and after screenshots')
        before_ss.save(os.path.join(dirpath, 'before_ss.png'))
        after_ss.save(os.path.join(dirpath, 'after_ss.png'))
        with open(os.path.join(dirpath, 'log.json'), 'w') as outfileobj:
            json.dump(output_dict, outfileobj, indent=2)
        system_logger.debug(f'Logging done in directory {dirpath}')
        
        system_logger.warning("!!!!!!!! Not logging the executor logs on gcp !!!!!!!!!") #TODO
        """
        # Commented to not changing the bucket name
        system_logger.info('Logging to gcp bucket - nova_assets')
        uploadExecutorState(
            local_dir_path = dirpath,
            bucket_name="nova_assets",
            remote_dir_prefix=dirpath
        )
        system_logger.info(f'Logging to gcp bucket done under dir under dir {dirpath}')
        """
