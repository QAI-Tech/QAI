import sys, os, json
from tc_executor.logger_config import logger as system_logger
from tc_executor.llm import geminiTwoImageQuery
from tc_executor.output_verifier import verifyOutput 

from tc_generator.prompts import EXPECTED_RESULTS_GEN_PROMPT

def getExpectedResults(state, user_goal, retries=5):
    system_logger.info('Entered into get expected results function...')
    before_ss, after_ss = state.before_ss, state.after_ss
    step, step_verifier_response = state.step, state.step_verifier_response
    anomaly_detector_response = state.anomaly_detector_response
    ground_truth = state.anomaly_detector_response['status']
    wrong_expected_results, output_verifier_responses = [], []

    for i in range(retries):
        system_logger.debug(f'Trying for {i}th time')
        prompt = EXPECTED_RESULTS_GEN_PROMPT
        prompt = prompt.replace('<USER_GOAL>', user_goal)
        prompt = prompt.replace('<STEP_TAKEN>', json.dumps(step, indent=2))
        prompt = prompt.replace('<STEP_VERIFIER_RESPONSE>', json.dumps(step_verifier_response, indent=2))
        prompt = prompt.replace('<ANOMALY_DETECTOR_RESPONSE>', json.dumps(anomaly_detector_response, indent=2))
        if len(wrong_expected_results) != 0:
            prompt = prompt.replace('<WRONG_EXPECTED_RESULTS>', json.dumps(wrong_expected_results, indent=2))
            prompt = prompt.replace('<OUTPUT_VERIFIER_RESPONSES>',json.dumps(output_verifier_responses,indent=2))
        else:
            str1 = "Calling for the first time, hence, no wrongly predicted results"
            str2 = "Calling for the first time, hence, no output verifier responses"
            prompt = prompt.replace('<WRONG_EXPECTED_RESULTS>', str1)
            prompt = prompt.replace('<OUTPUT_VERIFIER_RESPONSES>', str2)

        system_logger.debug(f'EXPECTED_RESULT_GEN_PROMPT: \n{prompt}')
        response_schema={
                             "type": "object",
                             "properties": {
                                 "expected_results": {
                                        "type": "array",
                                        "items": {"type": "string"}
                                  }
                             },
                             "required": ["expected_results"],
                         }
        expected_results_response = geminiTwoImageQuery(before_ss, after_ss, prompt, response_schema)
        system_logger.debug(f'expected_results_response: \n{expected_results_response}')

        executor_response = {
            "before_ss" : before_ss,
            "after_ss" : after_ss,
            "response" : ""
        }
        output_verifier_response = verifyOutput(expected_results_response, executor_response)
        system_logger.debug(f'output_verifier_response: \n{output_verifier_response}')

        if ground_truth == output_verifier_response['status']:
            system_logger.debug('Output verifier and anomaly detector agrees')
            return expected_results_response['expected_results'], prompt
        else:
            system_logger.warning('Output verifier and anomaly detector do not agree')
            wrong_expected_results.append(expected_results_response)
            output_verifier_responses.append(output_verifier_response)
    system_logger.error("expected_results could not be figured out in 5 retries")
    system_logger.error('Stopping the execution')
    raise RuntimeError('Expected results could not be figured out in 5 retries')
