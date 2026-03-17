import pyautogui
import cv2
import numpy as np
from utils.utils import nova_log

def getGrayscaleCVImage(input_obj, is_screenshot):
    if is_screenshot:
        screenshot = np.array(input_obj)  # Convert to numpy array (RGB format)
        screenshot = cv2.cvtColor(screenshot, cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(screenshot, cv2.COLOR_BGR2GRAY)
    else:
        gray = cv2.imread(input_obj, cv2.IMREAD_GRAYSCALE)
        screenshot = gray.copy()
    return gray, screenshot

def cropToEmulator(input_obj, is_screenshot):
    gray, screenshot = getGrayscaleCVImage(input_obj, is_screenshot)
    
    edges = cv2.Canny(gray, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    screen_contour = None
    max_area = 0

    for contour in contours:
        epsilon = 0.02 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)

        x, y, w, h = cv2.boundingRect(approx)
        if ((h/w) <= 3 ) and ((h/w)>=1.2) and (len(approx) >= 4):  # Looking for quadrilateral
            area = cv2.contourArea(approx)
            if area > max_area:
                max_area = area
                screen_contour = approx

    # If a valid contour was found, crop the image
    if screen_contour is not None:
        x, y, w, h = cv2.boundingRect(screen_contour)
        cropped_image = screenshot[y:y+h, x:x+w]
        cv2.imwrite("cropped_ss.png", cropped_image)
        nova_log('Coordinates - x, y, w, h')
        nova_log(f'x - {x}')
        nova_log(f'y - {y}')
        nova_log(f'w - {w}')
        nova_log(f'h - {h}')
        return x, y, w, h
    else:
        nova_log("No suitable screen contour found.", Exception("No suitable emulator found."))
        raise Exception('No suitable emulator found')

def cropToLeftHalf(screenshot):
    width, height = screenshot.size
    left_half = screenshot.crop((0, 0, width//2, height))
    left_half.save('left_half.png')
    return left_half

def hardCodedCrop(input_obj, is_screenshot, x=36, y=38, w=665, h=1497):
    # this is for cropping 
    xn = 36
    yn = 100
    wn = 650
    hn = 1400
    ss, _ = getGrayscaleCVImage(input_obj, is_screenshot)
    cropped_image = ss[yn:yn+hn, xn:xn+wn]
    cv2.imwrite("cropped_ss.png", cropped_image)

def locateEmulator():
    ss = pyautogui.screenshot()
    ss = cropToLeftHalf(ss)
    x, y, w, h = cropToEmulator(ss, True)
    return x-100, y-100, w+350, h+350
