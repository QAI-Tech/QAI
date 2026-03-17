from tc_executor.logger_config import logger as system_logger
import numpy as np
import os, sys, json
from skimage.metrics import structural_similarity as ssim
import cv2
import numpy as np
from tc_executor.constants import BACKTRACKER_IMAGE_MATCHING_THRESHOLD
from tc_executor.vision import getSim

delete_count = 0
def backtracker(input_dt):
    global delete_count
    system_logger.debug('Entered into backtracker module...')
    flow_sss = input_dt['flow_screenshots']
    after_ss = input_dt['after_ss']
    flow_ids = input_dt['flow_ids']

    """ saves the target and sample images into directory
    # ------------- only for debugging purpose  ------------
    system_logger.debug(f'#prev states: {len(flow_sss)}')
    system_logger.debug('saving all the screenshots')
    dirpath = os.path.join('deletethis', f'backtracker_{delete_count}')
    os.makedirs(dirpath)
    after_ss.save(os.path.join(dirpath, 'target.png'))
    for i, flow_ss in enumerate(flow_sss):
        flow_ss.save(os.path.join(dirpath, f'state_{i}.png'))
    system_logger.debug('all the screenshots saved')
    delete_count += 1
    # ------------------------------------------------------
    """

    i = len(flow_sss)-1
    for flow_ss in flow_sss[::-1]: # reverse check
        sim = getSim(flow_ss, after_ss)
        system_logger.debug(f'similarity found: {sim}')
        if sim >= BACKTRACKER_IMAGE_MATCHING_THRESHOLD:
            system_logger.debug(f'Found exact match with flow state id: {flow_ids[i]} with sim: {round(sim,2)}')
            return flow_ids[i]
        i -= 1
    system_logger.error('No match found by the backtracker')
    return -1

