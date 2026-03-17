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

---

# Process Interactions API

This document describes the `/orchestrator/{product_id}/{session_id}/process-interactions` endpoint that allows you to process interactions with screenshots using LLM analysis.

## Endpoint

```
POST /orchestrator/{product_id}/{session_id}/process-interactions
```

## Description

Processes interactions with screenshots using LLM analysis to generate transition information. This endpoint analyzes each interaction by comparing before and after screenshots to detect screen transitions and generate detailed transition descriptions.

## Parameters

### Required

- `session_id` (string): The ID of the session to process (in URL path)

### Optional

- `reset_cache` (boolean, default: false): If true, will reprocess interactions even if cached results exist
- `session_dir` (string): Custom session directory path (defaults to uploads/session_id)

## Request Methods

### Method 1: JSON Body

```bash
curl -X POST "http://localhost:5000/orchestrator/your_product_id/your_session_id/process-interactions" \
  -H "Content-Type: application/json" \
  -d '{"reset_cache": true}'
```

### Method 2: Query Parameters

```bash
curl -X POST "http://localhost:5000/orchestrator/your_product_id/your_session_id/process-interactions?reset_cache=true"
```

## Examples

### Process interactions without cache reset (default)

```bash
curl -X POST "http://localhost:5000/orchestrator/product_456/session_123/process-interactions" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Process interactions with cache reset

```bash
curl -X POST "http://localhost:5000/orchestrator/product_456/session_123/process-interactions" \
  -H "Content-Type: application/json" \
  -d '{"reset_cache": true}'
```

### Using custom session directory

```bash
curl -X POST "http://localhost:5000/orchestrator/product_456/session_123/process-interactions" \
  -H "Content-Type: application/json" \
  -d '{"session_dir": "/custom/path/to/session"}'
```

## Response

### Success Response (200)

```json
{
  "status": "completed",
  "session_id": "session_123",
  "message": "Successfully processed 5 interactions",
  "total_interactions_processed": 5,
  "results": [
    {
      "interaction_type": "tap",
      "coordinates": [186, 1601],
      "before_screenshot_path": "screenshots/ss_20250826_195149_469.png",
      "after_screenshot_path": "screenshots/ss_20250826_195227_339.png",
      "llm_analysis": {
        "transition_description": "The user tapped on the login button at coordinates (186, 1601), which triggered a transition from the home screen to the login screen.",
        "transition_summary": "Click on login button",
        "interaction_details": {
          "before_screen_name": "Home screen",
          "interaction_type": "tap",
          "coordinates": [186, 1601],
          "after_screen_name": "Login screen",
          "screen_transition": true
        }
      }
    }
  ]
}
```

### Cached Response (200)

```json
{
  "status": "completed",
  "session_id": "session_123",
  "message": "Using cached interaction analysis results",
  "results_file": "uploads/session_123/interaction_analysis_20250827_000410.json",
  "results": {
    "session_id": "session_123",
    "analysis_timestamp": "20250827_000410",
    "total_interactions_processed": 5,
    "interactions": [...]
  }
}
```

### Error Response (404)

```json
{
  "error": "Interactions file not found: uploads/session_123/interactions.json"
}
```

### Error Response (500)

```json
{
  "error": "Error message"
}
```

## Required Files

The endpoint expects the following files to exist in the session directory:

- `interactions.json`: List of interaction data with timestamps, types, coordinates, and screenshot filenames
- `screenshots/`: Directory containing PNG screenshot files referenced in interactions.json

## LLM Analysis Output

Each interaction processed will include an `llm_analysis` field containing:

- **transition_description**: Detailed description of the transition
- **transition_summary**: Single line summary (may include parameterized placeholders like `{{menu option}}`)
- **interaction_details**:
  - `before_screen_name`: Name of the screen before interaction
  - `interaction_type`: Type of interaction (tap, input, swipe, back)
  - `coordinates`: Screen coordinates where interaction occurred
  - `after_screen_name`: Name of the screen after interaction
  - `screen_transition`: Boolean indicating if a screen transition occurred

## Caching Behavior

- **Cache files**: `interaction_analysis_*.json` files
- **Behavior**: Skips processing if analysis files exist and `reset_cache=false`
- **Cache busting**: Set `reset_cache=true` to force reprocessing

## Notes

- Requires a valid Gemini API key set in `REMOVED` environment variable
- Each interaction requires before and after screenshots for optimal analysis
- LLM calls may take time depending on the number of interactions
- Results are automatically saved to `interaction_analysis_*.json` files
- The endpoint handles missing screenshots gracefully and continues processing
