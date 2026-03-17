from datetime import datetime, timezone
from typing import List

from common.google_cloud_wrappers import GCPDatastoreWrapper
from google.cloud import datastore
from test_case_planning.test_case_planning_models import (
    RequestSmokeTestPlanParams,
    RequestMaintainerAgentParams,
)
from test_case_planning.test_case_planning_models import (
    TestCasePlanningRequest,
    TestCasePlanningRequestStatus,
    TestCasePlanningRequestType,
    UpdateTestCasePlanningRequestParams,
)
from utils.util import orionis_log
from enum import Enum


class TestCasePlanningRequestDatastore:
    ENTITY_KIND_PLANNING_REQUEST = "TestCasePlanningRequest"
    FIELD_PRODUCT_ID = "product_id"
    FIELD_REQUESTOR_USER_ID = "requestor_user_id"
    FIELD_STATUS = "status"
    FIELD_REQUEST_TYPE = "request_type"
    FIELD_FEATURE_ID = "feature_id"
    FIELD_NEW_FEATURE_NAME = "new_feature_name"
    FIELD_DESIGN_FRAME_URLS = "design_frame_urls"
    FIELD_USER_FLOW_VIDEO_URLS = "user_flow_video_urls"
    FIELD_INPUT_TEST_CASES = "input_test_cases"
    FIELD_ACCEPTANCE_CRITERIA = "acceptance_criteria"
    FIELD_CREATED_AT = "created_at"
    FIELD_UPDATED_AT = "updated_at"
    FIELD_COMPLETED_AT = "completed_at"
    FIELD_TEST_RUN_ID = "test_run_id"
    FIELD_PRODUCT_NAME = "product_name"
    FIELD_EXECUTABLE_URL = "executable_url"
    FIELD_MONKEY_RUN_OUTPUT = "monkey_run_output"
    FIELD_KNOWLEDGE_GRAPH_VERSION = "knowledge_graph_version"
    FIELD_FLOW_VERSION = "flow_version"

    def __init__(self):
        self.db = GCPDatastoreWrapper().get_datastore_client()

    def create_planning_request_id(self) -> str:
        try:
            key = self.db.key(self.ENTITY_KIND_PLANNING_REQUEST)
            entity = datastore.Entity(key=key)
            entity.update({self.FIELD_CREATED_AT: datetime.now(timezone.utc)})
            self.db.put(entity)

            request_id = str(entity.key.id)  # type: ignore

            orionis_log(f"Created new planning request: {request_id}")

            return request_id

        except Exception as e:
            orionis_log(f"Error creating planning request: {e}", e)
            raise e

    def add_smoke_test_planning_request_details(
        self,
        request_id: str,
        requestor_user_id: str,
        request: RequestSmokeTestPlanParams,
    ) -> TestCasePlanningRequest:
        key = self.db.key(self.ENTITY_KIND_PLANNING_REQUEST, int(request_id))
        entity = self.db.get(key)

        if not entity:
            raise ValueError(f"Planning request with id {request_id} not found")

        entity.update(
            {
                self.FIELD_PRODUCT_ID: request.product_id,
                self.FIELD_REQUESTOR_USER_ID: requestor_user_id,
                self.FIELD_STATUS: TestCasePlanningRequestStatus.QUEUED,
                self.FIELD_REQUEST_TYPE: TestCasePlanningRequestType.SMOKE_TEST,
                self.FIELD_FEATURE_ID: request.feature_id,
                self.FIELD_NEW_FEATURE_NAME: request.new_feature_name,
                self.FIELD_DESIGN_FRAME_URLS: request.design_frame_urls,
                self.FIELD_USER_FLOW_VIDEO_URLS: request.user_flow_video_urls,
                self.FIELD_INPUT_TEST_CASES: request.input_test_cases,
                self.FIELD_ACCEPTANCE_CRITERIA: request.acceptance_criteria,
                self.FIELD_CREATED_AT: datetime.now(timezone.utc),
                self.FIELD_UPDATED_AT: datetime.now(timezone.utc),
                self.FIELD_COMPLETED_AT: None,
                self.FIELD_TEST_RUN_ID: request.test_run_id,
                self.FIELD_PRODUCT_NAME: request.product_name,
                self.FIELD_EXECUTABLE_URL: request.executable_url,
                self.FIELD_MONKEY_RUN_OUTPUT: request.monkey_run_output,
                self.FIELD_KNOWLEDGE_GRAPH_VERSION: request.knowledge_graph_version,
                self.FIELD_FLOW_VERSION: request.flow_version,
            }
        )

        self.db.put(entity)

        request_id = entity.key.id  # type: ignore
        orionis_log(
            f"Successfully stored smoke test planning request with id: {request_id}"
        )
        return TestCasePlanningRequest(
            request_id=str(request_id),
            product_id=entity[self.FIELD_PRODUCT_ID],
            requestor_user_id=entity[self.FIELD_REQUESTOR_USER_ID],
            status=entity[self.FIELD_STATUS],
            request_type=entity[self.FIELD_REQUEST_TYPE],
            feature_id=entity[self.FIELD_FEATURE_ID],
            new_feature_name=entity[self.FIELD_NEW_FEATURE_NAME],
            design_frame_urls=entity[self.FIELD_DESIGN_FRAME_URLS],
            user_flow_video_urls=entity[self.FIELD_USER_FLOW_VIDEO_URLS],
            input_test_cases=entity[self.FIELD_INPUT_TEST_CASES],
            acceptance_criteria=entity[self.FIELD_ACCEPTANCE_CRITERIA],
            created_at=entity[self.FIELD_CREATED_AT],
            updated_at=entity[self.FIELD_UPDATED_AT],
            completed_at=None,
            test_run_id=request.test_run_id,
            product_name=request.product_name,
            executable_url=request.executable_url,
            monkey_run_output=request.monkey_run_output,
        )

    def add_maintainer_agent_request_details(
        self,
        request_id: str,
        requestor_user_id: str,
        request: RequestMaintainerAgentParams,
    ) -> TestCasePlanningRequest:
        """Add maintainer agent request details to the datastore"""
        key = self.db.key(self.ENTITY_KIND_PLANNING_REQUEST, int(request_id))
        entity = self.db.get(key)

        if not entity:
            raise ValueError(f"Planning request with id {request_id} not found")

        entity.update(
            {
                self.FIELD_PRODUCT_ID: request.product_id,
                self.FIELD_REQUESTOR_USER_ID: requestor_user_id,
                self.FIELD_STATUS: TestCasePlanningRequestStatus.QUEUED,
                self.FIELD_REQUEST_TYPE: TestCasePlanningRequestType.MAINTAINER_AGENT,
                self.FIELD_FEATURE_ID: None,
                self.FIELD_NEW_FEATURE_NAME: None,
                self.FIELD_DESIGN_FRAME_URLS: [],
                self.FIELD_USER_FLOW_VIDEO_URLS: [request.execution_video_url],
                self.FIELD_INPUT_TEST_CASES: [],
                self.FIELD_ACCEPTANCE_CRITERIA: "",
                self.FIELD_CREATED_AT: datetime.now(timezone.utc),
                self.FIELD_UPDATED_AT: datetime.now(timezone.utc),
                self.FIELD_COMPLETED_AT: None,
                self.FIELD_TEST_RUN_ID: None,
                self.FIELD_PRODUCT_NAME: None,
                self.FIELD_EXECUTABLE_URL: None,
                self.FIELD_MONKEY_RUN_OUTPUT: None,
                self.FIELD_KNOWLEDGE_GRAPH_VERSION: None,
                self.FIELD_FLOW_VERSION: None,
            }
        )

        self.db.put(entity)

        request_id = entity.key.id  # type: ignore
        orionis_log(
            f"Successfully stored maintainer agent request with id: {request_id}"
        )
        return TestCasePlanningRequest(
            request_id=str(request_id),
            product_id=entity[self.FIELD_PRODUCT_ID],
            requestor_user_id=entity[self.FIELD_REQUESTOR_USER_ID],
            status=entity[self.FIELD_STATUS],
            request_type=entity[self.FIELD_REQUEST_TYPE],
            feature_id=entity[self.FIELD_FEATURE_ID],
            new_feature_name=entity[self.FIELD_NEW_FEATURE_NAME],
            design_frame_urls=entity[self.FIELD_DESIGN_FRAME_URLS],
            user_flow_video_urls=entity[self.FIELD_USER_FLOW_VIDEO_URLS],
            input_test_cases=entity[self.FIELD_INPUT_TEST_CASES],
            acceptance_criteria=entity[self.FIELD_ACCEPTANCE_CRITERIA],
            created_at=entity[self.FIELD_CREATED_AT],
            updated_at=entity[self.FIELD_UPDATED_AT],
            completed_at=None,
            test_run_id=None,
            product_name=None,
            executable_url=None,
            monkey_run_output=None,
        )

    def get_planning_request_details(self, request_id: str) -> TestCasePlanningRequest:
        try:
            key = self.db.key(self.ENTITY_KIND_PLANNING_REQUEST, int(request_id))
            entity = self.db.get(key)

            if not entity:
                raise ValueError(f"Planning request with id {request_id} not found")

            return TestCasePlanningRequest(
                request_id=str(entity.key.id),  # type: ignore
                product_id=entity[self.FIELD_PRODUCT_ID],
                requestor_user_id=entity[self.FIELD_REQUESTOR_USER_ID],
                status=entity[self.FIELD_STATUS],
                request_type=entity[self.FIELD_REQUEST_TYPE],
                feature_id=entity[self.FIELD_FEATURE_ID],
                new_feature_name=entity[self.FIELD_NEW_FEATURE_NAME],
                design_frame_urls=entity[self.FIELD_DESIGN_FRAME_URLS],
                user_flow_video_urls=entity[self.FIELD_USER_FLOW_VIDEO_URLS],
                input_test_cases=entity[self.FIELD_INPUT_TEST_CASES],
                acceptance_criteria=entity[self.FIELD_ACCEPTANCE_CRITERIA],
                created_at=entity[self.FIELD_CREATED_AT],
                updated_at=entity[self.FIELD_UPDATED_AT],
                completed_at=entity[self.FIELD_COMPLETED_AT],
                test_run_id=entity.get(self.FIELD_TEST_RUN_ID),
                product_name=entity.get(self.FIELD_PRODUCT_NAME),
                executable_url=entity.get(self.FIELD_EXECUTABLE_URL),
                monkey_run_output=entity.get(self.FIELD_MONKEY_RUN_OUTPUT),
                knowledge_graph_version=entity.get(self.FIELD_KNOWLEDGE_GRAPH_VERSION),
            )
        except Exception as e:
            orionis_log(f"Error getting planning request details: {e}", e)
            raise e

    def get_last_planning_request_by_product_id(
        self, product_id: str
    ) -> TestCasePlanningRequest | None:
        """
        Returns the most recently created TestCasePlanningRequest for a given product_id, or None if not found.
        """
        try:
            query = self.db.query(kind=self.ENTITY_KIND_PLANNING_REQUEST)
            query.add_filter(self.FIELD_PRODUCT_ID, "=", product_id)
            query.add_filter(
                self.FIELD_STATUS, "=", TestCasePlanningRequestStatus.COMPLETED.value
            )
            query.order = [f"-{self.FIELD_CREATED_AT}"]
            results = list(query.fetch(limit=1))
            if not results:
                orionis_log(f"No planning request found for product_id: {product_id}")
                return None
            entity = results[0]
            return TestCasePlanningRequest(
                request_id=str(entity.key.id),
                product_id=entity.get(self.FIELD_PRODUCT_ID),
                requestor_user_id=entity.get(self.FIELD_REQUESTOR_USER_ID),
                status=entity.get(self.FIELD_STATUS),
                request_type=entity.get(self.FIELD_REQUEST_TYPE),
                feature_id=entity.get(self.FIELD_FEATURE_ID),
                new_feature_name=entity.get(self.FIELD_NEW_FEATURE_NAME),
                design_frame_urls=entity.get(self.FIELD_DESIGN_FRAME_URLS),
                user_flow_video_urls=entity.get(self.FIELD_USER_FLOW_VIDEO_URLS),
                input_test_cases=entity.get(self.FIELD_INPUT_TEST_CASES),
                acceptance_criteria=entity.get(self.FIELD_ACCEPTANCE_CRITERIA),
                created_at=entity.get(self.FIELD_CREATED_AT),
                updated_at=entity.get(self.FIELD_UPDATED_AT),
                completed_at=entity.get(self.FIELD_COMPLETED_AT),
                test_run_id=entity.get(self.FIELD_TEST_RUN_ID),
                product_name=entity.get(self.FIELD_PRODUCT_NAME),
                executable_url=entity.get(self.FIELD_EXECUTABLE_URL),
                monkey_run_output=entity.get(self.FIELD_MONKEY_RUN_OUTPUT),
                knowledge_graph_version=entity.get(self.FIELD_KNOWLEDGE_GRAPH_VERSION),
                flow_version=entity.get(self.FIELD_FLOW_VERSION),
            )
        except Exception as e:
            orionis_log("Error in get_last_planning_request_by_product_id: ", e)
            return None

    def get_last_non_maintainer_planning_request_by_product_id(
        self, product_id: str
    ) -> TestCasePlanningRequest | None:
        """
        Returns the most recently created TestCasePlanningRequest for a given product_id
        that does NOT have type 'MAINTAINER_AGENT', or None if not found.
        """
        try:
            query = self.db.query(kind=self.ENTITY_KIND_PLANNING_REQUEST)
            query.add_filter(self.FIELD_PRODUCT_ID, "=", product_id)
            query.add_filter(
                self.FIELD_STATUS, "=", TestCasePlanningRequestStatus.COMPLETED.value
            )
            query.order = [f"-{self.FIELD_CREATED_AT}"]
            results = list(query.fetch())
            for entity in results:
                if (
                    entity.get(self.FIELD_REQUEST_TYPE)
                    != TestCasePlanningRequestType.MAINTAINER_AGENT
                ):
                    return TestCasePlanningRequest(
                        request_id=str(entity.key.id),
                        product_id=entity.get(self.FIELD_PRODUCT_ID),
                        requestor_user_id=entity.get(self.FIELD_REQUESTOR_USER_ID),
                        status=entity.get(self.FIELD_STATUS),
                        request_type=entity.get(self.FIELD_REQUEST_TYPE),
                        feature_id=entity.get(self.FIELD_FEATURE_ID),
                        new_feature_name=entity.get(self.FIELD_NEW_FEATURE_NAME),
                        design_frame_urls=entity.get(self.FIELD_DESIGN_FRAME_URLS),
                        user_flow_video_urls=entity.get(
                            self.FIELD_USER_FLOW_VIDEO_URLS
                        ),
                        input_test_cases=entity.get(self.FIELD_INPUT_TEST_CASES),
                        acceptance_criteria=entity.get(self.FIELD_ACCEPTANCE_CRITERIA),
                        created_at=entity.get(self.FIELD_CREATED_AT),
                        updated_at=entity.get(self.FIELD_UPDATED_AT),
                        completed_at=entity.get(self.FIELD_COMPLETED_AT),
                        test_run_id=entity.get(self.FIELD_TEST_RUN_ID),
                        product_name=entity.get(self.FIELD_PRODUCT_NAME),
                        executable_url=entity.get(self.FIELD_EXECUTABLE_URL),
                        monkey_run_output=entity.get(self.FIELD_MONKEY_RUN_OUTPUT),
                        knowledge_graph_version=entity.get(
                            self.FIELD_KNOWLEDGE_GRAPH_VERSION
                        ),
                        flow_version=entity.get(self.FIELD_FLOW_VERSION),
                    )
            orionis_log(
                f"No non-maintainer planning request found for product_id: {product_id}"
            )
            return None
        except Exception as e:
            orionis_log(
                "Error in get_last_non_maintainer_planning_request_by_product_id: ", e
            )
            return None

    def update_test_case_planning_request(
        self, update_params: UpdateTestCasePlanningRequestParams
    ) -> TestCasePlanningRequest:
        """
        Updates fields of a TestCasePlanningRequest entity using a Pydantic model.
        Only non-None fields (except request_id) are updated.
        Returns the updated TestCasePlanningRequest Pydantic model.
        """
        try:
            key = self.db.key(
                self.ENTITY_KIND_PLANNING_REQUEST, int(update_params.request_id)
            )
            entity = self.db.get(key)
            if not entity:
                raise ValueError(
                    f"Planning request with id {update_params.request_id} not found"
                )
            # Update only fields that are not None and not request_id
            for k, v in update_params.model_dump().items():
                if k != "request_id" and v is not None:
                    if isinstance(v, Enum):
                        entity[k] = v.value  # Store the string/primitive value
                    else:
                        entity[k] = v
            entity[self.FIELD_UPDATED_AT] = datetime.now(timezone.utc)
            self.db.put(entity)
            # Return updated Pydantic model
            return TestCasePlanningRequest(
                request_id=str(entity.key.id),
                product_id=entity.get(self.FIELD_PRODUCT_ID),
                requestor_user_id=entity.get(self.FIELD_REQUESTOR_USER_ID),
                status=entity.get(self.FIELD_STATUS),
                request_type=entity.get(self.FIELD_REQUEST_TYPE),
                feature_id=entity.get(self.FIELD_FEATURE_ID),
                new_feature_name=entity.get(self.FIELD_NEW_FEATURE_NAME),
                design_frame_urls=entity.get(self.FIELD_DESIGN_FRAME_URLS),
                user_flow_video_urls=entity.get(self.FIELD_USER_FLOW_VIDEO_URLS),
                input_test_cases=entity.get(self.FIELD_INPUT_TEST_CASES),
                acceptance_criteria=entity.get(self.FIELD_ACCEPTANCE_CRITERIA),
                created_at=entity.get(self.FIELD_CREATED_AT),
                updated_at=entity.get(self.FIELD_UPDATED_AT),
                completed_at=entity.get(self.FIELD_COMPLETED_AT),
                test_run_id=entity.get(self.FIELD_TEST_RUN_ID),
                product_name=entity.get(self.FIELD_PRODUCT_NAME),
                executable_url=entity.get(self.FIELD_EXECUTABLE_URL),
                monkey_run_output=entity.get(self.FIELD_MONKEY_RUN_OUTPUT),
                knowledge_graph_version=entity.get(self.FIELD_KNOWLEDGE_GRAPH_VERSION),
                flow_version=entity.get(self.FIELD_FLOW_VERSION),
            )
        except Exception as e:
            orionis_log(
                f"Error updating planning request {update_params.request_id}: {e}", e
            )
            raise e

    def get_all_planning_request_details_by_product_id(
        self, product_id: str
    ) -> List[TestCasePlanningRequest]:
        try:
            orionis_log(
                f"Received request to get test case planning request by product ID: {product_id}"
            )
            query = self.db.query(kind=self.ENTITY_KIND_PLANNING_REQUEST)
            query.add_filter(self.FIELD_PRODUCT_ID, "=", product_id)
            query.add_filter(
                self.FIELD_STATUS,
                "IN",
                [
                    TestCasePlanningRequestStatus.PROCESSING.value,
                    TestCasePlanningRequestStatus.FAILED.value,
                ],
            )
            query.order = [f"-{self.FIELD_CREATED_AT}"]
            results = list(query.fetch())
            orionis_log(
                f"Fetched {len(results)} test case planning requests for product ID: {product_id}"
            )
            planning_requests = []
            for entity in results:
                if (
                    entity.get(self.FIELD_REQUEST_TYPE)
                    != TestCasePlanningRequestType.MAINTAINER_AGENT.value
                ):
                    continue

                planning_requests.append(
                    TestCasePlanningRequest(
                        request_id=str(entity.key.id),
                        product_id=entity.get(self.FIELD_PRODUCT_ID),
                        requestor_user_id=entity.get(self.FIELD_REQUESTOR_USER_ID),
                        status=entity.get(self.FIELD_STATUS),
                        request_type=entity.get(self.FIELD_REQUEST_TYPE),
                        feature_id=entity.get(self.FIELD_FEATURE_ID),
                        new_feature_name=entity.get(self.FIELD_NEW_FEATURE_NAME),
                        design_frame_urls=entity.get(self.FIELD_DESIGN_FRAME_URLS),
                        user_flow_video_urls=entity.get(
                            self.FIELD_USER_FLOW_VIDEO_URLS
                        ),
                        input_test_cases=entity.get(self.FIELD_INPUT_TEST_CASES),
                        acceptance_criteria=entity.get(self.FIELD_ACCEPTANCE_CRITERIA),
                        created_at=entity.get(self.FIELD_CREATED_AT),
                        updated_at=entity.get(self.FIELD_UPDATED_AT),
                        completed_at=entity.get(self.FIELD_COMPLETED_AT),
                        test_run_id=entity.get(self.FIELD_TEST_RUN_ID),
                        product_name=entity.get(self.FIELD_PRODUCT_NAME),
                        executable_url=entity.get(self.FIELD_EXECUTABLE_URL),
                        monkey_run_output=entity.get(self.FIELD_MONKEY_RUN_OUTPUT),
                        knowledge_graph_version=entity.get(
                            self.FIELD_KNOWLEDGE_GRAPH_VERSION
                        ),
                        flow_version=entity.get(self.FIELD_FLOW_VERSION),
                    )
                )
            return planning_requests
        except Exception as e:
            orionis_log(
                f"Error getting all planning requests for product {product_id}: {e}", e
            )
            return []
