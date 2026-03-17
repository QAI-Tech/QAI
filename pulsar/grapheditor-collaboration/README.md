# GraphEditor Collaboration Server

A real-time collaboration server built with Flask-SocketIO that enables multiple users to collaborate in real-time through WebSocket connections. This project follows the same architectural patterns as the browser-droid project.

## Features

- **Room-based collaboration**: Users can join specific rooms using room IDs
- **Real-time event broadcasting**: All changes are broadcast to other users in the same room
- **Automatic room cleanup**: Empty rooms are cleaned up after 1 minute of inactivity
- **Cursor tracking**: Real-time cursor position sharing between users
- **Heartbeat system**: Keep-alive mechanism for connections
- **WebSocket-only communication**: All functionality accessible through WebSocket events
- **Graph persistence**: Save and load graph data to Google Cloud Storage
- **RESTful API**: HTTP endpoints for graph data management
- **Comprehensive logging**: Detailed logging throughout the application

## Architecture

The project follows the same structure and naming conventions as browser-droid:

```
grapheditor-collaboration/
├── server.py                 # Main server file with Flask app factory
├── requirements.txt          # Python dependencies
├── index.html               # Test client for collaboration
├── app/
│   ├── __init__.py
│   ├── config.py            # Configuration constants
│   ├── services/            # Business logic services
│   │   ├── __init__.py
│   │   ├── collaboration_service.py  # Main collaboration logic
│   │   ├── room_service.py           # Room management logic
│   │   └── graph_service.py          # Graph persistence to GCS
│   └── routes/              # Route handlers
│       ├── __init__.py
│       ├── socket_routes.py          # WebSocket event handlers
│       └── graph_routes.py           # HTTP API for graph data
```

## Installation

1. Create a virtual environment:

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Set up environment variables:

Create a `.env` file in the project root:

```bash
# Environment Configuration
ENVIRONMENT=development  # or production

# Google Cloud Storage Configuration
GCP_PROJECT_ID=your-gcp-project-id
GCP_SERVICE_ACCOUNT_PATH=gcp-service-account.json
```

4. Set up Google Cloud Storage:

- Create a service account in your GCP project
- Download the JSON key file and place it as `gcp-service-account.json` in the project root
- Ensure the service account has Storage Admin permissions
- Create the required buckets: `graph-editor` (dev) and `graph-editor-prod` (prod)

5. Run the server:

```bash
gunicorn --worker-class eventlet -w 1 -b 127.0.0.1:8001 server:app
```

The server will start on `http://localhost:8001`

## Graph Persistence API

The server includes a RESTful API for saving and loading graph data to Google Cloud Storage. All data is organized by product ID with the following structure:

```
qai-upload-temporary/productId_{product_id}/Collaboration/
├── graph-export.json    # Nodes and edges data
├── features-export.json # Features data
├── flows-export.json    # Flows data
└── comments.json        # Comments data
```

### API Endpoints

**Save complete graph:**

```bash
POST /api/graph/save
Content-Type: application/json

{
  "product_id": "your-product-id",
  "graph_data": { "nodes": [...], "edges": [...] },
  "features_data": { "features": [...], "exportedAt": "..." },
  "flows_data": { "flows": [...] },
  "comments_data": { "comments": [...], "exportedAt": "..." }
}
```

**Load complete graph:**

```bash
GET /api/graph/load/{product_id}
```

**Individual data endpoints:**

- `POST /api/graph/save-nodes-edges`
- `POST /api/graph/save-features`
- `POST /api/graph/save-flows`
- `POST /api/graph/save-comments`
- `GET /api/graph/load-nodes-edges/{product_id}`
- `GET /api/graph/load-features/{product_id}`
- `GET /api/graph/load-flows/{product_id}`
- `GET /api/graph/load-comments/{product_id}`

**Generate signed URL for direct upload:**

