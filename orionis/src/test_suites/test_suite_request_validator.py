from pydantic import ValidationError
from test_suites.test_suite_models import (
    CreateTestSuiteRequestParams,
    UpdateTestSuiteRequestParams,
)
from gateway.gateway_models import ApiRequestEntity


class TestSuiteRequestValidator:
    def validate_create_test_suite_request_params(
        self, request_object: ApiRequestEntity
    ) -> CreateTestSuiteRequestParams:
        try:
            params = CreateTestSuiteRequestParams(**request_object.data)
        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid test suite request: {str(e)}")

        if not params.product_id or not params.product_id.strip():
            raise ValueError("product_id is required")
        if not params.name or not params.name.strip():
            raise ValueError("name is required")

        for x in params.test_case_ids:
            if not x.strip():
                raise ValueError(f"Invalid test_case_id: {x!r}")

        return params

    def validate_update_test_suite_request_params(
        self, request_object: ApiRequestEntity
    ) -> UpdateTestSuiteRequestParams:
        try:
            params = UpdateTestSuiteRequestParams(**request_object.data)
            if not params.test_suite_id:
                raise ValueError("test_suite_id is required")
            if not params.name and not params.test_case_ids:
                raise ValueError(
                    "At least one field (name or test_case_ids) must be provided for update"
                )
        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid test suite update request: {str(e)}")
        return params
