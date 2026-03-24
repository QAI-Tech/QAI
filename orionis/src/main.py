import flask
import sentry_sdk
from config import config
import functions_framework
import logging

from credentials.credentials_datastore import CredentialsDatastore
from credentials.credentials_request_validator import CredentialsRequestValidator
from credentials.credentials_service import CredentialsManagementService
from jira_credentials.jira_credentials_datastore import JiraCredentialsDatastore
from jira_credentials.jira_credentials_request_validator import (
    JiraCredentialsRequestValidator,
)
from jira_credentials.jira_credentials_service import JiraCredentialsService
from jira_integration.jira_integration_service import JiraIntegrationService
from jira_integration.jira_integration_request_validator import (
    JiraIntegrationRequestValidator,
)
from features.feature_datastore import FeatureDatastore
from features.feature_request_validator import FeatureRequestValidator
from features.feature_service import FeatureService
from gateway.gateway_models import ApiRequestEntity
from llm_model import LLMModelWrapper
from onboarding_new_user.onboarding_service import OnboardingService
from organisations.org_datastore import OrganisationDatastore
from organisations.org_service import OrganisationService
from products.product_models import GetAllProductsParams
from products.product_datastore import ProductDatastore
from products.product_request_validator import ProductRequestValidator
from test_case_planning.app_video_analysis.app_video_analyzer import AppVideoAnalyzer
from test_case_planning.feature_extraction.feature_extractor import FeatureExtractor
from test_case_planning.feature_extraction.functionality_extractor import (
    FunctionalityExtractor,
)
from test_case_planning.feature_extraction.input_image_descriptor import (
    InputImageDescriptor,
)
from test_case_planning.feature_extraction.screen_extractor import ScreenExtractor
from test_case_planning.kg_flow_analyzer.kg_flow_analyzer import KGFlowAnalyzer
from test_case_planning.goal_planner_agent import GoalPlannerAgent
from test_case_planning.product_info.product_info_agent import ProductInfoAgent
from test_case_planning.smoke_test_planner_agent import SmokeTestPlannerAgent
from test_case_under_execution.test_case_under_exec_datastore import (
    TestCaseUnderExecutionDatastore,
)
from test_case_under_execution.test_case_under_exec_request_validator import (
    TestCaseUnderExecutionRequestValidator,
)
from test_case_under_execution.test_case_under_exec_service import (
    TestCaseUnderExecutionService,
)

import test_cases
from test_case_planning.smoke_test_plan_validator import (
    PlanningRequestValidator,
)
from test_cases.test_case_datastore import TestCaseDatastore
from test_case_planning.test_case_planning_request_datastore import (
    TestCasePlanningRequestDatastore,
)
from test_cases.test_case_request_validator import TestCaseRequestValidator
import test_cases.test_case_service
from test_runs.test_run_datastore import TestRunDatastore
from test_runs.test_run_request_validator import TestRunRequestValidator
from users.user_datastore import UserDatastore
from users.user_request_validator import UserRequestValidator
from utils.util import orionis_log
from api_gateway import TokenValidator
import jwt
from services.user_authentication.auth_handler import AuthHandler
from common.google_cloud_wrappers import GCPDatastoreWrapper, GCPFileStorageWrapper
from constants import Constants
from products.product_models import GetAllProductsResponse
from users.user_service import UserService
from services.cloud_service.cloud_tasks import CloudTaskService
from products.product_service import ProductService
from test_runs.test_run_service import TestRunService
from test_case_planning.test_case_planning_service import TestCasePlanningService
from services.notify_service.notify import NotificationService
from util_service.util_service import UtilService
from util_service.util_service_request_validator import UtilServiceRequestValidator
from verification.translation_verification.translation_verifier import (
    TranslationsVerifier,
)
from verification.translation_verification.translation_verification_request_validator import (
    TranslationVerificationRequestValidator,
)
from test_suites.test_suite_service import TestSuiteService
from test_suites.test_suite_request_validator import TestSuiteRequestValidator
from test_suites.test_suite_datastore import TestSuiteDatastore
from graph_diff.diff_service import DiffService
from graph_editor.generation_service import GraphEditorLLMService
from test_build.test_build_datastore import TestBuildDatastore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
# sentry_sdk.init(
#     dsn=config.sentry_dsn,
#     environment=config.environment,
#     send_default_pii=True,
#     traces_sample_rate=1.0,
# )

