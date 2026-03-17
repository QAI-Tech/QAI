# Session Orchestrator

The Session Orchestrator is a centralized system that coordinates all post-session processing in a clean, sequential manner, eliminating the spaghetti calls and race conditions that existed in the previous implementation.

## Overview

### Problem Solved

Previously, when a session was stopped, multiple services would start processing independently:

- Video slicing would start in a background thread
- Audio transcription would start in another background thread
- LLM analysis would happen in yet another thread
- Graph generation would start independently
- No coordination between these processes
- Race conditions and potential failures

### Solution

The Session Orchestrator provides:

- **Sequential Processing**: All phases happen in order with clear dependencies
- **Progress Tracking**: Real-time status updates via WebSocket
- **Error Handling**: Centralized error management and recovery
- **Clean Architecture**: Single point of control for all post-session processing

## Architecture

```
Session Orchestrator
├── Phase 1: Video Processing
│   ├── Video Slicing
│   └── Transition Analysis (per slice)
├── Phase 2: Audio Processing
│   ├── Audio Transcription
│   └── Transcription-Interval Mapping
├── Phase 3: Interval Analysis
│   ├── Transcription-Interval Detection
│   └── LLM Interval Analysis
├── Phase 4: Graph Generation
│   ├── Graph Creation
│   └── Transition Integration
└── Phase 5: Cleanup & Notification
    ├── File Organization
    └── Status Reporting
```

## API Endpoints

### Start Session Processing

```http
POST /orchestrator/session/start
Content-Type: application/json

{
  "session_id": "20241201_143022"
}
```

### Get Processing Status

```http
GET /orchestrator/session/status
```

### Stop Processing

```http
POST /orchestrator/session/stop
```

### Get Session Results

```http
GET /orchestrator/session/{session_id}/results
```

## WebSocket Events

### Client to Server

- `get_session_status`: Request current processing status
- `stop_session_processing`: Stop current processing

### Server to Client

- `session_progress`: Real-time progress updates
- `session_status`: Current status information
- `session_processing_stopped`: Confirmation of stopped processing

## Processing Phases

### Phase 1: Video Processing (10% - 30%)

- Checks if video file exists
- Performs video slicing by annotations
- Handles transition analysis for each slice

### Phase 2: Audio Processing (35% - 50%)

- Checks if audio file exists
- Generates audio transcription if needed
- Maps transcriptions to intervals

### Phase 3: Interval Analysis (55% - 70%)

- Performs transcription-annotation interval detection
- Coordinates LLM analysis for intervals
- Processes transition analysis from transcriptions

### Phase 4: Graph Generation (75% - 90%)

- Creates graph with screenshots and transitions
- Integrates transition analysis results
- Generates final graph JSON
- Returns detailed graph creation results

### Phase 5: Cleanup (95% - 100%)

- Saves processing results to file
- Organizes output files
- Finalizes status reporting

## Integration

### Automatic Integration

The orchestrator is automatically triggered when a session is stopped via the recording service. The recording service now calls the orchestrator instead of the fire-and-forget video slicing.

### Manual Integration

You can also manually start processing for any session:

```python
# Via API
requests.post("http://localhost:5000/orchestrator/session/start",
             json={"session_id": "your_session_id"})

# Via WebSocket
socket.emit("get_session_status")
```

### Service Dependencies

The orchestrator requires direct references to all services:

- `recording_service`: For session management
- `video_slice_service`: For video processing
- `audio_service`: For audio processing
- `interval_service`: For interval analysis
- `graph_service`: For graph generation
- `llm_wrapper`: For LLM operations

This explicit dependency injection makes the orchestrator more maintainable and testable.

## Frontend Integration

The frontend now includes a session processing status panel that shows:

- Current processing phase
- Progress bar with percentage
- Status messages
- Stop processing button

The status updates in real-time via WebSocket connections.

## Error Handling

The orchestrator includes comprehensive error handling:

- Each phase can fail independently without affecting others
- Errors are logged and stored in the results
- Processing continues even if some phases fail
- Detailed error messages are provided

## Configuration

The orchestrator uses the same configuration as other services and can be customized by modifying the processing phases in the `SessionOrchestrator` class.

## Testing

Run the test script to verify the orchestrator functionality:

```bash
python test_orchestrator.py
```

## Migration from Legacy System

The orchestrator is designed to be backward compatible:

- If the orchestrator is not available, the system falls back to the legacy fire-and-forget approach
- Existing sessions can be processed using the new orchestrator
- No changes required to existing session data
- All async methods have been replaced with synchronous versions for better reliability

## Benefits

1. **Reliability**: Sequential processing eliminates race conditions
2. **Visibility**: Real-time progress tracking with detailed results
3. **Maintainability**: Single point of control
4. **Testability**: Easier to test individual phases
5. **Scalability**: Easy to add new processing phases
6. **Error Recovery**: Better error handling and recovery mechanisms
7. **Synchronous Operations**: All operations are now synchronous and return actual results
