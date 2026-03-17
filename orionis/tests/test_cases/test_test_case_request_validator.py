import pytest
from datetime import datetime
from test_cases.test_case_request_validator import TestCaseRequestValidator
from test_cases.test_case_models import UpdateTestCaseRequestParams
from typing import Dict, Any
from test_cases.test_case_models import RawTestCaseStep


class TestTestCaseRequestValidator:
    def setup_method(self):
        self.validator = TestCaseRequestValidator()
        self.valid_request: Dict[str, Any] = {
            "test_case_id": "test_123",
            "product_id": "prod_123",
            "feature_id": "feat_123",
            "request_id": "req_123",
            "screenshot_url": "https://example.com/screenshot.png",
            "created_at": datetime.now(),
            "preconditions": ["User is logged in"],
            "test_case_description": "Test description",
            "test_case_steps": [
                {
                    "test_step_id": "step_1",
                    "step_description": "Step 1",
                    "expected_results": ["Result 1"],
                }
            ],
            "test_case_type": "functional",
        }

    def test_invalid_request_type_raises_error(self):
        # Arrange
        request = "not a dict"

        # Act & Assert
        with pytest.raises(ValueError):
            self.validator.validate_update_test_case_request_params(request)

    def test_request_without_test_case_id_raises_error(self):
        # Arrange
        request = self.valid_request.copy()
        del request["test_case_id"]

        # Act & Assert
        with pytest.raises(ValueError):
            self.validator.validate_update_test_case_request_params(request)

    def test_request_without_product_id_raises_error(self):
        # Arrange
        feature_id = "feat_123"
        request = {"feature_id": feature_id}

        # Act & Assert
        with pytest.raises(ValueError):
            self.validator.validate_update_test_case_request_params(request)

    def test_request_without_test_case_details_raises_error(self):
        # Arrange
        request = self.valid_request.copy()
        del request["test_case_id"]

        # Act & Assertx
        with pytest.raises(ValueError):
            self.validator.validate_update_test_case_request_params(request)

    def test_valid_request_returns_raw_test_case(self):
        # Act
        result = self.validator.validate_update_test_case_request_params(
            self.valid_request
        )

        # Assert
        assert isinstance(result, UpdateTestCaseRequestParams)
        assert result.test_case_id == self.valid_request["test_case_id"]
        assert result.feature_id == self.valid_request["feature_id"]
        assert result.product_id == self.valid_request["product_id"]
        assert result.request_id == self.valid_request["request_id"]
        assert result.screenshot_url == self.valid_request["screenshot_url"]
        assert isinstance(result.created_at, datetime)
        assert result.preconditions == self.valid_request["preconditions"]
        assert (
            result.test_case_description == self.valid_request["test_case_description"]
        )
        assert len(result.test_case_steps or []) == len(
            self.valid_request["test_case_steps"]
        )
        for i, test_step in enumerate(result.test_case_steps or []):
            assert isinstance(test_step, RawTestCaseStep)
            assert (
                test_step.test_step_id
                == self.valid_request["test_case_steps"][i]["test_step_id"]
            )
            assert (
                test_step.step_description
                == self.valid_request["test_case_steps"][i]["step_description"]
            )
            assert (
                test_step.expected_results
                == self.valid_request["test_case_steps"][i]["expected_results"]
            )

    # Shoould not be mandatory
    # def test_missing_fields_in_test_case_details_raises_error(self):
    #     # Arrange
    #     invalid_requests = [
    #         # Missing preconditions
    #         {**self.valid_request, "preconditions": None},
    #         # Missing test_case_description
    #         {**self.valid_request, "test_case_description": None},
    #         # Missing test_case_type
    #         {**self.valid_request, "test_case_type": None},
    #     ]

    #     # Act & Assert
    #     for request in invalid_requests:
    #         with pytest.raises(ValueError):
    #             self.validator.validate_update_test_case_request_params(request)

    def test_missing_fields_in_test_steps_raises_error(self):
        # Arrange
        invalid_requests = [
            # Invalid test_steps - missing test_step_id
            {
                **self.valid_request,
                "test_case_steps": [
                    {
                        "step_description": "Step 1",
                        "expected_results": ["Result 1"],
                    }
                ],
            },
            # Invalid test_steps - missing step_description
            {
                **self.valid_request,
                "test_case_steps": [
                    {"test_step_id": "1", "expected_results": ["Result 1"]},
                ],
            },
            # Invalid test_steps - missing expected_results
            {
                **self.valid_request,
                "test_case_steps": [
                    {"test_step_id": "1", "step_description": "Step 1"},
                ],
            },
        ]

        # Act & Assert
        for request in invalid_requests:
            with pytest.raises(ValueError):
                self.validator.validate_update_test_case_request_params(request)
