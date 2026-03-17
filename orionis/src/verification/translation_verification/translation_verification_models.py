from pydantic import BaseModel
from typing import Optional


class TranslationVerificationRequestParams(BaseModel):
    tcue_id: str


class TranslationVerificationResponseParams(BaseModel):
    tcue_id: str
    status: str
    validation_summary: Optional[str] = None
    confidence_score: Optional[int] = None
    issues_count: Optional[int] = None
