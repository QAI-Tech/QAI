from datetime import datetime, timezone
import json
from collections import defaultdict
from typing import Dict, List
from common.google_cloud_wrappers import GCPDatastoreWrapper
from test_case_under_execution.test_case_under_exec_models import (
    DailyUsageData,
    ExecutionStatus,
    MonthlyUsageData,
    ProductUsageMap,
    CreateTestCaseUnderExecutionParams,
    TestCaseUnderExecution,
    UpdateTestCaseUnderExecutionParams,
    AssignTcueToUsersParams,
)
from test_case_under_execution.test_case_under_exec_models import TestCaseStep
from test_cases.test_case_models import TestCaseCriticality
from utils.util import orionis_log, parse_metadata
from constants import Constants
from google.cloud import datastore
from test_runs.test_run_status_counts import (
    apply_status_count_deltas,
    build_status_count_deltas,
    update_test_run_status_counts,
)
from organisations.org_datastore import OrganisationDatastore
from products.product_datastore import ProductDatastore


class TestCaseUnderExecutionDatastore:

    ENTITY_KIND_TEST_CASE_UNDER_EXECUTION = "TestCaseUnderExecution"
    FIELD_TEST_CASE_ID = "test_case_id"
    FIELD_TEST_RUN_ID = "test_run_id"
    FIELD_DEVICE_ID = "device_id"
    FIELD_ASSIGNEE_USER_ID = "assignee_user_id"
    FIELD_STATUS = "status"
    FIELD_NOTES = "notes"
    FIELD_CREATED_AT = "created_at"
    FIELD_UPDATED_AT = "updated_at"
    FIELD_EXECUTION_STARTED_AT = "execution_started_at"
    FIELD_EXECUTION_COMPLETED_AT = "execution_completed_at"
    FIELD_PRODUCT_ID = "product_id"
    FIELD_FEATURE_ID = "feature_id"
    FIELD_FUNCTIONALITY_ID = "functionality_id"
    FIELD_REQUEST_ID = "request_id"
    FIELD_RATIONALE = "rationale"
    FIELD_SCREENSHOT_URL = "screenshot_url"
    FIELD_EXECUTION_VIDEO_URL = "execution_video_url"
    FIELD_TEST_CASE_DESCRIPTION = "test_case_description"
    FIELD_TEST_CASE_STEPS = "test_case_steps"
    FIELD_TEST_CASE_TYPE = "test_case_type"
    FIELD_PRECONDITIONS = "preconditions"
    FIELD_EXECUTION_COMPLETED_AT = "execution_completed_at"
    FIELD_TEST_CASE_CREATED_AT = "test_case_created_at"
    FIELD_COMMENTS = "comments"
    FIELD_CRITICALITY = "criticality"
    FIELD_METADATA = "metadata"
    FIELD_TITLE = "title"
    FIELD_TYPE = "type"
    FIELD_HTTP_METHOD = "http_method"
    FIELD_URL = "url"
    FIELD_REQUEST_BODY = "request_body"
    FIELD_HEADERS = "headers"
    FIELD_ANNOTATIONS = "annotations"
    FIELD_FLOW_ID = "flow_id"
    FIELD_EDGE_ID = "edge_id"
    FIELD_SCENARIO_PARAMETERS = "scenario_parameters"
    FIELD_CREDENTIALS = "credentials"

    def __init__(
        self,
        org_datastore: OrganisationDatastore,
        product_datastore: ProductDatastore,
    ):
        self.db = GCPDatastoreWrapper().get_datastore_client()
        self.org_datastore = org_datastore
        self.product_datastore = product_datastore

    def _serialize_test_case_steps(
        self,
        update_params: UpdateTestCaseUnderExecutionParams,
        entity: datastore.Entity,
    ) -> list[dict]:
        """Serialize TestCaseStep objects while preserving existing edge IDs."""
        test_case_steps: list[dict] = []
        step_id_to_existing_edge_id = {
            step.get(Constants.FIELD_TEST_STEP_ID): step.get(
                TestCaseUnderExecutionDatastore.FIELD_EDGE_ID
            )
            for step in entity.get(
                TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_STEPS, []
            )
        }
        if update_params.test_case_steps:
            for step in update_params.test_case_steps:
                if isinstance(step, TestCaseStep):
                    test_case_steps.append(
                        {
                            Constants.FIELD_TEST_STEP_ID: step.test_step_id,
                            Constants.FIELD_TEST_STEP_DESCRIPTION: step.step_description,
                            Constants.FIELD_TEST_STEP_EXP_RESULTS: step.expected_results,
                            TestCaseUnderExecutionDatastore.FIELD_TYPE: step.type,
                            TestCaseUnderExecutionDatastore.FIELD_HTTP_METHOD: step.http_method,
                            TestCaseUnderExecutionDatastore.FIELD_URL: step.url,
                            TestCaseUnderExecutionDatastore.FIELD_REQUEST_BODY: step.request_body,
                            TestCaseUnderExecutionDatastore.FIELD_HEADERS: step.headers,
                            TestCaseUnderExecutionDatastore.FIELD_EDGE_ID: (
                                step.edge_id
                                if step.edge_id is not None
                                else step_id_to_existing_edge_id.get(step.test_step_id)
                            ),
                            TestCaseUnderExecutionDatastore.FIELD_STATUS: step.status.value,
                        }
                    )
        return test_case_steps

    def _build_update_fields(
        self,
        update_params: UpdateTestCaseUnderExecutionParams,
        test_case_steps: list[dict],
        updated_at: datetime,
    ) -> dict:
        """Build the update field map for a TCUE update."""
        return {
            TestCaseUnderExecutionDatastore.FIELD_UPDATED_AT: updated_at,
            TestCaseUnderExecutionDatastore.FIELD_STATUS: (
                update_params.status.value if update_params.status else None
            ),
            TestCaseUnderExecutionDatastore.FIELD_CRITICALITY: (
                update_params.criticality.value if update_params.criticality else None
            ),
            TestCaseUnderExecutionDatastore.FIELD_EXECUTION_VIDEO_URL: update_params.execution_video_url,
            TestCaseUnderExecutionDatastore.FIELD_SCREENSHOT_URL: update_params.screenshot_url,
            TestCaseUnderExecutionDatastore.FIELD_NOTES: update_params.notes,
            TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_STEPS: (
                test_case_steps if update_params.test_case_steps else None
            ),
            TestCaseUnderExecutionDatastore.FIELD_PRECONDITIONS: update_params.preconditions,
            TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_DESCRIPTION: update_params.test_case_description,
            TestCaseUnderExecutionDatastore.FIELD_FEATURE_ID: update_params.feature_id,
            TestCaseUnderExecutionDatastore.FIELD_METADATA: parse_metadata(
                update_params.metadata
            ),
            TestCaseUnderExecutionDatastore.FIELD_ANNOTATIONS: update_params.annotations,
            TestCaseUnderExecutionDatastore.FIELD_ASSIGNEE_USER_ID: update_params.assignee_user_id,
            TestCaseUnderExecutionDatastore.FIELD_SCENARIO_PARAMETERS: update_params.scenario_parameters,
            TestCaseUnderExecutionDatastore.FIELD_FLOW_ID: update_params.flow_id,
            TestCaseUnderExecutionDatastore.FIELD_TITLE: update_params.title,
            TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_ID: update_params.test_case_id,
            TestCaseUnderExecutionDatastore.FIELD_CREDENTIALS: update_params.credentials,
        }

    def _apply_comments_update(
        self, entity: datastore.Entity, comments_raw: str | None
    ) -> None:
        """Validate and set comments field on the entity if provided."""
        if comments_raw is None or comments_raw.strip() == "":
            return
        try:
            new_comments = json.loads(comments_raw)
            if not isinstance(new_comments, list):
                raise ValueError("`comments` must be a JSON array string.")
        except json.JSONDecodeError:
            raise ValueError("Invalid JSON format in 'comments'")

        sorted_comments = sorted(
            new_comments,
            key=lambda c: c.get("createdAt", ""),
            reverse=True,
        )
        entity[TestCaseUnderExecutionDatastore.FIELD_COMMENTS] = json.dumps(
            sorted_comments
        )

    def _apply_update_to_entity(
        self,
        entity: datastore.Entity,
        update_params: UpdateTestCaseUnderExecutionParams,
        updated_at: datetime,
    ) -> None:
        """Apply update_params to the entity with consistent rules used across single/batch updates."""
        if update_params.notes is not None:
            entity.exclude_from_indexes.add(TestCaseUnderExecutionDatastore.FIELD_NOTES)

        if update_params.metadata is not None:
            entity.exclude_from_indexes.add(
                TestCaseUnderExecutionDatastore.FIELD_METADATA
            )

        test_case_steps = self._serialize_test_case_steps(update_params, entity)

        update_fields = self._build_update_fields(
            update_params, test_case_steps, updated_at
        )
        filtered_update_fields = {
            k: v for k, v in update_fields.items() if v is not None
        }
        entity.update(filtered_update_fields)

        # comments
        self._apply_comments_update(entity, update_params.comments)

    def update_test_case_under_execution(
        self, update_test_case_under_exec: UpdateTestCaseUnderExecutionParams
    ) -> TestCaseUnderExecution:
        key = self.db.key(
            TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION,
            int(update_test_case_under_exec.test_case_under_execution_id),
        )
        entity = self.db.get(key)

        if not entity:
            raise ValueError(
                f"TestCaseUnderExecution with id {update_test_case_under_exec.test_case_under_execution_id} not found"
            )

        old_status_str = entity.get(TestCaseUnderExecutionDatastore.FIELD_STATUS)
        old_status = (
            ExecutionStatus(old_status_str)
            if old_status_str
            else ExecutionStatus.UNTESTED
        )
        test_run_id = entity.get(TestCaseUnderExecutionDatastore.FIELD_TEST_RUN_ID)

        self._apply_update_to_entity(
            entity,
            update_test_case_under_exec,
            datetime.now(timezone.utc),
        )

        new_status = (
            update_test_case_under_exec.status
            if update_test_case_under_exec.status
            else old_status
        )

        self.db.put(entity)

        if (
            old_status != new_status
            and new_status in [ExecutionStatus.PASSED, ExecutionStatus.FAILED]
            and old_status not in [ExecutionStatus.PASSED, ExecutionStatus.FAILED]
        ):
            try:
                product_id = entity.get(
                    TestCaseUnderExecutionDatastore.FIELD_PRODUCT_ID
                )
                if product_id:

                    product = self.product_datastore.get_product_from_id(product_id)

                    self.org_datastore.deduct_qubits(product.organisation_id, 1)
                    orionis_log(
                        f"Deducted 1 qubit for organisation {product.organisation_id} "
                        f"due to test case {update_test_case_under_exec.test_case_under_execution_id} "
                        f"status change to {new_status}"
                    )
            except Exception as e:
                orionis_log(f"Error deducting qubits: {e}", e)
                raise e

        if test_run_id and old_status != new_status:
            update_test_run_status_counts(self.db, test_run_id, old_status, new_status)
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

        entity_dict["test_case_steps"] = [
            (TestCaseStep(**step) if not isinstance(step, TestCaseStep) else step)
            for step in entity_dict.get("test_case_steps", [])
        ]

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

        if (
            TestCaseUnderExecutionDatastore.FIELD_TITLE not in entity_dict
            or entity_dict.get(TestCaseUnderExecutionDatastore.FIELD_TITLE) is None
        ):
            entity_dict[TestCaseUnderExecutionDatastore.FIELD_TITLE] = ""
        test_case_under_execution = TestCaseUnderExecution(
            **{**entity_dict, "id": str(entity.key.id)}
        )
        orionis_log(
            f"Successfully updated TestCaseUnderExecution {update_test_case_under_exec.test_case_under_execution_id}"
        )

        return test_case_under_execution

    def update_test_cases_under_execution_batch(
        self, update_params_list: List[UpdateTestCaseUnderExecutionParams]
    ) -> List[TestCaseUnderExecution]:
        """Update multiple test cases under execution in a single batch operation."""
        if not update_params_list:
            return []

        try:
            keys = [
                self.db.key(
                    TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION,
                    int(params.test_case_under_execution_id),
                )
                for params in update_params_list
            ]
            entities = self.db.get_multi(keys)

            if not entities or any(entity is None for entity in entities):
                raise ValueError(
                    "One or more TestCaseUnderExecution entities not found"
                )

            updated_entities = []
            current_time = datetime.now(timezone.utc)
            status_changes_per_test_run: Dict[
                str, List[tuple[ExecutionStatus, ExecutionStatus]]
            ] = defaultdict(list)

            for i, (entity, update_params) in enumerate(
                zip(entities, update_params_list)
            ):
                if entity is None:
                    raise ValueError(
                        f"TestCaseUnderExecution entity not found for index {i}"
                    )

                old_status_str = entity.get(
                    TestCaseUnderExecutionDatastore.FIELD_STATUS
                )
                old_status = (
                    ExecutionStatus(old_status_str)
                    if old_status_str
                    else ExecutionStatus.UNTESTED
                )
                test_run_id = entity.get(
                    TestCaseUnderExecutionDatastore.FIELD_TEST_RUN_ID
                )

                self._apply_update_to_entity(entity, update_params, current_time)

                new_status = (
                    update_params.status if update_params.status else old_status
                )

                if test_run_id and old_status != new_status:
                    status_changes_per_test_run[str(test_run_id)].append(
                        (old_status, new_status)
                    )

                updated_entities.append(entity)

            self.db.put_multi(updated_entities)

            # Batch update TestRun status counts: fetch all at once, update in memory, save all at once
            if status_changes_per_test_run:
                try:
                    # Create keys for all affected test runs and maintain order
                    test_run_ids_list = list(status_changes_per_test_run.keys())
                    test_run_keys = [
                        self.db.key("TestRun", int(test_run_id))
                        for test_run_id in test_run_ids_list
                    ]

                    # Fetch all TestRun entities at once
                    test_run_entities = self.db.get_multi(test_run_keys)

                    # Create a mapping of test_run_id to entity for safe lookup
                    test_run_entity_map = {
                        str(entity.key.id): entity
                        for entity in test_run_entities
                        if entity is not None
                    }

                    # Update all entities in memory
                    updated_test_run_entities = []
                    current_time = datetime.now(timezone.utc)

                    for (
                        test_run_id,
                        status_changes,
                    ) in status_changes_per_test_run.items():
                        test_run_entity = test_run_entity_map.get(test_run_id)
                        if not test_run_entity:
                            orionis_log(
                                f"TestRun {test_run_id} not found for status count update in batch"
                            )
                            continue

                        status_counts = dict(test_run_entity.get("status_counts") or {})

                        # Build cumulative deltas from all status changes
                        deltas: Dict[str, int] = {}
                        for old_status, new_status in status_changes:
                            single_deltas = build_status_count_deltas(
                                old_status, new_status
                            )
                            # Accumulate deltas
                            for status_key, delta in single_deltas.items():
                                deltas[status_key] = deltas.get(status_key, 0) + delta

                        # Apply deltas
                        updated_status_counts = apply_status_count_deltas(
                            status_counts, deltas
                        )

                        test_run_entity["status_counts"] = (
                            updated_status_counts if updated_status_counts else None
                        )
                        test_run_entity["updated_at"] = current_time
                        updated_test_run_entities.append(test_run_entity)

                    # Save all updated TestRun entities at once
                    if updated_test_run_entities:
                        self.db.put_multi(updated_test_run_entities)
                except Exception as e:
                    orionis_log(
                        f"Error updating status counts for test runs in batch: {e}",
                        e,
                    )

            result = []
            for entity in updated_entities:
                entity_dict = dict(entity)

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

                entity_dict["test_case_steps"] = [
                    (
                        TestCaseStep(**step)
                        if not isinstance(step, TestCaseStep)
                        else step
                    )
                    for step in entity_dict.get("test_case_steps", [])
                ]

                if TestCaseUnderExecutionDatastore.FIELD_METADATA in entity_dict:
                    _raw_metadata = entity_dict.get(
                        TestCaseUnderExecutionDatastore.FIELD_METADATA
                    )
                    try:
                        if isinstance(_raw_metadata, datastore.Entity):
                            _normalized = parse_metadata(dict(_raw_metadata))
                        else:
                            _normalized = parse_metadata(_raw_metadata)
                    except Exception as e:
                        orionis_log(
                            f"Failed to parse metadata for entity {entity.key.id}: {e}",
                            e,
                        )
                        _normalized = None
                    entity_dict[TestCaseUnderExecutionDatastore.FIELD_METADATA] = (
                        _normalized
                    )

                if (
                    TestCaseUnderExecutionDatastore.FIELD_TITLE not in entity_dict
                    or entity_dict.get(TestCaseUnderExecutionDatastore.FIELD_TITLE)
                    is None
                ):
                    entity_dict[TestCaseUnderExecutionDatastore.FIELD_TITLE] = ""

                test_case_under_execution = TestCaseUnderExecution(
                    **{**entity_dict, "id": str(entity.key.id)}
                )
                result.append(test_case_under_execution)

            orionis_log(
                f"Successfully updated {len(result)} test cases under execution in batch"
            )
            return result

        except Exception as e:
            orionis_log("Error updating test cases under execution in batch", e)
            raise e

    def get_test_cases_under_execution(
        self, test_run_id: str
    ) -> list[TestCaseUnderExecution]:

        query = self.db.query(
            kind=TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION
        )
        query.add_filter(
            TestCaseUnderExecutionDatastore.FIELD_TEST_RUN_ID, "=", test_run_id
        )
        query.order = [
            "{}".format(TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_CREATED_AT)
        ]

        test_cases_under_execution: list[TestCaseUnderExecution] = []
        for entity in query.fetch():
            test_cases_under_execution.append(
                TestCaseUnderExecution(
                    id=str(entity.key.id),
                    test_case_id=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_ID
                    ),
                    test_run_id=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_TEST_RUN_ID
                    ),
                    product_id=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_PRODUCT_ID
                    ),
                    feature_id=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_FEATURE_ID
                    ),
                    functionality_id=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_FUNCTIONALITY_ID
                    ),
                    request_id=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_REQUEST_ID
                    )
                    or "MANUAL",
                    assignee_user_id=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_ASSIGNEE_USER_ID
                    ),
                    status=ExecutionStatus(
                        entity.get(TestCaseUnderExecutionDatastore.FIELD_STATUS)
                    ),
                    criticality=(
                        TestCaseCriticality(
                            entity.get(
                                TestCaseUnderExecutionDatastore.FIELD_CRITICALITY
                            )
                        )
                        if entity.get(TestCaseUnderExecutionDatastore.FIELD_CRITICALITY)
                        else TestCaseCriticality.HIGH
                    ),
                    notes=(
                        " ".join(
                            entity.get(TestCaseUnderExecutionDatastore.FIELD_NOTES)
                        )
                        if isinstance(
                            entity.get(TestCaseUnderExecutionDatastore.FIELD_NOTES),
                            list,
                        )
                        else entity.get(TestCaseUnderExecutionDatastore.FIELD_NOTES, "")
                    ),
                    comments=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_COMMENTS, ""
                    ),
                    rationale=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_RATIONALE, ""
                    ),
                    screenshot_url=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_SCREENSHOT_URL, ""
                    ),
                    execution_video_url=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_EXECUTION_VIDEO_URL, ""
                    ),
                    test_case_description=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_DESCRIPTION
                    ),
                    test_case_steps=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_STEPS, []
                    ),
                    test_case_type=(
                        entity.get(TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_TYPE)
                        if entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_TYPE
                        )
                        else ""
                    ),
                    preconditions=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_PRECONDITIONS, []
                    ),
                    created_at=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_CREATED_AT
                    ),
                    updated_at=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_UPDATED_AT
                    ),
                    execution_started_at=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_EXECUTION_STARTED_AT
                    ),
                    execution_completed_at=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_EXECUTION_COMPLETED_AT
                    ),
                    test_case_created_at=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_CREATED_AT
                    ),
                    title=entity.get(TestCaseUnderExecutionDatastore.FIELD_TITLE) or "",
                    metadata=(
                        parse_metadata(
                            entity.get(TestCaseUnderExecutionDatastore.FIELD_METADATA)
                        )
                        if entity.get(TestCaseUnderExecutionDatastore.FIELD_METADATA)
                        is not None
                        else None
                    ),
                    annotations=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_ANNOTATIONS, []
                    ),
                    flow_id=entity.get(TestCaseUnderExecutionDatastore.FIELD_FLOW_ID),
                    scenario_parameters=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_SCENARIO_PARAMETERS, {}
                    ),
                    credentials=entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_CREDENTIALS, []
                    ),
                )
            )

        orionis_log(
            f"Fetched {len(test_cases_under_execution)} test cases under execution for test_run_id: {test_run_id}"
        )
        return test_cases_under_execution

    def delete_test_cases_under_execution(
        self, test_case_under_execution_ids: List[str]
    ) -> List[str]:
        orionis_log(
            f"Datastore function has started with ids: {test_case_under_execution_ids}"
        )
        try:
            keys = [
                self.db.key(
                    TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION,
                    int(id),
                )
                for id in test_case_under_execution_ids
            ]
            entities = self.db.get_multi(keys)

            missing_entities = [
                test_case_under_execution_ids[i]
                for i, entity in enumerate(entities or [])
                if entity is None
            ]

            if not entities or missing_entities:
                raise ValueError(
                    f"Missing TestCaseUnderExecution entities for IDs: {missing_entities or 'ALL'}"
                )

            orionis_log(f"Entities: {entities}")
            execution_ids = [entity.key.id_or_name for entity in entities]

            deleted_per_test_run: Dict[str, int] = defaultdict(int)
            status_counts_per_test_run: Dict[str, Dict[str, int]] = defaultdict(
                lambda: {"passed": 0, "failed": 0}
            )

            for entity in entities:
                test_run_id = entity.get(
                    TestCaseUnderExecutionDatastore.FIELD_TEST_RUN_ID
                )
                if test_run_id:
                    test_run_id_str = str(test_run_id)
                    deleted_per_test_run[test_run_id_str] += 1

                    status_str = entity.get(
                        TestCaseUnderExecutionDatastore.FIELD_STATUS
                    )
                    if status_str == ExecutionStatus.PASSED.value:
                        status_counts_per_test_run[test_run_id_str]["passed"] += 1
                    elif status_str == ExecutionStatus.FAILED.value:
                        status_counts_per_test_run[test_run_id_str]["failed"] += 1

            self.db.delete_multi(keys)

            # Batch update TestRun entities: fetch all at once, update in memory, save all at once
            if deleted_per_test_run:
                try:
                    # Create keys for all affected test runs
                    test_run_ids_list = list(deleted_per_test_run.keys())
                    test_run_keys = [
                        self.db.key("TestRun", int(test_run_id))
                        for test_run_id in test_run_ids_list
                    ]

                    # Fetch all TestRun entities at once
                    test_run_entities = self.db.get_multi(test_run_keys)

                    # Create a mapping of test_run_id to entity for safe lookup
                    test_run_entity_map = {
                        str(entity.key.id): entity
                        for entity in test_run_entities
                        if entity is not None
                    }

                    # Update all entities in memory
                    updated_test_run_entities = []
                    current_time = datetime.now(timezone.utc)
                    test_runs_needing_count = (
                        []
                    )  # Track test runs that need tcue_count query

                    for test_run_id, deleted_count in deleted_per_test_run.items():
                        test_run_entity = test_run_entity_map.get(test_run_id)
                        if not test_run_entity:
                            orionis_log(
                                f"TestRun {test_run_id} not found for tcue_count update after delete"
                            )
                            continue

                        # Update tcue_count
                        current_count = test_run_entity.get("tcue_count")
                        if current_count is None:
                            # Mark for counting query (we'll handle these separately)
                            test_runs_needing_count.append(
                                (test_run_id, test_run_entity)
                            )
                        else:
                            test_run_entity["tcue_count"] = max(
                                0, int(current_count) - int(deleted_count)
                            )

                        # Update status_counts if needed
                        deleted_status_counts = status_counts_per_test_run.get(
                            test_run_id, {}
                        )
                        passed_deleted = deleted_status_counts.get("passed", 0)
                        failed_deleted = deleted_status_counts.get("failed", 0)

                        if passed_deleted > 0 or failed_deleted > 0:
                            status_counts = dict(
                                test_run_entity.get("status_counts") or {}
                            )

                            # Build deltas for deletions
                            deltas: Dict[str, int] = {}
                            if passed_deleted > 0:
                                deltas["passed"] = -passed_deleted
                            if failed_deleted > 0:
                                deltas["failed"] = -failed_deleted

                            # Apply deltas
                            updated_status_counts = apply_status_count_deltas(
                                status_counts, deltas
                            )
                            test_run_entity["status_counts"] = (
                                updated_status_counts if updated_status_counts else None
                            )

                        test_run_entity["updated_at"] = current_time
                        updated_test_run_entities.append(test_run_entity)

                    # Handle test runs that need tcue_count query (backfill for old runs)
                    for test_run_id, test_run_entity in test_runs_needing_count:
                        try:
                            query = self.db.query(
                                kind=TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION
                            )
                            query.add_filter(
                                TestCaseUnderExecutionDatastore.FIELD_TEST_RUN_ID,
                                "=",
                                test_run_id,
                            )
                            query.keys_only()
                            remaining_count = len(list(query.fetch()))
                            test_run_entity["tcue_count"] = remaining_count
                        except Exception as e:
                            orionis_log(
                                f"Error counting remaining TCUEs for test run {test_run_id}: {e}",
                                e,
                            )

                    # Save all updated TestRun entities at once
                    if updated_test_run_entities:
                        self.db.put_multi(updated_test_run_entities)
                except Exception as e:
                    orionis_log(
                        f"Error updating test runs after TCUE delete: {e}",
                        e,
                    )

            orionis_log(
                f"Successfully deleted TestCaseUnderExecution {execution_ids} from test run"
            )

            return execution_ids

        except ValueError as e:
            orionis_log(
                "ValueError in delete_test_case_under_execution_from_test_run", e
            )
            raise e
        except Exception as e:
            orionis_log("Error in delete_test_case_under_execution_from_test_run", e)
            raise ValueError(
                "Failed to delete test case under execution from test run", e
            )

    def get_usage_data_for_products(self, product_ids: List[str]) -> ProductUsageMap:
        """
        Get all usage data for the provided product IDs, grouped by product, month and date.
        Returns ProductUsageMap containing mapping of product_id to list of monthly usage data.
        Only includes billable TCUE statuses (PASSED, FAILED).
        """
        try:
            if not product_ids:
                orionis_log("No product IDs provided")
                return {}

            # Query all test cases under execution for all products with billable statuses only
            query = self.db.query(kind=self.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION)
            query.add_filter(self.FIELD_PRODUCT_ID, "IN", product_ids)
            query.add_filter(self.FIELD_STATUS, "IN", Constants.TCUE_BILLABLE_STATUSES)
            entities = list(query.fetch())

            if not entities:
                orionis_log(
                    f"No billable test cases under execution found for products {product_ids}"
                )
                return {}

            orionis_log(
                f"Found {len(entities)} billable TCUEs for products {product_ids}"
            )

            # Dictionary to store data: {product_id: {(year, month): {date: {test_run_id: tcue_count}}}}
            product_monthly_data_dict: Dict[
                str, Dict[tuple, Dict[str, Dict[str, int]]]
            ] = defaultdict(
                lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
            )

            for entity in entities:
                # Use created_at for billing purposes (when TCUE was completed)
                created_at = entity.get(self.FIELD_CREATED_AT)
                test_run_id = entity.get(self.FIELD_TEST_RUN_ID)
                product_id = entity.get(self.FIELD_PRODUCT_ID)

                if created_at and test_run_id and product_id:
                    # Create month key (year, month)
                    month_key = (created_at.year, created_at.month)
                    date_str = created_at.strftime("%Y-%m-%d")

                    # Counting TCUEs per test run per date per product
                    product_monthly_data_dict[product_id][month_key][date_str][
                        test_run_id
                    ] += 1

            # Convert to dict with product_id as key and list of MonthlyUsageData as value
            product_usage_dict: Dict[str, List[MonthlyUsageData]] = {
                pid: [] for pid in product_ids
            }

            for product_id, monthly_data in product_monthly_data_dict.items():
                monthly_usage_data = []
                for month_key in sorted(monthly_data.keys(), reverse=True):
                    year, month = month_key
                    month_name = Constants.MONTH_NAMES[month - 1]

                    daily_usage = []
                    for date_str in sorted(monthly_data[month_key].keys()):
                        test_run_data = monthly_data[month_key][date_str]

                        # Create usage array with TCUE count for each test run
                        usage_counts = list(test_run_data.values())

                        daily_usage.append(
                            DailyUsageData(date=date_str, usage=usage_counts)
                        )

                    if daily_usage:  # Only includes months with actual usage
                        monthly_usage_data.append(
                            MonthlyUsageData(
                                month=month_name, year=year, daily_usage=daily_usage
                            )
                        )
                product_usage_dict[product_id] = monthly_usage_data

            orionis_log(f"Processed usage data for {len(product_usage_dict)} products")

            return product_usage_dict

        except Exception as e:
            orionis_log(f"Error fetching usage data for products {product_ids}", e)
            raise e

    def get_test_case_under_execution_by_ids(
        self, test_case_under_execution_ids: list[str]
    ) -> list[TestCaseUnderExecution]:

        if not test_case_under_execution_ids:
            return []

        try:
            keys = [
                self.db.key(
                    TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION,
                    int(id),
                )
                for id in test_case_under_execution_ids
            ]

            entities = self.db.get_multi(keys)

            test_cases_under_execution: list[TestCaseUnderExecution] = []

            for entity in entities:
                if entity is None:
                    continue
                test_cases_under_execution.append(
                    TestCaseUnderExecution(
                        id=str(entity.key.id),
                        test_case_id=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_ID
                        ),
                        test_run_id=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_TEST_RUN_ID
                        ),
                        product_id=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_PRODUCT_ID
                        ),
                        feature_id=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_FEATURE_ID
                        ),
                        functionality_id=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_FUNCTIONALITY_ID
                        ),
                        request_id=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_REQUEST_ID
                        )
                        or "MANUAL",
                        assignee_user_id=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_ASSIGNEE_USER_ID
                        ),
                        status=ExecutionStatus(
                            entity.get(TestCaseUnderExecutionDatastore.FIELD_STATUS)
                        ),
                        criticality=(
                            TestCaseCriticality(
                                entity.get(
                                    TestCaseUnderExecutionDatastore.FIELD_CRITICALITY
                                )
                            )
                            if entity.get(
                                TestCaseUnderExecutionDatastore.FIELD_CRITICALITY
                            )
                            else TestCaseCriticality.HIGH
                        ),
                        notes=(
                            " ".join(
                                entity.get(TestCaseUnderExecutionDatastore.FIELD_NOTES)
                            )
                            if isinstance(
                                entity.get(TestCaseUnderExecutionDatastore.FIELD_NOTES),
                                list,
                            )
                            else entity.get(
                                TestCaseUnderExecutionDatastore.FIELD_NOTES, ""
                            )
                        ),
                        comments=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_COMMENTS, ""
                        ),
                        rationale=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_RATIONALE, ""
                        ),
                        screenshot_url=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_SCREENSHOT_URL, ""
                        ),
                        execution_video_url=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_EXECUTION_VIDEO_URL,
                            "",
                        ),
                        test_case_description=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_DESCRIPTION
                        ),
                        test_case_steps=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_STEPS, []
                        ),
                        test_case_type=(
                            entity.get(
                                TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_TYPE
                            )
                            if entity.get(
                                TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_TYPE
                            )
                            else ""
                        ),
                        preconditions=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_PRECONDITIONS, []
                        ),
                        created_at=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_CREATED_AT
                        ),
                        updated_at=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_UPDATED_AT
                        ),
                        execution_started_at=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_EXECUTION_STARTED_AT
                        ),
                        execution_completed_at=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_EXECUTION_COMPLETED_AT
                        ),
                        test_case_created_at=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_CREATED_AT
                        ),
                        title=entity.get(TestCaseUnderExecutionDatastore.FIELD_TITLE)
                        or "",
                        metadata=(
                            parse_metadata(
                                entity.get(
                                    TestCaseUnderExecutionDatastore.FIELD_METADATA
                                )
                            )
                            if entity.get(
                                TestCaseUnderExecutionDatastore.FIELD_METADATA
                            )
                            is not None
                            else None
                        ),
                        annotations=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_ANNOTATIONS, []
                        ),
                        flow_id=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_FLOW_ID
                        ),
                        scenario_parameters=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_SCENARIO_PARAMETERS,
                            {},
                        ),
                        credentials=entity.get(
                            TestCaseUnderExecutionDatastore.FIELD_CREDENTIALS, []
                        ),
                    )
                )

            orionis_log(f"Fetched {len(test_cases_under_execution)} test cases by IDs")
            return test_cases_under_execution

        except Exception as e:
            orionis_log("Error fetching test cases by IDs", e)
            raise e

    def add_test_case_under_execution(
        self,
        test_case_under_execution: CreateTestCaseUnderExecutionParams,
    ) -> str:
        try:
            orionis_log("Adding a new test case under execution to datastore")

            entity = datastore.Entity(
                key=self.db.key(
                    TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION
                )
            )

            created_at = datetime.now(timezone.utc)
            test_case_steps = []
            for step in test_case_under_execution.test_case_steps:
                if isinstance(step, TestCaseStep):
                    test_case_steps.append(
                        {
                            Constants.FIELD_TEST_STEP_ID: step.test_step_id,
                            Constants.FIELD_TEST_STEP_DESCRIPTION: step.step_description,
                            Constants.FIELD_TEST_STEP_EXP_RESULTS: step.expected_results,
                            TestCaseUnderExecutionDatastore.FIELD_TYPE: step.type,
                            TestCaseUnderExecutionDatastore.FIELD_HTTP_METHOD: step.http_method,
                            TestCaseUnderExecutionDatastore.FIELD_URL: step.url,
                            TestCaseUnderExecutionDatastore.FIELD_REQUEST_BODY: step.request_body,
                            TestCaseUnderExecutionDatastore.FIELD_HEADERS: step.headers,
                            TestCaseUnderExecutionDatastore.FIELD_EDGE_ID: step.edge_id,
                            TestCaseUnderExecutionDatastore.FIELD_STATUS: step.status.value,
                        }
                    )

            update_fields = {
                TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_ID: test_case_under_execution.test_case_id,
                TestCaseUnderExecutionDatastore.FIELD_TEST_RUN_ID: test_case_under_execution.test_run_id,
                TestCaseUnderExecutionDatastore.FIELD_PRODUCT_ID: test_case_under_execution.product_id,
                TestCaseUnderExecutionDatastore.FIELD_FEATURE_ID: test_case_under_execution.feature_id,
                TestCaseUnderExecutionDatastore.FIELD_FUNCTIONALITY_ID: test_case_under_execution.functionality_id,
                TestCaseUnderExecutionDatastore.FIELD_REQUEST_ID: test_case_under_execution.request_id
                or "MANUAL",
                TestCaseUnderExecutionDatastore.FIELD_ASSIGNEE_USER_ID: test_case_under_execution.assignee_user_id
                or "",
                TestCaseUnderExecutionDatastore.FIELD_STATUS: test_case_under_execution.status.value,
                TestCaseUnderExecutionDatastore.FIELD_CRITICALITY: test_case_under_execution.criticality.value,
                TestCaseUnderExecutionDatastore.FIELD_NOTES: test_case_under_execution.notes
                or "",
                TestCaseUnderExecutionDatastore.FIELD_COMMENTS: test_case_under_execution.comments
                or "",
                TestCaseUnderExecutionDatastore.FIELD_RATIONALE: test_case_under_execution.rationale
                or "",
                TestCaseUnderExecutionDatastore.FIELD_SCREENSHOT_URL: test_case_under_execution.screenshot_url
                or "",
                TestCaseUnderExecutionDatastore.FIELD_EXECUTION_VIDEO_URL: test_case_under_execution.execution_video_url
                or "",
                TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_DESCRIPTION: test_case_under_execution.test_case_description
                or "",
                TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_STEPS: (
                    test_case_steps if test_case_under_execution.test_case_steps else []
                ),
                TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_TYPE: test_case_under_execution.test_case_type
                or "SMOKE",
                TestCaseUnderExecutionDatastore.FIELD_PRECONDITIONS: test_case_under_execution.preconditions
                or [],
                TestCaseUnderExecutionDatastore.FIELD_CREATED_AT: created_at,
                TestCaseUnderExecutionDatastore.FIELD_UPDATED_AT: created_at,
                TestCaseUnderExecutionDatastore.FIELD_EXECUTION_STARTED_AT: created_at,
                TestCaseUnderExecutionDatastore.FIELD_EXECUTION_COMPLETED_AT: created_at,
                TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_CREATED_AT: created_at,
                TestCaseUnderExecutionDatastore.FIELD_METADATA: test_case_under_execution.metadata,
                TestCaseUnderExecutionDatastore.FIELD_TITLE: test_case_under_execution.title,
                TestCaseUnderExecutionDatastore.FIELD_ANNOTATIONS: test_case_under_execution.annotations,
                TestCaseUnderExecutionDatastore.FIELD_SCENARIO_PARAMETERS: test_case_under_execution.scenario_parameters,
                TestCaseUnderExecutionDatastore.FIELD_FLOW_ID: test_case_under_execution.flow_id,
            }

            filtered_update_fields = {
                key: value for key, value in update_fields.items() if value is not None
            }
            entity.update(filtered_update_fields)

            if TestCaseUnderExecutionDatastore.FIELD_NOTES in entity:
                entity.exclude_from_indexes.add(
                    TestCaseUnderExecutionDatastore.FIELD_NOTES
                )

            if TestCaseUnderExecutionDatastore.FIELD_METADATA in entity:
                entity.exclude_from_indexes.add(
                    TestCaseUnderExecutionDatastore.FIELD_METADATA
                )

            self.db.put(entity)
            orionis_log(f"Added test case under execution with ID: {entity.key.id}")
            return str(entity.key.id)
        except Exception as e:
            orionis_log("Error adding test case under execution", e)
            raise e

    def set_assignee(self, assign_tcue_params: AssignTcueToUsersParams) -> List[str]:
        try:
            orionis_log("Setting assignee for test cases under execution")

            entities = self.db.get_multi(
                [
                    self.db.key(
                        TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION,
                        int(id),
                    )
                    for id in assign_tcue_params.test_case_under_execution_ids
                ]
            )
            missing_entities = [
                assign_tcue_params.test_case_under_execution_ids[i]
                for i, entity in enumerate(entities or [])
                if entity is None
            ]

            if not entities or missing_entities:
                raise ValueError(
                    f"Missing TestCaseUnderExecution entities for IDs: {missing_entities or 'ALL'}"
                )

            datetime_now = datetime.now(timezone.utc)
            for entity in entities:
                entity[TestCaseUnderExecutionDatastore.FIELD_ASSIGNEE_USER_ID] = (
                    assign_tcue_params.assignee_user_id
                )
                entity[TestCaseUnderExecutionDatastore.FIELD_UPDATED_AT] = datetime_now

            self.db.put_multi(entities)

            orionis_log(
                f"Successfully set assignee for test cases under execution: {assign_tcue_params.test_case_under_execution_ids}"
            )

            return assign_tcue_params.test_case_under_execution_ids

        except Exception as e:
            orionis_log("Error setting assignee for test cases under execution", e)
            raise e

    def get_goal_planning_context(self, test_case_under_execution_ids: List[str]):
        try:
            if not test_case_under_execution_ids:
                raise ValueError("No test_case_under_execution_ids provided")

            keys = [
                self.db.key(
                    TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION,
                    int(id),
                )
                for id in test_case_under_execution_ids
            ]
            entities = self.db.get_multi(keys)

            missing_entities = [
                test_case_under_execution_ids[i]
                for i, entity in enumerate(entities or [])
                if entity is None
            ]

            if not entities or missing_entities:
                raise ValueError(
                    f"Missing TestCaseUnderExecution entities for IDs: {missing_entities or 'ALL'}"
                )

            first_entity = entities[0]

            test_run_id = first_entity.get(
                TestCaseUnderExecutionDatastore.FIELD_TEST_RUN_ID
            )
            product_id = first_entity.get(
                TestCaseUnderExecutionDatastore.FIELD_PRODUCT_ID
            )
            if not test_run_id:
                raise ValueError("Unable to resolve test_run_id from TCUE entities")
            if not product_id:
                raise ValueError("Unable to resolve product_id from TCUE entities")

            tcue_id_to_test_case_id: dict[str, str] = {
                str(entity.key.id): entity.get(
                    TestCaseUnderExecutionDatastore.FIELD_TEST_CASE_ID
                )
                for entity in entities
            }

            ordered_test_case_ids: list[str] = []
            for tcue_id in test_case_under_execution_ids:
                tc_id = tcue_id_to_test_case_id.get(str(tcue_id))
                if tc_id is not None:
                    ordered_test_case_ids.append(str(tc_id))

            return {
                Constants.FIELD_TEST_RUN_ID: str(test_run_id),
                Constants.FIELD_PRODUCT_ID: str(product_id),
                Constants.FIELD_TEST_CASE_IDS: ordered_test_case_ids or [],
                Constants.FIELD_TEST_CASE_UNDER_EXECUTION_IDS: test_case_under_execution_ids
                or [],
            }
        except Exception as e:
            orionis_log("Error constructing goal planning context", e)
            raise e

    def count_test_cases_under_execution_for_test_run(self, test_run_id: str) -> int:
        """
        Count the number of test cases under execution for a test run.
        Uses a keys-only query for efficiency - only fetches keys, not full entities.
        """
        try:
            query = self.db.query(
                kind=TestCaseUnderExecutionDatastore.ENTITY_KIND_TEST_CASE_UNDER_EXECUTION
            )
            query.add_filter(
                TestCaseUnderExecutionDatastore.FIELD_TEST_RUN_ID, "=", test_run_id
            )

            query.keys_only()
            count = len(list(query.fetch()))
            return count
        except Exception as e:
            orionis_log(
                f"Error counting test cases under execution for test run {test_run_id}: {e}",
                e,
            )
            return 0
