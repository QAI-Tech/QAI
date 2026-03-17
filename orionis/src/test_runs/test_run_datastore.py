from datetime import datetime, timezone
from typing import Optional, List, Dict
import uuid
from common.google_cloud_wrappers import GCPDatastoreWrapper, GCPFileStorageWrapper
from common.collaboration_client import collaboration_manager
from google.cloud import datastore
from constants import Constants
from products.product_datastore import ProductDatastore
from test_build.test_build_models import PlatformType
from test_runs.test_run_models import (
    AddTestRunParams,
    TestRun,
    TestRunStatus,
    TestRunType,
    TestRunUpdateResult,
    UpdateTestRunParams,
)
from utils.util import orionis_log, parse_metadata
from test_case_under_execution.test_case_under_exec_datastore import (
    TestCaseUnderExecutionDatastore,
)
from utils.kg_utils import (
    extract_credentials_from_flow,
    replace_param_recursive,
)
from test_case_under_execution.test_case_under_exec_models import (
    TestCaseStepStatus,
    TestCaseUnderExecution,
    TestCaseStep,
    ExecutionStatus,
)
from test_runs.test_run_status_counts import update_test_run_status_counts
from test_cases.test_case_models import TestCaseCriticality
from features.feature_datastore import FeatureDatastore
from features.feature_models import Feature
from organisations.org_datastore import OrganisationDatastore


