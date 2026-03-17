from typing import List
from pydantic import BaseModel


class TestCaseStepInferenceResponseSchema(BaseModel):
    step_description: str
    expected_results: List[str]
    edge_id: str


class TestCaseInferenceResponseSchema(BaseModel):
    title: str
    description: str
    preconditions: List[str]
    test_case_steps: List[TestCaseStepInferenceResponseSchema]
    rationale: str