```bash
POST /api/graph/generate-upload-url
Content-Type: application/json

{
  "product_id": "your-product-id",
  "data_type": "graph", // or "features", "flows", "comments"
  "expiration_minutes": 15
}
```

### Apply Graph Events API

Use this endpoint when you want to replay collaboration events against the stored graph without establishing a WebSocket session. The server will download the current assets, apply the supplied events using the same logic as the live collaboration service, and push the updated assets back to the configured bucket.

```bash
POST /api/graph-events/apply
Content-Type: application/json

{
  "product_id": "your-product-id",
  "events": [
    {
      "type": "nodes_create",
      "data": [
        {
          "id": "node-123",
          "x": 120,
          "y": 80,
          "type": "rectangle",
          "description": "New node",
          "metadata": {
            "image": null
          }
        }
      ]
    },
    {
      "type": "edges_delete",
      "data": ["edge-42"]
    }
  ]
}
```

**Request rules**

- `product_id` must match the graph assets stored in GCS.
- `events` is an ordered array of collaboration events. Each entry should mirror the payload that your client emits over WebSocket (e.g., `nodes_create`, `nodes_update`, `flows_update`, `comments_delete`, etc.).
- Unsupported or malformed events are skipped and reported in the response.
- If a collaboration room for the `product_id` is currently active (has connected collaborators), the events are applied directly to that room's in-memory state and the standard autosave timer will persist changes. Otherwise, the request hydrates a temporary room, saves immediately, and tears it down when finished.

**Sample response**

```json
{
  "success": true,
  "mode": "offline_update",
  "product_id": "your-product-id",
  "events_received": 2,
  "events_applied": 2,
  "events_failed": [],
  "saved_at": "2025-11-12T12:34:56.123456",
  "storage_results": {
    "graph": {
      "success": true,
      "path": "qai-upload-temporary/productId_your-product-id/graph-export.json"
    },
    "features": { "success": true, "path": "..." },
    "flows": { "success": true, "path": "..." },
    "comments": { "success": true, "path": "..." }
  }
}
```

If any event fails, it will appear inside `events_failed` with the zero-based index and an error message. Successful requests always attempt to persist the full bundle (graph, features, flows, comments), even when some individual events fail.

When events are appended to an active room, the response includes `"mode": "active_room"` and persistence relies on the existing autosave timer instead of immediate storage writes.

For detailed API documentation, see [GRAPH_API_DOCUMENTATION.md](GRAPH_API_DOCUMENTATION.md).

### Testing the API

Run the test script to verify the Graph API is working:

```bash
python test_graph_api.py
```

This will test all endpoints and provide feedback on the API functionality.

## Usage

### WebSocket Events

#### Graph Editor Specific Events:

**Node Events:**

- `node_create`: Create a new node

  ```json
  {
    "id": "node1",
    "x": 100,
    "y": 100,
    "title": "Node Title",
    "type": "rectangle"
  }
  ```

- `node_delete`: Delete a node

  ```json
  {
    "id": "node1"
  }
  ```

- `node_description_change`: Change node description

  ```json
  {
    "id": "node1",
    "description": "New description"
  }
  ```

- `node_image_change`: Change node image

  ```json
  {
    "id": "node1",
    "image_url": "https://example.com/image.png"
  }
  ```

- `node_move`: Move a node
  ```json
  {
    "id": "node1",
    "x": 200,
    "y": 150
  }
  ```

**Edge Events:**

- `edge_create`: Create a new edge

  ```json
  {
    "id": "edge1",
    "source": "node1",
    "target": "node2"
  }
  ```

- `edge_delete`: Delete an edge

  ```json
  {
    "id": "edge1"
  }
  ```

- `edge_description_change`: Change edge description

  ```json
  {
    "id": "edge1",
    "description": "New edge description"
  }
  ```

- `edge_anchor_change`: Change edge anchor points
  ```json
  {
    "id": "edge1",
    "source_anchor": "bottom",
    "target_anchor": "top"
  }
  ```