# TODO Re-use datastore and service instances that are already instantiated

db_client_instance = GCPDatastoreWrapper()
user_service = UserService(UserRequestValidator(), UserDatastore())
bucket_instance = GCPFileStorageWrapper()
auth_handler = AuthHandler()
token_validator = TokenValidator()
file_storage_client = GCPFileStorageWrapper()
db = GCPDatastoreWrapper().get_datastore_client()
bucket = file_storage_client.get_bucket()
task_service = CloudTaskService()
onboarding_service = OnboardingService()
diff_service = DiffService()
product_datastore = ProductDatastore()
product_service = ProductService(product_datastore, ProductRequestValidator())
test_case_datastore = TestCaseDatastore()
feature_datastore = FeatureDatastore()
test_run_datastore = TestRunDatastore()
org_datastore_for_tcue = OrganisationDatastore()
test_case_service = test_cases.test_case_service.TestCaseService(
    TestCaseRequestValidator(),
    test_case_datastore,
    FeatureService(feature_datastore, FeatureRequestValidator()),
    NotificationService(),
    user_service,
    product_datastore,
    task_service,
)
notification_service = NotificationService()
test_run_service = TestRunService(TestRunRequestValidator(), TestRunDatastore())
test_case_execution_service = TestCaseUnderExecutionService(
    TestCaseUnderExecutionRequestValidator(),
    TestCaseUnderExecutionDatastore(
        org_datastore=OrganisationDatastore(),
        product_datastore=product_datastore,
    ),
    file_storage_client,
    test_case_datastore,
    test_run_datastore,
    product_service,
    test_case_service,
    user_service,
    task_service,
    TestBuildDatastore(),
    ProductDatastore(),
)
org_service = OrganisationService(OrganisationDatastore())
test_suite_service = TestSuiteService(TestSuiteDatastore(), TestSuiteRequestValidator())
llm_model = LLMModelWrapper()
generation_service = GraphEditorLLMService(llm_model)
file_storage_client = GCPFileStorageWrapper()

functionality_extractor = FunctionalityExtractor(
    llm_model,
    product_datastore,
    file_storage_client,
)

screen_extractor = ScreenExtractor(llm_model, product_datastore, file_storage_client)
input_image_descriptor = InputImageDescriptor(
    llm_model,
    file_storage_client,
)

feature_extractor = FeatureExtractor(
    llm_model,
    product_datastore,
    functionality_extractor,
    screen_extractor,
    file_storage_client,
)

app_video_analyzer = AppVideoAnalyzer(
    llm_model,
    file_storage_client,
    test_case_datastore,
)

storage_request_validator = UtilServiceRequestValidator()

util_service = UtilService(
    storage_client=file_storage_client, request_validator=storage_request_validator
)

test_case_planning_request_datastore = TestCasePlanningRequestDatastore()

kg_flow_analyzer = KGFlowAnalyzer(
    llm_model,
    file_storage_client,
    test_case_datastore,
    feature_datastore,
    task_service,
    test_case_planning_request_datastore,
    TestCaseUnderExecutionDatastore(
        org_datastore=OrganisationDatastore(),
        product_datastore=product_datastore,
    ),
    TestRunDatastore(),
)

