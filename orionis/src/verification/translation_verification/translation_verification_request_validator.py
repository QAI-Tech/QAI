from typing import Any
from pydantic import ValidationError
from verification.translation_verification.translation_verification_models import (
    TranslationVerificationRequestParams,
)
from utils.util import orionis_log


class TranslationVerificationRequestValidator:
    """Validates request parameters for translation verification."""

    def validate_translation_verification_request_params(
        self, request: Any
    ) -> TranslationVerificationRequestParams:
        """Validates the verification request parameters and returns strongly typed request object."""
        try:
            # Extract the data from ApiRequestEntity if needed
            if hasattr(request, "data"):
                request_data = request.data
            else:
                request_data = request

            translation_verification_request = TranslationVerificationRequestParams(
                **request_data
            )
        except (ValidationError, TypeError) as e:
            orionis_log("Invalid verification request:", e)
            raise ValueError(f"Invalid verification request: {str(e)}")

        if not translation_verification_request.tcue_id:
            raise ValueError("tcue_id is required")

        return translation_verification_request
