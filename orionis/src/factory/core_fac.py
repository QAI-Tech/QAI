from test_case_planning.app_video_analysis.app_video_analyzer import AppVideoAnalyzer
from test_case_planning.test_case_planning_service import TestCasePlanningService
from test_case_planning.smoke_test_plan_validator import PlanningRequestValidator
from test_case_planning.test_case_planning_request_datastore import (
    TestCasePlanningRequestDatastore,
)
from services.cloud_service.cloud_tasks import CloudTaskService
from common.google_cloud_wrappers import GCPFileStorageWrapper
from test_case_planning.smoke_test_planner_agent import SmokeTestPlannerAgent
from test_case_planning.goal_planner_agent import GoalPlannerAgent
from test_case_planning.product_info.product_info_agent import ProductInfoAgent
from llm_model import LLMModelWrapper
from products.product_service import ProductService
from products.product_datastore import ProductDatastore
from test_cases.test_case_datastore import TestCaseDatastore
from test_case_planning.feature_extraction.input_image_descriptor import (
    InputImageDescriptor,
)
from test_case_planning.feature_extraction.feature_extractor import FeatureExtractor
from test_case_planning.feature_extraction.functionality_extractor import (
    FunctionalityExtractor,
)
from test_case_planning.feature_extraction.screen_extractor import ScreenExtractor
from test_runs.test_run_datastore import TestRunDatastore
from products.product_request_validator import ProductRequestValidator
from credentials.credentials_datastore import CredentialsDatastore
from test_case_under_execution.test_case_under_exec_datastore import (
    TestCaseUnderExecutionDatastore,
)
from organisations.org_datastore import OrganisationDatastore


def create_test_case_planning_service() -> TestCasePlanningService:
    """
    Factory function to create and initialize TestCasePlanningService with all its dependencies.
    """
    # Initialize core services
    llm_model = LLMModelWrapper()
    file_storage_client = GCPFileStorageWrapper()
    product_datastore = ProductDatastore()
    product_validator = ProductRequestValidator()
    product_service = ProductService(
        product_datastore, product_validator
    )  # Validator not needed for factory
    test_case_datastore = TestCaseDatastore()
    test_run_datastore = TestRunDatastore()
    task_service = CloudTaskService()
    credentials_datastore = CredentialsDatastore()
    # Initialize feature extraction components

    functionality_extractor = FunctionalityExtractor(
        llm_model,
        product_datastore,
        file_storage_client,
    )
    screen_extractor = ScreenExtractor(
        llm_model, product_datastore, file_storage_client
    )
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

    # Initialize planning agents
    smoke_test_planner_agent = SmokeTestPlannerAgent(
        llm_model,
        product_service,
        file_storage_client,
        product_datastore,
        test_case_datastore,
        input_image_descriptor,
        feature_extractor,
        app_video_analyzer,
    )

    goal_planner_agent = GoalPlannerAgent(
        ProductInfoAgent(),
        llm_model,
        product_service,
        file_storage_client,
        product_datastore,
        test_case_datastore,
        input_image_descriptor,
        feature_extractor,
    )

    # Create and return TestCasePlanningService
    return TestCasePlanningService(
        PlanningRequestValidator(),
        TestCasePlanningRequestDatastore(),
        task_service,
        file_storage_client,
        smoke_test_planner_agent,
        goal_planner_agent,
        test_case_datastore,
        test_run_datastore,
        product_datastore,
        credentials_datastore,
        TestCaseUnderExecutionDatastore(
            org_datastore=OrganisationDatastore(),
            product_datastore=product_datastore,
        ),
    )