**Feature Events:**

- `feature_create`: Create a new feature
- `feature_edit`: Edit an existing feature
- `feature_delete`: Delete a feature

**Flow Events:**

- `flow_create`: Create a new flow
- `flow_delete`: Delete a flow

**Comment Events:**

- `comment_add`: Add a new comment
- `comment_edit`: Edit an existing comment
- `comment_delete`: Delete a comment
- `comment_move`: Move a comment

#### General Collaboration Events:

- `collaboration_event`: Send general collaboration changes
  ```json
  {
    "type": "custom_action",
    "data": {
      "action": "highlight",
      "element_id": "node1"
    }
  }
  ```

#### Core System Events:

- `join_room`: Join a collaboration room

  ```json
  {
    "room_id": "room-123",
    "user_data": {
      "name": "User Name",
      "browser": "Chrome"
    }
  }
  ```

- `leave_room`: Leave current room

  ```json
  {}
  ```

- `cursor_movement`: Send cursor position

  ```json
  {
    "position": {
      "x": 150,
      "y": 200
    }
  }
  ```

- `heartbeat`: Keep connection alive

  ```json
  {}
  ```

- `get_status`: Request current status
  ```json
  {}
  ```

#### Server → Client Events:

- `connection_status`: Connection confirmation
- `room_joined`: Successfully joined room
- `room_left`: Successfully left room
- `user_joined`: Another user joined the room
- `user_left`: Another user left the room
- `collaboration_event`: Collaboration changes from other users
- `cursor_movement`: Cursor movements from other users
- `heartbeat_response`: Heartbeat acknowledgment
- `status_response`: Status information
- Various error events with descriptive messages

### Additional WebSocket Events for Server Management

- `get_server_stats`: Request server statistics

  - Response: `server_stats_response` with total clients, rooms, etc.

- `get_all_rooms`: Request information about all active rooms

  - Response: `all_rooms_response` with rooms data

- `get_room_info`: Request specific room information

  ```json
  { "room_id": "room-123" }
  ```

  - Response: `room_info_response` with room details

- `force_cleanup_room`: Force cleanup of a specific room
  ```json
  { "room_id": "room-123" }
  ```
  - Response: `room_cleanup_response` with success status

### Testing

Open `index.html` in multiple browser tabs/windows to test real-time collaboration:

1. Enter the same room ID in different tabs
2. Click "Join Room" in each tab
3. Move your mouse in the collaboration area to see cursor sharing
4. Send collaboration events to see real-time broadcasting

## Configuration

Edit `app/config.py` to modify:

- `ROOM_CLEANUP_DELAY`: Time before empty rooms are cleaned up (default: 60 seconds)
- `MAX_USERS_PER_ROOM`: Maximum users per room (default: 100)
- Server host and port settings

## Services

### CollaborationService

Handles all collaboration-related WebSocket events including:

- Client connections and disconnections
- Room joining/leaving
- Broadcasting collaboration events
- Cursor movement tracking
- Heartbeat management

### RoomService

Manages collaboration rooms including:

- Room creation and cleanup
- User management within rooms
- Broadcasting to room members
- Automatic cleanup timers
- Room statistics and information

## Logging

The application uses Python's built-in logging with INFO level by default. Logs include:

- Client connections and disconnections
- Room creation, joining, and cleanup
- Event broadcasting
- Error handling and debugging information

## Error Handling

Comprehensive error handling with:

- Try-catch blocks around all major operations
- Descriptive error messages sent to clients
- Logging of all errors for debugging
- Graceful degradation when services fail

## Scalability Considerations

- Room-based architecture allows horizontal scaling
- Timer-based cleanup prevents memory leaks
- Configurable limits on users per room
- Efficient broadcasting only to room members
- Session-based user tracking

This server provides a solid foundation for building real-time collaborative features in graph editors or similar applications.
