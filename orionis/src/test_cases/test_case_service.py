from typing import Dict, List, Optional
from features.feature_service import FeatureService
from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from models.reorder_features_and_test_cases_model import ReorderableEntity
from test_cases.test_case_datastore import TestCaseDatastore
from test_cases.test_case_request_validator import (
    TestCaseRequestValidator,
)
from test_cases.test_case_models import (
    RawTestCase,
    TestCaseInputModel,
    AddTestCaseRequestParams,
    AddTestCaseStepRequestParams,
    TestCaseParameter,
    Scenario,
    MirroredTestCase,
    UpdateTestCaseRequestParams,
)
from utils.util import orionis_log, parse_created_at
from features.feature_models import AddFeatureRequestParams
from collections import defaultdict
from constants import Constants
from config import config, Config
from services.notify_service.notify import NotificationService
from users.user_service import UserService
from products.product_datastore import ProductDatastore
from services.cloud_service.cloud_tasks import CloudTaskService


class TestCaseService:

    FIELD_TEST_CASE_ID = "test_case_id"
    FIELD_TEST_CASE_IDS = "test_case_ids"
    FIELD_MESSAGE = "message"
    FIELD_UPDATE_TEST_CASE_PARAMS = "update_test_case_params"
    UPDATE_MIRRORED_TEST_CASES_HANDLER = "UpdateMirroredTestCases"

    def __init__(
        self,
        request_validator: TestCaseRequestValidator,
        datastore: TestCaseDatastore,
        feature_service: FeatureService,
        notify_service: NotificationService,
        user_service: UserService,
        product_datastore: ProductDatastore,
        task_service: CloudTaskService,
    ):
        self.request_validator = request_validator
        self.datastore = datastore
        self.feature_service = feature_service
        self.notify_service = notify_service
        self.user_service = user_service
        self.product_datastore = product_datastore
        self.task_service = task_service

    def delete_test_cases(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_DELETE:
            return ApiResponseEntity(
                response={"error": "Method must be DELETE"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            orionis_log(
                f"Deleting test cases with IDs {request.data.get('test_case_ids')}"
            )
            test_case_ids = request.data.get("test_case_ids")

            # Ensure test_case_id is provided
            if not test_case_ids:
                raise ValueError("At least one test case ID is required")

            # Attempt to delete the test case from the datastore
            self.datastore.delete_test_cases(test_case_ids)

            orionis_log(f"Test cases with ids {test_case_ids} deleted successfully")

            return ApiResponseEntity(
                response={
                    self.FIELD_TEST_CASE_IDS: test_case_ids,
                    self.FIELD_MESSAGE: "Test cases deleted successfully",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log("Error in delete_test_cases:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log("Error in delete_test_cases:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def add_test_case(
        self, request: ApiRequestEntity, user_id: str
    ) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            orionis_log(f"Adding test case {request.data}")
            test_case_request = (
                self.request_validator.validate_add_test_case_request_params(request)
            )
            if self.user_service.is_external_user(user_id):
                test_case_request.created_by = user_id

            test_case = self.datastore.add_test_case(test_case_request)
            orionis_log(
                f"Added test case request for test case: {test_case.test_case_id} successfully"
            )
            user = self.user_service.get_user(user_id)
            orionis_log(f"User: {user}")
            if not user:
                raise ValueError("User not found")
            if (
                config.environment == Config.PRODUCTION
                and test_case.request_id == "MANUAL"
            ):
                self.notify_service.notify_new_test_case(test_case, user)

            return ApiResponseEntity(
                response={
                    self.FIELD_TEST_CASE_ID: test_case.test_case_id,
                    self.FIELD_MESSAGE: "Test case added successfully",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except ValueError as e:
            orionis_log("Error in add_test_case:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log("Error in add_test_case:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def update_test_case(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Only POST method is allowed for this function."},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )
        try:
            test_case = self.request_validator.validate_update_test_case_request_params(
                request.data
            )
            orionis_log(
                f"Validated test case update request for test case {test_case.test_case_id} successfully"
            )

            self.datastore.update_test_case(test_case)

            orionis_log(
                f"Updated test case {test_case.test_case_id} in datastore successfully"
            )
            payload = {
                self.FIELD_TEST_CASE_ID: test_case.test_case_id,
                self.FIELD_UPDATE_TEST_CASE_PARAMS: test_case.model_dump(mode="json"),
            }

            orionis_log(f"Payload for updating the mirrored test cases: {payload}")
            self.task_service.enqueue_task_v1(
                handler_function_name=self.UPDATE_MIRRORED_TEST_CASES_HANDLER,
                payload=payload,
            )
            return ApiResponseEntity(
                response={
                    self.FIELD_TEST_CASE_ID: test_case.test_case_id,
                    self.FIELD_MESSAGE: "Test case updated successfully",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except ValueError as e:
            orionis_log("Error in update_test_case:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log("Error in update_test_case:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def reorder_test_cases(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            test_case_changed, test_case_list = (
                self.request_validator.validate_reorder_test_case_request(request)
            )
            test_case_ids = [f.test_case_id for f in test_case_list]

            test_cases_entity_map = self._fetch_entities_by_ids(test_case_ids)

            if all(
                test_cases_entity_map[tid].sort_index is None for tid in test_case_ids
            ):
                updated_test_case_entities = self._assign_initial_sort_indexes(
                    test_case_list, test_cases_entity_map
                )
            else:
                updated_test_case_entities = self._calculate_updated_entities(
                    test_case_list, test_cases_entity_map, test_case_changed
                )

            if updated_test_case_entities:
                updated_entities = self.datastore.update_sorting_indexes(
                    updated_test_case_entities
                )
                orionis_log(
                    f"Updated {len(updated_entities)} test cases with sort indexes"
                )

                all_test_cases = self.datastore.get_entities_by_ids(test_case_ids)
                sorted_test_cases = sorted(
                    all_test_cases,
                    key=lambda x: x.sort_index if x.sort_index is not None else 0.0,
                )
                orionis_log(
                    f"Fetched {len(all_test_cases)} test cases with sort indexes"
                )

                return ApiResponseEntity(
                    response={
                        Constants.FIELD_TEST_CASES: [
                            {
                                Constants.FIELD_ID: test_case.id,
                                Constants.FIELD_SORT_INDEX: (test_case.sort_index),
                                Constants.FIELD_CREATED_AT: test_case.created_at,
                            }
                            for test_case in sorted_test_cases
                        ],
                    },
                    status_code=ApiResponseEntity.HTTP_STATUS_OK,
                )

            return ApiResponseEntity(
                response={"error": "No test cases were updated."},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )

        except ValueError as e:
            orionis_log("Error in reorder_test_cases:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log("Error in reorder_test_cases:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def _fetch_entities_by_ids(
        self, test_case_ids: List[str]
    ) -> Dict[str, ReorderableEntity]:
        entities = self.datastore.get_entities_by_ids(test_case_ids)
        return {e.id: e for e in entities}

    def _assign_initial_sort_indexes(
        self,
        test_case_list: List[TestCaseInputModel],
        entity_map: Dict[str, ReorderableEntity],
    ) -> List[ReorderableEntity]:
        updated = []
        for idx, test_case in enumerate(test_case_list):
            tid = test_case.test_case_id
            entity = entity_map[tid]
            updated.append(
                ReorderableEntity(
                    id=tid,
                    sort_index=float(idx + 1),
                    created_at=parse_created_at(entity.created_at),
                )
            )
        return updated

    def _calculate_updated_entities(
        self,
        test_case_list: List[TestCaseInputModel],
        entity_map: Dict[str, ReorderableEntity],
        test_case_changed: str,
    ) -> List[ReorderableEntity]:
        updated = []

        for i, item in enumerate(test_case_list):
            tid = item.test_case_id
            if tid != test_case_changed:
                continue

            before_id = test_case_list[i - 1].test_case_id if i > 0 else None
            after_id = (
                test_case_list[i + 1].test_case_id
                if i < len(test_case_list) - 1
                else None
            )

            before_index = entity_map[before_id].sort_index if before_id else None
            after_index = entity_map[after_id].sort_index if after_id else None
            current_entity = entity_map[tid]
            current_index = current_entity.sort_index

            new_index = self._compute_sort_index(
                before_index, after_index, current_index, i
            )

            if current_index != new_index:
                updated.append(
                    ReorderableEntity(
                        id=tid,
                        sort_index=new_index,
                        created_at=parse_created_at(current_entity.created_at),
                    )
                )

        return updated

    def _compute_sort_index(
        self,
        before_index: Optional[float],
        after_index: Optional[float],
        current_index: Optional[float],
        position: int,
    ) -> float:
        if before_index is not None and after_index is not None:
            return (before_index + after_index) / 2
        elif before_index is not None:
            return before_index + 1
        elif after_index is not None:
            return after_index - 1
        elif current_index is None:
            return float(position + 1)
        else:
            return current_index

    def copy_test_cases_for_product(
        self, request: ApiRequestEntity
    ) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Only POST method is allowed for this function."},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            data = self.request_validator.validate_copy_test_cases_for_product_request_params(
                request
            )
            product_id_from = data.from_product_id
            product_id_to = data.to_product_id
            product_from = self.product_datastore.get_product_from_id(product_id_from)
            product_to = self.product_datastore.get_product_from_id(product_id_to)
            orionis_log(f"product_id_from: {product_id_from}")
            orionis_log(f"product_id_to: {product_id_to}")
            test_case_ids = data.test_case_ids
            orionis_log(f"test_case_ids: {test_case_ids}")

            test_cases = self.datastore.fetch_test_cases_by_ids(test_case_ids)
            orionis_log(f"test_cases: {test_cases}")

            test_case_id_to_feature = {}
            for test_case in test_cases:
                feature_id = test_case.feature_id
                if feature_id is None:
                    test_case_id_to_feature[str(test_case.test_case_id)] = ""
                    continue
                try:
                    feature = self.feature_service.datastore.get_feature_by_id(
                        feature_id
                    )
                    feature_name = feature.name
                    orionis_log(f"feature_name: {feature_name}")
                    test_case_id_to_feature[str(test_case.test_case_id)] = feature_name
                except ValueError:
                    orionis_log(
                        f"Feature with id {feature_id} not found for test case {test_case.test_case_id}, copying without feature."
                    )
                    test_case_id_to_feature[str(test_case.test_case_id)] = ""

            orionis_log(f"test_case_id_to_feature: {test_case_id_to_feature}")

            features_from = self.feature_service.datastore.get_features(product_id_from)
            ordered_feature_ids = [f.id for f in features_from]

            feature_id_to_test_cases = defaultdict(list)
            for test_case in test_cases:
                feature_id_to_test_cases[test_case.feature_id].append(test_case)

            ordered_test_cases = []
            for fid in ordered_feature_ids:
                ordered_test_cases.extend(feature_id_to_test_cases.get(fid, []))

            unordered = [
                tc for tc in test_cases if tc.feature_id not in ordered_feature_ids
            ]
            ordered_test_cases.extend(unordered)

            features_to = self.feature_service.datastore.get_features(product_id_to)
            orionis_log(f"features_to: {features_to}")
            to_feature_name_to_id = {
                feature.name.lower(): (feature.id, feature.name)
                for feature in features_to
                if feature.name
            }
            orionis_log(f"to_feature_name_to_id: {to_feature_name_to_id}")

            copied_ids: list[str] = []
            skipped: list[str] = []
            test_case_mapping: Dict[str, str] = {}
            for test_case in ordered_test_cases:
                test_case_id = test_case.test_case_id
                original_feature_name = test_case_id_to_feature.get(
                    str(test_case_id), ""
                )
                feature_name_key = original_feature_name.lower()
                orionis_log(f"feature_name_key: {feature_name_key}")

                matched = to_feature_name_to_id.get(feature_name_key)
                new_feature_id = matched[0] if matched else ""

                orionis_log(f"new_feature_id: {new_feature_id}")
                if original_feature_name and not new_feature_id:
                    orionis_log(
                        f"No matching feature '{original_feature_name}' in destination product for test case {test_case_id}"
                    )
                    add_feature_params = AddFeatureRequestParams(
                        product_id=product_id_to,
                        name=original_feature_name,
                        description="",
                    )
                    try:
                        new_feature = self.feature_service.datastore.add_feature(
                            add_feature_params
                        )
                        new_feature_id = new_feature.id
                        to_feature_name_to_id[feature_name_key] = (
                            new_feature_id,
                            original_feature_name,
                        )
                        orionis_log(
                            f"Created new feature '{original_feature_name}' with ID {new_feature_id}"
                        )
                    except Exception as e:
                        orionis_log(
                            f"Failed to create feature '{original_feature_name}': {str(e)}",
                            e,
                        )
                        skipped.append(str(test_case_id))
                        raise Exception(
                            f"Failed to create feature '{original_feature_name}': {str(e)}"
                        )

                test_case.feature_id = new_feature_id or ""
                test_case.product_id = product_id_to
                if data.should_establish_test_case_links:
                    mirrored_test_cases = [
                        MirroredTestCase(
                            test_case_id=str(test_case_id),
                            product_id=product_id_from,
                            product_name=product_from.product_name,
                        )
                    ]
                else:
                    mirrored_test_cases = None

                test_case_params = AddTestCaseRequestParams(
                    product_id=test_case.product_id,
                    feature_id=test_case.feature_id,
                    functionality_id=test_case.functionality_id,
                    request_id=test_case.request_id,
                    screenshot_url=test_case.screenshot_url,
                    test_case_type=test_case.test_case_type,
                    preconditions=test_case.preconditions,
                    test_case_description=test_case.test_case_description,
                    test_case_steps=[
                        AddTestCaseStepRequestParams(
                            step_description=step.step_description,
                            expected_results=step.expected_results,
                            type=step.type,
                            http_method=step.http_method,
                            url=step.url,
                            request_body=step.request_body,
                            headers=step.headers,
                        )
                        for step in test_case.test_case_steps
                    ],
                    scenarios=(
                        [
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
                            for scenario in test_case.scenarios
                        ]
                        if test_case.scenarios
                        else None
                    ),
                    rationale=test_case.rationale,
                    status=test_case.status,
                    criticality=test_case.criticality,
                    created_by=test_case.created_by,
                    mirrored_test_cases=mirrored_test_cases,
                    title=test_case.title,
                    metadata=test_case.metadata,
                    flow_id=test_case.flow_id,
                    credentials=test_case.credentials,
                    comments=test_case.comments,
                    precondition_test_case_id=test_case.precondition_test_case_id,
                )
                orionis_log(f"test_case_params: {test_case_params}")

                result = self.datastore.add_test_case(test_case_params)
                if isinstance(result, RawTestCase):
                    copied_ids.append(result.test_case_id)
                    test_case_mapping[str(test_case.test_case_id)] = str(
                        result.test_case_id
                    )
                    orionis_log(f"Test case {result.test_case_id} copied.")
                    orionis_log(
                        f"Updating old test case {test_case_id} to include link to new test case"
                    )

                    if data.should_establish_test_case_links:
                        update_test_case_params = UpdateTestCaseRequestParams(
                            test_case_id=str(test_case_id),
                            new_test_case_to_link=MirroredTestCase(
                                test_case_id=result.test_case_id,
                                product_id=product_id_to,
                                product_name=product_to.product_name,
                            ),
                        )

                        self.datastore.update_test_case(update_test_case_params)
                else:
                    orionis_log(f"Error in adding test case: {result}")
                    skipped.append(result)
                    raise Exception(f"Error in adding test case {result}")

            response = {
                "message": f"{len(copied_ids)} test cases copied successfully.",
                "copied": copied_ids,
                "skipped": skipped,
                "mapping": test_case_mapping,
            }

            return ApiResponseEntity(
                response=response,
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except Exception as e:
            orionis_log("Error in copy_test_cases_for_product:", e)
            return ApiResponseEntity(
                response={"error": f"Internal server error : {e}"},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def update_mirrored_test_cases(
        self, request: ApiRequestEntity
    ) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            update_mirrored_test_case_request_params = (
                self.request_validator.validate_update_mirrored_test_cases_request(
                    request
                )
            )
            orionis_log(
                f"Validated test case update request for test case {update_mirrored_test_case_request_params.test_case_id} successfully"
            )
            test_case_list = self.datastore.fetch_test_cases_by_ids(
                [update_mirrored_test_case_request_params.test_case_id]
            )
            orionis_log(
                f"Fetched test case list for ID {update_mirrored_test_case_request_params.test_case_id}: {test_case_list}"
            )
            test_case = test_case_list[0] if test_case_list else None
            if not test_case:
                raise ValueError(
                    f"Test case with ID {update_mirrored_test_case_request_params.test_case_id} not found."
                )
            orionis_log(
                f"Fetched test case {test_case.test_case_id} for updating mirrored test cases."
            )
            update_tcue_param = (
                update_mirrored_test_case_request_params.update_test_case_params
            )
            orionis_log(
                f"Update parameters for mirrored test cases: {update_tcue_param.model_dump(mode='json')}"
            )
            mirrored_test_cases = test_case.mirrored_test_cases or []
            for mirrored_test_case in mirrored_test_cases:
                new_update_tcue_params = UpdateTestCaseRequestParams(
                    test_case_id=mirrored_test_case.test_case_id,
                    preconditions=update_tcue_param.preconditions,
                    test_case_description=update_tcue_param.test_case_description,
                    test_case_steps=update_tcue_param.test_case_steps,
                    scenarios=update_tcue_param.scenarios,
                    criticality=update_tcue_param.criticality,
                    status=update_tcue_param.status,
                )
                orionis_log(
                    f"Updating linked test case {mirrored_test_case.test_case_id} with params: {new_update_tcue_params}"
                )
                try:
                    self.datastore.update_test_case(new_update_tcue_params)
                except Exception as e:
                    orionis_log(
                        f"Failed to update linked test case {mirrored_test_case.test_case_id}: {e}",
                        e,
                    )

            return ApiResponseEntity(
                response={
                    self.FIELD_TEST_CASE_ID: update_mirrored_test_case_request_params.test_case_id,
                    self.FIELD_MESSAGE: "Linked test cases updated successfully",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log("Error in update_mirrored_test_cases:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log("Error in update_mirrored_test_cases:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )
