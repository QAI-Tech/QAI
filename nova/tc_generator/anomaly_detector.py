import sys, os, json
from tc_executor.llm import geminiTwoImageQuery
from tc_executor.logger_config import logger as system_logger

from tc_generator.prompts import ANOMALY_AND_GOAL_REACHED_DETECTION_PROMPT, SEMANTIC_ASPECT

def printStatus(response):
    for i in range(5): system_logger.debug('-------------------------------------')
    if response['human_judgement']:
        system_logger.info('----- APP WORKS AS HUMANS EXPECT ----- PASS -----')
    else:
        system_logger.error('----- APP DOESNT WORK AS HUMANS EXPECT ----- FAIL -----')
    for i in range(5): system_logger.debug('-------------------------------------')

def anomalyDetector(state, user_goal, steps_taken, assert_semantics, EXPECTED_APP_BEHAVIOUR):
    system_logger.debug('Entered into anomaly || goal reached detector')
    before_ss, after_ss = state.before_ss, state.after_ss
    
    response_schema = {
        "type":"object",
        "properties": {
            "how_far_from_achieving_goal": {"type":"string"},
            "is_goal_reached": {"type":"boolean"},
            "human_judgement": {"type": "boolean"}
        },
        "required":["how_far_from_achieving_goal", 'is_goal_reached', "human_judgement"]
    }
    prompt = ANOMALY_AND_GOAL_REACHED_DETECTION_PROMPT
    if assert_semantics:
        prompt = prompt.replace('<SEMANTIC_ASPECT>', SEMANTIC_ASPECT)
    else:
        prompt = prompt.replace('<SEMANTIC_ASPECT>', "")
    

    prompt = prompt.replace('<EXPECTED_APP_BEHAVIOUR>', EXPECTED_APP_BEHAVIOUR)
    prompt = prompt.replace('<STEPS_TAKEN>', json.dumps(steps_taken, indent=2))
    prompt = prompt.replace('<USER_GOAL>', user_goal)
    system_logger.debug(f'ANOMALY_DETECTION_PROMPT: \n{prompt}')

    response = geminiTwoImageQuery(before_ss, after_ss, prompt, response_schema=response_schema)
    system_logger.debug(f'Anomaly detection response - {json.dumps(response, indent=2)}')

    printStatus(response)
    return response, prompt, response['human_judgement']

def verifyPrecondition(user_goal):
    system_logger.debug('Entered into precondition verifier')
    from tc_executor.vision import getSS
    from tc_executor.llm import geminiSingleImageQuery
    
    curr_ss = getSS()
    prompt = PRECONDITION_VERIFIER_PROMPT.replace('<USER_GOAL>', user_goal)
    
    response_schema = {
        "type": "object",
        "properties": {
            "status": {"type": "boolean"},
            "rationale": {"type": "string"}
        },
        "required": ["status", "rationale"]
    }
    
    response = geminiSingleImageQuery(curr_ss, prompt, response_schema=response_schema)
    system_logger.debug(f'Precondition verifier response - {json.dumps(response, indent=2)}')
    
    return response['status'], response['rationale']
