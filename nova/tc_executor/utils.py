import json, os, sys
from tc_executor.logger_config import logger as system_logger
from PIL import Image
from tc_executor.wait_command import ONE_SEC_WAIT

def addWait(tc_id, actions):
    system_logger.info('After every click, adding the wait command. double click may not work - check it')
    new_actions = []
    one_sec_waits = 0
    for action in actions:
        if ('input' in action) and ('action' in action['input']) and ('click' in action['input']['action']):
            new_actions.append(action)
            new_actions.append(ONE_SEC_WAIT)
            one_sec_waits += 1
            continue
        new_actions.append(action)
    system_logger.info(f'for tc {tc_id}, {one_sec_waits} number of wait commands are added')
    return new_actions

def parseRememberedStates(path):
    remembered_states = {}
    state_paths = [os.path.join(path, f) for f in os.listdir(path) ]
    state_paths = [f for f in state_paths if os.path.isdir(f)]
    for state_path in state_paths:
        system_logger.debug(f'Loading states from path - {state_path}')
        after_ss_path = os.path.join(state_path, 'after_ss.png')
        before_ss_path = os.path.join(state_path, 'before_ss.png')
        log_path = os.path.join(state_path, 'log.json')
        
        after_ss, before_ss = Image.open(after_ss_path), Image.open(before_ss_path)
        with open(log_path, 'r') as infileobj:
            log = json.load(infileobj)

        """
        if log['verifier_response'] == None: 
            system_logger.warning(f'state {log["test_case_id"]} has none verifier response')
            continue
        """
        test_case_id = log['test_case_id']
        atomic_steps = log['executor_response']['atomic_steps']
        #assert log['verifier_response']['status'], f'Remembered state is failed by verifier - {test_case_id}'
        
        remembered_states[test_case_id] = {
            'test_case': {
                'atomic_actions': addWait(test_case_id, atomic_steps),
                'expected_results': log['test_case']['expected_results']
            },
            'before_ss': before_ss,
            'after_ss': after_ss
        }
    return remembered_states
