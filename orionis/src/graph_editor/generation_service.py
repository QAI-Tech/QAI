import json
from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from llm_model import LLMModelWrapper
from utils.util import should_call_llm, orionis_log
from constants import Constants
from graph_editor.generation_models import (
    TitleGenerationRequest,
    TitleGenerationResponse,
    FormatBusinessLogicRequest,
    FormatBusinessLogicResponse,
    FormatEdgeDescriptionRequest,
    FormatEdgeDescriptionResponse,
)
from graph_editor.generation_prompts import (
    GENERATE_NODE_TITLE_PROMPT,
    TITLE_GENERATION_RESPONSE_SCHEMA,
    FORMAT_BUSINESS_LOGIC_PROMPT,
    FORMAT_BUSINESS_LOGIC_RESPONSE_SCHEMA,
    FORMAT_EDGE_DESCRIPTION_PROMPT,
    FORMAT_EDGE_DESCRIPTION_RESPONSE_SCHEMA,
)
from graph_editor.generation_request_validators import (
    GenerationRequestValidator,
)


class GraphEditorLLMService:
    def __init__(self, llm_model: LLMModelWrapper):
        self.llm_model = llm_model
        self.request_validator = GenerationRequestValidator()

    def generate_title_for_node(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            orionis_log(f"Generating title for node: {request.data}")
            node_request = (
                self.request_validator.validate_title_generation_request_params(request)
            )

            result = self._generate_single_node_title(node_request)
            orionis_log(f"Generated title for node: {result}")

            return ApiResponseEntity(
                response=result.model_dump(), status_code=Constants.HTTP_STATUS_OK
            )

        except ValueError as e:
            orionis_log(f"Invalid title generation request: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Unexpected error in generate_title_for_node: {e}", e)
            return ApiResponseEntity(
                response={"error": "Internal server error occurred"},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def _generate_single_node_title(
        self, node_request: TitleGenerationRequest
    ) -> TitleGenerationResponse:

        try:

            llm_response = self.llm_model.call_llm_v3_base64(
                prompt=GENERATE_NODE_TITLE_PROMPT,
                image_base64_list=[node_request.image_url],
                response_schema=TITLE_GENERATION_RESPONSE_SCHEMA,
            )

            response_data = json.loads(llm_response)
            orionis_log(f"Response data: {response_data}")

            return TitleGenerationResponse(
                node_id=node_request.node_id,
                title=response_data.get("title", "Untitled"),
                description=response_data.get(
                    "description", "No description available"
                ),
            )
        except json.JSONDecodeError as e:
            orionis_log(
                f"Failed to parse LLM response for node {node_request.node_id}: {e}", e
            )
            raise e

        except Exception as e:
            orionis_log(f"Unexpected error in _generate_single_node_title: {e}", e)
            raise e

    def format_business_logic(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            orionis_log(f"Formatting business logic: {request.data}")
            business_logic_request = (
                self.request_validator.validate_format_business_logic_request_params(
                    request
                )
            )

            mode_check = should_call_llm(business_logic_request.mode)

            if mode_check:
                result = self._format_business_logic_for_edge(business_logic_request)
            else:
                return ApiResponseEntity(
                    response={"error": "LLM not called for this mode"},
                    status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
                )

            orionis_log(f"Formatted business logic: {result}")

            return ApiResponseEntity(
                response=result.model_dump(),
                status_code=Constants.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Invalid format business logic request: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Unexpected error in format_business_logic: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def _format_business_logic_for_edge(
        self, business_logic_request: FormatBusinessLogicRequest
    ) -> FormatBusinessLogicResponse:
        try:
            orionis_log(
                f"Formatting business logic for edge: {business_logic_request.edge_id}"
            )

            formatted_prompt = (
                f"{FORMAT_BUSINESS_LOGIC_PROMPT}\n"
                "<business_logic_to_format>\n"
                f"{business_logic_request.business_logic}\n"
                "</business_logic_to_format>"
            )

            llm_response = self.llm_model.call_llm_v3_base64(
                prompt=formatted_prompt,
                response_schema=FORMAT_BUSINESS_LOGIC_RESPONSE_SCHEMA,
            )

            response_data = json.loads(llm_response)
            orionis_log(f"Formatted business logic response: {response_data}")

            return FormatBusinessLogicResponse(
                formatted_business_logic=response_data.get(
                    "formatted_business_logic", ""
                ),
                edge_id=business_logic_request.edge_id,
                meta_logic=response_data.get("meta_logic", "No reasoning provided"),
            )
        except json.JSONDecodeError as e:
            orionis_log(
                f"Failed to parse LLM response for business logic formatting: {e}", e
            )
            raise e
        except Exception as e:
            orionis_log(f"Unexpected error in _format_business_logic_for_edge: {e}", e)
            raise e

    def format_edge_description(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            orionis_log(f"Formatting edge description: {request.data}")
            edge_description_request = (
                self.request_validator.validate_format_edge_description_request_params(
                    request
                )
            )

            result = self._format_edge_description_for_edge(edge_description_request)

            orionis_log(f"Formatted edge description: {result}")

            return ApiResponseEntity(
                response=result.model_dump(),
                status_code=Constants.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Invalid format edge description request: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Unexpected error in format_edge_description: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def _format_edge_description_for_edge(
        self, edge_description_request: FormatEdgeDescriptionRequest
    ) -> FormatEdgeDescriptionResponse:
        try:
            orionis_log(
                f"Formatting edge description for edge: {edge_description_request.edge_id}"
            )

            formatted_prompt = (
                f"{FORMAT_EDGE_DESCRIPTION_PROMPT}\n"
                "<edge_description_to_format>\n"
                f"{edge_description_request.description}\n"
                "</edge_description_to_format>"
            )

            llm_response = self.llm_model.call_llm_v3_base64(
                prompt=formatted_prompt,
                response_schema=FORMAT_EDGE_DESCRIPTION_RESPONSE_SCHEMA,
            )

            response_data = json.loads(llm_response)
            orionis_log(f"Formatted edge description response: {response_data}")

            return FormatEdgeDescriptionResponse(
                formatted_description=response_data.get("formatted_description", ""),
                edge_id=edge_description_request.edge_id,
                meta_logic=response_data.get("meta_logic", "No reasoning provided"),
            )
        except json.JSONDecodeError as e:
            orionis_log(
                f"Failed to parse LLM response for edge description formatting: {e}", e
            )
            raise e
        except Exception as e:
            orionis_log(
                f"Unexpected error in _format_edge_description_for_edge: {e}", e
            )
            raise e