test_case_planning_service = TestCasePlanningService(
    PlanningRequestValidator(),
    TestCasePlanningRequestDatastore(),
    task_service,
    file_storage_client,
    SmokeTestPlannerAgent(
        llm_model,
        product_service,
        file_storage_client,
        product_datastore,
        test_case_datastore,
        input_image_descriptor,
        feature_extractor,
        app_video_analyzer,
    ),
    GoalPlannerAgent(
        ProductInfoAgent(),
        llm_model,
        product_service,
        file_storage_client,
        product_datastore,
        test_case_datastore,
        input_image_descriptor,
        feature_extractor,
    ),
    test_case_datastore,
    test_run_datastore,
    product_datastore,
    CredentialsDatastore(),
    TestCaseUnderExecutionDatastore(
        org_datastore=org_datastore_for_tcue,
        product_datastore=product_datastore,
    ),
)
feature_validator = FeatureRequestValidator()
feature_service = FeatureService(feature_datastore, feature_validator)

credentials_service = CredentialsManagementService(
    CredentialsDatastore(),
    ProductDatastore(),
    TestCaseDatastore(),
    CredentialsRequestValidator(),
    ProductRequestValidator(),
)

jira_credentials_service = JiraCredentialsService(
    JiraCredentialsDatastore(),
    JiraCredentialsRequestValidator(),
)

jira_integration_service = JiraIntegrationService(
    JiraIntegrationRequestValidator(),
    JiraCredentialsDatastore(),
    TestCaseDatastore(),
    TestCaseUnderExecutionDatastore(
        org_datastore=org_datastore_for_tcue,
        product_datastore=product_datastore,
    ),
    TestRunDatastore(),
    ProductDatastore(),
)

translation_verifier = TranslationsVerifier(
    TestCaseDatastore(),
    TestCaseUnderExecutionDatastore(
        org_datastore=org_datastore_for_tcue,
        product_datastore=product_datastore,
    ),
    LLMModelWrapper(),
    GCPFileStorageWrapper(),
    TranslationVerificationRequestValidator(),
)


@functions_framework.http
@token_validator.validate_session_token
def get_products(request: flask.Request) -> flask.typing.ResponseReturnValue:
    if request.method == "POST":
        try:
            data = request.get_json()
            if data is None:
                logging.error("Failed to parse JSON data.")
                return "Invalid JSON data.", Constants.HTTP_STATUS_BAD_REQUEST

            input_data = GetAllProductsParams(**data)
            products = product_service.get_products_from_datastore(input_data) or []

            response = GetAllProductsResponse(products=products)
            return flask.jsonify(response.model_dump()), Constants.HTTP_STATUS_OK

        except Exception as e:
            orionis_log(f"Error occurred: {e}", e)
            return str(e), Constants.HTTP_STATUS_INTERNAL_SERVER_ERROR
    else:
        return (
            "Only POST method is allowed for this function.",
            Constants.HTTP_STATUS_METHOD_NOT_ALLOWED,
        )


