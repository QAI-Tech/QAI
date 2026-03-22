import json
import logging
import os
from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from products.product_datastore import ProductDatastore
from test_case_under_execution.test_case_under_exec_datastore import (
    TestCaseUnderExecutionDatastore,
)
from utils.kg_utils import replace_param_recursive
from test_case_under_execution.test_case_under_exec_request_validator import (
    TestCaseUnderExecutionRequestValidator,
)
from utils.util import orionis_log
from common.google_cloud_wrappers import GCPFileStorageWrapper
from test_case_under_execution.test_case_under_exec_models import (
    CreateTestCaseUnderExecutionParams,
    TestCaseUnderExecution,
    UpdateTestCaseUnderExecutionParams,
    UpdateNovaExecutionData,
    ExecutionStatus,
    UsageDataResponse,
    ProductUsageData,
)
from test_runs.test_run_models import TestRunStatus, UpdateTestRunParams
from test_runs.test_run_datastore import TestRunDatastore
from test_cases.test_case_datastore import TestCaseDatastore
from test_cases.test_case_models import (
    UpdateTestCaseRequestParams,
    TestCaseStatus,
)
from test_case_under_execution.test_case_under_exec_models import TestCaseStep
from services.notify_service.notify import NotificationService
from uuid import uuid4
from typing import List, TypeVar
from constants import Constants
from config import Config, config
from products.product_service import ProductService
from test_cases.test_case_service import TestCaseService
from users.user_service import UserService
from services.cloud_service.cloud_tasks import CloudTaskService
from test_build.test_build_datastore import TestBuildDatastore
from test_cases.test_case_models import RawTestCase
from organisations.org_datastore import OrganisationDatastore
from purchases.purchase_datastore import PurchaseDatastore

logger = logging.getLogger(__name__)
T = TypeVar("T", CreateTestCaseUnderExecutionParams, UpdateTestCaseUnderExecutionParams)


