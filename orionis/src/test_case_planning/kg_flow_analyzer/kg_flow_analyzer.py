import json
import base64
import uuid
from features.feature_datastore import FeatureDatastore
from gateway.gateway_models import ApiResponseEntity, ApiRequestEntity
from common.google_cloud_wrappers import GCPFileStorageWrapper, GCPDatastoreWrapper
from test_runs.test_run_datastore import TestRunDatastore
from constants import Constants
from llm_model import LLMModelWrapper
from test_cases.test_case_datastore import TestCaseDatastore
from services.cloud_service.cloud_tasks import CloudTaskService
from test_case_planning.kg_flow_analyzer.inference_response_models import (
    TestCaseInferenceResponseSchema,
)
from test_case_planning.test_case_planning_constants import (
    TEST_CASE_PLANNING_BUCKET_NAME,
)
from test_case_planning.kg_flow_analyzer.prompts import (
    CREATE_RAW_TEST_CASE_FROM_FLOW_PROMPT,
    CREATE_NEG_TEST_CASES_FROM_FLOW_PROMPT,
)
from test_case_planning.kg_flow_analyzer.json_response_schema import (
    raw_test_case_schema,
    neg_test_cases_schema,
)
from utils.util import (
    orionis_log,
    uri_to_url,
)
from test_cases.test_case_models import (
    AddTestCaseRequestParams,
    UpdateTestCaseRequestParams,
    AddTestCaseStepRequestParams,
    RawTestCase,
    RawTestCaseStep,
    Scenario,
    TestCaseParameter,
)
from config import config
from typing import Tuple, List, Dict, Any
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import re
import time
from test_case_planning.test_case_planning_models import (
    TestCasePlanningRequestStatus,
    UpdateTestCasePlanningRequestParams,
)
from test_case_planning.test_case_planning_request_datastore import (
    TestCasePlanningRequestDatastore,
)
from threading import Lock
import copy
from common.collaboration_client import collaboration_manager
from test_case_under_execution.test_case_under_exec_datastore import (
    TestCaseUnderExecutionDatastore,
)
from test_case_under_execution.test_case_under_exec_models import (
    UpdateTestCaseUnderExecutionParams,
    TestCaseStep,
)
from utils.kg_utils import (
    get_feature_id,
    feature_processing,
    extract_credentials_from_flow,
    replace_param_recursive,
)
from features.feature_models import Feature


