from cryptography.fernet import Fernet
from config import config
from utils.util import orionis_log


class JiraEncryption:
    """Handles encryption and decryption of Jira API tokens."""

    def __init__(self):
        # Get encryption key from config
        # The key should be a base64-encoded 32-byte key
        encryption_key = config.jira_encryption_key.encode()
        self.cipher = Fernet(encryption_key)

    def encrypt_token(self, token: str) -> str:
        """
        Encrypt a Jira API token.

        Args:
            token: The plaintext Jira API token

        Returns:
            The encrypted token as a string
        """
        try:
            encrypted_bytes = self.cipher.encrypt(token.encode())
            return encrypted_bytes.decode()
        except Exception as e:
            orionis_log(f"Error encrypting Jira token: {e}", e)
            raise ValueError(f"Failed to encrypt Jira token: {str(e)}")

    def decrypt_token(self, encrypted_token: str) -> str:
        """
        Decrypt a Jira API token.

        Args:
            encrypted_token: The encrypted token string

        Returns:
            The decrypted plaintext token
        """
        try:
            decrypted_bytes = self.cipher.decrypt(encrypted_token.encode())
            return decrypted_bytes.decode()
        except Exception as e:
            orionis_log(f"Error decrypting Jira token: {e}", e)
            raise ValueError(f"Failed to decrypt Jira token: {str(e)}")

    @staticmethod
    def generate_key() -> str:
        """
        Generate a new Fernet encryption key.
        This is a utility method for generating keys during setup.

        Returns:
            A base64-encoded encryption key as a string
        """
        return Fernet.generate_key().decode()
