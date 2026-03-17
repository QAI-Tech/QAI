import sys, os, json, subprocess

from tc_executor.logger_config import logger as system_logger
from tc_executor.llm import geminiSingleImageQuery, geminiTwoImageQuery
from tc_executor.vision import getSS, stackSSsHorizontally
from tc_executor.backtracker import backtracker
from tc_executor.executor import execute
from tc_executor.templates import goBackTC
from tc_executor.constants import DATE_NOW, TIME_NOW

from tc_generator.backtracker import backtrack
from tc_generator.state import State
from tc_generator.prompts import GET_NEXT_STEP_PROMPT, STEP_VERIFIER_PROMPT
from tc_generator.prompts import GET_ALL_NEXT_STEPS_PROMPT, CHOOSE_STEP_PROMPT
from tc_generator.prompts import IS_GOAL_REACHED_PROMPT
from utils.cache import lru_cache
from utils.adb_utils import adbDumpUI
import time
  
def explorer(wrong_step=None, wrong_step_verifier_response=None,
                    last_step=None, last_step_verifier_response=None, user_goal="Explore the app",
                    email_format="agent+<UID>@qaitech.ai", steps_taken=[],
                    WHEN_TO_USE_WHICH_UI_ELEMENT="No inforamtion available"):
    system_logger.debug(f'Entered into single step eplorer function...')
    before_ss = getSS()
    before_ss_adb = getSS(is_adb=True)
    response_schema = {
        "type":"object",
        "properties": {
            "step_description": {"type":"string"},
            "test_case_description": {"type":"string"},
            "is_adb_step": {"type": "boolean"},
            "is_verification_needed": {"type":"boolean"},
            "step_cachable_keywords": {"type": "array", "items": {"type": "string"}},
            "is_precondition": {"type":"boolean"}
},
        "required":["test_case_description", "step_description", "is_verification_needed", "step_cachable_keywords", 'is_precondition', 'is_adb_step']
    }
    email_id = email_format.replace('<UID>', f'{DATE_NOW}_{TIME_NOW}' )
    prompt = GET_NEXT_STEP_PROMPT
    prompt = prompt.replace('<USER_GOAL>', user_goal)
    prompt = prompt.replace('<STEPS_TAKEN>', json.dumps(steps_taken, indent=2))
    prompt = prompt.replace('<WHEN_TO_USE_WHICH_UI_ELEMENT>', WHEN_TO_USE_WHICH_UI_ELEMENT)
    prompt = prompt.replace('<SCREEN_XML>', json.dumps(adbDumpUI(), indent=2))

    system_logger.debug(f'GET_NEXT_STEP_PROMPT: \n{prompt}')
    step = geminiSingleImageQuery(before_ss, prompt, response_schema=response_schema)
    system_logger.debug(f'geminiSingleImageQuery resonse:\n {json.dumps(step, indent=2)}')

    action_bow = step.pop('step_cachable_keywords')
    is_adb_step = step.pop('is_adb_step')
    if not is_adb_step:
        instructions, screen_bow = lru_cache.query_cache(action_bow)
        if instructions:
            step = {
                "test_case_description": "Execute the following instructions without thinking and also do not take screenshot. Between every action sleep for 0.5 seconds",
                "step_description": instructions,
                "is_verification_needed": step['is_verification_needed'],
                "is_precondition": step['is_precondition']
            }
        return step, before_ss, before_ss_adb, prompt, screen_bow, action_bow, is_adb_step
    return step, before_ss, before_ss_adb, prompt, None, None, is_adb_step

