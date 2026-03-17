import sys, os, json

from tc_executor.logger_config import logger as system_logger
from tc_executor.executor import execute
from tc_executor.vision import getSS, getSim
from tc_executor.constants import SM_REMEMBERED_SCREEN_MATCHING_THRESHOLD

def backtrack(states, target_ss, delay_in_sec):
    curr_ss = getSS()
    sim = getSim(target_ss, curr_ss)
    system_logger.debug(f'sim(target_ss, curr_ss) - {sim} and threshold - {SM_REMEMBERED_SCREEN_MATCHING_THRESHOLD}')
    if sim >= SM_REMEMBERED_SCREEN_MATCHING_THRESHOLD: return True 
    for i in range(len(states)-1, -1, -1):
        before_ss = states[i].before_ss
        step, atomic_steps = states[i].step, states[i].atomic_steps
        sim = getSim(before_ss, curr_ss)
        system_logger.debug(f'Comparing state {i} with curr_ss and sim is - {sim}, \
                            with threshold {SM_REMEMBERED_SCREEN_MATCHING_THRESHOLD}')
        if sim >= SM_REMEMBERED_SCREEN_MATCHING_THRESHOLD:
            system_logger.debug(f'Executing the following step: \n{json.dumps(step, indent=2)}')
            execute(step, delay_in_sec=delay_in_sec)
            after_exec_after_ss = getSS()
            state_after_ss = states[i].after_ss
            sim_after_ss = getSim(after_exec_after_ss, state_after_ss)
            system_logger.debug(f'After execution - sim(after_exec_after_ss, state_after_ss): {sim_after_ss}')
            if sim_after_ss >= SM_REMEMBERED_SCREEN_MATCHING_THRESHOLD:
                system_logger.debug(f'state {i} executed successfully')
                return backtrack(states, target_ss, delay_in_sec)
            else:
                system_logger.debug(f'state {i} couldnt execute successfully')
                return backtrack(states, target_ss, delay_in_sec)
    system_logger.warning('Curr screenshot did not match with any of the prev screenshots')
    return False # do a fresh start when you return

