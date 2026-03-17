import logging
from functools import wraps
from flask import request, jsonify, g
from services.user_authentication.auth_handler import AuthHandler
from constants import Constants
from utils.util import orionis_log


class TokenValidator:
    def __init__(self):
        self.auth_handler = AuthHandler()
        self.logger = logging.getLogger(__name__)

    def validate_session_token(self, func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            token = request.headers.get("Authorization")
            if not token:
                return (
                    jsonify({"error": "Authorization token is missing or invalid."}),
                    Constants.HTTP_STATUS_UNAUTHORIZED,
                )

            try:
                user_id = self.auth_handler.validate_session_token(token)
                if not user_id:
                    return (
                        jsonify({"error": "Invalid token."}),
                        Constants.HTTP_STATUS_UNAUTHORIZED,
                    )

                g.user_id = user_id
            except Exception as e:
                orionis_log(f"Token validation error: {e}", e)
                return (
                    jsonify(
                        {"error": "Unauthorized access - token validation failed."}
                    ),
                    Constants.HTTP_STATUS_UNAUTHORIZED,
                )

            return func(*args, **kwargs)

        return wrapper
