from typing import List
import json
from common.google_cloud_wrappers import GCPFileStorageWrapper
from llm_model import LLMModelWrapper
from products.product_datastore import ProductDatastore
from test_case_planning.feature_extraction.inference_response_models_v2 import (
    InputImageDescriptionResponseSchema,
    ScreenInferenceResponseFromFramesSchema,
)
from test_case_planning.feature_extraction.prompts import (
    GROUP_INPUT_FRAMES_BY_SCREEN_PROMPT,
)
from test_case_planning.test_case_planning_constants import (
    TEST_CASE_PLANNING_BUCKET_NAME,
)
from utils.util import orionis_log

from test_case_planning.feature_extraction.json_response_schemas import (
    group_screens_from_frames_response_schema,
)


class ScreenExtractor:
    def __init__(
        self,
        llm_model: LLMModelWrapper,
        product_datastore: ProductDatastore,
        file_storage: GCPFileStorageWrapper,
    ):
        self.llm_model = llm_model
        self.product_datastore = product_datastore
        self.file_storage = file_storage

    def extract_screens(
        self,
        request_id: str,
        design_frame_urls: List[str],
        input_image_descriptions: List[InputImageDescriptionResponseSchema],
    ) -> List[ScreenInferenceResponseFromFramesSchema]:
        orionis_log(
            f"\n\nCalling LLM for grouping {len(design_frame_urls or [])} input frames into screens"
        )

        input_image_descriptions_map = {
            description.image_index: description.description
            for description in input_image_descriptions
        }
        input_image_descriptions_string = json.dumps(
            input_image_descriptions_map, indent=2
        )

        prompt = GROUP_INPUT_FRAMES_BY_SCREEN_PROMPT.replace(
            "${input_image_descriptions}",
            input_image_descriptions_string,
        )

        self.file_storage.store_file(
            prompt,
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{request_id}/screen_grouping/prompt_group_input_frames_into_screens.txt",
            "text/plain",
        )

        llm_response = self.llm_model.call_llm_v3(
            prompt=prompt,
            image_urls=design_frame_urls or [],
            response_schema=group_screens_from_frames_response_schema,
        )

        self.file_storage.store_file(
            llm_response,
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{request_id}/screen_grouping/response_group_input_frames_into_screens.json",
            "application/json",
        )

        json_data = json.loads(llm_response)
        screens = [
            ScreenInferenceResponseFromFramesSchema.model_validate(item)
            for item in json_data
        ]

        orionis_log(
            f"\n\nGrouped {len(design_frame_urls or [])} input frames "
            f"into {len(screens)} screens for request {request_id}\n\n"
        )

        return screens
