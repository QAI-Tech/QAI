import json
from typing import List

from common.google_cloud_wrappers import GCPFileStorageWrapper
from llm_model import LLMModelWrapper

from test_case_planning.app_video_analysis.inference_response_models import (
    TestCaseInferenceResponseSchema,
    TranscribedScreenFromVideoInferenceResponseSchema,
    TranscribedInteractionInferenceResponseSchema,
)
from test_case_planning.app_video_analysis.prompts import (
    TRANSCRIBE_INTERACTIONS_FROM_VIDEO_PROMPT,
    FORMULATE_TEST_CASES_FROM_VIDEO_V0,
    TRANSCRIBE_SCREENS_FROM_VIDEO_PROMPT,
)
from test_case_planning.test_case_planning_constants import (
    TEST_CASE_PLANNING_BUCKET_NAME,
)

from test_case_planning.app_video_analysis.json_response_schemas import (
    screens_from_video_response_schema,
    interactions_from_video_response_schema,
    test_cases_from_video_response_schema,
)
from test_cases.test_case_datastore import TestCaseDatastore
from test_cases.test_case_models import (
    AddTestCaseRequestParams,
    AddTestCaseStepRequestParams,
    RawTestCase,
)
from utils.util import (
    orionis_log,
    serialize,
    uri_to_url,
)


