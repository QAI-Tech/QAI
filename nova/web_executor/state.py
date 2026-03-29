"""
State management for web test execution.
Similar to tc_generator/state.py but for browser-use results.
"""
import os
import json
import time
from typing import Optional
from utils.utils import nova_log, _trigger_update_execution_data


class WebExecutionState:
    """State object for web test execution."""
    
    def __init__(self, state_id, root_dirpath, user_goal, start_time):
        """
        Initialize web execution state.
        
        Args:
            state_id: Identifier for this state (e.g., 'final', 0, 1, ...)
            root_dirpath: Root directory for logging
            user_goal: The test goal/task
            start_time: Timestamp when execution started
        """
        self.state_id = state_id
        self.user_goal = user_goal
        self.start_time = start_time
        self.outdirpath = os.path.join(root_dirpath, f'state_{state_id}')
        os.makedirs(self.outdirpath, exist_ok=True)
        
        # Test metadata
        self.test_case_id = -1
        self.test_case_under_execution_id = -1
        self.test_run_id = -1
        self.product_id = -1
        self.status = "EXECUTING"  # PASSED / FAILED / EXECUTING / ATTEMPT_FAILED
        
        # Results
        self.exceptions = []
        self.explanation = ""
        self.screenshots = []
        self.steps_taken = 0
        
        # GCP paths
        self.gcp_root_path = ""
        self.execution_video_url = ""
    
    def change_status_to_pass(self):
        """Set status to PASSED."""
        self.status = "PASSED"
    
    def change_status_to_fail(self):
        """Set status to FAILED."""
        self.status = "FAILED"
    
    def change_status_to_attempt_failed(self):
        """Set status to ATTEMPT_FAILED."""
        self.status = "ATTEMPT_FAILED"
    
    def add_exceptions(self, exceptions: list):
        """Add exceptions to state."""
        self.exceptions = exceptions
    
    def add_explanation(self, explanation: str):
        """Add explanation for pass/fail."""
        self.explanation = explanation
    
    def add_ids(self, test_case_id, test_case_under_execution_id, test_run_id, product_id):
        """
        Set IDs and construct GCP paths.
        
        Args:
            test_case_id: Test case ID
            test_case_under_execution_id: TCUE ID
            test_run_id: Test run ID
            product_id: Product ID
        """
        self.test_case_id = test_case_id
        self.test_case_under_execution_id = test_case_under_execution_id
        self.test_run_id = test_run_id
        self.product_id = product_id
        
        # Construct GCP paths
        self.gcp_root_path = f"{product_id}/{test_run_id}/{test_case_under_execution_id}/state_{self.state_id}"
        self.execution_video_url = f"{product_id}/{test_run_id}/{test_case_under_execution_id}/execution_video.mp4"
    
    def log(self, bucket_name: str = 'nova_assets', upload_to_gcp: bool = False, video_url: str = ""):
        """
        Log state to disk and optionally to GCP.
        
        Args:
            bucket_name: GCP bucket name
            upload_to_gcp: Whether to upload to GCP
            video_url: URL to execution video
        """
        logfilepath = os.path.join(self.outdirpath, 'log.json')
        
        output_data = {
            "user_goal": self.user_goal,
            "time_spent_min": (time.time() - self.start_time) / 60,
            "state_id": self.state_id,
            "platform": "WEB",
            "test_case_id": self.test_case_id,
            "test_case_under_execution_id": self.test_case_under_execution_id,
            "test_run_id": self.test_run_id,
            "product_id": self.product_id,
            "status": self.status,
            "execution_video_url": video_url or self.execution_video_url,
            "exceptions": self.exceptions,
            "explanation": self.explanation,
            "steps_taken": self.steps_taken,
        }
        
        nova_log(f"Logging web state {self.state_id} to {logfilepath}")
        
        with open(logfilepath, 'w') as f:
            json.dump(output_data, f, indent=2)
        
        # Copy debug log if final state
        if self.state_id == 'final':
            debug_path = os.path.join(os.getcwd(), 'debug.log')
            if os.path.exists(debug_path):
                import shutil
                shutil.copy(debug_path, os.path.join(self.outdirpath, 'debug.log'))
        
        # Upload to GCP if requested
        if upload_to_gcp:
            try:
                from gcp_upload.log_states import uploadGeneratorState
                nova_log(f"Uploading web state to GCP bucket: {bucket_name}")
                uploadGeneratorState(
                    local_dir_path=self.outdirpath,
                    bucket_name=bucket_name,
                    remote_dir_prefix=self.gcp_root_path
                )
                nova_log("GCP upload completed successfully")
            except Exception as e:
                nova_log(f"Failed to upload to GCP: {str(e)}", e)

        # Trigger update explicitly because EventArc triggers have been neutered!
        # Only trigger at the very end of executing the final step.
        if self.state_id == 'final':
            _trigger_update_execution_data(output_data)
