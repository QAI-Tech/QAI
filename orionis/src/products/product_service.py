from config import Config, config
from constants import Constants
from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from products.product_datastore import ProductDatastore
from products.product_models import (
    GetAllProductsParams,
    ScreenEntity,
)
from products.product_request_validator import ProductRequestValidator
from utils.util import orionis_log
from credentials.credentials_datastore import CredentialsDatastore
from credentials.credentials_model import AddCredentialsRequest
from features.feature_datastore import FeatureDatastore
from services.notify_service.notify import NotificationService


class ProductService:
    def __init__(self, datastore: ProductDatastore, validator: ProductRequestValidator):
        self.datastore = datastore
        self.validator = validator
        self.credentials_datastore = CredentialsDatastore()
        self.feature_datastore = FeatureDatastore()
        self.notification_service = NotificationService()

    def add_product(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Only POST method is allowed for this function."},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            addProductRequestParams = (
                self.validator.validate_add_product_request_params(request.data)
            )

            organisation_id = (
                addProductRequestParams.organisation_id
            )  # TODO: get organisation id of the user
            new_product = self.datastore.add_product(
                organisation_id, addProductRequestParams
            )
            product_id = new_product.product_id
            orionis_log(f"Product ID: {product_id}")

            orionis_log(
                f"Default credentials status: {'Provided' if addProductRequestParams.default_credentials else 'Not provided'}"
            )

            if addProductRequestParams.default_credentials:
                credentials_request = AddCredentialsRequest(
                    credentials=addProductRequestParams.default_credentials.credentials,
                    description=addProductRequestParams.default_credentials.description,
                    product_id=product_id,
                    is_default=addProductRequestParams.default_credentials.is_default,
                )
                credentials = self.credentials_datastore.add_credentials(
                    credentials_request
                )
                default_credentials_id = credentials.id
                new_product.default_credentials_id = default_credentials_id
                product_request_params = self.validator.validate_update_product_request_params(
                    ApiRequestEntity(
                        method=ApiRequestEntity.API_METHOD_POST,
                        data={
                            "product_id": product_id,
                            "default_credentials_id": default_credentials_id,
                            "is_default": addProductRequestParams.default_credentials.is_default,
                        },
                    )
                )
                self.datastore.update_product(product_request_params)
                orionis_log(
                    f"Added default credentials {default_credentials_id} to product {product_id}"
                )

            if config.environment == Config.PRODUCTION:

                non_qai_user_org = new_product.organisation_id not in (
                    Constants.SUPER_USER_ORG_IDS + Constants.QA_SANDBOX_ORG_IDS
                )

                if non_qai_user_org:
                    message = (
                        "🆕 *New Product Added!*\n"
                        "A new product has been successfully created in the system.\n\n"
                        f"📦 *Product Name:* `{new_product.product_name}`\n"
                        f"🆔 *Product ID:* `{new_product.product_id}`\n"
                        f"🏢 *Organisation ID:* `{new_product.organisation_id}`\n"
                        f"🔗 *Product Link:* {Constants.DOMAIN}/{new_product.product_id}"
                    )

                    try:
                        self.notification_service.notify_slack(
                            message, self.notification_service.slack_webhook_url
                        )
                    except Exception as e:
                        orionis_log(
                            f"Failed to send product creation notification: {e}", e
                        )

            product_dict = new_product.model_dump(mode="json")
            return ApiResponseEntity(
                response=product_dict,
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except ValueError as e:
            orionis_log(f"Value error in add_product: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in add_product: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def update_product(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Only POST method is allowed for this function."},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            updateProductRequestParams = (
                self.validator.validate_update_product_request_params(request)
            )

            message = self.datastore.update_product(updateProductRequestParams)

            return ApiResponseEntity(
                response={
                    "message": message,
                    "product_id": updateProductRequestParams.product_id,
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except ValueError as e:
            orionis_log(f"Value error in update_product: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in update_product: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def get_products_from_datastore(self, input_data: GetAllProductsParams):
        products = self.datastore.get_all_products(input_data.organisation_id)

        if not products:
            orionis_log(
                "No products found for this organisation ID: "
                + input_data.organisation_id
            )
        return products

    def delete_product(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_DELETE:
            return ApiResponseEntity(
                response={"error": "Only DELETE method is allowed for this function."},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            deleteProductRequestParams = self.validator.validate_delete_product_request(
                request
            )

            message = self.datastore.soft_delete_product(
                deleteProductRequestParams.product_id
            )

            return ApiResponseEntity(
                response={
                    "message": message,
                    "product_id": deleteProductRequestParams.product_id,
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except ValueError as e:
            orionis_log(f"Value error in delete_product: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in delete_product: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def add_screen(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Only POST method is allowed for this function."},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            add_screen_request_params = (
                self.validator.validate_add_screen_request_params(request.data)
            )

            new_screen: ScreenEntity = self.datastore.add_screen(
                add_screen_request_params
            )

            return ApiResponseEntity(
                response=new_screen.model_dump(mode="json"),
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except ValueError as e:
            orionis_log(f"Value error in add_screen: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in add_screen: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )
