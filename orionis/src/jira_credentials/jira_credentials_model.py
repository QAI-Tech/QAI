from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


class JiraCredentials(BaseModel):
    """Model for storing Jira credentials information."""

    id: str
    email: str
    encrypted_api_token: str
    product_id: str
    jira_project_key: str
    jira_base_url: str
    created_at: datetime
    updated_at: Optional[datetime] = None


class JiraCredentialsDecrypted(BaseModel):
    """Model for Jira credentials with decrypted token (for internal use only)."""

    id: str
    email: str
    api_token: str  # Decrypted token
    product_id: str
    jira_project_key: str
    jira_base_url: str
    created_at: datetime
    updated_at: Optional[datetime] = None


class AddJiraCredentialsRequest(BaseModel):
    """Request model for adding Jira credentials."""

    email: EmailStr
    api_token: str
    product_id: str
    jira_project_key: str
    jira_base_url: str


class DeleteJiraCredentialsRequest(BaseModel):
    """Request model for deleting Jira credentials."""

    id: str


class JiraCredentialsResponse(BaseModel):
    """Response model for GET requests - excludes API token for security."""

    id: str
    email: str
    product_id: str
    jira_project_key: str
    jira_base_url: str
    created_at: datetime
    updated_at: Optional[datetime] = None
