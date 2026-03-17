"""
Configuration loader for Maintainer Agent
Uses the main Orionis config for centralized configuration management
"""

from config import config


def get_gemini_api_key() -> str:
    """
    Get Gemini API key from Orionis config

    Returns:
        str: Gemini API key
    """
    return config.gemini_api_key