class TestRunDatastore:

    ENTITY_KIND_TEST_RUN = "TestRun"
    FIELD_PRODUCT_ID = "product_id"
    FIELD_CREATED_BY_USER_ID = "created_by_user_id"
    FIELD_TEST_RUN_NAME = "test_run_name"
    FIELD_STATUS = "status"
    FIELD_PLATFORM = "platform"
    FIELD_CREATED_AT = "created_at"
    FIELD_UPDATED_AT = "updated_at"
    ENTITY_KIND_TEST_BUILD = "TestBuild"
    FIELD_EXECUTABLE_URL = "executable_url"
    FIELD_TEST_BUILD_ID = "test_build_id"
    FIELD_ACCEPTANCE_CRITERIA = "acceptance_criteria"
    FIELD_DEVICE_NAME = "device_name"
    FIELD_BUILD_NUMBER = "build_number"
    FIELD_TEST_RUN_TYPE = "test_run_type"
    FIELD_TCUE_COUNT = "tcue_count"
    FIELD_STATUS_COUNTS = "status_counts"
    FIELD_METADATA = "metadata"
    FIELD_FLOW_ID = "flow_id"
    FIELD_SCENARIO_PARAMETERS = "scenario_parameters"

    def __init__(self):
        self.db = GCPDatastoreWrapper().get_datastore_client()

        self.tcue_datastore = TestCaseUnderExecutionDatastore(
            org_datastore=OrganisationDatastore(),
            product_datastore=ProductDatastore(),
        )
        self.file_storage = GCPFileStorageWrapper()
        self.feature_datastore = FeatureDatastore()

    def _entity_to_model(self, entity: datastore.Entity) -> TestRun:
        """
        Convert a TestRun datastore entity to a TestRun Pydantic model.
        Handles parsing of test_run_type, tcue_count (with fallback), and status_counts.
        """
        test_run_id = str(entity.key.id)
        build_number = entity.get(TestRunDatastore.FIELD_BUILD_NUMBER, "")
        test_run_type_str = entity.get(TestRunDatastore.FIELD_TEST_RUN_TYPE)
        test_run_type = TestRunType(test_run_type_str) if test_run_type_str else None
        created_at = entity.get(
            TestRunDatastore.FIELD_CREATED_AT, datetime.now(timezone.utc)
        )
        updated_at = entity.get(
            TestRunDatastore.FIELD_UPDATED_AT, datetime.now(timezone.utc)
        )
        status = TestRunStatus(entity.get(TestRunDatastore.FIELD_STATUS))

        tcue_count = entity.get(TestRunDatastore.FIELD_TCUE_COUNT)
        if tcue_count is None:
            tcue_count = (
                self.tcue_datastore.count_test_cases_under_execution_for_test_run(
                    test_run_id
                )
            )

        status_counts_raw = entity.get(TestRunDatastore.FIELD_STATUS_COUNTS)
        status_counts = (
            dict(status_counts_raw) if status_counts_raw is not None else None
        )

        return TestRun(
            test_run_id=test_run_id,
            product_id=entity.get(TestRunDatastore.FIELD_PRODUCT_ID, ""),
            created_by_user_id=entity.get(
                TestRunDatastore.FIELD_CREATED_BY_USER_ID, ""
            ),
            test_build_id=entity.get(TestRunDatastore.FIELD_TEST_BUILD_ID, ""),
            test_run_name=entity.get(TestRunDatastore.FIELD_TEST_RUN_NAME, ""),
            status=status,
            created_at=created_at,
            updated_at=updated_at,
            acceptance_criteria=entity.get(
                TestRunDatastore.FIELD_ACCEPTANCE_CRITERIA, ""
            ),
            device_name=entity.get(TestRunDatastore.FIELD_DEVICE_NAME),
            build_number=build_number,
            test_run_type=test_run_type,
            tcue_count=int(tcue_count) if tcue_count is not None else None,
            status_counts=status_counts,
        )

    def _update_test_run_status_counts(
        self, test_run_id: str, old_status: ExecutionStatus, new_status: ExecutionStatus
    ) -> None:
        # Single shared implementation lives in test_runs.test_run_status_counts
        update_test_run_status_counts(self.db, test_run_id, old_status, new_status)

    def add_test_run(self, test_run: AddTestRunParams, user_id: str) -> list[TestRun]:
        try:
            created_test_runs = []
            created_at = datetime.now(timezone.utc)

            product_key = self.db.key(
                ProductDatastore.FieldProduct.KIND, int(test_run.product_id)
            )
            product_entity = self.db.get(product_key)

            if not product_entity:
                raise ValueError(f"Product with ID {test_run.product_id} not found")

            platform = ""
            live_executable_url = ""

            if product_entity.get(ProductDatastore.FieldProduct.APPLE_APP_STORE_URL):
                platform = PlatformType.IOS
                live_executable_url = product_entity.get(
                    ProductDatastore.FieldProduct.APPLE_APP_STORE_URL
                )
            elif product_entity.get(
                ProductDatastore.FieldProduct.GOOGLE_PLAY_STORE_URL
            ):
                platform = PlatformType.ANDROID
                live_executable_url = product_entity.get(
                    ProductDatastore.FieldProduct.GOOGLE_PLAY_STORE_URL
                )
            elif product_entity.get(ProductDatastore.FieldProduct.WEB_URL):
                platform = PlatformType.WEB
                live_executable_url = product_entity.get(
                    ProductDatastore.FieldProduct.WEB_URL
                )
            else:
                raise ValueError("Unable to determine platform for the test run")

            executable_url = test_run.executable_url or live_executable_url

            if not executable_url:
                raise ValueError(
                    "No executable URL provided and no live URL found in Product entity"
                )

            test_build_entity = datastore.Entity(
                key=self.db.key(TestRunDatastore.ENTITY_KIND_TEST_BUILD)
            )

            test_build_entity.update(
                {
                    TestRunDatastore.FIELD_PRODUCT_ID: test_run.product_id,
                    TestRunDatastore.FIELD_PLATFORM: platform,
                    TestRunDatastore.FIELD_EXECUTABLE_URL: executable_url,
                    TestRunDatastore.FIELD_CREATED_AT: created_at,
                    TestRunDatastore.FIELD_BUILD_NUMBER: test_run.build_number,
                }
            )

            self.db.put(test_build_entity)
            test_build_id = test_build_entity.key.id

            orionis_log(f"Successfully added test build with id: {test_build_id}")

            devices = test_run.device_ids.split(",") if test_run.device_ids else [""]

            for device in devices:
                device_name = device.strip() if device else ""

                if device_name:
                    if test_run.build_number:
                        test_run_name = f"{test_run.build_number} {test_run.test_run_name} - {device_name}"
                    else:
                        test_run_name = f"{test_run.test_run_name} - {device_name}"
                else:
                    if test_run.build_number:
                        test_run_name = (
                            f"{test_run.build_number} {test_run.test_run_name}"
                        )
                    else:
                        test_run_name = test_run.test_run_name

                test_run_entity = datastore.Entity(
                    key=self.db.key(TestRunDatastore.ENTITY_KIND_TEST_RUN)
                )

                test_run_entity.update(
                    {
                        TestRunDatastore.FIELD_PRODUCT_ID: test_run.product_id,
                        TestRunDatastore.FIELD_CREATED_BY_USER_ID: user_id,
                        TestRunDatastore.FIELD_TEST_RUN_NAME: test_run_name,
                        TestRunDatastore.FIELD_STATUS: "PROCESSING",
                        TestRunDatastore.FIELD_CREATED_AT: created_at,
                        TestRunDatastore.FIELD_UPDATED_AT: created_at,
                        TestRunDatastore.FIELD_TEST_BUILD_ID: str(test_build_id),
                        TestRunDatastore.FIELD_ACCEPTANCE_CRITERIA: test_run.acceptance_criteria
                        or "",
                        TestRunDatastore.FIELD_DEVICE_NAME: device_name,
                        TestRunDatastore.FIELD_BUILD_NUMBER: test_run.build_number,
                        TestRunDatastore.FIELD_TEST_RUN_TYPE: (
                            test_run.test_run_type.value
                            if test_run.test_run_type
                            else None
                        ),
                        TestRunDatastore.FIELD_TCUE_COUNT: 0,
                        TestRunDatastore.FIELD_STATUS_COUNTS: None,
                    }
                )

                self.db.put(test_run_entity)
                test_run_id = test_run_entity.key.id
                orionis_log(
                    f"Successfully added test run with id: {test_run_id} for device: {device_name} with build number: {test_run.build_number}"
                )

                # For newly created test runs, TCUE count is 0 (TCUEs are created later)
                created_test_runs.append(
                    TestRun(
                        test_run_id=str(test_run_id),
                        product_id=test_run.product_id,
                        created_by_user_id=user_id,
                        test_run_name=test_run_name,
                        status=TestRunStatus.PROCESSING,
                        created_at=created_at,
                        updated_at=created_at,
                        test_build_id=str(test_build_id),
                        acceptance_criteria=test_run.acceptance_criteria or "",
                        device_name=device_name,
                        build_number=test_run.build_number,
                        test_run_type=test_run.test_run_type,
                        tcue_count=0,
                        status_counts=None,
                    )
                )

            return created_test_runs
        except Exception as e:
            orionis_log("Error adding test run:", e)
            raise e

    def get_test_runs(self, product_id: str) -> list[TestRun]:
        query = self.db.query(kind=TestRunDatastore.ENTITY_KIND_TEST_RUN)
        query.add_filter(TestRunDatastore.FIELD_PRODUCT_ID, "=", product_id)
        query.order = ["-{}".format(TestRunDatastore.FIELD_CREATED_AT)]

        test_runs: list[TestRun] = []
        for entity in query.fetch():
            test_runs.append(self._entity_to_model(entity))

        orionis_log(f"Fetched {len(test_runs)} test runs for product_id: {product_id}")
        return test_runs

    def _create_test_case_under_execution_entity(
        self,
        test_case: datastore.Entity,
        test_run_id: str,
        scenario: Optional[dict] = None,
    ) -> Optional[datastore.Entity]:
        """Helper function to create a test case under execution entity."""
        try:
            test_case_under_execution_entity = datastore.Entity(
                key=self.db.key(
                    TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION
                )
            )

            current_time = datetime.now(timezone.utc)
            test_case_under_execution_entity.update(
                {
                    Constants.FIELD_TEST_CASE_ID: str(test_case.key.id_or_name),
                    Constants.FIELD_TEST_RUN_ID: str(test_run_id),
                    Constants.FIELD_ASSIGNEE_USER_ID: "",
                    Constants.FIELD_EXECUTION_VIDEO_URL: "",
                    Constants.FIELD_STATUS: "UNTESTED",
                    Constants.FIELD_NOTES: "",
                    Constants.FIELD_CREATED_AT: current_time,
                    Constants.FIELD_UPDATED_AT: current_time,
                    Constants.FIELD_EXECUTION_STARTED_AT: current_time,
                    Constants.FIELD_EXECUTION_COMPLETED_AT: current_time,
                    Constants.FIELD_FEATURE_ID: test_case.get(
                        Constants.FIELD_FEATURE_ID, ""
                    ),
                    Constants.FIELD_FUNCTIONALITY_ID: test_case.get(
                        Constants.FIELD_FUNCTIONALITY_ID, ""
                    ),
                    Constants.FIELD_PRECONDITIONS: test_case.get(
                        Constants.FIELD_PRECONDITIONS, []
                    ),
                    Constants.FIELD_PRODUCT_ID: test_case.get(
                        Constants.FIELD_PRODUCT_ID
                    ),
                    Constants.FIELD_RATIONALE: test_case.get(
                        Constants.FIELD_RATIONALE, ""
                    ),
                    Constants.FIELD_REQUEST_ID: test_case.get(
                        Constants.FIELD_REQUEST_ID, ""
                    ),
                    Constants.FIELD_SCREENSHOT_URL: test_case.get(
                        Constants.FIELD_SCREENSHOT_URL
                    ),
                    Constants.FIELD_TEST_CASE_DESCRIPTION: test_case.get(
                        Constants.FIELD_TEST_CASE_DESCRIPTION
                    ),
                    Constants.FIELD_TEST_CASE_STEPS: test_case.get(
                        Constants.FIELD_TEST_CASE_STEPS, []
                    ),
                    Constants.FIELD_TEST_CASE_TYPE: (
                        test_case.get(Constants.FIELD_TEST_CASE_TYPE)
                        if test_case.get(Constants.FIELD_TEST_CASE_TYPE)
                        else ""
                    ),
                    Constants.FIELD_TEST_CASE_CREATED_AT: test_case.get(
                        Constants.FIELD_CREATED_AT
                    ),
                    Constants.FIELD_TITLE: test_case.get(Constants.FIELD_TITLE, ""),
                    Constants.FIELD_METADATA: test_case.get(
                        Constants.FIELD_METADATA, ""
                    ),
                    Constants.FIELD_FLOW_ID: test_case.get(Constants.FIELD_FLOW_ID),
                }
            )
            replaced = True if scenario is None else False
            params = scenario.get("params") if scenario else []
            scenario_params = {}
            if isinstance(params, list):
                for param in params:
                    parameter_name = param.get("parameter_name")
                    parameter_value = param.get("parameter_value")
                    if (
                        isinstance(parameter_name, str)
                        and parameter_name.strip()
                        and isinstance(parameter_value, str)
                        and parameter_value.strip()
                    ):
                        scenario_params[parameter_name] = parameter_value
                        for key, value in test_case_under_execution_entity.items():
                            new_value = replace_param_recursive(
                                value, parameter_name, parameter_value
                            )
                            if new_value != value:
                                replaced = True
                            test_case_under_execution_entity[key] = new_value

            test_case_under_execution_entity[
                TestRunDatastore.FIELD_SCENARIO_PARAMETERS
            ] = scenario_params

            return test_case_under_execution_entity if replaced else None
        except Exception as e:
            orionis_log("Error creating test case under execution entity:", e)
            raise e

    def add_new_test_cases_to_test_run(
        self, test_run_id: str, test_case_ids: Optional[list[str]] = None
    ) -> TestRunUpdateResult:
        try:
            key = self.db.key(TestRunDatastore.ENTITY_KIND_TEST_RUN, int(test_run_id))
            test_run = self.db.get(key)

            if not test_run:
                raise ValueError(f"Test run with id {test_run_id} not found")

            test_run_product_id = test_run.get(TestRunDatastore.FIELD_PRODUCT_ID)

            existing_query = self.db.query(
                kind=TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION
            )
            existing_query.add_filter(
                Constants.FIELD_TEST_RUN_ID, "=", str(test_run_id)
            )
            existing_test_case_ids = {
                test_run.get(Constants.FIELD_TEST_CASE_ID)
                for test_run in existing_query.fetch()
            }

            raw_test_cases_query = self.db.query(kind=Constants.ENTITY_RAW_TEST_CASE)
            raw_test_cases_query.add_filter(
                Constants.FIELD_PRODUCT_ID, "=", test_run_product_id
            )
            raw_test_cases = [
                case
                for case in raw_test_cases_query.fetch()
                if str(case.key.id_or_name) not in existing_test_case_ids
                and (test_case_ids is None or str(case.key.id_or_name) in test_case_ids)
            ]

            if not raw_test_cases:
                orionis_log(
                    f"No new test cases found for product_id: {test_run_product_id}"
                )
                return TestRunUpdateResult(
                    test_run_id=test_run_id, test_case_under_execution_ids=[]
                )

            orionis_log(
                f"Found {len(raw_test_cases)} new test cases for product_id: {test_run_product_id}"
            )

            test_cases_under_execution = []
            for case in raw_test_cases:
                scenarios = case.get("scenarios", [])
                isTestCaseUnderExecutionAppended = False
                if scenarios:
                    for scenario in scenarios:
                        entity = self._create_test_case_under_execution_entity(
                            case, test_run_id, scenario
                        )
                        if entity is not None:
                            isTestCaseUnderExecutionAppended = True
                            test_cases_under_execution.append(entity)

                if not isTestCaseUnderExecutionAppended:
                    entity = self._create_test_case_under_execution_entity(
                        case, test_run_id
                    )
                    if entity is not None:
                        test_cases_under_execution.append(entity)

            test_case_under_execution_ids: list[str] = []

            if test_cases_under_execution:
                for entity in test_cases_under_execution:
                    if Constants.FIELD_METADATA in entity:
                        entity.exclude_from_indexes.add(Constants.FIELD_METADATA)
                self.db.put_multi(test_cases_under_execution)
                test_case_under_execution_ids = [
                    str(entity.key.id_or_name) for entity in test_cases_under_execution
                ]
                orionis_log(
                    f"Inserted {len(test_cases_under_execution)} new test cases into TestCaseUnderExecution."
                )

            existing_count = test_run.get(TestRunDatastore.FIELD_TCUE_COUNT)
            if existing_count is None:

                new_total = (
                    self.tcue_datastore.count_test_cases_under_execution_for_test_run(
                        test_run_id
                    )
                )
            else:
                new_total = int(existing_count) + len(test_case_under_execution_ids)

            test_run.update(
                {
                    TestRunDatastore.FIELD_UPDATED_AT: datetime.now(timezone.utc),
                    TestRunDatastore.FIELD_TCUE_COUNT: new_total,
                }
            )
            self.db.put(test_run)

            orionis_log(f"Successfully updated test run {test_run_id}")
            return TestRunUpdateResult(
                test_run_id=test_run_id,
                test_case_under_execution_ids=test_case_under_execution_ids,
            )
        except Exception as e:
            orionis_log("Error adding new test cases to test run:", e)
            raise e

    def update_test_run(self, update_params: UpdateTestRunParams) -> TestRun:
        """
        Update a test run entity with the given parameters.
        """
        key = self.db.key(self.ENTITY_KIND_TEST_RUN, int(update_params.test_run_id))
        test_run_entity = self.db.get(key)

        if not test_run_entity:
            raise ValueError(f"Test run with id {update_params.test_run_id} not found")

        update_dict = update_params.model_dump(exclude_unset=True)
        field_map = {
            "status": self.FIELD_STATUS,
            "test_run_name": self.FIELD_TEST_RUN_NAME,
            "acceptance_criteria": self.FIELD_ACCEPTANCE_CRITERIA,
            "device_name": self.FIELD_DEVICE_NAME,
            "build_number": self.FIELD_BUILD_NUMBER,
            "product_id": self.FIELD_PRODUCT_ID,
            "test_build_id": self.FIELD_TEST_BUILD_ID,
            "test_run_type": self.FIELD_TEST_RUN_TYPE,
        }

        for attr, value in update_dict.items():
            if attr in field_map and value is not None:
                if attr == "test_run_type" and isinstance(value, TestRunType):
                    test_run_entity[field_map[attr]] = value.value
                elif attr == "status" and isinstance(value, TestRunStatus):
                    test_run_entity[field_map[attr]] = value.value
                else:
                    test_run_entity[field_map[attr]] = value

        now = datetime.now(timezone.utc)
        test_run_entity[self.FIELD_UPDATED_AT] = now

        self.db.put(test_run_entity)

        orionis_log(f"Updated test run {update_params.test_run_id}")

        # Return updated TestRun object
        return self._entity_to_model(test_run_entity)

    def get_test_run_by_id(self, test_run_id: str) -> TestRun:
        try:
            key = self.db.key(TestRunDatastore.ENTITY_KIND_TEST_RUN, int(test_run_id))
            entity = self.db.get(key)

            if not entity:
                orionis_log(f"No test run found with test_run_id: {test_run_id}")
                raise ValueError(f"Test run with id {test_run_id} not found")

            test_run = self._entity_to_model(entity)
            orionis_log(f"Fetched test run for test_run_id: {test_run_id}")
            return test_run
        except ValueError as e:
            orionis_log("Error fetching test run", e)
            raise e
        except Exception as e:
            orionis_log("Unexpected error fetching test run", e)
            raise ValueError(f"An unexpected error occurred: {e}") from e

    def _load_flows_and_graph_from_gcs(
        self, product_id: str
    ) -> tuple[Dict, List[Dict]]:
        """Load flows and knowledge graph via Collaboration Service."""
        try:
            artifacts = collaboration_manager.get_graph_data(product_id)
            graph_data = artifacts.get("graph") or {}
            flows_data = artifacts.get("flows") or []

            if not isinstance(flows_data, list):
                flows_data = [flows_data] if flows_data else []

            return graph_data, flows_data

        except Exception as e:
            orionis_log(f"Error loading flows and graph from API: {e}", e)
            return {}, []

    def _extract_test_case_steps_from_flow(
        self, flow: Dict, graph: Dict
    ) -> tuple[List[Dict], str]:
        """
        Extract test case steps from a flow's path.
        Returns: (test_case_steps, screenshot_url)
        """
        path_node_ids = flow.get("pathNodeIds", [])
        if not path_node_ids or len(path_node_ids) < 2:
            orionis_log(f"Flow {flow.get('id')} has insufficient path nodes")
            return [], ""

        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])

        screenshot_url = ""
        for node in nodes:
            if node.get("id") == path_node_ids[0]:
                image_data = node.get("data", {}).get("image", "")
                if image_data:
                    screenshot_url = image_data
                break

        test_case_steps = []
        for i in range(len(path_node_ids) - 1):
            source_node_id = path_node_ids[i]
            target_node_id = path_node_ids[i + 1]

            edge_found = False
            for edge in edges:
                if (
                    edge.get("source") == source_node_id
                    and edge.get("target") == target_node_id
                ):
                    step_description = edge.get("data", {}).get("description", "")
                    business_logic = edge.get("data", {}).get("business_logic", "")
                    edge_id = edge.get("id", "")

                    # Use business_logic in expected_results if present
                    expected_results = []
                    if business_logic and business_logic.strip():
                        expected_results = [business_logic]

                    test_case_steps.append(
                        {
                            Constants.FIELD_TEST_STEP_ID: str(uuid.uuid4()),
                            Constants.FIELD_TEST_STEP_DESCRIPTION: step_description,
                            Constants.FIELD_TEST_STEP_EXP_RESULTS: expected_results,
                            TestCaseUnderExecutionDatastore.FIELD_EDGE_ID: edge_id,
                            TestCaseUnderExecutionDatastore.FIELD_TYPE: None,
                            TestCaseUnderExecutionDatastore.FIELD_HTTP_METHOD: None,
                            TestCaseUnderExecutionDatastore.FIELD_URL: None,
                            TestCaseUnderExecutionDatastore.FIELD_REQUEST_BODY: None,
                            TestCaseUnderExecutionDatastore.FIELD_HEADERS: None,
                            TestCaseUnderExecutionDatastore.FIELD_STATUS: TestCaseStepStatus.INCOMPLETE.value,
                        }
                    )
                    edge_found = True
                    break

            if not edge_found:
                orionis_log(
                    f"Warning: Edge not found between {source_node_id} and {target_node_id} in flow {flow.get('id')}"
                )

        return test_case_steps, screenshot_url

    def _get_feature_id_from_flow(
        self, flow: Dict, features: List[Feature]
    ) -> Optional[str]:
        """
        Get DB feature_id from flow. First tries direct feature_id field,
        then falls back to looking up start node using datastore features with nodeIds.
        """

        feature_id = flow.get("feature_id")
        if feature_id:
            orionis_log(f"Flow {flow.get('id')}: feature_id={feature_id}")
            return feature_id

        path_node_ids = flow.get("pathNodeIds", [])
        if not path_node_ids:
            return None

        start_node_id = path_node_ids[0]

        for feature in features:
            if feature.nodeIds and start_node_id in feature.nodeIds:
                orionis_log(
                    f"Flow {flow.get('id')}: start_node={start_node_id}, "
                    f"db_feature_id={feature.id}"
                )
                return feature.id

        orionis_log(
            f"Flow {flow.get('id')}: start_node={start_node_id} not found in any feature"
        )
        return None

    def _entity_to_tcue_schema(
        self, entity: datastore.Entity
    ) -> TestCaseUnderExecution:
        """Convert a datastore entity to TestCaseUnderExecution schema."""
        entity_dict = dict(entity)

        # Convert enums
        entity_dict["status"] = (
            entity_dict["status"]
            if isinstance(entity_dict["status"], ExecutionStatus)
            else ExecutionStatus(entity_dict["status"])
        )

        entity_dict["criticality"] = (
            entity_dict["criticality"]
            if isinstance(entity_dict["criticality"], TestCaseCriticality)
            else TestCaseCriticality(entity_dict["criticality"])
        )

        # Convert test_case_steps
        entity_dict["test_case_steps"] = [
            (TestCaseStep(**step) if not isinstance(step, TestCaseStep) else step)
            for step in entity_dict.get("test_case_steps", [])
        ]

        # Parse metadata
        if TestCaseUnderExecutionDatastore.FIELD_METADATA in entity_dict:
            _raw_metadata = entity_dict.get(
                TestCaseUnderExecutionDatastore.FIELD_METADATA
            )
            try:
                if isinstance(_raw_metadata, datastore.Entity):
                    _normalized = parse_metadata(dict(_raw_metadata))
                else:
                    _normalized = parse_metadata(_raw_metadata)
            except Exception:
                _normalized = None
            entity_dict[TestCaseUnderExecutionDatastore.FIELD_METADATA] = _normalized

        # Ensure title is not None
        if (
            TestCaseUnderExecutionDatastore.FIELD_TITLE not in entity_dict
            or entity_dict.get(TestCaseUnderExecutionDatastore.FIELD_TITLE) is None
        ):
            entity_dict[TestCaseUnderExecutionDatastore.FIELD_TITLE] = ""

        return TestCaseUnderExecution(**{**entity_dict, "id": str(entity.key.id)})

    def _create_tcue_entity_from_flow(
        self,
        flow: Dict,
        graph: Dict,
        test_run_id: str,
        product_id: str,
        features: List[Feature],
        scenario: Optional[Dict] = None,
        credential_id: Optional[str] = None,
    ) -> Optional[TestCaseUnderExecution]:
        """Create a TCUE entity from flow data."""
        try:
            test_case_steps, _ = self._extract_test_case_steps_from_flow(flow, graph)
            if not test_case_steps:
                orionis_log(
                    f"Skipping flow {flow.get('id')} - no test case steps extracted"
                )
                return None
            # Credentials extraction uses the local method now
            extracted_credentials = extract_credentials_from_flow(flow)

            credentials = []
            if (
                credential_id
                and extracted_credentials
                and credential_id in extracted_credentials
            ):
                credentials = [credential_id]

            feature_id = self._get_feature_id_from_flow(flow, features)
            flow_id = flow.get("id", "")
            flow_name = flow.get("name") or ""
            precondition = flow.get("precondition", "")
            flow_description = flow.get("description") or ""

            test_case_under_execution_entity = datastore.Entity(
                key=self.db.key(
                    TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION
                )
            )

            current_time = datetime.now(timezone.utc)
            test_case_under_execution_entity.update(
                {
                    Constants.FIELD_TEST_CASE_ID: "",  # No test case - flow-based TCUE
                    Constants.FIELD_TEST_RUN_ID: str(test_run_id),
                    Constants.FIELD_ASSIGNEE_USER_ID: "",
                    Constants.FIELD_EXECUTION_VIDEO_URL: "",
                    Constants.FIELD_STATUS: ExecutionStatus.UNTESTED.value,
                    Constants.FIELD_NOTES: "",
                    Constants.FIELD_CREATED_AT: current_time,
                    Constants.FIELD_UPDATED_AT: current_time,
                    Constants.FIELD_EXECUTION_STARTED_AT: current_time,
                    Constants.FIELD_EXECUTION_COMPLETED_AT: current_time,
                    Constants.FIELD_FEATURE_ID: feature_id or "",
                    Constants.FIELD_FUNCTIONALITY_ID: "",
                    Constants.FIELD_PRECONDITIONS: (
                        [precondition] if precondition else []
                    ),
                    Constants.FIELD_PRODUCT_ID: product_id,
                    Constants.FIELD_RATIONALE: "",
                    Constants.FIELD_REQUEST_ID: "",
                    Constants.FIELD_SCREENSHOT_URL: "",
                    Constants.FIELD_TEST_CASE_DESCRIPTION: flow_description,
                    Constants.FIELD_TEST_CASE_STEPS: test_case_steps,
                    Constants.FIELD_TEST_CASE_TYPE: "SMOKE",
                    Constants.FIELD_TEST_CASE_CREATED_AT: current_time,
                    Constants.FIELD_TITLE: flow_name,
                    Constants.FIELD_FLOW_ID: flow_id,
                    Constants.FIELD_CRITICALITY: TestCaseCriticality.HIGH.value,
                    Constants.FIELD_CREDENTIALS: credentials,
                }
            )

            replaced = True if scenario is None else False
            params = scenario.get("params") if scenario else []
            scenario_params = {}
            if isinstance(params, list):
                for param in params:
                    parameter_name = param.get("parameter_name")
                    parameter_value = param.get("parameter_value")
                    if (
                        isinstance(parameter_name, str)
                        and parameter_name.strip()
                        and isinstance(parameter_value, str)
                        and parameter_value.strip()
                    ):
                        scenario_params[parameter_name] = parameter_value
                        for key, value in test_case_under_execution_entity.items():
                            new_value = replace_param_recursive(
                                value, parameter_name, parameter_value
                            )
                            if new_value != value:
                                replaced = True
                            test_case_under_execution_entity[key] = new_value

            test_case_under_execution_entity[
                TestRunDatastore.FIELD_SCENARIO_PARAMETERS
            ] = scenario_params

            if replaced:
                # Save the entity to get an ID
                self.db.put(test_case_under_execution_entity)

                # Convert to schema and return
                tcue_schema = self._entity_to_tcue_schema(
                    test_case_under_execution_entity
                )
                return tcue_schema
            else:
                return None

        except Exception as e:
            orionis_log(
                f"Error creating TCUE entity from flow {flow.get('id')}: {e}", e
            )
            raise e

    def add_flows_to_test_run(
        self, test_run_id: str, flow_ids: List[str], product_id: str
    ) -> TestRunUpdateResult:
        """
        Add flows to a test run by creating TCUEs directly from flow data.
        1 flow = 1 TCUE (or multiple if scenarios exist).
        """
        try:
            key = self.db.key(TestRunDatastore.ENTITY_KIND_TEST_RUN, int(test_run_id))
            test_run = self.db.get(key)

            if not test_run:
                raise ValueError(f"Test run with id {test_run_id} not found")

            graph_data, flows_data = self._load_flows_and_graph_from_gcs(product_id)

            try:
                db_features = self.feature_datastore.get_features(product_id)
            except Exception as e:
                orionis_log(f"Error loading features from datastore: {e}", e)
                db_features = []

            flows_to_process = [
                flow for flow in flows_data if flow.get("id") in flow_ids
            ]

            if not flows_to_process:
                orionis_log(f"No flows found for flow_ids: {flow_ids}")
                return TestRunUpdateResult(
                    test_run_id=test_run_id, test_case_under_execution_ids=[]
                )

            orionis_log(
                f"Found {len(flows_to_process)} flows to process for test_run_id: {test_run_id}"
            )

            existing_query = self.db.query(
                kind=TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION
            )
            existing_query.add_filter(
                Constants.FIELD_TEST_RUN_ID, "=", str(test_run_id)
            )
            existing_flow_ids = {
                tcue.get(Constants.FIELD_FLOW_ID)
                for tcue in existing_query.fetch()
                if tcue.get(Constants.FIELD_FLOW_ID)
            }

            test_cases_under_execution: List[TestCaseUnderExecution] = []
            for flow in flows_to_process:
                flow_id = flow.get("id")
                if flow_id in existing_flow_ids:
                    orionis_log(f"Skipping flow {flow_id} - already exists in test run")
                    continue

                scenarios = flow.get("scenarios", [])
                credentials = extract_credentials_from_flow(flow)

                if not isinstance(scenarios, list):
                    scenarios = []

                if scenarios and credentials:
                    for scenario in scenarios:
                        scenario_dict = scenario if isinstance(scenario, dict) else None
                        for credential_id in credentials:
                            tcue = self._create_tcue_entity_from_flow(
                                flow,
                                graph_data,
                                test_run_id,
                                product_id,
                                db_features,
                                scenario_dict,
                                credential_id,
                            )
                            if tcue is not None:
                                test_cases_under_execution.append(tcue)
                elif scenarios:
                    for scenario in scenarios:
                        scenario_dict = scenario if isinstance(scenario, dict) else None
                        tcue = self._create_tcue_entity_from_flow(
                            flow,
                            graph_data,
                            test_run_id,
                            product_id,
                            db_features,
                            scenario_dict,
                            None,
                        )
                        if tcue is not None:
                            test_cases_under_execution.append(tcue)
                elif credentials:
                    for credential_id in credentials:
                        tcue = self._create_tcue_entity_from_flow(
                            flow,
                            graph_data,
                            test_run_id,
                            product_id,
                            db_features,
                            None,
                            credential_id,
                        )
                        if tcue is not None:
                            test_cases_under_execution.append(tcue)
                else:
                    tcue = self._create_tcue_entity_from_flow(
                        flow,
                        graph_data,
                        test_run_id,
                        product_id,
                        db_features,
                        None,
                        None,
                    )
                    if tcue is not None:
                        test_cases_under_execution.append(tcue)

            test_case_under_execution_ids: List[str] = [
                tcue.id for tcue in test_cases_under_execution
            ]

            if test_cases_under_execution:
                orionis_log(
                    f"Inserted {len(test_cases_under_execution)} TCUEs from flows into TestCaseUnderExecution."
                )

            existing_count = test_run.get(TestRunDatastore.FIELD_TCUE_COUNT)
            if existing_count is None:
                new_total = (
                    self.tcue_datastore.count_test_cases_under_execution_for_test_run(
                        test_run_id
                    )
                )
            else:
                new_total = int(existing_count) + len(test_cases_under_execution)

            test_run.update(
                {
                    TestRunDatastore.FIELD_UPDATED_AT: datetime.now(timezone.utc),
                    TestRunDatastore.FIELD_TCUE_COUNT: new_total,
                }
            )
            self.db.put(test_run)

            orionis_log(f"Successfully added flows to test run {test_run_id}")
            return TestRunUpdateResult(
                test_run_id=test_run_id,
                test_case_under_execution_ids=test_case_under_execution_ids,
            )

        except Exception as e:
            orionis_log(f"Error adding flows to test run: {e}", e)
            raise e

    def get_flow_ids_for_test_run(self, test_run_id: str) -> set[str]:
        """Return a set of flow_ids already present in the test run.

        Flow IDs are derived from existing TestCaseUnderExecution entities for the test run.
        """
        try:
            existing_query = self.db.query(
                kind=TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION
            )
            existing_query.add_filter(
                Constants.FIELD_TEST_RUN_ID, "=", str(test_run_id)
            )
            return {
                tcue.get(Constants.FIELD_FLOW_ID)
                for tcue in existing_query.fetch()
                if tcue.get(Constants.FIELD_FLOW_ID)
            }
        except Exception as e:
            orionis_log(
                f"Error fetching flow_ids for test_run_id: {test_run_id}: {e}", e
            )
            raise e
