import json
from typing import Any, List

from pydantic import BaseModel
from common.google_cloud_wrappers import GCPFileStorageWrapper
from llm_model import LLMModelWrapper
from products.product_datastore import ProductDatastore
from products.product_models import FunctionalityEntity
from products.product_service import ProductService
from test_case_planning.app_video_analysis.app_video_analyzer import AppVideoAnalyzer
from test_case_planning.feature_extraction.feature_extractor import FeatureExtractor
from test_case_planning.feature_extraction.inference_response_models_v2 import (
    InputImageDescriptionResponseSchema,
)
from test_case_planning.feature_extraction.input_image_descriptor import (
    InputImageDescriptor,
)
from test_case_planning.inference_response_models import (
    SmokeTestCaseInferenceResponseSchema,
)
from test_case_planning.prompts import (
    SMOKE_TEST_PLANNING_PROMPT,
)
from test_case_planning.test_case_planning_constants import (
    TEST_CASE_PLANNING_BUCKET_NAME,
)
from test_cases.test_case_datastore import TestCaseDatastore
from test_cases.test_case_models import (
    AddTestCaseRequestParams,
    AddTestCaseStepRequestParams,
    RawTestCase,
)
from test_case_planning.test_case_planning_models import TestCasePlanningRequest
from utils.util import orionis_log
from test_case_planning.json_response_schemas import (
    smoke_test_cases_response_schema,
)


class AssembledSmokeTest(BaseModel):
    response: SmokeTestCaseInferenceResponseSchema
    design_frame_url: str
    functionality_id: str


