from typing import Optional, Dict
from pydantic import BaseModel
from datetime import datetime
from enum import Enum


class TestRunStatus(str, Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    CANCELED = "CANCELED"
    ABANDONED = "ABANDONED"


class TestRunType(str, Enum):
    FUNCTIONAL = "functional"
    UI_REVIEW = "ui-review"
    UX_REVIEW = "ux-review"
    EXPLORATORY = "exploratory"
    AB_TESTING = "ab-testing"


class TestRun(BaseModel):
    test_run_id: str
    product_id: str
    created_by_user_id: str
    test_run_name: str
    status: TestRunStatus = TestRunStatus.PROCESSING
    created_at: datetime
    updated_at: datetime
    test_build_id: str
    acceptance_criteria: str
    device_name: Optional[str] = None
    build_number: Optional[str] = None
    test_run_type: Optional[TestRunType] = None
    tcue_count: Optional[int] = None
    status_counts: Optional[Dict[str, int]] = None


class UpdateTestRunParams(BaseModel):
    test_run_id: str
    product_id: Optional[str] = None
    test_run_name: Optional[str] = None
    status: Optional[TestRunStatus] = None
    test_case_id: Optional[list[str]] = None
    test_build_id: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    build_number: Optional[str] = None
    device_name: Optional[str] = None
    test_run_type: Optional[TestRunType] = None


class AddTestRunParams(BaseModel):
    product_id: str
    test_run_name: str
    executable_url: Optional[str] = None
    test_case_ids: Optional[list[str]] = None
    acceptance_criteria: Optional[str] = None
    device_ids: Optional[str] = None
    build_number: Optional[str] = None
    send_to_nova: bool = False
    test_run_type: Optional[TestRunType] = None


class TestRunUpdateResult(BaseModel):
    test_run_id: str
    test_case_under_execution_ids: list[str]


class AddTestRunFromFlowsParams(BaseModel):
    product_id: str
    test_run_name: str
    executable_url: Optional[str] = None
    flow_ids: list[str]
    acceptance_criteria: Optional[str] = None
    device_ids: Optional[str] = None
    build_number: str
    send_to_nova: bool = False
    test_run_type: Optional[TestRunType] = None


class AddFlowsToExistingTestRunParams(BaseModel):
    test_run_id: str
    flow_ids: list[str]
    product_id: str
    send_to_nova: bool = False
