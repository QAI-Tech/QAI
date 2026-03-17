from typing import Dict, Any, List
import json
import time
from gateway.gateway_models import ApiResponseEntity, ApiRequestEntity
from test_case_under_execution.test_case_under_exec_models import (
    TestCaseUnderExecution,
    CreateTestCaseUnderExecutionParams,
    ExecutionStatus,
    TestCaseStep,
)
from verification.translation_verification.translation_verification_models import (
    TranslationVerificationRequestParams,
    TranslationVerificationResponseParams,
)
from verification.translation_verification.translation_verification_request_validator import (
    TranslationVerificationRequestValidator,
)
from verification.translation_verification.translation_verification_response_models import (
    TranslationValidationResponse,
    TranslationValidationResult,
)
from verification.translation_verification.translation_verification_prompts import (
    VALIDATE_TRANSLATIONS_PROMPT,
)
from verification.translation_verification.translation_verification_json_schemas import (
    validate_translations_response_schema,
)
from test_cases.test_case_datastore import TestCaseDatastore
from test_cases.test_case_models import RawTestCase
from test_case_under_execution.test_case_under_exec_datastore import (
    TestCaseUnderExecutionDatastore,
)
from llm_model import LLMModelWrapper
from common.google_cloud_wrappers import GCPFileStorageWrapper
from utils.util import orionis_log
from core.frame_extractor import FrameExtractor
from utils.util import url_to_uri
from constants import Constants
import uuid

# Constants
TRANSLATION_VERIFICATION_BUCKET_NAME = "test_case_planning_inputs"


