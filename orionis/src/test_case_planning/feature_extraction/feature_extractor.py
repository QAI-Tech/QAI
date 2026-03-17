import json
from typing import List

from pydantic import BaseModel
from common.google_cloud_wrappers import GCPFileStorageWrapper
from llm_model import LLMModelWrapper
from products.product_datastore import ProductDatastore
from products.product_models import (
    AddScreenRequestParams,
    ScreenEntity,
    AddFunctionalityRequestParamsDeprecated,
    ProductFeatureEntityDeprecated,
    FunctionalityEntity,
)
from test_case_planning.feature_extraction.functionality_extractor import (
    FunctionalityExtractor,
)
from test_case_planning.feature_extraction.inference_response_models_v2 import (
    FeatureInferenceResponseFromFramesSchema,
    FunctionalityInferenceFromFramesResponseSchema,
    InputImageDescriptionResponseSchema,
    ScreenInferenceResponseFromFramesSchema,
)

from test_case_planning.feature_extraction.prompts import (
    GROUP_FUNCTIONALITY_BY_FEATURE_FROM_FRAMES_PROMPT,
)
from test_case_planning.feature_extraction.screen_extractor import ScreenExtractor
from test_case_planning.test_case_planning_constants import (
    TEST_CASE_PLANNING_BUCKET_NAME,
)
from test_case_planning.test_case_planning_models import TestCasePlanningRequest
from utils.util import orionis_log, serialize, uri_to_url

from test_case_planning.feature_extraction.json_response_schemas import (
    group_functionalities_into_features_response_schema,
)
from features.feature_datastore import FeatureDatastore
from features.feature_models import AddFeatureRequestParams


class AssembledFunctionality(BaseModel):
    functionality_name: str
    interactions: List[str]
    design_frame_urls: List[str]
    screen_ids: List[str]


class AssembledFeature(BaseModel):
    feature_id: str
    feature_name: str
    functionalities: List[AssembledFunctionality]


