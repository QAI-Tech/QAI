"""
MailSlurp Integration for Nova

This module provides email testing utilities using MailSlurp API.
Useful for:
- Creating test inboxes with "qai_executor" prefix
- Email verification during automated tests
- OTP extraction
- Managing email groups for test scenarios

Usage:
    # Using config (reads from MAILSLURP_API_KEY env var)
    from mailSlurp import get_client
    client = get_client()

    # Or with explicit API key
    from mailSlurp import MailSlurpClient
    client = MailSlurpClient(api_key="your-api-key")

    # Create inbox and manage emails
    inbox = client.create_inbox(prefix="qai_executor")
    emails = client.list_inbox_emails(inbox_email=inbox["emailAddress"])
"""

from mailSlurp.client import (
    MailSlurpClient,
    MailSlurpError,
    client_from_env,
    DEFAULT_PREFIX,
    MAILSLURP_BASE_URL,
)
from mailSlurp.config import config, MailSlurpConfig

# Default API key for convenience
MAILSLURP_API_KEY = "sk_KrtvZejmDH14JDqp_5caVu6XTUj6hODIf2JAMl6aVypCdfPeexOPMHTLkNbcNWseaqT4MUHuWDl176diY"


def get_client() -> MailSlurpClient:
    """
    Get a MailSlurpClient using the singleton config or default API key.

    Returns
    -------
    MailSlurpClient
    """
    api_key = config.api_key if config.is_configured() else MAILSLURP_API_KEY
    return MailSlurpClient(
        api_key=api_key,
        base_url=config.base_url,
        timeout_s=config.timeout_s,
    )


__all__ = [
    # Main client
    "MailSlurpClient",
    "MailSlurpError",
    # Factory functions
    "get_client",
    "client_from_env",
    # Config
    "config",
    "MailSlurpConfig",
    # Constants
    "DEFAULT_PREFIX",
    "MAILSLURP_BASE_URL",
    "MAILSLURP_API_KEY",
]
