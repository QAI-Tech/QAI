import json
from typing import List
from common.google_cloud_wrappers import GCPFileStorageWrapper
from llm_model import LLMModelWrapper
from products.product_datastore import ProductDatastore
from products.product_models import FunctionalityEntity
from test_case_planning.feature_extraction.inference_response_models_v2 import (
    BaseFunctionalityInferenceFromFramesResponseSchema,
    CorrectedBaseFunctionalityFromFramesResponseSchema,
    FunctionalityInferenceFromFramesResponseSchema,
    InputImageDescriptionResponseSchema,
)
from test_case_planning.feature_extraction.prompts import (
    ASSOCIATE_FRAMES_TO_FUNCTIONALITIES_PROMPT,
    CORRECT_BASE_FUNCTIONALITIES_FROM_FRAMES_PROMPT,
    BASE_FUNCTIONALITY_EXTRACTION_FROM_FRAMES_PROMPT,
)
from test_case_planning.test_case_planning_constants import (
    TEST_CASE_PLANNING_BUCKET_NAME,
)
from test_case_planning.test_case_planning_models import TestCasePlanningRequest
from utils.util import orionis_log, serialize

from test_case_planning.feature_extraction.json_response_schemas import (
    corrected_base_functionalities_from_frames_response_schema,
    base_functionalities_from_frames_response_schema,
    functionality_from_frames_response_schema,
)


