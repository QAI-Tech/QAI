import os, sys, json

from tc_executor.state import State, Mode # classes
from tc_executor.state_manager import StateManager # classe
from tc_executor.executor import execute # method
from tc_executor.custom_logger import Logger # class
from tc_executor.output_verifier import verifyOutput # method

from tc_executor.logger_config import logger as system_logger
import os, sys, json, logging
import time

class Master:
    def __init__(self, logging_dirpath, tc_path, email_format):
        self.custom_logger = Logger(logging_dirpath)
        self.state_manager = StateManager(tc_path)
        self.email_format = email_format
        system_logger.info('Logger and State manager initialized')

    def startExecution(self, TIME_OUT_IN_MIN, delay_in_sec):
        curr_state = None
        start_time = time.time()
        while True:
            # get next test case
            tc, tc_id, mode = self.state_manager.getNextTC()
            if (tc == None) and (mode == None):
                system_logger.info(f'---- Execution complete ----')
                return True

            end_time = time.time()
            system_logger.info(f'Time spent so far - {(end_time-start_time)/60} mins')
            if ((end_time-start_time)/60) >= TIME_OUT_IN_MIN: 
                system_logger.error(f'TIMEOUT ERROR- {TIME_OUT_IN_MIN} min reached. Terminating the execution')
                raise RuntimeError(f'TIMEOUT ERROR- {TIME_OUT_IN_MIN} reached. Terminating the execution')
            
            system_logger.debug(f'Executing the following tc in {mode.getCurrMode()} mode\
                                \n{json.dumps(tc, indent=2)}')

            # execute test case
            executor_response = execute(tc, mode, self.email_format, delay_in_sec=delay_in_sec)

            # verify output response
            if mode.isNormalMode() or mode.isRememberMode():
                verifier_response = verifyOutput(tc, executor_response)
                if mode.isRememberMode() and (verifier_response['status'] == False):
                    system_logger.error(f'Remembered state {tc_id} is outdated')
                    system_logger.error(f'Consider removing state {tc_id} from disc')
                    self.state_manager.invalidateState(tc_id)
            else:
                system_logger.debug(f'Skipping verification module under mode: {mode.getCurrMode()}')
                verifier_response = {'status': True, 'rationale': 'skipped verification is always true'}

            # log current state
            curr_state = State(tc, tc_id, mode.getCurrMode(), executor_response, verifier_response)
            self.state_manager.addState(curr_state)
            self.custom_logger.log(curr_state)
            if verifier_response['status']==False:
                return False

def main(tc_path, logging_dirpath, email_format, TIME_OUT_IN_MIN=10, delay_in_sec=2):
    if os.path.isdir(logging_dirpath):
        system_logger.error(f'Logging dir - {logging_dirpath} already exists - delete it first')
        exit(0)
    master = Master(logging_dirpath, tc_path, email_format)
    return master.startExecution(TIME_OUT_IN_MIN, delay_in_sec)
