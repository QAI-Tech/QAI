from jira_credentials.jira_credentials_datastore import JiraCredentialsDatastore
from jira_credentials.jira_credentials_request_validator import (
    JiraCredentialsRequestValidator,
)
from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from utils.util import orionis_log
from mixpanel_integration.mixpanel_service import mixpanel


class JiraCredentialsService:
    """Service for managing Jira credentials."""

    def __init__(
        self,
        jira_credentials_datastore: JiraCredentialsDatastore,
        jira_credentials_request_validator: JiraCredentialsRequestValidator,
    ):
        self.jira_credentials_datastore = jira_credentials_datastore
        self.jira_credentials_request_validator = jira_credentials_request_validator

    def add_jira_credentials(self, request: ApiRequestEntity) -> ApiResponseEntity:
        """Add new Jira credentials with encrypted API token."""
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            # Validate request
            validated_request = (
                self.jira_credentials_request_validator.validate_add_jira_credentials(
                    request.data
                )
            )

            orionis_log(
                f"Adding Jira credentials for product_id: {validated_request.product_id}"
            )

            # Add credentials (token will be encrypted in datastore)
            credentials = self.jira_credentials_datastore.add_jira_credentials(
                validated_request
            )

            try:
                orionis_log("[MIXPANEL] Tracking Jira credentials creation")

                user_id = request.user_id if hasattr(request, "user_id") else "system"

                properties = {
                    "jira_credential_id": credentials.id,
                    "email": credentials.email,
                    "product_id": credentials.product_id,
                    "jira_project_key": credentials.jira_project_key,
                    "jira_base_url": credentials.jira_base_url,
                }

                # Tracks the event
                tracking_result = mixpanel.track(
                    user_id, "Jira Credentials Added", properties
                )

                if tracking_result:
                    orionis_log(
                        "[MIXPANEL] Successfully tracked Jira credentials creation"
                    )
                else:
                    orionis_log("[MIXPANEL] Failed to track Jira credentials creation")
            except Exception as tracking_error:
                orionis_log(
                    f"[MIXPANEL] Error tracking Jira credentials creation: {str(tracking_error)}"
                )

            return ApiResponseEntity(
                response={
                    "message": "Jira credentials added successfully",
                    "id": credentials.id,
                    "email": credentials.email,
                    "product_id": credentials.product_id,
                    "created_at": credentials.created_at.isoformat(),
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"ValueError while adding Jira credentials: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception while adding Jira credentials: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def delete_jira_credentials(self, request: ApiRequestEntity) -> ApiResponseEntity:
        """Delete Jira credentials by ID."""
        if request.method != ApiRequestEntity.API_METHOD_DELETE:
            return ApiResponseEntity(
                response={"error": "Method must be DELETE"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            # Validate request
            validated_request = self.jira_credentials_request_validator.validate_delete_jira_credentials(
                request.data
            )

            orionis_log(f"Deleting Jira credentials with ID: {validated_request.id}")

            # Delete credentials
            deleted_id = self.jira_credentials_datastore.delete_jira_credentials(
                validated_request.id
            )

            try:
                orionis_log("[MIXPANEL] Tracking Jira credentials deletion")

                user_id = request.user_id if hasattr(request, "user_id") else "system"

                properties = {"jira_credential_id": deleted_id}

                # Tracks the event
                tracking_result = mixpanel.track(
                    user_id, "Jira Credentials Deleted", properties
                )

                if tracking_result:
                    orionis_log(
                        "[MIXPANEL] Successfully tracked Jira credentials deletion"
                    )
                else:
                    orionis_log("[MIXPANEL] Failed to track Jira credentials deletion")
            except Exception as tracking_error:
                orionis_log(
                    f"[MIXPANEL] Error tracking Jira credentials deletion: {str(tracking_error)}"
                )

            return ApiResponseEntity(
                response={
                    "message": "Jira credentials deleted successfully",
                    "id": deleted_id,
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"ValueError while deleting Jira credentials: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception while deleting Jira credentials: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def get_jira_credentials(self, request: ApiRequestEntity) -> ApiResponseEntity:
        """Get Jira credentials for a product (without API tokens for security)."""
        if request.method != ApiRequestEntity.API_METHOD_GET:
            return ApiResponseEntity(
                response={"error": "Method must be GET"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            product_id = request.data.get("product_id")

            if not product_id:
                raise ValueError("Product ID is required")

            orionis_log(f"Fetching Jira credentials for product_id: {product_id}")

            # Get credentials list (without API tokens)
            credentials_list = (
                self.jira_credentials_datastore.get_jira_credentials_list(product_id)
            )

            return ApiResponseEntity(
                response={
                    "credentials": [cred.model_dump() for cred in credentials_list],
                    "count": len(credentials_list),
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"ValueError while getting Jira credentials: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception while getting Jira credentials: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )
