from datetime import datetime
from unittest.mock import Mock
from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from test_cases.test_case_service import TestCaseService
from test_cases.test_case_models import RawTestCase, RawTestCaseStep


class TestTestCaseService:
    def setup_method(self):
        self.request_validator = Mock()
        self.datastore = Mock()
        self.feature_service = Mock()
        self.notify_service = Mock()
        self.user_service = Mock()
        self.task_service = Mock()
        self.product_datastore = Mock()
        self.service = TestCaseService(
            self.request_validator,
            self.datastore,
            self.feature_service,
            self.notify_service,
            self.user_service,
            self.product_datastore,
            self.task_service,
        )

        self.task_service.enqueue_task_v1.return_value = None

        # Setup common test data
        self.valid_test_case = RawTestCase(
            test_case_id="test_123",
            product_id="prod_123",
            feature_id="feat_123",
            request_id="req_123",
            screenshot_url="https://example.com/screenshot.png",
            created_at=datetime.now(),
            preconditions=["User is logged in"],
            test_case_description="Test description",
            test_case_type="functional",
            test_case_steps=[
                RawTestCaseStep(
                    test_step_id="step_1",
                    step_description="Step 1",
                    expected_results=["Result 1"],
                )
            ],
        )

    def test_non_post_method_returns_method_not_allowed(self):
        # Arrange
        request = ApiRequestEntity(method="GET", data=self.valid_test_case.model_dump())

        # Act
        response = self.service.update_test_case(request)

        # Assert
        assert isinstance(response, ApiResponseEntity)
        assert response.status_code == ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED
        assert "error" in response.response

        # Verify interactions
        self.request_validator.validate_update_test_case_request_params.assert_not_called()
        self.datastore.update_test_case.assert_not_called()

    def test_validation_error_returns_bad_request(self):
        # Arrange
        request = ApiRequestEntity(
            method="POST", data=self.valid_test_case.model_dump()
        )
        error_message = "Invalid test case data"
        # Mock the request validator to raise a ValueError when validate_update_test_case_request_params is called
        self.request_validator.validate_update_test_case_request_params.side_effect = (
            ValueError(error_message)
        )

        # Act
        response = self.service.update_test_case(request)

        # Assert
        assert isinstance(response, ApiResponseEntity)
        assert response.status_code == ApiResponseEntity.HTTP_STATUS_BAD_REQUEST
        assert "error" in response.response

        # Verify interactions
        self.request_validator.validate_update_test_case_request_params.assert_called_once_with(
            request.data
        )
        self.datastore.update_test_case.assert_not_called()

    def test_datastore_error_returns_internal_server_error(self):
        # Arrange
        request = ApiRequestEntity(
            method="POST", data=self.valid_test_case.model_dump()
        )
        self.request_validator.validate_update_test_case_request_params.return_value = (
            self.valid_test_case
        )
        error_message = "Database connection failed"
        # Mock the datastore to raise an Exception when update_test_case is called
        self.datastore.update_test_case.side_effect = Exception(error_message)

        # Act
        response = self.service.update_test_case(request)

        # Assert
        assert isinstance(response, ApiResponseEntity)
        assert (
            response.status_code == ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR
        )
        assert "error" in response.response

        # Verify interactions
        self.request_validator.validate_update_test_case_request_params.assert_called_once_with(
            request.data
        )
        self.datastore.update_test_case.assert_called_once_with(self.valid_test_case)

    def test_successful_test_case_update_returns_ok_response(self):
        # Arrange
        request = ApiRequestEntity(
            method="POST", data=self.valid_test_case.model_dump()
        )
        self.request_validator.validate_update_test_case_request_params.return_value = (
            self.valid_test_case
        )
        # Mock the datastore to return the valid test case when update_test_case is called
        self.datastore.update_test_case.return_value = self.valid_test_case

        # Act
        response = self.service.update_test_case(request)

        # Assert
        assert isinstance(response, ApiResponseEntity)
        assert response.status_code == ApiResponseEntity.HTTP_STATUS_OK
        assert isinstance(response.response, dict)
        assert "test_case_id" in response.response
        assert response.response["test_case_id"] == self.valid_test_case.test_case_id
        assert "message" in response.response

        # Verify interactions
        self.request_validator.validate_update_test_case_request_params.assert_called_once_with(
            request.data
        )
        self.datastore.update_test_case.assert_called_once_with(self.valid_test_case)
