from typing import List
from constants import Constants
from jira_integration.jira_integration_models import (
    CreateJiraTicketsResponse,
    JiraTicketInfo,
    TicketCreationFailure,
    TestCaseJiraTicketData,
)
from jira_integration.jira_integration_request_validator import (
    JiraIntegrationRequestValidator,
)
from jira_integration.jira_client import JiraClient
from jira_credentials.jira_credentials_datastore import JiraCredentialsDatastore
from test_cases.test_case_datastore import TestCaseDatastore
from test_case_under_execution.test_case_under_exec_datastore import (
    TestCaseUnderExecutionDatastore,
)
from test_runs.test_run_datastore import TestRunDatastore
from products.product_datastore import ProductDatastore
from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from utils.util import orionis_log


class JiraIntegrationService:
    """Service for creating Jira tickets for failed test cases."""

    def __init__(
        self,
        jira_integration_request_validator: JiraIntegrationRequestValidator,
        jira_credentials_datastore: JiraCredentialsDatastore,
        test_case_datastore: TestCaseDatastore,
        test_case_under_exec_datastore: TestCaseUnderExecutionDatastore,
        test_run_datastore: TestRunDatastore,
        product_datastore: ProductDatastore,
    ):
        self.request_validator = jira_integration_request_validator
        self.jira_credentials_datastore = jira_credentials_datastore
        self.test_case_datastore = test_case_datastore
        self.test_case_under_exec_datastore = test_case_under_exec_datastore
        self.test_run_datastore = test_run_datastore
        self.product_datastore = product_datastore

    def create_jira_tickets_for_failed_tests(
        self, request: ApiRequestEntity
    ) -> ApiResponseEntity:
        """Create Jira tickets for failed test cases in a test run.

        Note: failed_test_case_ids should be TestCaseUnderExecution IDs, not RawTestCase IDs.
        """
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            # Validate request
            validated_request = (
                self.request_validator.validate_create_jira_tickets_request(
                    request.data
                )
            )

            orionis_log(
                f"Creating Jira tickets for {len(validated_request.failed_test_case_ids)} "
                f"failed test cases in test run {validated_request.test_run_id}"
            )

            # Get Jira credentials (decrypted)
            jira_credentials = (
                self.jira_credentials_datastore.get_jira_credentials_for_product(
                    validated_request.product_id
                )
            )

            if not jira_credentials:
                raise ValueError(
                    f"No Jira credentials found for product {validated_request.product_id}"
                )

            # Initialize Jira client
            jira_client = JiraClient(
                email=jira_credentials.email,
                api_token=jira_credentials.api_token,
                jira_base_url=jira_credentials.jira_base_url,
            )

            # Test Jira connection
            if not jira_client.test_connection():
                raise ValueError("Failed to connect to Jira with provided credentials")

            # Get test run and product details
            test_run = self.test_run_datastore.get_test_run_by_id(
                validated_request.test_run_id
            )
            product = self.product_datastore.get_product_from_id(
                validated_request.product_id
            )

            if not test_run:
                raise ValueError(f"Test run {validated_request.test_run_id} not found")

            if not product:
                raise ValueError(f"Product {validated_request.product_id} not found")

            # Fetch failed test case details
            test_case_data_list = self._prepare_test_case_data(
                validated_request.failed_test_case_ids,
                validated_request.test_run_id,
                validated_request.product_id,
                product.product_name,
            )

            orionis_log(
                f"Prepared {len(test_case_data_list)} test case data entries for Jira ticket creation"
            )

            # Create Jira tickets
            tickets_created: List[JiraTicketInfo] = []
            failures: List[TicketCreationFailure] = []

            for test_case_data in test_case_data_list:
                try:
                    ticket_info = self._create_single_jira_ticket(
                        jira_client,
                        jira_credentials.jira_project_key,
                        test_case_data,
                        product.product_name,
                        test_run.test_run_name,
                    )
                    tickets_created.append(ticket_info)
                    orionis_log(
                        f"Created Jira ticket {ticket_info.jira_ticket_key} for test case {test_case_data.test_case_id}"
                    )
                except Exception as e:
                    error_msg = str(e)
                    orionis_log(
                        f"Failed to create Jira ticket for test case {test_case_data.test_case_id}: {error_msg}",
                        e,
                    )
                    failures.append(
                        TicketCreationFailure(
                            test_case_id=test_case_data.test_case_id,
                            test_case_title=test_case_data.title,
                            error=error_msg,
                        )
                    )

            response = CreateJiraTicketsResponse(
                tickets_created=len(tickets_created),
                tickets_failed=len(failures),
                total_test_cases=len(validated_request.failed_test_case_ids),
                tickets=tickets_created,
                failures=failures,
                product_id=validated_request.product_id,
                test_run_id=validated_request.test_run_id,
            )

            return ApiResponseEntity(
                response=response.model_dump(),
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"ValueError while creating Jira tickets: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception while creating Jira tickets: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def _prepare_test_case_data(
        self,
        tcue_ids: List[str],
        test_run_id: str,
        product_id: str,
        product_name: str,
    ) -> List[TestCaseJiraTicketData]:
        """Prepare test case data for Jira ticket creation.

        Args:
            tcue_ids: List of TestCaseUnderExecution IDs (not RawTestCase IDs)
            test_run_id: ID of the test run
            product_id: ID of the product
            product_name: Name of the product
        """
        test_case_data_list: List[TestCaseJiraTicketData] = []

        # Fetch TestCaseUnderExecution entities by their IDs
        test_cases_under_exec = (
            self.test_case_under_exec_datastore.get_test_case_under_execution_by_ids(
                tcue_ids
            )
        )

        orionis_log(
            f"Fetched {len(test_cases_under_exec)} TCUE entities out of {len(tcue_ids)} requested IDs"
        )

        if not test_cases_under_exec:
            orionis_log("No TCUE entities found for the provided IDs")
            return test_case_data_list

        # Build test run link
        domain = Constants.DOMAIN if hasattr(Constants, "DOMAIN") else ""
        test_run_link = (
            f"{domain}/{product_id}/test-runs"
            f"?featureId=&showFlows=true&testRunId={test_run_id}"
        )

        for tcue in test_cases_under_exec:
            # Format steps from TCUE
            steps_text = self._format_test_steps(tcue.test_case_steps)

            # Format expected results from TCUE
            expected_results_text = self._format_expected_results(tcue.test_case_steps)

            # Get execution notes from TCUE
            execution_notes = tcue.notes if tcue.notes else None

            # Get execution video from TCUE
            execution_video_url = (
                tcue.execution_video_url if tcue.execution_video_url else None
            )

            # Format preconditions from TCUE
            preconditions_text = None
            if tcue.preconditions:
                preconditions_text = "\n".join(f"- {p}" for p in tcue.preconditions)

            # Build TCUE URL
            tcue_url = f"{domain}/{product_id}/test-runs/{test_run_id}?tcue={tcue.id}"

            test_case_data_list.append(
                TestCaseJiraTicketData(
                    test_case_id=tcue.test_case_id,
                    tcue_id=tcue.id,
                    title=tcue.title or "Test Case",
                    description=tcue.test_case_description or "",
                    steps=steps_text,
                    expected_results=expected_results_text,
                    criticality="HIGH",  # TCUE doesn't have criticality field
                    execution_notes=execution_notes,
                    execution_video_url=execution_video_url,
                    test_run_link=test_run_link,
                    tcue_url=tcue_url,
                    preconditions=preconditions_text,
                )
            )

        return test_case_data_list

    def _format_test_steps(self, steps) -> str:
        """Format test case steps for Jira description."""
        if not steps:
            return "No steps available"

        formatted_steps = []
        for i, step in enumerate(steps, 1):
            step_desc = step.step_description or ""
            formatted_steps.append(f"{i}. {step_desc}")

        return "\n".join(formatted_steps)

    def _format_expected_results(self, steps) -> str:
        """Format expected results from test case steps."""
        if not steps:
            return "No expected results available"

        all_results = []
        for i, step in enumerate(steps, 1):
            if step.expected_results:
                results = (
                    step.expected_results
                    if isinstance(step.expected_results, list)
                    else [step.expected_results]
                )
                for result in results:
                    all_results.append(f"Step {i}: {result}")

        return (
            "\n".join(all_results) if all_results else "No expected results available"
        )

    def _create_single_jira_ticket(
        self,
        jira_client: JiraClient,
        project_key: str,
        test_case_data: TestCaseJiraTicketData,
        product_name: str,
        test_run_name: str,
    ) -> JiraTicketInfo:
        """Create a single Jira ticket for a failed test case."""

        # Build simplified Jira description with description, execution notes, and TCUE URL
        description_parts = [
            f"Test Case Failed in Test Run: {test_run_name} with TCUE ID: {test_case_data.tcue_id}",
            "",
            "DESCRIPTION:",
            test_case_data.description,
        ]

        # Add execution notes if available
        if test_case_data.execution_notes:
            description_parts.extend(
                [
                    "",
                    "EXECUTION NOTES:",
                    test_case_data.execution_notes,
                ]
            )

        # Add TCUE URL at the end
        description_parts.extend(
            [
                "",
                "TCUE URL:",
                test_case_data.tcue_url,
            ]
        )

        description = "\n".join(description_parts)

        # Create Jira ticket as a simple Task
        jira_result = jira_client.create_ticket(
            project_key=project_key,
            summary=f"[Test Failure] {test_case_data.title}",
            description=description,
            issue_type="Task",
        )

        return JiraTicketInfo(
            test_case_id=test_case_data.test_case_id,
            test_case_title=test_case_data.title,
            jira_ticket_key=jira_result["key"],
            jira_ticket_url=jira_result["url"],
            jira_ticket_id=jira_result["id"],
        )
