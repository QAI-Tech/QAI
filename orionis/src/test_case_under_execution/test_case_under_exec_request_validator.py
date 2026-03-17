from typing import Any
from pydantic import ValidationError
from gateway.gateway_models import ApiRequestEntity
from test_case_under_execution.test_case_under_exec_models import (
    CopyTestCaseUnderExecutionForProductRequestParams,
    DeleteTestCaseUnderExecutionFromTestRunParams,
    GetUsageDataParams,
    UpdateTestCaseUnderExecutionParams,
    UpdateNovaExecutionData,
    AssignTcueToUsersParams,
)


class TestCaseUnderExecutionRequestValidator:

    def validate_update_test_case_execution_request_params(
        self, request_object: ApiRequestEntity
    ) -> UpdateTestCaseUnderExecutionParams:
        try:
            update_params = UpdateTestCaseUnderExecutionParams(**request_object.data)
        except (ValidationError, TypeError) as e:
            raise ValueError(
                f"Invalid test case under execution update request: {str(e)}"
            )

        if (
            update_params.status is None
            and update_params.execution_video_url is None
            and update_params.notes is None
            and update_params.comments is None
            and update_params.criticality is None
            and update_params.feature_id is None
            and update_params.test_case_description is None
            and (
                update_params.annotations is None
                or update_params.annotations == []
                or update_params.annotations == [""]
            )
        ):
            raise ValueError(
                "At least one field (status, execution_video_url, notes, comments, criticality, "
                "feature_id, test_case_description, annotations) must be provided for update."
            )

        if not update_params.test_case_under_execution_id:
            raise ValueError("Test Case Under Execution ID must be provided.")

        return update_params

    def validate_update_nova_execution_data_params(
        self, request_object: Any
    ) -> UpdateNovaExecutionData:
        try:
            update_params = UpdateNovaExecutionData(**request_object)
        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid nova execution update request: {str(e)}")

        if not (
            update_params.test_case_id
            and update_params.test_run_id
            and update_params.test_case_under_execution_id
        ):
            raise ValueError(
                "All the fields (test_case_id, test_run_id, tcue_id) must be provided for update."
            )

        return update_params

    def validate_delete_test_case_under_execution_from_test_run_params(
        self, request_object: Any
    ) -> DeleteTestCaseUnderExecutionFromTestRunParams:
        try:
            delete_params = DeleteTestCaseUnderExecutionFromTestRunParams(
                **request_object
            )
        except (ValidationError, TypeError) as e:
            raise ValueError(
                f"Invalid delete test case from test run request: {str(e)}"
            )

        if not delete_params.test_case_under_execution_ids:
            raise ValueError("Test Case Under Execution IDs must be provided.")

        return delete_params

    def validate_get_usage_data_params(
        self, request_object: ApiRequestEntity
    ) -> GetUsageDataParams:
        try:
            params = GetUsageDataParams(**request_object.data)
        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid usage data request: {str(e)}")

        if not params.organisation_id:
            raise ValueError("Organisation ID must be provided.")

        return params

    def validate_copy_test_case_under_execution_for_product_request_params(
        self, request: ApiRequestEntity
    ) -> CopyTestCaseUnderExecutionForProductRequestParams:
        try:
            validated = CopyTestCaseUnderExecutionForProductRequestParams(
                **request.data
            )
            return validated

        except (ValidationError, TypeError) as e:
            raise ValueError(
                f"Invalid copy test case under execution for product request: {str(e)}"
            )

    def validate_assign_test_case_under_execution_to_users_params(
        self, request_object: ApiRequestEntity
    ) -> AssignTcueToUsersParams:
        try:
            assign_params = AssignTcueToUsersParams(**request_object.data)

            if (
                not assign_params.assignee_user_id
                or not assign_params.test_case_under_execution_ids
                or any(
                    not tcue_id
                    for tcue_id in assign_params.test_case_under_execution_ids
                )
            ):
                raise ValueError(
                    "Assignee User ID and Test Case IDs must be provided and cannot be empty."
                )

        except (ValidationError, TypeError) as e:
            raise ValueError(
                f"Invalid assign test case under execution to users request: {str(e)}"
            )

        return assign_params