class TranslationsVerifier:
    """Main class for verifying translations with required dependencies."""

    def __init__(
        self,
        test_case_datastore: TestCaseDatastore,
        test_case_under_exec_datastore: TestCaseUnderExecutionDatastore,
        llm_model: LLMModelWrapper,
        file_storage: GCPFileStorageWrapper,
        verification_request_validator: TranslationVerificationRequestValidator,
    ):
        self.tc_db = test_case_datastore
        self.tcue_db = test_case_under_exec_datastore
        self.llm_model = llm_model
        self.file_storage = file_storage
        self.verification_request_validator = verification_request_validator
        self.extractor = FrameExtractor()

    def verify_translations(self, request_data: ApiRequestEntity) -> ApiResponseEntity:
        try:
            start_time = time.time()
            params: TranslationVerificationRequestParams = (
                self.verification_request_validator.validate_translation_verification_request_params(
                    request_data.data
                )
            )

            tcue_id = params.tcue_id

            orionis_log(f"Starting translation verification for tcue_id: {tcue_id}")

            tcue = self.tcue_db.get_test_case_under_execution_by_ids([tcue_id])[0]

            test_case = self.tc_db.fetch_test_cases_by_ids([tcue.test_case_id])[0]

            test_steps = self.get_test_steps(test_case)

            image_urls = self._fetch_screen_frames(tcue)

            validation_result = self._validate_translations(
                image_urls=image_urls,
                test_steps=test_steps,
                tcue_id=params.tcue_id,
            )

            processing_time_ms = int((time.time() - start_time) * 1000)

            total_issues = sum(
                len(result.issues)
                for result in validation_result.response.detailed_results
            )

            new_tcue_id: str = ""
            try:
                new_status = (
                    ExecutionStatus.PASSED
                    if total_issues == 0
                    else ExecutionStatus.FAILED
                )

                fixed_step = TestCaseStep(
                    test_step_id=str(uuid.uuid4()),
                    step_description=Constants.TRANSLATION_TCUE_STEP_DESCRIPTION,
                    expected_results=Constants.TRANSLATION_TCUE_STEP_EXPECTED_RESULTS,
                )

                if new_status == ExecutionStatus.FAILED:
                    notes_str = self.create_execution_notes(
                        validation_result.response.model_dump()
                    )
                else:
                    notes_str = ""

                if tcue.test_case_description:
                    test_case_description = "\n".join(
                        [
                            "Original Description: " + str(tcue.test_case_description),
                            "",
                            Constants.TRANSLATION_TCUE_DESCRIPTION,
                        ]
                    )
                else:
                    test_case_description = Constants.TRANSLATION_TCUE_DESCRIPTION

                new_entity = CreateTestCaseUnderExecutionParams(
                    test_case_id=f"TRANSLATION_{tcue.id}",
                    test_run_id=tcue.test_run_id,
                    title=(
                        f"Translation verification for {tcue.title}"
                        if tcue.title
                        else "Translation verification"
                    ),
                    product_id=tcue.product_id,
                    feature_id=tcue.feature_id,
                    functionality_id=tcue.functionality_id,
                    request_id=tcue.request_id,
                    assignee_user_id=tcue.assignee_user_id,
                    status=new_status,
                    notes=notes_str,
                    rationale=tcue.rationale,
                    screenshot_url=tcue.screenshot_url,
                    execution_video_url=tcue.execution_video_url,
                    test_case_description=test_case_description,
                    test_case_steps=[fixed_step],
                    test_case_type=tcue.test_case_type,
                    preconditions=tcue.preconditions,
                    comments=tcue.comments,
                    criticality=tcue.criticality,
                    metadata=tcue.metadata,
                )

                new_tcue_id = self.tcue_db.add_test_case_under_execution(new_entity)
            except Exception as e:
                orionis_log("Error creating translation verification TCUE:", e)
                return ApiResponseEntity(
                    response={"error": "Error creating translation verification TCUE"},
                    status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
                )

            response_params = TranslationVerificationResponseParams(
                tcue_id=new_tcue_id,
                status=validation_result.response.overall_status.value,
                validation_summary=validation_result.response.validation_summary,
                confidence_score=validation_result.response.confidence_score,
                issues_count=total_issues,
            )

            orionis_log(
                f"Translation verification completed for tcue_id: {new_tcue_id}. "
                f"Status: {response_params.status}, "
                f"Confidence: {response_params.confidence_score}%, "
                f"Issues: {response_params.issues_count}, "
                f"Processing time: {processing_time_ms}ms"
            )

            return ApiResponseEntity(
                response=response_params.model_dump(),
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except ValueError as ve:
            orionis_log(f"Value error in verify_translations: {ve}", ve)
            return ApiResponseEntity(
                response={"error": str(ve)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in verify_translations: {e}", e)
            return ApiResponseEntity(
                response={
                    "error": "Internal server error during translation verification"
                },
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def _fetch_screen_frames(self, tcue: TestCaseUnderExecution) -> List[str]:
        """Fetch screen frames from TCUE video at annotation timestamps and upload to GCP bucket."""
        orionis_log(f"Fetching screen frames for tcue_id: {tcue.id}")
        image_urls: List[str] = []
        video_gcs_uri = tcue.execution_video_url  # Assume this field exists
        annotation_timestamps = tcue.annotations or []
        base_dir = f"tcue_{tcue.id}/translation_validation/frames"
        try:
            video_gcs_uri = url_to_uri(tcue.execution_video_url)
        except ValueError as e:
            orionis_log(
                f"Invalid video URL format: {tcue.execution_video_url}, skipping frame extraction iwth error: {e}"
            )
            return []

        # Download video to a temp file if it's a GCS URI
        if video_gcs_uri.startswith("gs://"):
            tmp_file_path = self.file_storage.download_file_locally(
                uri=video_gcs_uri, generation=None, use_constructed_bucket_name=False
            )
        else:
            tmp_file_path = video_gcs_uri
        for idx, ts_str in enumerate(annotation_timestamps):
            try:
                # Convert timestamp string (seconds) to int milliseconds for extractor
                timestamp_sec = float(ts_str)
                timestamp_millis = int(timestamp_sec * 1000)
                frame_bytes = self.extractor.extract_frame_at_timestamp(
                    tmp_file_path, timestamp_millis
                )
                frame_blob_name = (
                    f"{base_dir}/frame_{idx+1:02d}_{timestamp_sec:.3f}.png"
                )
                gcs_url = self.file_storage.store_bytes(
                    bytes=frame_bytes,
                    bucket_name=TRANSLATION_VERIFICATION_BUCKET_NAME,
                    blob_name=frame_blob_name,
                    content_type="image/png",
                )
                image_urls.append(gcs_url)
            except Exception as e:
                orionis_log(f"Failed to extract/upload frame at {ts_str}s: {e}")
                continue

        orionis_log(
            f"Fetched and uploaded {len(image_urls)} frames for tcue_id: {tcue.id}"
        )
        return image_urls

    def get_test_steps(self, test_case: RawTestCase) -> List[Dict[str, Any]]:
        """
        Extracts and normalizes test steps from a RawTestCase object.
        Converts TestCaseStep to dict if type is None, otherwise returns as-is.
        Falls back to a mock if test_case_steps is missing or empty.
        """
        test_steps = getattr(test_case, "test_case_steps", None)
        if not test_steps or not isinstance(test_steps, list):
            # Fallback mock steps for robustness/testing
            return [
                {
                    "step_description": "Enter the registered email address in the 'E-Mail Addresse' field.",
                    "expected_results": [
                        "The email address is displayed in the 'E-Mail Addresse' field."
                    ],
                },
                {
                    "step_description": "Enter the correct password in the 'Passwort' field.",
                    "expected_results": [
                        "The password is masked in the 'Passwort' field."
                    ],
                },
                {
                    "step_description": "Tap on the 'Done' button in the keyboard.",
                    "expected_results": ["The user is redirected to the home screen."],
                },
            ]
        normalized_steps = []
        for step in test_steps:
            # If it's a TestCaseStep and type is None, convert to dict
            if (
                hasattr(step, "type")
                and getattr(step, "type", None) is None
                and hasattr(step, "model_dump")
            ):
                step_dict = step.model_dump()
                normalized_steps.append(
                    {
                        "step_description": step_dict.get("step_description", ""),
                        "expected_results": step_dict.get("expected_results", []),
                    }
                )
            elif isinstance(step, dict):
                desc = step.get("step_description") or step.get("description") or ""
                expected = step.get("expected_results") or step.get("expected") or []
                normalized_steps.append(
                    {
                        "step_description": desc,
                        "expected_results": expected,
                    }
                )
            else:
                # If step is a model/object, try to extract fields
                desc = getattr(step, "step_description", None) or getattr(
                    step, "description", ""
                )
                expected = getattr(step, "expected_results", None) or getattr(
                    step, "expected", []
                )
                normalized_steps.append(
                    {
                        "step_description": desc,
                        "expected_results": expected,
                    }
                )

        return normalized_steps

    def _validate_translations(
        self, image_urls: List[str], test_steps: List[Dict[str, Any]], tcue_id: str
    ) -> TranslationValidationResult:
        """Validate translations using LLM with image and JSON input."""
        orionis_log(f"Validating translations for tcue_id: {tcue_id}")
        orionis_log(f"Processing {len(image_urls)} images with test case data")

        test_steps_string = json.dumps(test_steps, indent=2)
        prompt = VALIDATE_TRANSLATIONS_PROMPT.replace(
            "${test_steps}",
            test_steps_string,
        )

        # Create reusable directory path for all files
        base_dir = f"tcue_{tcue_id}/translation_validation"

        prompt_stored_url = self.file_storage.store_file(
            prompt,
            TRANSLATION_VERIFICATION_BUCKET_NAME,
            f"{base_dir}/prompt_validate_translations.txt",
            "text/plain",
        )

        llm_response = self.llm_model.call_llm_v3(
            prompt=prompt,
            image_urls=image_urls,
            response_schema=validate_translations_response_schema,
        )

        response_stored_url = self.file_storage.store_file(
            llm_response,
            TRANSLATION_VERIFICATION_BUCKET_NAME,
            f"{base_dir}/response_validate_translations.json",
            "application/json",
        )

        json_data = json.loads(llm_response)
        validation_response = TranslationValidationResponse.model_validate(json_data)

        # Calculate total issues count from detailed results
        total_issues = sum(
            len(result.issues) for result in validation_response.detailed_results
        )

        orionis_log(
            f"Translation validation completed for tcue_id: {tcue_id}. "
            f"Status: {validation_response.overall_status}, "
            f"Confidence: {validation_response.confidence_score}%, "
            f"Issues found: {total_issues}, "
            f"Prompt stored at: {prompt_stored_url}, "
            f"Response stored at: {response_stored_url}"
        )

        return TranslationValidationResult(
            tcue_id=tcue_id,
            response=validation_response,
            prompt_stored_url=prompt_stored_url,
            response_stored_url=response_stored_url,
        )

    def create_execution_notes(self, report: dict) -> str:
        exec_notes_lines = []

        if "validation_summary" in report and report["validation_summary"]:
            total_issues = sum(
                len(screen["issues"]) for screen in report["detailed_results"]
            )
            exec_notes_lines.append("## Summary")
            exec_notes_lines.append(report["validation_summary"])
            exec_notes_lines.append(
                f"Found {total_issues} translation and mixed-language issues across {len(report['detailed_results'])} screens."
            )
            exec_notes_lines.append("")

        for screen in report["detailed_results"]:
            if not screen.get("issues"):  # Only mention screens with issues
                continue
            exec_notes_lines.append(f"## {screen['screen_name']}")
            exec_notes_lines.append("")
            for idx, issue in enumerate(screen["issues"], 1):
                note_entry = f"{issue.get('description')} {issue.get('suggestion')}"
                exec_notes_lines.append(f"{idx}. {note_entry}  ")
                exec_notes_lines.append(f"❌   {issue.get('actual_text')}  ")
                exec_notes_lines.append(f"✅   {issue.get('expected_text')}  ")
                exec_notes_lines.append("")

        if report.get("recommendations"):
            exec_notes_lines.append("## Overall Recommendations")
            for rec in report["recommendations"]:
                exec_notes_lines.append(f" - {rec}")

        return "\n".join(exec_notes_lines)