class FunctionalityExtractor:

    def __init__(
        self,
        llm_model: LLMModelWrapper,
        product_datastore: ProductDatastore,
        file_storage: GCPFileStorageWrapper,
    ):
        self.llm_model = llm_model
        self.product_datastore = product_datastore
        self.file_storage = file_storage

    def extract_functionalities(
        self,
        planning_request: TestCasePlanningRequest,
        existing_functionalities: List[FunctionalityEntity],
        input_image_descriptions: List[InputImageDescriptionResponseSchema],
    ) -> List[FunctionalityInferenceFromFramesResponseSchema]:

        base_functionalities = self._extract_base_functionalities(
            planning_request, existing_functionalities, input_image_descriptions
        )

        base_functionality_corrections = self._correct_base_functionalities(
            base_functionalities, planning_request, input_image_descriptions
        )

        functionalities_to_return = []
        for base_functionality_correction in base_functionality_corrections:
            functionalities_to_return.append(
                self._associate_frames_with_functionality(
                    base_functionality_correction.functionality,
                    planning_request,
                    input_image_descriptions,
                )
            )

        self.file_storage.store_file(
            serialize(functionalities_to_return),
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{planning_request.request_id}/functionality_extraction/functionalities.json",
            "application/json",
        )

        return functionalities_to_return

    def _extract_base_functionalities(
        self,
        planning_request: TestCasePlanningRequest,
        existing_functionalities: List[FunctionalityEntity],
        input_image_descriptions: List[InputImageDescriptionResponseSchema],
    ) -> List[BaseFunctionalityInferenceFromFramesResponseSchema]:

        # TODO fix this
        existing_functionalities_list = serialize(existing_functionalities)

        input_image_descriptions_map = {
            description.image_index: description.description
            for description in input_image_descriptions
        }
        input_image_descriptions_string = json.dumps(
            input_image_descriptions_map, indent=2
        )

        prompt = (
            BASE_FUNCTIONALITY_EXTRACTION_FROM_FRAMES_PROMPT.replace(
                "${existing_functionalities_list}",
                existing_functionalities_list,
            )
            .replace(
                "${input_image_descriptions}",
                input_image_descriptions_string,
            )
            .replace(
                "${input_test_cases}",
                (
                    "\n\n".join(planning_request.input_test_cases)
                    if planning_request.input_test_cases
                    else ""
                ),
            )
            .replace(
                "${acceptance_criteria}",
                planning_request.acceptance_criteria or "",
            )
        )

        orionis_log("\n\nCalling LLM for base functionality extraction from frames")

        self.file_storage.store_file(
            prompt,
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{planning_request.request_id}/functionality_extraction/prompt_base_functionality_extraction_from_frames.txt",
            "text/plain",
        )

        llm_response = self.llm_model.call_llm_v3(
            prompt=prompt,
            image_urls=planning_request.design_frame_urls or [],
            video_urls=planning_request.user_flow_video_urls or [],
            response_schema=base_functionalities_from_frames_response_schema,
        )

        self.file_storage.store_file(
            llm_response,
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{planning_request.request_id}/functionality_extraction/response_base_functionality_extraction_from_frames.json",
            "application/json",
        )

        json_data = json.loads(llm_response)
        functionalities = [
            BaseFunctionalityInferenceFromFramesResponseSchema.model_validate(item)
            for item in json_data
        ]

        return functionalities

    def _correct_base_functionalities(
        self,
        base_functionalities_to_correct: List[
            BaseFunctionalityInferenceFromFramesResponseSchema
        ],
        planning_request: TestCasePlanningRequest,
        input_image_descriptions: List[InputImageDescriptionResponseSchema],
    ) -> List[CorrectedBaseFunctionalityFromFramesResponseSchema]:

        input_image_descriptions_map = {
            description.image_index: description.description
            for description in input_image_descriptions
        }
        input_image_descriptions_string = json.dumps(
            input_image_descriptions_map, indent=2
        )

        prompt = CORRECT_BASE_FUNCTIONALITIES_FROM_FRAMES_PROMPT.replace(
            "${functionalities_to_correct}",
            serialize(base_functionalities_to_correct),
        ).replace(
            "${input_image_descriptions}",
            input_image_descriptions_string,
        )

        self.file_storage.store_file(
            prompt,
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{planning_request.request_id}/functionality_extraction/prompt_correction_of_base_functionalities_from_frames.txt",
            "text/plain",
        )

        orionis_log(
            f"\n\nCalling LLM for correction of {len(base_functionalities_to_correct)} base functionalities from frames\n\n"
        )

        image_urls = planning_request.design_frame_urls or []

        llm_response = self.llm_model.call_llm_v3(
            prompt=prompt,
            image_urls=image_urls,
            video_urls=planning_request.user_flow_video_urls or [],
            response_schema=corrected_base_functionalities_from_frames_response_schema,
        )

        self.file_storage.store_file(
            llm_response,
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{planning_request.request_id}/functionality_extraction/response_corrected_functionalities_from_frames.json",
            "application/json",
        )

        json_data = json.loads(llm_response)
        base_functionality_corrections = [
            CorrectedBaseFunctionalityFromFramesResponseSchema.model_validate(item)
            for item in json_data
        ]

        return base_functionality_corrections

    def _associate_frames_with_functionality(
        self,
        base_functionality: BaseFunctionalityInferenceFromFramesResponseSchema,
        planning_request: TestCasePlanningRequest,
        input_image_descriptions: List[InputImageDescriptionResponseSchema],
    ) -> FunctionalityInferenceFromFramesResponseSchema:

        orionis_log(
            f"\n\nCalling LLM to associate frames with {base_functionality.functionality_name} functionality\n\n"
        )

        input_image_descriptions_map = {
            description.image_index: description.description
            for description in input_image_descriptions
        }
        input_image_descriptions_string = json.dumps(
            input_image_descriptions_map, indent=2
        )

        prompt = ASSOCIATE_FRAMES_TO_FUNCTIONALITIES_PROMPT.replace(
            "${functionality}",
            json.dumps(base_functionality.model_dump(mode="json")),
        ).replace(
            "${input_image_descriptions}",
            input_image_descriptions_string,
        )

        self.file_storage.store_file(
            prompt,
            TEST_CASE_PLANNING_BUCKET_NAME,
            (
                f"{planning_request.request_id}/functionality_extraction/"
                f"{base_functionality.functionality_name}/prompt_associate_frames_with_functionality.txt"
            ),
            "text/plain",
        )

        llm_response = self.llm_model.call_llm_v3(
            prompt=prompt,
            image_urls=planning_request.design_frame_urls or [],
            video_urls=planning_request.user_flow_video_urls or [],
            response_schema=functionality_from_frames_response_schema,
        )

        self.file_storage.store_file(
            llm_response,
            TEST_CASE_PLANNING_BUCKET_NAME,
            (
                f"{planning_request.request_id}/functionality_extraction/"
                f"{base_functionality.functionality_name}/response_associate_frames_with_functionality.json"
            ),
            "application/json",
        )

        return FunctionalityInferenceFromFramesResponseSchema.model_validate(
            json.loads(llm_response)
        )