class KGFlowAnalyzer:

    def __init__(
        self,
        llm_model: LLMModelWrapper,
        file_storage: GCPFileStorageWrapper,
        test_case_datastore: TestCaseDatastore,
        feature_datastore: FeatureDatastore,
        cloud_task_service: CloudTaskService,
        planning_datastore: TestCasePlanningRequestDatastore,
        tcue_datastore: TestCaseUnderExecutionDatastore | None = None,
        test_run_datastore: TestRunDatastore | None = None,
    ):
        self.llm_model = llm_model
        self.file_storage = file_storage
        self.test_case_datastore = test_case_datastore
        self.feature_datastore = feature_datastore
        self.cloud_task_service = cloud_task_service
        self.num_workers = 4
        self.planning_datastore = planning_datastore
        self.tcue_datastore = tcue_datastore
        self.test_run_datastore = test_run_datastore
        self.screen_id_lock = Lock()
        self.failed_flow_ids: List[str] = []
        self.db = GCPDatastoreWrapper().get_datastore_client()
        self.USER_GOAL_PLANNING_HANDLER_FUNCTION_NAME = "UserGoalPlanningHandler"

    def create_raw_test_case_from_kg_flow(
        self, request: ApiRequestEntity
    ) -> ApiResponseEntity:
        try:
            start = time.time()
            # parse the request
            # TODO Refactor: validate the request fields and create request entity
            if request.method != "POST":
                raise TypeError("Input request is not of type POST")

            request_id = request.data.get("request_id")
            request_data = request.data

            kg_path_uri = request_data["kg_gcp_path"]
            flow_path_uri = request_data["flow_gcp_path"]
            features_path_uri = request_data.get("features_gcp_path")
            product_id = request_data["product_id"]
            affected_flow_ids = request_data.get("affected_flows", [])
            added_flow_ids = request_data.get("added_flows", [])
            deleted_flow_ids = request_data.get("deleted_flows", [])
            processed_screen_ids = request_data.get("processed_screen_ids", [])
            attempt_number = request_data.get("attempt_number", 1)
            specific_flows_to_plan = request_data.get("specific_flows_to_plan", [])
            is_fresh_planning_request = request_data.get(
                "is_fresh_planning_request", "false"
            )
            is_force_planning = request_data.get("is_force_planning", "false")
            is_new_ui = request_data.get("is_new_ui", "false")
            test_case_under_execution_ids = request_data.get(
                "test_case_under_execution_ids", []
            )
            orionis_log(f"Input done with params: {request_data}")

            missing_files = []
            if not kg_path_uri or not self.file_storage._gcs_blob_exists(kg_path_uri):
                missing_files.append(f"KG file not found at: {kg_path_uri}")
            if (
                is_new_ui != "true"
                and features_path_uri
                and not self.file_storage._gcs_blob_exists(features_path_uri)
            ):
                missing_files.append(f"Features file not found at: {features_path_uri}")
            if missing_files:
                if attempt_number >= 4:
                    orionis_log(
                        f"File(s) not found after {attempt_number} attempts: {'; '.join(missing_files)}. Raising error."
                    )
                    raise FileNotFoundError(
                        f"File(s) not found after {attempt_number} attempts: {'; '.join(missing_files)}"
                    )
                orionis_log(
                    f"File(s) not found: {'; '.join(missing_files)}. Waiting 10 seconds before retrying cloud task. Attempt {attempt_number}"
                )
                time.sleep(15)
                request_data["attempt_number"] = attempt_number + 1
                self.cloud_task_service.enqueue_task_v1(
                    request_data, "CreateRawTestCaseFromKgFlow"
                )
                return ApiResponseEntity(
                    response={
                        "error": f"File(s) not found: {'; '.join(missing_files)}. Retrying cloud task. Attempt {attempt_number + 1}"
                    },
                    status_code=202,
                )

            self._delete_test_cases_from_flow_ids(deleted_flow_ids)

            features: List[Dict] = []
            db_features: List[Feature] | None = None

            if is_new_ui == "true":
                kg, flows, _ = self._parse_graph(
                    kg_path_uri=kg_path_uri,
                    flow_path_uri=flow_path_uri,
                    product_id=product_id,
                )
                orionis_log("Parsing of graph done")

                try:
                    db_features = self.feature_datastore.get_features(product_id)
                except Exception as e:
                    orionis_log(f"Error loading features from datastore: {e}", e)
                    db_features = []
            else:
                kg, flows, features = self._parse_graph(
                    kg_path_uri, flow_path_uri, features_path_uri, product_id
                )
                orionis_log("Parsing of graph done")

            flow_id_to_tcue_ids: dict[str, list[str]] = {}
            ordered_tcue_ids: list[list[str] | None] = []

            if is_force_planning == "false" and is_fresh_planning_request == "false":
                if specific_flows_to_plan:
                    orionis_log(
                        f"Specific flows to plan provided: {specific_flows_to_plan}"
                    )
                    self._delete_test_cases_from_flow_ids(specific_flows_to_plan)

                    flow_map = {flow["id"]: flow for flow in flows}
                    ordered_flows = []

                    if (
                        is_new_ui == "true"
                        and test_case_under_execution_ids
                        and self.tcue_datastore
                    ):
                        try:
                            tcues = self.tcue_datastore.get_test_case_under_execution_by_ids(
                                test_case_under_execution_ids
                            )
                            for tcue in tcues:
                                if not tcue.flow_id:
                                    continue
                                flow_id_to_tcue_ids.setdefault(tcue.flow_id, []).append(
                                    tcue.id
                                )
                        except Exception as e:
                            orionis_log(
                                f"Failed to build flow->TCUE mapping from ids: {e}", e
                            )
                            raise e

                    for i, flow_id in enumerate(specific_flows_to_plan):
                        if flow_id in flow_map:
                            ordered_flows.append(flow_map[flow_id])
                            if is_new_ui == "true":
                                ordered_tcue_ids.append(
                                    flow_id_to_tcue_ids.get(flow_id, [])
                                )
                            else:
                                ordered_tcue_ids.append(None)
                    flows = ordered_flows
                    target_tcue_ids = ordered_tcue_ids
                else:
                    flows = [
                        flow
                        for flow in flows
                        if (flow["id"] in (affected_flow_ids + added_flow_ids))
                    ]
                    target_tcue_ids = [None] * len(flows)

            if is_force_planning == "true":
                self._delete_test_cases_for_product(product_id)

            if is_force_planning == "true" or is_fresh_planning_request == "true":
                if specific_flows_to_plan:
                    flow_map = {flow["id"]: flow for flow in flows}
                    ordered_flows = []
                    if (
                        is_new_ui == "true"
                        and test_case_under_execution_ids
                        and self.tcue_datastore
                    ):
                        try:
                            tcues = self.tcue_datastore.get_test_case_under_execution_by_ids(
                                test_case_under_execution_ids
                            )
                            for tcue in tcues:
                                if not tcue.flow_id:
                                    continue
                                flow_id_to_tcue_ids.setdefault(tcue.flow_id, []).append(
                                    tcue.id
                                )
                        except Exception as e:
                            orionis_log(
                                f"Failed to build flow->TCUE mapping from ids: {e}", e
                            )
                            raise e
                    for i, flow_id in enumerate(specific_flows_to_plan):
                        if flow_id in flow_map:
                            ordered_flows.append(flow_map[flow_id])
                            if is_new_ui == "true":
                                ordered_tcue_ids.append(
                                    flow_id_to_tcue_ids.get(flow_id, [])
                                )
                            else:
                                ordered_tcue_ids.append(None)
                    flows = ordered_flows
                    target_tcue_ids = ordered_tcue_ids
                else:
                    target_tcue_ids = [None] * len(flows)

            kg2db_feature_id_map = feature_processing(
                self.feature_datastore, features, product_id
            )

            test_run_context = None
            if (
                is_new_ui == "true"
                and test_case_under_execution_ids
                and self.tcue_datastore
                and self.test_run_datastore
            ):
                try:
                    # Fetch context using the first TCUE ID as they should belong to the same TestRun
                    first_tcue_id = test_case_under_execution_ids[0]
                    test_run_context = self._fetch_test_run_context(first_tcue_id)
                except Exception as e:
                    orionis_log(f"Failed to fetch test run context: {e}", e)

            orionis_log(f"generating new test cases for {len(flows)} flows")

            flow_start_index = 0
            processed_flows: List[str] = []
            for flow_start_index in range(0, len(flows), self.num_workers):
                orionis_log(
                    f"\n\n\nProcessed {len(processed_flows)} of {len(flows)} flows so far\n\n\n"
                )
                flow_batch = flows[
                    flow_start_index : flow_start_index + self.num_workers
                ]
                tcue_batch = target_tcue_ids[
                    flow_start_index : flow_start_index + self.num_workers
                ]
                orionis_log(f"Current flow batch: {flow_batch}")
                with ThreadPoolExecutor(max_workers=self.num_workers) as executor:
                    futures = [
                        executor.submit(
                            self._flow_processing,
                            request_id,
                            product_id,
                            kg,
                            flow,
                            db_features if is_new_ui == "true" else None,
                            features if is_new_ui != "true" else None,
                            kg2db_feature_id_map,
                            False,
                            tcue_ids,
                            test_run_context,
                            is_new_ui,
                        )
                        for flow, tcue_ids in zip(flow_batch, tcue_batch)
                    ]

                    neg_tc_results = []
                    for flow, future in zip(flow_batch, futures):
                        try:
                            result = future.result()
                            neg_tc_results.append(result)
                            processed_flows.append(flow["id"])
                        except Exception as e:
                            orionis_log(
                                f"Failed to get result for flow {flow['id']}", e
                            )
                            continue

                    # Process results with thread-safe approach
                    orionis_log("Storing negative test cases with thread-safe approach")
                    for neg_tc_results_for_one_flow in neg_tc_results:
                        processed_screen_ids = self._store_unprocessed_neg_test_cases(
                            neg_tc_results_for_one_flow,
                            request_id,
                            product_id,
                            processed_screen_ids,
                            db_features if is_new_ui == "true" else None,
                            features if is_new_ui != "true" else None,
                            kg2db_feature_id_map,
                            kg,
                        )
                orionis_log(
                    f"IS sharding enabled: {config.enable_sharding_for_kg_flow_analyzer}"
                )
                # If sharding is enabled, check timeout after each batch
                if (
                    config.enable_sharding_for_kg_flow_analyzer
                    and time.time() - start >= config.tcs_from_flow_timeout_mins * 60
                ):
                    orionis_log(
                        f"Processed - {len(processed_flows)} of {len(flows)} flows in this shard: {processed_flows}"
                    )
                    break

            if len(self.failed_flow_ids) > 0:
                orionis_log(
                    f"Failed to process {len(self.failed_flow_ids)} flows in this shard: {self.failed_flow_ids}, for request id: {request_id}",
                    Exception(
                        f"Finished processing shard with request id: {request_id} with some failures, failed flow ids: {self.failed_flow_ids}"
                    ),
                )

            if len(processed_flows) >= len(flows):

                orionis_log(
                    f"All flows processed, marking test case planning request: {request_id} as complete"
                )

                self.planning_datastore.update_test_case_planning_request(
                    UpdateTestCasePlanningRequestParams(
                        request_id=request_id,
                        status=TestCasePlanningRequestStatus.COMPLETED,
                    )
                )

            # If sharding is enabled, create a request for the next shard
            elif config.enable_sharding_for_kg_flow_analyzer:
                remaining_specific_flows = []
                remaining_tcue_ids = []

                if len(flows) == len(target_tcue_ids):
                    for flow, tcue_id in zip(flows, target_tcue_ids):
                        if flow["id"] not in processed_flows:
                            remaining_specific_flows.append(flow["id"])
                            remaining_tcue_ids.append(tcue_id)
                else:
                    # Fallback or error case, though logic suggests they should align
                    remaining_specific_flows = [
                        flow["id"]
                        for flow in flows
                        if flow["id"] not in processed_flows
                    ]
                    remaining_tcue_ids = []

                payload = {
                    "added_flows": [],
                    "affected_flows": [],
                    "deleted_flows": [],
                    "specific_flows_to_plan": remaining_specific_flows,
                    "test_case_under_execution_ids": [
                        uid
                        for sublist in remaining_tcue_ids
                        if sublist
                        for uid in sublist
                    ],
                    "is_new_ui": is_new_ui,
                    "product_id": product_id,
                    "kg_gcp_path": kg_path_uri,
                    "flow_gcp_path": flow_path_uri,
                    "features_gcp_path": features_path_uri,
                    "request_id": request_id,
                    "processed_screen_ids": processed_screen_ids,
                }
                orionis_log(f"payload - {json.dumps(payload)}")
                self.cloud_task_service.enqueue_task_v1(
                    payload,
                    "CreateRawTestCaseFromKgFlow",
                )
                orionis_log(
                    f"**** submitted req with {len(remaining_specific_flows)} specific flows****"
                )

            return ApiResponseEntity(
                response={"all flows processed": True}, status_code=200
            )
        except TypeError as e:
            orionis_log("Type error raised", e)
            return ApiResponseEntity(
                response={"error": f"Exception raised: {e}"},
                status_code=400,  # or 500, depending on the error
            )
        except Exception as e:
            orionis_log("Exception raised", e)
            return ApiResponseEntity(
                response={"error": f"Exception raised {e}"},
                status_code=400,  # or 500, depending on the error
            )

    def _delete_test_cases_for_product(self, product_id: str):
        try:
            orionis_log(f"Deleting all test cases for product id: {product_id}")
            test_case_to_be_deleted = []
            test_cases = self.test_case_datastore.get_test_cases_by_product_id(
                product_id
            )
            for tc in test_cases:
                test_case_to_be_deleted.append(tc.test_case_id)

            self.test_case_datastore.delete_test_cases(test_case_to_be_deleted)
        except Exception as e:
            orionis_log(f"Error in deleting test cases for product id: {product_id}", e)
            raise e

    def _delete_test_cases_from_flow_ids(self, flow_ids: List[str]):
        try:
            orionis_log(f"Deleting test cases for flow ids: {flow_ids}")
            test_case_to_be_deleted = []
            for flow_id in flow_ids:
                test_cases = self.test_case_datastore.get_test_cases_by_flow_id(flow_id)
                for tc in test_cases:
                    test_case_to_be_deleted.append(tc.test_case_id)

            self.test_case_datastore.delete_test_cases(test_case_to_be_deleted)
        except Exception as e:
            orionis_log(f"Error in deleting test cases for flow ids: {flow_ids}", e)
            raise e

    def _fetch_subgraph(
        self, kg: dict, flow: dict, ss_uris: List[str], end_node_id: str | None = None
    ) -> dict:
        path_node_ids = flow["pathNodeIds"]
        if end_node_id:
            try:
                end_node_index = path_node_ids.index(end_node_id)
                path_node_ids = path_node_ids[: end_node_index + 1]
            except Exception as e:
                orionis_log(
                    "for negative flow, the end node id does not appear in flow ids",
                    Exception(
                        "for negative flow, the end node id does not appear in flow ids"
                    ),
                )
                orionis_log(
                    f"flow node ids - {path_node_ids}, target node id - {end_node_id}"
                )
                orionis_log("Exception raised for negative test case storing", e)
        nodes, edges = [None for i in range(len(path_node_ids))], [
            None for i in range(len(path_node_ids) - 1)
        ]
        for kg_node in kg["nodes"]:
            if kg_node["id"] in path_node_ids:
                dup_node = copy.deepcopy(kg_node)
                dup_node["data"]["image"] = ss_uris[path_node_ids.index(kg_node["id"])]
                nodes[path_node_ids.index(kg_node["id"])] = dup_node
        for kg_edge in kg["edges"]:
            for i in range(0, len(path_node_ids) - 1, 1):
                target_source = path_node_ids[i]
                target_dest = path_node_ids[i + 1]
                if target_source == kg_edge["source"]:
                    if target_dest == kg_edge["target"]:
                        edges[i] = kg_edge
        if None in nodes:
            raise Exception(f"one of the path node not found in kg - {path_node_ids}")
        if None in edges:
            raise Exception(
                f"Atleast one of the edge not found in kg - {path_node_ids}"
            )
        sub_kg = {"nodes": nodes, "edges": edges}
        orionis_log("--------------------------------")
        orionis_log(json.dumps(sub_kg, indent=2))
        orionis_log("--------------------------------")
        return sub_kg

    def _get_feature_id_from_node_id(
        self, node_id: str, features: List[Feature]
    ) -> str | None:
        """
        Get DB feature_id from node_id using datastore features with nodeIds.
        """
        if not node_id:
            return None
        for feature in features:
            if feature.nodeIds and node_id in feature.nodeIds:
                return feature.id
        return None

    def _get_db_feature_id_for_node(
        self,
        node_id: str | None,
        db_features: List[Feature] | None,
        features: List[Dict] | None,
        kg2db_feature_id_map: Dict[str, str] | None,
    ) -> str | None:
        if not node_id:
            return None

        if db_features is not None:
            return self._get_feature_id_from_node_id(node_id, db_features)

        kg_feature_id = get_feature_id(features or [], node_id)
        if kg_feature_id and kg2db_feature_id_map:
            return kg2db_feature_id_map.get(kg_feature_id)

        return None

    def _store_unprocessed_neg_test_cases(
        self,
        per_flow_gens: Tuple[dict, str, dict, str, list],
        request_id: str,
        product_id: str,
        processed_screen_ids: List[str],
        db_features: List[Feature] | None,
        features: List[Dict] | None,
        kg2db_feature_id_map: Dict[str, str] | None,
        kg: dict,
    ) -> List[str]:
        try:
            per_flow_negs, flow_id, flow, first_ss_url, ss_uris = per_flow_gens
            if len(per_flow_negs) == 0:
                return processed_screen_ids
            orionis_log(
                f"Storing neg test case with params:\n{per_flow_negs}, {flow_id}, {flow}, {first_ss_url}, {ss_uris}\n"
            )
            updated_processed_ids = processed_screen_ids.copy()
            start_node_id = flow.get("startNodeId") or (
                flow.get("pathNodeIds", [])[0] if flow.get("pathNodeIds") else None
            )

            db_feature_id = self._get_db_feature_id_for_node(
                start_node_id, db_features, features, kg2db_feature_id_map
            )
            for screen_id, ntc_objs in per_flow_negs.items():
                if screen_id == "invalid_screen_id_returned":
                    continue  # TODO - save or skip?
                with self.screen_id_lock:
                    orionis_log("attempting to store neg test case")
                    if screen_id not in updated_processed_ids:
                        for ntc_obj in ntc_objs:
                            orionis_log("Storing neg test case")
                            sub_kg = self._fetch_subgraph(kg, flow, ss_uris, screen_id)
                            self._store_test_case(
                                request_id=request_id,
                                product_id=product_id,
                                screenshot_url=first_ss_url,
                                flow_json=flow,
                                test_case=ntc_obj,
                                flow_id=flow_id,
                                feature_id=db_feature_id,
                                sub_kg=sub_kg,
                            )
                        updated_processed_ids.append(screen_id)
            orionis_log(
                f"{len(updated_processed_ids)-len(processed_screen_ids)} screen ids processed for ng tcs"
            )
        except Exception as e:
            orionis_log(
                f"Error in _store_unprocessed_neg_test_cases for flow {flow_id}", e
            )
        return updated_processed_ids

    def _flow_processing(
        self,
        request_id: str,
        product_id: str,
        kg: dict,
        flow: dict,
        db_features: List[Feature] | None,
        features: List[Dict] | None,
        kg2db_feature_id_map: Dict[str, str] | None,
        is_affected_flow: bool = False,
        tcue_ids: list[str] | None = None,
        test_run_context: Dict[str, Any] | None = None,
        is_new_ui: str = "false",
    ) -> Tuple[Dict[Any, Any], str, Dict[Any, Any], str, List[str]]:
        orionis_log("Starting to process flow")
        try:
            flow_id = flow["id"]
            node_ids, actions, ss_uris, descriptions, edge_ids, business_logics = (
                self._upload_sss(kg, flow)
            )
            orionis_log("screenshots uploaded...")

            action_objects = []
            for act, edge_id, bus_logic in zip(actions, edge_ids, business_logics):
                action_obj = {
                    "edge_id": edge_id,
                    "description": act,
                    "business_logic": bus_logic if bus_logic else "",
                }
                action_objects.append(action_obj)

            rtc_obj, json_data = self._summarize_flow(
                node_ids, actions, ss_uris, descriptions, edge_ids, business_logics
            )
            orionis_log("Happy test case formulation done...")

            db_feature_id = self._get_db_feature_id_for_node(
                node_ids[0], db_features, features, kg2db_feature_id_map
            )
            orionis_log(f"db_feature_id for flow id: {flow_id} is {db_feature_id}")
            first_ss_url = uri_to_url(ss_uris[0])
            sub_kg = self._fetch_subgraph(kg, flow, ss_uris)
            orionis_log(f"Storing a new test coase for flow_id: {flow_id}")
            if is_new_ui == "true":
                if not tcue_ids:
                    orionis_log(
                        f"No TCUE IDs provided for flow {flow_id} in new UI mode; skipping TCUE update"
                    )
                else:
                    for tcue_id in tcue_ids:
                        self._update_tcue(
                            tcue_id,
                            rtc_obj,
                            flow_id,
                            sub_kg,
                            request_id,
                            flow,
                            product_id,
                        )
                        self._trigger_planning_for_flow(tcue_id, test_run_context)
            else:
                self._store_test_case(
                    request_id,
                    product_id,
                    first_ss_url,
                    flow,
                    rtc_obj,
                    flow_id,
                    db_feature_id,
                    sub_kg,
                )
            orionis_log("Happy test case stored on qai...")
            return ({}, "", {}, "", [])  # skip the negative test case generation

            orionis_log("Generating negative tcs...")
            per_flow_gens = self._summarize_neg_flow(
                json_data, ss_uris, node_ids, action_objects
            )
            orionis_log("Negative tc generated...")
            return (per_flow_gens, flow_id, flow, first_ss_url, ss_uris)
        except Exception as e:
            orionis_log(f"Exception raised while processing flowid - {flow_id}", e)
            self.failed_flow_ids.append(flow_id)
            return ({}, "", {}, "", [])

    def fetchParams(self, actions: List[str]) -> List[str]:
        pattern = r"\{\{.*?\}\}"
        params = []
        for action in actions:
            params += re.findall(pattern, action)
        orionis_log(f"Found {len(params)} parameters in the flow")
        return params

    def isAllParamsCoveredInTC(self, json_data: dict, params: List[str]) -> bool:
        description = json_data["description"]
        precons = ". ".join(json_data["preconditions"])
        steps = ". ".join(
            [steps["step_description"] for steps in json_data["test_case_steps"]]
        )
        results = ". ".join(
            [
                result
                for results in json_data["test_case_steps"]
                for result in results["expected_results"]
            ]
        )
        combined = description + ". " + precons + ". " + steps + ". " + results
        for param in params:
            if param not in combined:
                orionis_log(f"{param} not found in the test case.")
                return False
        return True

    def _summarize_neg_flow(
        self,
        happy_tc: dict,
        ss_uris: List[str],
        node_ids: List[str],
        action_objects: List[dict],
    ) -> dict:
        orionis_log("Starting to generate negative test cases")
        ss_urls = [uri_to_url(uri) for uri in ss_uris]
        prompt = CREATE_NEG_TEST_CASES_FROM_FLOW_PROMPT
        prompt = prompt.replace("<HAPPY_TEST_CASE>", json.dumps(happy_tc, indent=2))
        prompt = prompt.replace("<ACTIONS>", json.dumps(action_objects, indent=2))
        llm_response = self.llm_model.call_llm_v3(
            prompt=prompt,
            image_urls=ss_urls,
            response_schema=neg_test_cases_schema,
        )
        json_data = json.loads(llm_response)
        neg_test_cases: dict = {"invalid_screen_id_returned": []}
        orionis_log(f"Orionis log for getting statement is: {json_data}")
        for tcs_flow in json_data:
            for tc_per_screen in tcs_flow:
                screen_index = tc_per_screen.pop("screen_index")
                neg_test_case = TestCaseInferenceResponseSchema.model_validate(
                    tc_per_screen
                )
                if (screen_index < len(node_ids)) and (screen_index >= 0):
                    node_id = node_ids[screen_index]
                    if node_id in neg_test_cases:
                        neg_test_cases[node_id].append(neg_test_case)
                    else:
                        neg_test_cases[node_id] = [neg_test_case]
                else:
                    neg_test_cases["invalid_screen_id_returned"].append(neg_test_case)
        orionis_log(f"Formed negative test cases: {neg_test_cases}")
        return neg_test_cases

    def _summarize_flow(
        self,
        node_ids: List[str],
        actions: List[str],
        ss_uris: List[str],
        descriptions: List[str],
        edge_ids: List[str],
        business_logics: List[str],
    ) -> Tuple[TestCaseInferenceResponseSchema, dict]:

        params = self.fetchParams(actions)
        params_covered = False
        action_objects = []
        for act, edge_id, bus_logic in zip(actions, edge_ids, business_logics):
            action_obj = {
                "edge_id": edge_id,
                "description": act,
                "business_logic": bus_logic if bus_logic else "",
            }
            action_objects.append(action_obj)

        for try_count in range(3):
            orionis_log(
                f"Trying for {try_count+1} time to check if json output contains all the params"
            )
            ss_urls = [uri_to_url(uri) for uri in ss_uris]
            prompt = CREATE_RAW_TEST_CASE_FROM_FLOW_PROMPT
            prompt = prompt.replace("<ACTIONS>", json.dumps(action_objects, indent=2))
            prompt = prompt.replace(
                "<DESCRIPTIONS>", json.dumps(descriptions, indent=2)
            )
            prompt = prompt.replace("<PARAMS>", json.dumps(params, indent=2))
            llm_response = self.llm_model.call_llm_v3(
                prompt=prompt,
                image_urls=ss_urls,
                response_schema=raw_test_case_schema,
            )
            json_data = json.loads(llm_response)
            if (len(params) == 0) or self.isAllParamsCoveredInTC(json_data, params):
                params_covered = True
                break
        if not params_covered:
            raise Exception(f"Test case couldnt cover all the params - {params}")
        raw_test_case = TestCaseInferenceResponseSchema.model_validate(json_data)
        return raw_test_case, json_data

    def save_base64_image_to_gcp(
        self,
        base64_string: str,
        bucket_name: str,
        blob_name: str,
        file_storage_client: GCPFileStorageWrapper,
    ) -> str:
        if base64_string.startswith("data:image"):
            base64_string = base64_string.split(",")[1]

        image_bytes = base64.b64decode(base64_string)

        return file_storage_client.store_bytes(
            image_bytes,
            bucket_name=bucket_name,
            blob_name=blob_name,
            content_type="image/png",
        )

    def _upload_sss(
        self, kg: dict, flow: dict
    ) -> Tuple[List[str], List[str], List[str], List[str], List[str], List[str]]:
        node_ids: List[str] = flow["pathNodeIds"]
        ss_uris: List[str] = ["" for i in range(len(node_ids))]
        descriptions: List[str] = ["" for i in range(len(node_ids))]
        for node in kg["nodes"]:
            if node["id"] not in node_ids:
                continue
            list_idx = node_ids.index(node["id"])
            descriptions[list_idx] = node["data"]["description"]
            image_string = node["data"]["image"]
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            ss_uri = self.save_base64_image_to_gcp(
                image_string,
                TEST_CASE_PLANNING_BUCKET_NAME,
                f'raw_tc_from_flow_screenshots/{timestamp}/{node["id"]}.png',
                self.file_storage,
            )
            ss_uris[list_idx] = ss_uri

        actions: List[str] = []
        business_logics: List[str] = []
        edge_ids: List[str] = []
        for i in range(0, len(node_ids) - 1, 1):
            flow_source, flow_target = node_ids[i], node_ids[i + 1]
            edge_found = False
            for edge in kg["edges"]:
                source, target = edge["source"], edge["target"]
                if (flow_source == source) and (flow_target == target):
                    actions.append(edge["data"]["description"])
                    business_logics.append(edge["data"].get("business_logic") or "")
                    edge_ids.append(edge["id"])
                    edge_found = True
                    break
            if edge_found is False:
                raise RuntimeError(
                    f"ERROR - edge not found b/w {flow_source} and {flow_target}"
                )

        return node_ids, actions, ss_uris, descriptions, edge_ids, business_logics

    def _parse_graph(
        self,
        kg_path_uri: str,
        flow_path_uri: str,
        product_id: str,
        features_path_uri: str | None = None,
    ) -> Tuple[Dict, List[Dict], List[Dict]]:
        # Use passed product_id directly
        if product_id:
            orionis_log(f"Fetching graph data for product_id: {product_id} via API")
            try:
                artifacts = collaboration_manager.get_graph_data(product_id)
                kg = artifacts.get("graph") or {}
                flow = artifacts.get("flows") or []
                features = artifacts.get("features") or []

                # Ensure flow is a list
                if not isinstance(flow, list):
                    flow = [flow] if flow else []
                orionis_log(f"{len(flow)} flows found")
                orionis_log("Parsing graph complete, returning")
                return kg, flow, features
            except Exception as e:
                orionis_log(
                    f"Failed to fetch graph data via API: {e}. Falling back to GCS download.",
                    e,
                )
                # Fallback to original GCS download logic
                return self._parse_graph_from_gcs(
                    kg_path_uri, flow_path_uri, features_path_uri
                )
        else:
            orionis_log("No product_id provided. Falling back to GCS download.")
            return self._parse_graph_from_gcs(
                kg_path_uri, flow_path_uri, features_path_uri
            )

    def _parse_graph_from_gcs(
        self, kg_path_uri: str, flow_path_uri: str, features_path_uri: str | None = None
    ) -> Tuple[Dict, List[Dict], List[Dict]]:
        # download the files locally
        orionis_log("Trying to open the kg files (GCS fallback)")
        local_kg_path = self.file_storage.download_file_locally(
            uri=kg_path_uri, generation=None, use_constructed_bucket_name=False
        )
        local_flow_path = self.file_storage.download_file_locally(
            uri=flow_path_uri, generation=None, use_constructed_bucket_name=False
        )
        with open(local_kg_path, "r") as infileobj:
            kg = json.load(infileobj)
        with open(local_flow_path, "r") as infileobj:
            flow = json.load(infileobj)

        if features_path_uri:
            local_features_path = self.file_storage.download_file_locally(
                uri=features_path_uri,
                generation=None,
                use_constructed_bucket_name=False,
            )
            with open(local_features_path, "r") as infileobj:
                features = json.load(infileobj).get("features", [])
        else:
            features = []

        return kg, flow, features

    def _extract_scenarios_from_flow(self, flow_json: dict) -> List[Scenario]:

        scenarios = []

        flow_scenarios = flow_json.get("scenarios", [])

        if isinstance(flow_scenarios, list):
            for scenario_data in flow_scenarios:
                if isinstance(scenario_data, dict):
                    params = []
                    scenario_params = scenario_data.get("params", [])

                    if isinstance(scenario_params, list):
                        for param_data in scenario_params:
                            if (
                                isinstance(param_data, dict)
                                and "parameter_name" in param_data
                                and "parameter_value" in param_data
                            ):
                                params.append(
                                    TestCaseParameter(
                                        parameter_name=param_data["parameter_name"],
                                        parameter_value=param_data["parameter_value"],
                                    )
                                )

                    scenario = Scenario(
                        id=scenario_data.get("id", str(uuid.uuid4())),
                        description=scenario_data.get("description", ""),
                        params=params if params else None,
                    )
                    scenarios.append(scenario)

        return scenarios

    def _update_tcue(
        self,
        tcue_id: str,
        rtc_obj: TestCaseInferenceResponseSchema,
        flow_id: str,
        sub_kg: dict,
        request_id: str,
        flow_json: dict,
        product_id: str,
    ) -> None:
        if not self.tcue_datastore:
            orionis_log("TCUE Datastore not initialized")
            return

        existing_tcue = None
        try:
            tcue_list = self.tcue_datastore.get_test_case_under_execution_by_ids(
                [tcue_id]
            )
            if tcue_list:
                existing_tcue = tcue_list[0]
        except Exception as e:
            orionis_log(f"Error fetching existing TCUE {tcue_id}: {e}", e)

        precondition_from_flow = flow_json.get("precondition") or ""
        preconditions = rtc_obj.preconditions.copy() if rtc_obj.preconditions else []
        if precondition_from_flow:
            preconditions = [precondition_from_flow] + preconditions

        credentials = (
            existing_tcue.credentials
            if existing_tcue and existing_tcue.credentials
            else extract_credentials_from_flow(flow_json)
        )

        scenario_parameters = (
            existing_tcue.scenario_parameters
            if existing_tcue and existing_tcue.scenario_parameters
            else None
        )

        title = rtc_obj.title
        description = rtc_obj.description
        test_case_steps = [
            TestCaseStep(
                test_step_id=str(uuid.uuid4()),
                step_description=step.step_description,
                expected_results=step.expected_results,
                edge_id=step.edge_id,
            )
            for step in rtc_obj.test_case_steps
        ]

        if scenario_parameters:
            for parameter_name, parameter_value in scenario_parameters.items():
                title = replace_param_recursive(title, parameter_name, parameter_value)
                description = replace_param_recursive(
                    description, parameter_name, parameter_value
                )
                preconditions = replace_param_recursive(
                    preconditions, parameter_name, parameter_value
                )
                test_case_steps = replace_param_recursive(
                    test_case_steps, parameter_name, parameter_value
                )
                orionis_log(
                    f"Applied parameter replacement: {parameter_name} -> {parameter_value}"
                )

        metadata = {
            "flow_json": flow_json,
            "tc_graph_json": sub_kg,
        }

        update_params = UpdateTestCaseUnderExecutionParams(
            test_case_under_execution_id=tcue_id,
            title=title,
            test_case_description=description,
            preconditions=preconditions,
            test_case_steps=test_case_steps,
            flow_id=flow_id,
            metadata=json.dumps(metadata),
            credentials=credentials,
            scenario_parameters=scenario_parameters,
        )

        try:
            self.tcue_datastore.update_test_case_under_execution(update_params)
            orionis_log(f"Successfully updated TCUE {tcue_id}")
        except Exception as e:
            orionis_log(f"Failed to update TCUE {tcue_id}: {e}", e)

        # Emit graph event for flow update
        event_data = {
            "event": "flow_update",
            "data": {
                "id": flow_id,
                "updates": {
                    "name": {
                        "old": flow_json.get("name"),
                        "new": rtc_obj.title,
                    }
                },
            },
            "product_id": product_id,
            "session_id": "add_flow",
        }
        try:
            orionis_log(f"Emitting graph event for flow update: {event_data}")
            collaboration_manager.emit_graph_event(product_id, event_data)
            orionis_log(f"Emitted graph event for flow update: {event_data}")
        except Exception as e:
            orionis_log(f"Failed to emit graph event for flow update: {event_data}", e)

    def _store_test_case(
        self,
        request_id: str,
        product_id: str,
        screenshot_url: str,
        flow_json: dict,
        test_case: TestCaseInferenceResponseSchema,
        flow_id: str | None = None,
        feature_id: str | None = None,
        sub_kg: dict | None = None,
    ) -> RawTestCase:
        precondition_from_flow = flow_json.get("precondition") or ""
        preconditions = (
            test_case.preconditions.copy() if test_case.preconditions else []
        )
        if precondition_from_flow:
            preconditions = [precondition_from_flow] + preconditions

        scenarios = self._extract_scenarios_from_flow(flow_json)
        orionis_log(f"Extracted {len(scenarios)} scenarios from flow {flow_id}")

        credentials = extract_credentials_from_flow(flow_json)
        orionis_log(f"Extracted {len(credentials)} credentials from flow {flow_id}")

        new_test_case_params = AddTestCaseRequestParams(
            product_id=product_id,
            request_id=request_id,
            title=test_case.title,
            screenshot_url=screenshot_url,
            test_case_type="SMOKE",
            preconditions=preconditions,
            test_case_description=test_case.description,
            test_case_steps=[
                AddTestCaseStepRequestParams(
                    step_description=step.step_description,
                    expected_results=step.expected_results,
                    edge_id=step.edge_id,
                )
                for step in test_case.test_case_steps
            ],
            rationale=test_case.rationale,
            flow_id=flow_id,
            feature_id=feature_id,
            scenarios=scenarios if scenarios else None,
            credentials=credentials if credentials else None,
        )
        metadata = {
            "flow_json": flow_json,
            "tc_graph_json": sub_kg,
        }

        raw_test_case = self.test_case_datastore.add_test_case(
            new_test_case_params, json.dumps(metadata)
        )

        # Emit graph event for flow title update
        event_data = {
            "event": "flow_update",
            "data": {
                "id": flow_id,
                "updates": {
                    "name": {
                        "old": flow_json.get("name"),
                        "new": test_case.title,
                    }
                },
            },
            "product_id": product_id,
            "session_id": "add_flow",
        }
        try:
            orionis_log(f"Emitting graph event for flow update: {event_data}")
            collaboration_manager.emit_graph_event(product_id, event_data)
            orionis_log(f"Emitted graph event for flow update: {event_data}")
        except Exception as e:
            orionis_log(f"Failed to emit graph event for flow update: {event_data}", e)

        return raw_test_case

    def _update_test_case_for_flow(
        self,
        request_id: str,
        product_id: str,
        screenshot_url: str,
        flow_json: dict,
        test_case: TestCaseInferenceResponseSchema,
        flow_id: str | None = None,
        feature_id: str | None = None,
        sub_kg: dict | None = None,
    ) -> RawTestCase:
        if flow_id is None:
            raise ValueError("flow_id is required to update test case")
        existing_test_cases = self.test_case_datastore.get_test_cases_by_flow_id(
            flow_id
        )
        if len(existing_test_cases) == 0:
            orionis_log(
                f"No existing test case found for flow id: {flow_id}, creating new test case"
            )
            return self._store_test_case(
                request_id,
                product_id,
                screenshot_url,
                flow_json,
                test_case,
                flow_id,
                feature_id,
                sub_kg,
            )
        elif len(existing_test_cases) > 1:
            # Find the test case with the latest created_at
            latest_test_case = max(
                existing_test_cases,
                key=lambda tc: (
                    tc.created_at if tc.created_at is not None else datetime.min
                ),
            )
            orionis_log(
                f"Multiple existing test cases found for flow id: {flow_id}, updating the latest one"
            )
            existing_test_case = latest_test_case
        else:
            existing_test_case = existing_test_cases[0]
            orionis_log(f"Existing test case found for flow id: {flow_id}, updating it")
        precondition_from_flow = flow_json.get("precondition") or ""
        preconditions = (
            test_case.preconditions.copy() if test_case.preconditions else []
        )

        scenarios = self._extract_scenarios_from_flow(flow_json)
        orionis_log(
            f"Extracted {len(scenarios)} scenarios from flow {flow_id} for update"
        )

        credentials = extract_credentials_from_flow(flow_json)
        orionis_log(
            f"Extracted {len(credentials)} credentials from flow {flow_id} for update"
        )

        metadata = {
            "flow_json": flow_json,
            "tc_graph_json": sub_kg,
        }
        if precondition_from_flow:
            preconditions = [precondition_from_flow] + preconditions
        update_test_case_params = UpdateTestCaseRequestParams(
            test_case_id=existing_test_case.test_case_id,
            title=test_case.title,
            screenshot_url=screenshot_url,
            preconditions=preconditions,
            test_case_description=test_case.description,
            test_case_steps=[
                RawTestCaseStep(
                    test_step_id=str(uuid.uuid4()),
                    step_description=step.step_description,
                    expected_results=step.expected_results,
                    edge_id=step.edge_id,
                )
                for step in test_case.test_case_steps
            ],
            rationale=test_case.rationale,
            feature_id=feature_id,
            product_id=product_id,
            request_id=request_id,
            metadata=json.dumps(metadata),
            scenarios=scenarios if scenarios else None,
            credentials=credentials if credentials else None,
        )

        raw_test_case = self.test_case_datastore.update_test_case(
            update_test_case_params
        )
        return raw_test_case

    def _trigger_planning_for_flow(
        self, tcue_id: str, test_run_context: Dict[str, Any] | None = None
    ) -> None:
        if not self.tcue_datastore or not self.test_run_datastore:
            orionis_log("TCUE Datastore or TestRunDatastore not initialized")
            return

        try:
            payload = {}
            test_run_id = None
            build_number = None
            device_name = "unknown"

            if test_run_context:
                test_run_id = test_run_context.get(Constants.FIELD_TEST_RUN_ID)
                build_number = test_run_context.get(TestRunDatastore.FIELD_BUILD_NUMBER)
                payload = {
                    Constants.FIELD_TEST_RUN_ID: test_run_id,
                    Constants.FIELD_PRODUCT_ID: test_run_context.get(
                        Constants.FIELD_PRODUCT_ID
                    ),
                    Constants.FIELD_EXECUTABLE_URL: test_run_context.get(
                        Constants.FIELD_EXECUTABLE_URL
                    ),
                    Constants.FIELD_PLATFORM_TYPE: test_run_context.get(
                        Constants.FIELD_PLATFORM_TYPE
                    ),
                    Constants.FIELD_TEST_CASE_IDS: [],
                    Constants.FIELD_TEST_CASE_UNDER_EXECUTION_IDS: [tcue_id],
                    TestRunDatastore.FIELD_BUILD_NUMBER: build_number,
                }
            else:
                # Fetch TCUE to get test_run_id
                tcue_key = self.db.key(
                    TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION,
                    int(tcue_id),
                )
                tcue_entity = self.db.get(tcue_key)
                if not tcue_entity:
                    orionis_log(f"TCUE with id {tcue_id} not found")
                    return

                test_run_id = tcue_entity.get(
                    TestCaseUnderExecutionDatastore.FIELD_TEST_RUN_ID
                )
                if not test_run_id:
                    orionis_log(f"Test run id not found in TCUE {tcue_id}")
                    return

                test_run = self.test_run_datastore.get_test_run_by_id(str(test_run_id))
                if not test_run:
                    orionis_log(f"Test run with id {test_run_id} not found")
                    return

                device_name = test_run.device_name or "unknown"
                build_number = test_run.build_number

                test_build_key = self.db.key("TestBuild", int(test_run.test_build_id))
                test_build = self.db.get(test_build_key)

                if test_build:
                    payload = {
                        Constants.FIELD_TEST_RUN_ID: test_run.test_run_id,
                        Constants.FIELD_PRODUCT_ID: test_run.product_id,
                        Constants.FIELD_EXECUTABLE_URL: test_build.get(
                            "executable_url"
                        ),
                        Constants.FIELD_PLATFORM_TYPE: test_build.get(
                            Constants.FIELD_PLATFORM_TYPE
                        ),
                        Constants.FIELD_TEST_CASE_IDS: [],
                        Constants.FIELD_TEST_CASE_UNDER_EXECUTION_IDS: [tcue_id],
                        TestRunDatastore.FIELD_BUILD_NUMBER: test_run.build_number,
                    }

            if payload and payload.get(Constants.FIELD_PLATFORM_TYPE) == "WEB":
                self.cloud_task_service.enqueue_task_v1(
                    payload=payload,
                    handler_function_name=self.USER_GOAL_PLANNING_HANDLER_FUNCTION_NAME,
                    queue_name=Constants.USER_GOAL_TASK_QUEUE_NAME,
                )
                orionis_log(
                    f"Goal planning triggered for test run id: {test_run_id}, "
                    f"device: {device_name}, "
                    f"build number: {build_number}, "
                    f"TCUE: {tcue_id}"
                )
        except Exception as e:
            orionis_log(
                f"Error during goal planning for TCUE {tcue_id}",
                e,
            )

    def _fetch_test_run_context(self, tcue_id: str) -> Dict[str, Any]:
        if not self.test_run_datastore:
            raise ValueError("TestRunDatastore not initialized")

        tcue_key = self.db.key(
            TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION,
            int(tcue_id),
        )
        tcue_entity = self.db.get(tcue_key)
        if not tcue_entity:
            raise ValueError(f"TCUE with id {tcue_id} not found")

        test_run_id = tcue_entity.get(TestCaseUnderExecutionDatastore.FIELD_TEST_RUN_ID)
        if not test_run_id:
            raise ValueError(f"Test run id not found in TCUE {tcue_id}")

        test_run = self.test_run_datastore.get_test_run_by_id(str(test_run_id))
        if not test_run:
            raise ValueError(f"Test run with id {test_run_id} not found")

        test_build_key = self.db.key("TestBuild", int(test_run.test_build_id))
        test_build = self.db.get(test_build_key)

        context = {
            Constants.FIELD_TEST_RUN_ID: test_run.test_run_id,
            Constants.FIELD_PRODUCT_ID: test_run.product_id,
            TestRunDatastore.FIELD_BUILD_NUMBER: test_run.build_number,
        }

        if test_build:
            context[Constants.FIELD_EXECUTABLE_URL] = test_build.get("executable_url")
            context[Constants.FIELD_PLATFORM_TYPE] = test_build.get(
                Constants.FIELD_PLATFORM_TYPE
            )

        return context
