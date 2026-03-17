import os
from gcp_upload.google_cloud_wrappers import GCPFileStorageWrapper
from gcp_upload.config import  config
from tc_executor.logger_config import logger as system_logger

def uploadVideoToGCP(local_video_filepath, bucket_name, dest_video_filepath):
    storage_wrapper = GCPFileStorageWrapper()
    bucket = storage_wrapper.get_bucket(bucket_name)

    system_logger.debug(f'Uploading video...')
    system_logger.debug(f'Local video path: {local_video_filepath}')
    system_logger.debug(f'Destination path in bucket: {dest_video_filepath}')

    if not os.path.isfile(local_video_filepath):
        system_logger.debug(f"[WARN] Video file not found: {local_video_filepath}")
        raise RuntimeError(f"Error Video file not found: {local_video_filepath}")

    content_type = 'video/mp4'
    with open(local_video_filepath, 'rb') as f:
        blob = bucket.blob(dest_video_filepath)
        blob.upload_from_file(f, content_type=content_type)

    system_logger.debug(f"[OK] Uploaded video to gs://{bucket.name}/{dest_video_filepath}")

def upload_state_to_gcs(local_dir_path: str, bucket_name: str, remote_dir_prefix: str, files_to_upload: list):
    storage_wrapper = GCPFileStorageWrapper()
    bucket = storage_wrapper.get_bucket(bucket_name)  # Use the same bucket instance everywhere

    for filename in files_to_upload:
        local_path = os.path.join(local_dir_path, filename)
        remote_path = os.path.join(remote_dir_prefix, filename)

        system_logger.debug(f'Processing: {filename}')
        system_logger.debug(f'Local path: {local_path}')
        system_logger.debug(f'Remote path: {remote_path}')

        if not os.path.isfile(local_path):
            system_logger.debug(f"[WARN] File not found: {local_path}")
            continue

        _, ext = os.path.splitext(filename)
        ext = ext.lower()

        if ext == '.png':
            content_type = 'image/png'
            with open(local_path, 'rb') as f:
                blob = bucket.blob(remote_path)
                blob.upload_from_file(f, content_type=content_type)
            system_logger.debug(f"[OK] Uploaded image to gs://{bucket.name}/{remote_path}")
        else:
            # Default to text/plain unless it's a JSON file
            content_type = 'application/json' if ext == '.json' else 'text/plain'
            with open(local_path, 'r', encoding='utf-8') as f:
                file_contents = f.read()
            storage_wrapper.store_file(file_contents, bucket_name, remote_path, content_type)
            system_logger.debug(f"[OK] Uploaded text file to gs://{bucket_name}/{remote_path}")


def uploadGeneratorState(local_dir_path: str, bucket_name: str, remote_dir_prefix: str):
    system_logger.debug('Uploading state type 1...')
    files = [
        'after_ss.png',
        'anomaly_detector_prompt.txt',
        'before_ss.png',
        'combined_ss.png',
        'expected_results_gen_prompt.txt',
        'get_next_step_prompt.txt',
        'log.json',
        'step_verifier_prompt.txt',
        'debug.log'
    ]
    upload_state_to_gcs(local_dir_path, bucket_name, remote_dir_prefix, files)

# Ths is also not being used anywhere so not changing bucket name here
def uploadExecutorState(local_dir_path: str, bucket_name: str, remote_dir_prefix: str):
    system_logger.debug('Uploading state type 2...')
    files = [
        'after_ss.png',
        'before_ss.png',
        'log.json',
    ]
    upload_state_to_gcs(local_dir_path, bucket_name, remote_dir_prefix, files)


"""
This is also not being used anywhere so not changing bucket name here 
# Trigger both uploads for testing
uploadGeneratorState(
    local_dir_path="./../flows/spoony_signup/state_0/",
    bucket_name="nova_assets",
    remote_dir_prefix="part_1_states/state_0"
)

uploadExecutorState(
    local_dir_path="./../executor_logs/2025-04-16_06-02-39/state_0_/",
    bucket_name="nova_assets",
    remote_dir_prefix="part_2_states/state_0_"
)
"""