class FeatureExtractor:

    NEW_FEATURE_ID_PREFIX = "new_feature_"

    def __init__(
        self,
        llm_model: LLMModelWrapper,
        product_datastore: ProductDatastore,
        functionality_extractor: FunctionalityExtractor,
        screen_extractor: ScreenExtractor,
        file_storage: GCPFileStorageWrapper,
    ):
        self.llm_model = llm_model
        self.product_datastore = product_datastore
        self.functionality_extractor = functionality_extractor
        self.screen_extractor = screen_extractor
        self.file_storage = file_storage
        self.feature_datastore = FeatureDatastore()

    def extract_features(
        self,
        planning_request: TestCasePlanningRequest,
        input_image_descriptions: List[InputImageDescriptionResponseSchema],
    ) -> List[ProductFeatureEntityDeprecated]:

        # TODO provide existing functionalities to the functionality extractor
        # TODO handle planning_request.feature_id

        extracted_functionalities = (
            self.functionality_extractor.extract_functionalities(
                planning_request,
                [],
                input_image_descriptions,
            )
        )

        orionis_log(
            f"\n\nExtracted {len(extracted_functionalities)} functionalities for the product {planning_request.product_id}\n\n"
        )

        new_feature_name = planning_request.new_feature_name

        # TODO provide existing features for feature grouping
        features: List[FeatureInferenceResponseFromFramesSchema] = []
        if new_feature_name:
            rationale = (
                "Bypassing dyanmic feature grouping as a feature name "
                f"{new_feature_name} was provided, grouping all functionalities into this new feature"
            )
            orionis_log(f"\n\n{rationale}\n\n")
            features.append(
                FeatureInferenceResponseFromFramesSchema(
                    feature_id=self.NEW_FEATURE_ID_PREFIX + new_feature_name,
                    feature_name=new_feature_name,
                    functionality_ids=[
                        functionality.functionality_id
                        for functionality in extracted_functionalities
                    ],
                    rationale=rationale,
                )
            )
        else:
            features = self._group_functionalities_by_feature(
                extracted_functionalities, [], planning_request
            )

        screens = self.screen_extractor.extract_screens(
            planning_request.request_id,
            planning_request.design_frame_urls or [],
            input_image_descriptions,
        )

        screen_entities: List[ScreenEntity] = []
        for screen in screens:
            stored_screen = self._store_screen(screen, planning_request)
            screen_entities.append(stored_screen)

        assembled_features = self._assign_screens_to_functionalities(
            extracted_functionalities, features, screen_entities, planning_request
        )

        self.file_storage.store_file(
            serialize(assembled_features),
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{planning_request.request_id}/feature_grouping/assembled_features.json",
            "application/json",
        )

        product_features: List[ProductFeatureEntityDeprecated] = []
        for feature in assembled_features:
            product_feature = self._store_product_feature(
                feature, planning_request.product_id
            )
            product_features.append(product_feature)

        return product_features

    def _group_functionalities_by_feature(
        self,
        functionalities: List[FunctionalityInferenceFromFramesResponseSchema],
        existing_features: List[ProductFeatureEntityDeprecated],
        planning_request: TestCasePlanningRequest,
    ) -> List[FeatureInferenceResponseFromFramesSchema]:

        functionalities_str = "\n".join(
            [
                json.dumps(functionality.model_dump(), indent=2)
                for functionality in functionalities
            ]
        )

        existing_features_str = "\n".join(
            [
                json.dumps(feature.model_dump(mode="json"), indent=2)
                for feature in existing_features
            ]
        )

        prompt = (
            GROUP_FUNCTIONALITY_BY_FEATURE_FROM_FRAMES_PROMPT.replace(
                "${functionalities_list}", functionalities_str
            )
            .replace("${existing_features_list}", existing_features_str)
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

        orionis_log(
            f"\n\nCalling LLM for grouping {len(functionalities)} functionalities into features"
        )

        self.file_storage.store_file(
            prompt,
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{planning_request.request_id}/feature_grouping/prompt_group_functionalities_into_features.txt",
            "text/plain",
        )

        llm_response = self.llm_model.call_llm_v3(
            prompt=prompt,
            image_urls=planning_request.design_frame_urls or [],
            response_schema=group_functionalities_into_features_response_schema,
        )

        self.file_storage.store_file(
            llm_response,
            TEST_CASE_PLANNING_BUCKET_NAME,
            f"{planning_request.request_id}/feature_grouping/response_group_functionalities_into_features.json",
            "application/json",
        )

        json_data = json.loads(llm_response)
        features = [
            FeatureInferenceResponseFromFramesSchema.model_validate(item)
            for item in json_data
        ]

        orionis_log(
            f"\n\nGrouped {len(functionalities)} functionalities into {len(features)} features for the product {planning_request.product_id}\n\n"
        )

        return features

    def _assign_screens_to_functionalities(
        self,
        functionalities: List[FunctionalityInferenceFromFramesResponseSchema],
        features: List[FeatureInferenceResponseFromFramesSchema],
        screens_entities: List[ScreenEntity],
        planning_request: TestCasePlanningRequest,
    ) -> List[AssembledFeature]:

        functionalities_map = {
            functionality.functionality_id: functionality
            for functionality in functionalities
        }

        assembled_features: List[AssembledFeature] = []

        for feature in features:
            feature_functionalities = [
                functionalities_map[functionality_id]
                for functionality_id in feature.functionality_ids
            ]

            orionis_log(
                f"\n\nGrouping {len(feature_functionalities)} functionalities into feature {feature.feature_name}\n\n"
            )

            assembled_functionalities: List[AssembledFunctionality] = []
            for functionality in feature_functionalities:

                screen_ids: List[str] = []
                for screen in screens_entities:
                    # Check if any of the functionality's design_frame_urls overlaps with the screen's design_frame_urls
                    functionality_design_frame_urls = (
                        self._transform_indices_to_frame_urls(
                            functionality.depicted_in_images_indices,
                            planning_request.design_frame_urls or [],
                        )
                    )

                    if any(
                        img_idx in screen.design_frame_urls
                        for img_idx in functionality_design_frame_urls
                    ):
                        screen_ids.append(screen.screen_id)

                if len(screen_ids) == 0:
                    orionis_log(
                        f"\n\nWarning: No screens were assigned to functionality {functionality.functionality_name}\n\n"
                    )

                assembled_functionalities.append(
                    AssembledFunctionality(
                        functionality_name=functionality.functionality_name,
                        interactions=functionality.interactions,
                        design_frame_urls=functionality_design_frame_urls,
                        screen_ids=screen_ids,
                    )
                )

            assembled_feature = AssembledFeature(
                feature_id=feature.feature_id,
                feature_name=feature.feature_name,
                functionalities=assembled_functionalities,
            )
            assembled_features.append(assembled_feature)

        return assembled_features

    def _store_product_feature(
        self, feature: AssembledFeature, product_id: str
    ) -> ProductFeatureEntityDeprecated:

        add_feature_request = AddFeatureRequestParams(
            product_id=product_id,
            name=feature.feature_name,
            description="",  # Since the original didn't have description
        )

        added_feature = self.feature_datastore.add_feature(add_feature_request)

        for assembled_functionality in feature.functionalities:
            self._store_functionality(
                assembled_functionality, product_id, added_feature.id
            )

        return self.product_datastore.get_product_feature_deprecated(added_feature.id)

    def _store_functionality(
        self,
        functionality: AssembledFunctionality,
        product_id: str,
        feature_id: str,
    ) -> FunctionalityEntity:

        add_functionality_request = AddFunctionalityRequestParamsDeprecated(
            product_id=product_id,
            functionality_name=functionality.functionality_name,
            feature_id=feature_id,
            interactions=functionality.interactions,
            design_frame_urls=functionality.design_frame_urls,
            screen_ids=functionality.screen_ids,
        )

        return self.product_datastore.add_functionality(add_functionality_request)

    def _store_screen(
        self,
        screen: ScreenInferenceResponseFromFramesSchema,
        planning_request: TestCasePlanningRequest,
    ) -> ScreenEntity:

        add_screen_request = AddScreenRequestParams(
            product_id=planning_request.product_id,
            screen_name=screen.screen_name,
            design_frame_urls=self._transform_indices_to_frame_urls(
                screen.depicted_in_image_indices,
                planning_request.design_frame_urls or [],
            ),
        )

        return self.product_datastore.add_screen(add_screen_request)

    def _transform_indices_to_frame_urls(
        self,
        indices: List[int],
        design_frame_urls: List[str],
    ) -> List[str]:
        return [
            uri_to_url(design_frame_urls[idx])
            for idx in indices
            if design_frame_urls and idx < len(design_frame_urls)
        ]