def stepVerifier(step, before_ss):
    system_logger.debug('Entered into step verifier')
    after_ss = getSS()
    after_ss_adb = getSS(is_adb=True)
    combined_ss = stackSSsHorizontally(before_ss, after_ss)
    prompt = STEP_VERIFIER_PROMPT
    prompt = prompt.replace('<STEP_TAKEN>', json.dumps(step, indent=2))
    system_logger.debug(f'STEP_VERIFIER_PROMPT: \n{prompt}')
    step_verifier_response = geminiTwoImageQuery(before_ss, after_ss, prompt)
    system_logger.debug(f'step_verifier_responses: \n{json.dumps(step_verifier_response, indent=2)}')
    return step_verifier_response, after_ss, after_ss_adb, combined_ss, prompt

def printSuccess():
    for i in range(5):
        system_logger.debug('----------------------------------------')
    system_logger.debug('--- TC explored successfully ---')
    for i in range(5):
        system_logger.debug('----------------------------------------')

def executeAdbCommands(command_string, delay_in_sec):
    system_logger.debug(f'Executing the following seq of actions - {command_string}')
    before_ss = getSS()
    subprocess.run(command_string, shell=True, check=True)
    system_logger.debug(f'Waiting for {delay_in_sec} time after executing the claude commands')
    time.sleep(delay_in_sec)
    after_ss = getSS()
    return {
        "before_ss": before_ss,
        "after_ss": after_ss,
        "response": f'Executed the following adb command - {command_string}',
        "atomic_steps": "no atomic steps"
    }
    

def singleStepGen(states, # May or may not be updated
                  state_id, tc_dirpath, user_goal, email_format, 
                  prev_step, prev_step_verifier_response,
                  last_step, last_step_verifier_response,
                  steps_taken, delay_in_sec, start_time,
                  WHEN_TO_USE_WHICH_UI_ELEMENT):
    system_logger.info('--------- STEP_GENERATION PROCESS START ---------')
    step, before_ss, before_ss_adb, get_next_step_prompt, screen_bow, action_bow, is_adb_step = explorer(prev_step, prev_step_verifier_response, 
                                                                                    last_step, last_step_verifier_response, 
                                                                                    user_goal, email_format, steps_taken,
                                                                                    WHEN_TO_USE_WHICH_UI_ELEMENT)
    
    verification_needed = step.pop('is_verification_needed')
    is_precondition = step.pop('is_precondition')
    if not is_adb_step: executor_response = execute(step, delay_in_sec=delay_in_sec)
    else: executor_response = executeAdbCommands(step['step_description'], delay_in_sec)
    
    atomic_steps = executor_response['atomic_steps']
    if not is_adb_step:
        lru_cache.add_entry(screen_bow, action_bow, atomic_steps)
    if verification_needed and not is_precondition:
        step_verifier_response, after_ss, after_ss_adb, combined_ss, step_verifier_prompt = stepVerifier(step, before_ss)
    else:
        step_verifier_response, after_ss, after_ss_adb, combined_ss, step_verifier_prompt = None, getSS(), getSS(is_adb=True), getSS(), ""
    
    state = State(state_id, tc_dirpath, before_ss, after_ss, before_ss_adb, after_ss_adb, combined_ss, 
                  step, executor_response['atomic_steps'], step_verifier_response, user_goal, start_time,
                  all_steps=[])
    states.append(state)
    
    is_success = True
    if step_verifier_response:
        if step_verifier_response['status'] == True:
            system_logger.debug('Step verifier approved the step and its execution. Moving on to next screen')
            states.append(state)
            prev_step, prev_step_verifier_response = None, None
            last_step, last_step_verifier_response = step, step_verifier_response
            printSuccess()
            is_success = True
        else:
            is_success = False
            system_logger.debug('Step verifier didnt approve the step/execution. Starting the backtracker')
            system_logger.debug('Executing the gobackTC')
            execute(goBackTC, delay_in_sec=delay_in_sec)
            state.addBacktrackerStatus("Backtracker was able to reach where we left of")
            prev_step, prev_step_verifier_response = step, step_verifier_response
    system_logger.info('--------- STEP_GENERATION PROCESS END ---------')
    return True, (prev_step, prev_step_verifier_response, \
           last_step, last_step_verifier_response, \
           is_success, \
           get_next_step_prompt, step_verifier_prompt, \
           step['test_case_description'], is_precondition)



