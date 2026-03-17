from pydantic import BaseModel
from typing import List
from datetime import datetime


class TestSuite(BaseModel):
    test_suite_id: str
    product_id: str
    name: str
    test_case_ids: List[str]
    created_at: datetime
    updated_at: datetime


class CreateTestSuiteRequestParams(BaseModel):
    product_id: str
    name: str
    test_case_ids: List[str]


class UpdateTestSuiteRequestParams(BaseModel):
    test_suite_id: str
    name: str | None = None
    test_case_ids: List[str] | None = None
