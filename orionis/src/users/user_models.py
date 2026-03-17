from datetime import datetime
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional


class User(BaseModel):
    user_id: str
    auth_provider_user_id: str
    auth_provider: str
    organisation_id: str
    organisation_ids: List[str] = []
    first_name: Optional[str] = Field(default=None)
    last_name: Optional[str] = Field(default=None)
    email: EmailStr
    roles: List[str] = []
    created_at: datetime


class UpdateUserRequestParams(BaseModel):
    organisation_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    roles: Optional[list[str]] = []


class RoleManagementRequestParams(BaseModel):
    user_id: str
    roles: list[str]


class Invite(BaseModel):
    email: str
    role: str


class SendInviteRequestParams(BaseModel):
    invites: List[Invite]


class SendTestRunCompletionRequestParams(BaseModel):
    test_run_id: str
