import requests
from typing import Dict, Any, Optional
from utils.util import orionis_log


class JiraClient:
    """Client for interacting with Jira REST API."""

    def __init__(self, email: str, api_token: str, jira_base_url: str):
        """
        Initialize Jira client.

        Args:
            email: Jira account email
            api_token: Jira API token
            jira_base_url: Base URL for Jira instance (e.g., https://your-domain.atlassian.net)
        """
        self.email = email
        self.api_token = api_token
        self.jira_base_url = jira_base_url.rstrip("/")
        self.auth = (email, api_token)
        self.headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def create_ticket(
        self,
        project_key: str,
        summary: str,
        description: str,
        issue_type: str = "Task",
        priority: Optional[str] = None,
        labels: Optional[list[str]] = None,
    ) -> Dict[str, Any]:
        """
        Create a Jira ticket.

        Args:
            project_key: Jira project key (e.g., "PROJ")
            summary: Ticket title/summary
            description: Ticket description in Jira format
            issue_type: Issue type (default: "Task")
            priority: Priority name (e.g., "High", "Medium", "Low")
            labels: List of labels to add to the ticket

        Returns:
            Dict containing ticket details including key and URL

        Raises:
            Exception: If ticket creation fails
        """
        try:
            url = f"{self.jira_base_url}/rest/api/3/issue"

            payload = {
                "fields": {
                    "project": {"key": project_key},
                    "summary": summary,
                    "description": {
                        "type": "doc",
                        "version": 1,
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": description}],
                            }
                        ],
                    },
                    "issuetype": {"name": issue_type},
                }
            }

            # Add priority if specified
            if priority:
                payload["fields"]["priority"] = {"name": priority}

            # Add labels if specified
            if labels:
                payload["fields"]["labels"] = labels

            orionis_log(f"Creating Jira ticket in project {project_key}: {summary}")

            response = requests.post(
                url, json=payload, auth=self.auth, headers=self.headers, timeout=30
            )

            response.raise_for_status()
            result = response.json()

            issue_key = result.get("key")
            issue_url = f"{self.jira_base_url}/browse/{issue_key}"

            orionis_log(f"Successfully created Jira ticket: {issue_key}")

            return {
                "key": issue_key,
                "id": result.get("id"),
                "url": issue_url,
                "self": result.get("self"),
            }

        except requests.exceptions.HTTPError as e:
            error_msg = f"HTTP error creating Jira ticket: {e.response.status_code} - {e.response.text}"
            orionis_log(error_msg, e)
            raise Exception(error_msg)
        except requests.exceptions.RequestException as e:
            error_msg = f"Request error creating Jira ticket: {str(e)}"
            orionis_log(error_msg, e)
            raise Exception(error_msg)
        except Exception as e:
            error_msg = f"Unexpected error creating Jira ticket: {str(e)}"
            orionis_log(error_msg, e)
            raise Exception(error_msg)

    def get_project(self, project_key: str) -> Dict[str, Any]:
        """
        Get project details to verify project exists and is accessible.

        Args:
            project_key: Jira project key

        Returns:
            Dict containing project details
        """
        try:
            url = f"{self.jira_base_url}/rest/api/3/project/{project_key}"

            response = requests.get(
                url, auth=self.auth, headers=self.headers, timeout=30
            )

            response.raise_for_status()
            return response.json()

        except requests.exceptions.HTTPError as e:
            error_msg = f"HTTP error getting Jira project: {e.response.status_code} - {e.response.text}"
            orionis_log(error_msg, e)
            raise Exception(error_msg)
        except Exception as e:
            error_msg = f"Error getting Jira project: {str(e)}"
            orionis_log(error_msg, e)
            raise Exception(error_msg)

    def test_connection(self) -> bool:
        """
        Test the Jira connection and credentials.

        Returns:
            True if connection is successful, False otherwise
        """
        try:
            url = f"{self.jira_base_url}/rest/api/3/myself"

            response = requests.get(
                url, auth=self.auth, headers=self.headers, timeout=10
            )

            response.raise_for_status()
            orionis_log("Jira connection test successful")
            return True

        except Exception as e:
            orionis_log(f"Jira connection test failed: {str(e)}", e)
            return False

    def get_project_issue_types(self, project_key: str) -> list[Dict[str, Any]]:
        """
        Get available issue types for a Jira project.

        Args:
            project_key: Jira project key

        Returns:
            List of issue type dictionaries with id, name, and description
        """
        try:
            url = f"{self.jira_base_url}/rest/api/3/project/{project_key}"

            response = requests.get(
                url, auth=self.auth, headers=self.headers, timeout=30
            )

            response.raise_for_status()
            project_data = response.json()

            issue_types = project_data.get("issueTypes", [])

            # Return simplified issue type info
            return [
                {
                    "id": it.get("id"),
                    "name": it.get("name"),
                    "description": it.get("description", ""),
                }
                for it in issue_types
            ]

        except Exception as e:
            orionis_log(
                f"Error getting issue types for project {project_key}: {str(e)}", e
            )
            return []
