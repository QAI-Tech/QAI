import uuid
import json
from datetime import datetime, timezone
from typing import List, cast

from constants import Constants
from models.reorder_features_and_test_cases_model import ReorderableEntity
from test_cases.test_case_models import (
    AddTestCaseRequestParams,
    RawTestCase,
    RawTestCaseStep,
    TestCaseCriticality,
    UpdateTestCaseRequestParams,
    TestCaseStatus,
    Scenario,
    TestCaseParameter,
    MirroredTestCase,
)
from common.google_cloud_wrappers import GCPDatastoreWrapper
from google.cloud import datastore
from utils.util import orionis_log, parse_metadata


class TestCaseDatastore:

    ENTITY_KIND_TEST_CASE = "RawTestCase"
    FIELD_PRODUCT_ID = "product_id"
    FIELD_FEATURE_ID = "feature_id"
    FIELD_FUNCTIONALITY_ID = "functionality_id"
    FIELD_REQUEST_ID = "request_id"
    FIELD_TITLE = "title"
    FIELD_SCREENSHOT_URL = "screenshot_url"
    FIELD_TEST_CASE_DESCRIPTION = "test_case_description"
    FIELD_TEST_CASE_TYPE = "test_case_type"
    FIELD_TEST_CASE_ID = "test_case_id"
    FIELD_UPDATED_AT = "updated_at"
    FIELD_CREATED_AT = "created_at"
    FIELD_PRECONDITIONS = "preconditions"
    FIELD_TEST_CASE_STEPS = "test_case_steps"
    FIELD_TEST_STEP_ID = "test_step_id"
    FIELD_TEST_STEP_DESCRIPTION = "step_description"
    FIELD_EXPECTED_STEP_RESULTS = "expected_results"
    FIELD_SCREENSHOT_INDEX = "screenshot_index"
    FIELD_RATIONALE = "rationale"
    FIELD_STATUS = "status"
    FIELD_SORT_INDEX = "sort_index"
    FIELD_CREDENTIALS = "credentials"
    FIELD_PARAMETERS = "parameters"
    FIELD_COMMENTS = "comments"
    FIELD_CRITICALITY = "criticality"
    FIELD_SCENARIOS = "scenarios"
    FIELD_METADATA = "metadata"
    FIELD_PRECONDITION_TEST_CASE_ID = "precondition_test_case_id"
    FIELD_CREATED_BY = "created_by"
    FIELD_FLOW_ID = "flow_id"
    FIELD_MIRRORED_TEST_CASES = "mirrored_test_cases"
    FIELD_TYPE = "type"
    FIELD_HTTP_METHOD = "http_method"
    FIELD_URL = "url"
    FIELD_REQUEST_BODY = "request_body"
    FIELD_HEADERS = "headers"
    FIELD_EDGE_ID = "edge_id"

    def __init__(self):
        self.db = GCPDatastoreWrapper().get_datastore_client()

    def fetch_test_cases_by_ids(self, test_case_ids: List[str]) -> List[RawTestCase]:
        try:
            orionis_log(f"Fetching test cases with ids: {test_case_ids}")
            keys = [
                self.db.key(TestCaseDatastore.ENTITY_KIND_TEST_CASE, int(entity_id))
                for entity_id in test_case_ids
            ]
            orionis_log(f"Generated datastore keys: {keys}")
            entities = self.db.get_multi(keys)
            test_cases = []
            for entity in entities:
                if entity is None:
                    continue

                raw_test_case_steps = [
                    RawTestCaseStep(
                        test_step_id=str(uuid.uuid4()),
                        step_description=step.get("step_description"),
                        expected_results=step.get("expected_results"),
                        type=step.get("type"),
                        http_method=step.get("http_method"),
                        url=step.get("url"),
                        request_body=step.get("request_body"),
                        headers=step.get("headers"),
                        edge_id=step.get("edge_id"),
                    )
                    for step in entity.get("test_case_steps", [])
                ]

                metadata = None
                if entity.get(TestCaseDatastore.FIELD_METADATA) is not None:
                    metadata = parse_metadata(
                        entity.get(TestCaseDatastore.FIELD_METADATA)
                    )

                scenarios = [
                    Scenario(
                        id=scenario.get("id"),
                        description=scenario.get("description"),
                        params=(
                            [
                                TestCaseParameter(
                                    parameter_name=param.get("parameter_name"),
                                    parameter_value=param.get("parameter_value"),
                                )
                                for param in scenario.get("params", [])
                            ]
                            if scenario.get("params")
                            else None
                        ),
                    )
                    for scenario in entity.get("scenarios", [])
                ]

                mirrored_test_cases = [
                    MirroredTestCase(
                        product_id=ltc.get("product_id"),
                        product_name=ltc.get("product_name"),
                        test_case_id=ltc.get("test_case_id"),
                    )
                    for ltc in entity.get(
                        TestCaseDatastore.FIELD_MIRRORED_TEST_CASES, []
                    )
                    if ltc is not None
                ]

                test_cases.append(
                    RawTestCase(
                        test_case_id=str(entity.key.id_or_name),
                        feature_id=entity.get(TestCaseDatastore.FIELD_FEATURE_ID),
                        product_id=entity.get(TestCaseDatastore.FIELD_PRODUCT_ID),
                        request_id=entity.get(TestCaseDatastore.FIELD_REQUEST_ID),
                        title=entity.get(TestCaseDatastore.FIELD_TITLE) or "",
                        screenshot_url=entity.get(
                            TestCaseDatastore.FIELD_SCREENSHOT_URL
                        ),
                        preconditions=entity.get(TestCaseDatastore.FIELD_PRECONDITIONS),
                        test_case_description=entity.get(
                            TestCaseDatastore.FIELD_TEST_CASE_DESCRIPTION
                        ),
                        test_case_type=(
                            entity.get(TestCaseDatastore.FIELD_TEST_CASE_TYPE)
                            if entity.get(TestCaseDatastore.FIELD_TEST_CASE_TYPE)
                            else ""
                        ),
                        created_at=entity.get(TestCaseDatastore.FIELD_CREATED_AT),
                        status=entity.get(
                            TestCaseDatastore.FIELD_STATUS, TestCaseStatus.RAW.value
                        ),
                        sort_index=entity.get(TestCaseDatastore.FIELD_SORT_INDEX),
                        test_case_steps=raw_test_case_steps,
                        scenarios=scenarios,
                        criticality=entity.get(
                            Constants.FIELD_CRITICALITY, TestCaseCriticality.HIGH.value
                        ),
                        metadata=metadata,
                        precondition_test_case_id=entity.get(
                            TestCaseDatastore.FIELD_PRECONDITION_TEST_CASE_ID, ""
                        ),
                        created_by=entity.get(TestCaseDatastore.FIELD_CREATED_BY),
                        mirrored_test_cases=mirrored_test_cases,
                        flow_id=entity.get(TestCaseDatastore.FIELD_FLOW_ID),
                        credentials=entity.get(TestCaseDatastore.FIELD_CREDENTIALS, []),
                        comments=entity.get(TestCaseDatastore.FIELD_COMMENTS, ""),
                    )
                )

            if all(tc.sort_index is not None for tc in test_cases):
                test_cases.sort(key=lambda x: cast(float, x.sort_index))
            else:
                test_cases.sort(key=lambda x: x.created_at)

            return test_cases
        except Exception as e:
            orionis_log(
                f"[get_entities_by_ids] Error while fetching entities for IDs {test_case_ids}",
                e,
            )
            raise ValueError(
                f"Failed to fetch entities for IDs {test_case_ids}: {str(e)}"
            )

    def delete_test_cases(self, test_case_ids: List[str]):
        if not test_case_ids:
            orionis_log(
                "No test_case_ids provided to delete_test_cases; nothing to delete."
            )
            return
        # Get the entity by key
        keys = [
            self.db.key(TestCaseDatastore.ENTITY_KIND_TEST_CASE, int(entity_id))
            for entity_id in test_case_ids
        ]
        entities = self.db.get_multi(keys)

        if not entities:
            raise ValueError(f"Test case with ids {test_case_ids} not found")

        # Delete the entity
        self.db.delete_multi(keys)

        # Log the deletion
        orionis_log(f"Test cases with ids {test_case_ids} deleted successfully")

    def add_test_case(
        self,
        test_case: AddTestCaseRequestParams,
        metadata: str | None = None,
    ) -> RawTestCase:
        orionis_log(
            f"Adding a new test case to datastore with params: {test_case.model_dump(mode='json')}"
        )
        query = self.db.query(kind=TestCaseDatastore.ENTITY_KIND_TEST_CASE)
        query.add_filter(
            TestCaseDatastore.FIELD_PRODUCT_ID,
            "=",
            test_case.product_id,
        )

        query.order = ["-" + TestCaseDatastore.FIELD_SORT_INDEX]
        test_cases = list(query.fetch(limit=1))

        max_sort_index = 0.0
        if test_cases:
            if test_cases[0].get(TestCaseDatastore.FIELD_SORT_INDEX) is None:
                raise ValueError(
                    f"Test case with ID {test_cases[0].key.id} has null sort_index"
                )
            max_sort_index = (
                test_cases[0].get(TestCaseDatastore.FIELD_SORT_INDEX) or 0.0
            )

        orionis_log(
            f"Max sort index: {max_sort_index} for product: {test_case.product_id}"
        )

        test_case_entity = datastore.Entity(
            key=self.db.key(Constants.ENTITY_RAW_TEST_CASE)
        )

        if metadata:
            test_case_entity.exclude_from_indexes.add(TestCaseDatastore.FIELD_METADATA)

        created_at = datetime.now(timezone.utc)
        test_case_steps: List[RawTestCaseStep] = []
        for step in test_case.test_case_steps:
            test_case_steps.append(
                RawTestCaseStep(
                    test_step_id=str(uuid.uuid4()),
                    step_description=step.step_description,
                    expected_results=step.expected_results,
                    type=step.type,
                    http_method=step.http_method,
                    url=step.url,
                    request_body=step.request_body,
                    headers=step.headers,
                    edge_id=step.edge_id,
                )
            )
        scenarios: List[Scenario] = []
        if test_case.scenarios:
            for scenario in test_case.scenarios:
                scenarios.append(
                    Scenario(
                        id=scenario.id,
                        description=scenario.description,
                        params=(
                            [
                                TestCaseParameter(
                                    parameter_name=param.parameter_name,
                                    parameter_value=param.parameter_value,
                                )
                                for param in scenario.params
                            ]
                            if scenario.params
                            else None
                        ),
                    )
                )
        orionis_log(
            f"Created {len(test_case_steps)} test case steps and {len(scenarios)} scenarios"
        )
        test_case_entity.update(
            {
                TestCaseDatastore.FIELD_PRODUCT_ID: test_case.product_id,
                TestCaseDatastore.FIELD_FEATURE_ID: test_case.feature_id,
                TestCaseDatastore.FIELD_FUNCTIONALITY_ID: test_case.functionality_id
                or "",
                TestCaseDatastore.FIELD_TITLE: test_case.title,
                TestCaseDatastore.FIELD_SCREENSHOT_URL: test_case.screenshot_url,
                TestCaseDatastore.FIELD_REQUEST_ID: test_case.request_id or "MANUAL",
                TestCaseDatastore.FIELD_TEST_CASE_DESCRIPTION: test_case.test_case_description,
                TestCaseDatastore.FIELD_PRECONDITIONS: test_case.preconditions,
                TestCaseDatastore.FIELD_TEST_CASE_TYPE: (
                    test_case.test_case_type if test_case.test_case_type else ""
                ),
                TestCaseDatastore.FIELD_RATIONALE: test_case.rationale,
                TestCaseDatastore.FIELD_STATUS: test_case.status.value,
                TestCaseDatastore.FIELD_TEST_CASE_STEPS: [
                    {
                        TestCaseDatastore.FIELD_TEST_STEP_ID: step.test_step_id,
                        TestCaseDatastore.FIELD_TEST_STEP_DESCRIPTION: step.step_description,
                        TestCaseDatastore.FIELD_EXPECTED_STEP_RESULTS: step.expected_results,
                        TestCaseDatastore.FIELD_TYPE: step.type,
                        TestCaseDatastore.FIELD_HTTP_METHOD: step.http_method,
                        TestCaseDatastore.FIELD_URL: step.url,
                        TestCaseDatastore.FIELD_REQUEST_BODY: step.request_body,
                        TestCaseDatastore.FIELD_HEADERS: step.headers,
                        TestCaseDatastore.FIELD_EDGE_ID: step.edge_id,
                    }
                    for step in test_case_steps
                ],
                TestCaseDatastore.FIELD_CRITICALITY: test_case.criticality.value,
                TestCaseDatastore.FIELD_CREATED_AT: created_at,
                TestCaseDatastore.FIELD_SORT_INDEX: max_sort_index + 1,
                TestCaseDatastore.FIELD_CRITICALITY: test_case.criticality.value,
                TestCaseDatastore.FIELD_STATUS: test_case.status.value,
                TestCaseDatastore.FIELD_SCENARIOS: [
                    {
                        "id": scenario.id,
                        "description": scenario.description,
                        "params": (
                            [
                                {
                                    "parameter_name": param.parameter_name,
                                    "parameter_value": param.parameter_value,
                                }
                                for param in scenario.params
                            ]
                            if scenario.params
                            else None
                        ),
                    }
                    for scenario in scenarios
                ],
                TestCaseDatastore.FIELD_METADATA: metadata if metadata else None,
                TestCaseDatastore.FIELD_PRECONDITION_TEST_CASE_ID: test_case.precondition_test_case_id,
                TestCaseDatastore.FIELD_CREATED_BY: test_case.created_by,
                TestCaseDatastore.FIELD_FLOW_ID: test_case.flow_id or None,
                TestCaseDatastore.FIELD_CREDENTIALS: test_case.credentials or [],
                TestCaseDatastore.FIELD_MIRRORED_TEST_CASES: [
                    {
                        "test_case_id": ltc.test_case_id,
                        "product_id": ltc.product_id,
                        "product_name": ltc.product_name,
                    }
                    for ltc in test_case.mirrored_test_cases or []
                    if ltc is not None
                ],
            }
        )

        if TestCaseDatastore.FIELD_METADATA in test_case_entity:
            test_case_entity.exclude_from_indexes.add(TestCaseDatastore.FIELD_METADATA)

        self.db.put(test_case_entity)
        test_case_id = test_case_entity.key.id  # type: ignore
        orionis_log(f"Added a new test case with id: {test_case_id}")

        return RawTestCase(
            test_case_id=str(test_case_id),
            product_id=test_case.product_id,
            feature_id=test_case.feature_id,
            functionality_id=test_case.functionality_id,
            request_id=test_case.request_id or "MANUAL",
            title=test_case.title,
            screenshot_url=test_case.screenshot_url,
            test_case_description=test_case.test_case_description,
            preconditions=test_case.preconditions,
            test_case_steps=test_case_steps,
            scenarios=scenarios,
            test_case_type=test_case.test_case_type if test_case.test_case_type else "",
            rationale=test_case.rationale,
            created_at=created_at,
            status=test_case.status,
            sort_index=max_sort_index + 1,
            criticality=test_case.criticality,
            metadata=metadata,
            precondition_test_case_id=test_case.precondition_test_case_id or None,
            created_by=test_case.created_by or None,
            credentials=test_case.credentials or [],
        )

    def update_test_case(self, test_case: UpdateTestCaseRequestParams) -> RawTestCase:
        try:
            # Get the entity by key
            key = self.db.key(
                TestCaseDatastore.ENTITY_KIND_TEST_CASE, int(test_case.test_case_id)
            )
            entity = self.db.get(key)

            if not entity:
                raise ValueError(
                    f"Test case with id {test_case.test_case_id} not found"
                )

            existing_credentials = (
                entity.get(TestCaseDatastore.FIELD_CREDENTIALS) or []
                if entity is not None
                else []
            )

            if test_case.credentials is not None:
                new_credentials = test_case.credentials

                added_creds = list(set(new_credentials) - set(existing_credentials))
                removed_creds = list(set(existing_credentials) - set(new_credentials))

                if added_creds:
                    orionis_log(
                        f"Added credential(s) {added_creds} to test case {test_case.test_case_id}"
                    )
                if removed_creds:
                    orionis_log(
                        f"Removed credential(s) {removed_creds} from test case {test_case.test_case_id}"
                    )

            # Mirrored test cases update logic
            mirrored_test_cases = (
                test_case.mirrored_test_cases
                if test_case.mirrored_test_cases is not None
                else entity.get(TestCaseDatastore.FIELD_MIRRORED_TEST_CASES)
            )

            def _normalize_linked_test_cases(linked_test_cases):
                normalized = []
                for ltc in linked_test_cases or []:
                    if isinstance(ltc, dict):
                        normalized.append(
                            MirroredTestCase(
                                # Adding this to remove mypy error, if in case, mirrored_test_case is none, we do not proceed
                                test_case_id=(
                                    str(ltc.get("test_case_id"))
                                    if ltc.get("test_case_id") is not None
                                    else ""
                                ),
                                product_id=(
                                    str(ltc.get("product_id"))
                                    if ltc.get("product_id") is not None
                                    else ""
                                ),
                                product_name=(
                                    str(ltc.get("product_name"))
                                    if ltc.get("product_name") is not None
                                    else ""
                                ),
                            )
                        )
                    else:
                        normalized.append(ltc)
                return normalized

            normalized_linked_test_cases = _normalize_linked_test_cases(
                mirrored_test_cases
            )

            new_test_case_steps = None
            if test_case.test_case_steps is not None:
                step_id_to_existing_edge_id = {
                    step.get(TestCaseDatastore.FIELD_TEST_STEP_ID): step.get(
                        TestCaseDatastore.FIELD_EDGE_ID
                    )
                    for step in entity.get(TestCaseDatastore.FIELD_TEST_CASE_STEPS, [])
                }
                new_test_case_steps = [
                    {
                        TestCaseDatastore.FIELD_TEST_STEP_ID: step.test_step_id,
                        TestCaseDatastore.FIELD_TEST_STEP_DESCRIPTION: step.step_description,
                        TestCaseDatastore.FIELD_EXPECTED_STEP_RESULTS: step.expected_results,
                        TestCaseDatastore.FIELD_TYPE: step.type,
                        TestCaseDatastore.FIELD_HTTP_METHOD: step.http_method,
                        TestCaseDatastore.FIELD_URL: step.url,
                        TestCaseDatastore.FIELD_REQUEST_BODY: step.request_body,
                        TestCaseDatastore.FIELD_HEADERS: step.headers,
                        TestCaseDatastore.FIELD_EDGE_ID: (
                            step.edge_id
                            if step.edge_id is not None
                            else step_id_to_existing_edge_id.get(step.test_step_id)
                        ),
                    }
                    for step in (test_case.test_case_steps or [])
                ]

            new_scenarios = None
            if test_case.scenarios is not None:
                new_scenarios = [
                    {
                        "id": scenario.id,
                        "description": scenario.description,
                        "params": (
                            [
                                {
                                    "parameter_name": param.parameter_name,
                                    "parameter_value": param.parameter_value,
                                }
                                for param in scenario.params
                                if (
                                    isinstance(param.parameter_name, str)
                                    and param.parameter_name.strip()
                                    and isinstance(param.parameter_value, str)
                                    and param.parameter_value.strip()
                                )
                            ]
                            if scenario.params is not None
                            else None
                        ),
                    }
                    for scenario in test_case.scenarios
                    if (
                        isinstance(scenario.description, str)
                        and scenario.description.strip()
                        and isinstance(scenario.params, list)
                        and any(
                            isinstance(param.parameter_name, str)
                            and param.parameter_name.strip()
                            and isinstance(param.parameter_value, str)
                            and param.parameter_value.strip()
                            for param in scenario.params
                        )
                    )
                ]

            new_linked_test_cases = [
                {
                    "test_case_id": ltc.test_case_id,
                    "product_id": ltc.product_id,
                    "product_name": ltc.product_name,
                }
                for ltc in (
                    normalized_linked_test_cases + [test_case.new_test_case_to_link]
                    if normalized_linked_test_cases and test_case.new_test_case_to_link
                    else (
                        [test_case.new_test_case_to_link]
                        if test_case.new_test_case_to_link
                        else normalized_linked_test_cases or []
                    )
                )
                if ltc is not None
            ]

            update_fields = {
                TestCaseDatastore.FIELD_UPDATED_AT: datetime.now(timezone.utc),
                TestCaseDatastore.FIELD_FEATURE_ID: test_case.feature_id,
                TestCaseDatastore.FIELD_PRECONDITION_TEST_CASE_ID: test_case.precondition_test_case_id,
                TestCaseDatastore.FIELD_TEST_CASE_DESCRIPTION: test_case.test_case_description,
                TestCaseDatastore.FIELD_TEST_CASE_TYPE: test_case.test_case_type,
                TestCaseDatastore.FIELD_PRECONDITIONS: test_case.preconditions,
                TestCaseDatastore.FIELD_TEST_CASE_STEPS: new_test_case_steps,
                TestCaseDatastore.FIELD_CREATED_AT: test_case.created_at,
                TestCaseDatastore.FIELD_SCREENSHOT_URL: test_case.screenshot_url,
                TestCaseDatastore.FIELD_TITLE: test_case.title,
                TestCaseDatastore.FIELD_CREDENTIALS: test_case.credentials,
                TestCaseDatastore.FIELD_SCENARIOS: new_scenarios,
                TestCaseDatastore.FIELD_CRITICALITY: test_case.criticality.value,
                TestCaseDatastore.FIELD_STATUS: test_case.status.value,
                TestCaseDatastore.FIELD_MIRRORED_TEST_CASES: new_linked_test_cases,
                TestCaseDatastore.FIELD_METADATA: test_case.metadata,
            }

            filtered_update_fields = {
                key: value for key, value in update_fields.items() if value is not None
            }

            entity.update(filtered_update_fields)

            comments_raw = test_case.comments
            if comments_raw is not None and comments_raw.strip() != "":
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
                entity[TestCaseDatastore.FIELD_COMMENTS] = json.dumps(sorted_comments)

            # Save the updated entity
            self.db.put(entity)

            # TODO: Fix the returned object, we are promising to return a RawTestCase but returning a Datastore Entity instead
            return entity  # type: ignore
        except Exception as e:
            orionis_log(f"Error updating test case: {e}", e)
            raise e

    def delete_test_cases_for_request_id(self, request_id: str):
        query = self.db.query(kind=TestCaseDatastore.ENTITY_KIND_TEST_CASE)
        query.add_filter(TestCaseDatastore.FIELD_REQUEST_ID, "=", request_id)
        test_cases = query.fetch()

        # Batch delete all entities
        keys_to_delete = [test_case.key for test_case in test_cases]
        self.db.delete_multi(keys_to_delete)

        orionis_log(
            f"Deleted {len(keys_to_delete)} test cases for request id {request_id}"
        )

    def get_entities_by_ids(self, ids: List[str]) -> List[ReorderableEntity]:
        try:
            orionis_log(
                f"[get_entities_by_ids] Attempting to fetch entities with IDs: {ids}"
            )

            keys = [
                self.db.key(TestCaseDatastore.ENTITY_KIND_TEST_CASE, int(entity_id))
                for entity_id in ids
            ]
            orionis_log(f"[get_entities_by_ids] Generated datastore keys: {keys}")

            entities = self.db.get_multi(keys)
            orionis_log(f"[get_entities_by_ids] Fetched raw entities: {entities}")

            reorderable_entities = [
                ReorderableEntity(
                    id=str(entity.key.id_or_name),
                    sort_index=entity.get("sort_index"),
                    created_at=entity.get("created_at", datetime.min),
                )
                for entity in entities
                if entity is not None
            ]
            orionis_log(
                f"[get_entities_by_ids] Transformed entities: {reorderable_entities}"
            )
            return reorderable_entities

        except Exception as e:
            orionis_log(
                f"[get_entities_by_ids] Error while fetching entities for IDs {ids}", e
            )
            raise ValueError(f"Failed to fetch entities for IDs {ids}: {str(e)}")

    def update_sorting_indexes(
        self, entities: List[ReorderableEntity]
    ) -> List[ReorderableEntity]:
        updated_entities = []

        for entity in entities:
            key = self.db.key(TestCaseDatastore.ENTITY_KIND_TEST_CASE, int(entity.id))
            existing_entity = self.db.get(key)

            if not existing_entity:
                orionis_log(f"Entity not found for ID: {entity.id}")
                continue

            existing_entity["sort_index"] = entity.sort_index
            updated_entities.append(existing_entity)

        self.db.put_multi(updated_entities)
        orionis_log(
            f"Updated {len(updated_entities)} entities with new sort_index only"
        )
        return [
            ReorderableEntity(
                id=str(entity.key.id_or_name),
                sort_index=entity.get("sort_index"),
                created_at=entity.get("created_at", datetime.min),
            )
            for entity in updated_entities
        ]

    def add_credentials_to_test_case(
        self, test_case_id: str, credentials_id: str
    ) -> list[str]:
        try:
            key = self.db.key(
                TestCaseDatastore.ENTITY_KIND_TEST_CASE, int(test_case_id)
            )
            entity = self.db.get(key)

            if not entity:
                raise ValueError(f"Test case with id {test_case_id} not found")

            existing_credentials = (
                entity.get(TestCaseDatastore.FIELD_CREDENTIALS, []) or []
            )

            if credentials_id not in existing_credentials:
                existing_credentials.append(credentials_id)

            entity.update(
                {
                    TestCaseDatastore.FIELD_CREDENTIALS: existing_credentials,
                    TestCaseDatastore.FIELD_UPDATED_AT: datetime.now(timezone.utc),
                }
            )

            self.db.put(entity)
            orionis_log(
                f"Successfully added credentials {credentials_id} to test case {test_case_id}"
            )

            return existing_credentials

        except ValueError as e:
            orionis_log(f"ValueError while adding credentials to test case: {e}", e)
            raise e
        except Exception as e:
            orionis_log(f"Error adding credentials to test case: {e}", e)
            raise e

    def get_test_cases_by_product_id(self, product_id: str) -> List[RawTestCase]:
        try:
            orionis_log(f"Fetching test cases for product_id: {product_id}")
            query = self.db.query(kind=Constants.ENTITY_RAW_TEST_CASE)
            query.add_filter(Constants.FIELD_PRODUCT_ID, "=", product_id)
            test_cases = list(query.fetch()) or []

            orionis_log(
                f"Fetched {len(test_cases)} test cases for product_id: {product_id}"
            )

            if not test_cases:
                orionis_log(f"No test cases found for product ID: {product_id}")
                return []

            return self._create_raw_test_cases_from_entities(test_cases)

        except Exception as e:
            orionis_log("Error in get_test_cases_by_product_id:", e)
            return []

    def get_test_cases_by_request_id(self, request_id: str) -> List[RawTestCase]:
        try:
            orionis_log(f"Fetching test cases for request_id: {request_id}")
            query = self.db.query(kind=Constants.ENTITY_RAW_TEST_CASE)
            query.add_filter(Constants.FIELD_REQUEST_ID, "=", request_id)
            test_cases = list(query.fetch()) or []

            orionis_log(
                f"Fetched {len(test_cases)} test cases for request: {request_id}"
            )

            if not test_cases:
                orionis_log(f"No test cases found for request ID: {request_id}")
                return []

            return self._create_raw_test_cases_from_entities(test_cases)

        except Exception as e:
            orionis_log("Error in get_test_cases_by_request_id:", e)
            return []

    def get_test_cases_by_flow_id(self, flow_id: str) -> List[RawTestCase]:
        try:
            orionis_log(f"Fetching test cases for request_id: {flow_id}")
            query = self.db.query(kind=Constants.ENTITY_RAW_TEST_CASE)
            query.add_filter(Constants.FIELD_FLOW_ID, "=", flow_id)
            test_cases = list(query.fetch()) or []

            orionis_log(f"Fetched {len(test_cases)} test cases for flow: {flow_id}")

            if not test_cases:
                orionis_log(f"No test cases found for flow ID: {flow_id}")
                return []

            return self._create_raw_test_cases_from_entities(test_cases)

        except Exception as e:
            orionis_log("Error in get_test_cases_by_flow_id:", e)
            return []

    def _create_raw_test_cases_from_entities(self, test_cases) -> List[RawTestCase]:
        try:
            raw_test_cases: List[RawTestCase] = []
            for entity in test_cases:
                mirrored_test_cases = [
                    MirroredTestCase(
                        product_id=ltc.get("product_id"),
                        product_name=ltc.get("product_name"),
                        test_case_id=ltc.get("test_case_id"),
                    )
                    for ltc in entity.get(
                        TestCaseDatastore.FIELD_MIRRORED_TEST_CASES, []
                    )
                    if ltc is not None
                ]
                raw_test_cases.append(
                    RawTestCase(
                        test_case_id=str(entity.key.id_or_name),
                        feature_id=entity.get(Constants.FIELD_FEATURE_ID),
                        precondition_test_case_id=entity.get(
                            TestCaseDatastore.FIELD_PRECONDITION_TEST_CASE_ID
                        ),
                        product_id=entity.get(Constants.FIELD_PRODUCT_ID),
                        title=entity.get(TestCaseDatastore.FIELD_TITLE, ""),
                        functionality_id=entity.get(Constants.FIELD_FUNCTIONALITY_ID),
                        request_id=entity.get(Constants.FIELD_REQUEST_ID, "MANUAL"),
                        screenshot_url=entity.get(Constants.FIELD_SCREENSHOT_URL, ""),
                        preconditions=entity.get(Constants.FIELD_PRECONDITIONS, []),
                        test_case_description=entity.get(
                            Constants.FIELD_TEST_CASE_DESCRIPTION, ""
                        ),
                        test_case_steps=[
                            RawTestCaseStep(
                                test_step_id=step.get(Constants.FIELD_TEST_STEP_ID),
                                step_description=step.get(
                                    Constants.FIELD_TEST_STEP_DESCRIPTION
                                ),
                                expected_results=step.get(
                                    Constants.FIELD_TEST_STEP_EXP_RESULTS, []
                                ),
                                type=step.get(TestCaseDatastore.FIELD_TYPE, None),
                                http_method=step.get(
                                    TestCaseDatastore.FIELD_HTTP_METHOD, None
                                ),
                                url=step.get(TestCaseDatastore.FIELD_URL, None),
                                request_body=step.get(
                                    TestCaseDatastore.FIELD_REQUEST_BODY, None
                                ),
                                headers=step.get(TestCaseDatastore.FIELD_HEADERS, None),
                                edge_id=step.get(TestCaseDatastore.FIELD_EDGE_ID, None),
                            )
                            for step in entity.get(Constants.FIELD_TEST_CASE_STEPS, [])
                        ],
                        test_case_type=entity.get(Constants.FIELD_TEST_CASE_TYPE, ""),
                        rationale=entity.get(Constants.FIELD_RATIONALE, ""),
                        created_at=entity.get(Constants.FIELD_CREATED_AT),
                        status=entity.get(
                            Constants.FIELD_STATUS, TestCaseStatus.RAW.value
                        ),
                        sort_index=entity.get(Constants.FIELD_SORT_INDEX),
                        credentials=entity.get(Constants.FIELD_CREDENTIALS, []),
                        comments=entity.get(Constants.FIELD_COMMENTS, ""),
                        criticality=entity.get(
                            Constants.FIELD_CRITICALITY, TestCaseCriticality.HIGH.value
                        ),
                        flow_id=entity.get(TestCaseDatastore.FIELD_FLOW_ID, ""),
                        metadata=(
                            parse_metadata(entity.get(TestCaseDatastore.FIELD_METADATA))
                            if entity.get(TestCaseDatastore.FIELD_METADATA) is not None
                            else None
                        ),
                        mirrored_test_cases=mirrored_test_cases,
                        scenarios=[
                            Scenario(
                                id=scenario.get("id"),
                                description=scenario.get("description"),
                                params=(
                                    [
                                        TestCaseParameter(
                                            parameter_name=param.get("parameter_name"),
                                            parameter_value=param.get(
                                                "parameter_value"
                                            ),
                                        )
                                        for param in scenario.get("params", [])
                                    ]
                                    if scenario.get("params")
                                    else None
                                ),
                            )
                            for scenario in entity.get(Constants.FIELD_SCENARIOS, [])
                        ],
                        created_by=entity.get(TestCaseDatastore.FIELD_CREATED_BY),
                    )
                )

            if all(tc.sort_index is not None for tc in raw_test_cases):
                raw_test_cases.sort(key=lambda x: cast(float, x.sort_index))
            else:
                raw_test_cases.sort(key=lambda x: x.created_at)

            return raw_test_cases
        except Exception as e:
            orionis_log("Error in _create_raw_test_cases_from_entities:", e)
            raise e
