"""
MailSlurp Configuration

Configuration for MailSlurp integration using singleton pattern.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional, Type


@dataclass
class MailSlurpConfig:
    """Configuration class for MailSlurp settings as a Singleton."""

    api_key: str
    base_url: str
    timeout_s: int

    _instance: Optional[MailSlurpConfig] = None

    DEFAULT_BASE_URL = "https://api.mailslurp.com"
    DEFAULT_TIMEOUT_S = 30
    ENV_VAR_API_KEY = "MAILSLURP_API_KEY"
    ENV_VAR_BASE_URL = "MAILSLURP_BASE_URL"

    @classmethod
    def load(cls: Type[MailSlurpConfig]) -> MailSlurpConfig:
        """Load configuration from environment variables as a Singleton."""

        if cls._instance is None:
            api_key = os.environ.get(cls.ENV_VAR_API_KEY, "").strip()
            base_url = os.environ.get(cls.ENV_VAR_BASE_URL, cls.DEFAULT_BASE_URL).strip()
            timeout_s = int(os.environ.get("MAILSLURP_TIMEOUT_S", cls.DEFAULT_TIMEOUT_S))

            cls._instance = cls(
                api_key=api_key,
                base_url=base_url,
                timeout_s=timeout_s,
            )
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        """Reset the singleton instance. Useful for testing."""
        cls._instance = None

    def is_configured(self) -> bool:
        """Check if the API key is set."""
        return bool(self.api_key)


# Auto-load config on import
config = MailSlurpConfig.load()
