from typing import List
from pydantic import BaseModel


class SmokeTestCaseStepInferenceResponseSchema(BaseModel):
    step_description: str
    expected_results: List[str]


class SmokeTestCaseInferenceResponseSchema(BaseModel):
    test_case_description: str
    design_frame_index: int
    preconditions: List[str]
    test_case_steps: List[SmokeTestCaseStepInferenceResponseSchema]
    rationale: str = ""
