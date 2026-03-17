from typing import Any
from pydantic import ValidationError
from jira_credentials.jira_credentials_model import (
    AddJiraCredentialsRequest,
    DeleteJiraCredentialsRequest,
)


class JiraCredentialsRequestValidator:
    """Validator for Jira credentials requests."""

    def validate_add_jira_credentials(
        self, request_object: Any
    ) -> AddJiraCredentialsRequest:
        """Validate add Jira credentials request."""
        try:
            request = AddJiraCredentialsRequest(**request_object)
        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid Jira credentials request: {str(e)}")

        if not request.email or not request.email.strip():
            raise ValueError("Email must be provided")

        if not request.api_token or not request.api_token.strip():
            raise ValueError("API token must be provided")

        if not request.product_id or not request.product_id.strip():
            raise ValueError("Product ID must be provided")

        return request

    def validate_delete_jira_credentials(
        self, request_object: Any
    ) -> DeleteJiraCredentialsRequest:
        """Validate delete Jira credentials request."""
        try:
            request = DeleteJiraCredentialsRequest(**request_object)
        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid delete Jira credentials request: {str(e)}")

        if not request.id or not request.id.strip():
            raise ValueError("Credentials ID must be provided")

        return request