"""
def twoStepExplorer(wrong_step=None, wrong_step_verifier_response=None,
                    last_step=None, last_step_verifier_response=None, user_goal="Explore the app",
                    email_format="agent+<UID>@qaitech.ai", steps_taken=[],
                    WHEN_TO_USE_WHICH_UI_ELEMENT="No inforamtion available"):
    system_logger.debug('Entered into two step explorer function...')
    before_ss = getSS()
    
    response_schema = {
        "type":"object",
        "properties": {
            "how_far_from_achieving_goal": {"type":"string"},
            "is_goal_reached": {"type":"boolean"}
        },
        "required":["how_far_from_achieving_goal", 'is_goal_reached']
    }
    prompt0 = IS_GOAL_REACHED_PROMPT
    prompt0 = prompt0.replace('<USER_GOAL>', user_goal)
    prompt0 = prompt0.replace('<STEPS_TAKEN>', json.dumps(steps_taken, indent=2))
    system_logger.debug(f"IS_GOAL_REACHED_PROMPT: \n{prompt0}")
    response = geminiSingleImageQuery(before_ss, prompt0, response_schema=response_schema)
    system_logger.debug(f'IS_GOAL_REACHED_PROMPT response - {json.dumps(response, indent=2)}')
    if response['is_goal_reached'] == True:
        system_logger.debug('User goal is achieved, no more steps to be taken')
        return {'status':False, 'step_description':"", "test_case_description":""}, before_ss, prompt0, response

    response_schema={    "type": "object",
                         "properties": {
                             "all_steps_possible": {
                                    "type": "array",
                                    "items": {"type": "string"}},
                         }, "required": ["all_steps_possible"]}
    prompt = GET_ALL_NEXT_STEPS_PROMPT
    email_id = email_format.replace('<UID>', f'{DATE_NOW}_{TIME_NOW}' )
    prompt = prompt.replace('<EMAIL_ID>', email_id)
    prompt = prompt.replace('<USER_GOAL>', user_goal)
    prompt = prompt.replace('<STEPS_TAKEN>', json.dumps(steps_taken, indent=2)) 
    system_logger.debug(f'GET_ALL_NEXT_STEPS_PROMPT: \n{prompt}')
    all_steps = geminiSingleImageQuery(before_ss, prompt, response_schema=response_schema)
    system_logger.debug(f'geminiSingleImageQuery resonse:\n {json.dumps(all_steps, indent=2)}')

    response_schema = {
        "type":"object",
        "properties": {
            "test_case_description": {"type":"string"},
            "step_description": {"type":"string"},
            "status": {"type":"boolean"}
        },
        "required":["test_case_description", "step_description", "status"]
    }
    prompt2 = CHOOSE_STEP_PROMPT
    prompt2 = prompt2.replace('<WHEN_TO_USE_WHICH_UI_ELEMENT>', WHEN_TO_USE_WHICH_UI_ELEMENT)
    prompt2 = prompt2.replace('<USER_GOAL>', user_goal)
    prompt2 = prompt2.replace('<ALL_STEPS>', json.dumps(all_steps['all_steps_possible'], indent=2))
    prompt2 = prompt2.replace('<STEPS_TAKEN>', json.dumps(steps_taken, indent=2)) 
    system_logger.debug(f'CHOOSE_STEP_PROMPT: \n{prompt2}')
    step = geminiSingleImageQuery(before_ss, prompt2, response_schema=response_schema)
    step['status'] = True
    system_logger.debug(f'geminiSingleImageQuery resonse:\n {json.dumps(step, indent=2)}')
    return step, before_ss, prompt0 +  '\n---------\n' + prompt + '\n--------\n' + prompt2, all_steps
"""
