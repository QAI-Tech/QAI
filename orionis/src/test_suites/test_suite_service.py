from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from test_suites.test_suite_datastore import TestSuiteDatastore
from test_suites.test_suite_models import TestSuite
from test_suites.test_suite_request_validator import TestSuiteRequestValidator
from utils.util import orionis_log


class TestSuiteService:

    FIELD_TEST_SUITE_ID = "test_suite_id"
    FIELD_MESSAGE = "message"

    def __init__(
        self, datastore: TestSuiteDatastore, validator: TestSuiteRequestValidator
    ):
        self.datastore = datastore
        self.validator = validator

    def create_test_suite(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Only POST method is allowed for this function."},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            orionis_log(f"Creating test suite: {request.data}")
            params = self.validator.validate_create_test_suite_request_params(request)
            orionis_log(f"Validated test suite request: {params}")
            new_suite: TestSuite = self.datastore.create_test_suite(params)
            orionis_log(f"Created test suite: {new_suite}")
            return ApiResponseEntity(
                response=new_suite.model_dump(mode="json"),
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except ValueError as e:
            orionis_log("Error creating test suite", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log("Error creating test suite", e)
            return ApiResponseEntity(
                response={"error": "Internal server error while creating test suite"},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def get_test_suites(self, request: ApiRequestEntity) -> ApiResponseEntity:

        if request.method != ApiRequestEntity.API_METHOD_GET:
            return ApiResponseEntity(
                response={"error": "Method must be GET"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            product_id = request.data.get("product_id")

            if not product_id:
                raise ValueError("Product ID is required")

            orionis_log(f"Fetching test suites for product_id: {product_id}")

            test_suites: list[TestSuite] = (
                self.datastore.get_test_suites_by_product(product_id) or []
            )
            orionis_log(f"Fetched test suites: {test_suites}")

            return ApiResponseEntity(
                response={
                    "product_id": product_id,
                    "test_suites": (
                        [test_suite.model_dump() for test_suite in test_suites]
                        if test_suites
                        else []
                    ),
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log("Error getting test suites", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log("Error getting test suites", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def update_test_suite(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            test_suite = self.validator.validate_update_test_suite_request_params(
                request
            )
            orionis_log(
                f"Validated test suite update request for test suite {test_suite.test_suite_id} successfully"
            )
            updated_test_suite = self.datastore.update_test_suite(test_suite)
            orionis_log(
                f"Updated test suite {test_suite.test_suite_id} in datastore successfully"
            )
            return ApiResponseEntity(
                response={
                    self.FIELD_TEST_SUITE_ID: updated_test_suite.test_suite_id,
                    "updated_test_suite": updated_test_suite.model_dump(mode="json"),
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except ValueError as e:
            orionis_log("ValueError in update_test_suite:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log("Error in update_test_suite:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def delete_test_suite(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_DELETE:
            return ApiResponseEntity(
                response={"error": "Method must be DELETE"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            orionis_log(
                f"Deleting test suite with ID {request.data.get('test_suite_id')}"
            )
            test_suite_id = request.data.get("test_suite_id")

            if not test_suite_id:
                raise ValueError("Test suite ID is required")

            self.datastore.delete_test_suite(test_suite_id)

            orionis_log(f"Test suite with id {test_suite_id} deleted successfully")

            return ApiResponseEntity(
                response={
                    self.FIELD_TEST_SUITE_ID: test_suite_id,
                    self.FIELD_MESSAGE: "Test suite deleted successfully",
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log("ValueError in delete_test_suite:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log("Error in delete_test_suite:", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )
