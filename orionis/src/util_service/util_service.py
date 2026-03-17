from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from common.google_cloud_wrappers import GCPFileStorageWrapper
from utils.util import orionis_log
from util_service.util_service_request_validator import UtilServiceRequestValidator
from urllib.parse import urlparse
import requests


class UtilService:
    FIELD_SIGNED_URLS = "signed_urls"
    FIELD_MESSAGE = "message"

    def __init__(
        self,
        storage_client: GCPFileStorageWrapper,
        request_validator: UtilServiceRequestValidator,
    ):
        self.storage_client = storage_client
        self.request_validator = request_validator

    def batch_signed_url(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Only POST method is allowed for this function."},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )
        try:
            orionis_log(f"Got request to create signed URL with params: {request.data}")
            batch_signed_url_request = (
                self.request_validator.validate_get_batched_signed_urls_request_params(
                    request.data
                )
            )
        except ValueError as e:
            orionis_log(f"Invalid request for getting batched signed urls: {e}", e)
            return ApiResponseEntity(
                response={"error": f"Invalid request: {str(e)}"},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )

        try:
            orionis_log(
                f"Validated request to get batched signed url: {batch_signed_url_request}"
            )
            signed_urls = {}

            for url in batch_signed_url_request.urls:
                bucket, blob = self._extract_gcs_parts(url)
                if not bucket or not blob:
                    orionis_log(f"Skipping invalid GCS URL format: {url}")
                    continue
                signed_url = self.storage_client.generate_signed_url(
                    blob, bucket, 360 * 60, ApiRequestEntity.API_METHOD_GET
                )
                signed_urls[url] = signed_url

            orionis_log("Successfully processed all urls, returning signed urls")
            return ApiResponseEntity(
                response={
                    self.FIELD_SIGNED_URLS: signed_urls,
                    self.FIELD_MESSAGE: "Successfully fetched signed urls",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except Exception as e:
            orionis_log("Error in getting signed urls: ", e)
            return ApiResponseEntity(
                response={"error": f"Error while getting signed urls: {str(e)}"},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def trigger_api_request(self, request: ApiRequestEntity) -> ApiResponseEntity:
        allowed_methods = {"GET", "POST", "PUT", "PATCH", "DELETE"}
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Only POST method is allowed for this function."},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )
        try:
            orionis_log(f"Got request to trigger API with params: {request.data}")
            trigger_request_params = (
                self.request_validator.validate_api_trigger_request_params(request.data)
            )

            base_url = trigger_request_params.base_url
            method = trigger_request_params.method.upper()
            headers = trigger_request_params.headers or {}
            body = trigger_request_params.body

            if method not in allowed_methods:
                return ApiResponseEntity(
                    response={"error": f"HTTP method {method} is not supported."},
                    status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
                )
        except ValueError as e:
            orionis_log(f"Invalid request for API trigger: {e}", e)
            return ApiResponseEntity(
                response={"error": f"Invalid request: {str(e)}"},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )

        try:
            orionis_log(
                f"Validated API trigger request: base_url={base_url}, method={method}, headers={headers}, body={body}"
            )

            req_args = {
                "headers": headers,
                "timeout": 30,  # seconds timeout, optional
            }
            if method in {"POST", "PUT", "PATCH"}:
                req_args["json"] = body

            orionis_log(
                f"Triggering API request: {method} {base_url} with args: {req_args}"
            )
            # Only include 'json' if body is not None, otherwise requests will send 'null' as JSON
            if method in {"POST", "PUT", "PATCH"} and body is not None:
                api_response = requests.request(
                    method=method, url=base_url, headers=headers, timeout=30, json=body
                )
            else:
                api_response = requests.request(
                    method=method, url=base_url, headers=headers, timeout=30
                )
            orionis_log(f"API triggered, status_code={api_response.status_code}")

            try:
                api_response_data = api_response.json()
            except Exception:
                api_response_data = api_response.text

            return ApiResponseEntity(
                response={
                    "result": api_response_data,
                    "status_code": api_response.status_code,
                    self.FIELD_MESSAGE: "Successfully triggered API",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except Exception as e:
            orionis_log("Error while triggering API: ", e)
            return ApiResponseEntity(
                response={"error": f"Error while triggering API: {str(e)}"},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def _extract_gcs_parts(self, url: str):
        # Example: https://storage.cloud.google.com/product-design-assets-prod/qai-upload-temporary/abc/def.png
        parsed = urlparse(url)
        # Remove the leading '/' and split at first slash
        path_no_slash = parsed.path.lstrip("/")
        if "/" not in path_no_slash:
            # Invalid, can't find both bucket and blob
            return None, None
        bucket, blob_name = path_no_slash.split("/", 1)
        return bucket, blob_name
