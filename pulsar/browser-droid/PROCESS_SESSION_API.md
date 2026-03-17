# Process Session API

This document describes the new `/orchestrator/session/process` endpoint that allows you to trigger session processing on demand with optional cache busting.

## Endpoint

```
POST /orchestrator/session/{session_id}/process
```

## Description

Triggers the complete session processing workflow for a given session ID. This endpoint is similar to `/orchestrator/session/start` but includes an optional cache busting feature.

## Parameters

### Required

- `session_id` (string): The ID of the session to process (in URL path)

### Optional

- `reset_cache` (boolean, default: false): If true, each processing phase will clear its cache and reprocess

## Request Methods

### Method 1: JSON Body

```bash
curl -X POST "http://localhost:5000/orchestrator/session/your_session_id/process" \
  -H "Content-Type: application/json" \
  -d '{"reset_cache": true}'
```

### Method 2: Query Parameters

```bash
curl -X POST "http://localhost:5000/orchestrator/session/your_session_id/process?reset_cache=true"
```

## Examples

### Process session without cache reset (default)

```bash
curl -X POST "http://localhost:5000/orchestrator/session/session_123/process" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Process session with cache reset

```bash
curl -X POST "http://localhost:5000/orchestrator/session/session_123/process" \
  -H "Content-Type: application/json" \
  -d '{"reset_cache": true}'
```

### Using query parameters

```bash
curl -X POST "http://localhost:5000/orchestrator/session/session_123/process?reset_cache=true"
```

## Response

### Success Response (200)

```json
{
  "status": "started",
  "session_id": "session_123",
  "reset_cache": true,
  "message": "Session processing started with reset_cache=true"
}
```

### Error Response (400)

```json
{
  "error": "Invalid session ID"
}
```

### Error Response (500)

```json
{
  "error": "Error message"
}
```

## Selective Cache Reset

When `reset_cache` is set to `true`, each processing phase will:

1. **Check if its output files already exist**
2. **Clear only its own cache if reset_cache=true**
3. **Skip processing if files exist and reset_cache=false**
4. **Proceed with processing if files don't exist or reset_cache=true**

### Processing Phases and Their Cache Files:

#### Video Processing Phase

- **Cache files**: `video_slices/` directory
- **Behavior**: Skips if directory exists and `reset_cache=false`

#### Audio Processing Phase

- **Cache files**: `*_transcription.json` files
- **Behavior**: Skips if transcription exists and `reset_cache=false`

#### Interval Analysis Phase

- **Cache files**: `transcripted_intervals.json`, `transitions.json`
- **Behavior**: Skips if either file exists and `reset_cache=false`

#### Graph Generation Phase

- **Cache files**: `graph.json`
- **Behavior**: Skips if file exists and `reset_cache=false`

#### Cleanup Phase

- **Cache files**: `processing_results.json`
- **Behavior**: Skips if file exists and `reset_cache=false`

### Files Always Preserved (Original Files)

- `recording_{session_id}.mp4`
- `audio_{session_id}.wav`
- `annotations.json`
- `ss_*.png` files (screenshots created during recording)
- Other original session files

## Processing Workflow

The session processing includes the following phases:

1. **Video Processing**: Slices video by annotations
2. **Audio Processing**: Generates audio transcriptions
3. **Interval Analysis**: Detects and analyzes transcription-annotation intervals
4. **Graph Generation**: Creates session graph with transitions
5. **Cleanup**: Finalizes and saves processing results

## Monitoring Progress

Use the existing `/orchestrator/session/status` endpoint to monitor processing progress:

```bash
curl "http://localhost:5000/orchestrator/session/status"
```

## Stopping Processing

Use the existing `/orchestrator/session/stop` endpoint to stop processing:

```bash
curl -X POST "http://localhost:5000/orchestrator/session/stop"
```

## Notes

- Only one session can be processed at a time
- If a session is already being processed, the request will return an error
- Selective cache reset is useful when you want to reprocess specific phases or when cached results are corrupted
- Each phase independently checks its cache, allowing for efficient partial reprocessing
- The original recording and audio files are always preserved during cache reset
