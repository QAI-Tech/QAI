import logging
from constants import Constants
from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from features.feature_datastore import FeatureDatastore
from features.feature_request_validator import FeatureRequestValidator
from features.feature_models import Feature, FeatureInputModel, FeatureNotFoundError
from utils.util import orionis_log, parse_created_at
from models.reorder_features_and_test_cases_model import (
    ReorderableEntity,
)
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)


class FeatureService:
    def __init__(self, datastore: FeatureDatastore, validator: FeatureRequestValidator):
        self.datastore = datastore
        self.validator = validator

    def get_features_using_product_id(
        self, request: ApiRequestEntity
    ) -> ApiResponseEntity:

        if request.method != ApiRequestEntity.API_METHOD_GET:
            return ApiResponseEntity(
                response={"error": "Method must be GET"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            product_id = request.data.get("product_id")

            if not product_id:
                raise ValueError("Product ID is required")

            orionis_log(f"Fetching features for product_id: {product_id}")

            features = self.datastore.get_features(product_id) or []

            return ApiResponseEntity(
                response={
                    "product_id": product_id,
                    "features": (
                        [feature.model_dump() for feature in features]
                        if features
                        else []
                    ),
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Value error in get_features_using_product_id: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in get_features_using_product_id: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def add_feature(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Only POST method is allowed for this function."},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            add_feature_params = self.validator.validate_add_feature_request_params(
                request.data
            )

            # TODO: Add authorization check - does user have permission for this product_id?

            new_feature: Feature = self.datastore.add_feature(add_feature_params)
            feature_dict = new_feature.model_dump(mode="json")
            return ApiResponseEntity(
                response=feature_dict,
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except ValueError as e:
            orionis_log(f"Value error in add_feature: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in add_feature: {e}", e)
            return ApiResponseEntity(
                response={"error": "Internal server error while adding feature"},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def delete_feature(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_DELETE:
            return ApiResponseEntity(
                response={"error": "Only DELETE method is allowed for this function."},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            delete_params = self.validator.validate_delete_feature_request_params(
                request.data
            )

            # TODO: Add authorization check - does user have permission to delete this feature?

            self.datastore.delete_feature(delete_params.id, delete_params.product_id)

            return ApiResponseEntity(
                response={
                    "message": f"Feature {delete_params.id} deleted successfully"
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except FeatureNotFoundError as e:
            orionis_log(f"Feature not found error in delete_feature: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_NOT_FOUND,
            )
        except ValueError as e:
            orionis_log(f"Value error in delete_feature: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in delete_feature: {e}", e)
            return ApiResponseEntity(
                response={"error": "Internal server error while deleting feature"},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def reorder_features(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            feature_changed, feature_list = self.validator.validate_and_get_inputs(
                request
            )
            feature_ids = [f.feature_id for f in feature_list]

            features_entity_map = self._fetch_entities_by_ids(feature_ids)

            if all(features_entity_map[fid].sort_index is None for fid in feature_ids):
                updated_feature_entities = self._assign_initial_sort_indexes(
                    feature_list, features_entity_map
                )
            else:
                updated_feature_entities = self._calculate_updated_entities(
                    feature_list, features_entity_map, feature_changed
                )

            if updated_feature_entities:
                updated_entities = self.datastore.update_sorting_indexes(
                    updated_feature_entities
                )
                orionis_log(
                    f"Updated {len(updated_entities)} features with sort indexes"
                )

                all_features = self.datastore.get_entities_by_ids(feature_ids)
                sorted_features = sorted(
                    all_features,
                    key=lambda x: x.sort_index if x.sort_index is not None else 0.0,
                )
                orionis_log(f"Fetched {len(all_features)} features with sort indexes")

                return ApiResponseEntity(
                    response={
                        Constants.FIELD_FEATURES: [
                            {
                                Constants.FIELD_ID: feature.id,
                                Constants.FIELD_SORT_INDEX: (feature.sort_index),
                                Constants.FIELD_CREATED_AT: feature.created_at,
                            }
                            for feature in sorted_features
                        ],
                    },
                    status_code=ApiResponseEntity.HTTP_STATUS_OK,
                )

            return ApiResponseEntity(
                response={"error": "No features were updated."},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )

        except ValueError as e:
            orionis_log(f"Value error in reorder_features: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log("Unexpected error during reordering", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def _fetch_entities_by_ids(
        self, feature_ids: List[str]
    ) -> Dict[str, ReorderableEntity]:
        entities = self.datastore.get_entities_by_ids(feature_ids)
        return {e.id: e for e in entities}

    def _assign_initial_sort_indexes(
        self,
        feature_list: List[FeatureInputModel],
        entity_map: Dict[str, ReorderableEntity],
    ) -> List[ReorderableEntity]:
        updated = []
        for idx, feature in enumerate(feature_list):
            fid = feature.feature_id
            entity = entity_map[fid]
            updated.append(
                ReorderableEntity(
                    id=fid,
                    sort_index=float(idx + 1),
                    created_at=parse_created_at(entity.created_at),
                )
            )
        return updated

    def _calculate_updated_entities(
        self,
        feature_list: List[FeatureInputModel],
        entity_map: Dict[str, ReorderableEntity],
        feature_changed: str,
    ) -> List[ReorderableEntity]:
        updated = []

        for i, item in enumerate(feature_list):
            fid = item.feature_id
            if fid != feature_changed:
                continue

            before_id = feature_list[i - 1].feature_id if i > 0 else None
            after_id = (
                feature_list[i + 1].feature_id if i < len(feature_list) - 1 else None
            )

            before_index = entity_map[before_id].sort_index if before_id else None
            after_index = entity_map[after_id].sort_index if after_id else None
            current_entity = entity_map[fid]
            current_index = current_entity.sort_index

            new_index = self._compute_sort_index(
                before_index, after_index, current_index, i
            )

            if current_index != new_index:
                updated.append(
                    ReorderableEntity(
                        id=fid,
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

    def update_feature(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Only POST method is allowed for this function."},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            feature = self.validator.validate_update_feature_request_params(request)
            orionis_log(
                f"Validated feature update request for feature {feature.id} successfully"
            )

            updated_feature = self.datastore.update_feature(feature)
            orionis_log(
                f"Updated feature with name {updated_feature.name} in datastore successfully"
            )

            return ApiResponseEntity(
                response={
                    Constants.FIELD_FEATURE_ID: updated_feature.id,
                    "message": "Feature updated successfully",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except ValueError as e:
            orionis_log(f"Value error in update_feature: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in update_feature: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )
