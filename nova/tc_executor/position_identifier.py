"""
    Input
        - screenshot
        - action
    Output
        - position of interest
"""
from tc_executor.prompts import POSITION_IDENTIFICATION_PROMPT
from tc_executor.logger_config import logger as system_logger

def getPosition(input_dt):
    ss = input_dt['after_ss']
    action = input_dt['step_description']

    return "Somewhere on the mobile screen"
