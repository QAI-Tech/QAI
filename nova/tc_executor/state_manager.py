from tc_executor.state import Mode
from tc_executor.logger_config import logger as system_logger
from tc_executor.templates import goBackTC
from tc_executor.backtracker import backtracker
from tc_executor.constants import SM_REMEMBERED_SCREEN_MATCHING_THRESHOLD
from tc_executor.utils import parseRememberedStates
from tc_executor.vision import getSS, getSim
from tc_executor.llm import geminiSingleImageQuery
from tc_executor.prompts import IS_BUFFER_STATE_PROMPT

import os, sys, json

class StateManager:
    def __init__(self, flow_dirpath):
        """  flow : list of test cases """
        flow_filepath = os.path.join(flow_dirpath, 'tcs.json')
        with open(flow_filepath, 'r') as infileobj:
            self.flow = json.load(infileobj)
        self.tc_under_exec_index = 0 # points to the unexecuted tc
        self.mode = Mode()
        self.states = []
        self.remembered_states = {}
        system_logger.debug(f'REMEMBERED_STATE_PATH: {flow_dirpath}')
        self.remembered_states = parseRememberedStates(flow_dirpath) 
        system_logger.debug(f'# remembered states: {len(self.remembered_states)}')

    def invalidateState(self, tc_id):
        system_logger.debug(f'Removing state {tc_id} from remembered states variable')
        del self.remembered_states[tc_id]

    def addState(self, state):
        self.states.append(state)

    def getAllValidBeforeSSs(self):
        before_sss = [state.executor_response['before_ss'] for state in self.states \
                        if (state.test_case_id >= 0)]
        test_case_ids = [state.test_case_id for state in self.states \
                        if (state.test_case_id >= 0)]
        return before_sss, test_case_ids

    def getCurrSimWithRememberedState(self):
        tc_id = self.tc_under_exec_index
        if tc_id not in self.remembered_states:
            system_logger.warning(f'state {tc_id} not in remembered_states')
            return None, None
        system_logger.debug(f'state {self.tc_under_exec_index} is available in remembered_states')
        remembered_state = self.remembered_states[tc_id]
        curr_ss = getSS()
        remembered_before_ss = remembered_state['before_ss']
        sim = getSim(curr_ss, remembered_before_ss)
        system_logger.debug(f'Sim(curr_ss, cache.before_ss) = {sim}')
        return sim, curr_ss

    def processBufferState(self):
        if self.mode.isBacktrackingMode():
            system_logger.debug('No need to check buffer state under backtracking mode')
            return None
        sim, curr_ss = self.getCurrSimWithRememberedState()
        if sim == None:
            system_logger.warning("")
            system_logger.warning(f'Sim is none, There are two possibilites')
            system_logger.warning('1. there is no buffer state, its just, we dont have it cached')
            system_logger.warning('2. it is a buffer state and curr ss, doesnt correspond to curr tcid under exec')
            system_logger.warning('we have to do an llm call to check if its a buffer state or not')
            system_logger.warning('For now lets assume the 1st case, its anyways imp to keep things in cache')
            system_logger.warning('Majority of states must be cached, hence assuming less chance of case 2 above')
            system_logger.warning('Procceding with normal exec, assuming, tc will cover the curr state')
            system_logger.warning("")
            return None
        if (sim <= SM_REMEMBERED_SCREEN_MATCHING_THRESHOLD):
            system_logger.debug(f'curr sim {sim} is less than {SM_REMEMBERED_SCREEN_MATCHING_THRESHOLD}')
            gemini_response = geminiSingleImageQuery(curr_ss, IS_BUFFER_STATE_PROMPT)
            system_logger.debug(f'llm resp on is_buffer_state: {json.dumps(gemini_response, indent=2)}')
            if gemini_response['status']:
                system_logger.warning('sending a synthetic tc - handle it yourself')
                self.mode.bufferStateModeOn()
                return gemini_response, -2, self.mode
            else:
                system_logger.debug('Current state is not buffer state hence moving on with normal mode execution')
                return None
        system_logger.debug('Current screen matches with remembered one, hence no buffer state')
        return None

    def getNextRememberedTC(self):
        sim, _ = self.getCurrSimWithRememberedState()
        if not sim: return None
        
        if sim > SM_REMEMBERED_SCREEN_MATCHING_THRESHOLD:
            system_logger.debug(f'found {sim} sim, hence, returning the remembered atomic_steps')
            self.mode.rememberModeOn()
            self.tc_under_exec_index += 1
            return self.remembered_states[self.tc_under_exec_index-1]['test_case'], \
                    self.tc_under_exec_index-1, self.mode
        system_logger.warning(f'found {sim} sim, hence, the current state did not match with remembered') 
        return None

    def resetMode(self):
        if self.mode.isRememberMode(): # rem mode should last only for 1 call of getNextTC 
            system_logger.debug('Current mode of execution is remember mode. Changing it to normal mode')
            self.mode.normalModeOn()
        if self.mode.isBufferStateMode(): # buffer mode should last only for 1 call of getNextTC 
            system_logger.debug('Current mode of execution is buffer state mode. Changing it to normal mode')
            self.mode.normalModeOn()

    def getNextTC(self):
        self.resetMode()
        system_logger.debug('Entered into state managers next state predictor module')
        system_logger.debug(f'tc_under_exec_index: {self.tc_under_exec_index}')

        buffer_state_output = self.processBufferState()
        if buffer_state_output: return buffer_state_output

        # execution over
        if self.tc_under_exec_index == len(self.flow):
            return None, None, None

        # starting the execution for first time
        if len(self.states) == 0: 
            output = self.getNextRememberedTC()
            if output: return output

            system_logger.debug('Entered for the first time, returning the 1st tc')
            self.tc_under_exec_index += 1
            return self.flow[self.tc_under_exec_index-1], self.tc_under_exec_index-1, self.mode

        system_logger.debug('Entered for more than 1st time')
        curr_state = self.states[-1]
        if self.mode.isNormalMode():
            system_logger.debug(f'Current mode of execution is Normal')
            if curr_state.verifier_response['status'] == True:
                output = self.getNextRememberedTC()
                if output: return output

                system_logger.debug('Vefier response is positive for last executed tc. returning in flow tc')
                tc = self.flow[self.tc_under_exec_index]
                self.tc_under_exec_index += 1
                return tc, self.tc_under_exec_index-1, self.mode
            else:
                system_logger.debug('Verifier response is negative. triggering goBackTc')
                self.mode.backtrackingModeOn()
                return goBackTC, -1, self.mode

        if self.mode.isBacktrackingMode():
            system_logger.debug('Current mode of execution is Backtracking mode')
            flow_screenshots, flow_ids = self.getAllValidBeforeSSs()
            after_ss = curr_state.executor_response['after_ss']
            backtracker_input = {
                'flow_screenshots': flow_screenshots,
                'flow_ids': flow_ids,
                'after_ss': after_ss
            }
            system_logger.debug('Calling backtracker for matching current state with previous ones')
            matching_index = backtracker(backtracker_input)
            if matching_index == -1: # current state not seen in past
                system_logger.debug('After executing back button, the current state doesnt match with prev ones')
                return goBackTC, -1, self.mode
            else:
                system_logger.debug('Curr state matched with previous state')
                system_logger.debug(f'Matched test case id: {matching_index}')
                self.tc_under_exec_index = matching_index
                output = self.getNextRememberedTC()
                if output: return output
                
                self.mode.normalModeOn()
                tc = self.flow[matching_index]
                self.tc_under_exec_index = matching_index + 1
                system_logger.debug('moving on with normal mode')
                return tc, matching_index, self.mode
