from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel
from test_cases.test_case_models import RawTestCase


class TestCasePlanningRequestStatus(str, Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class TestCasePlanningRequestType(str, Enum):
    SMOKE_TEST = "SMOKE_TEST"
    FUNCTIONAL_TEST = "FUNCTIONAL_TEST"
    MAINTAINER_AGENT = "MAINTAINER_AGENT"


class TestCasePlanningRequest(BaseModel):
    request_id: str
    requestor_user_id: str
    product_id: str
    request_type: TestCasePlanningRequestType
    feature_id: str | None
    new_feature_name: str | None
    design_frame_urls: List[str] | None
    user_flow_video_urls: List[str] | None
    input_test_cases: List[str] | None
    acceptance_criteria: str | None
    status: TestCasePlanningRequestStatus
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    test_run_id: Optional[str] = None
    product_name: Optional[str] = None
    executable_url: Optional[str] = None
    monkey_run_output: Optional[str] = None
    knowledge_graph_version: Optional[str] = None
    flow_version: Optional[str] = None


class UpdateTestCasePlanningRequestParams(BaseModel):
    request_id: str
    product_id: Optional[str] = None
    requestor_user_id: Optional[str] = None
    status: Optional[TestCasePlanningRequestStatus] = None
    feature_id: Optional[str] = None
    new_feature_name: Optional[str] = None
    design_frame_urls: Optional[List[str]] = None
    user_flow_video_urls: Optional[List[str]] = None
    input_test_cases: Optional[List[str]] = None
    acceptance_criteria: Optional[str] = None
    completed_at: Optional[datetime] = None
    test_run_id: Optional[str] = None
    product_name: Optional[str] = None
    executable_url: Optional[str] = None
    monkey_run_output: Optional[str] = None
    knowledge_graph_version: Optional[str] = None
    flow_version: Optional[str] = None


class RequestSmokeTestPlanParams(BaseModel):
    product_id: str
    feature_id: Optional[str] = None
    new_feature_name: Optional[str] = None
    design_frame_urls: List[str] | None
    user_flow_video_urls: List[str] | None
    input_test_cases: List[str] | None
    acceptance_criteria: str | None
    test_run_id: Optional[str] = None
    product_name: Optional[str] = None
    executable_url: Optional[str] = None
    monkey_run_output: Optional[str] = None
    knowledge_graph_version: Optional[str] = None
    flow_version: Optional[str] = None


class RequestMaintainerAgentParams(BaseModel):
    product_id: str
    execution_video_url: str
    knowledge_graph_version: Optional[str] = None
    flow_version: Optional[str] = None
    request_id: Optional[str] = None
    feature_id: Optional[str] = None
    flow_name: Optional[str] = None


class MergeGeneratedGraphParams(BaseModel):
    product_id: str
    request_id: str
    generated_graph_path: Optional[str] = None
    y_offset: Optional[int] = None


class TestCaseUnderExecutionMetadata(BaseModel):
    test_case: Optional[str] = None
    tcue_id: Optional[str] = None
    test_case_id: Optional[str] = None
    kg_version: Optional[str] = None
    precon_flow_ids: Optional[List[str]] = None
    credentials_value: Optional[List[dict[str, str]]] = None


class NovaExecutionParams(BaseModel):
    test_run_id: Optional[str] = None
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    executable_url: Optional[str] = None
    test_case_reference: List[TestCaseUnderExecutionMetadata] = []
    mode: str
    monkey_run_output: Optional[str] = None
    EXPECTED_APP_BEHAVIOUR: Optional[str] = None
    WHEN_TO_USE_WHICH_UI_ELEMENT: Optional[str] = None
    environment: Optional[str] = None
    platform: Optional[str] = None
    text_based_goal: Optional[str] = None


class NovaExecutionRequest(BaseModel):
    nova_execution_params: NovaExecutionParams


class TestCaseGroup(BaseModel):
    test_cases: List[RawTestCase]
    tcue_ids: List[str]
