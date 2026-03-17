from pydantic import BaseModel
from typing import List, Optional


class CreateJiraTicketsRequest(BaseModel):
    """Request model for creating Jira tickets for failed test cases."""

    product_id: str
    test_run_id: str
    failed_test_case_ids: List[str]


class JiraTicketInfo(BaseModel):
    """Information about a created Jira ticket."""

    test_case_id: str
    test_case_title: str
    jira_ticket_key: str  # e.g., "PROJ-123"
    jira_ticket_url: str
    jira_ticket_id: str


class TicketCreationFailure(BaseModel):
    """Information about a failed ticket creation."""

    test_case_id: str
    test_case_title: str
    error: str


class CreateJiraTicketsResponse(BaseModel):
    """Response model for Jira ticket creation."""

    tickets_created: int
    tickets_failed: int
    total_test_cases: int
    tickets: List[JiraTicketInfo]
    failures: List[TicketCreationFailure]
    product_id: str
    test_run_id: str


class TestCaseJiraTicketData(BaseModel):
    """Internal model for test case data used to create Jira tickets."""

    test_case_id: str
    tcue_id: str  # TestCaseUnderExecution ID
    title: str
    description: str
    steps: str
    expected_results: str
    criticality: str
    execution_notes: Optional[str] = None
    execution_video_url: Optional[str] = None
    test_run_link: str
    tcue_url: str  # Direct URL to TCUE
    preconditions: Optional[str] = None
