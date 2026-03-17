from constants import Constants
from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from organisations.org_datastore import OrganisationDatastore
from organisations.org_service import OrganisationService
from products.product_datastore import ProductDatastore
from products.product_service import ProductService
from products.product_request_validator import ProductRequestValidator
from test_runs.test_run_datastore import TestRunDatastore
from test_runs.test_run_service import TestRunService
from test_runs.test_run_request_validator import TestRunRequestValidator
import logging
from users.user_datastore import UserDatastore
from users.user_request_validator import UserRequestValidator
from users.user_service import UserService
from utils.util import orionis_log
from mixpanel_integration.mixpanel_service import mixpanel
from services.notify_service.notify import NotificationService
import datetime

logger = logging.getLogger(__name__)


class OnboardingService:
    def __init__(self):
        self.org_service = OrganisationService(OrganisationDatastore())
        self.product_service = ProductService(
            ProductDatastore(), ProductRequestValidator()
        )
        self.test_run_service = TestRunService(
            TestRunRequestValidator(), TestRunDatastore()
        )
        self.user_service = UserService(UserRequestValidator(), UserDatastore())
        self.notification_service = NotificationService()

    def onboard_new_user(
        self, request_entity: ApiRequestEntity, user_id: str
    ) -> ApiResponseEntity:
        """Main function to handle new user onboarding process."""
        orionis_log(f"Starting onboarding process for user: {user_id}")
        request_data = request_entity.data

        try:
            user_details = self._update_user(request_entity, user_id)
            if not isinstance(user_details, dict):
                return user_details

            if Constants.FIELD_ORGANISATION_ID in request_data:
                orionis_log(
                    f"Successfully completed onboarding for new user with link: {user_id}"
                )

                # Track User Signed Up event for invitation link users
                try:
                    orionis_log("[MIXPANEL] Tracking User Signed Up")

                    properties = {
                        "joined_via_invitation": True,
                        "organisation_id": request_data[
                            Constants.FIELD_ORGANISATION_ID
                        ],
                        "email": user_details.get(Constants.FIELD_EMAIL, ""),
                        "first_name": user_details.get(Constants.FIELD_FIRST_NAME, ""),
                        "last_name": user_details.get(Constants.FIELD_LAST_NAME, ""),
                    }

                    # Track the event
                    tracking_result = mixpanel.track(
                        user_id, "User Signed Up", properties
                    )

                    if tracking_result:
                        orionis_log("[MIXPANEL] Successfully tracked User Signed Up")
                    else:
                        orionis_log("[MIXPANEL] Failed to track User Signed Up")

                    # Update user profile in Mixpanel
                    mixpanel.identify(
                        user_id,
                        {
                            "organisation_id": request_data[
                                Constants.FIELD_ORGANISATION_ID
                            ],
                            "joined_via_invitation": True,
                            "signup_completed_at": datetime.datetime.now().isoformat(),
                            "$email": user_details.get(Constants.FIELD_EMAIL, ""),
                            "$first_name": user_details.get(
                                Constants.FIELD_FIRST_NAME, ""
                            ),
                            "$last_name": user_details.get(
                                Constants.FIELD_LAST_NAME, ""
                            ),
                        },
                    )
                except Exception as e:
                    orionis_log(
                        f"[MIXPANEL] Error tracking User Signed Up: {str(e)}", e
                    )

                return ApiResponseEntity(
                    status_code=200,
                    response={
                        "message": "User onboarded successfully",
                        Constants.FIELD_USER: user_details,
                    },
                )

            organisation = self._onboard_org(request_entity, user_id)
            if not isinstance(organisation, dict):
                return organisation

            try:
                org_name = organisation.get(Constants.FIELD_ORGANISATION_NAME, "")
                self.notification_service.notify_new_org(user_details, org_name)
            except Exception as e:
                orionis_log(
                    f"Failed to send Slack notification for org creation: {str(e)}",
                    e,
                )

            product = self._create_product(request_data, organisation)
            if not isinstance(product, dict):
                return product

            # test_run = self._create_test_run(request_data, product, user_id)
            # if not isinstance(test_run, dict):
            #    return test_run

            # Track User Signed Up event for new users creating organization/product
            try:
                orionis_log("[MIXPANEL] Tracking User Signed Up")

                properties = {
                    "joined_via_invitation": False,
                    "created_new_org": True,
                    "organisation_id": organisation.get(
                        Constants.FIELD_ORGANISATION_ID
                    ),
                    "product_id": product.get(Constants.FIELD_PRODUCT_ID),
                    "product_name": product.get(Constants.FIELD_PRODUCT_NAME),
                    "has_web_url": bool(request_data.get(Constants.FIELD_WEB_URL, "")),
                    "has_google_play_url": bool(
                        request_data.get(Constants.FIELD_GOOGLE_PLAY_STORE_URL, "")
                    ),
                    "has_apple_app_url": bool(
                        request_data.get(Constants.FIELD_APPLE_APP_STORE_URL, "")
                    ),
                    "email": user_details.get(Constants.FIELD_EMAIL, ""),
                    "first_name": user_details.get(Constants.FIELD_FIRST_NAME, ""),
                    "last_name": user_details.get(Constants.FIELD_LAST_NAME, ""),
                }

                # Track the event
                tracking_result = mixpanel.track(user_id, "User Signed Up", properties)

                if tracking_result:
                    orionis_log("[MIXPANEL] Successfully tracked User Signed Up")
                else:
                    orionis_log("[MIXPANEL] Failed to track User Signed Up")

                # Update user profile in Mixpanel
                mixpanel.identify(
                    user_id,
                    {
                        "organisation_id": organisation.get(
                            Constants.FIELD_ORGANISATION_ID
                        ),
                        "product_id": product.get(Constants.FIELD_PRODUCT_ID),
                        "product_name": product.get(Constants.FIELD_PRODUCT_NAME),
                        "created_new_org": True,
                        "joined_via_invitation": False,
                        "signup_completed_at": datetime.datetime.now().isoformat(),
                        "$email": user_details.get(Constants.FIELD_EMAIL, ""),
                        "$first_name": user_details.get(Constants.FIELD_FIRST_NAME, ""),
                        "$last_name": user_details.get(Constants.FIELD_LAST_NAME, ""),
                    },
                )

            except Exception as e:
                orionis_log(f"[MIXPANEL] Error tracking User Signed Up: {str(e)}", e)

            orionis_log(f"Successfully completed onboarding for user: {user_id}")
            return ApiResponseEntity(
                status_code=200,
                response={
                    "message": "User onboarded successfully",
                    Constants.FIELD_ORGANISATION: organisation,
                    Constants.FIELD_PRODUCT: product,
                    # Constants.FIELD_TEST_RUN: test_run,
                },
            )
        except Exception as e:
            orionis_log(f"Error during user onboarding: {e}", e)
            return ApiResponseEntity(
                status_code=500,
                response={"message": f"Error during onboarding: {str(e)}"},
            )

    def _onboard_org(
        self, request_entity: ApiRequestEntity, user_id: str
    ) -> dict | ApiResponseEntity:
        """Handle organization creation or retrieval."""
        request_data = request_entity.data
        orionis_log("Processing organization details")

        if Constants.FIELD_ORGANISATION_ID in request_data:
            org_id = request_data[Constants.FIELD_ORGANISATION_ID]
            orionis_log(f"Using existing organization: {org_id}")
            return {Constants.FIELD_ORGANISATION_ID: org_id}

        orionis_log("Creating new organization")
        org_response = self.org_service.add_organisation(request_entity, user_id)

        if org_response.status_code != 200:
            logger.error("Failed to create organization")
            return ApiResponseEntity(
                status_code=500,
                response={"message": "Error occurred while creating organisation"},
            )

        if not isinstance(org_response.response, dict):
            logger.error("Unexpected response format from add_organisation")
            return ApiResponseEntity(
                status_code=500,
                response={
                    "message": "Unexpected response format from add_organisation"
                },
            )

        orionis_log(
            f"Successfully created organization: {org_response.response.get(Constants.FIELD_ORGANISATION_ID)}"
        )
        return org_response.response

    def _create_product(
        self, request_data: dict, organisation: dict
    ) -> dict | ApiResponseEntity:
        """Create a new product for the organization."""
        orionis_log("Creating new product")

        product_request = ApiRequestEntity(
            method=ApiRequestEntity.API_METHOD_POST,
            data={
                Constants.FIELD_ORGANISATION_ID: organisation[
                    Constants.FIELD_ORGANISATION_ID
                ],
                Constants.FIELD_PRODUCT_NAME: request_data.get(
                    Constants.FIELD_PRODUCT_NAME
                ),
                Constants.FIELD_WEB_URL: request_data.get(Constants.FIELD_WEB_URL, ""),
                Constants.FIELD_GOOGLE_PLAY_STORE_URL: request_data.get(
                    Constants.FIELD_GOOGLE_PLAY_STORE_URL, ""
                ),
                Constants.FIELD_APPLE_APP_STORE_URL: request_data.get(
                    Constants.FIELD_APPLE_APP_STORE_URL, ""
                ),
                Constants.FIELD_DEFAULT_CREDENTIALS: request_data.get(
                    Constants.FIELD_DEFAULT_CREDENTIALS
                ),
            },
        )

        product_response = self.product_service.add_product(product_request)
        if product_response.status_code != 200:
            logger.error("Failed to create product")
            return ApiResponseEntity(
                status_code=500,
                response={"message": "Error occurred while adding product"},
            )

        if not isinstance(product_response.response, dict):
            logger.error("Unexpected response format from add_product")
            return ApiResponseEntity(
                status_code=500,
                response={"message": "Unexpected response format from add_product"},
            )

        orionis_log(
            f"Successfully created product: {product_response.response.get(Constants.FIELD_PRODUCT_ID)}"
        )
        return product_response.response

    def _create_test_run(
        self, request_data: dict, product: dict, user_id: str
    ) -> dict | ApiResponseEntity:
        """Create an initial test run for the product."""
        orionis_log("Creating initial test run")

        test_run_request = ApiRequestEntity(
            method=ApiRequestEntity.API_METHOD_POST,
            data={
                Constants.FIELD_PRODUCT_ID: product[Constants.FIELD_PRODUCT_ID],
                Constants.FIELD_TEST_RUN_NAME: "Demo Test Run",
                Constants.FIELD_EXECUTABLE_URL: "",
                Constants.FIELD_BUILD_NUMBER: "Latest",
            },
        )

        test_run_response = self.test_run_service.add_test_run(
            test_run_request, user_id
        )
        if test_run_response.status_code != 200:
            logger.error("Failed to create test run")
            return ApiResponseEntity(
                status_code=500,
                response={"message": "Error occurred while creating test run"},
            )

        if not isinstance(test_run_response.response, dict):
            logger.error("Unexpected response format from add_test_run")
            return ApiResponseEntity(
                status_code=500,
                response={"message": "Unexpected response format from add_test_run"},
            )

        orionis_log(
            f"Successfully created test run for product: {product[Constants.FIELD_PRODUCT_ID]}"
        )
        return test_run_response.response

    def _update_user(
        self, request_entity: ApiRequestEntity, user_id: str
    ) -> dict | ApiResponseEntity:
        """Update user details."""
        orionis_log("Updating user details")
        orionis_log(f"Request entity: {request_entity}")
        user_details = self.user_service.update_user(request_entity, user_id)
        if user_details.status_code != 200:
            logger.error("Failed to update user details")
            return ApiResponseEntity(
                status_code=500,
                response={"message": "Error occurred while updating user details"},
            )
        if not isinstance(user_details.response, dict):
            logger.error("Unexpected response format from update_user")
            return ApiResponseEntity(
                status_code=500,
                response={"message": "Unexpected response format from update_user"},
            )
        orionis_log(
            f"Successfully updated user details: {user_details.response.get(Constants.FIELD_USER_ID)}"
        )

        return user_details.response