class TestCaseUnderExecutionService:
    def __init__(
        self,
        request_validator: TestCaseUnderExecutionRequestValidator,
        datastore: TestCaseUnderExecutionDatastore,
        storage_client: GCPFileStorageWrapper,
        test_case_datastore: TestCaseDatastore,
        test_run_datastore: TestRunDatastore,
        product_service: ProductService,
        test_case_service: TestCaseService,
        user_service: UserService,
        cloud_task_service: CloudTaskService,
        test_build_datastore: TestBuildDatastore,
        product_datastore: ProductDatastore,
    ):
        self.request_validator = request_validator
        self.datastore = datastore
        self.test_case_datastore = test_case_datastore
        self.storage_client = storage_client
        self.notification_service = NotificationService()
        self.test_run_datastore = test_run_datastore
        self.product_service = product_service
        self.test_case_service = test_case_service
        self.user_service = user_service
        self.cloud_task_service = cloud_task_service
        self.USER_GOAL_PLANNING_HANDLER_FUNCTION_NAME = "UserGoalPlanningHandler"
        self.test_build_datastore = test_build_datastore
        self.product_datastore = product_datastore
        self.org_datastore = OrganisationDatastore()
        self.purchase_datastore = PurchaseDatastore()

    def update_test_case_under_execution(
        self, request: ApiRequestEntity, user_id: str
    ) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )
        # TODO: When TCUE status goes to EXECUTING, the execution_started_at timestamp field also needs to be set.

        # TODO: When it goes to PASSED/FAILED, the execution_completed_at timestamp should be set.

        try:
            sent_emails: dict[str, list[str]] = {}
            orionis_log(f"Received update request: {request.data}")

            update_test_case_params = self.request_validator.validate_update_test_case_execution_request_params(
                request
            )

            orionis_log(
                f"Updating test case under execution with id: {update_test_case_params.test_case_under_execution_id}"
            )
            if update_test_case_params.is_synced:
                if not update_test_case_params.test_case_id:
                    raise ValueError("Test Case ID is required")
                test_case = self.test_case_datastore.fetch_test_cases_by_ids(
                    [update_test_case_params.test_case_id]
                )
                if not test_case:
                    raise ValueError(
                        f"Test Case with id {update_test_case_params.test_case_id} not found"
                    )
                else:
                    update_test_case_params.test_case_description = test_case[
                        0
                    ].test_case_description
                    update_test_case_params.test_case_steps = [
                        TestCaseStep(**step.model_dump())
                        for step in test_case[0].test_case_steps
                    ]
                    update_test_case_params.preconditions = test_case[0].preconditions
                    update_test_case_params.feature_id = test_case[0].feature_id
                    update_test_case_params.criticality = test_case[0].criticality
                    update_test_case_params.screenshot_url = test_case[0].screenshot_url
                    update_test_case_params.title = test_case[0].title
                    update_test_case_params.metadata = test_case[0].metadata

            updated_test_case_under_exec = (
                self.datastore.update_test_case_under_execution(update_test_case_params)
            )

            # Check if all test cases under this test run are PASSED or FAILED
            test_cases_under_execution = self.datastore.get_test_cases_under_execution(
                updated_test_case_under_exec.test_run_id
            )
            if test_cases_under_execution:
                all_completed = all(
                    tc.status
                    in [
                        ExecutionStatus.PASSED,
                        ExecutionStatus.FAILED,
                        ExecutionStatus.SKIPPED,
                    ]
                    for tc in test_cases_under_execution
                )
                if all_completed:
                    orionis_log(
                        f"All test cases under test run {updated_test_case_under_exec.test_run_id} are completed."
                    )

                    test_run = self.test_run_datastore.get_test_run_by_id(
                        updated_test_case_under_exec.test_run_id
                    )
                    if test_run.status != TestRunStatus.COMPLETED:

                        update_params = UpdateTestRunParams(
                            test_run_id=updated_test_case_under_exec.test_run_id,
                            status=TestRunStatus.COMPLETED,
                        )
                        self.test_run_datastore.update_test_run(update_params)
                        # all_have_annotations = len(
                        #     test_cases_under_execution
                        # ) > 0 and all(
                        #     tc.annotations for tc in test_cases_under_execution
                        # )
                        # if all_have_annotations:
                        #     self.user_service.send_test_run_completion_email(
                        #         user_id, updated_test_case_under_exec.test_run_id
                        #     )
                        #     orionis_log(
                        #         f"Completion email sent for test run {test_run.test_run_id}."
                        #     )
                        # else:
                        #     orionis_log(
                        #         f"Test run {test_run.test_run_id} completed but not all TCUEs have annotations. Email suppressed."
                        #     )
                else:
                    orionis_log(
                        f"Not all test cases under test run {updated_test_case_under_exec.test_run_id} are completed."
                    )
                    update_params = UpdateTestRunParams(
                        test_run_id=updated_test_case_under_exec.test_run_id,
                        status=TestRunStatus.PROCESSING,
                    )
                    self.test_run_datastore.update_test_run(update_params)

            if (
                config.environment == Config.PRODUCTION
                and updated_test_case_under_exec.comments
                and update_test_case_params.comments
                and updated_test_case_under_exec.comments
                != update_test_case_params.comments
            ):
                comments = json.loads(updated_test_case_under_exec.comments)
                comment = comments[0]["text"]
                name = comments[0]["userName"]
                self.notification_service.notify_slack(
                    (
                        f":memo: Test Case Under Execution Updated! :memo:\n\n"
                        f"• Test Case Under Execution Id: `{update_test_case_params.test_case_under_execution_id}`\n"
                        f"• Status: `{update_test_case_params.status}`\n"
                        f"• Comment: `{comment}`\n"
                        f"• Commented by: `{name}`\n"
                        f"• TCUE Link: `"
                        f"{Constants.DOMAIN}/"
                        f"{updated_test_case_under_exec.product_id}/"
                        f"test-runs?"
                        f"featureId=&{updated_test_case_under_exec.feature_id or ''}&"
                        f"showFlows=true&"
                        f"testRunId={updated_test_case_under_exec.test_run_id}&"
                        f"flow_id={updated_test_case_under_exec.flow_id}&"
                        f"tcue={updated_test_case_under_exec.id}`\n"
                    ),
                    config.customer_comments_webhook_url,
                )

            return ApiResponseEntity(
                response={
                    "updated_test_case_under_execution": updated_test_case_under_exec.model_dump(),
                    "message": "Test case under execution updated successfully",
                    "sent_emails": sent_emails.get("sent", []) if sent_emails else [],
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log("ValueError in update_test_case_under_execution:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log("Exception in update_test_case_under_execution:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def get_test_cases_under_execution(
        self, request: ApiRequestEntity
    ) -> ApiResponseEntity:

        if request.method != ApiRequestEntity.API_METHOD_GET:
            return ApiResponseEntity(
                response={"error": "Method must be GET"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            test_run_id = request.data.get("test_run_id")

            if not test_run_id:
                raise ValueError("Test Run ID is required")

            orionis_log(
                f"Fetching test cases under execution for test_run_id: {test_run_id}"
            )

            test_cases_under_execution = (
                self.datastore.get_test_cases_under_execution(test_run_id) or []
            )

            return ApiResponseEntity(
                response={
                    "test_run_id": test_run_id,
                    "test_cases": (
                        [
                            test_case.model_dump()
                            for test_case in test_cases_under_execution
                        ]
                        if test_cases_under_execution
                        else []
                    ),
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log("ValueError in get_test_cases_under_execution:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )

        except Exception as e:
            orionis_log("Exception in get_test_cases_under_execution:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def _read_blob_as_text(self, blob_uri: str) -> str:
        local_file = self.storage_client.download_file_locally(
            blob_uri,
            use_constructed_bucket_name=False,
        )
        try:
            with open(local_file, "r", encoding="utf-8") as file_obj:
                return file_obj.read()
        finally:
            if os.path.exists(local_file):
                os.remove(local_file)

    def _get_sorted_log_files(self, bucket_name: str, base_path: str) -> List[str]:
        """Get sorted list of log.json files from the bucket."""
        blobs = self.storage_client.list_blobs(
            bucket_name=bucket_name,
            prefix=base_path,
            use_constructed_bucket_name=False,
        )
        return sorted(
            [blob_uri for blob_uri in blobs if blob_uri.endswith("log.json")]
        )

    def _construct_nova_media_url(self, media_path: str) -> str:
        base_url = f"{Constants.GOOGLE_CLOUD_STORAGE_URL_PREFIX}nova_assets{'-prod' if config.environment == Config.PRODUCTION else ''}"
        return f"{base_url}/{media_path.lstrip('/')}"

    def _process_execution_data(
        self, sorted_blobs: List[str], file_path: str
    ) -> tuple[list, list]:
        """Process execution data from log files and create test case steps."""
        test_case_steps: List[TestCaseStep] = []
        preconditions: List[str] = []

        for blob_uri in sorted_blobs:
            blob_content = self._read_blob_as_text(blob_uri)
            _, blob_name = self.storage_client.parse_uri(blob_uri)
            try:
                execution_data = (
                    self.request_validator.validate_update_nova_execution_data_params(
                        json.loads(blob_content)
                    )
                )
                if execution_data.test_case is not None:
                    test_case_step = TestCaseStep(
                        test_step_id=str(uuid4()),
                        step_description=execution_data.test_case.step_description
                        or "",
                        expected_results=execution_data.test_case.expected_results
                        or [],
                    )
                    test_case_steps.append(test_case_step)
                    preconditions.extend(execution_data.test_case.preconditions or [])

                if blob_name == file_path:
                    break
            except KeyError as e:
                orionis_log(f"Missing key in log.json file {blob_name}: {str(e)}")
                raise ValueError(f"Missing key in {blob_name}: {str(e)}")
            except Exception as e:
                orionis_log(
                    f"Unexpected error parsing log.json file {blob_name}: {str(e)}", e
                )
                raise ValueError(f"Unexpected error in {blob_name}: {str(e)}")

        return test_case_steps, preconditions

    def _create_update_params_tcue(
        self,
        execution_data: UpdateNovaExecutionData,
        test_case_steps: list,
        preconditions: list,
    ) -> UpdateTestCaseUnderExecutionParams:
        """Create update parameters for test case under execution."""
        self.storage_client.store_file(
            json.dumps(
                {
                    "nova_test_case_steps": [step.dict() for step in test_case_steps],
                    "nova_preconditions": preconditions,
                }
            ),
            "nova_assets",
            f"{execution_data.product_id}/{execution_data.test_run_id}/{execution_data.test_case_under_execution_id}/metadata.json",
            "application/json",
        )
        return UpdateTestCaseUnderExecutionParams(
            test_case_under_execution_id=str(
                execution_data.test_case_under_execution_id
            ),
            status=ExecutionStatus(execution_data.status),
            execution_video_url=(
                self._construct_nova_media_url(execution_data.execution_video_url)
                if execution_data.execution_video_url
                else None
            ),
            screenshot_url=(
                self._construct_nova_media_url(execution_data.before_ss_url)
                if execution_data.before_ss_url
                else None
            ),
            notes=execution_data.explanation,
        )

    def _create_update_params_test_case(
        self,
        execution_data: UpdateNovaExecutionData,
        test_case_steps: list,
        preconditions: list,
    ) -> UpdateTestCaseRequestParams:
        """Create update parameters for test case."""
        return UpdateTestCaseRequestParams(
            test_case_id=str(execution_data.test_case_id),
            status=TestCaseStatus.VERIFIED,
            screenshot_url=self._construct_nova_media_url(
                execution_data.before_ss_url or ""
            ),
            test_case_steps=test_case_steps,
            preconditions=preconditions,
        )

    def _apply_scenario_params(
        self,
        params: T,
        scenario_params: dict | None = None,
    ) -> T:
        """Apply scenario parameter replacements for both create and update payloads.
        If scenario_params is provided, it overrides params.scenario_parameters.
        Returns an object of the same type as the input.
        """
        try:
            effective_params = (
                scenario_params or getattr(params, "scenario_parameters", {}) or {}
            )
            if not effective_params:
                return params

            data = params.model_dump()
            updated = self._apply_scenario_params_common(data, effective_params)

            if isinstance(params, CreateTestCaseUnderExecutionParams):
                return CreateTestCaseUnderExecutionParams(**updated)
            elif isinstance(params, UpdateTestCaseUnderExecutionParams):
                return UpdateTestCaseUnderExecutionParams(**updated)
            else:
                return params
        except Exception as e:
            orionis_log("Error applying scenario params to TCUE payload", e)
            return params

    def _apply_scenario_params_common(self, data: dict, scenario_params: dict) -> dict:
        """Apply scenario parameter replacements for both create and update payloads."""
        try:
            if not scenario_params:
                return data

            data_without_scenario = {
                k: v for k, v in data.items() if k != "scenario_parameters"
            }

            for parameter_name, parameter_value in scenario_params.items():
                for key, value in list(data_without_scenario.items()):
                    data_without_scenario[key] = replace_param_recursive(
                        value, parameter_name, parameter_value
                    )

            data_without_scenario["scenario_parameters"] = scenario_params
            return data_without_scenario
        except Exception as e:
            orionis_log("Error applying scenario params to TCUE payload", e)
            return data

    def update_nova_execution_data(
        self, request: ApiRequestEntity
    ) -> ApiResponseEntity:
        """Main method to handle nova execution data updates.
        Accepts the log data directly in the request body (replaces EventArc/GCS trigger).
        """
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            orionis_log(
                f"Recieved request to update test case under execution: {request}"
            )
            data = request.data
            orionis_log(f"Extracted data for update execution: {data}")

            # Validate the log data directly
            update_nova_execution_data_params = (
                self.request_validator.validate_update_nova_execution_data_params(
                    data
                )
            )
            orionis_log(
                f"Updated log file from nova: {update_nova_execution_data_params}"
            )

            # Extract test_case_steps and preconditions from the log data
            test_case_steps: list[TestCaseStep] = []
            preconditions: list[str] = []
            test_case_data = data.get("test_case")
            if test_case_data and isinstance(test_case_data, dict):
                step_desc = test_case_data.get("step_description", "")
                expected_results = test_case_data.get("expected_results") or []
                if step_desc:
                    test_case_step = TestCaseStep(
                        test_step_id=str(uuid4()),
                        step_description=step_desc,
                        expected_results=expected_results,
                    )
                    test_case_steps.append(test_case_step)
                preconditions.extend(test_case_data.get("preconditions") or [])

            orionis_log(
                f"test_case_steps; {test_case_steps} and preconds: {preconditions}"
            )

            # Update test case
            update_params_tcue = self._create_update_params_tcue(
                update_nova_execution_data_params, test_case_steps, preconditions
            )

            orionis_log(f"Update Params: {update_params_tcue}")
            tcue = self.datastore.update_test_case_under_execution(update_params_tcue)

            product_details = self.product_datastore.get_product_from_id(
                str(update_nova_execution_data_params.product_id)
            )

            if config.environment == Config.PRODUCTION:
                self.notification_service.notify_slack(
                    (
                        f":wrench: Nova Execution Data Updated! :wrench:\n\n"
                        f"• Product Name: `{product_details.product_name}`\n"
                        f"• TCUE Ttitle: `{tcue.title}`\n"
                        f"• Status: `{update_nova_execution_data_params.status}`\n"
                        f"• TestRun Link: `"
                        f"{Constants.DOMAIN}/"
                        f"{update_nova_execution_data_params.product_id}/"
                        "test-runs?"
                        f"featureId={tcue.feature_id}"
                        "&showFlows=true"
                        f"&testRunId={update_nova_execution_data_params.test_run_id}"
                        f"&flow_id={tcue.flow_id}`\n"
                        f":rocket: Test case has been enriched with the latest execution insights!"
                    ),
                    config.test_run_update_webhook_url,
                )
            return ApiResponseEntity(
                response={
                    "message": f"Successfully processed execution data for tcue_id: {update_nova_execution_data_params.test_case_under_execution_id}",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(
                f"ValueError occured while updating nova's execution data: {e}", e
            )
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Error occured while updating nova's execution data: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def delete_test_cases_under_execution(
        self, request: ApiRequestEntity
    ) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_DELETE:
            return ApiResponseEntity(
                response={"error": "Method must be DELETE"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            orionis_log(f"Received delete request: {request.data}")

            delete_test_case_params = self.request_validator.validate_delete_test_case_under_execution_from_test_run_params(
                request.data
            )

            orionis_log(
                f"Deleting test case under execution with ids: {delete_test_case_params.test_case_under_execution_ids}"
            )

            deleted_test_case_ids = self.datastore.delete_test_cases_under_execution(
                delete_test_case_params.test_case_under_execution_ids
            )

            return ApiResponseEntity(
                response={
                    "test_case_execution_ids": deleted_test_case_ids,
                    "message": "Test case under execution removed from test run successfully",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log("ValueError in delete_test_cases_under_execution:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log("Exception in delete_test_cases_under_execution:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def get_usage_data_for_organisation(
        self, request: ApiRequestEntity
    ) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_GET:
            return ApiResponseEntity(
                response={"error": "Method must be GET"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            orionis_log(f"Received request data: {request.data}")

            params = self.request_validator.validate_get_usage_data_params(request)

            orionis_log(f"Validated params: {params}")

            # Here Used the existing ProductDatastore method to get products for the organisation
            products = self.product_service.datastore.get_all_products(
                params.organisation_id
            )

            organisation = self.org_datastore.get_organisation(params.organisation_id)

            purchases = self.purchase_datastore.get_purchases_for_organisation(
                params.organisation_id
            )
            purchase_history = purchases

            if not products:
                orionis_log(
                    f"No products found for organisation {params.organisation_id}"
                )
                return ApiResponseEntity(
                    response=UsageDataResponse(
                        status="success",
                        message="No products found for this organisation",
                        data=[],
                        qubit_balance=organisation.qubit_balance,
                        stripe_customer_id=organisation.stripe_customer_id,
                        auto_reload_enabled=organisation.auto_reload_enabled,
                        auto_reload_threshold=organisation.auto_reload_threshold,
                        auto_reload_amount=organisation.auto_reload_amount,
                        purchase_history=purchase_history,
                    ).model_dump(),
                    status_code=ApiResponseEntity.HTTP_STATUS_OK,
                )

            # Extracting product IDs and creating a product map
            product_ids = [product.product_id for product in products]
            product_map = {
                product.product_id: product.product_name for product in products
            }
            orionis_log(
                f"Found {len(product_ids)} products for organisation {params.organisation_id}: {product_ids}"
            )

            # Get all usage data for the products grouped by product_id
            product_usage_map = self.datastore.get_usage_data_for_products(product_ids)

            # Structure the response with product details
            product_usage_list = []
            for product_id in product_ids:
                monthly_usage = product_usage_map.get(product_id, [])
                product_usage_list.append(
                    ProductUsageData(
                        product_id=product_id,
                        product_name=product_map.get(product_id) or "Unknown",
                        monthly_usage=monthly_usage,
                    )
                )

            response_data = UsageDataResponse(
                status="success",
                message="Usage data fetched successfully",
                data=product_usage_list,
                qubit_balance=organisation.qubit_balance,
                stripe_customer_id=organisation.stripe_customer_id,
                auto_reload_enabled=organisation.auto_reload_enabled,
                auto_reload_threshold=organisation.auto_reload_threshold,
                auto_reload_amount=organisation.auto_reload_amount,
                purchase_history=purchase_history,
            )

            return ApiResponseEntity(
                response=response_data.model_dump(),
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(
                f"Validation error in get_usage_data_for_organisation: {str(e)}", e
            )
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log("Error in get_usage_data_for_organisation", e)
            return ApiResponseEntity(
                response={"error": "Internal server error"},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def copy_test_case_under_execution_for_product(
        self, request: ApiRequestEntity
    ) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Only POST method is allowed for this function."},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            data = self.request_validator.validate_copy_test_case_under_execution_for_product_request_params(
                request
            )
            from_product_id = data.from_product_id
            to_product_id = data.to_product_id
            orionis_log(f"from_product_id: {from_product_id}")
            orionis_log(f"to_product_id: {to_product_id}")
            test_case_under_execution_ids = data.test_case_under_execution_ids
            test_run_id = data.to_test_run_id
            if not test_run_id:
                test_runs = self.test_run_datastore.get_test_runs(to_product_id)
                if not test_runs:
                    raise ValueError("No test run found for product")
                test_run_id = test_runs[0].test_run_id
            orionis_log(f"test_run_id: {test_run_id}")

            orionis_log(
                f"test_case_under_execution_ids: {test_case_under_execution_ids}"
            )

            test_cases_under_execution = (
                self.datastore.get_test_case_under_execution_by_ids(
                    test_case_under_execution_ids
                )
            )

            test_case_ids_unsorted = [
                test_case_under_execution.test_case_id
                for test_case_under_execution in test_cases_under_execution
            ]
            source_test_cases = self.test_case_datastore.fetch_test_cases_by_ids(
                test_case_ids_unsorted
            )
            test_case_ids = [test_case.test_case_id for test_case in source_test_cases]
            copied_test_case_ids_response = (
                self.test_case_service.copy_test_cases_for_product(
                    request=ApiRequestEntity(
                        data={
                            "from_product_id": from_product_id,
                            "to_product_id": to_product_id,
                            "test_case_ids": test_case_ids,
                        },
                        method=ApiRequestEntity.API_METHOD_POST,
                    ),
                )
            )

            copied_test_case_ids = []
            old_to_new_test_case_ids = {}
            if isinstance(copied_test_case_ids_response.response, dict):
                copied_test_case_ids = copied_test_case_ids_response.response.get(
                    "copied", []
                )
                old_to_new_test_case_ids = copied_test_case_ids_response.response.get(
                    "mapping", {}
                )
            else:
                copied_test_case_ids = copied_test_case_ids_response.response

            copied_test_cases = (
                self.test_case_service.datastore.fetch_test_cases_by_ids(
                    copied_test_case_ids
                )
            )

            copied_test_case_map = {tc.test_case_id: tc for tc in copied_test_cases}

            copied_test_case_under_execution_ids: list[str] = []
            for test_case_under_execution in test_cases_under_execution:
                old_test_case_id = test_case_under_execution.test_case_id
                new_test_case_id = old_to_new_test_case_ids.get(old_test_case_id)
                if not new_test_case_id:
                    raise ValueError(
                        f"No copied test case ID found for original test case ID: {old_test_case_id}"
                    )

                copied_test_case = copied_test_case_map.get(new_test_case_id)
                if not copied_test_case:
                    raise ValueError(
                        f"Copied test case not found for ID {new_test_case_id}"
                    )

                orionis_log(f"copied_test_case: {copied_test_case}")
                new_feature_id = copied_test_case.feature_id
                orionis_log(f"new_feature_id: {new_feature_id}")

                new_entity = CreateTestCaseUnderExecutionParams(
                    test_case_id=new_test_case_id,
                    test_run_id=test_run_id,
                    product_id=to_product_id,
                    feature_id=new_feature_id,
                    functionality_id=test_case_under_execution.functionality_id,
                    request_id=test_case_under_execution.request_id,
                    assignee_user_id=test_case_under_execution.assignee_user_id,
                    status=test_case_under_execution.status,
                    criticality=test_case_under_execution.criticality,
                    notes=test_case_under_execution.notes,
                    comments=test_case_under_execution.comments,
                    rationale=test_case_under_execution.rationale,
                    screenshot_url=test_case_under_execution.screenshot_url,
                    execution_video_url=test_case_under_execution.execution_video_url,
                    test_case_description=test_case_under_execution.test_case_description,
                    test_case_steps=test_case_under_execution.test_case_steps,
                    test_case_type=test_case_under_execution.test_case_type,
                    preconditions=test_case_under_execution.preconditions,
                    metadata=test_case_under_execution.metadata,
                    title=test_case_under_execution.title,
                    annotations=test_case_under_execution.annotations,
                    scenario_parameters=test_case_under_execution.scenario_parameters,
                )

                new_entity = self._apply_scenario_params(new_entity)
                result = self.datastore.add_test_case_under_execution(new_entity)
                if result:
                    copied_test_case_under_execution_ids.append(result)
                    orionis_log(
                        f"Copied TestCaseUnderExecution for test_case_id: {new_test_case_id}"
                    )
                else:
                    raise ValueError(
                        f"Failed to copy TestCaseUnderExecution for test_case_id: {old_test_case_id}"
                    )

            response = {
                "message": f"{len(copied_test_case_under_execution_ids)} test case under execution copied successfully.",
                "copied": copied_test_case_under_execution_ids,
            }

            return ApiResponseEntity(
                response=response,
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except Exception as e:
            orionis_log("Error in copy_test_cases_for_product:", e)
            return ApiResponseEntity(
                response={"error": "Internal server error"},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def assign_tcue_to_users(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:

            orionis_log(f"Request data: {request.data}")
            assign_tcue_params = self.request_validator.validate_assign_test_case_under_execution_to_users_params(
                request
            )

            orionis_log(
                f"Assigning test case under execution with ids: {assign_tcue_params.test_case_under_execution_ids}"
            )

            response_data = self.datastore.set_assignee(assign_tcue_params)
            orionis_log(
                f"Test case under execution assigned to users successfully: {response_data}"
            )

            if assign_tcue_params.assignee_user_id == Constants.FIELD_NOVA:
                try:
                    context = self.datastore.get_goal_planning_context(response_data)
                    test_run = self.test_run_datastore.get_test_run_by_id(
                        context.get(Constants.FIELD_TEST_RUN_ID, "")
                    )

                    build_details = self.test_build_datastore.get_test_build_details(
                        test_run.test_build_id
                    )
                    payload = {
                        Constants.FIELD_TEST_RUN_ID: context.get(
                            Constants.FIELD_TEST_RUN_ID
                        ),
                        Constants.FIELD_PRODUCT_ID: context.get(
                            Constants.FIELD_PRODUCT_ID
                        ),
                        Constants.FIELD_EXECUTABLE_URL: build_details.executable_url,
                        Constants.FIELD_PLATFORM_TYPE: build_details.platform,
                        Constants.FIELD_TEST_CASE_IDS: context.get(
                            Constants.FIELD_TEST_CASE_IDS
                        )
                        or [],
                        Constants.FIELD_TEST_CASE_UNDER_EXECUTION_IDS: context.get(
                            Constants.FIELD_TEST_CASE_UNDER_EXECUTION_IDS
                        )
                        or [],
                        Constants.FIELD_BUILD_NUMBER: test_run.build_number,
                    }
                    self.cloud_task_service.enqueue_task_v1(
                        payload=payload,
                        handler_function_name=self.USER_GOAL_PLANNING_HANDLER_FUNCTION_NAME,
                        queue_name=Constants.USER_GOAL_TASK_QUEUE_NAME,
                    )
                    orionis_log(
                        f"Goal planning triggered for test run id: {test_run.test_run_id}, "
                        f"device: {test_run.device_name}, "
                        f"build number: {test_run.build_number}"
                    )
                except Exception as e:
                    orionis_log(
                        f"Error during goal planning for test case under execution ids: {response_data}. "
                        f"The assignment succeeded but goal planning failed.",
                        e,
                    )

            return ApiResponseEntity(
                response={
                    "test_case_execution_ids": response_data,
                    "message": "Test case under execution assigned to users successfully",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log("ValueError in assign_tcue_to_users:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log("Exception in assign_tcue_to_users:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def sync_tcue_in_test_run(self, request: ApiRequestEntity) -> ApiResponseEntity:
        """Sync test cases under execution in a test run."""
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            data = request.data
            orionis_log(f"Request data: {data}")

            test_run_id = data.get("test_run_id")
            preview = data.get("preview", False)

            if not test_run_id:
                raise ValueError("Test run ID is required")

            if preview:
                return self._preview_sync_tcue_in_test_run(test_run_id)
            else:
                return self._execute_sync_tcue_in_test_run(test_run_id)

        except Exception as e:
            orionis_log("Error syncing TCUE in test run:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def _preview_sync_tcue_in_test_run(self, test_run_id: str) -> ApiResponseEntity:
        """Preview what changes will be made during sync without executing them."""
        return self._sync_tcue_in_test_run_internal(test_run_id, preview=True)

    def _execute_sync_tcue_in_test_run(self, test_run_id: str) -> ApiResponseEntity:
        """Execute the actual sync operations."""
        return self._sync_tcue_in_test_run_internal(test_run_id, preview=False)

    def _sync_tcue_in_test_run_internal(
        self, test_run_id: str, preview: bool
    ) -> ApiResponseEntity:
        try:
            test_cases_under_execution = self.datastore.get_test_cases_under_execution(
                test_run_id
            )
            orionis_log(
                f"{'Preview: ' if preview else ''}Test cases under execution in test run {test_run_id}: "
                f"{test_cases_under_execution}"
            )

            updated_count = 0
            created_count = 0
            deleted_tcue_ids: list[str] = []
            flow_to_tcues: dict[str, list[TestCaseUnderExecution]] = {}
            for tcue in test_cases_under_execution:
                if tcue.flow_id:
                    if tcue.flow_id not in flow_to_tcues:
                        flow_to_tcues[tcue.flow_id] = []
                    flow_to_tcues[tcue.flow_id].append(tcue)
                else:
                    orionis_log(
                        f"{'Preview: ' if preview else ''}TCUE {tcue.id} has no flow_id, "
                        f"{'will be deleted' if preview else 'marking for deletion'}"
                    )
                    deleted_tcue_ids.append(tcue.id)

            for flow_id, tcue_list in flow_to_tcues.items():
                test_case = self.test_case_datastore.fetch_test_cases_by_ids(
                    [tcue_list[0].test_case_id]
                )
                if not test_case or not test_case[0]:
                    orionis_log(
                        f"{'Preview: ' if preview else ''}Test case {tcue_list[0].test_case_id} not found, "
                        f"searching for test case with matching flow_id {flow_id}"
                    )
                    try:
                        all_test_cases = (
                            self.test_case_datastore.get_test_cases_by_flow_id(flow_id)
                        )
                        if all_test_cases:
                            test_case = [all_test_cases[0]]
                            orionis_log(
                                f"{'Preview: ' if preview else ''}Found test case with matching flow_id {flow_id} "
                                f"(test_case_id: {all_test_cases[0].test_case_id})"
                            )
                        else:
                            orionis_log(
                                f"{'Preview: ' if preview else ''}No test case found with flow_id {flow_id} - "
                                f"{'TCUEs will be deleted' if preview else 'marking TCUEs for deletion'}"
                            )
                            deleted_tcue_ids.extend([tcue.id for tcue in tcue_list])
                            continue
                    except Exception as e:
                        orionis_log(
                            f"{'Preview: ' if preview else ''}Error searching for test case with flow_id {flow_id}:",
                            e,
                        )
                        continue

                if preview:
                    batch_result = self._preview_sync_tcue_batch_for_test_case(
                        test_case[0].test_case_id, tcue_list, test_case
                    )
                else:
                    batch_result = self._sync_tcue_batch_for_test_case(
                        test_case[0].test_case_id, tcue_list, test_case
                    )

                deleted_tcue_ids.extend(batch_result["deleted"])
                updated_count += batch_result["updated"]
                created_count += batch_result["created"]

            if not preview and deleted_tcue_ids:
                self.datastore.delete_test_cases_under_execution(deleted_tcue_ids)
                orionis_log(f"Test cases under execution {deleted_tcue_ids} deleted")

            if preview:
                deleted_count = len(deleted_tcue_ids)
                return ApiResponseEntity(
                    response={
                        "message": "Preview of sync operations",
                        "preview": True,
                        "operations": {
                            "will_create": created_count,
                            "will_update": updated_count,
                            "will_delete": deleted_count,
                            "total_affected": created_count
                            + updated_count
                            + deleted_count,
                        },
                    },
                    status_code=ApiResponseEntity.HTTP_STATUS_OK,
                )
            else:
                return ApiResponseEntity(
                    response={
                        "message": "Test cases under executions synced successfully",
                        "count_of_synced_test_cases_under_execution": created_count
                        + updated_count
                        + len(deleted_tcue_ids),
                    },
                    status_code=ApiResponseEntity.HTTP_STATUS_OK,
                )
        except Exception as e:
            orionis_log(
                f"Error in {'preview' if preview else 'execute'} sync TCUE in test run:",
                e,
            )
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def _sync_tcue_batch_for_test_case(
        self,
        test_case_id: str,
        tcue_list: list[TestCaseUnderExecution],
        test_cases: list[RawTestCase],
    ) -> dict:
        """Process all TCUEs for a single test case in batch using a shared plan.
        Returns dict with counts of deleted, updated, and created TCUEs."""
        try:
            plan = self._plan_tcue_batch_for_test_case(
                test_case_id, tcue_list, test_cases
            )

            created_count = 0
            if plan["to_create"]:
                for entity in plan["to_create"]:
                    new_id = self.datastore.add_test_case_under_execution(entity)
                    if new_id:
                        created_count += 1

            updated_count = 0
            if plan["to_update"]:
                self.datastore.update_test_cases_under_execution_batch(
                    plan["to_update"]
                )
                updated_count = len(plan["to_update"])
                orionis_log(
                    f"Batch updated {updated_count} test cases under execution for test case {test_case_id}"
                )

            return {
                "deleted": plan["to_delete_ids"],
                "updated": updated_count,
                "created": created_count,
            }
        except Exception as e:
            orionis_log(f"Error syncing TCUE batch for test case {test_case_id}:", e)
            raise e

    def _preview_sync_tcue_batch_for_test_case(
        self,
        test_case_id: str,
        tcue_list: list[TestCaseUnderExecution],
        test_cases: list[RawTestCase],
    ) -> dict:
        """Preview via shared planning function; returns counts only."""
        try:
            plan = self._plan_tcue_batch_for_test_case(
                test_case_id, tcue_list, test_cases
            )
            return {
                "deleted": plan["to_delete_ids"],
                "updated": len(plan["to_update"]),
                "created": len(plan["to_create"]),
            }
        except Exception as e:
            orionis_log(
                f"Error previewing sync TCUE batch for test case {test_case_id}:", e
            )
            raise e

    def _plan_tcue_batch_for_test_case(
        self,
        test_case_id: str,
        tcue_list: list[TestCaseUnderExecution],
        test_cases: list[RawTestCase],
    ) -> dict:
        """Create a plan for a single test case: which TCUEs to create, update, delete.
        Returns a dict with keys: to_create, to_update, to_delete_ids."""
        deleted_tcue_ids: list[str] = []
        update_params_list: list[UpdateTestCaseUnderExecutionParams] = []
        create_entities: list[CreateTestCaseUnderExecutionParams] = []

        test_case_steps: list[TestCaseStep] = [
            TestCaseStep(**step.model_dump()) for step in test_cases[0].test_case_steps
        ]

        test_case_id_value = test_case_id
        feature_id_value = test_cases[0].feature_id
        criticality_value = test_cases[0].criticality
        screenshot_url_value = test_cases[0].screenshot_url
        test_case_description_value = test_cases[0].test_case_description
        test_case_steps_value = test_case_steps
        preconditions_value = test_cases[0].preconditions
        metadata_value = test_cases[0].metadata
        title_value = test_cases[0].title
        flow_id_value = test_cases[0].flow_id

        test_case_entity = test_cases[0]
        test_case_scenarios = test_case_entity.scenarios or []
        test_case_param_dicts = [
            dict(
                sorted(
                    {
                        p.parameter_name: p.parameter_value
                        for p in (scenario.params or [])
                        if p.parameter_name and p.parameter_value
                    }.items()
                )
            )
            for scenario in test_case_scenarios
        ]

        try:
            existing_tcue_params = [
                dict(sorted((tcue.scenario_parameters or {}).items()))
                for tcue in (tcue_list or [])
            ]

            for params in test_case_param_dicts:
                if not any(params == existing for existing in existing_tcue_params):
                    orionis_log(f"Planning create TCUE for new scenario: {params}")
                    source_tcue = tcue_list[0]
                    new_entity = CreateTestCaseUnderExecutionParams(
                        test_case_id=test_case_id_value,
                        test_run_id=source_tcue.test_run_id,
                        product_id=source_tcue.product_id,
                        feature_id=feature_id_value,
                        status=ExecutionStatus.UNTESTED,
                        criticality=criticality_value,
                        screenshot_url=screenshot_url_value or "",
                        test_case_description=test_case_description_value or "",
                        test_case_steps=test_case_steps_value or [],
                        preconditions=preconditions_value or [],
                        metadata=metadata_value,
                        title=title_value or "",
                        scenario_parameters=params,
                        flow_id=flow_id_value,
                        functionality_id=test_cases[0].functionality_id or "",
                        request_id=test_cases[0].request_id or "",
                        notes="",
                        rationale="",
                        test_case_type=test_cases[0].test_case_type or "SMOKE",
                        execution_video_url="",
                    )
                    new_entity = self._apply_scenario_params(new_entity)
                    create_entities.append(new_entity)
        except Exception as e:
            orionis_log(
                f"Error planning TCUEs for new scenarios for TC_id {test_case_id}:", e
            )

        for tcue in tcue_list:
            update_tcue_params = UpdateTestCaseUnderExecutionParams(
                test_case_under_execution_id=tcue.id,
                test_case_id=test_case_id_value,
                feature_id=feature_id_value,
                criticality=criticality_value,
                screenshot_url=screenshot_url_value,
                test_case_description=test_case_description_value,
                test_case_steps=test_case_steps_value,
                preconditions=preconditions_value,
                metadata=metadata_value,
                title=title_value,
                flow_id=flow_id_value,
                scenario_parameters=tcue.scenario_parameters,
            )

            update_tcue_params = self._apply_scenario_params(
                update_tcue_params, tcue.scenario_parameters or {}
            )

            deleting_tcue_id = self.check_delete_test_case_under_execution_scenario(
                tcue, test_case_param_dicts
            )
            if deleting_tcue_id == tcue.id:
                deleted_tcue_ids.append(tcue.id)
                continue
            else:
                update_params_list.append(update_tcue_params)

        return {
            "to_create": create_entities,
            "to_update": update_params_list,
            "to_delete_ids": deleted_tcue_ids,
        }

    def check_delete_test_case_under_execution_scenario(
        self,
        tcue: TestCaseUnderExecution,
        test_case_param_dicts: list[dict],
    ) -> str | None:
        """Delete TCUE if the scenario is not present in the test case"""
        try:
            current_params = dict(sorted((tcue.scenario_parameters or {}).items()))

            if not current_params and not test_case_param_dicts:
                orionis_log(
                    f"TCUE {tcue.id} - Both current and test case params are empty, keeping TCUE"
                )
                return None

            if not any(current_params == params for params in test_case_param_dicts):
                orionis_log(f"Scenario deleted — removing TCUE {tcue.id}")
                return tcue.id

            return None

        except Exception as e:
            orionis_log("Error syncing TCUE scenario:", e)
            raise e
