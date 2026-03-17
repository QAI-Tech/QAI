from typing import List
from pydantic import BaseModel


class InputImageDescriptionResponseSchema(BaseModel):
    image_index: int
    description: str


class BaseFunctionalityInferenceFromFramesResponseSchema(BaseModel):
    functionality_id: str
    functionality_name: str
    interactions: List[str]
    rationale: str


class FunctionalityInferenceFromFramesResponseSchema(
    BaseFunctionalityInferenceFromFramesResponseSchema
):
    depicted_in_images_indices: List[int]
    image_association_rationale: str
    confidence_score: int


class CorrectionFromFramesResponseSchema(BaseModel):
    field: str
    correction_rationale: str
    confidence_score: int


class CorrectedBaseFunctionalityFromFramesResponseSchema(BaseModel):
    functionality: BaseFunctionalityInferenceFromFramesResponseSchema
    corrections: List[CorrectionFromFramesResponseSchema]


class FeatureInferenceResponseFromFramesSchema(BaseModel):
    feature_id: str
    feature_name: str
    functionality_ids: List[str]
    rationale: str


class ScreenInferenceResponseFromFramesSchema(BaseModel):
    screen_name: str
    depicted_in_image_indices: List[int]
    rationale: str
