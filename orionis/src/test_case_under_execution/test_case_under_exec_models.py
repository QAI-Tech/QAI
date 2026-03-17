from typing import List, Optional, Dict
from pydantic import BaseModel
from datetime import datetime
from enum import Enum
from purchases.purchase_models import Purchase
from test_cases.test_case_models import TestCaseCriticality
from test_cases.test_case_models import RawTestCaseStep


class ExecutionStatus(str, Enum):
    UNTESTED = "UNTESTED"
    EXECUTING = "EXECUTING"
    PASSED = "PASSED"
    FAILED = "FAILED"
    ATTEMPT_FAILED = "ATTEMPT_FAILED"
    SKIPPED = "SKIPPED"
    RETRYING = "RETRYING"


class TestCaseStepStatus(str, Enum):
    COMPLETE = "COMPLETE"
    INCOMPLETE = "INCOMPLETE"


class TestCaseStep(RawTestCaseStep):
    status: TestCaseStepStatus = TestCaseStepStatus.INCOMPLETE


class TestCaseUnderExecution(BaseModel):
    id: str
    test_case_id: str
    test_run_id: str
    product_id: str
    feature_id: str | None = None
    functionality_id: str
    request_id: str
    assignee_user_id: str | None = None
    status: ExecutionStatus
    notes: str
    rationale: str
    screenshot_url: str
    execution_video_url: str
    title: str = ""
    test_case_description: str
    test_case_steps: List[TestCaseStep]
    test_case_type: str
    preconditions: List[str]
    comments: str | None = None
    created_at: datetime
    updated_at: datetime
    execution_started_at: datetime
    execution_completed_at: datetime
    test_case_created_at: datetime
    criticality: TestCaseCriticality = TestCaseCriticality.HIGH
    metadata: str | None = None
    annotations: List[str] | None = None
    flow_id: str | None = None
    scenario_parameters: Dict[str, str] | None = None
    credentials: List[str] | None = None


class UpdateTestCaseUnderExecutionParams(BaseModel):
    test_case_under_execution_id: str
    test_case_id: Optional[str] = None
    feature_id: str | None = None
    status: ExecutionStatus | None = None
    execution_video_url: str | None = None
    notes: str | None = None
    test_case_steps: List[TestCaseStep] | None = None
    test_case_description: str | None = None
    preconditions: List[str] | None = None
    comments: str | None = None
    screenshot_url: str | None = None
    criticality: TestCaseCriticality = TestCaseCriticality.HIGH
    metadata: str | None = None
    is_synced: Optional[bool] = False
    annotations: List[str] | None = None
    assignee_user_id: str | None = None
    scenario_parameters: Dict[str, str] | None = None
    flow_id: str | None = None
    title: str | None = None
    credentials: List[str] | None = None


class TestCaseData(BaseModel):
    test_case_description: Optional[str] = None
    step_description: Optional[str] = None
    expected_results: Optional[List[str]] = None
    preconditions: Optional[List[str]] = None


class StepVerifierResponse(BaseModel):
    status: Optional[bool] = None
    rationale: Optional[str] = None


class AnomalyDetectorResponse(BaseModel):
    status: Optional[bool] = None
    rationale: Optional[str] = None


class UpdateNovaExecutionData(BaseModel):
    test_case_id: int
    test_case_under_execution_id: int
    test_run_id: int
    product_id: int
    test_case: Optional[TestCaseData] = None
    step_verifier_response: Optional[StepVerifierResponse] = None
    anomaly_detector_response: Optional[AnomalyDetectorResponse] = None
    backtracker_status: str | None = None
    status: ExecutionStatus
    before_ss_url: Optional[str] = None
    after_ss_url: Optional[str] = None
    execution_video_url: Optional[str] = None
    comments: str | None = None
    explanation: str | None = None


class DeleteTestCaseUnderExecutionFromTestRunParams(BaseModel):
    test_case_under_execution_ids: List[str]


class GetUsageDataParams(BaseModel):
    organisation_id: str


class DailyUsageData(BaseModel):
    date: str
    usage: List[int]  # List of TCUE counts per TestRun for this date


class MonthlyUsageData(BaseModel):
    month: str
    year: int
    daily_usage: List[DailyUsageData]


# Type alias: maps product_id to list of monthly usage data
ProductUsageMap = Dict[str, List[MonthlyUsageData]]


class ProductUsageData(BaseModel):
    product_id: str
    product_name: str
    monthly_usage: List[MonthlyUsageData]


class UsageDataResponse(BaseModel):
    status: str
    message: str
    data: List[ProductUsageData]
    qubit_balance: int
    stripe_customer_id: Optional[str] = None
    auto_reload_enabled: bool = False
    auto_reload_threshold: int = 5
    auto_reload_amount: int = 100
    purchase_history: List[Purchase] = []


class CopyTestCaseUnderExecutionForProductRequestParams(BaseModel):
    from_product_id: str
    to_product_id: str
    test_case_under_execution_ids: List[str]
    to_test_run_id: Optional[str] = None


class CreateTestCaseUnderExecutionParams(BaseModel):
    test_case_id: str
    test_run_id: str
    title: str = ""
    product_id: str
    feature_id: str | None = None
    functionality_id: str
    request_id: str
    assignee_user_id: str | None = None
    status: ExecutionStatus
    notes: str
    rationale: str
    screenshot_url: str
    execution_video_url: str
    test_case_description: str
    test_case_steps: List[TestCaseStep]
    test_case_type: str
    preconditions: List[str]
    comments: str | None = None
    criticality: TestCaseCriticality = TestCaseCriticality.HIGH
    metadata: str | None = None
    annotations: List[str] | None = None
    scenario_parameters: Dict[str, str] | None = None
    flow_id: str | None = None


class AssignTcueToUsersParams(BaseModel):
    test_case_under_execution_ids: List[str]
    assignee_user_id: str
