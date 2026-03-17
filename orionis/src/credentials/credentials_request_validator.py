from typing import Any
from pydantic import ValidationError
from credentials.credentials_model import (
    AddCredentialsRequest,
    UpdateCredentialsRequest,
)
from gateway.gateway_models import ApiRequestEntity


class CredentialsRequestValidator:

    def validate_add_credentials(self, request_object: Any) -> AddCredentialsRequest:
        try:
            update_params = AddCredentialsRequest(**request_object)
        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid credentials request: {str(e)}")

        if update_params.credentials is None and update_params.product_id is None:
            raise ValueError(
                "At least two fields (credentials and product_id) must be provided for update."
            )

        if any(
            not isinstance(key, str)
            or not isinstance(value, str)
            or not key.strip()
            or not value.strip()
            for key, value in update_params.credentials.items()
        ):
            raise ValueError("All credentials must be provided and must be strings")

        return update_params

    def validate_update_credentials_request_params(
        self, request_object: ApiRequestEntity
    ) -> UpdateCredentialsRequest:
        try:
            update_params = UpdateCredentialsRequest(**request_object.data)
        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid credentials update request: {str(e)}")

        if update_params.credentials is None and update_params.description is None:
            raise ValueError(
                "At least one field (credentials, or description) must be provided for update."
            )

        if any(
            not isinstance(key, str)
            or not isinstance(value, str)
            or not key.strip()
            or not value.strip()
            for key, value in update_params.credentials.items()
        ):
            raise ValueError("All credentials must be provided and must be strings")

        if not update_params.id:
            raise ValueError("Credentials ID must be provided.")

        return update_params
