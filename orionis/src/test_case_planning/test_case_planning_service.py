from typing import List
import json
from datetime import datetime, timezone
from FlowReachabilityService.service import CheckReachability
from common.google_cloud_wrappers import GCPFileStorageWrapper
from maintainer_agent import MaintainerAgentService
from maintainer_agent.graph_merge_service import GraphMergeService
from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from test_case_planning import goal_planner_agent
from test_case_planning.smoke_test_plan_validator import PlanningRequestValidator
from test_case_planning.smoke_test_planner_agent import SmokeTestPlannerAgent
from test_case_planning.test_case_planning_constants import (
    TEST_CASE_PLANNING_BUCKET_NAME,
)
from products.product_datastore import ProductDatastore
from test_case_planning.test_case_planning_models import (
    RequestSmokeTestPlanParams,
    RequestMaintainerAgentParams,
    MergeGeneratedGraphParams,
    TestCasePlanningRequest,
    TestCasePlanningRequestStatus,
    NovaExecutionParams,
    TestCaseGroup,
    TestCaseUnderExecutionMetadata,
    UpdateTestCasePlanningRequestParams,
)
from test_case_planning.test_case_planning_request_datastore import (
    TestCasePlanningRequestDatastore,
)
from services.cloud_service.cloud_tasks import CloudTaskService
from utils.util import (
    orionis_log,
    serialize,
    uri_to_url,
    url_to_uri,
    publish_to_pubsub,
    serialize_element,
)
from test_cases.test_case_models import (
    AddTestCaseRequestParams,
    RawTestCase,
    TestCaseStatus,
)
from test_cases.test_case_datastore import TestCaseDatastore
from test_runs.test_run_datastore import TestRunDatastore
from config import config
from constants import Constants

# from graph_diff.diff_service import DiffService
from credentials.credentials_datastore import CredentialsDatastore
from test_case_under_execution.test_case_under_exec_datastore import (
    TestCaseUnderExecutionDatastore,
)


