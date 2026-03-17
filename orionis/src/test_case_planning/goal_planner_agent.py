from typing import List, Optional
import json

from common.google_cloud_wrappers import GCPFileStorageWrapper
from llm_model import LLMModelWrapper
from products.product_datastore import ProductDatastore
from products.product_service import ProductService
from test_case_planning.feature_extraction.feature_extractor import FeatureExtractor
from test_case_planning.feature_extraction.input_image_descriptor import (
    InputImageDescriptor,
)
from test_case_planning.product_info.product_info_agent import ProductInfoAgent
from test_case_planning.product_info.product_info_models import ProductInfo
from test_cases.test_case_datastore import TestCaseDatastore
from test_case_planning.prompts import (
    GOAL_PLANNER_PROMPT_PART_ONE,
    GOAL_PLANNER_PROMPT_PART_TWO,
)
from utils.util import orionis_log, publish_to_pubsub
from test_case_planning.test_case_planning_models import (
    NovaExecutionParams,
    NovaExecutionRequest,
)
from constants import Constants
from config import config


class GoalPlannerAgent:

    def __init__(
        self,
        product_info_agent: ProductInfoAgent,
        llm_model: LLMModelWrapper,
        product_service: ProductService,
        file_storage: GCPFileStorageWrapper,
        product_datastore: ProductDatastore,
        test_case_datastore: TestCaseDatastore,
        input_image_descriptor: InputImageDescriptor,
        feature_extractor: FeatureExtractor,
    ):
        self.product_info_agent = product_info_agent
        self.llm_model = llm_model
        self.product_service = product_service
        self.file_storage = file_storage
        self.product_datastore = product_datastore
        self.test_case_datastore = test_case_datastore
        self.input_image_descriptor = input_image_descriptor
        self.feature_extractor = feature_extractor

    def plan_goals(
        self,
        url: Optional[str] = None,
        user_prompt: Optional[str] = None,
        platform: Optional[str] = None,
    ) -> List[str]:

        goals: List[str] = []

        if url is not None:
            orionis_log(
                f"Fetching app details for url: {url} and  platform: {platform}"
            )
            product_info = self.product_info_agent.get_product_info(
                url=url, platform=platform or ""
            )
            orionis_log(f"Product Info: {product_info}")
            goals = self._plan_goals(product_info)

        orionis_log(f"Resulting goals: {goals}")
        if user_prompt is not None:
            # TODO enrich the goals with the user prompt
            pass

        return goals

    def _plan_goals(self, product_info: ProductInfo) -> List[str]:
        orionis_log("Initiating goal planning")
        goal_planning_prompt = GOAL_PLANNER_PROMPT_PART_ONE.replace(
            "{description}", product_info.description
        )
        user_goals_response = self.llm_model.call_llm_v3(
            prompt=goal_planning_prompt,
            response_schema={"type": "array", "items": {"type": "string"}},
        )
        user_goals = json.loads(user_goals_response)
        goal_filtering_prompt = GOAL_PLANNER_PROMPT_PART_TWO.replace(
            "{goals}", "\n".join(user_goals)
        )
        filtered_user_goals_response = self.llm_model.call_llm_v3(
            prompt=goal_filtering_prompt,
            response_schema={"type": "array", "items": {"type": "string"}},
        )
        filtered_user_goals = json.loads(filtered_user_goals_response)
        return filtered_user_goals

    def plan_goal_based_run(
        self,
        text_based_goal: str,
        product_id: str,
        platform: str,
        test_run_id: Optional[str],
        test_case_under_execution_ids: List[str],
    ):
        try:
            orionis_log(
                f"Planning goal based run for product {product_id} with goal {text_based_goal}"
            )
            product = self.product_datastore.get_product_from_id(product_id)
            nova_execution_params = NovaExecutionParams(
                test_run_id=test_run_id,
                product_id=product_id,
                product_name=product.product_name,
                executable_url=product.web_url,
                mode="GOAL_BASED_RUN",
                EXPECTED_APP_BEHAVIOUR=product.expected_app_behaviour,
                WHEN_TO_USE_WHICH_UI_ELEMENT=product.when_to_use_which_ui_element,
                environment=config.environment,
                platform=platform,
                text_based_goal=text_based_goal,
                test_case_reference=[],  # No test case reference for goal based run as of now
            )

            topic_name = (
                Constants.NOVA_WEB_EXECUTION_REQUEST_TOPIC_NAME
                if platform == "WEB"
                else Constants.NOVA_EXECUTION_REQUEST_TOPIC_NAME
            )

            message_id = publish_to_pubsub(
                NovaExecutionRequest(
                    nova_execution_params=nova_execution_params
                ).model_dump(),
                config.gcp_project_id,
                topic_name,
            )
            orionis_log(f"Message published to {topic_name} with id:{message_id}")
        except Exception as e:
            orionis_log(f"Error in plan_goal_based_run: {e}", e)
            raise e
