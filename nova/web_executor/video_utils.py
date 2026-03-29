"""
Web Executor Video Utilities
Handles video upload for browser-use recorded videos.
Adapted from utils/utils.py but works directly with MP4 files instead of screenshots.
"""
import os
import shutil
from gcp_upload.log_states import uploadVideoToGCP
from utils.utils import construct_bucket_name, nova_log


def uploadWebExecutionVideo(video_src_path: str, args, bucket_name: str = 'nova_assets'):
    """
    Upload browser-use recorded video to GCP for dashboard display.
    
    Unlike Android flow that creates video from screenshots, this function
    uploads the already-recorded MP4 from browser-use's VideoRecorderService.
    
    Args:
        video_src_path: Path to browser-use recorded video (e.g., assets/videos/browser_session_*.mp4)
        args: Arguments containing:
            - tc_dirpath: Local test case directory
            - product_id: Product ID
            - test_run_id: Test run ID  
            - test_case_under_execution_id: Test case under execution ID
            - environment: Environment (production/staging/dev)
        bucket_name: GCP bucket name (default: 'nova_assets')
    
    Returns:
        tuple: (local_video_path, gcp_video_url)
            - local_video_path: Path where video is saved locally (tc_dirpath/execution_video.mp4)
            - gcp_video_url: GCP path for dashboard ({product_id}/{test_run_id}/{tcue_id}/execution_video.mp4)
    
    Raises:
        FileNotFoundError: If video_src_path doesn't exist
        RuntimeError: If upload to GCP fails
    """
    nova_log(f"[VIDEO UPLOAD] Starting web execution video upload")
    nova_log(f"[VIDEO UPLOAD] Source: {video_src_path}")
    
    # Validate source video exists
    if not os.path.isfile(video_src_path):
        error_msg = f"Video file not found: {video_src_path}"
        nova_log(f"[ERROR] {error_msg}")
        raise FileNotFoundError(error_msg)
    
    # Get video file size
    video_size_mb = os.path.getsize(video_src_path) / (1024 * 1024)
    nova_log(f"[VIDEO UPLOAD] Video size: {video_size_mb:.2f} MB")
    
    # Define local destination (Nova convention: tc_dirpath/execution_video.mp4)
    local_video_path = os.path.join(args.tc_dirpath, 'execution_video.mp4')
    
    # Copy/move video to expected location
    if video_src_path != local_video_path:
        nova_log(f"[VIDEO UPLOAD] Copying to: {local_video_path}")
        shutil.copy2(video_src_path, local_video_path)
        nova_log(f"[VIDEO UPLOAD] Video copied successfully")
    
    # Construct GCP path (Nova convention)
    gcp_video_url = f"{args.product_id}/{args.test_run_id}/{args.test_case_under_execution_id}/execution_video.mp4"
    nova_log(f"[VIDEO UPLOAD] GCP destination: {gcp_video_url}")
    
    # Construct full bucket name with environment suffix
    bucket = construct_bucket_name(bucket_name, args.environment)
    nova_log(f"[VIDEO UPLOAD] Bucket: {bucket}")
    
    # Upload to GCP
    try:
        nova_log(f"[NOVA-GCP-BYPASS] Skipping video upload to GCP for {local_video_path}")
    except Exception as e:
        error_msg = f"Failed to upload video to GCP: {str(e)}"
        nova_log(f"[ERROR] {error_msg}", e)
        raise RuntimeError(error_msg)
    
    return local_video_path, gcp_video_url


def cleanupLocalVideo(video_path: str, keep_local: bool = False):
    """
    Cleanup local video file after upload.
    
    Args:
        video_path: Path to video file to cleanup
        keep_local: If True, keep the file; if False, delete it (default: False)
    """
    if keep_local:
        nova_log(f"[VIDEO CLEANUP] Keeping local video: {video_path}")
        return
    
    try:
        if os.path.isfile(video_path):
            os.remove(video_path)
            nova_log(f"[VIDEO CLEANUP] Deleted local video: {video_path}")
        else:
            nova_log(f"[VIDEO CLEANUP] Video already deleted: {video_path}")
    except Exception as e:
        nova_log(f"[WARNING] Failed to delete local video: {str(e)}", e)


def prepareWebStateDirectory(tc_dirpath: str, state_id: str = 'final'):
    """
    Prepare state directory for web execution logging.
    Creates state directory if it doesn't exist.
    
    Args:
        tc_dirpath: Root test case directory
        state_id: State identifier (default: 'final')
    
    Returns:
        str: Path to state directory
    """
    state_dir = os.path.join(tc_dirpath, f'state_{state_id}')
    os.makedirs(state_dir, exist_ok=True)
    nova_log(f"[STATE PREP] Created state directory: {state_dir}")
    return state_dir


def saveWebExecutionMetadata(state_dir: str, result: dict, task: str):
    """
    Save web execution metadata for debugging.
    
    Args:
        state_dir: State directory path
        result: Result dict from browser-use agent
        task: Original task description
    """
    import json
    
    metadata = {
        'platform': 'WEB',
        'task': task,
        'status': result.get('status', 'unknown'),
        'steps_taken': result.get('steps', 0),
        'final_result': result.get('result', ''),
        'action_names': result.get('action_names', []),
        'video_path': result.get('video_path', ''),
    }
    
    metadata_path = os.path.join(state_dir, 'execution_metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    nova_log(f"[METADATA] Saved execution metadata to: {metadata_path}")


def uploadBlindRunArtifacts(blind_run_result: dict, args, bucket_name: str = 'nova_assets'):
    """
    Upload blind run artifacts (screenshots, log, graph) to GCP.

    Args:
        blind_run_result: Dict from BlindRunProcessor.process() with keys:
            - blind_run_ss_folder: Path to screenshots folder
            - blind_run_log: Path to blind_run_data.json
            - graph_blind: Path to graph_blind.json
        args: Arguments containing product_id, test_run_id, test_case_under_execution_id, environment
        bucket_name: GCP bucket name (default: 'nova_assets')
    """
    nova_log(f"[NOVA-GCP-BYPASS] Skipping blind run artifacts upload to GCP")


# Example usage in web_executor/main.py:
"""
from web_executor.video_utils import uploadWebExecutionVideo, cleanupLocalVideo

# After agent execution:
result = agent.execute_task_sync(task=prompt, url=base_url, max_steps=50)

if result['status'] == 'success' and result.get('video_path'):
    try:
        # Upload video to GCP
        local_path, gcp_url = uploadWebExecutionVideo(
            video_src_path=result['video_path'],
            args=args,
            bucket_name='nova_assets'
        )
        
        # Update state with video URL
        state.execution_video_url = gcp_url
        
        # Log state with video URL
        bucket = construct_bucket_name('nova_assets', args.environment)
        state.log(bucket_name=bucket, upload_to_gcp=True, video_url=gcp_url)
        
        # Optional: cleanup browser-use temp video
        cleanupLocalVideo(result['video_path'], keep_local=True)
        
    except Exception as e:
        nova_log(f"Video upload failed: {e}", e)
        # Fallback: log without video
        state.log(bucket_name=bucket, upload_to_gcp=True, video_url="")
"""