class SmokeTestPlannerAgent:

    def __init__(
        self,
        llm_model: LLMModelWrapper,
        product_service: ProductService,
        file_storage: GCPFileStorageWrapper,
        product_datastore: ProductDatastore,
        test_case_datastore: TestCaseDatastore,
        input_image_descriptor: InputImageDescriptor,
        feature_extractor: FeatureExtractor,
        app_video_analyzer: AppVideoAnalyzer,
    ):
        self.llm_model = llm_model
        self.product_service = product_service
        self.file_storage = file_storage
        self.product_datastore = product_datastore
        self.test_case_datastore = test_case_datastore
        self.input_image_descriptor = input_image_descriptor
        self.feature_extractor = feature_extractor
        self.app_video_analyzer = app_video_analyzer

    def plan_smoke_tests(
        self, planning_request: TestCasePlanningRequest
    ) -> List[RawTestCase]:

        self._clean_up_previous_request_attempt_data(planning_request)

        final_test_cases: List[RawTestCase] = []

        if planning_request.user_flow_video_urls:
            for video_url in planning_request.user_flow_video_urls:
                raw_test_cases = self.app_video_analyzer.extract_test_cases_from_video(
                    planning_request.request_id,
                    planning_request.product_id,
                    planning_request.new_feature_name,
                    video_url,
                )
                final_test_cases.extend(raw_test_cases)

            return final_test_cases

        # TODO retry input image description extraction x times while the response has elements unequal to the number of design frame URLs
        input_image_descriptions = self.input_image_descriptor.describe_input_images(
            planning_request.request_id, planning_request.design_frame_urls or []
        )
        orionis_log(
            f"\n\nExtracted {len(input_image_descriptions)} input image descriptions for the product {planning_request.product_id}\n\n"
        )

        features = self.feature_extractor.extract_features(
            planning_request, input_image_descriptions
        )

        for feature in features:
            for functionality in feature.functionalities:
                assembled_smoke_tests = self._plan_smoke_test_cases_for_functionality(
                    functionality,
                    feature.feature_name,
                    planning_request,
                    input_image_descriptions,
                )
                raw_test_cases = self._store_smoke_test_cases(
                    assembled_smoke_tests,
                    product_id=planning_request.product_id,
                    feature_id=feature.feature_id,
                    request_id=planning_request.request_id,
                )
                final_test_cases.extend(raw_test_cases)

        orionis_log("\n\n")
        orionis_log(
            f"Stored {len(final_test_cases)} smoke test cases across {len(features)} features for the product {planning_request.product_id}"
        )
        orionis_log("\n\n")

        return final_test_cases

    def _plan_smoke_test_cases_for_functionality(
        self,
        functionality: FunctionalityEntity,
        feature_name: str,
        planning_request: TestCasePlanningRequest,
        input_image_descriptions: List[InputImageDescriptionResponseSchema],
    ) -> List[AssembledSmokeTest]:

        functionality_dict: dict[str, Any] = {}
        functionality_dict["feature_name"] = feature_name
        functionality_dict["functionality_name"] = functionality.functionality_name
        functionality_dict["interactions"] = functionality.interactions

        functionality_design_frame_urls_set = set()  # to ensure uniqueness of urls
        # TODO Construct a subset of input image descriptions for the functionality to include in the prompt
        for url in functionality.design_frame_urls:
            functionality_design_frame_urls_set.add(url)
        for screen in functionality.screens:
            for url in screen.design_frame_urls:
                functionality_design_frame_urls_set.add(url)

        functionality_design_frame_urls = list(functionality_design_frame_urls_set)
        # TODO sort the design frame URLs based on their indices in the original design frame URLs in the planning request

        # Create a subset of input image descriptions based on functionality's design frame URLs
        functionality_input_image_descriptions = (
            self._get_input_image_descriptions_for_functionality(
                input_image_descriptions,
                planning_request,
                functionality_design_frame_urls,
            )
        )

        functionality_input_image_descriptions_map = {
            description.image_index: description.description
            for description in functionality_input_image_descriptions
        }
        functionality_input_image_descriptions_string = json.dumps(
            functionality_input_image_descriptions_map, indent=2
        )

        orionis_log("======================================================\n\n")
        orionis_log(
            f"Planning smoke tests for {functionality.functionality_name} functionality\n"
        )
        orionis_log(
            f"Functionality design frame URLs: {functionality_design_frame_urls}\n"
        )
        orionis_log(
            f"Functionality input image descriptions: {functionality_input_image_descriptions_string}\n"
        )
        orionis_log("======================================================\n\n")

        prompt = (
            SMOKE_TEST_PLANNING_PROMPT.replace(
                "${functionality}",
                json.dumps(functionality_dict, indent=2),
            )
            .replace(
                "${input_image_descriptions}",
                functionality_input_image_descriptions_string,
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

        self.file_storage.store_file(
            prompt,
            TEST_CASE_PLANNING_BUCKET_NAME,
            (
                f"{planning_request.request_id}/smoke_test_planning/{feature_name}/"
                f"prompt_{functionality.functionality_name}_smoke_test_planning.txt"
            ),
            "text/plain",
        )

        orionis_log(
            f"\n\nCalling LLM for smoke test planning for "
            f"{functionality.functionality_name} functionality with "
            f"{len(functionality_design_frame_urls)} design frame urls\n\n"
        )

        llm_response = self.llm_model.call_llm_v3(
            prompt=prompt,
            image_urls=functionality_design_frame_urls,
            video_urls=planning_request.user_flow_video_urls or [],
            response_schema=smoke_test_cases_response_schema,
        )

        json_data = json.loads(llm_response)
        smoke_test_cases = [
            SmokeTestCaseInferenceResponseSchema.model_validate(item)
            for item in json_data
        ]

        orionis_log("\n\n")
        orionis_log(
            f"Planned {len(smoke_test_cases)} smoke tests for the {feature_name} feature"
        )
        orionis_log("\n\n")

        assembled_smoke_tests = []
        for test_case in smoke_test_cases:
            design_frame_url = functionality_design_frame_urls[
                (
                    min(
                        test_case.design_frame_index,
                        len(functionality_design_frame_urls) - 1,
                    )
                    if test_case.design_frame_index >= 0
                    else 0
                )
            ]

            assembled_smoke_tests.append(
                AssembledSmokeTest(
                    response=test_case,
                    design_frame_url=design_frame_url,
                    functionality_id=functionality.functionality_id,
                )
            )

        return assembled_smoke_tests

    def _store_smoke_test_cases(
        self,
        assembled_smoke_tests: List[AssembledSmokeTest],
        product_id: str,
        feature_id: str,
        request_id: str,
    ) -> List[RawTestCase]:

        raw_test_cases: List[RawTestCase] = []

        for assembled_smoke_test in assembled_smoke_tests:
            test_case = self.test_case_datastore.add_test_case(
                AddTestCaseRequestParams(
                    product_id=product_id,
                    feature_id=feature_id,
                    request_id=request_id,
                    functionality_id=assembled_smoke_test.functionality_id,
                    screenshot_url=assembled_smoke_test.design_frame_url,
                    test_case_type="SMOKE",  # TODO: Add a constant for this
                    preconditions=assembled_smoke_test.response.preconditions,
                    test_case_description=assembled_smoke_test.response.test_case_description,
                    rationale=assembled_smoke_test.response.rationale,
                    test_case_steps=[
                        AddTestCaseStepRequestParams(
                            step_description=step.step_description,
                            expected_results=step.expected_results,
                        )
                        for step in assembled_smoke_test.response.test_case_steps
                    ],
                )
            )
            raw_test_cases.append(test_case)

        return raw_test_cases

    def _get_input_image_descriptions_for_functionality(
        self,
        input_image_descriptions: List[InputImageDescriptionResponseSchema],
        planning_request: TestCasePlanningRequest,
        functionality_design_frame_urls: List[str],
    ) -> List[InputImageDescriptionResponseSchema]:
        # Create a map of index to description for O(1) lookup
        input_image_descriptions_map = {
            desc.image_index: desc for desc in input_image_descriptions
        }

        functionality_input_image_descriptions = []
        if planning_request.design_frame_urls:
            for idx, url in enumerate(functionality_design_frame_urls):
                # Find the index of this URL in the original design frame URLs
                try:
                    original_index = planning_request.design_frame_urls.index(url)
                    if original_index in input_image_descriptions_map:
                        desc = input_image_descriptions_map[original_index]
                        # Create a new description with remapped index
                        remapped_desc = InputImageDescriptionResponseSchema(
                            image_index=idx,
                            description=desc.description,
                        )
                        functionality_input_image_descriptions.append(remapped_desc)
                except ValueError:
                    orionis_log(
                        f"Design frame URL {url} not found in original URLs list, skipping"
                    )

            if len(functionality_input_image_descriptions) != len(
                functionality_design_frame_urls
            ):
                orionis_log(
                    f"Expected {len(functionality_design_frame_urls)} input image descriptions "
                    f"for the functionality, but got {len(functionality_input_image_descriptions)}"
                )

        return functionality_input_image_descriptions

    def _clean_up_previous_request_attempt_data(
        self, planning_request: TestCasePlanningRequest
    ):

        orionis_log(
            f"Cleaning up previous request attempt data for request id {planning_request.request_id}"
        )

        self.test_case_datastore.delete_test_cases_for_request_id(
            planning_request.request_id
        )

        # TODO: Delete previous features for request id

        # TODO: Delete previous functionalities for request id

        # TODO: Delete previous screens for request id

        self.file_storage.delete_directory(
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{planning_request.request_id}",
        )

    def _get_image_indices_from_urls(
        self, screen_design_frame_urls: List[str], all_design_frame_urls: List[str]
    ) -> List[int]:
        image_indices = []

        for url in screen_design_frame_urls:
            try:
                index = all_design_frame_urls.index(url)
                image_indices.append(index)
            except ValueError:
                orionis_log(
                    f"Design frame URL {url} not found in complete URLs list, skipping"
                )

        return image_indices
