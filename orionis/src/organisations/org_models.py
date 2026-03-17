from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class Organisation(BaseModel):
    organisation_id: str
    organisation_name: str
    human_readable_org_id: str
    created_at: datetime
    whitelisted_domains: List[str]
    qubit_balance: int
    stripe_customer_id: Optional[str] = None
    auto_reload_enabled: bool = False
    auto_reload_threshold: int = 5
    auto_reload_amount: int = 100


class BuyQubitsRequestParams(BaseModel):
    organisation_id: str
    qubit_amount: int


class UpdateOrganisationRequestParams(BaseModel):
    """Generic model for updating organisation fields."""

    organisation_id: str
    auto_reload_enabled: Optional[bool] = None
    auto_reload_threshold: Optional[int] = None
    auto_reload_amount: Optional[int] = None
    whitelisted_domains: Optional[List[str]] = None
