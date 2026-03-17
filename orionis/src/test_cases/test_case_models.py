from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from enum import Enum


class ReviewResult(Enum):
    ACCURATE = "ACCURATE"
    INACCURATE = "INACCURATE"


class ReviewStatus(Enum):
    QUEUED = "QUEUED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"


class TestCaseStatus(Enum):
    RAW = "RAW"
    VERIFIED = "VERIFIED"
    UNVERIFIED = "UNVERIFIED"


class TestCaseCriticality(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class RawTestCaseStep(BaseModel):
    test_step_id: str
    step_description: str
    expected_results: List[str]
    type: Optional[str] = None
    http_method: Optional[str] = None
    url: Optional[str] = None
    request_body: Optional[str] = None
    headers: Optional[str] = None
    edge_id: Optional[str] = None


class TestCaseParameter(BaseModel):
    parameter_name: str
    parameter_value: str


class AddParametersToTestCaseRequestParams(BaseModel):
    test_case_id: str
    parameters: List[TestCaseParameter]


class Scenario(BaseModel):
    id: str
    description: str
    params: List[TestCaseParameter] | None = None


class TestCaseMetadata(BaseModel):
    video_url: str | None = None
    screens_list_url: str | None = None


class MirroredTestCase(BaseModel):
    test_case_id: str
    product_id: str
    product_name: str


class RawTestCase(BaseModel):
    test_case_id: str
    feature_id: str | None = None
    product_id: str | None = None
    functionality_id: str | None = None
    request_id: str | None = None
    title: str = ""
    screenshot_url: str
    preconditions: List[str]
    test_case_description: str
    test_case_steps: List[RawTestCaseStep]
    test_case_type: str
    rationale: str = ""
    created_at: datetime
    status: TestCaseStatus = TestCaseStatus.RAW
    review_status: ReviewStatus | None = None
    review_result: ReviewResult | None = None
    sort_index: Optional[float] = None
    credentials: Optional[List[str]] = None
    parameters: Optional[List[TestCaseParameter]] = None
    comments: str | None = None
    criticality: TestCaseCriticality = TestCaseCriticality.HIGH
    scenarios: Optional[List[Scenario]] = None
    metadata: str | None = None
    precondition_test_case_id: str | None = None
    created_by: str | None = None
    flow_id: str | None = None
    mirrored_test_cases: Optional[List[MirroredTestCase]] = None


class UpdateTestCaseRequestParams(BaseModel):
    test_case_id: str
    feature_id: str | None = None
    product_id: str | None = None
    functionality_id: str | None = None
    request_id: str | None = None
    title: str | None = None
    screenshot_url: str | None = None
    preconditions: List[str] | None = None
    test_case_description: str | None = None
    test_case_steps: List[RawTestCaseStep] | None = None
    test_case_type: str | None = None
    rationale: str = ""
    created_at: datetime | None = None
    status: TestCaseStatus = TestCaseStatus.RAW
    review_status: ReviewStatus | None = None
    review_result: ReviewResult | None = None
    sort_index: Optional[float] = None
    credentials: Optional[List[str]] = None
    parameters: Optional[List[TestCaseParameter]] = None
    comments: str | None = None
    criticality: TestCaseCriticality = TestCaseCriticality.HIGH
    scenarios: Optional[List[Scenario]] = None
    precondition_test_case_id: str | None = None
    mirrored_test_cases: Optional[List[MirroredTestCase]] = None
    new_test_case_to_link: MirroredTestCase | None = None
    metadata: str | None = None


class AddTestCaseStepRequestParams(BaseModel):
    step_description: str
    expected_results: List[str]
    type: Optional[str] = None
    http_method: Optional[str] = None
    url: Optional[str] = None
    request_body: Optional[str] = None
    headers: Optional[str] = None
    edge_id: Optional[str] = None


class AddTestCaseRequestParams(BaseModel):
    feature_id: str | None = None
    product_id: str
    functionality_id: str | None = None
    request_id: str | None = None
    title: str = ""
    screenshot_url: str
    test_case_type: str
    preconditions: List[str]
    test_case_description: str
    test_case_steps: List[AddTestCaseStepRequestParams]
    rationale: str = ""
    status: TestCaseStatus = TestCaseStatus.RAW
    criticality: TestCaseCriticality = TestCaseCriticality.HIGH
    scenarios: Optional[List[Scenario]] = None
    precondition_test_case_id: str | None = None
    created_by: str | None = None
    flow_id: str | None = None
    credentials: Optional[List[str]] = None
    mirrored_test_cases: Optional[List[MirroredTestCase]] = None
    metadata: str | None = None
    comments: str | None = None


class TestCaseInputModel(BaseModel):
    test_case_id: str
    sort_index: Optional[float] = None


class ReorderTestCaseRequestModel(BaseModel):
    test_case_changed: str
    test_cases: List[TestCaseInputModel]


class ReorderTestCaseResponse(BaseModel):
    success: bool
    test_case_id: str
    new_sort_index: float


class CopyTestCaseRequestParams(BaseModel):
    from_product_id: str
    to_product_id: str
    test_case_ids: List[str]
    should_establish_test_case_links: bool = False


class UpdateMirroredTestCasesRequestParams(BaseModel):
    test_case_id: str
    update_test_case_params: UpdateTestCaseRequestParams