class TestCasePlanningService:
    FIELD_REQUEST_ID = "request_id"
    FIELD_REQUEST_IDS = "request_ids"
    FIELD_PRODUCT_ID = "product_id"
    FIELD_MODE = "mode"
    FIELD_MESSAGE = "message"
    FIELD_PLANNED_TEST_CASES = "planned_test_cases"
    FIELD_TEST_CASES_UNDER_EXECUTION = "planned_test_cases_under_execution"
    FIELD_EXECUTABLE_URL = "executable_url"
    FIELD_NOVA_PARAMS = "nova_params"
    FIELD_TEST_RUN_ID = "test_run_id"
    SMOKE_TEST_PLANNING_HANDLER_FUNCTION_NAME = "ProcessSmokeTestPlanning"
    KG_TEST_CASE_PLANNING_HANDLER_NAME = "CreateRawTestCaseFromKgFlow"
    MAINTAINER_AGENT_HANDLER_FUNCTION_NAME = "ProcessMaintainerAgent"
    FIELD_EXECUTABLE_URL = "executable_url"
    FIELD_PRODUCT_NAME = "product_name"
    FIELD_MONKEY_RUN_OUTPUT = "monkey_run_output"
    FIELD_KG_GCP_PATH = "kg_gcp_path"
    FIELD_FLOW_GCP_PATH = "flow_gcp_path"
    FIELD_ADDED_FLOWS = "added_flows"
    FIELD_AFFECTED_FLOWS = "affected_flows"
    FIELD_DELETED_FLOWS = "deleted_flows"
    FIELD_FEATURES_GCP_PATH = "features_gcp_path"
    FIELD_SPECIFIC_FLOWS_TO_PLAN = "specific_flows_to_plan"
    FIELD_IS_FRESH_PLANNING_REQUEST = "is_fresh_planning_request"
    FIELD_IS_FORCE_PLANNING = "is_force_planning"
    FIELD_FLOWS_PLANNED = "flows_planned"
    FIELD_IS_NEW_UI = "is_new_ui"
    FIELD_TEST_CASE_UNDER_EXECUTION_IDS = "test_case_under_execution_ids"
    FIELD_FEATURE_ID = "feature_id"
    FIELD_FLOW_NAME = "flow_name"
    MAX_FLOWS_NUM = 5000
    MODE_BROWSER_DROID = "BROWSER_DROID"
    MODE_GOAL_BASED_RUN = "GOAL_BASED_RUN"
    FIELD_TEXT_BASED_GOAL = "text_based_goal"

    def __init__(
        self,
        request_validator: PlanningRequestValidator,
        planning_request_datastore: TestCasePlanningRequestDatastore,
        cloud_task_service: CloudTaskService,
        storage_client: GCPFileStorageWrapper,
        smoke_test_planner_agent: SmokeTestPlannerAgent,
        goal_planner_agent: goal_planner_agent.GoalPlannerAgent,
        test_case_datastore: TestCaseDatastore,
        test_run_datastore: TestRunDatastore,
        product_datastore: ProductDatastore,
        credentials_datastore: CredentialsDatastore,
        tcue_datastore: TestCaseUnderExecutionDatastore,
    ):
        self.request_validator = request_validator
        self.planning_request_datastore = planning_request_datastore
        self.cloud_task_service = cloud_task_service
        self.storage_client = storage_client
        self.smoke_test_planner_agent = smoke_test_planner_agent
        self.goal_planner_agent = goal_planner_agent
        self.test_case_datastore = test_case_datastore
        self.test_run_datastore = test_run_datastore
        self.product_datastore = product_datastore
        self.credentials_datastore = credentials_datastore
        self.tcue_datastore = tcue_datastore

    def process_goal_planning(
        self,
        request_entity: ApiRequestEntity,
    ) -> ApiResponseEntity:
        orionis_log(f"Initiating goal plannign with request entity: {request_entity}")
        try:
            executable_url = request_entity.data.get(self.FIELD_EXECUTABLE_URL) or None
            product_id = request_entity.data.get(self.FIELD_PRODUCT_ID)
            test_run_id = request_entity.data.get(self.FIELD_TEST_RUN_ID) or None
            platform = request_entity.data.get(Constants.FIELD_PLATFORM_TYPE) or None
            test_case_under_execution_ids = (
                request_entity.data.get(Constants.FIELD_TEST_CASE_UNDER_EXECUTION_IDS)
                or []
            )
            text_based_goal = (
                request_entity.data.get(self.FIELD_TEXT_BASED_GOAL) or None
            )
            mode = request_entity.data.get(self.FIELD_MODE, "")

            try:
                product = self.product_datastore.get_product_from_id(product_id)
            except Exception as e:
                orionis_log(
                    f"Encountered error while fetching product with id: {product_id}", e
                )

            nova_execution_param_list = []
            # Trigger monkey run if test_case_ids are not provided

            if (
                test_case_under_execution_ids
                and platform in Constants.SUPPORTED_GOAL_PLANNING_PLATFORMS
            ):
                try:

                    reachability_service = CheckReachability.from_gcs(
                        product_id=product_id
                    )

                    credentials = self.credentials_datastore.get_credentials(product_id)

                    tcue_list = (
                        self.tcue_datastore.get_test_case_under_execution_by_ids(
                            test_case_under_execution_ids or []
                        )
                    )
                    tcue_map = {tcue.id: tcue for tcue in tcue_list}

                    for tcue_id in test_case_under_execution_ids or []:
                        tcue = tcue_map.get(tcue_id)
                        if not tcue:
                            continue

                        if tcue and tcue.request_id and tcue.request_id != "MANUAL":
                            test_case_planning_request = self.planning_request_datastore.get_planning_request_details(
                                tcue.request_id
                            )
                        elif tcue.request_id and tcue.request_id != "MANUAL":
                            test_case_planning_request = self.planning_request_datastore.get_planning_request_details(
                                tcue.request_id
                            )
                        else:
                            test_case_planning_request = None

                        if tcue and tcue.flow_id:
                            precon_flow_ids = reachability_service.get_flow_chain(
                                tcue.flow_id
                            ).chain
                        else:
                            precon_flow_ids = []

                        if tcue and tcue.credentials:
                            credentials_value = [
                                cred.credentials
                                for cred in credentials
                                if cred.id in (tcue.credentials or [])
                                and cred.credentials is not None
                            ]
                        else:
                            credentials_value = [
                                cred.credentials
                                for cred in credentials
                                if product.default_credentials_id is not None
                                and cred.id == product.default_credentials_id
                                and cred.credentials is not None
                            ]

                        test_case_reference = [
                            TestCaseUnderExecutionMetadata(
                                test_case=serialize_element(tcue),
                                tcue_id=tcue.id,
                                test_case_id=tcue.test_case_id,
                                kg_version=(
                                    test_case_planning_request.knowledge_graph_version
                                    if test_case_planning_request
                                    else None
                                ),
                                precon_flow_ids=precon_flow_ids,
                                credentials_value=credentials_value,
                            )
                        ]

                        nova_execution_params = NovaExecutionParams(
                            test_run_id=test_run_id,
                            product_id=product_id,
                            product_name=product.product_name,
                            executable_url=executable_url,
                            test_case_reference=test_case_reference,
                            mode=Constants.GOAL_FORMULATION_AND_EXECUTION,
                            EXPECTED_APP_BEHAVIOUR=product.expected_app_behaviour,
                            WHEN_TO_USE_WHICH_UI_ELEMENT=product.when_to_use_which_ui_element,
                            environment=config.environment,
                            platform=platform,
                        )
                        nova_execution_param_list.append(nova_execution_params)
                        orionis_log(
                            f"Requesting Nova execution for TCUE {tcue.id} with params: {nova_execution_params}"
                        )
                        if mode == self.MODE_BROWSER_DROID:
                            orionis_log(
                                f"Skipping Nova invocation in {self.MODE_BROWSER_DROID} mode"
                            )
                            continue

                        # Use different topic based on platform
                        topic_name = (
                            Constants.NOVA_WEB_EXECUTION_REQUEST_TOPIC_NAME
                            if platform == "WEB"
                            else Constants.NOVA_EXECUTION_REQUEST_TOPIC_NAME
                        )

                        message_id = publish_to_pubsub(
                            {
                                "nova_execution_params": nova_execution_params.model_dump()
                            },
                            config.gcp_project_id,
                            topic_name,
                        )
                        orionis_log(
                            f"Message published to {topic_name} with id:{message_id}"
                        )
                except Exception as e:
                    orionis_log(
                        "Error while creating nova execution request with error", e
                    )
                    raise RuntimeError(
                        f"Unexpected error occurred while fetching product {product_id}, Error: {e}"
                    )
            else:
                orionis_log(
                    f"Skipping goal planning for product {product_id} since "
                    f"platform '{platform}' is not in supported platforms: "
                    f"{Constants.SUPPORTED_GOAL_PLANNING_PLATFORMS}"
                )

            if (
                mode == self.MODE_GOAL_BASED_RUN
                and platform in Constants.SUPPORTED_GOAL_PLANNING_PLATFORMS
                and text_based_goal
                and product_id
                and platform
            ):
                self.goal_planner_agent.plan_goal_based_run(
                    str(text_based_goal),
                    str(product_id),
                    str(platform),
                    str(test_run_id) if test_run_id else None,
                    test_case_under_execution_ids,
                )
            return ApiResponseEntity(
                response={
                    self.FIELD_MESSAGE: "Goal planning processed successfully",
                    self.FIELD_TEST_RUN_ID: test_run_id,
                    self.FIELD_PRODUCT_ID: product_id,
                    self.FIELD_EXECUTABLE_URL: executable_url,
                    self.FIELD_NOVA_PARAMS: json.dumps(
                        [n.model_dump() for n in nova_execution_param_list]
                    ),
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except Exception as e:
            orionis_log(f"Error in process_goal_planning: {e}", e)
            return ApiResponseEntity(
                response={
                    "error": str(e),
                },
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def get_test_case_planning_request_by_product_id(
        self, requestor_user_id: str, params: ApiRequestEntity
    ) -> ApiResponseEntity:
        try:
            product_id = params.data.get("product_id")
            orionis_log(
                f"Request to get test case planning request by product ID: {product_id}"
            )
            if not product_id:
                raise ValueError("Product ID is required")

            test_case_planning_requests = self.planning_request_datastore.get_all_planning_request_details_by_product_id(
                product_id
            )
            if not test_case_planning_requests:
                return ApiResponseEntity(
                    response={"test_case_planning_requests": []},
                    status_code=ApiResponseEntity.HTTP_STATUS_OK,
                )
            return ApiResponseEntity(
                response={
                    "test_case_planning_requests": (
                        [
                            test_case_planning_request.model_dump()
                            for test_case_planning_request in test_case_planning_requests
                        ]
                        if test_case_planning_requests
                        else []
                    )
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except Exception as e:
            orionis_log(
                f"Error in get_test_case_planning_request_by_product_id: {e}", e
            )
            return ApiResponseEntity(
                response={
                    "error": str(e),
                },
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def request_smoke_test_planning(
        self, requestor_user_id: str, params: ApiRequestEntity
    ) -> ApiResponseEntity:
        try:
            smoke_test_params: RequestSmokeTestPlanParams = (
                self.request_validator.validate_smoke_test_plan_request_params(
                    params.data
                )
            )

            smoke_test_planning_request = self._create_smoke_test_planning_request(
                smoke_test_params.product_id,
                requestor_user_id,
                smoke_test_params.feature_id,
                smoke_test_params.new_feature_name,
                smoke_test_params.design_frame_urls or [],
                smoke_test_params.user_flow_video_urls or [],
                smoke_test_params.input_test_cases or [],
                smoke_test_params.acceptance_criteria or "",
                smoke_test_params.test_run_id or "",
                smoke_test_params.product_name or "",
                smoke_test_params.executable_url or "",
                smoke_test_params.monkey_run_output or "",
            )

            payload = {
                self.FIELD_REQUEST_ID: smoke_test_planning_request.request_id,
                self.FIELD_PRODUCT_ID: smoke_test_planning_request.product_id,
            }

            self.cloud_task_service.enqueue_task_v1(
                payload,
                self.SMOKE_TEST_PLANNING_HANDLER_FUNCTION_NAME,
            )

            orionis_log(
                f"Smoke test plan for product {smoke_test_params.product_id} "
                f"requested with request_id: {smoke_test_planning_request.request_id}"
            )

            feature_message = (
                f"for new feature {smoke_test_planning_request.new_feature_name}"
                if smoke_test_planning_request.new_feature_name
                else ""
            )
            payload[self.FIELD_MESSAGE] = (
                f"Smoke test planning request created successfully {feature_message}"
            )
            return ApiResponseEntity(
                response=payload,
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def request_kg_test_case_planning(
        self, requestor_user_id: str, params: ApiRequestEntity
    ) -> ApiResponseEntity:
        try:
            product_id = params.data.get("product_id")
            is_force_planning = params.data.get("is_force_planning", "false")
            specific_flows_to_plan = params.data.get("specific_flows_to_plan", [])
            is_new_ui = params.data.get("is_new_ui", "false")
            test_case_under_execution_ids = params.data.get(
                "test_case_under_execution_ids", []
            )
            orionis_log(
                f"Planning triggered for product_id: {product_id} from new ui: {is_new_ui}"
            )
            if not product_id:
                raise ValueError("Product ID is required")

            test_case_planning_request = self._create_smoke_test_planning_request(
                product_id=product_id,
                requestor_user_id=requestor_user_id,
                design_frame_urls=[],
                user_flow_video_urls=[],
                input_test_cases=specific_flows_to_plan,
                acceptance_criteria="",
                test_run_id="",
                product_name="",
                executable_url="",
                monkey_run_output="",
                feature_id=None,
                new_feature_name=None,
                knowledge_graph_version=None,
                flow_version=None,
            )

            # Triggering Diff Check : DISABLED SINCE WE ARE ONLY PLANNING FRESH REQUESTS NOW
            # diff_service = DiffService()
            # result = diff_service.get_data(
            #     old_kg_path=old_kg_path,
            #     new_kg_path=kg_path,
            #     old_flow_path=old_flow_path,
            #     new_flow_path=flow_path,
            # )
            # affected_flow_ids = result.get("affected_flow_ids", [])
            # added_flow_ids = result.get("added_flow_ids", [])
            # deleted_flow_ids = result.get("deleted_flow_ids", [])
            bucket_name = self.storage_client._construct_bucket_name("graph-editor")
            base_path = (
                f"gs://{bucket_name}/qai-upload-temporary/productId_{product_id}"
            )

            if is_new_ui == "true":
                request_path_component = ""
            else:
                request_path_component = f"/{test_case_planning_request.request_id}"

            payload = {
                self.FIELD_ADDED_FLOWS: [],
                self.FIELD_AFFECTED_FLOWS: [],
                self.FIELD_DELETED_FLOWS: [],
                self.FIELD_PRODUCT_ID: product_id,
                self.FIELD_KG_GCP_PATH: f"{base_path}{request_path_component}/graph-export.json",
                self.FIELD_FEATURES_GCP_PATH: f"{base_path}{request_path_component}/features-export.json",
                self.FIELD_FLOW_GCP_PATH: f"{base_path}{request_path_component}/flows-export.json",
                self.FIELD_REQUEST_ID: test_case_planning_request.request_id,
                self.FIELD_IS_FRESH_PLANNING_REQUEST: "false",
                self.FIELD_IS_FORCE_PLANNING: is_force_planning,
                self.FIELD_SPECIFIC_FLOWS_TO_PLAN: specific_flows_to_plan,
                self.FIELD_IS_NEW_UI: is_new_ui,
                self.FIELD_TEST_CASE_UNDER_EXECUTION_IDS: test_case_under_execution_ids,
            }
            print(f"Payload for KG Test Case Planning: {payload}")
            self.cloud_task_service.enqueue_task_v1(
                payload,
                self.KG_TEST_CASE_PLANNING_HANDLER_NAME,
            )
            if is_force_planning.lower() == "true":
                flows_planned = self.MAX_FLOWS_NUM
                deleted_flows = 0
            else:
                # flows_planned = len(added_flow_ids) + len(affected_flow_ids)
                # deleted_flows = len(deleted_flow_ids)
                flows_planned = 0
                deleted_flows = 0
            orionis_log(
                f"Created TestCasePlanningRequest with ID: {test_case_planning_request.request_id}"
            )
            return ApiResponseEntity(
                response={
                    self.FIELD_REQUEST_ID: test_case_planning_request.request_id,
                    self.FIELD_PRODUCT_ID: product_id,
                    self.FIELD_MESSAGE: "Test case planning request created successfully",
                    self.FIELD_FLOWS_PLANNED: flows_planned,
                    self.FIELD_DELETED_FLOWS: deleted_flows,
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except Exception as e:
            orionis_log(f"Error in request_kg_test_case_planning: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def process_smoke_test_planning(
        self,
        request_entity: ApiRequestEntity,
    ) -> ApiResponseEntity:
        try:
            request_id = request_entity.data.get(self.FIELD_REQUEST_ID)
            if not request_id:
                raise ValueError("Request ID is required")

            request_details: TestCasePlanningRequest = (
                self.planning_request_datastore.get_planning_request_details(request_id)
            )
            orionis_log(
                f"Retrieved request Details: {request_details.request_id} for product {request_details.product_id}, starting Smoke Test planning"
            )

            planned_test_cases: list[RawTestCase] = (
                self.smoke_test_planner_agent.plan_smoke_tests(request_details)
            )

            feature_message = (
                f"for new feature {request_details.new_feature_name}"
                if request_details.new_feature_name
                else ""
            )
            orionis_log(
                f"Planned {len(planned_test_cases)} test cases {feature_message} for product {request_details.product_id}"
            )

            return ApiResponseEntity(
                response={
                    self.FIELD_MESSAGE: f"Smoke test planning request processed {feature_message} successfully",
                    self.FIELD_REQUEST_ID: request_details.request_id,
                    self.FIELD_PRODUCT_ID: request_details.product_id,
                    self.FIELD_PLANNED_TEST_CASES: serialize(planned_test_cases),
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except Exception as e:
            orionis_log(
                f"Error in processing smoke test planning for request {request_details.request_id} for product {request_details.product_id}",
                e,
            )
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def request_maintainer_agent(
        self, requestor_user_id: str, params: ApiRequestEntity
    ) -> ApiResponseEntity:
        """
        Request Maintainer Agent to process an execution video and generate graph/flows

        Args:
            requestor_user_id: ID of the user making the request
            params: API request parameters containing execution_video_url and product_id

        Returns:
            API response with request_id and status
        """
        try:
            maintainer_params: RequestMaintainerAgentParams = (
                self.request_validator.validate_maintainer_agent_request_params(
                    params.data
                )
            )
            if maintainer_params.request_id:
                orionis_log(
                    f"This is a re-trigger, updating the request {maintainer_params.request_id}"
                )
                payload = {
                    self.FIELD_REQUEST_ID: maintainer_params.request_id,
                    self.FIELD_PRODUCT_ID: maintainer_params.product_id,
                    self.FIELD_FEATURE_ID: maintainer_params.feature_id,
                    self.FIELD_FLOW_NAME: maintainer_params.flow_name,
                }
                self.planning_request_datastore.update_test_case_planning_request(
                    UpdateTestCasePlanningRequestParams(
                        request_id=maintainer_params.request_id,
                        status=TestCasePlanningRequestStatus.QUEUED,
                        feature_id=maintainer_params.feature_id,
                    )
                )
                self.cloud_task_service.enqueue_task_v1(
                    payload,
                    self.MAINTAINER_AGENT_HANDLER_FUNCTION_NAME,
                )
                return ApiResponseEntity(
                    response={
                        self.FIELD_REQUEST_ID: maintainer_params.request_id,
                        self.FIELD_PRODUCT_ID: maintainer_params.product_id,
                        self.FIELD_MESSAGE: "Maintainer Agent request re-triggered successfully",
                    },
                    status_code=ApiResponseEntity.HTTP_STATUS_OK,
                )

            # Create a planning request to track the Maintainer Agent execution
            maintainer_request = self._create_maintainer_agent_request(
                maintainer_params.product_id,
                requestor_user_id,
                maintainer_params.execution_video_url,
                maintainer_params.knowledge_graph_version,
                maintainer_params.flow_version,
                maintainer_params.feature_id,
            )

            payload = {
                self.FIELD_REQUEST_ID: maintainer_request.request_id,
                self.FIELD_PRODUCT_ID: maintainer_request.product_id,
                self.FIELD_FEATURE_ID: maintainer_params.feature_id,
                self.FIELD_FLOW_NAME: maintainer_params.flow_name,
            }

            # Enqueue task to process the video
            self.cloud_task_service.enqueue_task_v1(
                payload,
                self.MAINTAINER_AGENT_HANDLER_FUNCTION_NAME,
            )

            orionis_log(
                f"Maintainer Agent requested for product {maintainer_params.product_id} "
                f"with request_id: {maintainer_request.request_id}"
            )

            payload[self.FIELD_MESSAGE] = (
                "Maintainer Agent request created successfully"
            )
            return ApiResponseEntity(
                response=payload,
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except Exception as e:
            orionis_log(
                f"Error in requesting Maintainer Agent for product {maintainer_params.product_id}",
                e,
            )
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def process_maintainer_agent(
        self,
        request_entity: ApiRequestEntity,
    ) -> ApiResponseEntity:
        """
        Process the Maintainer Agent execution video and generate graph/flows

        Args:
            request_entity: API request containing request_id

        Returns:
            API response with generated graph and flow info
        """
        request_id = None  # Initialize to avoid undefined variable in except block
        try:
            request_id = request_entity.data.get(self.FIELD_REQUEST_ID)
            if not request_id:
                raise ValueError("Request ID is required")

            # Get request details
            request_details: TestCasePlanningRequest = (
                self.planning_request_datastore.get_planning_request_details(request_id)
            )

            if request_details.status == TestCasePlanningRequestStatus.COMPLETED:
                orionis_log(
                    f"Request {request_id} already completed, skipping duplicate execution"
                )
                return ApiResponseEntity(
                    response={"message": "Request already completed", "skipped": True},
                    status_code=ApiResponseEntity.HTTP_STATUS_OK,
                )

            if request_details.status == TestCasePlanningRequestStatus.QUEUED:
                self.planning_request_datastore.update_test_case_planning_request(
                    UpdateTestCasePlanningRequestParams(
                        request_id=request_id,
                        status=TestCasePlanningRequestStatus.PROCESSING,
                    )
                )
                request_details = (
                    self.planning_request_datastore.get_planning_request_details(
                        request_id
                    )
                )
                if request_details.status != TestCasePlanningRequestStatus.PROCESSING:
                    orionis_log(
                        f"Request {request_id} was claimed by another worker, skipping"
                    )
                    return ApiResponseEntity(
                        response={
                            "message": "Request claimed by another worker",
                            "skipped": True,
                        },
                        status_code=ApiResponseEntity.HTTP_STATUS_OK,
                    )
            elif request_details.status == TestCasePlanningRequestStatus.PROCESSING:
                orionis_log(
                    f"Request {request_id} is already processing, skipping duplicate execution"
                )
                return ApiResponseEntity(
                    response={"message": "Request already processing", "skipped": True},
                    status_code=ApiResponseEntity.HTTP_STATUS_OK,
                )

            orionis_log(
                f"Retrieved request Details: {request_details.request_id} "
                f"for product {request_details.product_id}, "
                f"starting Maintainer Agent processing"
            )

            # Download the execution video from user_flow_video_urls
            execution_video_urls = request_details.user_flow_video_urls
            if not execution_video_urls or len(execution_video_urls) == 0:
                raise ValueError("No execution video URL provided")

            execution_video_url = execution_video_urls[0]  # Take the first video

            feature_id = request_entity.data.get(self.FIELD_FEATURE_ID)
            flow_name = request_entity.data.get(self.FIELD_FLOW_NAME)

            # Run Maintainer Agent with video URL directly
            maintainer_service = MaintainerAgentService()
            result = maintainer_service.execute_pipeline(
                video_url=execution_video_url,
                product_id=request_details.product_id,
                request_id=request_id,
                user_id=request_details.requestor_user_id,
                feature_id=feature_id,
                flow_name=flow_name,
            )

            orionis_log(
                f"Maintainer Agent completed for product {request_details.product_id} - "
                f"Generated graph nodes: {len(result.get('tc_graph_json', {}).get('nodes', []))}, "
                f"Generated flows: 1"
            )

            # Update status to COMPLETED
            self.planning_request_datastore.update_test_case_planning_request(
                UpdateTestCasePlanningRequestParams(
                    request_id=request_id,
                    status=TestCasePlanningRequestStatus.COMPLETED,
                    completed_at=datetime.now(timezone.utc),
                    knowledge_graph_version="generated",  # Mark as generated
                    flow_version="generated",
                )
            )

            return ApiResponseEntity(
                response={
                    self.FIELD_MESSAGE: "Maintainer Agent processing completed successfully",
                    self.FIELD_REQUEST_ID: request_details.request_id,
                    self.FIELD_PRODUCT_ID: request_details.product_id,
                    "nodes_generated": len(
                        result.get("tc_graph_json", {}).get("nodes", [])
                    ),
                    "edges_generated": len(
                        result.get("tc_graph_json", {}).get("edges", [])
                    ),
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except Exception as e:
            orionis_log(
                f"Error in processing Maintainer Agent for request {request_id}",
                e,
            )
            # Update status to FAILED
            if request_id:
                try:
                    self.planning_request_datastore.update_test_case_planning_request(
                        UpdateTestCasePlanningRequestParams(
                            request_id=request_id,
                            status=TestCasePlanningRequestStatus.FAILED,
                        )
                    )
                except Exception:
                    pass

            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def _create_maintainer_agent_request(
        self,
        product_id: str,
        requestor_user_id: str,
        execution_video_url: str,
        knowledge_graph_version: str | None,
        flow_version: str | None,
        feature_id: str | None,
    ) -> TestCasePlanningRequest:
        """Create a planning request for Maintainer Agent execution"""

        request_id = self.planning_request_datastore.create_planning_request_id()

        maintainer_agent_params = RequestMaintainerAgentParams(
            product_id=product_id,
            execution_video_url=execution_video_url,
            feature_id=feature_id,
        )

        maintainer_agent_request: TestCasePlanningRequest = (
            self.planning_request_datastore.add_maintainer_agent_request_details(
                request_id, requestor_user_id, maintainer_agent_params
            )
        )

        return maintainer_agent_request

    def merge_generated_graph(
        self, request_entity: ApiRequestEntity, user_id: str
    ) -> ApiResponseEntity:
        """
        Merge a generated graph from maintainer agent into the original knowledge graph.
        This is called when the user clicks the "Merge" button in the graph editor.
        """
        try:
            # Validate and parse request parameters
            params = MergeGeneratedGraphParams(**request_entity.data)

            # Validate parameters
            if not params.product_id:
                raise ValueError("product_id is required")
            if not params.request_id:
                raise ValueError("request_id is required")

            orionis_log(
                f"Merging generated graph to knowledge graph - "
                f"Product: {params.product_id}, Request: {params.request_id}"
            )

            # Use GraphMergeService to perform the merge
            graph_merge_service = GraphMergeService()
            success, flow_ids = graph_merge_service.merge_generated_graph(
                user_id,
                params.product_id,
                params.request_id,
                params.generated_graph_path,
                params.y_offset,
            )

            if success:
                return ApiResponseEntity(
                    response={
                        "message": "Successfully merged generated graph into knowledge graph",
                        "product_id": params.product_id,
                        "request_id": params.request_id,
                        "flow_ids": flow_ids,
                    },
                    status_code=ApiResponseEntity.HTTP_STATUS_OK,
                )
            else:
                return ApiResponseEntity(
                    response={"error": "Failed to merge graphs"},
                    status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
                )

        except ValueError as e:
            orionis_log(f"Invalid merge request parameters: {str(e)}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Error merging graphs: {str(e)}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def get_planning_request_status(
        self, request_entity: ApiRequestEntity
    ) -> ApiResponseEntity:
        """Get the status of a planning request"""
        request_id = None
        try:
            # Validate method
            if request_entity.method != "GET":
                return ApiResponseEntity(
                    response={"error": "Only GET method is allowed for this function."},
                    status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
                )

            # Get and validate request_id
            request_id = request_entity.data.get("request_id")
            if not request_id:
                return ApiResponseEntity(
                    response={"error": "request_id parameter is required"},
                    status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
                )

            # Get request details from datastore
            request_details: TestCasePlanningRequest = (
                self.planning_request_datastore.get_planning_request_details(request_id)
            )

            # Return status and relevant details
            response_data = {
                self.FIELD_REQUEST_ID: request_details.request_id,
                self.FIELD_PRODUCT_ID: request_details.product_id,
                "status": request_details.status.value,
                "request_type": request_details.request_type.value,
                "created_at": request_details.created_at.isoformat(),
                "updated_at": request_details.updated_at.isoformat(),
            }

            if request_details.completed_at:
                response_data["completed_at"] = request_details.completed_at.isoformat()

            if request_details.knowledge_graph_version:
                response_data["knowledge_graph_version"] = (
                    request_details.knowledge_graph_version
                )

            if request_details.flow_version:
                response_data["flow_version"] = request_details.flow_version

            if request_details.new_feature_name:
                response_data["feature_name"] = request_details.new_feature_name

            return ApiResponseEntity(
                response=response_data,
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(
                f"Planning request not found: {request_id}",
                e,
            )
            return ApiResponseEntity(
                response={"error": f"Planning request not found: {request_id}"},
                status_code=ApiResponseEntity.HTTP_STATUS_NOT_FOUND,
            )
        except Exception as e:
            orionis_log(
                f"Error getting planning request status for request {request_id}",
                e,
            )
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def _plan_fresh_kg_test_case_planning(
        self,
        product_id: str,
        request_id: str,
        is_force_planning: str = "false",
        specific_flows_to_plan: list[str] = [],
        is_new_ui: str = "false",
        test_case_under_execution_ids: list[str] = [],
    ) -> ApiResponseEntity:
        try:
            orionis_log(
                f"No previous planning request found for product_id: {product_id}, triggering a new planning request."
            )
            bucket_name = self.storage_client._construct_bucket_name("graph-editor")
            base_path = (
                f"gs://{bucket_name}/qai-upload-temporary/productId_{product_id}"
            )

            if is_new_ui == "true":
                request_path_component = ""
            else:
                request_path_component = f"/{request_id}"

            payload = {
                self.FIELD_PRODUCT_ID: product_id,
                self.FIELD_KG_GCP_PATH: f"{base_path}{request_path_component}/graph-export.json",
                self.FIELD_FLOW_GCP_PATH: f"{base_path}{request_path_component}/flows-export.json",
                self.FIELD_FEATURES_GCP_PATH: f"{base_path}{request_path_component}/features-export.json",
                self.FIELD_REQUEST_ID: request_id,
                self.FIELD_IS_FRESH_PLANNING_REQUEST: "true",
                self.FIELD_IS_FORCE_PLANNING: is_force_planning,
                self.FIELD_SPECIFIC_FLOWS_TO_PLAN: specific_flows_to_plan,
                self.FIELD_IS_NEW_UI: is_new_ui,
                self.FIELD_TEST_CASE_UNDER_EXECUTION_IDS: test_case_under_execution_ids,
            }
            orionis_log(
                f"Enqueueing task for product_id: {product_id} from new ui: {is_new_ui} with payload: {payload}"
            )
            self.cloud_task_service.enqueue_task_v1(
                payload, self.KG_TEST_CASE_PLANNING_HANDLER_NAME
            )
            return ApiResponseEntity(
                response={
                    self.FIELD_MESSAGE: "No previous planning request found for this product_id. Triggered a new planning request.",
                    self.FIELD_REQUEST_ID: request_id,
                    self.FIELD_PRODUCT_ID: product_id,
                    self.FIELD_FLOWS_PLANNED: self.MAX_FLOWS_NUM,
                    self.FIELD_DELETED_FLOWS: 0,
                    self.FIELD_IS_NEW_UI: is_new_ui,
                    self.FIELD_TEST_CASE_UNDER_EXECUTION_IDS: test_case_under_execution_ids,
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except Exception as e:
            orionis_log(f"Error in _plan_fresh_kg_test_case_planning: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def _create_smoke_test_planning_request(
        self,
        product_id: str,
        requestor_user_id: str,
        feature_id: str | None = None,
        new_feature_name: str | None = None,
        design_frame_urls: list[str] = [],
        user_flow_video_urls: list[str] = [],
        input_test_cases: list[str] = [],
        acceptance_criteria: str = "",
        test_run_id: str = "",
        product_name: str = "",
        executable_url: str = "",
        monkey_run_output: str = "",
        knowledge_graph_version: str | None = None,
        flow_version: str | None = None,
    ) -> TestCasePlanningRequest:

        try:

            request_id = self.planning_request_datastore.create_planning_request_id()

            if design_frame_urls:
                design_frame_urls = self._organize_test_planning_input_files(
                    product_id,
                    request_id,
                    design_frame_urls,
                    "design-frames",
                )

            if user_flow_video_urls:
                user_flow_video_urls = self._organize_test_planning_input_files(
                    product_id,
                    request_id,
                    user_flow_video_urls,
                    "user-flow-videos",
                )

            updated_smoke_test_params = RequestSmokeTestPlanParams(
                product_id=product_id,
                feature_id=feature_id,
                new_feature_name=new_feature_name,
                design_frame_urls=design_frame_urls,
                user_flow_video_urls=user_flow_video_urls,
                input_test_cases=input_test_cases,
                acceptance_criteria=acceptance_criteria,
                test_run_id=test_run_id,
                product_name=product_name,
                executable_url=executable_url,
                monkey_run_output=monkey_run_output,
                knowledge_graph_version=knowledge_graph_version,
                flow_version=flow_version,
            )

            smoke_test_planning_request: TestCasePlanningRequest = (
                self.planning_request_datastore.add_smoke_test_planning_request_details(
                    request_id, requestor_user_id, updated_smoke_test_params
                )
            )

            return smoke_test_planning_request
        except Exception as e:
            orionis_log(f"Error in _create_smoke_test_planning_request: {e}", e)
            raise

    def _organize_test_planning_input_files(
        self,
        product_id: str,
        request_id: str,
        urls: list[str],
        directory_name: str = "",
    ) -> list[str]:
        organized_urls = []

        for url in urls:
            uri = url_to_uri(url)
            base_name = self.storage_client.get_base_name_from_uri(uri)
            if directory_name:
                new_file_name = (
                    f"{product_id}/{request_id}/{directory_name}/{base_name}"
                )
            else:
                new_file_name = f"{product_id}/{request_id}/{base_name}"

            new_uri = self.storage_client.copy_blob(
                uri,
                TEST_CASE_PLANNING_BUCKET_NAME,
                new_file_name,
            )
            # Convert URI to URL before storing
            organized_urls.append(uri_to_url(new_uri))

        return organized_urls

    def _arrange_file_urls_by_directory(
        self, blob_urls: List[str], extensions=[".png", ".jpg"]
    ) -> List[List[str]]:
        directory_dict: dict[str, list[str]] = {}

        for url in blob_urls:
            # Check if the file has an allowed extension
            if not any(url.lower().endswith(ext) for ext in extensions):
                continue

            directory = "/".join(url.split("/")[:-1])
            if directory not in directory_dict:
                directory_dict[directory] = []
            directory_dict[directory].append(url)

        return list(directory_dict.values())

    def _add_test_cases_tcue_invoke_nova(
        self, product_id: str, request_id: str, goals: List[str], test_run_id: str
    ) -> TestCaseGroup:
        raw_test_cases: List[RawTestCase] = []
        tcue_ids: List[str] = []
        orionis_log(f"Initiating to add test cases for productId: {product_id}")
        for goal in goals:
            test_case = self.test_case_datastore.add_test_case(
                AddTestCaseRequestParams(
                    product_id=product_id,
                    feature_id="",
                    request_id=request_id,
                    functionality_id="",
                    screenshot_url="",
                    test_case_type="",
                    preconditions=[],
                    test_case_description=goal,
                    rationale="",
                    test_case_steps=[],
                    status=TestCaseStatus.RAW,
                )
            )
            orionis_log(f"Generated test case: {test_case}")
            raw_test_cases.append(test_case)

            # Add the test case to test run
            test_case_under_execution_id = (
                self.test_run_datastore.add_new_test_cases_to_test_run(
                    test_run_id=test_run_id, test_case_ids=[test_case.test_case_id]
                ).test_case_under_execution_ids[0]
            )

            tcue_ids.append(test_case_under_execution_id)
        return TestCaseGroup(test_cases=raw_test_cases, tcue_ids=tcue_ids)
