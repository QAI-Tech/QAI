"""
Implement gpt, claude, deepseek calls here
"""
from tc_executor.logger_config import logger as system_logger
import io, base64
import anthropic
import os, logging, sys, json
import google.generativeai as genai
from typing import List, Dict, Any
from io import BytesIO
from tc_executor.constants import ANTHROPIC_API_KAY, ANTHROPIC_MODEL
from tc_executor.constants import GOOGLE_API_KEY, GEMINI_MODEL_NAME

""" ----- Anthropic Credentials ----- """
anthropic_client = anthropic.Anthropic(api_key = ANTHROPIC_API_KAY)

""" ----- Google Credentials ------ """
genai.configure(api_key=GOOGLE_API_KEY)
gemini_client = genai.GenerativeModel(GEMINI_MODEL_NAME)
GenerationConfig = genai.GenerationConfig

def geminiTwoImageQuery(_ss1, _ss2, prompt,
                         response_schema={
                             "type": "object",
                             "properties": {
                                 "rationale": {"type": "string"},
                                 "status": {"type": "boolean"},
                             },
                             "required": ["status", "rationale"],
                         }, retry=5):

    # Convert first image to bytes
    img1_bytes_io = BytesIO()
    ss1 = _ss1.copy().convert('RGB')
    ss1.save(img1_bytes_io, format='JPEG')
    img1_bytes = img1_bytes_io.getvalue()
    img1_part = {"mime_type": "image/jpeg", "data": img1_bytes}

    # Convert second image to bytes
    img2_bytes_io = BytesIO()
    ss2 = _ss2.copy().convert('RGB')
    ss2.save(img2_bytes_io, format='JPEG')
    img2_bytes = img2_bytes_io.getvalue()
    img2_part = {"mime_type": "image/jpeg", "data": img2_bytes}

    # Content to be sent to Gemini
    content = [prompt, img1_part, img2_part]

    for i in range(retry):
        system_logger.debug(f'Calling gemini for {i+1} the time')
        try:
            system_logger.setLevel(logging.ERROR)
            response = gemini_client.generate_content(
                content,
                generation_config=GenerationConfig(
                    response_mime_type="application/json", 
                    response_schema=response_schema
                )
            )
            system_logger.setLevel(logging.DEBUG)
            response = json.loads(response.text)
            return response
        except Exception as e:
            system_logger.warning(f'Gemini raised exception - {e}')
            continue

    system_logger.error(f'Gemini raised exceptions for {retry} number of times')
    system_logger.error('Terminating the execution')
    raise Exception(f"Gemini raised exception for {retry} number of times, terminating")

def geminiSingleImageQuery( _ss, prompt,
                            response_schema = {
                                "type": "object",
                                "properties": {
                                    "status": {"type": "boolean"},
                                    "rationale": {"type": "string"},
                                },
                                "required": ["status", "rationale"],
                            }, retry=5):

    img_bytes = BytesIO()
    ss = _ss.copy().convert('RGB')
    ss.save(img_bytes, format='JPEG')
    img_bytes = img_bytes.getvalue()
    img_part = {"mime_type": "image/jpeg", "data": img_bytes}
    content = [prompt, img_part]

    for i in range(retry):
        system_logger.debug(f'Calling gemini for {i+1} the time')
        try:
            system_logger.setLevel(logging.ERROR)
            response = gemini_client.generate_content(
                content,
                generation_config=GenerationConfig(
                    response_mime_type="application/json", response_schema=response_schema)
            )
            system_logger.setLevel(logging.DEBUG)
            response = json.loads(response.text)
            return response
        except Exception as e:
            system_logger.warning(f'Gemini raised exception - {e}')
            continue
    system_logger.error(f'Gemini raised exceptions for {retry} number of times')
    system_logger.error('Terminating the execution')
    raise Exception(f"Gemini raised exception for {retry} number of times, terminating")

def ssToBase64(ss):
    if ss.mode == 'RGBA':
        ss = ss.convert('RGB')

    img_buffer = io.BytesIO()
    ss.save(img_buffer, format="JPEG", optimize=True)
    img_buffer.seek(0)
    base64_image = base64.b64encode(img_buffer.read()).decode()
    return base64_image

def claudeTwoImageQuery(ss1, ss2, prompt):
    image1_data = ssToBase64(ss1)
    image2_data = ssToBase64(ss2)
    message = anthropic_client.messages.create(
        model= ANTHROPIC_MODEL,
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                    "type": "text",
                    "text": "Image 1:"
                    },
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type":"image/jpeg",
                            "data": image1_data,
                        },
                    },
                    {
                    "type": "text",
                    "text": "Image 2:"
                    },
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type":"image/jpeg",
                            "data": image2_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt
                    }
                ],
            }
        ],
    )
    return message

def claudeSingleImageQuery(ss, prompt):
    image_data = ssToBase64(ss)
    message = anthropic_client.messages.create(
        model= ANTHROPIC_MODEL,
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type":"image/jpeg",
                            "data": image_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt
                    }
                ],
            }
        ],
    )
    return message

