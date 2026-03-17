# Web Executor Assets

This directory stores assets generated during browser automation sessions.

## Directory Structure

```
assets/
├── videos/          # Browser session recordings (.mp4)
└── README.md        # This file
```

## Video Recordings

### Overview

Browser sessions are automatically recorded when `save_recording=True` in `NovaWebAgent.execute_task()`.

**Flow:**

1. Browser-use records session as MP4 during execution
2. Saved temporarily to `web_executor/assets/videos/browser_session_*.mp4`
3. After completion, uploaded to GCP as `execution_video.mp4`
4. Temporary file cleaned up
5. Dashboard displays video from GCP

### Format

- **Codec**: H.264 (libx264)
- **Container**: MP4
- **Framerate**: 30 FPS
- **Pixel Format**: yuv420p (universal compatibility)

### Naming Convention

Videos are named with timestamps:

```
browser_session_YYYYMMDD_HHMMSS.mp4
```

Example: `browser_session_20260115_143022.mp4`

### Storage

**Local (Temporary):**

- Videos temporarily saved to: `web_executor/assets/videos/browser_session_*.mp4`
- Automatically cleaned up after GCP upload

**GCP (Permanent):**

- Uploaded to: `gs://nova_assets-{env}/{product_id}/{test_run_id}/{tcue_id}/execution_video.mp4`
- Accessible by dashboard for test result visualization

### Integration with Nova

Videos are automatically integrated with Nova's dashboard:

- **Upload**: `video_utils.uploadWebExecutionVideo()` handles GCP upload
- **Cleanup**: Temporary files removed after successful upload
- **Dashboard**: Reads from `execution_video_url` in state log.json
- **Failure Recording**: Videos uploaded even on test failures for debugging

### Access in Code

```python
from web_executor.browser_agent import NovaWebAgent

agent = NovaWebAgent(gemini_api_key="your-key")
result = await agent.execute_task(
    task="Search for Python tutorials",
    save_recording=True  # Enable video recording
)

print(f"Video saved to: {result['video_path']}")
```

### Requirements

Video recording requires optional dependencies:

```bash
pip install "browser-use[video]"
# This installs: imageio[ffmpeg], pillow, numpy
```

### Disabling Recording

To disable video recording (faster execution):

```python
result = await agent.execute_task(
    task="...",
    save_recording=False  # Disable recording
)
```

## Maintenance

### Automatic Cleanup

Videos are automatically cleaned up after GCP upload:

- ✅ Temporary video deleted after successful upload
- ✅ Only execution_video.mp4 kept in tc_dirpath
- ✅ No manual cleanup needed for normal operation

### Manual Cleanup (If Needed)

If uploads fail and videos accumulate:

```bash
# Remove videos older than 7 days
find web_executor/assets/videos -name "*.mp4" -mtime +7 -delete
```

### Git Ignore

The `.gitignore` file excludes all videos from version control to keep the repository size manageable.

---

_Last updated: 2026-01-15_
