import requests
import logging
import json
from common.google_cloud_wrappers import GCPDatastoreWrapper
from organisations.org_datastore import OrganisationDatastore
from products.product_datastore import ProductDatastore
from test_runs.test_run_datastore import TestRunDatastore
from test_runs.test_run_models import TestRun
from users.user_datastore import UserDatastore
from users.user_request_validator import UserRequestValidator
from users.user_service import UserService
from constants import Constants
from config import Config, config
from dataclasses import dataclass
from test_cases.test_case_models import RawTestCase
from users.user_models import User
from utils.util import orionis_log


@dataclass
class ProductOrgExecutableUrlInfo:
    product_name: str
    org_name: str
    executable_url: str


class NotificationService:
    def __init__(self):
        self.slack_webhook_url = config.notification_webhook_url
        self.user_service = UserService(UserRequestValidator(), UserDatastore())
        self.db = GCPDatastoreWrapper().get_datastore_client()

    def notify_slack(self, msg: str, webhook_url: str):
        orionis_log(f"Slack Notification Bypass: {msg}")

    def send_notification(self, user_id, status, request_id, product_id):
        user = self.user_service.get_user(user_id)
        if not user:
            logging.error(f"User email not found for user_id: {user_id}")
            return

        if status == Constants.REQUEST_COMPLETED:
            message = (
                f":wave: Hello {user.first_name}!\n\n✅ Your test case generation"
                " request has been completed successfully for the request (ID:"
                f" {request_id}) and product (ID: {product_id}). :tada:\n\n:robot_face: Best regards,\nTeam QAI"
                " :rocket:"
            )
        elif status == Constants.REQUEST_FAILED:
            message = (
                f":wave: Hello {user.first_name}!\n\n❌ Unfortunately, your test case"
                f" generation request (ID: {request_id}) and product (ID: {product_id}) has failed. Please try again"
                " or contact support. :disappointed:\n\n:robot_face: Best"
                " regards,\nTeam QAI :rocket:"
            )
        else:
            message = (
                f":wave: Hello {user.first_name}!\n\nℹ️ The status of your request (ID:"
                f" {request_id}) and product (ID: {product_id}) is currently being processed. Please check back"
                " later.\n\n:robot_face: Best regards,\nTeam QAI :rocket:"
            )

        self.notify_slack(message, self.slack_webhook_url)

    def notify_new_user_signup(self, user_id: str) -> None:
        if config.environment != Config.PRODUCTION:
            logging.info(
                "Skipping new user signup notification in non-production environment"
            )
            return
        print(f"Environment: {config.environment}")
        user = self.user_service.get_user(user_id)
        if not user:
            logging.error(f"User not found for user_id: {user_id}")
            return

        message = (
            f":tada: New User Signup! :tada:\n\n"
            f"• Name: {user.first_name} {user.last_name}\n"
            f"• Email: {user.email}\n"
            f"• Auth Provider: {user.auth_provider}\n"
            f"\n:rocket: Welcome to QAI!"
        )

        self.notify_slack(message, self.slack_webhook_url)

    def notify_new_test_run(
        self, test_run: TestRun, user_id: str, test_case_under_execution_count: int
    ) -> None:
        if config.environment != Config.PRODUCTION:
            logging.info(
                "Skipping new test run notification in non-production environment"
            )
            return
        print(f"Environment: {config.environment}")
        user = self.user_service.get_user(user_id)
        if not user:
            logging.error(f"User not found for user_id: {user_id}")
            return

        product_info = self.retrieve_product_org_and_executable_url(
            test_run.product_id, user.organisation_id, test_run.test_build_id
        )

        message = (
            f":rocket: New Test Run Started by *{user.first_name} {user.last_name}*! :rocket:\n\n"
            f"• Name: `{test_run.test_run_name}`\n"
            f"• Organization: `{product_info.org_name}`\n"
            f"• Product: `{product_info.product_name}`\n"
            f"• Test Run Link: {Constants.DOMAIN}/{test_run.product_id}/test-runs"
            f"?featureId=&showFlows=true&testRunId={test_run.test_run_id}\n"
            f"• Executable URL: `{product_info.executable_url}`\n"
            f"• Acceptance Criteria: `{test_run.acceptance_criteria}`\n"
            f"• Device Name: `{test_run.device_name if test_run.device_name else 'N/A'}`\n"
            f"• Total TCUEs: `{test_case_under_execution_count}`\n"
            f":eyes: Keep an eye on the results!"
        )

        self.notify_slack(message, self.slack_webhook_url)

    def retrieve_product_org_and_executable_url(
        self, product_id: str, org_id: str, test_build_id: str = ""
    ) -> ProductOrgExecutableUrlInfo:

        if not product_id or not org_id:
            raise ValueError("Product ID and org ID are required")

        product_key = self.db.key(ProductDatastore.FieldProduct.KIND, int(product_id))
        product_entity = self.db.get(product_key)
        if not product_entity:
            raise ValueError(f"Product with id {product_id} not found")
        org_key = self.db.key(OrganisationDatastore.ENTITY_KIND_ORG, int(org_id))
        org_entity = self.db.get(org_key)
        if not org_entity:
            raise ValueError(f"Organization with id {org_id} not found")
        executable_url = ""
        if test_build_id:
            test_build_key = self.db.key(
                TestRunDatastore.ENTITY_KIND_TEST_BUILD, int(test_build_id)
            )
            test_build_entity = self.db.get(test_build_key)
            if not test_build_entity:
                raise ValueError(f"Test build with id {test_build_id} not found")
            executable_url = test_build_entity.get(
                TestRunDatastore.FIELD_EXECUTABLE_URL
            )
        return ProductOrgExecutableUrlInfo(
            product_entity.get(ProductDatastore.FieldProduct.NAME),
            org_entity.get(OrganisationDatastore.FIELD_ORGANISATION_NAME),
            executable_url,
        )

    def notify_new_test_case(self, test_case: RawTestCase, user: User) -> None:

        if not test_case.product_id:
            orionis_log(
                f"Cannot send notification for test case {test_case.test_case_id} without a product_id."
            )
            return

        product_info = self.retrieve_product_org_and_executable_url(
            test_case.product_id, user.organisation_id
        )
        orionis_log(f"Product info: {product_info}")

        message = (
            f":rocket: New Test Case Added! :rocket:\n\n"
            f"• Name: `{user.first_name} {user.last_name}`\n"
            f"• Organization: `{product_info.org_name}`\n"
            f"• Product: `{product_info.product_name}`\n"
            f"• Test Case Link: `{Constants.DOMAIN}/{test_case.product_id}/test-cases/?test_case_id={test_case.test_case_id}`\n"
            f":sparkles: A new test case has been added! :sparkles:"
        )

        self.notify_slack(message, self.slack_webhook_url)

    def notify_new_org(self, user_details: dict, org_name: str) -> None:
        """Send Slack notification when a new organization and product are created."""
        if config.environment != Config.PRODUCTION:
            logging.info(
                "Skipping new org and product notification in non-production environment"
            )
            return

        first_name = user_details.get(Constants.FIELD_FIRST_NAME, "User")
        last_name = user_details.get(Constants.FIELD_LAST_NAME, "")
        full_name = f"{first_name} {last_name}".strip()

        message = (
            f":tada: New Organization Created! :tada:\n\n"
            f"• User Name: `{full_name}`\n"
            f"• Email: `{user_details.get(Constants.FIELD_EMAIL, '')}`\n"
            f"• Organization: `{org_name}`\n"
            f"\n:rocket: Welcome to QAI!"
        )

        self.notify_slack(message, self.slack_webhook_url)
