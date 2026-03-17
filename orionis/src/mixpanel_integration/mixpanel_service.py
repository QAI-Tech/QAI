from utils.util import orionis_log
import os
import json
import base64
import requests
from functools import wraps


class MixpanelService:
    """
    Mixpanel service for tracking events from backend services
    """

    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(MixpanelService, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if not self._initialized:
            # Determines environment
            self.environment = os.environ.get("ENVIRONMENT", "staging")
            self.is_production = self.environment == "production"

            # Get appropriate token based on environment
            if self.is_production:
                self.token = os.environ.get("MIXPANEL_TOKEN_PROD")
                orionis_log("[MIXPANEL] Initializing Mixpanel with production token")
            else:
                self.token = os.environ.get("MIXPANEL_TOKEN_STAGING")
                orionis_log("[MIXPANEL] Initializing Mixpanel with staging token")

            if not self.token:
                orionis_log(
                    f"[MIXPANEL] No Mixpanel token found for {self.environment} environment"
                )

            # Set EU endpoints for direct API calls
            self.track_endpoint = "https://api-eu.mixpanel.com/track"
            self.engage_endpoint = "https://api-eu.mixpanel.com/engage"

            self._initialized = True

    def should_track(self, properties):
        """Determine if the event should be tracked based on email domain"""
        if properties and "email" in properties:
            email = properties.get("email")
            if (
                email
                and isinstance(email, str)
                and email.lower().endswith("@qaitech.ai")
            ):
                orionis_log(f"[MIXPANEL] Skipping tracking for internal email: {email}")
                return False
        return True

    def track(self, user_id, event_name, properties=None):
        """Track an event using direct API call"""
        if not self.token:
            orionis_log(
                f"[MIXPANEL] No token available, skipping tracking of {event_name}"
            )
            return False

        properties = properties or {}

        # Skip tracking for QAI emails
        if not self.should_track(properties):
            return True  # Returns True to indicate "successful" skipping

        # Add required Mixpanel properties
        properties.update(
            {
                "token": self.token,
                "distinct_id": user_id,
                "environment": self.environment,
            }
        )

        try:
            # Prepare the event data
            event_data = {"event": event_name, "properties": properties}

            # Convert to JSON and encode to base64
            json_str = json.dumps(event_data)
            data = base64.b64encode(json_str.encode("utf-8")).decode("utf-8")

            response = requests.post(
                self.track_endpoint,
                data={"data": data},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

            if response.status_code == 200 and response.text == "1":
                orionis_log(f"[MIXPANEL] Successfully tracked {event_name}")
                return True
            else:
                orionis_log(
                    f"[MIXPANEL] Failed to track {event_name}, status code: {response.status_code}, response: {response.text}"
                )
                return False

        except Exception as e:
            orionis_log(f"[MIXPANEL] Failed to track event {event_name}: {str(e)}", e)
            return False

    def identify(self, user_id, properties=None):
        """Set user profile properties"""
        if not self.token:
            orionis_log(
                f"[MIXPANEL] No token available, skipping identify for {user_id}"
            )
            return False

        properties = properties or {}

        # Skip tracking for QAI emails
        if not self.should_track(properties):
            return True  # Returns True to indicate "successful" skipping

        try:
            # Prepare the data
            engage_data = {
                "$token": self.token,
                "$distinct_id": user_id,
                "$set": properties,
            }

            # Convert to JSON and encode to base64
            json_str = json.dumps(engage_data)
            data = base64.b64encode(json_str.encode("utf-8")).decode("utf-8")

            response = requests.post(
                self.engage_endpoint,
                data={"data": data},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

            if response.status_code == 200 and response.text == "1":
                orionis_log(f"[MIXPANEL] Successfully identified user {user_id}")
                return True
            else:
                orionis_log(
                    f"[MIXPANEL] Failed to identify user {user_id}, status code: {response.status_code}, response: {response.text}",
                    Exception(f"HTTP {response.status_code}: {response.text}"),
                )
                return False

        except Exception as e:
            orionis_log(f"[MIXPANEL] Failed to identify user {user_id}: {str(e)}", e)
            return False


# Created a singleton instance
mixpanel = MixpanelService()


def track_event(event_name):
    """
    Decorator to track events when functions are called
    Usage:

    @track_event("User Signed In")
    def signin(request):
        # Function implementation
        return user_data
    """

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            result = func(*args, **kwargs)

            try:
                # Get user_id from result
                user_id = "system"

                # Extract user_id from the response
                if isinstance(result, tuple) and len(result) >= 1:
                    response_data = result[0]
                    if hasattr(response_data, "json"):
                        json_data = response_data.json()
                        if "user_id" in json_data:
                            user_id = json_data["user_id"]

                # Add event properties
                properties = {"function_name": func.__name__, "success": True}

                # Track the event
                mixpanel.track(user_id, event_name, properties)
            except Exception as e:
                orionis_log(f"[MIXPANEL] Error in track_event decorator: {str(e)}", e)

            return result

        return wrapper

    return decorator
