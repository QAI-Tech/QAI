import logging
from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from test_runs.test_run_datastore import TestRunDatastore
from test_runs.test_run_models import TestRun, AddTestRunParams
from test_runs.test_run_request_validator import TestRunRequestValidator
from utils.util import orionis_log
from constants import Constants
from services.notify_service.notify import NotificationService
from factory.core_fac import create_test_case_planning_service
from services.cloud_service.cloud_tasks import CloudTaskService
from common.google_cloud_wrappers import GCPDatastoreWrapper
from users.user_service import UserService
from config import Config, config
from users.user_datastore import UserDatastore
from users.user_request_validator import UserRequestValidator
from products.product_datastore import ProductDatastore
from mixpanel_integration.mixpanel_service import mixpanel

logger = logging.getLogger(__name__)


class TestRunService:
    def __init__(
        self, request_validator: TestRunRequestValidator, datastore: TestRunDatastore
    ):
        self.request_validator = request_validator
        self.datastore = datastore
        self.notification_service = NotificationService()
        self.test_case_planning_service = create_test_case_planning_service()
        self.cloud_task_service = CloudTaskService()
        self.USER_GOAL_PLANNING_HANDLER_FUNCTION_NAME = "UserGoalPlanningHandler"
        self.FLOW_PROCESSING_HANDLER_FUNCTION_NAME = "ProcessFlowsForTestRunHandler"
        self.db = GCPDatastoreWrapper().get_datastore_client()
        self.user_service = UserService(UserRequestValidator(), UserDatastore())
        self.product_datastore = ProductDatastore()

    def add_test_run(
        self, request: ApiRequestEntity, user_id: str
    ) -> ApiResponseEntity:

        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            orionis_log(f"Adding test run {request.data}")

            test_run_params = (
                self.request_validator.validate_add_test_run_request_params(
                    request.data
                )
            )
            test_run_query = self.datastore.db.query(
                kind=Constants.ENTITY_KIND_TEST_RUN
            )
            test_run_query.add_filter(
                Constants.FIELD_PRODUCT_ID, "=", test_run_params.product_id
            )
            test_runs: list[TestRun] = self.datastore.add_test_run(
                test_run_params, user_id
            )
            orionis_log(
                f"Created {len(test_runs)} test runs successfully with build number: {test_run_params.build_number}"
            )

            for test_run in test_runs:

                try:
                    # Get user details for tracking
                    user = self.user_service.get_user(user_id)
                    user_email = user.email if user else None

                    # Get platform information
                    try:
                        test_build_key = self.db.key(
                            "TestBuild", int(test_run.test_build_id)
                        )
                        test_build = self.db.get(test_build_key)
                        platform = test_build.get("platform") if test_build else None
                    except Exception as e:
                        platform = None
                        orionis_log(
                            f"[MIXPANEL] Error retrieving platform information: {str(e)}",
                            e,
                        )

                    properties = {
                        "email": user_email,
                        "test_run_id": test_run.test_run_id,
                        "test_run_name": test_run.test_run_name,
                        "product_id": test_run.product_id,
                        "build_number": test_run.build_number,
                        "platform": platform,
                        "device_name": test_run.device_name or "Not specified",
                        "test_case_count": (
                            len(test_run.test_case_ids)
                            if hasattr(test_run, "test_case_ids")
                            and test_run.test_case_ids
                            else 0
                        ),
                    }

                    # Track the event
                    tracking_result = mixpanel.track(
                        user_id, "Test Run Created", properties
                    )

                    if not tracking_result:
                        orionis_log(
                            f"[MIXPANEL] Failed to track test run creation: {test_run.test_run_id}"
                        )

                except Exception as e:
                    orionis_log(
                        f"[MIXPANEL] Error while tracking test run creation: {str(e)}"
                    )

                test_case_under_execution_ids = (
                    self.datastore.add_new_test_cases_to_test_run(
                        test_run.test_run_id, test_run_params.test_case_ids
                    ).test_case_under_execution_ids
                )
                orionis_log(
                    f"Added test cases to test run: {test_run.test_run_id} "
                    f"for device: {test_run.device_name} "
                    f"with build number: {test_run.build_number}"
                )

                test_build_key = self.db.key("TestBuild", int(test_run.test_build_id))
                test_build = self.db.get(test_build_key)

                orionis_log(
                    f"Processing test run for productId: {test_run.product_id}, "
                    f"device: {test_run.device_name}, "
                    f"build number: {test_run.build_number}, "
                    f"initiating goal planning"
                )

                if test_run_params.send_to_nova and test_build:
                    try:
                        payload = {
                            Constants.FIELD_TEST_RUN_ID: test_run.test_run_id,
                            Constants.FIELD_PRODUCT_ID: test_run.product_id,
                            Constants.FIELD_EXECUTABLE_URL: test_build.get(
                                "executable_url"
                            ),
                            Constants.FIELD_PLATFORM_TYPE: test_build.get(
                                Constants.FIELD_PLATFORM_TYPE
                            ),
                            Constants.FIELD_TEST_CASE_IDS: test_run_params.test_case_ids
                            or [],
                            Constants.FIELD_TEST_CASE_UNDER_EXECUTION_IDS: test_case_under_execution_ids
                            or [],
                            TestRunDatastore.FIELD_BUILD_NUMBER: test_run.build_number,
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
                            f"Error during goal planning for test run {test_run.test_run_id}",
                            e,
                        )
                        raise e
                else:
                    orionis_log(
                        f"Skipping goal planning for test run id: {test_run.test_run_id}, "
                        f"device: {test_run.device_name}, "
                        f"build number: {test_run.build_number}"
                    )

                try:
                    self.notification_service.notify_new_test_run(
                        test_run, user_id, len(test_case_under_execution_ids)
                    )
                    product = self.product_datastore.get_product_from_id(
                        test_run.product_id
                    )
                    if (
                        config.environment == Config.PRODUCTION
                        and product.organisation_id
                        not in (
                            Constants.SUPER_USER_ORG_IDS + Constants.QA_SANDBOX_ORG_IDS
                        )
                    ):

                        user = self.user_service.get_user(user_id)
                        sent_email = self.user_service.send_emails_for_test_run_created(
                            user, test_run, product
                        )
                        orionis_log(
                            f"Sent email to {sent_email['email']} for test run {test_run.test_run_id}"
                        )
                except Exception as e:
                    orionis_log(
                        f"Error notifying new test run {test_run.test_run_id}", e
                    )
                    raise e

            return ApiResponseEntity(
                response={
                    "test_runs": [test_run.model_dump() for test_run in test_runs]
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except ValueError as e:
            orionis_log(f"Value error in add_test_run: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in add_test_run: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def get_test_runs_for_product(self, request: ApiRequestEntity) -> ApiResponseEntity:

        if request.method != ApiRequestEntity.API_METHOD_GET:
            return ApiResponseEntity(
                response={"error": "Method must be GET"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            product_id = request.data.get("product_id")

            if not product_id:
                raise ValueError("Product ID is required")

            orionis_log(f"Fetching test runs for product_id: {product_id}")

            test_runs: list[TestRun] = self.datastore.get_test_runs(product_id) or []

            return ApiResponseEntity(
                response={
                    "product_id": product_id,
                    "test_runs": (
                        [test_run.model_dump() for test_run in test_runs]
                        if test_runs
                        else []
                    ),
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Value error in add_test_run: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in add_test_run: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def add_new_test_cases_to_test_run(
        self, request: ApiRequestEntity
    ) -> ApiResponseEntity:

        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            orionis_log(f"Received update request: {request.data}")

            test_run_id = request.data.get("test_run_id")
            test_case_ids = request.data.get("test_case_ids")
            send_to_nova = request.data.get("send_to_nova", False)
            if not test_run_id:
                raise ValueError("Test run ID is required")

            orionis_log(f"Updating test run with id: {test_run_id}")

            result = self.datastore.add_new_test_cases_to_test_run(
                test_run_id, test_case_ids=test_case_ids
            )
            test_run = self.datastore.get_test_run_by_id(result.test_run_id)
            test_case_under_execution_ids = result.test_case_under_execution_ids
            test_build_key = self.db.key("TestBuild", int(test_run.test_build_id))
            test_build = self.db.get(test_build_key)
            if test_build and send_to_nova:
                try:
                    payload = {
                        Constants.FIELD_TEST_RUN_ID: test_run.test_run_id,
                        Constants.FIELD_PRODUCT_ID: test_run.product_id,
                        Constants.FIELD_EXECUTABLE_URL: test_build.get(
                            "executable_url"
                        ),
                        Constants.FIELD_PLATFORM_TYPE: test_build.get(
                            Constants.FIELD_PLATFORM_TYPE
                        ),
                        Constants.FIELD_TEST_CASE_IDS: test_case_ids or [],
                        Constants.FIELD_TEST_CASE_UNDER_EXECUTION_IDS: test_case_under_execution_ids
                        or [],
                        TestRunDatastore.FIELD_BUILD_NUMBER: test_run.build_number,
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
                        f"Error during goal planning for test run {test_run.test_run_id}",
                        e,
                    )
            else:
                orionis_log(
                    f"Skipping goal planning in non-staging environment for test run id: {test_run.test_run_id}, "
                    f"device: {test_run.device_name}, "
                    f"build number: {test_run.build_number}"
                )
            return ApiResponseEntity(
                response={
                    "test_run_id": result.test_run_id,
                    "message": "Test run updated successfully",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Value error in add_test_run: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in add_test_run: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def add_flows_to_existing_test_run(
        self, request: ApiRequestEntity, user_id: str
    ) -> ApiResponseEntity:
        """
        Add flows to an existing test run without creating a new one.
        This bypasses the test run creation and directly adds flows.
        """
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            orionis_log(f"Adding flows to existing test run: {request.data}")

            test_run_params = self.request_validator.validate_add_flows_to_existing_test_run_request_params(
                request
            )

            # Get existing test run
            test_run = self.datastore.get_test_run_by_id(test_run_params.test_run_id)
            if not test_run:
                raise ValueError(
                    f"Test run with ID {test_run_params.test_run_id} not found"
                )

            orionis_log(
                f"Adding {len(test_run_params.flow_ids)} flows to existing test run: {test_run_params.test_run_id}"
            )
            existing_flow_ids = self.datastore.get_flow_ids_for_test_run(
                test_run_params.test_run_id
            )

            incoming_flow_ids = set(test_run_params.flow_ids)
            new_flow_ids = list(incoming_flow_ids - existing_flow_ids)

            if not new_flow_ids:
                return ApiResponseEntity(
                    response={
                        "test_run_id": test_run_params.test_run_id,
                        "message": "No new flows to add. All flows already exist in test run.",
                    },
                    status_code=ApiResponseEntity.HTTP_STATUS_OK,
                )

            # Process flows for the existing test run
            self.process_flows_for_test_run(
                test_run_id=test_run_params.test_run_id,
                flow_ids=new_flow_ids,
                product_id=test_run_params.product_id,
                user_id=user_id,
                send_to_nova=test_run_params.send_to_nova,
                is_new_test_run=False,
            )

            return ApiResponseEntity(
                response={
                    "test_run_id": test_run_params.test_run_id,
                    "message": f"Successfully added {len(new_flow_ids)} flows to test run",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Value error in add_flows_to_existing_test_run: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in add_flows_to_existing_test_run: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def add_test_run_from_flows(
        self, request: ApiRequestEntity, user_id: str
    ) -> ApiResponseEntity:

        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            orionis_log(f"Adding test run from flows {request.data}")

            test_run_params = (
                self.request_validator.validate_add_test_run_from_flows_request_params(
                    request.data
                )
            )

            test_runs: list[TestRun] = self.datastore.add_test_run(
                AddTestRunParams(
                    product_id=test_run_params.product_id,
                    test_run_name=test_run_params.test_run_name,
                    executable_url=test_run_params.executable_url,
                    test_case_ids=None,  # Not used for flow-based runs
                    acceptance_criteria=test_run_params.acceptance_criteria,
                    device_ids=test_run_params.device_ids,
                    build_number=test_run_params.build_number,
                    send_to_nova=test_run_params.send_to_nova,
                    test_run_type=test_run_params.test_run_type,
                ),
                user_id,
            )

            orionis_log(
                f"Created {len(test_runs)} test runs successfully with build number: {test_run_params.build_number}"
            )

            for test_run in test_runs:
                try:
                    self.process_flows_for_test_run(
                        test_run.test_run_id,
                        test_run_params.flow_ids,
                        test_run.product_id,
                        user_id,
                        test_run_params.send_to_nova,
                        is_new_test_run=True,
                    )
                    orionis_log(
                        f"Processed flows for test run id: {test_run.test_run_id}, "
                        f"device: {test_run.device_name}, "
                        f"build number: {test_run.build_number}, "
                        f"flows: {len(test_run_params.flow_ids)}"
                    )
                except Exception as e:
                    orionis_log(
                        f"Error processing flows for test run {test_run.test_run_id}",
                        e,
                    )

            return ApiResponseEntity(
                response={
                    "test_runs": [test_run.model_dump() for test_run in test_runs]
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Value error in add_test_run_from_flows: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in add_test_run_from_flows: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def process_flows_for_test_run(
        self,
        test_run_id: str,
        flow_ids: list[str],
        product_id: str,
        user_id: str,
        send_to_nova: bool,
        is_new_test_run: bool,
    ) -> ApiResponseEntity:
        """
        Process flows for a test run asynchronously via Cloud Tasks.
        This method is called by the Cloud Task handler.
        """
        try:
            orionis_log(f"Processing flows for test run: {test_run_id}")

            if not test_run_id or not product_id:
                raise ValueError("test_run_id and product_id are required")

            if not flow_ids:
                orionis_log(f"No flows to process for test_run_id: {test_run_id}")
                return ApiResponseEntity(
                    response={"message": "No flows to process"},
                    status_code=ApiResponseEntity.HTTP_STATUS_OK,
                )

            result = self.datastore.add_flows_to_test_run(
                test_run_id, flow_ids, product_id
            )
            test_case_under_execution_ids = result.test_case_under_execution_ids

            orionis_log(
                f"Added flows to test run: {test_run_id}, "
                f"created {len(test_case_under_execution_ids)} TCUEs"
            )

            try:
                orionis_log(
                    f"Triggering planning for test run: {test_run_id} with flows: {flow_ids} and tcue ids: {test_case_under_execution_ids}"
                )
                self.test_case_planning_service.request_kg_test_case_planning(
                    requestor_user_id=user_id,
                    params=ApiRequestEntity(
                        data={
                            "product_id": product_id,
                            "specific_flows_to_plan": flow_ids,
                            "test_case_under_execution_ids": test_case_under_execution_ids,
                            "is_force_planning": "false",
                            "is_new_ui": "true",
                        },
                        method="POST",
                    ),
                )
            except Exception as e:
                orionis_log(f"Error triggering planning for test run: {test_run_id}", e)

            # Following section is to trigger nova for this test run
            test_run = self.datastore.get_test_run_by_id(test_run_id)
            if not test_run:
                raise ValueError(f"Test run with id {test_run_id} not found")

            if is_new_test_run and user_id:
                try:
                    self.notification_service.notify_new_test_run(
                        test_run, user_id, len(test_case_under_execution_ids)
                    )
                    product = self.product_datastore.get_product_from_id(
                        test_run.product_id
                    )
                    if (
                        config.environment == Config.PRODUCTION
                        and product.organisation_id
                        not in (
                            Constants.SUPER_USER_ORG_IDS + Constants.QA_SANDBOX_ORG_IDS
                        )
                    ):
                        user = self.user_service.get_user(user_id)
                        sent_email = self.user_service.send_emails_for_test_run_created(
                            user, test_run, product
                        )
                        orionis_log(
                            f"Sent email to {sent_email['email']} for test run {test_run.test_run_id}"
                        )
                except Exception as e:
                    orionis_log(
                        f"Error notifying new test run {test_run.test_run_id}", e
                    )

            return ApiResponseEntity(
                response={
                    "test_run_id": test_run_id,
                    "test_case_under_execution_ids": test_case_under_execution_ids,
                    "message": "Flows processed successfully",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Value error in process_flows_for_test_run: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in process_flows_for_test_run: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )
