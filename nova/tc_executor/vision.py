from tc_executor.logger_config import logger as system_logger
from skimage.metrics import structural_similarity as ssim
import cv2
import numpy as np
import pyautogui
from PIL import Image
from tc_executor.constants import EXECUTOR_WEAK_BOUNDARY_COORDINATES, EXECUTOR_HARD_BOUNDRY_COORDINATES
from tc_executor.constants import EXECUTOR_REMOTE_DESKTOP_EMULATOR_COORDINATES, IS_LOCAL
import subprocess
from io import BytesIO
from PIL import Image

def getSim(ss1, ss2):
    image1 = np.array(ss1)
    image2 = np.array(ss2)
    if image1.shape[-1] == 4:  # Check if 4 channels (RGBA)
        image1 = cv2.cvtColor(image1, cv2.COLOR_RGBA2RGB)
    if image2.shape[-1] == 4:
        image2 = cv2.cvtColor(image2, cv2.COLOR_RGBA2RGB)
    image1 = cv2.cvtColor(image1, cv2.COLOR_RGB2GRAY)
    image2 = cv2.cvtColor(image2, cv2.COLOR_RGB2GRAY)
    
    if image1.shape != image2.shape:
        image2 = cv2.resize(image2, (image1.shape[1], image1.shape[0]))

    similarity_index, _ = ssim(image1, image2, full=True)
    return similarity_index

def getSS(is_adb=False):
    def cropToLeftHalf(screenshot):
        width, height = screenshot.size
        left_half = screenshot.crop((0, 0, width//2, height))
        return left_half
    def getAdbSS():
        result = subprocess.run(["adb", "exec-out", "screencap", "-p"], capture_output=True)
        if result.returncode != 0:
            system_logger.error("ADB screenshot failed")
            return None
        try:
            ss = Image.open(BytesIO(result.stdout))
            return ss
        except Exception as e:
            system_logger.error(f"Failed to decode ADB screenshot: {e}")
            return None
    def cropToEmulator(ss):
        x, y, w, h = EXECUTOR_WEAK_BOUNDARY_COORDINATES
        target = ss.crop((x, y, x+w, y+h)) 
        return target
    def hardCropToEmulator(ss):
        x, y, w, h = EXECUTOR_HARD_BOUNDRY_COORDINATES
        target = ss.crop((x, y, x+w, y+h)) 
        return target
    def oneGoCrop(ss):
        x, y, w, h = EXECUTOR_REMOTE_DESKTOP_EMULATOR_COORDINATES
        target = ss.crop((x, y, x+w, y+h)) 
        return target

    system_logger.debug('Only using the left half as ss')
    if is_adb:
        ss = getAdbSS()
    else:
        ss = pyautogui.screenshot()
        ss = cropToLeftHalf(ss)
    return ss
""" 
    if IS_LOCAL:
        ss = cropToLeftHalf(ss)
        ss = cropToEmulator(ss) # includes verticle-side-bar - need to remove it if bg screen keeps changing
        ss = hardCropToEmulator(ss) # only the emulator
    else:
        ss = cropToLeftHalf(ss) # necessary bcz coords are in reference with half screen
        ss = oneGoCrop(ss)
    return ss
"""

def saveSS(ss, outfilepath):
    ss.save(outfilepath)

def stackSSsHorizontally(ss1, ss2, separator_width=10):
    system_logger.debug('About to stack two SSs horizontally...')
    if ss1.mode != ss2.mode:
        system_logger.debug('both have different mode')
        ss2 = ss2.convert(ss1.mode)

    if ss1.height != ss2.height:
        system_logger.debug(f'{ss1.height} != {ss2.height} - two heights dont match')
        ss2 = ss2.resize((ss2.width, ss1.height))

    width1, height1 = ss1.size
    width2, height2 = ss2.size
    total_width = width1 + separator_width + width2
    max_height = max(height1, height2)
    
    combined = Image.new('RGB', (total_width, max_height), (255, 255, 255))
    combined.paste(ss1, (0, 0))
    combined.paste(ss2, (width1 + separator_width, 0))
    
    system_logger.debug('SSs stacked')
    return combined
