from tc_executor.prompts import EXECUTOR_PROMPT, ATOMIC_EXECUTOR_PROMPT, BUFFER_STATE_EXECUTION_PROMPT
import json, os, sys, logging
from tc_executor.executors.claude_computer.claude_computer import claudeComputer
from tc_executor.logger_config import logger as system_logger
from tc_executor.vision import getSS
from tc_executor.state import Mode
from tc_executor.constants import DATE_NOW, TIME_NOW
import time

def execute(test_case, mode=Mode(), email_format="agent_<UID>@qaitech.ai", delay_in_sec=2):
    system_logger.debug('Entered into Execute function')
    if mode.isNormalMode():
        system_logger.debug('Using the normal long prompt')
        prompt = EXECUTOR_PROMPT.replace('<TC_STRING>', json.dumps(test_case, indent=1))
    if mode.isBacktrackingMode():
        system_logger.debug('Using the atomic action prompt for backtracking')
        prompt = ATOMIC_EXECUTOR_PROMPT.replace('<TC_STRING>', json.dumps(test_case, indent=1))
    if mode.isRememberMode():
        system_logger.debug('Using the atomic action prompt for remembering')
        prompt = ATOMIC_EXECUTOR_PROMPT.replace('<TC_STRING>', json.dumps(test_case['atomic_actions'],indent=1))
        system_logger.debug('----- Remembering prompt -----')
        system_logger.debug(prompt)
        system_logger.debug('---------------------------------')
    if mode.isBufferStateMode():
        system_logger.debug('Using buffer_state_execution_prompt for buffer state execution')
        prompt = BUFFER_STATE_EXECUTION_PROMPT.replace('<EXISTENCE_RATIONALE>', test_case['rationale'])
        system_logger.debug('------ Buffer state execution prompt -------')
        system_logger.debug(prompt)
        system_logger.debug('--------------------------------------------')

    before_ss = getSS()
    system_logger.setLevel(logging.ERROR)
    response, atomic_steps = claudeComputer(prompt)
    system_logger.setLevel(logging.DEBUG)
    system_logger.debug(f'Waiting for {delay_in_sec} time after executing the claude commands')
    time.sleep(delay_in_sec)
    after_ss = getSS()
    
    system_logger.debug('Claude computer execution complete')
    system_logger.debug(f'Response: {response}')
    return {
        "before_ss": before_ss,
        "after_ss": after_ss,
        "response": response,
        "atomic_steps": atomic_steps
    }
