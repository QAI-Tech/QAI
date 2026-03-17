import json
from typing import List
from common.google_cloud_wrappers import GCPFileStorageWrapper
from llm_model import LLMModelWrapper
from test_case_planning.feature_extraction.inference_response_models_v2 import (
    InputImageDescriptionResponseSchema,
)
from test_case_planning.feature_extraction.prompts import INPUT_IMAGE_DESCRIPTION_PROMPT
from test_case_planning.feature_extraction.json_response_schemas import (
    input_images_description_response_schema,
)
from test_case_planning.test_case_planning_constants import (
    TEST_CASE_PLANNING_BUCKET_NAME,
)
from utils.util import orionis_log


class InputImageDescriptor:

    def __init__(
        self,
        llm_model: LLMModelWrapper,
        file_storage: GCPFileStorageWrapper,
    ):
        self.llm_model = llm_model
        self.file_storage = file_storage

    def describe_input_images(
        self,
        request_id: str,
        design_frame_urls: List[str],
    ) -> List[InputImageDescriptionResponseSchema]:
        if not design_frame_urls:
            raise ValueError("design_frame_urls cannot be empty")

        orionis_log(
            f"\n\nCalling LLM to describe {len(design_frame_urls)} input images for the request {request_id}\n\n"
        )

        prompt = INPUT_IMAGE_DESCRIPTION_PROMPT

        llm_response = self.llm_model.call_llm_v3(
            prompt=prompt,
            image_urls=design_frame_urls,
            response_schema=input_images_description_response_schema,
        )

        self.file_storage.store_file(
            llm_response,
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{request_id}/input_image_description/response_input_image_description.json",
            "application/json",
        )

        response_json = json.loads(llm_response)
        return [
            InputImageDescriptionResponseSchema(**response_json[i])
            for i in range(len(response_json))
        ]
