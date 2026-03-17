import pytest
import json
from unittest.mock import Mock
from verification.translation_verification.translation_verifier import (
    TranslationsVerifier,
)
from gateway.gateway_models import ApiRequestEntity
from verification.translation_verification.translation_verification_models import (
    TranslationVerificationRequestParams,
)


class TestTranslationsVerifier:
    @pytest.fixture
    def mock_dependencies(self):
        """Create mock dependencies for testing."""
        return {
            "test_case_datastore": Mock(),
            "test_case_under_exec_datastore": Mock(),
            "llm_model": Mock(),
            "file_storage": Mock(),
            "verification_request_validator": Mock(),
        }

    @pytest.fixture
    def verifier(self, mock_dependencies):
        """Create TranslationsVerifier instance with mock dependencies."""
        return TranslationsVerifier(**mock_dependencies)

    @pytest.fixture
    def sample_request_data(self):
        """Sample request data for testing."""
        return {
            "product_id": "test_product_123",
            "flow_id": "test_flow_456",
            "tcue_id": "test_tcue_789",
            "annotations": ["annotation1", "annotation2"],
            "image_urls": [
                "https://example.com/image1.jpg",
                "https://example.com/image2.jpg",
            ],
            "test_case_data": {
                "expected_elements": [
                    {"type": "button", "text": "Sign In"},
                    {"type": "label", "text": "Welcome"},
                ],
                "expected_text": ["Sign In", "Welcome", "Email", "Password"],
            },
        }

    @pytest.fixture
    def mock_llm_response(self):
        """Mock LLM response for testing."""
        return {
            "overall_status": "fail",
            "confidence_score": 85,
            "validation_summary": "Found 2 translation issues",
            "detailed_results": [
                {
                    "screen_index": 0,
                    "screen_name": "Login Screen",
                    "status": "fail",
                    "issues": [
                        {
                            "issue_id": "translation_001",
                            "element_type": "button",
                            "expected_text": "Sign In",
                            "actual_text": "SignIn",
                            "issue_type": "spacing",
                            "description": "Missing space in button text",
                            "severity": "low",
                            "suggestion": "Add space between 'Sign' and 'In'",
                            "affected_elements": ["login_button"],
                        }
                    ],
                }
            ],
            "recommendations": [
                "Review spacing in button labels",
                "Ensure consistent capitalization",
            ],
        }

    def test_verify_translations_with_images_and_json(
        self, verifier, sample_request_data, mock_llm_response
    ):
        """Test translation verification with image URLs and JSON input."""
        # Setup mocks
        verifier.verification_request_validator.validate_translation_verification_request_params.return_value = TranslationVerificationRequestParams(
            **sample_request_data
        )

        # Mock TCUE and test case data
        mock_tcue = Mock()
        mock_tcue.id = "test_tcue_789"
        mock_tcue.test_case_id = "test_case_123"
        mock_tcue.annotations = ["1.2", "2.0"]
        mock_tcue.test_run_id = "test_run_123"
        mock_tcue.product_id = "test_product_123"
        mock_tcue.feature_id = "test_feature_123"
        mock_tcue.functionality_id = "test_functionality_123"
        mock_tcue.request_id = "test_request_123"
        mock_tcue.assignee_user_id = "test_user_123"
        mock_tcue.rationale = "test rationale"
        mock_tcue.screenshot_url = "https://example.com/screenshot.jpg"
        mock_tcue.execution_video_url = "https://example.com/video.mp4"
        mock_tcue.test_case_type = "SMOKE"
        mock_tcue.preconditions = ["precondition1", "precondition2"]
        mock_tcue.comments = "test comments"
        mock_tcue.criticality = "HIGH"
        mock_tcue.metadata = "test metadata"
        mock_tcue.title = "Test Login Flow"

        mock_test_case = Mock()
        mock_test_case.id = "test_case_123"
        mock_test_case.name = "Test Login Flow"
        mock_test_case.expected_elements = []
        mock_test_case.expected_text = []
        mock_test_case.annotations = []

        verifier.tcue_db.get_test_case_under_execution_by_ids.return_value = [mock_tcue]
        verifier.tc_db.fetch_test_cases_by_ids.return_value = [mock_test_case]

        # Mock LLM response
        verifier.llm_model.call_llm_v3.return_value = json.dumps(mock_llm_response)

        # Mock file storage
        verifier.file_storage.store_file.return_value = (
            "https://storage.example.com/file.txt"
        )

        verifier.tcue_db.add_test_case_under_execution.return_value = "new_tcue_123"

        # Execute
        request_entity = ApiRequestEntity(data=sample_request_data, method="POST")
        result = verifier.verify_translations(request_entity)

        # Assertions
        assert result.response["tcue_id"] == "new_tcue_123"
        assert result.response["status"] == "fail"
        assert result.response["confidence_score"] == 85
        assert result.response["issues_count"] == 1

        # Verify LLM was called with correct parameters
        verifier.llm_model.call_llm_v3.assert_called_once()

        # Verify file storage was called for both prompt and response
        assert verifier.file_storage.store_file.call_count == 2

    def test_verify_translations_without_images_falls_back_to_fetching(
        self, verifier, sample_request_data
    ):
        """Test that when no images provided, it falls back to fetching from TCUE."""
        # Remove image_urls from request data
        sample_request_data.pop("image_urls")

        # Setup mocks
        verifier.verification_request_validator.validate_translation_verification_request_params.return_value = TranslationVerificationRequestParams(
            **sample_request_data
        )

        # Mock TCUE and test case data
        mock_tcue = Mock()
        mock_tcue.id = "test_tcue_789"
        mock_tcue.test_case_id = "test_case_123"
        mock_tcue.annotations = ["1.0", "2.0"]
        mock_tcue.test_run_id = "test_run_123"
        mock_tcue.product_id = "test_product_123"
        mock_tcue.feature_id = "test_feature_123"
        mock_tcue.functionality_id = "test_functionality_123"
        mock_tcue.request_id = "test_request_123"
        mock_tcue.assignee_user_id = "test_user_123"
        mock_tcue.rationale = "test rationale"
        mock_tcue.screenshot_url = "https://example.com/screenshot.jpg"
        mock_tcue.execution_video_url = "https://example.com/video.mp4"
        mock_tcue.test_case_type = "SMOKE"
        mock_tcue.preconditions = ["precondition1", "precondition2"]
        mock_tcue.comments = "test comments"
        mock_tcue.criticality = "HIGH"
        mock_tcue.metadata = "test metadata"
        mock_tcue.title = "Test Login Flow"

        mock_test_case = Mock()
        mock_test_case.id = "test_case_123"
        mock_test_case.name = "Test Login Flow"
        mock_test_case.expected_elements = []
        mock_test_case.expected_text = []
        mock_test_case.annotations = []

        verifier.tcue_db.get_test_case_under_execution_by_ids.return_value = [mock_tcue]
        verifier.tc_db.fetch_test_cases_by_ids.return_value = [mock_test_case]

        # Mock LLM response
        verifier.llm_model.call_llm_v3.return_value = json.dumps(
            {
                "overall_status": "pass",
                "confidence_score": 90,
                "validation_summary": "All good",
                "detailed_results": [],
                "recommendations": [],
            }
        )

        # Mock file storage
        verifier.file_storage.store_file.return_value = (
            "https://storage.example.com/file.txt"
        )

        verifier.tcue_db.add_test_case_under_execution.return_value = "new_tcue_456"

        # Execute
        request_entity = ApiRequestEntity(data=sample_request_data, method="POST")
        result = verifier.verify_translations(request_entity)

        # Verify _fetch_screen_frames was called
        assert result.response["tcue_id"] == "new_tcue_456"
        assert result.response["status"] == "pass"
