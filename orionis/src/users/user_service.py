from datetime import datetime, timezone
from typing import List
from uuid import uuid4
from common.google_cloud_wrappers import GCPDatastoreWrapper, GmailWrapper
from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from test_runs.test_run_models import TestRun
from users.user_models import User
from constants import Constants
import logging
from users.user_datastore import UserDatastore
from users.user_request_validator import UserRequestValidator
from utils.util import orionis_log, encode_string
from test_runs.test_run_datastore import TestRunDatastore
from products.product_datastore import ProductDatastore
from products.product_models import ProductEntity
from services.notify_service.email_templates import EmailTemplates
from test_case_under_execution.test_case_under_exec_datastore import (
    TestCaseUnderExecutionDatastore,
)
from test_case_under_execution.test_case_under_exec_models import TestCaseUnderExecution

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class UserServiceException(Exception):
    """Custom Exception for UserService."""

    def __init__(self, message, status_code=Constants.HTTP_STATUS_BAD_REQUEST):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class UserService:
    def __init__(
        self, request_validator: UserRequestValidator, datastore: UserDatastore
    ):
        self.db_client = GCPDatastoreWrapper()
        self.db = self.db_client.get_datastore_client()
        self.datastore = datastore
        self.request_validator = request_validator
        self.test_run_datastore = TestRunDatastore()
        self.product_datastore = ProductDatastore()
        self.email_templates = EmailTemplates()
        self.gmail_wrapper = GmailWrapper()
        from organisations.org_datastore import OrganisationDatastore

        self.test_case_under_execution_datastore = TestCaseUnderExecutionDatastore(
            org_datastore=OrganisationDatastore(),
            product_datastore=self.product_datastore,
        )

    def get_user(self, user_id_str: str) -> User:
        try:
            user_id = int(user_id_str)
            query = self.db.query(kind=Constants.ENTITY_KIND_USER)
            query.add_filter(
                "__key__", "=", self.db.key(Constants.ENTITY_KIND_USER, user_id)
            )
            results = list(query.fetch())

            if not results:
                raise UserServiceException(
                    f"User with ID {user_id} not found", Constants.HTTP_STATUS_NOT_FOUND
                )

            user_entity = results[0]

            return User(user_id=str(user_id), **user_entity)

        except ValueError:
            raise UserServiceException(
                f"Invalid user ID format: {user_id}", Constants.HTTP_STATUS_BAD_REQUEST
            )

    def fetch_users(self) -> List[User]:
        query = self.db.query(kind=Constants.ENTITY_KIND_USER)
        return [User(**user) for user in query.fetch()]

    def add_user(self, user: User) -> User:
        """Add a new user with all details."""
        key = self.db.key(Constants.ENTITY_KIND_USER)

        entity = self.db.entity(key=key)
        created_at = datetime.now(timezone.utc)

        entity.update(
            {
                Constants.FIELD_AUTH_PROVIDER_USER_ID: user.auth_provider_user_id,
                Constants.FIELD_FIRST_NAME: user.first_name,
                Constants.FIELD_LAST_NAME: user.last_name,
                Constants.FIELD_EMAIL: user.email,
                Constants.FIELD_ORGANISATION_ID: user.organisation_id,
                Constants.FIELD_ORGANISATION_IDS: user.organisation_ids or [],
                Constants.FIELD_CREATED_AT: created_at,
                Constants.FIELD_ROLES: user.roles or [],
                Constants.FIELD_AUTH_PROVIDER: user.auth_provider
                or Constants.DEFAULT_AUTH_PROVIDER,
            }
        )

        self.db.put(entity)

        user_id = entity.key.id  # type: ignore #TODO: fix this

        return User(
            user_id=str(user_id),
            auth_provider_user_id=user.auth_provider_user_id,
            first_name=user.first_name,
            last_name=user.last_name,
            email=user.email,
            organisation_id=user.organisation_id,
            organisation_ids=user.organisation_ids or [],
            created_at=created_at,
            roles=user.roles or [],
            auth_provider=user.auth_provider or Constants.FIELD_AUTH_PROVIDER,
        )

    def add_user_to_datastore_if_new(
        self,
        auth_provider_user_id: str,
        first_name: str,
        last_name: str,
        email: str,
        auth_provider: str,
    ) -> User:
        """Get an existing user by auth_provider_user_id or create a new one."""
        query = self.db.query(kind=Constants.ENTITY_KIND_USER)
        query.add_filter(
            Constants.FIELD_AUTH_PROVIDER_USER_ID, "=", auth_provider_user_id
        )
        results = list(query.fetch())

        if results:
            user_entity = results[0]

            return User(
                user_id=str(user_entity.key.id),
                auth_provider_user_id=user_entity.get(
                    Constants.FIELD_AUTH_PROVIDER_USER_ID
                ),
                first_name=user_entity.get(Constants.FIELD_FIRST_NAME),
                last_name=user_entity.get(Constants.FIELD_LAST_NAME),
                email=user_entity.get(Constants.FIELD_EMAIL),
                organisation_id=str(user_entity.get(Constants.FIELD_ORGANISATION_ID)),
                organisation_ids=user_entity.get(Constants.FIELD_ORGANISATION_IDS, []),
                created_at=user_entity.get(
                    Constants.FIELD_CREATED_AT, datetime.now(timezone.utc)
                ),
                roles=user_entity.get(Constants.FIELD_ROLES, []),
                auth_provider=user_entity.get(
                    Constants.FIELD_AUTH_PROVIDER, Constants.DEFAULT_AUTH_PROVIDER
                ),
            )
        else:
            user = User(
                user_id=str(uuid4()),
                auth_provider_user_id=auth_provider_user_id,
                first_name=first_name,
                last_name=last_name,
                email=email,
                organisation_id="",
                organisation_ids=[],
                created_at=datetime.now(timezone.utc),
                roles=[],
                auth_provider=auth_provider,
            )
            created_user = self.add_user(user)

            try:
                from services.notify_service.notify import NotificationService

                notification_service = NotificationService()
                notification_service.notify_new_user_signup(created_user.user_id)
            except Exception as e:
                orionis_log(f"Failed to send new user signup notification: {e}", e)

            return created_user

    def delete_user(
        self, request: ApiRequestEntity, requesting_user_id: str
    ) -> ApiResponseEntity:
        """Delete a user by ID."""
        if request.method != ApiRequestEntity.API_METHOD_DELETE:
            return ApiResponseEntity(
                response={"error": "Method must be DELETE"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:

            requesting_user = self.get_user(requesting_user_id)
            if not requesting_user:
                raise ValueError("Requesting user not found")

            if not (
                Constants.FIELD_ADMIN_ROLE in requesting_user.roles
                or Constants.FIELD_OWNER_ROLE in requesting_user.roles
            ):
                raise ValueError("Requesting user is not an admin or owner")

            user_id_to_delete = request.data.get("user_id")
            if not user_id_to_delete:
                raise ValueError("User ID is required")

            deleted_user = self.datastore.delete_user(user_id_to_delete)

            return ApiResponseEntity(
                response={
                    "user_id": deleted_user,
                    "message": "User deleted successfully",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Value error in delete_user: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )

        except Exception as e:
            orionis_log(f"Exception in delete_user: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def update_user(
        self, request: ApiRequestEntity, updating_user_id: str
    ) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            user_id = updating_user_id

            orionis_log(f"Updating organisation_id for user_id: {user_id}")

            update_fields = self.request_validator.validate_update_user_request(
                request.data
            )

            updated_user_entity: User = self.datastore.update_user_fields(
                user_id, update_fields
            )

            return ApiResponseEntity(
                response=updated_user_entity.model_dump(),
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Value error in update_user: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in update_user: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def get_users_with_org_id(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_GET:
            return ApiResponseEntity(
                response={"error": "Method must be GET"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            organisation_id = request.data.get("organisation_id")

            if not organisation_id:
                raise ValueError("Organisation ID is required")

            orionis_log(f"Fetching users for organisation_id: {organisation_id}")

            users = self.datastore.get_users_with_organisation_id(organisation_id) or []

            return ApiResponseEntity(
                response={
                    Constants.FIELD_ORGANISATION_ID: organisation_id,
                    Constants.FIELD_USERS: (
                        [user.model_dump() for user in users] if users else []
                    ),
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Value error in get_users_with_org_id: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in get_users_with_org_id: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def update_user_role(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            role_management_params = (
                self.request_validator.validate_role_management_request(request)
            )

            orionis_log(
                f"Updating roles for user_id: {role_management_params.user_id} with roles: {role_management_params.roles}"
            )

            updated_user_entity: User = self.datastore.update_user_roles(
                role_management_params
            )

            return ApiResponseEntity(
                response=updated_user_entity.model_dump(),
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Value error in update_user_role: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in update_user_role: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def send_email_invites(
        self, request: ApiRequestEntity, requesting_user_id: str
    ) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            requesting_user = self.get_user(requesting_user_id)
            send_invite_params = self.request_validator.validate_send_invite_request(
                request
            )

            gmail_wrapper = GmailWrapper()
            response_list = []

            for invite in send_invite_params.invites:
                name = invite.email.split("@")[0]
                subject = Constants.GMAIL_SUBJECT_TEMPLATE.format(name=name)
                link = Constants.INVITE_LINK.format(
                    encoded_string=encode_string(
                        f"{requesting_user.organisation_id}:{invite.role}"
                    )
                )
                body = Constants.GMAIL_BODY_TEMPLATE.format(
                    name=name, invite_link=link, user_name=requesting_user.first_name
                )

                send_result = gmail_wrapper.send_email(
                    to_email=invite.email, subject=subject, body=body
                )

                response_list.append({"email": invite.email, "message_id": send_result})

            return ApiResponseEntity(
                response={"sent": response_list},
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as ve:
            orionis_log(f"Value error in send_email_invites: {ve}", ve)
            return ApiResponseEntity(
                response={"error": str(ve)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in send_email_invites: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def send_test_run_email(
        self, request: ApiRequestEntity, requesting_user_id: str
    ) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            test_run_id = request.data.get("test_run_id")
            if not test_run_id:
                raise ValueError("Test run ID is required")

            response_list = self.send_test_run_completion_email(
                requesting_user_id, test_run_id
            )

            if "error" in response_list:
                orionis_log(
                    "Error sending test run completion email:",
                    Exception(response_list["error"]),
                )
                raise ValueError("Error sending test run completion email")

            return ApiResponseEntity(
                response={"sent": response_list},
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as ve:
            orionis_log(f"Value error in send_test_run_email: {ve}", ve)
            return ApiResponseEntity(
                response={"error": str(ve)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in send_test_run_email: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def send_test_run_completion_email(self, user_id: str, test_run_id: str) -> dict:
        try:
            test_run = self._get_test_run(test_run_id)
            user = self._get_user(user_id)
            product = self._get_product(test_run.product_id)

            target_users = self._get_target_users(user, product)
            test_cases = self._get_test_cases_under_execution(test_run.test_run_id)

            passed_count, failed_count, untested_count = self._get_test_case_results(
                test_cases
            )
            status_html, template_type = self._generate_status_html(
                passed_count, failed_count, untested_count
            )

            return self._send_emails_to_users(
                target_users,
                test_run,
                product,
                status_html,
                template_type,
            )
        except ValueError as ve:
            raise ve
        except Exception as e:
            raise e

    def _get_test_run(self, test_run_id: str) -> TestRun:
        test_run = self.test_run_datastore.get_test_run_by_id(test_run_id)
        if not test_run:
            raise ValueError("Test run not found")
        return test_run

    def _get_user(self, user_id: str) -> User:
        user = self.get_user(user_id)
        if not user:
            raise ValueError("User not found")
        return user

    def _get_product(self, product_id: str) -> ProductEntity:
        product = self.product_datastore.get_product_from_id(product_id)
        if not product:
            raise ValueError("Product not found")
        return product

    def _get_target_users(self, user: User, product: ProductEntity) -> List[User]:
        users = self.datastore.get_users_with_organisation_id(product.organisation_id)

        if user and all(u.user_id != user.user_id for u in users):
            users.append(user)

        if not users:
            raise ValueError(
                "No users found for the product or user is not part of the product's organisation"
            )

        seen_user_ids = set()
        deduped_users = []
        for u in users:
            if u.user_id not in seen_user_ids:
                deduped_users.append(u)
                seen_user_ids.add(u.user_id)
        return deduped_users

    def _get_test_cases_under_execution(
        self, test_run_id: str
    ) -> List[TestCaseUnderExecution]:
        return self.test_case_under_execution_datastore.get_test_cases_under_execution(
            test_run_id
        )

    def _get_test_case_results(
        self, test_cases: List[TestCaseUnderExecution]
    ) -> tuple[int, int, int]:
        passed = failed = untested = 0
        for tc in test_cases:
            if tc.status == Constants.FIELD_TEST_CASE_STATUS_FAILED:
                failed += 1
            elif tc.status == Constants.FIELD_TEST_CASE_STATUS_PASSED:
                passed += 1
            elif tc.status == Constants.FIELD_TEST_CASE_STATUS_UNTESTED:
                untested += 1
        return passed, failed, untested

    def _generate_status_html(
        self, passed: int, failed: int, untested: int
    ) -> tuple[str, str]:
        templates = self.email_templates.get_test_run_completion_template()
        total = passed + failed + untested
        passed_plural = "s" if passed != 1 else ""
        failed_plural = "s" if failed != 1 else ""

        if failed == 0 and untested == 0:
            msg = (
                "All test cases passed"
                if total == 1
                else f"All {total} test cases passed"
            )
            html = templates["success"]["status_html"].replace("$success_message", msg)
            return html, "success"
        elif passed == 0 and untested == 0:
            msg = (
                "All test cases failed"
                if total == 1
                else f"All {total} test cases failed"
            )
            html = templates["all_failed"]["status_html"].replace(
                "$failure_message", msg
            )
            return html, "all_failed"
        elif passed == 0 and failed == 0 and untested > 0:
            msg = (
                "All test cases are untested"
                if untested == 1
                else f"All {untested} test cases are untested"
            )
            html = templates["all_untested"]["status_html"].replace(
                "$untested_message", msg
            )
            return html, "all_untested"
        else:
            html = (
                templates["failure"]["status_html"]
                .replace("$passed_count", str(passed))
                .replace("$failed_count", str(failed))
                .replace("$passed_plural", passed_plural)
                .replace("$failed_plural", failed_plural)
            )

            if untested > 0:
                untested_plural = "s" if untested != 1 else ""
                untested_html = f'<span class="test-count untested">{untested} test case{untested_plural} untested</span>'
            else:
                untested_html = ""

            html = html.replace("$untested_html", untested_html)
            return html, "failure"

    def _send_emails_to_users(
        self,
        users: List[User],
        test_run: TestRun,
        product: ProductEntity,
        status_html: str,
        template_type: str,
    ) -> dict:
        templates = self.email_templates.get_test_run_completion_template()
        test_run_link = (
            f"{Constants.DOMAIN}/{test_run.product_id}/test-runs"
            f"?featureId=&showFlows=true&testRunId={test_run.test_run_id}"
        )

        response_list = []
        for user in users:
            email_body = templates["base_template"].substitute(
                name=user.first_name,
                test_run_name=test_run.test_run_name,
                product_name=product.product_name,
                test_run_link=test_run_link,
                status_html=status_html,
                header=templates[template_type]["header"],
                message=templates[template_type]["message"],
            )
            result = self.gmail_wrapper.send_email(
                to_email=user.email,
                subject=templates[template_type]["subject"],
                body=email_body,
                is_html=True,
            )
            response_list.append({"email": user.email, "message_id": result})
        return {"sent": response_list}

    def send_emails_for_test_run_created(
        self,
        user: User,
        test_run: TestRun,
        product: ProductEntity,
    ) -> dict:
        templates = self.email_templates.get_test_run_created_template()
        test_run_link = (
            f"{Constants.DOMAIN}/{test_run.product_id}/test-runs"
            f"?featureId=&showFlows=true&testRunId={test_run.test_run_id}"
        )

        email_body = templates["base_template"].substitute(
            created_by=user.first_name,
            test_run_name=test_run.test_run_name,
            product_name=product.product_name,
            test_run_link=test_run_link,
            test_build_id=test_run.build_number,
            device_name=test_run.device_name,
            created_at=test_run.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            header=templates["created"]["header"],
            message=templates["created"]["message"],
            status_html=templates["created"]["status_html"],
        )
        result = self.gmail_wrapper.send_email(
            to_email=Constants.FIELD_TEST_RUN_RECEIVING_EMAIL,
            subject=templates["created"]["subject"],
            body=email_body,
            is_html=True,
        )
        return {"email": Constants.FIELD_TEST_RUN_RECEIVING_EMAIL, "message_id": result}

    def is_external_user(self, user_id: str) -> bool:
        return False
