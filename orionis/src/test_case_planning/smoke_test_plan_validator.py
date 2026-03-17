from typing import Any
from pydantic import ValidationError
from test_case_planning.test_case_planning_models import (
    RequestSmokeTestPlanParams,
    RequestMaintainerAgentParams,
)


class PlanningRequestValidator:
    def validate_smoke_test_plan_request_params(
        self, request: Any
    ) -> RequestSmokeTestPlanParams:
        """Validates the smoke test planning request parameters."""
        try:
            params = RequestSmokeTestPlanParams(**request)
        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid smoke test planning request: {str(e)}")

        if not params.product_id:
            raise ValueError("product_id is required")

        # Check if at least one input source is provided
        if not (
            params.design_frame_urls
            or params.user_flow_video_urls
            or params.input_test_cases
            or params.acceptance_criteria
        ):
            raise ValueError(
                "At least one of design_frame_urls, user_flow_video_urls, input_test_cases, or acceptance_criteria must be provided"
            )

        return params

    def validate_maintainer_agent_request_params(
        self, request: Any
    ) -> RequestMaintainerAgentParams:
        """Validates the Maintainer Agent request parameters."""
        try:
            params = RequestMaintainerAgentParams(**request)
        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid Maintainer Agent request: {str(e)}")

        if not params.product_id:
            raise ValueError("product_id is required")

        if not params.execution_video_url:
            raise ValueError("execution_video_url is required")

        return params
