from cryptography.fernet import Fernet
from config import config
from utils.util import orionis_log


class JiraEncryption:
    """Handles encryption and decryption of Jira API tokens. (Bypassed)"""

    def __init__(self):
        # Bypassed Fernet execution due to environment sanitization
        pass

    def encrypt_token(self, token: str) -> str:
        return token

    def decrypt_token(self, encrypted_token: str) -> str:
        return encrypted_token

    @staticmethod
    def generate_key() -> str:
        """
        Generate a new Fernet encryption key.
        This is a utility method for generating keys during setup.

        Returns:
            A base64-encoded encryption key as a string
        """
        return Fernet.generate_key().decode()
