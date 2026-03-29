import os
from tc_executor.logger_config import logger as system_logger

def uploadVideoToGCP(local_video_filepath, bucket_name, dest_video_filepath):
    system_logger.debug(f"[NOVA-GCP-BYPASS] Skipping video upload to gs://{bucket_name}/{dest_video_filepath}")

def upload_state_to_gcs(local_dir_path: str, bucket_name: str, remote_dir_prefix: str, files_to_upload: list):
    system_logger.debug(f"[NOVA-GCP-BYPASS] Skipping state upload to gs://{bucket_name}/{remote_dir_prefix}")

def uploadGeneratorState(local_dir_path: str, bucket_name: str, remote_dir_prefix: str):
    system_logger.debug(f"[NOVA-GCP-BYPASS] Skipping generator state upload.")

def uploadExecutorState(local_dir_path: str, bucket_name: str, remote_dir_prefix: str):
    system_logger.debug(f"[NOVA-GCP-BYPASS] Skipping executor state upload.")
