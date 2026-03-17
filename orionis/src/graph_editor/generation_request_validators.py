from pydantic import ValidationError
from gateway.gateway_models import ApiRequestEntity
from graph_editor.generation_models import (
    FormatBusinessLogicRequest,
    FormatEdgeDescriptionRequest,
    TitleGenerationRequest,
)


class GenerationRequestValidator:
    def validate_title_generation_request_params(
        self, request_object: ApiRequestEntity
    ) -> TitleGenerationRequest:
        try:
            update_params = TitleGenerationRequest(**request_object.data)
        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid title generation request: {str(e)}")

        return update_params

    def validate_format_business_logic_request_params(
        self, request_object: ApiRequestEntity
    ) -> FormatBusinessLogicRequest:
        try:
            format_business_logic_request = FormatBusinessLogicRequest(
                **request_object.data
            )
        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid format business logic request: {str(e)}")

        return format_business_logic_request

    def validate_format_edge_description_request_params(
        self, request_object: ApiRequestEntity
    ) -> FormatEdgeDescriptionRequest:
        try:
            format_edge_description_request = FormatEdgeDescriptionRequest(
                **request_object.data
            )
        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid format edge description request: {str(e)}")

        return format_edge_description_request