@functions_framework.http
@token_validator.validate_session_token
def get_organizations_for_qai_user(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    if request.method == "GET":
        # Get the user ID from token validation
        user_id = flask.g.user_id

        user = user_service.get_user(user_id)
        organisation_id = user.organisation_id

        # Get all organizations
        response_entity = org_service.get_all_organisations(user_id, organisation_id)

        return flask.jsonify(response_entity.response), response_entity.status_code
    else:
        return (
            "Only GET method is allowed for this function.",
            Constants.HTTP_STATUS_METHOD_NOT_ALLOWED,
        )


@functions_framework.http
@token_validator.validate_session_token
def get_test_cases_for_product(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    if request.method == "GET":
        try:
            product_id = request.args.get(Constants.FIELD_PRODUCT_ID)
            if not product_id:
                return (
                    flask.jsonify({"error": "product_id is required"}),
                    Constants.HTTP_STATUS_BAD_REQUEST,
                )

            test_cases = test_case_service.datastore.get_test_cases_by_product_id(
                product_id
            )

            if not test_cases:
                raise ValueError(f"No test cases found for product_id: {product_id}")

            response = {
                Constants.FIELD_TEST_CASES: [
                    tc.model_dump(mode="json") for tc in test_cases
                ]
            }

            return flask.jsonify(response), Constants.HTTP_STATUS_OK

        except Exception as e:
            orionis_log("Error in get_test_cases_for_product:", e)
            return (
                flask.jsonify({"error": str(e)}),
                Constants.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )
    else:
        orionis_log(
            "Only GET method is allowed for this function",
            Exception("Only GET method is allowed for this function"),
        )
        return (
            "Only GET method is allowed for this function.",
            Constants.HTTP_STATUS_METHOD_NOT_ALLOWED,
        )


@functions_framework.http
@token_validator.validate_session_token
def get_test_cases_for_request(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    if request.method == "GET":
        try:
            request_id = request.args.get(Constants.FIELD_REQUEST_ID)
            if not request_id:
                return (
                    flask.jsonify({"error": "request_id is required"}),
                    Constants.HTTP_STATUS_BAD_REQUEST,
                )

            test_cases = test_case_service.datastore.get_test_cases_by_request_id(
                request_id
            )

            if not test_cases:
                raise ValueError(f"No test cases found for request: {request_id}")

            response = {
                Constants.FIELD_TEST_CASES: [
                    tc.model_dump(mode="json") for tc in test_cases
                ]
            }

            return flask.jsonify(response), Constants.HTTP_STATUS_OK

        except Exception as e:
            orionis_log(f"Error in get_test_cases_for_request: {e}", e)
            return (
                flask.jsonify({"error": "Internal server error"}),
                Constants.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )
    else:
        return (
            "Only GET method is allowed for this function.",
            Constants.HTTP_STATUS_METHOD_NOT_ALLOWED,
        )


@functions_framework.http
@token_validator.validate_session_token
def copy_test_cases_for_product(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_case_service.copy_test_cases_for_product(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
def signin(request: flask.Request) -> flask.typing.ResponseReturnValue:
    if request.method == "GET":
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return flask.Response(
                "Authorization header missing or malformed",
                status=Constants.HTTP_STATUS_UNAUTHORIZED,
            )

        token = auth_header.split(" ")[1]

        try:
            payload = auth_handler.decode_token(token)
            auth_user_id = payload.get(Constants.FIELD_USER_ID_CLAIM)
            if not auth_user_id:
                return flask.Response(
                    "Auth Provided User ID not found in token",
                    status=Constants.HTTP_STATUS_UNAUTHORIZED,
                )

            user_details = auth_handler.get_user_details_from_auth_provider(
                auth_user_id
            )

            first_name = user_details.get(Constants.FIELD_FIRST_NAME, "")
            last_name = user_details.get(Constants.FIELD_LAST_NAME, "")
            email_addresses = user_details.get(Constants.FIELD_EMAIL_ADDRESSES, [])
            email = (
                email_addresses[0].get(Constants.FIELD_EMAIL_ADDRESS, "")
                if email_addresses
                else ""
            )
            auth_provider = user_details.get(Constants.FIELD_AUTH_PROVIDER, "")

            user_entity = user_service.add_user_to_datastore_if_new(
                auth_user_id, first_name, last_name, email, auth_provider
            )

            generated_token = auth_handler.generate_session_token(user_entity.user_id)

            return (
                flask.jsonify(
                    {
                        Constants.FIELD_USER_ID: user_entity.user_id,
                        Constants.FIELD_FIRST_NAME: user_entity.first_name,
                        Constants.FIELD_LAST_NAME: user_entity.last_name,
                        Constants.FIELD_EMAIL: user_entity.email,
                        Constants.FIELD_ORGANISATION_IDS: user_entity.organisation_ids
                        or [],
                        Constants.FIELD_ORGANISATION_ID: user_entity.organisation_id,
                        Constants.FIELD_AUTH_PROVIDER: user_entity.auth_provider,
                        Constants.FIELD_TOKEN: generated_token,
                    }
                ),
                Constants.HTTP_STATUS_OK,
            )

        except jwt.ExpiredSignatureError:
            orionis_log("Token has expired", Exception("Token has expired"))
            return flask.Response(
                "Token has expired", status=Constants.HTTP_STATUS_UNAUTHORIZED
            )
        except jwt.InvalidTokenError:
            orionis_log("Invalid token", Exception("Invalid token"))
            return flask.Response(
                "Invalid token", status=Constants.HTTP_STATUS_UNAUTHORIZED
            )
        except Exception as e:
            orionis_log(f"Unexpected error occurred: {e}", e)
            return flask.Response(
                "Internal server error",
                status=Constants.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )
    else:
        orionis_log(
            "Only GET method is allowed for this function",
            Exception("Only GET method is allowed for this function"),
        )
        return flask.Response(
            "Only GET method is allowed for this function.",
            status=Constants.HTTP_STATUS_METHOD_NOT_ALLOWED,
        )


@functions_framework.http
@token_validator.validate_session_token
def add_product(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)

    response_entity = product_service.add_product(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def update_product(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)

    response_entity = product_service.update_product(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def delete_product(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)

    response_entity = product_service.delete_product(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def update_test_case(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)

    response_entity = test_case_service.update_test_case(request_entity)
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def delete_test_case(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_case_service.delete_test_cases(request_entity)
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def add_test_case(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_case_service.add_test_case(request_entity, flask.g.user_id)
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def add_test_run(request: flask.Request) -> flask.typing.ResponseReturnValue:
    user_id = flask.g.user_id
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_run_service.add_test_run(request_entity, user_id)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def add_test_run_from_flows(request: flask.Request) -> flask.typing.ResponseReturnValue:
    user_id = flask.g.user_id
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_run_service.add_test_run_from_flows(request_entity, user_id)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def get_test_runs_for_product(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(
        data=request.args.to_dict(), method=request.method
    )
    response_entity = test_run_service.get_test_runs_for_product(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def add_new_test_cases_to_test_run(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_run_service.add_new_test_cases_to_test_run(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def update_test_case_under_execution(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_case_execution_service.update_test_case_under_execution(
        request_entity, flask.g.user_id
    )

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def request_smoke_test_planning(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_case_planning_service.request_smoke_test_planning(
        flask.g.user_id, request_entity
    )

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def request_kg_test_case_planning(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_case_planning_service.request_kg_test_case_planning(
        flask.g.user_id, request_entity
    )
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
def process_smoke_test_planning(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_case_planning_service.process_smoke_test_planning(
        request_entity
    )

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def request_maintainer_agent(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    """Request Maintainer Agent to process an execution video and generate graph/flows"""
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_case_planning_service.request_maintainer_agent(
        flask.g.user_id, request_entity
    )

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
def process_maintainer_agent(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    """Process Maintainer Agent execution (called by Cloud Tasks)"""
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_case_planning_service.process_maintainer_agent(
        request_entity
    )

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def merge_generated_graph(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    """Merge a generated graph from maintainer agent into the original knowledge graph"""
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    if config.enable_new_video_to_flow:
        return flask.jsonify(
            "New approach for video2flow is enabled",
            Constants.HTTP_STATUS_OK,
        )
    else:
        response_entity = test_case_planning_service.merge_generated_graph(
            request_entity, flask.g.user_id
        )
        return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def get_test_case_planning_requests_by_product_id(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(
        data=request.args.to_dict(), method=request.method
    )
    response_entity = (
        test_case_planning_service.get_test_case_planning_request_by_product_id(
            flask.g.user_id, request_entity
        )
    )
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def get_planning_request_status(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    """Get the status of a planning request (for frontend polling)"""
    request_entity = ApiRequestEntity(
        data=request.args.to_dict(), method=request.method
    )
    response_entity = test_case_planning_service.get_planning_request_status(
        request_entity
    )
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
def user_goal_planning_handler(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_case_planning_service.process_goal_planning(request_entity)
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def get_features_using_product_id(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(
        data=request.args.to_dict(), method=request.method
    )
    response_entity = feature_service.get_features_using_product_id(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def add_feature(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = feature_service.add_feature(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def delete_feature(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = feature_service.delete_feature(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def get_test_cases_under_execution(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(
        data=request.args.to_dict(), method=request.method
    )
    response_entity = response_entity = (
        test_case_execution_service.get_test_cases_under_execution(request_entity)
    )

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def update_user_details(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = user_service.update_user(request_entity, flask.g.user_id)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def add_org(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = org_service.add_organisation(request_entity, flask.g.user_id)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def onboard_new_user(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = onboarding_service.onboard_new_user(
        request_entity, flask.g.user_id
    )

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def reordering_features(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = feature_service.reorder_features(request_entity)
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def reordering_test_cases(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_case_service.reorder_test_cases(request_entity)
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
def update_execution_data(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_case_execution_service.update_nova_execution_data(
        request_entity
    )
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def get_users_with_org_id(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(
        data=request.args.to_dict(), method=request.method
    )
    response_entity = user_service.get_users_with_org_id(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def delete_test_case_under_execution_from_test_run(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_case_execution_service.delete_test_cases_under_execution(
        request_entity
    )

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def add_credentials_to_test_case_or_product(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = credentials_service.add_credentials_to_test_case_or_product(
        request_entity
    )
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def get_credentials(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(
        data=request.args.to_dict(), method=request.method
    )
    response_entity = credentials_service.get_credentials(request_entity)
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def update_credentials(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = credentials_service.update_credentials(request_entity)
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def delete_credentials(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = credentials_service.delete_credentials(request_entity)
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def add_jira_credentials(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = jira_credentials_service.add_jira_credentials(request_entity)
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def delete_jira_credentials(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = jira_credentials_service.delete_jira_credentials(request_entity)
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def get_jira_credentials(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(
        data=request.args.to_dict(), method=request.method
    )
    response_entity = jira_credentials_service.get_jira_credentials(request_entity)
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def create_jira_tickets_for_failed_tests(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = jira_integration_service.create_jira_tickets_for_failed_tests(
        request_entity
    )
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def update_feature(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = feature_service.update_feature(request_entity)
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def get_usage_data_for_organisation(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(
        data=request.args.to_dict(), method=request.method
    )
    response_entity = test_case_execution_service.get_usage_data_for_organisation(
        request_entity
    )

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def update_user_role(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = user_service.update_user_role(request_entity)
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def delete_user(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = user_service.delete_user(request_entity, flask.g.user_id)
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def send_email_invites(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = user_service.send_email_invites(request_entity, flask.g.user_id)
    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def copy_test_case_under_execution_for_product(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = (
        test_case_execution_service.copy_test_case_under_execution_for_product(
            request_entity
        )
    )

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
def create_raw_test_case_from_kg_flow(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = kg_flow_analyzer.create_raw_test_case_from_kg_flow(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
def upload_file(request: flask.Request) -> flask.typing.ResponseReturnValue:
    """
    Creates a GCS resumable upload session for large files (>32MB).
    Accepts JSON fields:
      - file_name (required): Source file name to validate extension
      - destination_path (optional): Path/name to store in bucket; defaults to file_name
      - content_type (optional): MIME type; defaults to application/octet-stream
    Returns a session URL for the client to upload directly to GCS.
    """
    if request.method != "POST":
        return (
            flask.jsonify({"error": "Method not allowed"}),
            Constants.HTTP_STATUS_METHOD_NOT_ALLOWED,
        )

    try:
        payload = request.get_json(silent=True) or {}
        orionis_log(f"Received upload request with payload: {payload}")
        file_name = (payload.get("file_name") or "").strip()
        if not file_name:
            return (
                flask.jsonify({"error": "file_name is required"}),
                Constants.HTTP_STATUS_BAD_REQUEST,
            )

        # Restrict to only .apk and .ipa files
        if not (
            file_name.lower().endswith(".apk") or file_name.lower().endswith(".ipa")
        ):
            orionis_log(f"Invalid file extension for file_name: {file_name}")
            return (
                flask.jsonify(
                    {
                        "error": "Only .apk (Android) and .ipa (iOS) files are allowed for upload.",
                    }
                ),
                Constants.HTTP_STATUS_BAD_REQUEST,
            )
        if file_name.lower().endswith(".apk"):
            platform = "Android"
        elif file_name.lower().endswith(".ipa"):
            platform = "iOS"
        else:
            platform = "Mobile"

        destination_path = (payload.get("destination_path") or file_name).strip()
        content_type = (
            payload.get("content_type") or "application/octet-stream"
        ).strip()

        # Create a resumable upload session
        origin = request.headers.get("Origin")
        session_url = file_storage_client.create_resumable_upload_session(
            bucket_name="external-file-uploads",
            blob_name=destination_path,
            content_type=content_type,
            origin=origin,
        )
        orionis_log(
            f"Created resumable upload session for {file_name} at {session_url}"
        )
        notification_service.notify_slack(
            (
                f":white_check_mark: New {platform} test build uploaded :white_check_mark:\n\n"
                f"• File Name: `{file_name}`\n"
                f"• Content Type: `{content_type}`\n"
            ),
            config.notification_webhook_url,
        )

        return (
            flask.jsonify(
                {
                    "upload_url": session_url,
                    "destination": destination_path,
                    "content_type": content_type,
                }
            ),
            Constants.HTTP_STATUS_OK,
        )

    except Exception as e:
        orionis_log("Error creating upload session", e)
        return (
            flask.jsonify({"error": "Internal server error"}),
            Constants.HTTP_STATUS_INTERNAL_SERVER_ERROR,
        )


@functions_framework.http
def update_mirrored_test_cases(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_case_service.update_mirrored_test_cases(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def send_test_run_email(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = user_service.send_test_run_email(request_entity, flask.g.user_id)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def batched_signed_url(request: flask.Request) -> flask.typing.ResponseReturnValue:
    """
    Expects JSON POST: { "urls": ["https://storage.googleapis.com/bucket/file.png", ...] }
    Returns: { "signed_urls": { "https://storage.googleapis.com/bucket/file.png": "https://...", ... }}
    """
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = util_service.batch_signed_url(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def trigger_api_request(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = util_service.trigger_api_request(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def assign_tcue_to_users(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_case_execution_service.assign_tcue_to_users(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def create_test_suite(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_suite_service.create_test_suite(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def get_test_suites(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(
        data=request.args.to_dict(), method=request.method
    )
    response_entity = test_suite_service.get_test_suites(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def update_test_suite(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_suite_service.update_test_suite(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def delete_test_suite(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_suite_service.delete_test_suite(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def save_graph(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = diff_service.save_graph_to_bucket(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def title_generation_for_nodes(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = generation_service.generate_title_for_node(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def sync_tcue_in_test_run(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_case_execution_service.sync_tcue_in_test_run(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def call_llm(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = generation_service.format_business_logic(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def format_edge_description(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = generation_service.format_edge_description(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def add_flows_to_existing_test_run(
    request: flask.Request,
) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = test_run_service.add_flows_to_existing_test_run(
        request_entity, flask.g.user_id
    )

    return flask.jsonify(response_entity.response), response_entity.status_code


def buy_qubits(request: flask.Request) -> flask.typing.ResponseReturnValue:
    """Create a Stripe Payment Intent for buying qubits."""
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = org_service.buy_qubits(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
@token_validator.validate_session_token
def update_organisation(request: flask.Request) -> flask.typing.ResponseReturnValue:
    request_entity = ApiRequestEntity(data=request.get_json(), method=request.method)
    response_entity = org_service.update_organisation(request_entity)

    return flask.jsonify(response_entity.response), response_entity.status_code


@functions_framework.http
def stripe_webhook(request: flask.Request) -> flask.typing.ResponseReturnValue:
    """Simple Stripe webhook handler to process payment success."""
    if request.method != "POST":
        return (
            flask.jsonify({"error": "Method must be POST"}),
            Constants.HTTP_STATUS_METHOD_NOT_ALLOWED,
        )

    payload = request.data
    sig_header = request.headers.get("Stripe-Signature", "")
    response_entity = org_service.process_stripe_webhook(payload, sig_header)

    return flask.jsonify(response_entity.response), response_entity.status_code
