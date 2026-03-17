import os, shutil, subprocess
from utils.utils import nova_log

def list_gcs_directories(bucket_path):
    """List directories in the given GCS bucket path."""
    cmd = ["gsutil", "ls", bucket_path + "/"]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    
    if result.returncode != 0:
        raise RuntimeError(f"Failed to list GCS directories: {result.stderr}")
    
    # Filter only the timestamp folders
    folders = result.stdout.strip().split('\n')
    timestamp_dirs = [folder.rstrip('/').split('/')[-1] for folder in folders]
    return timestamp_dirs

def get_latest_timestamp_dir(dirs):
    """Sort lexicographically to get the latest timestamp."""
    return sorted(dirs)[-1] if dirs else None

# Not being used anywhere so not changing bucket name here
def download_latest_timestamp_dir(gcp_prefix, outdirpath, bucket_name='nova_assets'):
    GCS_ROOT_PATH = os.path.join(f'gs://{bucket_name}', gcp_prefix, '*')
    nova_log(f'Will download files from {GCS_ROOT_PATH}...')

    # Use gsutil to download
    cmd = ["gsutil", "-m", "cp", "-r", GCS_ROOT_PATH, outdirpath]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    
    if result.returncode != 0:
        nova_log(f"Error downloading from GCS: {result.stderr}", Exception(result.stderr))
        raise RuntimeError(f"Failed to download latest directory: {result.stderr}")
    nova_log("Download complete.")
