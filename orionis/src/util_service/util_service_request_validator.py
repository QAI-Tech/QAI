from util_service.util_models import (
    GetBatchSignedUrlsRequestParams,
    TriggerApiRequestParams,
)
from typing import Any
from utils.util import orionis_log
from pydantic import ValidationError


class UtilServiceRequestValidator:

    def validate_get_batched_signed_urls_request_params(
        self, request_object: Any
    ) -> GetBatchSignedUrlsRequestParams:
        try:
            orionis_log(
                f"Recieved Validation request for get_batched_signed_url with params: {request_object}"
            )
            get_batched_signed_url_request = GetBatchSignedUrlsRequestParams(
                **request_object
            )

        except (ValidationError, TypeError) as e:
            orionis_log("Invalid request for getting batched_signed_url_request: ", e)
            raise ValueError(
                f"Invalid request for getting batched signed url request: {str(e)}"
            )

        return get_batched_signed_url_request

    def validate_api_trigger_request_params(
        self, request_object: Any
    ) -> TriggerApiRequestParams:
        """
        Validates the request parameters for triggering an API request.
        This method can be extended to include more validation logic as needed.
        """
        try:
            orionis_log(
                f"Recieved Validation request for trigger api with params: {request_object}"
            )
            trigger_api_request_params = TriggerApiRequestParams(**request_object)

        except (ValidationError, TypeError) as e:
            orionis_log("Invalid request for getting batched_signed_url_request: ", e)
            raise ValueError(
                f"Invalid request for getting batched signed url request: {str(e)}"
            )

        return trigger_api_request_params
