from pydantic import BaseModel
from datetime import datetime
from typing import Dict, Optional


class Credentials(BaseModel):
    """Model for storing credentials information."""

    id: str
    credentials: Dict[str, str]
    description: Optional[str] = None
    product_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None


class AddCredentialsRequest(BaseModel):
    credentials: Dict[str, str]
    description: Optional[str] = None
    test_case_id: Optional[str] = None
    is_default: Optional[bool]
    product_id: str


class DefaultCredentialsRequest(BaseModel):
    credentials: Dict[str, str]
    is_default: Optional[bool]
    description: Optional[str] = None


class UpdateCredentialsRequest(BaseModel):
    id: str
    product_id: str
    is_default: Optional[bool]
    credentials: Dict[str, str]
    description: Optional[str] = None
