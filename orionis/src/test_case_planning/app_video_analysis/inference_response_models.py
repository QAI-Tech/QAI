from typing import List
from pydantic import BaseModel


class TranscribedInteractionInferenceResponseSchema(BaseModel):
    description: str
    observed_results: List[str]
    start_timestamp: str
    end_timestamp: str
    rationale: str


class TranscribedScreenFromVideoInferenceResponseSchema(BaseModel):
    id: str
    title: str
    description: str
    routes_to: List[str]
    appears_at_timestamp: List[str]
    rationale: str


class TestCaseStepInferenceResponseSchema(BaseModel):
    step_description: str
    expected_results: List[str]


class TestCaseInferenceResponseSchema(BaseModel):
    title: str
    description: str
    preconditions: List[str]
    test_case_steps: List[TestCaseStepInferenceResponseSchema]
    rationale: str
