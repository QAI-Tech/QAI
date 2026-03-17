from typing import Any, List, Tuple

from pydantic import ValidationError
from gateway.gateway_models import ApiRequestEntity
from test_cases.test_case_models import (
    AddTestCaseRequestParams,
    CopyTestCaseRequestParams,
    UpdateTestCaseRequestParams,
    ReorderTestCaseRequestModel,
    TestCaseInputModel,
    UpdateMirroredTestCasesRequestParams,
)
from utils.util import orionis_log


class TestCaseRequestValidator:
    def validate_update_test_case_request_params(
        self, request_object: Any
    ) -> UpdateTestCaseRequestParams:

        try:
            raw_test_case = UpdateTestCaseRequestParams(**request_object)

        except (ValidationError, TypeError) as e:
            orionis_log("Invalid test case update request:", e)
            raise ValueError(f"Invalid test case update request: {str(e)}")

        if not (
            raw_test_case.product_id
            or raw_test_case.feature_id
            or raw_test_case.request_id
        ):
            raise ValueError("It must be provided")
        return raw_test_case

    def validate_reorder_test_case_request(
        self, request: ApiRequestEntity
    ) -> Tuple[str, List[TestCaseInputModel]]:
        try:
            validated = ReorderTestCaseRequestModel(**request.data)
            return validated.test_case_changed, validated.test_cases
        except Exception as e:
            orionis_log("Invalid reorder test case request:", e)
            raise ValueError(f"Invalid input format: {e}")

    def validate_add_test_case_request_params(
        self, request: ApiRequestEntity
    ) -> AddTestCaseRequestParams:
        try:
            validated = AddTestCaseRequestParams(**request.data)
            return validated
        except Exception as e:
            orionis_log("Invalid add test case request:", e)
            raise ValueError(f"Invalid input format: {e}")

    def validate_copy_test_cases_for_product_request_params(
        self, request: ApiRequestEntity
    ) -> CopyTestCaseRequestParams:
        try:
            validated = CopyTestCaseRequestParams(**request.data)
            return validated

        except (ValidationError, TypeError) as e:
            orionis_log("Invalid copy test cases for product request:", e)
            raise ValueError(f"Invalid copy test cases for product request: {str(e)}")

    def validate_update_mirrored_test_cases_request(
        self, request: ApiRequestEntity
    ) -> UpdateMirroredTestCasesRequestParams:
        try:
            validated = UpdateMirroredTestCasesRequestParams(**request.data)
            return validated
        except (ValidationError, TypeError) as e:
            orionis_log("Invalid update linked test cases request:", e)
            raise ValueError(f"Invalid update linked test cases request: {str(e)}")
        except Exception as e:
            orionis_log("Unexpected error in update linked test cases request:", e)
            raise ValueError(
                f"Unexpected error in update linked test cases request: {str(e)}"
            )
