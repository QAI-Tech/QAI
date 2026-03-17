from typing import Any
from pydantic import ValidationError
from jira_integration.jira_integration_models import CreateJiraTicketsRequest


class JiraIntegrationRequestValidator:
    """Validator for Jira integration requests."""

    def validate_create_jira_tickets_request(
        self, request_object: Any
    ) -> CreateJiraTicketsRequest:
        """Validate create Jira tickets request."""
        try:
            request = CreateJiraTicketsRequest(**request_object)
        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid create Jira tickets request: {str(e)}")

        if not request.product_id or not request.product_id.strip():
            raise ValueError("Product ID must be provided")

        if not request.test_run_id or not request.test_run_id.strip():
            raise ValueError("Test run ID must be provided")

        if not request.failed_test_case_ids or len(request.failed_test_case_ids) == 0:
            raise ValueError("At least one failed test case ID must be provided")

        return request
