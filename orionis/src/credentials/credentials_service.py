from constants import Constants
from credentials.credentials_datastore import CredentialsDatastore
from products.product_request_validator import ProductRequestValidator
from products.product_datastore import ProductDatastore
from test_cases.test_case_datastore import TestCaseDatastore
from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from utils.util import orionis_log
from credentials.credentials_request_validator import CredentialsRequestValidator
from mixpanel_integration.mixpanel_service import mixpanel


class CredentialsManagementService:
    def __init__(
        self,
        credentials_datastore: CredentialsDatastore,
        product_datastore: ProductDatastore,
        test_case_datastore: TestCaseDatastore,
        credentials_request_validator: CredentialsRequestValidator,
        product_request_validator: ProductRequestValidator,
    ):
        self.credentials_datastore = credentials_datastore
        self.product_datastore = product_datastore
        self.test_case_datastore = test_case_datastore
        self.credentials_request_validator = credentials_request_validator
        self.product_request_validator = product_request_validator

    def add_credentials_to_test_case_or_product(
        self, request: ApiRequestEntity
    ) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            credentials_request = (
                self.credentials_request_validator.validate_add_credentials(
                    request.data
                )
            )

            if credentials_request.test_case_id:
                orionis_log(
                    f"Creating credentials for test_case_id: {credentials_request.test_case_id}"
                )

                credentials = self.credentials_datastore.add_credentials(
                    credentials_request
                )

                updated_credentials = (
                    self.test_case_datastore.add_credentials_to_test_case(
                        test_case_id=credentials_request.test_case_id,
                        credentials_id=credentials.id,
                    )
                )

                orionis_log(f"Updated credentials: {updated_credentials}")

            else:
                orionis_log(
                    f"Creating credentials scoped to product_id: {credentials_request.product_id}"
                )

                credentials = self.credentials_datastore.add_credentials(
                    credentials_request
                )

                product_request_params = self.product_request_validator.validate_update_product_request_params(
                    ApiRequestEntity(
                        method=ApiRequestEntity.API_METHOD_POST,
                        data={
                            "product_id": credentials_request.product_id,
                            "default_credentials_id": credentials.id,
                            "is_default": credentials_request.is_default,
                        },
                    )
                )

                updated_default_credentials_id = self.product_datastore.update_product(
                    product_request_params
                )
                orionis_log(
                    f"Added default credentials {updated_default_credentials_id} to product {credentials_request.product_id}"
                )
                try:
                    orionis_log("[MIXPANEL] Tracking credentials creation")

                    # Determine credential type
                    credential_type = (
                        "Test Case" if credentials_request.test_case_id else "Product"
                    )

                    # Prepare tracking properties
                    properties = {
                        "credential_id": credentials.id,
                        "credential_type": credential_type,
                        "is_default": credentials_request.is_default,
                        "product_id": credentials_request.product_id,
                    }

                    # Add test case ID if applicable
                    if credentials_request.test_case_id:
                        properties["test_case_id"] = credentials_request.test_case_id

                    # Track the event
                    user_id = (
                        request.user_id if hasattr(request, "user_id") else "system"
                    )
                    tracking_result = mixpanel.track(
                        user_id, "Credentials Added", properties
                    )

                    if tracking_result:
                        orionis_log(
                            "[MIXPANEL] Successfully tracked credentials creation"
                        )
                    else:
                        orionis_log("[MIXPANEL] Failed to track credentials creation")
                except Exception as tracking_error:
                    orionis_log(
                        f"[MIXPANEL] Error tracking credentials creation: {str(tracking_error)}"
                    )

            return ApiResponseEntity(
                response={
                    "message": "Credentials created and linked successfully",
                    "test_case_id": (
                        credentials_request.test_case_id
                        if credentials_request.test_case_id
                        else ""
                    ),
                    "product_id": (
                        credentials_request.product_id
                        if credentials_request.product_id
                        else ""
                    ),
                    "credentials": credentials.model_dump(),
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log("ValueError while adding credentials", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log("ValueError while adding credentials", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def get_credentials(self, request: ApiRequestEntity) -> ApiResponseEntity:

        if request.method != ApiRequestEntity.API_METHOD_GET:
            return ApiResponseEntity(
                response={"error": "Method must be GET"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            product_id = request.data.get("product_id")

            if not product_id:
                raise ValueError("Product ID is required")

            orionis_log(f"Fetching credentials for product_id: {product_id}")

            credentials = self.credentials_datastore.get_credentials(product_id) or []
            product_details = self.product_datastore.get_product_from_id(product_id)

            return ApiResponseEntity(
                response={
                    Constants.FIELD_CREDENTIALS: [
                        cred.model_dump() for cred in credentials
                    ],
                    Constants.FIELD_DEFAULT_CREDENTIALS_ID: (
                        product_details.default_credentials_id
                        if product_details.default_credentials_id
                        else ""
                    ),
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Value error in get_credentials: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )

        except Exception as e:
            orionis_log(f"Exception in get_credentials: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def update_credentials(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            orionis_log(f"Received update request: {request.data}")

            orionis_log(
                f"Updating credentials with id {request.data.get('id')} in datastore"
            )
            update_credential_params = self.credentials_request_validator.validate_update_credentials_request_params(
                request
            )

            updated_credentials = self.credentials_datastore.update_credentials(
                update_credential_params
            )
            updated_default_credentials_id: str = ""
            if update_credential_params.is_default:
                orionis_log(
                    f"Setting default credentials {update_credential_params.id} for product {update_credential_params.product_id}"
                )

                update_product_request_params = self.product_request_validator.validate_update_product_request_params(
                    ApiRequestEntity(
                        method=ApiRequestEntity.API_METHOD_POST,
                        data={
                            "product_id": update_credential_params.product_id,
                            "default_credentials_id": update_credential_params.id,
                            "is_default": update_credential_params.is_default,
                        },
                    )
                )

                updated_default_credentials_id = self.product_datastore.update_product(
                    update_product_request_params
                )
                orionis_log(
                    f"Updated default credentials {updated_default_credentials_id} for product {update_credential_params.product_id}"
                )

            return ApiResponseEntity(
                response={
                    "credentials": updated_credentials.model_dump(),
                    "default_credentials_id": (
                        updated_default_credentials_id
                        if updated_default_credentials_id
                        else ""
                    ),
                    "message": "Credentials updated successfully",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Value error in update_credentials: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in update_credentials: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def delete_credentials(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_DELETE:
            return ApiResponseEntity(
                response={"error": "Method must be DELETE"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            orionis_log(
                f"Deleting credentials with ID {request.data.get('credentials_id')}"
            )

            if not request.data.get("credentials_id"):
                raise ValueError("Credentials ID is required to delete credentials")

            deleted_credentials_id = self.credentials_datastore.delete_credentials(
                request.data.get("credentials_id")
            )

            orionis_log(f"Credentials {deleted_credentials_id} deleted successfully")
            return ApiResponseEntity(
                response={
                    Constants.FIELD_CREDENTIALS_ID: deleted_credentials_id,
                    "message": "Credentials deleted successfully",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Value error in delete_credentials: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in delete_credentials: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )
