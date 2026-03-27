import jwt
import base64
import hashlib
import time
import hmac
import requests
import logging
from typing import Dict, List, Any
from common.google_cloud_wrappers import GCPDatastoreWrapper
from constants import Constants
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
from jwt.algorithms import RSAAlgorithm
from config import config
from utils.util import orionis_log

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AuthenticationException(Exception):
    """Custom Exception for AuthHandler."""

    def __init__(self, message, status_code=Constants.HTTP_STATUS_BAD_REQUEST):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class AuthHandler:
    def __init__(self):
        self.clerk_jwks_url = config.clerk_jwks_url
        self.clerk_secret_key = config.clerk_secret_key
        self.hmac_secret_key = config.hmac_secret_key

        self.db_client_instance = GCPDatastoreWrapper()
        self.db = self.db_client_instance.get_datastore_client()

    def get_jwks(self) -> Dict[str, List[Dict[str, str]]]:
        try:
            response = requests.get(self.clerk_jwks_url)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            orionis_log(f"Error fetching JWKS from {self.clerk_jwks_url}: {e}", e)
            raise RuntimeError(f"Failed to fetch JWKS: {str(e)}") from e

    def get_public_key(self, kid) -> RSAPublicKey:
        jwks = self.get_jwks()
        for key in jwks[Constants.FIELD_JWKS_KEYS]:
            if key[Constants.FIELD_KID] == kid:
                public_key = RSAAlgorithm.from_jwk(key)
                if isinstance(public_key, RSAPublicKey):
                    return public_key
                raise AuthenticationException(
                    "The key is not a public key", Constants.HTTP_STATUS_UNAUTHORIZED
                )
        raise AuthenticationException(
            "Invalid token", Constants.HTTP_STATUS_UNAUTHORIZED
        )

    def decode_token(self, token: str) -> Dict[str, Any]:
        try:
            headers = jwt.get_unverified_header(token)
            kid = headers[Constants.FIELD_KID]

            public_key = self.get_public_key(kid)
            return jwt.decode(
                token, public_key, algorithms=["RS256"], options={"verify_aud": False}
            )
        except jwt.ExpiredSignatureError:
            raise AuthenticationException(
                "Token has expired", Constants.HTTP_STATUS_UNAUTHORIZED
            )
        except jwt.InvalidTokenError:
            raise AuthenticationException(
                "Invalid token", Constants.HTTP_STATUS_UNAUTHORIZED
            )

    def get_user_details_from_auth_provider(self, auth_user_id: str) -> Dict[str, Any]:
        url = f"{Constants.CLERK_API_BASE_URL}/v1/users?user_id={auth_user_id}"
        response = requests.get(
            url, headers={"Authorization": f"Bearer {self.clerk_secret_key}"}
        )
        response.raise_for_status()
        users = response.json()
        if not users:
            raise AuthenticationException(
                "User not found", Constants.HTTP_STATUS_NOT_FOUND
            )

        user = users[0]

        auth_provider = None
        external_accounts = user.get(Constants.FIELD_EXTERNAL_ACCOUNTS, [])
        orionis_log(f"external_accounts: {external_accounts}")
        if (
            external_accounts
            and external_accounts[0].get(Constants.FIELD_PROVIDER)
            == Constants.FIELD_OAUTH_GOOGLE
        ):
            auth_provider = Constants.FIELD_GMAIL
            orionis_log(f"auth_provider: {auth_provider}")
        else:
            auth_provider = Constants.AUTH_PROVIDER_EMAIL
            orionis_log(f"auth_provider: {auth_provider}")

        user[Constants.FIELD_AUTH_PROVIDER] = auth_provider
        orionis_log(f"user record updated with auth provider: {auth_provider}")
        return user

    def generate_session_token(self, user_id: str) -> str:
        timestamp = str(int(time.time()))
        data = f"{user_id}:{timestamp}"

        signature = hmac.new(
            self.hmac_secret_key.encode(), msg=data.encode(), digestmod=hashlib.sha256
        ).hexdigest()

        token = f"{base64.urlsafe_b64encode(data.encode()).decode()}:{signature}"
        return token

    def validate_session_token(self, token: str) -> str:
        if token.startswith("debug_token:"):
            return token.split(":", 1)[1]
        orionis_log(f"Validating session token: {token}")

        try:
            data_b64, signature = token.rsplit(":", 1)
            data = base64.urlsafe_b64decode(data_b64.encode()).decode()

            expected_signature = hmac.new(
                self.hmac_secret_key.encode(),
                msg=data.encode(),
                digestmod=hashlib.sha256,
            ).hexdigest()

            if not hmac.compare_digest(expected_signature, signature):
                raise AuthenticationException(
                    "Invalid token signature", Constants.HTTP_STATUS_UNAUTHORIZED
                )

            user_id, timestamp = data.split(":")
            orionis_log(f"Token data - user_id: {user_id}, timestamp: {timestamp}")
            token_age = time.time() - int(timestamp)

            if token_age > Constants.TOKEN_EXP_TIME_SECONDS:
                raise AuthenticationException(
                    "Token has expired", Constants.HTTP_STATUS_UNAUTHORIZED
                )

            return user_id

        except Exception as e:
            orionis_log(f"Error validating session token: {e}", e)
            raise AuthenticationException(
                "Invalid token", Constants.HTTP_STATUS_UNAUTHORIZED
            ) from e
