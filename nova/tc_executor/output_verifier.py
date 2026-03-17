from tc_executor.logger_config import logger as system_logger
from tc_executor.llm import geminiSingleImageQuery
from tc_executor.prompts import OUTPUT_VERIFIER_PROMPT
import json, os, sys, logging

def verifyOutput(tc, executor_response):
    system_logger.debug(f'entered into output verifier')
    global OUTPUT_VERIFIER_PROMPT
    
    before_ss = executor_response['before_ss']
    after_ss = executor_response['after_ss']
    executor_response_text = executor_response['response']
    expected_results = tc['expected_results']
    if len(expected_results) == 0: return {'status':True, 'rationale':"Nothing to check"}

    output_verifier_prompt = OUTPUT_VERIFIER_PROMPT\
                                .replace('<EXPECTED_RESULTS>', json.dumps(expected_results, indent=1))
    system_logger.debug(f'Output verifier prompt:\n{output_verifier_prompt}')
    system_logger.debug('Calling gemini query for verification of ss and expected outcome')
    response = geminiSingleImageQuery(after_ss, output_verifier_prompt)
    system_logger.debug(f'verifier response: {json.dumps(response, indent=2)}')
    
    status, rationale = response['status'], response['rationale']
    system_logger.debug('Verifier fxn executed succesfully')
    system_logger.debug('----------------------------------')
    system_logger.debug(f'|             {status}              |')
    system_logger.debug('----------------------------------')
    return {'status':status, 'rationale':rationale}

#TODO - output verifier fails for account creation stuff due - guardrails
