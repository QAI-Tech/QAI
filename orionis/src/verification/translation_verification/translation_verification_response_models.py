from pydantic import BaseModel
from typing import List, Optional
from enum import Enum


class SeverityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ValidationStatus(str, Enum):
    PASS = "pass"
    FAIL = "fail"


class Issue(BaseModel):
    issue_id: str
    element_type: str
    expected_text: str
    actual_text: str
    issue_type: str
    description: str
    severity: SeverityLevel
    suggestion: str
    affected_elements: List[str]


class DetailedResult(BaseModel):
    screen_index: int
    screen_name: str
    status: ValidationStatus
    issues: List[Issue]


class TranslationValidationResponse(BaseModel):
    overall_status: ValidationStatus
    confidence_score: int
    validation_summary: str
    detailed_results: List[DetailedResult]
    recommendations: List[str]


class TranslationValidationResult(BaseModel):
    tcue_id: str
    response: TranslationValidationResponse
    prompt_stored_url: Optional[str] = None
    response_stored_url: Optional[str] = None
    processing_time_ms: Optional[int] = None
