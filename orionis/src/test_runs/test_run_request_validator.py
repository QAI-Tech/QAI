from typing import Any
from pydantic import ValidationError
from test_runs.test_run_models import (
    AddFlowsToExistingTestRunParams,
    AddTestRunParams,
    UpdateTestRunParams,
    AddTestRunFromFlowsParams,
)
from utils.util import orionis_log
from gateway.gateway_models import ApiRequestEntity


class TestRunRequestValidator:
    def validate_add_test_run_request_params(
        self, request_object: Any
    ) -> AddTestRunParams:
        try:
            test_run_params = AddTestRunParams(**request_object)

        except (ValidationError, TypeError) as e:
            orionis_log("Invalid test run request:", e)
            raise ValueError(f"Invalid test run request: {str(e)}")

        if not (test_run_params.product_id and test_run_params.test_run_name):
            raise ValueError("Product ID and test run name must be provided")

        if (
            test_run_params.build_number is not None
            and not test_run_params.build_number.strip()
        ):
            raise ValueError("Build number cannot be empty if provided")

        return test_run_params

    def validate_update_test_run_request_params(
        self, request_object: Any
    ) -> UpdateTestRunParams:
        try:
            update_params = UpdateTestRunParams(**request_object)
        except (ValidationError, TypeError) as e:
            orionis_log("Invalid test run update request:", e)
            raise ValueError(f"Invalid test run update request: {str(e)}")

        if not update_params.test_run_id or not update_params.status:
            raise ValueError("Test Run ID and status must be provided")

        return update_params

    def validate_add_test_run_from_flows_request_params(
        self, request_object: Any
    ) -> AddTestRunFromFlowsParams:
        try:
            test_run_params = AddTestRunFromFlowsParams(**request_object)

        except (ValidationError, TypeError) as e:
            orionis_log("Invalid test run from flows request:", e)
            raise ValueError(f"Invalid test run from flows request: {str(e)}")

        if not (
            test_run_params.product_id
            and test_run_params.test_run_name
            and test_run_params.build_number
        ):
            raise ValueError(
                "Product ID, test run name, and build number must be provided"
            )

        if not test_run_params.build_number.strip():
            raise ValueError("Build number cannot be empty")

        if not test_run_params.flow_ids or len(test_run_params.flow_ids) == 0:
            raise ValueError("At least one flow_id must be provided")

        return test_run_params

    def validate_add_flows_to_existing_test_run_request_params(
        self, request_object: ApiRequestEntity
    ) -> AddFlowsToExistingTestRunParams:
        try:
            test_run_params = AddFlowsToExistingTestRunParams(**request_object.data)
        except (ValidationError, TypeError) as e:
            orionis_log("Invalid add flows to existing test run request:", e)
            raise ValueError(
                f"Invalid add flows to existing test run request: {str(e)}"
            )

        if not test_run_params.flow_ids or len(test_run_params.flow_ids) == 0:
            raise ValueError("At least one flow_id must be provided")

        return test_run_params
