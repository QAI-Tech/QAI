from typing import Any
from pydantic import ValidationError
from products.product_models import (
    AddProductFeatureRequestParamsDeprecated,
    AddScreenRequestParams,
    AddProductRequestParams,
    UpdateProductRequestParams,
    DeleteProductRequestParams,
)
from gateway.gateway_models import ApiRequestEntity


class ProductRequestValidator:
    def validate_add_product_request_params(
        self, request: Any
    ) -> AddProductRequestParams:
        try:
            product_request = AddProductRequestParams(**request)

        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid product request: {str(e)}")

        if not product_request.product_name:
            raise ValueError("product_name is required")

        if not (
            product_request.web_url
            or product_request.google_play_store_url
            or product_request.apple_app_store_url
        ):
            raise ValueError(
                "At least one URL among web_url, google_play_store_url, and apple_app_store_url must be provided"
            )

        return product_request

    def validate_add_product_feature_request_params(
        self, request: Any
    ) -> AddProductFeatureRequestParamsDeprecated:
        try:
            product_feature_request = AddProductFeatureRequestParamsDeprecated(
                **request
            )

        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid product feature request: {str(e)}")

        if not product_feature_request.product_id:
            raise ValueError("product_id is required")

        if not product_feature_request.feature_name:
            raise ValueError("feature_name is required")

        return product_feature_request

    def validate_add_screen_request_params(
        self, request: Any
    ) -> AddScreenRequestParams:
        try:
            add_screen_request_params = AddScreenRequestParams(**request)

            if not add_screen_request_params.product_id:
                raise ValueError("product_id is required")

            if (
                not add_screen_request_params.design_frame_urls
                or len(add_screen_request_params.design_frame_urls) == 0
            ):
                raise ValueError("At least one design uri is required")

            return add_screen_request_params

        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid screen request: {str(e)}")

    def validate_delete_product_request(
        self, request: ApiRequestEntity
    ) -> DeleteProductRequestParams:
        try:
            delete_request = DeleteProductRequestParams(**request.data)

            if not delete_request.product_id:
                raise ValueError("product_id is required")

            return delete_request

        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid delete product request: {str(e)}")

    def validate_update_product_request_params(
        self, request: ApiRequestEntity
    ) -> UpdateProductRequestParams:
        try:
            update_product_request_params = UpdateProductRequestParams(**request.data)

            if update_product_request_params.product_id is None:
                raise ValueError("product_id must be provided for update.")

        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid update product request: {str(e)}")

        return update_product_request_params
