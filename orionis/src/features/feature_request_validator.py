from typing import Any, Tuple, List
from pydantic import ValidationError
from features.feature_models import (
    AddFeatureRequestParams,
    DeleteFeatureRequestParams,
    FeatureInputModel,
    ReorderFeatureRequestModel,
    UpdateFeatureRequestParams,
)
from gateway.gateway_models import ApiRequestEntity
from utils.util import orionis_log


class FeatureRequestValidator:
    def validate_add_feature_request_params(
        self, request: Any
    ) -> AddFeatureRequestParams:
        try:
            feature_request = AddFeatureRequestParams(**request)

        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid feature request: {str(e)}")

        if not feature_request.product_id:
            raise ValueError("product_id is required")

        if not feature_request.name:
            raise ValueError("name is required")

        return feature_request

    def validate_delete_feature_request_params(
        self, request: Any
    ) -> DeleteFeatureRequestParams:
        try:
            delete_request = DeleteFeatureRequestParams(**request)

        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid delete feature request: {str(e)}")

        if not delete_request.id:
            raise ValueError("id (feature id) is required")

        if not delete_request.product_id:
            raise ValueError("product_id is required")

        try:
            int(delete_request.id)
        except ValueError:
            raise ValueError("id must be a valid integer ID")

        return delete_request

    def validate_and_get_inputs(
        self, request: ApiRequestEntity
    ) -> Tuple[str, List[FeatureInputModel]]:
        try:
            validated = ReorderFeatureRequestModel(**request.data)
            return validated.feature_changed, validated.features
        except Exception as e:
            orionis_log(f"Invalid input format: {e}", e)
            raise ValueError(f"Invalid input format: {e}")

    def validate_update_feature_request_params(
        self, request_object: ApiRequestEntity
    ) -> UpdateFeatureRequestParams:

        try:
            update_params = UpdateFeatureRequestParams(**request_object.data)

        except (ValidationError, TypeError) as e:
            orionis_log(f"Invalid feature update request: {str(e)}", e)
            raise ValueError(f"Invalid feature update request: {str(e)}")

        if update_params.name is None and update_params.description is None:
            orionis_log(
                "At least one field (name or description) must be provided for update",
                Exception(
                    "At least one field (name or description) must be provided for update"
                ),
            )
            raise ValueError(
                "At least one field (name or description) must be provided"
            )

        if not update_params.id:
            orionis_log(
                "Feature id is required for update",
                Exception("Feature id is required for update"),
            )
            raise ValueError("id is required")

        return update_params