class AppVideoAnalyzer:

    def __init__(
        self,
        llm_model: LLMModelWrapper,
        file_storage: GCPFileStorageWrapper,
        test_case_datastore: TestCaseDatastore,
    ):
        self.llm_model = llm_model
        self.file_storage = file_storage
        self.test_case_datastore = test_case_datastore

    def extract_test_cases_from_video(
        self,
        request_id: str,
        product_id: str,
        new_feature_name: str | None,
        video_url: str,
        product_description: str = "",
    ) -> List[RawTestCase]:

        raw_test_cases: List[RawTestCase] = []

        transcribed_interactions = self._transcribe_interactions_from_video(
            request_id, video_url
        )

        transcribed_screens = self._transcribe_screens_from_video(
            request_id, video_url, product_description, transcribed_interactions
        )

        extracted_test_cases = self._formulate_test_cases_from_video(
            request_id, video_url, transcribed_interactions, product_description
        )

        raw_test_cases = self._store_test_cases(
            request_id, product_id, video_url, extracted_test_cases, transcribed_screens
        )

        orionis_log(
            f"\n\nExtracted {len(raw_test_cases)} test cases from video with url: {video_url}\n\n"
        )

        return raw_test_cases

    def _transcribe_interactions_from_video(
        self, request_id: str, video_url: str
    ) -> List[TranscribedInteractionInferenceResponseSchema]:

        prompt = TRANSCRIBE_INTERACTIONS_FROM_VIDEO_PROMPT

        orionis_log(
            f"\n\nCalling LLM for transcribing interactions from video with url: {video_url}\n\n"
        )

        self.file_storage.store_file(
            prompt,
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{request_id}/usage_video_analysis/prompt_transcribe_interactions_from_video.txt",
            "text/plain",
        )

        llm_response = self.llm_model.call_llm_v3(
            prompt=prompt,
            video_urls=[video_url],
            response_schema=interactions_from_video_response_schema,
        )

        self.file_storage.store_file(
            llm_response,
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{request_id}/usage_video_analysis/response_transcribe_interactions_from_video.json",
            "application/json",
        )

        json_data = json.loads(llm_response)
        transcribed_interactions = [
            TranscribedInteractionInferenceResponseSchema.model_validate(item)
            for item in json_data
        ]

        orionis_log(
            f"\n\nTranscribed {len(transcribed_interactions)} interactions from video with url: {video_url}\n\n"
        )

        return transcribed_interactions

    def _transcribe_screens_from_video(
        self,
        request_id: str,
        video_url: str,
        product_description: str,
        detected_interactions: List[TranscribedInteractionInferenceResponseSchema],
    ) -> List[TranscribedScreenFromVideoInferenceResponseSchema]:

        prompt = TRANSCRIBE_SCREENS_FROM_VIDEO_PROMPT.replace(
            "${product_description}", product_description
        ).replace(
            "${detected_interactions}",
            serialize(detected_interactions),
        )

        orionis_log(
            f"\n\nCalling LLM for transcribing screens from video with url: {video_url}\n\n"
        )

        self.file_storage.store_file(
            prompt,
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{request_id}/usage_video_analysis/prompt_transcribe_screens_from_video.txt",
            "text/plain",
        )

        llm_response = self.llm_model.call_llm_v3(
            prompt=prompt,
            video_urls=[video_url],
            response_schema=screens_from_video_response_schema,
        )

        self.file_storage.store_file(
            llm_response,
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{request_id}/usage_video_analysis/response_transcribe_screens_from_video.json",
            "application/json",
        )

        json_data = json.loads(llm_response)
        transcribed_screens = [
            TranscribedScreenFromVideoInferenceResponseSchema.model_validate(item)
            for item in json_data
        ]
        return transcribed_screens

    def _formulate_test_cases_from_video(
        self,
        request_id: str,
        video_url: str,
        transcribed_interactions: List[TranscribedInteractionInferenceResponseSchema],
        product_description: str,
    ) -> List[TestCaseInferenceResponseSchema]:

        prompt = FORMULATE_TEST_CASES_FROM_VIDEO_V0.replace(
            "${product_description}", product_description
        ).replace(
            "${transcribed_interactions}",
            serialize(transcribed_interactions),
        )

        orionis_log(
            f"\n\nCalling LLM for formulating test cases from video with url: {video_url}\n\n"
        )

        self.file_storage.store_file(
            prompt,
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{request_id}/usage_video_analysis/prompt_formulate_test_cases_from_video.txt",
            "text/plain",
        )

        llm_response = self.llm_model.call_llm_v3(
            prompt=prompt,
            video_urls=[video_url],
            response_schema=test_cases_from_video_response_schema,
        )

        self.file_storage.store_file(
            llm_response,
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{request_id}/usage_video_analysis/response_formulate_test_cases_from_video.json",
            "application/json",
        )

        json_data = json.loads(llm_response)
        test_cases = [
            TestCaseInferenceResponseSchema.model_validate(item) for item in json_data
        ]

        orionis_log(
            f"\n\nFormulated {len(test_cases)} test cases from video with url: {video_url}\n\n"
        )

        return test_cases

    def _store_test_cases(
        self,
        request_id: str,
        product_id: str,
        video_url: str,
        extracted_test_cases: List[TestCaseInferenceResponseSchema],
        transcribed_screens: List[TranscribedScreenFromVideoInferenceResponseSchema],
    ) -> List[RawTestCase]:

        raw_test_cases: List[RawTestCase] = []

        for test_case in extracted_test_cases:

            new_test_case_params = AddTestCaseRequestParams(
                product_id=product_id,
                request_id=request_id,
                title=test_case.title,
                screenshot_url="",
                test_case_type="SMOKE",
                preconditions=test_case.preconditions,
                test_case_description=test_case.description,
                test_case_steps=[
                    AddTestCaseStepRequestParams(
                        step_description=step.step_description,
                        expected_results=step.expected_results,
                    )
                    for step in test_case.test_case_steps
                ],
                rationale=test_case.rationale,
            )

            screens_uri = self.file_storage.store_file(
                serialize(transcribed_screens),
                TEST_CASE_PLANNING_BUCKET_NAME,
                f"{request_id}/usage_video_analysis/screens_list.json",
                "application/json",
            )

            metadata = {
                "video_url": video_url,
                "screens_list_url": uri_to_url(screens_uri),
            }

            raw_test_case = self.test_case_datastore.add_test_case(
                new_test_case_params, json.dumps(metadata)
            )
            raw_test_cases.append(raw_test_case)

        return raw_test_cases
