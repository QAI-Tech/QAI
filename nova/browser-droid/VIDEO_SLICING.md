# Video Slicing Functionality

## Overview

The video slicing feature automatically splits recorded videos into segments based on screen annotation timestamps. This creates n+1 video slices for every n screen annotations within the video bounds.

## How It Works

1. **Automatic Trigger**: Video slicing runs automatically in a background thread after recording stops
2. **Annotation Processing**: The system reads all screen annotations for the session and sorts them by timestamp
3. **Video Bounds**: Only annotations within the actual video duration are considered
4. **Slice Generation**: Creates segments as follows:
   - Slice 1: Beginning of video to first annotation timestamp
   - Slice 2: First annotation timestamp to second annotation timestamp
   - ...
   - Slice n+1: Last annotation timestamp to end of video

## File Structure

```
uploads/
└── {session_id}/
    ├── recording_{session_id}.mp4          # Original recording
    ├── annotations.json                    # Screen annotations with timestamps
    ├── video_slices/                       # Generated video slices
    │   ├── {session_id}_slice_1.mp4
    │   ├── {session_id}_slice_2.mp4
    │   └── ...
    └── ...
```

## Naming Convention

- **Format**: `{session_id}_slice_{n}.mp4`
- **Example**: `20241201_120000_slice_1.mp4`

## Dependencies

- **FFmpeg**: Required for video processing (checked during setup)
- **FFprobe**: Used to get video duration

## Error Handling

- **No annotations**: Process is skipped with appropriate logging
- **Video not found**: Error logged, process skipped
- **FFmpeg errors**: Detailed error logging for debugging
- **Invalid timestamps**: Warnings logged, invalid timestamps ignored

## Logging

The system logs all major milestones:

- Video slicing start
- Video duration detection
- Annotation processing
- Segment generation
- Individual slice creation
- Completion status

## Manual Testing

You can manually trigger video slicing for testing:

# Using the API endpoint
curl -X POST http://localhost:8000/video/slice/{session_id}
```

## Background Processing

Video slicing runs in a daemon thread to avoid blocking the main application. The process is "fire-and-forget" - it starts automatically when recording stops and completes independently.

## Performance Considerations

- Uses multiple FFmpeg approaches for maximum compatibility:
  1. H.264 re-encoding (most compatible)
  2. Stream copy (fastest when possible)
  3. Conservative re-encoding (fallback)
- Processes slices sequentially to avoid overwhelming the system
- Includes timeout protection for FFmpeg operations
- Background processing prevents UI blocking
- Verifies generated files are playable before marking as successful
- Skips segments shorter than 0.5 seconds to avoid issues

## Troubleshooting

### Unplayable Video Slices

If some video slices cannot be played:

1. **Check logs**: Look for FFmpeg error messages in the application logs
2. **Verify FFmpeg**: Ensure FFmpeg and FFprobe are properly installed
3. **Check disk space**: Ensure sufficient disk space for video processing
4. **Review timestamps**: Verify annotation timestamps are within video bounds
5. **Manual testing**: Use the test script to isolate issues

### Common Issues

- **"No such file or directory"**: FFmpeg not found in PATH
- **"Invalid data found"**: Corrupted input video file
- **"Permission denied"**: Insufficient permissions for output directory
- **"Timeout"**: Video processing taking too long (increase timeout if needed)
