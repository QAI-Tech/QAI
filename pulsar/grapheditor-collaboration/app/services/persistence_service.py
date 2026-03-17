import logging
import json
import time
import os
from typing import Dict, List, Optional, Any, Union
from threading import Lock, Timer
from datetime import datetime, timedelta, timezone
import copy
from app.model.graph_models import Graph, Flow, Feature, Comment
import threading
from app.model.graph_models import Graph, Flow, Feature, Comment, Node, Edge, NodeData, EdgeData, CommentPosition
from concurrent.futures import ThreadPoolExecutor
from app.services.features.feature_service import FeatureService
from app.services.flows.flow_service import FlowService
from app.model.graph_models import Feature as CollaborationFeature
logger = logging.getLogger(__name__)


class PersistenceService:
    """Service for handling graph state persistence and synchronization"""

    def __init__(self, config, socketio, feature_service=FeatureService, flow_service=FlowService):
        self.config = config
        self.socketio = socketio
        self.feature_service = feature_service 
        self.flow_service = flow_service 
        
        # Thread-safe storage for room states using new models
        self.room_graph: Dict[str,  Graph] = {}
        self.room_flows: Dict[str,  List[Flow]] = {}
        self.room_features: Dict[str, Dict[str, List[Feature]]] = {}
        # room_comments is a dict mapping room_id -> {'comments': [Comment, ...]}
        self.room_comments: Dict[str, Dict[str, List[Comment]]] = {}
        self.room_operations: Dict[str, List] = {}  # room_id -> list of operations
        self.room_locks: Dict[str, Lock] = {}  # room_id -> lock for thread safety
        
        # Configuration
        self.persistence_dir = getattr(config, 'PERSISTENCE_DIR', 'persistence')
        self.auto_save_interval = getattr(config, 'AUTO_SAVE_INTERVAL', 30)  # seconds
        self.max_operations_before_save = getattr(config, 'MAX_OPERATIONS_BEFORE_SAVE', 50)
        self.state_history_limit = getattr(config, 'STATE_HISTORY_LIMIT', 100)  # max operations to keep
        self.cleanup_after_hours = getattr(config, 'CLEANUP_AFTER_HOURS', 24)
        
        # Auto-save timers
        self.save_timers: Dict[str, Timer] = {}
        
        # GCS backup registry and lock to protect concurrent access
        # Initialized here so other methods can rely on its existence
        self._gcs_backup_savers: Dict[str, Dict] = {}
        self._gcs_backups_lock = Lock()
        # Monitor thread to detect and restart dead backup workers
        self._gcs_monitor_thread: Optional[threading.Thread] = None
        self._gcs_monitor_stop_event: Optional[threading.Event] = None
        
        # Ensure persistence directory exists
        self._ensure_persistence_directory()
        
        # Load existing states on startup
        self._load_existing_states()

        # Executor for offloading blocking I/O (file writes, GCS uploads)
        max_io_workers = getattr(self.config, 'PERSISTENCE_IO_WORKERS', 4)
        try:
            self._io_executor = ThreadPoolExecutor(max_workers=max_io_workers)
        except Exception:
            logger.exception("Failed to create ThreadPoolExecutor for persistence I/O; falling back to synchronous saves")
            self._io_executor = None

        # Dedicated executor for backups so upload tasks can't be starved by per-event IO
        backup_workers = getattr(self.config, 'PERSISTENCE_BACKUP_WORKERS', 2)
        try:
            self._backup_executor = ThreadPoolExecutor(max_workers=backup_workers)
        except Exception:
            logger.exception("Failed to create ThreadPoolExecutor for backups; backups will run inline")
            self._backup_executor = None

    def _ensure_persistence_directory(self):
        """Create persistence directory if it doesn't exist"""
        try:
            os.makedirs(self.persistence_dir, exist_ok=True)
            logger.info(f"Persistence directory ready: {self.persistence_dir}")
        except Exception as e:
            logger.error(f"Failed to create persistence directory: {e}")

    def _get_room_lock(self, room_id: str) -> Lock:
        """Get or create a lock for a room"""
        if room_id not in self.room_locks:
            self.room_locks[room_id] = Lock()
        return self.room_locks[room_id]

    def _get_room_file_path(self, room_id: str) -> str:
        """Get the file path for a room's state"""
        safe_room_id = "".join(c for c in room_id if c.isalnum() or c in ('-', '_'))
        return os.path.join(self.persistence_dir, f"room_{safe_room_id}.json")

    def _load_existing_states(self):
        """Load existing room states from disk on startup"""
        try:
            if not os.path.exists(self.persistence_dir):
                return
                
            for filename in os.listdir(self.persistence_dir):
                if filename.startswith("room_") and filename.endswith(".json"):
                    file_path = os.path.join(self.persistence_dir, filename)
                    try:
                        with open(file_path, 'r') as f:
                            data = json.load(f)
                            
                        room_id = data.get('room_id')
                        if room_id:
                            # Check if the state is not too old
                            last_modified = data.get('last_modified', 0)
                            if time.time() - last_modified > (self.cleanup_after_hours * 3600):
                                os.remove(file_path)
                                logger.info(f"Removed old state file for room {room_id}")
                                continue
                                
                            self.room_operations[room_id] = data.get('operations', [])
                            # Initialize auxiliary per-room containers if missing
                            self.room_graph.setdefault(room_id, None)
                            self.room_flows.setdefault(room_id, [])
                            # Room comments stored under a dict with 'comments' key
                            self.room_comments.setdefault(room_id, {"comments": []})
                            
                            logger.info(f"Loaded persisted state for room {room_id}")
                            
                    except Exception as e:
                        logger.error(f"Failed to load state from {filename}: {e}")
                        
        except Exception as e:
            logger.error(f"Failed to load existing states: {e}")

    def initialize_room_state(self, room_id: str):
        """Initialize state for a new room"""
        with self._get_room_lock(room_id):
            if room_id not in self.room_graph:
                self.room_graph[room_id] = Graph(nodes=[], edges=[])
                self.room_flows[room_id] = []
                self.room_comments[room_id] = {"comments": []}
                self.room_operations[room_id] = []
                logger.info(f"Initialized new state for room {room_id}")

    def hydrate_room_from_graph_bundle(
        self,
        room_id: str,
        *,
        graph_data: Optional[Dict[str, Any]] = None,
        flows_data: Optional[Any] = None,
        features_data: Optional[Any] = None,
        comments_data: Optional[Any] = None
    ) -> None:
        """Populate a room's in-memory state from persisted graph assets."""
        logger.info(f"Hydrating room {room_id} from graph bundle...")
        self.initialize_room_state(room_id)

        # Graph
        graph_payload = graph_data or {"nodes": [], "edges": []}
        logger.info(f"Room {room_id}: Hydrating graph with {len(graph_payload.get('nodes', []))} nodes and {len(graph_payload.get('edges', []))} edges.")
        try:
            self.room_graph[room_id] = Graph(**graph_payload)
            logger.info(f"Room {room_id}: Graph hydrated successfully.")
        except Exception:
            logger.exception("Failed to hydrate graph data for room %s", room_id)
            self.room_graph[room_id] = Graph(nodes=[], edges=[])
            logger.info(f"Room {room_id}: Graph set to empty due to error.")

        # Flows
        flows_payload: List[Any]
        if isinstance(flows_data, dict):
            flows_payload = flows_data.get('flows', [])
        elif isinstance(flows_data, list):
            flows_payload = flows_data
        else:
            flows_payload = []
        logger.info(f"Room {room_id}: Hydrating flows with {len(flows_payload)} items.")
        flows_models: List[Flow] = []
        for item in flows_payload:
            if isinstance(item, Flow):
                flows_models.append(item)
                continue
            if isinstance(item, dict):
                try:
                    flows_models.append(Flow(**item))
                except Exception:
                    logger.exception("Failed to convert flow item for room %s: %s", room_id, item)
        self.room_flows[room_id] = flows_models
        logger.info(f"Room {room_id}: Flows hydrated with {len(flows_models)} models.")


        # Comments
        if isinstance(comments_data, dict):
            comments_container = dict(comments_data)
        elif isinstance(comments_data, list):
            comments_container = {'comments': list(comments_data)}
        else:
            comments_container = {'comments': []}
        logger.info(f"Room {room_id}: Hydrating comments with {len(comments_container.get('comments', []))} items.")
        comment_models: List[Comment] = []
        for item in list(comments_container.get('comments', [])):
            if isinstance(item, Comment):
                comment_models.append(item)
                continue
            if isinstance(item, dict):
                try:
                    position_payload = item.get('position', {
                        'x': item.get('x', 0),
                        'y': item.get('y', 0)
                    })
                    comment_models.append(Comment(
                        id=item.get('id', ''),
                        content=item.get('content', item.get('text', '')),
                        createdAt=item.get('createdAt', str(time.time())),
                        updatedAt=item.get('updatedAt', str(time.time())),
                        position=CommentPosition(**position_payload)
                    ))
                except Exception:
                    logger.exception("Failed to convert comment item for room %s: %s", room_id, item)
        comments_container['comments'] = comment_models
        self.room_comments[room_id] = comments_container
        logger.info(f"Room {room_id}: Comments hydrated with {len(comment_models)} models.")

        # Reset operations history for hydrated state
        self.room_operations[room_id] = []
        logger.info(f"Room {room_id}: Operations history reset after hydration.")

    def export_room_artifacts(self, room_id: str) -> Optional[Dict[str, Any]]:
        """Serialize the current in-memory state for the given room."""
        try:
            if room_id not in self.room_graph:
                return None

            features_data = {"features": []}
            if self.feature_service:
                try:
                    datastore_features = self.feature_service.get_features(room_id)
                    features_data = {
                        'features': [
                            CollaborationFeature(
                                id=f.id,
                                name=f.name,
                                nodeIds=f.nodeIds
                            ).model_dump()
                            for f in datastore_features
                        ]
                    }
                except Exception as e:
                    logger.warning(f"Failed to fetch features from Datastore for export: {e}")
            
            flows_data = []
            if self.flow_service:
                try:
                    datastore_flows = self.flow_service.get_flows(room_id)
                    flows_data = [
                        f.model_dump(exclude_none=True)
                        for f in datastore_flows
                    ]
                    if not flows_data:
                        print("Found nothing in datastore, taking from memory")
                        flows_data = self._serialize_artifact(self.room_flows.get(room_id, []))
                except Exception as e:
                    logger.warning(f"Failed to fetch flows from Datastore for export: {e}")
            else:
                 flows_data = self._serialize_artifact(self.room_flows.get(room_id, []))
            
            return {
                'graph_data': self._serialize_artifact(self.room_graph.get(room_id)),
                'flows_data': flows_data,
                'features_data': self._serialize_artifact(features_data),
                'comments_data': self._serialize_artifact(self.room_comments.get(room_id, {"comments": []}))
            }
        except Exception as exc:
            logger.error("Failed to export artifacts for room %s: %s", room_id, exc)
            return None

    def discard_room_state(self, room_id: str) -> None:
        """Remove any in-memory state for a room without persisting to disk."""
        try:
            with self._get_room_lock(room_id):
                self.room_graph.pop(room_id, None)
                self.room_flows.pop(room_id, None)
                self.room_comments.pop(room_id, None)
                self.room_operations.pop(room_id, None)
                if room_id in self.save_timers:
                    try:
                        self.save_timers[room_id].cancel()
                    except Exception:
                        pass
                    self.save_timers.pop(room_id, None)
        except Exception:
            logger.exception("Failed to discard state for room %s", room_id)

    def apply_operation(self, room_id: str, operation: Dict, session_id: Optional[str] = None) -> bool:
        """Apply an operation to the room state and track it"""
        # Ensure room state exists
        if room_id not in self.room_graph:
            self.initialize_room_state(room_id)

        # Add metadata to operation
        enhanced_operation = {
            **operation,
            "timestamp": time.time(),
            "session_id": session_id,
            "id": f"op_{int(time.time() * 1000)}_{session_id or 'system'}"
        }
        logger.info(f"Applying operation to state: {json.dumps(enhanced_operation)[:100]}")

        success = self._apply_operation_to_state(room_id, enhanced_operation)
        logger.info(f"Applied operation result {success}")
        if success:
            # Track the operation
            self.room_operations[room_id].append(enhanced_operation)
            
            # Limit operation history
            if len(self.room_operations[room_id]) > self.state_history_limit:
                self.room_operations[room_id] = self.room_operations[room_id][-self.state_history_limit:]

            logger.debug(f"Applied operation {enhanced_operation['type']} to room {room_id}")
            return True
        else:
            logger.warning(f"Failed to apply operation {operation.get('type')} to room {room_id}")
            return False

    def _apply_operation_to_state(self, room_id: str, operation: Dict) -> bool:
        """Apply a specific operation to the room state"""
        try:
            logger.info(f"Applkying operation to state private {json.dumps(operation)[:100]}")
            graph = self.room_graph.get(room_id)
            flow = self.room_flows.get(room_id, [])
            if graph is None or flow is None:
                logger.warning(f"apply_operation: no canonical state for room {room_id}")
                return False
            op_type = operation.get("type", None)
            op_data = operation.get("data", {})

            # Node operations (both singular and plural)
            if op_type in ["node_create", "nodes_create"]:
                return self._handle_nodes_create(room_id, op_data)
            elif op_type in ["node_delete", "nodes_delete"]:
                return self._handle_nodes_delete(room_id, op_data)
            elif op_type in ["node_update", "nodes_update"]:
                return self._handle_nodes_update(room_id, op_data)
            elif op_type in ["nodes_replace"]:
                return self._handle_nodes_replace(room_id, op_data)
            
            # Edge operations
            elif op_type in ["edge_create", "edges_create"]:
                return self._handle_edges_create(room_id, op_data)
            elif op_type in ["edge_delete", "edges_delete"]:
                return self._handle_edges_delete(room_id, op_data)
            elif op_type in ["edge_update", "edges_update"]:
                return self._handle_edges_update(room_id, op_data)
            elif op_type in ["edges_replace"]:
                return self._handle_edges_replace(room_id, op_data)
            
            # Feature operations
            elif op_type == "features_create":
                return self._handle_feature_create(room_id, op_data)
            elif op_type == "features_update":
                return self._handle_feature_update(room_id, op_data)
            elif op_type == "features_delete":
                return self._handle_feature_delete(room_id, op_data)
            elif op_type == "reorder_features":
                return self._handle_feature_reorder(room_id, op_data)
            
            # Flow operations
            elif op_type == "flows_create":
                return self._handle_flow_create(room_id, op_data)
            elif op_type == "flows_delete":
                return self._handle_flow_delete(room_id, op_data)
            elif op_type == "flows_update":
                return self._handle_flow_update(room_id, op_data)
            elif op_type == "ai_planned_flows":
                return self._handle_flow_update(room_id, op_data)
            elif op_type == "flow_update":
                return self._handle_singular_flow_update(room_id, op_data)
            elif op_type == "flows_replace":
                return self._handle_flow_update(room_id, op_data)
            
            # Comment operations (both sin`gular and plural)
            elif op_type in ["comments_add", "comments_create"]:
                return self._handle_comments_create(room_id, op_data)
            elif op_type in ["comments_update", "comments_update"]:
                return self._handle_comments_update(room_id, op_data)
            elif op_type in ["comments_delete", "comments_delete"]:
                return self._handle_comments_delete(room_id, op_data)
            
            # Credential operations
            elif op_type == "credential_add":
                return self._handle_credential_add(room_id, op_data)
            
            else:
                logger.warning(f"Unknown operation type: {op_type}")
                return False

        except Exception as e:
            logger.error(f"Error applying operation {operation.get('type', 'unknown')}: {e}")
            return False

    def _recalibrate_node_position(self, room_id: str, nodes_data: List[Dict]) -> None:
        """
        Check if any of the new nodes are colliding with the old nodes, 
        then in that case, shift the new nodes just below the old nodes keeping some distance.
        """
        graph = self.room_graph.get(room_id)
        if not graph or not graph.nodes:
            return

        DEFAULT_WIDTH = 150
        DEFAULT_HEIGHT = 80
        PADDING = 50

        for node_data in nodes_data:
            # Iteratively check for collisions and shift
            for _ in range(10):
                nx = float(node_data.get("x", 0))
                ny = float(node_data.get("y", 0))
                nw = float(node_data.get("width", DEFAULT_WIDTH))
                nh = float(node_data.get("height", DEFAULT_HEIGHT))
                
                collision_found = False
                
                for existing_node in graph.nodes:
                    ex = existing_node.position.get("x", 0)
                    ey = existing_node.position.get("y", 0)
                    # Use default dimensions for existing nodes as they aren't persisted
                    ew = DEFAULT_WIDTH
                    eh = DEFAULT_HEIGHT
                    
                    # Check for overlap
                    if (nx < ex + ew and 
                        nx + nw > ex and 
                        ny < ey + eh and 
                        ny + nh > ey):
                        
                        # Collision detected, shift new node below the existing one
                        node_data["y"] = ey + eh + PADDING
                        collision_found = True
                        break # Break inner loop to re-check with updated position
                
                if not collision_found:
                    break

    # Node operation handlers
    def _handle_nodes_create(self, room_id: str, data: Dict) -> bool:
        """Handle nodes_create operation with array of nodes"""
        if isinstance(data, list):
            nodes_data = data
        elif isinstance(data, dict) and "id" in data:
            nodes_data = [data]
        else:
            logger.warning("Invalid nodes_create data format")
            return False
        
        self._recalibrate_node_position(room_id, nodes_data)
        
        graph = self.room_graph[room_id]
        created_count = 0
        
        for node_data in nodes_data:
            node_id = node_data.get("id")
            if not node_id:
                logger.warning("Node missing ID, skipping")
                continue
            
            new_node = Node(
                id=node_id,
                type=node_data.get("type", "rectangle"),
                position={"x": node_data.get("x", 0), "y": node_data.get("y", 0)},
                data=NodeData(
                    image=node_data.get("metadata", {}).get("image") if node_data.get("metadata") else node_data.get("image"),
                    description=node_data.get("metadata", {}).get("description") if node_data.get("metadata") else node_data.get("description", ""),
                    detailed_description=node_data.get("metadata", {}).get("detailed_description") if node_data.get("metadata") else node_data.get("detailed_description", "")
                )
            )
            
            graph.nodes.append(new_node)
            created_count += 1
        
        return created_count > 0

    def _handle_nodes_delete(self, room_id: str, data: Dict) -> bool:
        """Handle nodes_delete operation with array of node IDs"""
        if isinstance(data, list):
            node_ids = data
        elif isinstance(data, str):
            node_ids = [data]
        elif isinstance(data, dict) and "id" in data:
            node_ids = [data["id"]]
        else:
            logger.warning("Invalid nodes_delete data format")
            return False
            
        graph = self.room_graph[room_id]
        deleted_count = 0
        
        for node_id in node_ids:
            if not node_id:
                continue
                
            initial_count = len(graph.nodes)
            graph.nodes = [node for node in graph.nodes if node.id != node_id]
            
            if len(graph.nodes) < initial_count:
                deleted_count += 1
                
                graph.edges = [edge for edge in graph.edges 
                              if edge.source != node_id and edge.target != node_id]
        
        return deleted_count > 0

    def _handle_nodes_update(self, room_id: str, data: Dict) -> bool:
        """Handle nodes_update operation with array of node updates"""
        if isinstance(data, list):
            updates_data = data
        elif isinstance(data, dict) and "id" in data:
            updates_data = [data]
        else:
            logger.warning("Invalid nodes_update data format")
            return False
        
        graph = self.room_graph[room_id]
        updated_count = 0
        
        for update_data in updates_data:
            node_id = update_data.get("id")
            if not node_id:
                logger.warning("Node update missing ID, skipping")
                continue
            
            node_index = None
            for i, node in enumerate(graph.nodes):
                if node.id == node_id:
                    node_index = i
                    break
            
            if node_index is None:
                continue
            
            node = graph.nodes[node_index]
            updates = update_data.get("updates", update_data)
            
            node_data_updates = {}
            position_updates = {}
            
            if "description" in updates:
                desc_update = updates["description"]
                if isinstance(desc_update, dict) and "new" in desc_update:
                    node_data_updates["description"] = desc_update["new"]
                else:
                    node_data_updates["description"] = desc_update
            
            if "image" in updates:
                img_update = updates["image"]
                if isinstance(img_update, dict) and "new" in img_update:
                    node_data_updates["image"] = img_update["new"]
                else:
                    node_data_updates["image"] = img_update
            
            if "position" in updates:
                pos_update = updates["position"]
                if isinstance(pos_update, dict) and "new" in pos_update:
                    new_pos = pos_update["new"]
                    position_updates["x"] = new_pos.get("x", node.position["x"])
                    position_updates["y"] = new_pos.get("y", node.position["y"])
            
            if "x" in updates or "y" in updates:
                position_updates["x"] = updates.get("x", node.position.get("x", 0))
                position_updates["y"] = updates.get("y", node.position.get("y", 0))
            
            updated_node_data = node.data
            if node_data_updates:
                updated_node_data = node.data.model_copy(update=node_data_updates)
            
            updated_position = node.position
            if position_updates:
                updated_position = {**node.position, **position_updates}
            
            updated_node = node.model_copy(update={
                "data": updated_node_data,
                "position": updated_position
            })
            
            graph.nodes[node_index] = updated_node
            updated_count += 1
        
        return updated_count > 0

    def _handle_nodes_replace(self, room_id: str, data: Dict) -> bool:
        """Handle nodes_replace operation by deleting ALL existing nodes and creating new ones"""
        if isinstance(data, list):
            nodes_data = data
        elif isinstance(data, dict) and "id" in data:
            nodes_data = [data]
        else:
            logger.warning("Invalid nodes_replace data format")
            return False

        # Get graph and delete ALL existing nodes
        graph = self.room_graph.get(room_id)
        if graph and graph.nodes:
            all_node_ids = [node.id for node in graph.nodes]
            self._handle_nodes_delete(room_id, all_node_ids)
        logger.info("Triggering node_replace")
        # Create new nodes
        create_response = self._handle_nodes_create(room_id, nodes_data)
        self.room_service.update_room(room_id, graph)
        return create_response

    # Edge operation handlers
    def _handle_edges_create(self, room_id: str, data: Dict) -> bool:
        """Handle edges_create operation with array of edges"""
        if isinstance(data, list):
            edges_data = data
        elif isinstance(data, dict) and "id" in data:
            edges_data = [data]
        else:
            logger.warning("Invalid edges_create data format")
            return False
        
        graph = self.room_graph[room_id]
        created_count = 0
        
        for edge_data in edges_data:
            edge_id = edge_data.get("id")
            source = edge_data.get("source")
            target = edge_data.get("target")
            
            if not edge_id or not source or not target:
                logger.warning("Edge missing required fields, skipping")
                continue
            
            source_exists = any(node.id == source for node in graph.nodes)
            target_exists = any(node.id == target for node in graph.nodes)
            
            if not source_exists or not target_exists:
                logger.warning(f"Source or target node not found for edge {edge_id}, skipping")
                continue
            
            new_edge = Edge(
                id=edge_id,
                source=source,
                target=target,
                type=edge_data.get("type", "arrow"),
                data=EdgeData(
                    description=edge_data.get("label", edge_data.get("description", "")),
                    rawInteraction=edge_data.get("rawInteraction"),
                    business_logic=edge_data.get("business_logic"),
                    curvature=edge_data.get("curvature"),
                    source_anchor=edge_data.get("source_anchor"),
                    target_anchor=edge_data.get("target_anchor")
                )
            )
            
            graph.edges.append(new_edge)
            created_count += 1
        
        return created_count > 0

    def _handle_edges_delete(self, room_id: str, data: Dict) -> bool:
        """Handle edges_delete operation with array of edge IDs"""
        if isinstance(data, list):
            edge_ids = data
        elif isinstance(data, str):
            edge_ids = [data]
        elif isinstance(data, dict) and "id" in data:
            edge_ids = [data["id"]]
        else:
            logger.warning("Invalid edges_delete data format")
            return False
        
        graph = self.room_graph[room_id]
        deleted_count = 0
        
        for edge_id in edge_ids:
            if not edge_id:
                continue
                
            for i, edge in enumerate(graph.edges):
                if edge.id == edge_id:
                    graph.edges.pop(i)
                    deleted_count += 1
                    break
                    
        return deleted_count > 0

    def _handle_edges_update(self, room_id: str, data: Dict) -> bool:
        """Handle edges_update operation with array of edge updates"""
        if isinstance(data, list):
            updates_data = data
        elif isinstance(data, dict) and "id" in data:
            updates_data = [data]
        else:
            logger.warning("Invalid edges_update data format")
            return False
        
        graph = self.room_graph[room_id]
        updated_count = 0
        
        for update_data in updates_data:
            edge_id = update_data.get("id")
            if not edge_id:
                logger.warning("Edge update missing ID, skipping")
                continue
            
            edge_index = None
            for i, edge in enumerate(graph.edges):
                if edge.id == edge_id:
                    edge_index = i
                    break
            
            if edge_index is None:
                continue
            
            edge = graph.edges[edge_index]
            updates = update_data.get("updates", update_data)
            
            edge_updates = {}
            edge_data_updates = {}
            
            # Handle description updates
            if "description" in updates:
                desc_update = updates["description"]
                if isinstance(desc_update, dict) and "new" in desc_update:
                    edge_data_updates["description"] = desc_update["new"] or ""
                else:
                    edge_data_updates["description"] = desc_update or ""
            
            # Handle business logic updates
            if "business_logic" in updates:
                business_logic_update = updates["business_logic"]
                if isinstance(business_logic_update, dict) and "new" in business_logic_update:
                    edge_data_updates["business_logic"] = business_logic_update["new"]
                else:
                    edge_data_updates["business_logic"] = business_logic_update
            
            # Handle curvature updates
            if "curvature" in updates:
                curvature_update = updates["curvature"]
                if isinstance(curvature_update, dict) and "new" in curvature_update:
                    edge_data_updates["curvature"] = curvature_update["new"]
                else:
                    edge_data_updates["curvature"] = curvature_update
            
            # Handle rawInteraction updates
            if "rawInteraction" in updates:
                raw_interaction_update = updates["rawInteraction"]
                if isinstance(raw_interaction_update, dict) and "new" in raw_interaction_update:
                    edge_data_updates["rawInteraction"] = raw_interaction_update["new"]
                else:
                    edge_data_updates["rawInteraction"] = raw_interaction_update
            
            # Handle anchor updates (both old and new format)
            if "anchors" in updates:
                anchors_update = updates["anchors"]
                
                # Handle source node updates
                if "new_source" in anchors_update:
                    new_source = anchors_update["new_source"]
                    if any(node.id == new_source for node in graph.nodes):
                        edge_updates["source"] = new_source
                
                # Handle target node updates
                if "new_target" in anchors_update:
                    new_target = anchors_update["new_target"]
                    if any(node.id == new_target for node in graph.nodes):
                        edge_updates["target"] = new_target
                
                # Handle source anchor updates
                if "new_source_anchor" in anchors_update:
                    edge_data_updates["source_anchor"] = anchors_update["new_source_anchor"]
                
                # Handle target anchor updates
                if "new_target_anchor" in anchors_update:
                    edge_data_updates["target_anchor"] = anchors_update["new_target_anchor"]
            
            # Handle direct source/target updates (fallback)
            if "source" in updates:
                new_source = updates["source"]
                if any(node.id == new_source for node in graph.nodes):
                    edge_updates["source"] = new_source
            
            if "target" in updates:
                new_target = updates["target"]
                if any(node.id == new_target for node in graph.nodes):
                    edge_updates["target"] = new_target
            
            # Handle direct anchor updates
            if "source_anchor" in updates:
                source_anchor_update = updates["source_anchor"]
                if isinstance(source_anchor_update, dict) and "new" in source_anchor_update:
                    edge_data_updates["source_anchor"] = source_anchor_update["new"]
                else:
                    edge_data_updates["source_anchor"] = source_anchor_update
            
            if "target_anchor" in updates:
                target_anchor_update = updates["target_anchor"]
                if isinstance(target_anchor_update, dict) and "new" in target_anchor_update:
                    edge_data_updates["target_anchor"] = target_anchor_update["new"]
                else:
                    edge_data_updates["target_anchor"] = target_anchor_update
            
            # Apply edge data updates
            updated_edge_data = edge.data
            if edge_data_updates:
                updated_edge_data = edge.data.model_copy(update=edge_data_updates)
            
            # Prepare final updates
            final_updates = edge_updates.copy()
            if edge_data_updates:
                final_updates["data"] = updated_edge_data
            
            # Apply updates if any changes were made
            if final_updates:
                updated_edge = edge.model_copy(update=final_updates)
                graph.edges[edge_index] = updated_edge
                updated_count += 1
        
        return updated_count > 0


    def _handle_edges_replace(self, room_id: str, data: Dict) -> bool:
        """Handle edges_replace operation by deleting ALL existing edges and creating new ones"""
        if isinstance(data, list):
            edges_data = data
        elif isinstance(data, dict) and "id" in data:
            edges_data = [data]
        else:
            logger.warning("Invalid edges_replace data format")
            return False
        logger.info("Edges replace data: %s", edges_data)
        # Get graph and delete ALL existing edges
        graph = self.room_graph.get(room_id)
        if graph and graph.edges:
            all_edge_ids = [edge.id for edge in graph.edges]
            self._handle_edges_delete(room_id, all_edge_ids)
        logger.info("Triggering edge_replace")
        # Create new edges
        return self._handle_edges_create(room_id, edges_data)

    # Feature operation handlers
    def _ensure_features_are_models(self, room_id: str):
        """Ensure the room's features container is a dict containing a 'features' list of Feature model instances.

        Defensive: persisted or seeded data may contain plain dicts. Convert dicts in-place to Feature(...) models where possible.
        """
        self.room_features.setdefault(room_id, {"features": []})
        feature_list = self.room_features[room_id].setdefault('features', [])
        for i, item in enumerate(list(feature_list)):
            try:
                if isinstance(item, Feature):
                    continue
            except Exception:
                pass

            if isinstance(item, dict):
                try:
                    feature_list[i] = Feature(**item)
                except Exception:
                    logger.exception("Failed to convert feature dict to Feature model for room %s: %s", room_id, item)
            else:
                if hasattr(item, '__dict__'):
                    try:
                        feature_list[i] = Feature(**copy.deepcopy(item.__dict__))
                    except Exception:
                        logger.debug("Unable to coerce feature-like object to Feature for room %s: %s", room_id, type(item))

    def _handle_feature_create(self, room_id: str, data: Dict) -> bool:
        """Handle feature_create operation (accepts single feature or list of features)"""
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict) and "id" in data:
            items = [data]
        else:
            logger.warning("Invalid features_create data format")
            return False

        created_count = 0


        created_features = []
        if self.feature_service:
            try:
                
                for item in items:

                    feature_id = item.get("id", "")  # Empty string if not provided
                    datastore_feature = Feature(
                        id=feature_id, 
                        product_id=room_id,
                        name=item.get("name", ""),
                        description=item.get("description", ""),
                        nodeIds=item.get("nodeIds", []),
                        created_at=datetime.now(timezone.utc),
                        updated_at=datetime.now(timezone.utc)
                    )

                    created_feature = self.feature_service.create_feature(room_id, datastore_feature)
                    created_features.append(created_feature)
            except Exception as e:
                logger.error(f"Error writing features to Datastore: {e}")


        created_count = len(created_features)
        return created_count > 0

    def _handle_feature_update(self, room_id: str, data: Dict) -> bool:
        """Handle feature_update operation with unified updates (accepts single or list)"""
        if isinstance(data, list):
            updates_list = data
        elif isinstance(data, dict) and "id" in data:
            updates_list = [data]
        else:
            logger.warning("Invalid features_update data format")
            return False


        applied = 0
        for item in updates_list:
            feature_id = item.get("id")
            if not feature_id:
                logger.warning("Feature update missing ID, skipping item %s", item)
                continue
            logger.info("Processing update for feature %s in room %s", feature_id, room_id)

            updates = item.get("updates", {})
            feature_updates = {}

            if "name" in updates:
                name_update = updates["name"]
                if isinstance(name_update, dict) and "new" in name_update:
                    feature_updates["name"] = name_update["new"]
                else:
                    feature_updates["name"] = name_update

            if "nodeIds" in updates:
                nodeIds_update = updates["nodeIds"]
                if isinstance(nodeIds_update, dict) and "new" in nodeIds_update:
                    feature_updates["nodeIds"] = nodeIds_update["new"]
                else:
                    feature_updates["nodeIds"] = nodeIds_update

            if self.feature_service and feature_updates:
                try:
                    self.feature_service.update_feature(
                        product_id=room_id,
                        feature_id=feature_id,
                        name=feature_updates.get("name"),
                        nodeIds=feature_updates.get("nodeIds"),
                        description=feature_updates.get("description")
                    )
                    applied += 1
                except Exception as e:
                    logger.error(f"Error updating feature in Datastore: {e}")

        return applied > 0

    def _handle_feature_delete(self, room_id: str, data: Dict) -> bool:
        """Handle feature_delete operation (accepts single id, dict with id, or list of ids)"""
        ids=[]
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict) and 'id' in item:
                    ids.append(item['id'])
                elif isinstance(item, str):
                    ids.append(item)
                else:
                    logger.debug("Ignoring malformed flow delete item for room %s: %s", room_id, item)
        elif isinstance(data, dict) and 'id' in data:
            ids = [data['id']]
        elif isinstance(data, str):
            ids = [data]
        else:
            logger.warning("Invalid features_delete data format")
            return False


        removed = 0
        if self.feature_service:
            try:
                for fid in ids:
                    if fid:
                        self.feature_service.delete_feature(room_id, fid)
                        removed += 1
            except Exception as e:
                logger.error(f"Error deleting features from Datastore: {e}")
        return removed > 0

    def _handle_feature_reorder(self, room_id: str, data: Dict) -> bool:
        """Handle feature_reorder operation"""
        if isinstance(data, list):
            new_features = data
        else:
            logger.warning("Invalid feature_reorder data format")
            return False

        # Extract feature IDs for reordering
        feature_ids = []
        for item in new_features:
            if isinstance(item, Feature):
                feature_ids.append(item.id)
            elif isinstance(item, dict):
                feature_ids.append(item.get("id"))

        if self.feature_service and feature_ids:
            try:
                self.feature_service.reorder_features(room_id, feature_ids)
            except Exception as e:
                logger.error(f"Error reordering features in Datastore: {e}")


        return True

    # Plural feature operation handlers
    def _handle_features_create(self, room_id: str, data: Dict) -> bool:
        """Handle features_create operation with array of features"""
        # Handle both old format (single feature) and new format (array of features)
        if isinstance(data, list):
            features_data = data
        elif isinstance(data, dict) and "id" in data:
            # Old single feature format - wrap in array
            features_data = [data]
        else:
            logger.warning("Invalid features_create data format")
            return False
        
        created_count = 0

        feature_store = self.room_features.setdefault(room_id, {"features": []})
        feature_list = feature_store.setdefault('features', [])

        for feature_data in features_data:
            feature_id = feature_data.get("id")
            if not feature_id:
                logger.warning("Feature missing ID, skipping")
                continue
            
            # Create new feature using the Feature model
            new_feature = Feature(
                id=feature_id,
                name=feature_data.get("name", ""),
                nodeIds=feature_data.get("nodeIds", [])
            )
            
            # Add to room's features
            feature_list.append(new_feature)
            created_count += 1
        
        return created_count > 0

    def _handle_features_update(self, room_id: str, data: Dict) -> bool:
        """Handle features_update operation with array of feature updates"""
        # Handle both old format (single update) and new format (array of updates)
        if isinstance(data, list):
            updates_data = data
        elif isinstance(data, dict) and "id" in data:
            # Old single update format - wrap in array
            updates_data = [data]
        else:
            logger.warning("Invalid features_update data format")
            return False
            
        updated_count = 0

        feature_store = self.room_features.setdefault(room_id, {"features": []})
        feature_list = feature_store.setdefault('features', [])

        for update_data in updates_data:
            feature_id = update_data.get("id")
            if not feature_id:
                logger.warning("Feature update missing ID, skipping")
                continue
                
            # Find the feature to update
            for i, feature in enumerate(feature_list):
                if feature.id == feature_id:
                    updates = update_data.get("updates", {})
                    feature_updates = {}
                    
                    # Handle name change
                    if "name" in updates:
                        name_update = updates["name"]
                        if isinstance(name_update, dict) and "new" in name_update:
                            feature_updates["name"] = name_update["new"]
                        else:
                            feature_updates["name"] = name_update
                    
                    # Handle nodeIds change
                    if "nodeIds" in updates:
                        nodeIds_update = updates["nodeIds"]
                        if isinstance(nodeIds_update, dict) and "new" in nodeIds_update:
                            feature_updates["nodeIds"] = nodeIds_update["new"]
                        else:
                            feature_updates["nodeIds"] = nodeIds_update
                    
                    # Create updated feature if there are changes
                    if feature_updates:
                        updated_feature = feature.model_copy(update=feature_updates)
                        feature_list[i] = updated_feature
                        updated_count += 1
                    break
        
        return updated_count > 0

    def _handle_features_delete(self, room_id: str, data: Dict) -> bool:
        """Handle features_delete operation with array of feature IDs"""
        # Handle both old format (single ID) and new format (array of IDs)
        if isinstance(data, list):
            feature_ids = [item.get("id") if isinstance(item, dict) else item for item in data]
        elif isinstance(data, str):
            # Old single ID format - wrap in array
            feature_ids = [data]
        elif isinstance(data, dict) and "id" in data:
            # Old dict format with ID - wrap in array
            feature_ids = [data["id"]]
        else:
            logger.warning("Invalid features_delete data format")
            return False
            
        deleted_count = 0

        feature_store = self.room_features.setdefault(room_id, {"features": []})
        feature_list = feature_store.setdefault('features', [])

        for feature_id in feature_ids:
            if not feature_id:
                continue
                
            # Find and remove the feature
            for i, feature in enumerate(list(feature_list)):
                if feature.id == feature_id:
                    try:
                        feature_list.pop(i)
                    except Exception:
                        logger.exception("Failed to remove feature %s from room %s", feature_id, room_id)
                    deleted_count += 1
                    break
        
        return deleted_count > 0

    # Flow operation handlers
    def _handle_flow_create(self, room_id: str, data: Dict) -> bool:
        """Handle flow_create operation. Accepts a single flow dict or a list of flows."""
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict) and "id" in data:
            items = [data]
        else:
            logger.warning("Invalid flows_create data format")
            return False

        created_count = 0
        
        if self.flow_service:
            try:
                flows_to_create = []
                for item in items:
                    flow_id = item.get("id", "")
                    
                    scenarios = item.get("scenarios", None)
                    
                    new_flow = Flow(
                        id=flow_id,
                        name=item.get("name", ""),
                        startNodeId=item.get("startNodeId", ""),
                        endNodeId=item.get("endNodeId", ""),
                        viaNodeIds=item.get("viaNodeIds", []),
                        pathNodeIds=item.get("pathNodeIds", []),
                        precondition=item.get("precondition", ""),
                        scenarios=scenarios,
                        credentials=item.get("credentials", None),
                        videoUrl=item.get("videoUrl", None),
                        autoPlan=item.get("autoPlan", True),
                        description=item.get("description", ""),
                        feature_id=item.get("feature_id") or "",
                        product_id=item.get("product_id") or ""
                    )
                    flows_to_create.append(new_flow)
                
                if flows_to_create:
                    self.flow_service.create_flows(room_id, flows_to_create)
            
            except Exception as e:
                logger.error(f"Error writing flows to Datastore: {e}")

        # Update local in-memory state
        self.room_flows.setdefault(room_id, [])
        for item in items:
            flow_id = item.get("id")
            if not flow_id:
                logger.warning("Flow missing ID, skipping")
                continue
            try:
                new_flow = Flow(
                    id=flow_id,
                    name=item.get("name", ""),
                    startNodeId=item.get("startNodeId", ""),
                    endNodeId=item.get("endNodeId", ""),
                    viaNodeIds=item.get("viaNodeIds", []),
                    pathNodeIds=item.get("pathNodeIds", []),
                    precondition=item.get("precondition", ""),
                    description=item.get("description", ""),
                    scenarios=item.get("scenarios", None),
                    credentials=item.get("credentials", None),
                    videoUrl=item.get("videoUrl", None),
                    autoPlan=item.get("autoPlan", True),
                    feature_id=item.get("feature_id") or "",
                    product_id=item.get("product_id") or ""
                )
                self.room_flows[room_id].append(new_flow)
                created_count += 1
            except Exception:
                logger.exception("Failed to create flow for room %s from item %s", room_id, item)
        return created_count > 0

    def _handle_flow_delete(self, room_id: str, data: Dict) -> bool:
        """Handle flow_delete operation. Accepts single id, dict with id, list of ids, or list of dicts with id."""
        logger.info("Handling flow delete for room %s with data %s", room_id, data)
        try:
            ids = []
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and 'id' in item:
                        ids.append(item['id'])
                    elif isinstance(item, str):
                        ids.append(item)
                    else:
                        logger.debug("Ignoring malformed flow delete item for room %s: %s", room_id, item)
            elif isinstance(data, dict) and 'id' in data:
                ids = [data['id']]
            elif isinstance(data, str):
                ids = [data]
            else:
                logger.warning("Invalid flows_delete data format")
                return False

            if self.flow_service:
                try:
                    valid_ids = [fid for fid in ids if fid]
                    if valid_ids:
                        self.flow_service.delete_flows(room_id, valid_ids)
                except Exception as e:
                    logger.error(f"Error deleting flows from Datastore: {e}")

            if room_id in self.room_flows:
                # Filter out deleted flows efficiently
                valid_ids_set = set(valid_ids) if 'valid_ids' in locals() else set([i for i in ids if i])
                initial_count = len(self.room_flows[room_id])
                
                self.room_flows[room_id] = [
                    f for f in self.room_flows[room_id] 
                    if getattr(f, 'id', None) not in valid_ids_set
                ]
                
                removed = initial_count - len(self.room_flows[room_id])
                return removed > 0
            
            return False
        except Exception as e:
            logger.error(f"Error in flow_delete operation for room {room_id}: {e}")
            return False

    def _handle_flow_update(self, room_id: str, data: Dict) -> bool:
        """Replace the complete set of flows for a room.

        Accepts either:
          - a list of flow dicts, or
          - a dict containing a 'flows' key with a list of flow dicts.

        This will replace the room's flows atomically with the provided list
        (an empty list clears all flows).
        """
        if isinstance(data, dict) and 'flows' in data and isinstance(data['flows'], list):
            items = data['flows']
        elif isinstance(data, list):
            items = data
        else:
            logger.warning("Invalid flows_update data format for replace; expected list or {'flows': [...]}"
                           " - received type=%s", type(data))
            return False
        logger.info("Handling flow update for room %s", room_id)
        self.room_flows.setdefault(room_id, [])
        new_flows: List[Flow] = []

        for item in items:
            flow_id = item.get('id')
            if not flow_id:
                logger.warning("Flow missing ID, skipping item: %s", item)
                continue
            try:
                new_flow = Flow(
                    id=flow_id,
                    name=item.get('name', ''),
                    startNodeId=item.get('startNodeId', ''),
                    endNodeId=item.get('endNodeId', ''),
                    viaNodeIds=item.get('viaNodeIds', []),
                    pathNodeIds=item.get('pathNodeIds', []),
                    precondition=item.get('precondition', ''),
                    description=item.get('description', ''),
                    scenarios=item.get('scenarios', None),
                    credentials=item.get('credentials', None),
                    videoUrl=item.get('videoUrl', None),
                    autoPlan=item.get('autoPlan', True),
                    feature_id=item.get('feature_id', ""),
                    product_id=item.get('product_id', "")
                )
                new_flows.append(new_flow)
            except Exception:
                logger.exception("Failed to create Flow model from item for room %s: %s", room_id, item)

        if self.flow_service and new_flows:
            try:
                # Update provided flows instead of creating/upserting
                updates_list = [f.dict(exclude_none=True) for f in new_flows]
                self.flow_service.update_flows(room_id, updates_list)
            except Exception as e:
                logger.error(f"Error bulk updating flows in Datastore: {e}")

        try:
            self.room_flows[room_id] = new_flows
            logger.debug("Replaced flows for room %s: %d flows", room_id, len(new_flows))
            return True
        except Exception:
            logger.exception("Failed to replace flows for room %s", room_id)
            return False

    def _handle_singular_flow_update(self, room_id: str, data: Dict) -> bool:
        """
        Handle flow_update operation for a single flow.
        Expects a dict with 'id' and 'updates' keys.
        """
        self.room_flows.setdefault(room_id, [])
        flow_id = data.get("id")
        if not flow_id:
            logger.warning("flow_update missing flow ID")
            return False

        # Find the flow to update
        flow_index = None
        for i, flow in enumerate(self.room_flows[room_id]):
            try:
                fid = getattr(flow, 'id', None)
            except Exception:
                fid = None
            if fid == flow_id:
                flow_index = i
                break

        if flow_index is None:
            logger.debug("Flow %s not found in room %s; skipping update", flow_id, room_id)
            return False

        flow = self.room_flows[room_id][flow_index]
        updates = data.get("updates", {})
        flow_updates = {}

        # Handle name change
        if "name" in updates:
            name_update = updates["name"]
            if isinstance(name_update, dict) and "new" in name_update:
                flow_updates["name"] = name_update["new"]
            else:
                flow_updates["name"] = name_update

        # Handle startNodeId change
        if "startNodeId" in updates:
            start_update = updates["startNodeId"]
            if isinstance(start_update, dict) and "new" in start_update:
                flow_updates["startNodeId"] = start_update["new"]
            else:
                flow_updates["startNodeId"] = start_update

        # Handle endNodeId change
        if "endNodeId" in updates:
            end_update = updates["endNodeId"]
            if isinstance(end_update, dict) and "new" in end_update:
                flow_updates["endNodeId"] = end_update["new"]
            else:
                flow_updates["endNodeId"] = end_update

        # Handle viaNodeIds change
        if "viaNodeIds" in updates:
            via_update = updates["viaNodeIds"]
            if isinstance(via_update, dict) and "new" in via_update:
                flow_updates["viaNodeIds"] = via_update["new"]
            else:
                flow_updates["viaNodeIds"] = via_update

        # Handle pathNodeIds change
        if "pathNodeIds" in updates:
            path_update = updates["pathNodeIds"]
            if isinstance(path_update, dict) and "new" in path_update:
                flow_updates["pathNodeIds"] = path_update["new"]
            else:
                flow_updates["pathNodeIds"] = path_update

        # Handle precondition change
        if "precondition" in updates:
            precondition_update = updates["precondition"]
            if isinstance(precondition_update, dict) and "new" in precondition_update:
                flow_updates["precondition"] = precondition_update["new"]
            else:
                flow_updates["precondition"] = precondition_update

        # Handle scenarios change
        if "scenarios" in updates:
            scenarios_update = updates["scenarios"]
            if isinstance(scenarios_update, dict) and "new" in scenarios_update:
                flow_updates["scenarios"] = scenarios_update["new"]
            else:
                flow_updates["scenarios"] = scenarios_update

        # Handle credentials change
        if "credentials" in updates:
            credentials_update = updates["credentials"]
            if isinstance(credentials_update, dict) and "new" in credentials_update:
                flow_updates["credentials"] = credentials_update["new"]
            else:
                flow_updates["credentials"] = credentials_update

        # Handle videoUrl change
        if "videoUrl" in updates:
            video_update = updates["videoUrl"]
            if isinstance(video_update, dict) and "new" in video_update:
                flow_updates["videoUrl"] = video_update["new"]
            else:
                flow_updates["videoUrl"] = video_update

        # Handle autoPlan change
        if "autoPlan" in updates:
            auto_plan_update = updates["autoPlan"]
            if isinstance(auto_plan_update, dict) and "new" in auto_plan_update:
                flow_updates["autoPlan"] = auto_plan_update["new"]
            else:
                flow_updates["autoPlan"] = auto_plan_update

        if flow_updates:
            try:
                updated_flow = flow.model_copy(update=flow_updates)
                self.room_flows[room_id][flow_index] = updated_flow
                
                # Persist to Datastore
                if self.flow_service:
                    try:
                        self.flow_service.update_flow(
                            product_id=room_id,
                            flow_id=flow_id,
                            **flow_updates
                        )
                    except Exception as e:
                        logger.error(f"Error updating flow in Datastore: {e}")
                
                logger.info("Updated flow %s in room %s with %s", flow_id, room_id, flow_updates)
                return True
            except Exception:
                logger.exception("Failed to apply flow update for %s in room %s: %s", flow_id, room_id, flow_updates)
        else:
            logger.debug("No updates to apply for flow %s in room %s", flow_id, room_id)
        return False

    # Plural flow operation handlers
    def _handle_flows_create(self, room_id: str, data: Dict) -> bool:
        """Handle flows_create operation with array of flows"""
        # Handle both old format (single flow) and new format (array of flows)
        if isinstance(data, list):
            flows_data = data
        elif isinstance(data, dict) and "id" in data:
            # Old single flow format - wrap in array
            flows_data = [data]
        else:
            logger.warning("Invalid flows_create data format")
            return False
        
        if self.flow_service:
            try:
                flows_to_create = []
                for flow_data in flows_data:
                    flow_id = flow_data.get("id", "")
                    
                    scenarios = flow_data.get("scenarios", None)
                    
                    new_flow = Flow(
                        id=flow_id,
                        name=flow_data.get("name", ""),
                        startNodeId=flow_data.get("startNodeId", ""),
                        endNodeId=flow_data.get("endNodeId", ""),
                        viaNodeIds=flow_data.get("viaNodeIds", []),
                        pathNodeIds=flow_data.get("pathNodeIds", []),
                        precondition=flow_data.get("precondition", ""),
                        scenarios=scenarios,
                        credentials=flow_data.get("credentials", None),
                        videoUrl=flow_data.get("videoUrl", None),
                        autoPlan=flow_data.get("autoPlan", True),
                        description=flow_data.get("description", ""),
                        feature_id=flow_data.get("feature_id", ""),
                        product_id=flow_data.get("product_id", "")
                    )
                    flows_to_create.append(new_flow)
                
                if flows_to_create:
                    self.flow_service.create_flows(room_id, flows_to_create)
                    
            except Exception as e:
                logger.error(f"Error bulk writing flows to Datastore: {e}")

        created_count = 0
        for flow_data in flows_data:
            flow_id = flow_data.get("id")
            if not flow_id:
                logger.warning("Flow missing ID, skipping")
                continue
            
            try:
                # Create new flow using the Flow model for local state
                new_flow = Flow(
                    id=flow_id,
                    name=flow_data.get("name", ""),
                    startNodeId=flow_data.get("startNodeId", ""),
                    endNodeId=flow_data.get("endNodeId", ""),
                    viaNodeIds=flow_data.get("viaNodeIds", []),
                    pathNodeIds=flow_data.get("pathNodeIds", []),
                    precondition=flow_data.get("precondition", ""),
                    description=flow_data.get("description", ""),
                    scenarios=flow_data.get("scenarios", None),
                    credentials=flow_data.get("credentials", None),
                    videoUrl=flow_data.get("videoUrl", None),
                    autoPlan=flow_data.get("autoPlan", True),
                    feature_id=flow_data.get("feature_id", ""),
                    product_id=flow_data.get("product_id", "")
                )
                
                # Add to room's flows
                self.room_flows[room_id].append(new_flow)
                created_count += 1
            except Exception:
                logger.exception("Failed to create flow %s", flow_id)
        
        return created_count > 0

    def _handle_flows_delete(self, room_id: str, data: Dict) -> bool:
        """Handle flows_delete operation with array of flow IDs"""
        # Handle both old format (single ID) and new format (array of IDs)
        if isinstance(data, list):
            flow_ids = [item.get("id") if isinstance(item, dict) else item for item in data]
        elif isinstance(data, str):
            # Old single ID format - wrap in array
            flow_ids = [data]
        elif isinstance(data, dict) and "id" in data:
            # Old dict format with ID - wrap in array
            flow_ids = [data["id"]]
        else:
            logger.warning("Invalid flows_delete data format")
            return False
            
        deleted_count = 0
        
        for flow_id in flow_ids:
            if not flow_id:
                continue
                
            # Find and remove the flow
            for i, flow in enumerate(self.room_flows[room_id]):
                if flow.id == flow_id:
                    self.room_flows[room_id].pop(i)
                    deleted_count += 1
                    break
        
        return deleted_count > 0

    # Comment operation handlers
    def _ensure_comments_are_models(self, room_id: str):
        """Ensure the room's comments container is a dict containing a 'comments' list of Comment model instances.

        Defensive: persisted or seeded data may contain plain dicts. Convert dicts in-place to Comment(...) models where possible.
        """
        # Ensure the container exists and has a list under 'comments'
        self.room_comments.setdefault(room_id, {"comments": []})
        comment_list = self.room_comments[room_id].setdefault('comments', [])
        for i, item in enumerate(list(comment_list)):
            # If item is already a Comment model, skip
            try:
                if isinstance(item, Comment):
                    continue
            except Exception:
                pass

            # Convert dict -> Comment
            if isinstance(item, dict):
                try:
                    comment_list[i] = Comment(
                        id=str(item.get('id') or ''),
                        content=item.get('content', item.get('text', '')),
                        createdAt=item.get('createdAt', str(time.time())),
                        updatedAt=item.get('updatedAt', str(time.time())),
                        position=CommentPosition(x=item.get('position', {}).get('x', item.get('x', 0)), y=item.get('position', {}).get('y', item.get('y', 0)))
                    )
                except Exception:
                    logger.exception("Failed to convert comment dict to Comment model for room %s: %s", room_id, item)
            else:
                # Try to coerce objects with __dict__ into Comment
                if hasattr(item, '__dict__'):
                    try:
                        d = copy.deepcopy(item.__dict__)
                        comment_list[i] = Comment(
                            id=str(d.get('id') or ''),
                            content=d.get('content', d.get('text', '')),
                            createdAt=d.get('createdAt', str(time.time())),
                            updatedAt=d.get('updatedAt', str(time.time())),
                            position=CommentPosition(x=d.get('position', {}).get('x', d.get('x', 0)), y=d.get('position', {}).get('y', d.get('y', 0)))
                        )
                    except Exception:
                        logger.debug("Unable to coerce comment-like object to Comment for room %s: %s", room_id, type(item))

    def _handle_comment_add(self, room_id: str, data: Dict) -> bool:
        """Handle comment_add operation"""
        comment_id = data.get("id")
        if not comment_id:
            return False
        
        # Create new comment using the Comment model
        new_comment = Comment(
            id=comment_id,
            content=data.get("text", ""),  # Map 'text' to 'content'
            createdAt=str(time.time()),
            updatedAt=str(time.time()),
            position=CommentPosition(
                x=data.get("x", 0),
                y=data.get("y", 0)
            )
        )
        
        # Add to room's comments (store under 'comments' key)
        self.room_comments.setdefault(room_id, {"comments": []})
        self.room_comments[room_id]["comments"].append(new_comment)
        return True

    def _handle_comment_update(self, room_id: str, data: Dict) -> bool:
        """Handle comment_update operation with unified updates"""
        comment_id = data.get("id")
        if not comment_id:
            return False
        
        comment_index = None
        for i, comment in enumerate(self.room_comments[room_id].get('comments', [])):
            if comment.id == comment_id:
                comment_index = i
                break
        
        if comment_index is None:
            return False
        
        comment = self.room_comments[room_id]['comments'][comment_index]
        updates = data.get("updates", {})
        
        comment_updates = {}
        position_updates = {}
        
        if "content" in updates:
            content_update = updates["content"]
            if isinstance(content_update, dict) and "new" in content_update:
                comment_updates["content"] = content_update["new"]
            else:
                comment_updates["content"] = content_update
        
        if "position" in updates:
            pos_update = updates["position"]
            if isinstance(pos_update, dict) and "new" in pos_update:
                new_pos = pos_update["new"]
                position_updates["x"] = new_pos.get("x", comment.position.x)
                position_updates["y"] = new_pos.get("y", comment.position.y)
        
        comment_updates["updatedAt"] = str(time.time())
        
        updated_position = comment.position
        if position_updates:
            updated_position = comment.position.model_copy(update=position_updates)
            comment_updates["position"] = updated_position
        
        if comment_updates:
            updated_comment = comment.model_copy(update=comment_updates)
            self.room_comments[room_id]['comments'][comment_index] = updated_comment
        
        return True

    def _handle_comment_delete(self, room_id: str, data: Dict) -> bool:
        """Handle comment_delete operation"""
        comment_id = data.get("id")
        if not comment_id:
            return False
        
        for i, comment in enumerate(self.room_comments[room_id].get('comments', [])):
            if comment.id == comment_id:
                self.room_comments[room_id]['comments'].pop(i)
                return True
                
        return False

    # Plural comment operation handlers
    def _handle_comments_create(self, room_id: str, data: Dict) -> bool:
        """Handle comments_create operation with array of comments"""
        # Handle both old format (single comment) and new format (array of comments)
        if isinstance(data, list):
            comments_data = data
        elif isinstance(data, dict) and "id" in data:
            # Old single comment format - wrap in array
            comments_data = [data]
        else:
            logger.warning("Invalid comments_create data format")
            return False
        
        created_count = 0
        # Ensure canonical list exists
        self.room_comments.setdefault(room_id, {"comments": []})
        try:
            self._ensure_comments_are_models(room_id)
        except Exception:
            logger.exception("Error ensuring comments models for room %s", room_id)
        
        for comment_data in comments_data:
            comment_id = comment_data.get("id")
            if not comment_id:
                logger.warning("Comment missing ID, skipping")
                continue
            try:
                new_comment = Comment(
                    id=comment_id,
                    content=comment_data.get("text", comment_data.get("content", "")),
                    createdAt=comment_data.get("createdAt", str(time.time())),
                    updatedAt=comment_data.get("updatedAt", str(time.time())),
                    position=CommentPosition(
                        x=comment_data.get("position", {}).get("x", comment_data.get("x", 0)),
                        y=comment_data.get("position", {}).get("y", comment_data.get("y", 0))
                    )
                )
                # Append to room's comment list under 'comments'
                self.room_comments[room_id]["comments"].append(new_comment)
                created_count += 1
            except Exception:
                logger.exception("Failed to create comment for room %s from item %s", room_id, comment_data)
        
        return created_count > 0

    def _handle_comments_update(self, room_id: str, data: Dict) -> bool:
        """Handle comments_update operation with array of comment updates"""
        # Handle both old format (single update) and new format (array of updates)
        if isinstance(data, list):
            updates_data = data
        elif isinstance(data, dict) and "id" in data:
            # Old single update format - wrap in array
            updates_data = [data]
        else:
            logger.warning("Invalid comments_update data format")
            return False
            
        updated_count = 0
        # Ensure canonical list and convert any dicts
        self.room_comments.setdefault(room_id, {"comments": []})
        try:
            self._ensure_comments_are_models(room_id)
        except Exception:
            logger.exception("Error ensuring comments models before update for room %s", room_id)
        
        for update_data in updates_data:
            comment_id = update_data.get("id")
            if not comment_id:
                logger.warning("Comment update missing ID, skipping")
                continue
            
            # Find the comment to update
            comment_list = self.room_comments[room_id].get('comments', [])
            for i, comment in enumerate(comment_list):
                try:
                    existing_id = getattr(comment, 'id', None)
                except Exception:
                    existing_id = None
                if existing_id != comment_id:
                    continue

                updates = update_data.get("updates", {})
                comment_updates = {}
                position_updates = {}
                
                # Handle content change
                if "content" in updates:
                    content_update = updates["content"]
                    if isinstance(content_update, dict) and "new" in content_update:
                        comment_updates["content"] = content_update["new"]
                    else:
                        comment_updates["content"] = content_update
                elif "text" in updates:
                    text_update = updates["text"]
                    if isinstance(text_update, dict) and "new" in text_update:
                        comment_updates["content"] = text_update["new"]
                    else:
                        comment_updates["content"] = text_update

                # Handle position change
                if "position" in updates:
                    position_update = updates["position"]
                    if isinstance(position_update, dict) and "new" in position_update:
                        new_pos = position_update["new"]
                        position_updates["x"] = new_pos.get("x", 0)
                        position_updates["y"] = new_pos.get("y", 0)
                    else:
                        position_updates["x"] = position_update.get("x", 0)
                        position_updates["y"] = position_update.get("y", 0)

                # Update timestamp
                comment_updates["updatedAt"] = str(time.time())

                # Create updated position if needed
                if position_updates:
                    # Ensure comment is a Comment model
                    if not isinstance(comment, Comment) and isinstance(comment, dict):
                        try:
                            comment = Comment(
                                id=comment.get('id'),
                                content=comment.get('content', comment.get('text', '')),
                                createdAt=comment.get('createdAt', str(time.time())),
                                updatedAt=comment.get('updatedAt', str(time.time())),
                                position=CommentPosition(x=comment.get('position', {}).get('x', comment.get('x', 0)), y=comment.get('position', {}).get('y', comment.get('y', 0)))
                            )
                            self.room_comments[room_id]['comments'][i] = comment
                        except Exception:
                            logger.exception("Failed to coerce existing comment dict to Comment model for room %s, id %s", room_id, comment_id)
                    updated_position = comment.position.model_copy(update=position_updates)
                    comment_updates["position"] = updated_position

                # Apply updates
                if comment_updates:
                    try:
                        updated_comment = comment.model_copy(update=comment_updates)
                        self.room_comments[room_id]['comments'][i] = updated_comment
                        updated_count += 1
                    except Exception:
                        logger.exception("Failed to apply comment update for %s in room %s: %s", comment_id, room_id, comment_updates)
                break
        
        return updated_count > 0

    def _handle_comments_delete(self, room_id: str, data: Dict) -> bool:
        """Handle comments_delete operation with array of comment IDs"""
        # Handle both old format (single ID) and new format (array of IDs)
        if isinstance(data, list):
            comment_ids = [item.get("id") if isinstance(item, dict) else item for item in data]
        elif isinstance(data, str):
            # Old single ID format - wrap in array
            comment_ids = [data]
        elif isinstance(data, dict) and "id" in data:
            # Old dict format with ID - wrap in array
            comment_ids = [data["id"]]
        else:
            logger.warning("Invalid comments_delete data format")
            return False
            
        deleted_count = 0
        self.room_comments.setdefault(room_id, {"comments": []})
        try:
            self._ensure_comments_are_models(room_id)
        except Exception:
            logger.exception("Error ensuring comments models before delete for room %s", room_id)
        
        for comment_id in comment_ids:
            if not comment_id:
                continue
                
            # Find and remove the comment
            for i, comment in enumerate(list(self.room_comments[room_id].get('comments', []))):
                try:
                    existing_id = getattr(comment, 'id', None)
                except Exception:
                    existing_id = None
                if existing_id == comment_id:
                    try:
                        self.room_comments[room_id]['comments'].pop(i)
                        deleted_count += 1
                        break
                    except Exception:
                        logger.exception("Failed to remove comment %s from room %s", comment_id, room_id)
        
        return deleted_count > 0

    # Credential operation handlers
    def _handle_credential_add(self, room_id: str, data: Dict) -> bool:
        """Handle credential_add operation - no-op, just return True to allow broadcasting"""
        logger.info(f"Received credential_add operation for room {room_id}, data: {data}")
        # This is a pass-through operation - we don't store credentials in room state
        # Just return True to allow the operation to be tracked and broadcasted
        return True

    def get_room_state(self, room_id: str) -> Optional[Dict]:
        """Get the current state of a room"""
        try:
            with self._get_room_lock(room_id):
                if room_id in self.room_graph:

                    features_list = []
                    if self.feature_service:
                        try:
                            datastore_features = self.feature_service.get_features(room_id)

                            features_list = [
                                CollaborationFeature(
                                    id=f.id,
                                    name=f.name,
                                    nodeIds=f.nodeIds
                                ).model_dump()
                                for f in datastore_features
                            ]
                        except Exception as e:
                            logger.warning(f"Failed to fetch features from Datastore for room state: {e}")
                    
                    return {
                        "graph": self.room_graph[room_id].model_dump(),
                        "flows": [flow.model_dump() for flow in self.room_flows[room_id]],
                        "features": features_list,
                        "comments": [comment.model_dump() for comment in (self.room_comments.get(room_id, {"comments": []}).get('comments', []))],
                        "metadata": {
                            "last_modified": time.time(),
                            "version": 1
                        }
                    }
                return None
        except Exception as e:
            logger.error(f"Error getting room state for {room_id}: {e}")
            return None

    def get_room_operations_since(self, room_id: str, timestamp: float) -> List[Dict]:
        """Get operations since a specific timestamp"""
        try:
            with self._get_room_lock(room_id):
                if room_id not in self.room_operations:
                    return []
                
                return [
                    op for op in self.room_operations[room_id]
                    if op.get("timestamp", 0) > timestamp
                ]
        except Exception as e:
            logger.error(f"Error getting operations for room {room_id}: {e}")
            return []

    def _save_room_state(self, room_id: str):
        """Save room state to disk"""
        try:
            with self._get_room_lock(room_id):
                if room_id not in self.room_graph:
                    return

                file_path = self._get_room_file_path(room_id)
                
                save_data = {
                    "room_id": room_id,
                    "state": self.get_room_state(room_id),
                    "operations": self.room_operations[room_id],
                    "last_modified": time.time(),
                    "version": "1.0"
                }

                temp_path = file_path + ".tmp"
                with open(temp_path, 'w') as f:
                    json.dump(save_data, f, indent=2)
                
                os.rename(temp_path, file_path)
                
                if room_id in self.save_timers:
                    self.save_timers[room_id].cancel()
                    del self.save_timers[room_id]

                logger.info(f"Saved state for room {room_id}")

        except Exception as e:
            logger.error(f"Error saving room state for {room_id}: {e}")

    def save_all_rooms(self):
        """Save all room states to disk"""
        for room_id in list(self.room_graph.keys()):
            self._save_room_state(room_id)

    def _serialize_artifact(self, obj: Any) -> Any:
        """Safely convert graph-related objects into plain JSON-serializable Python structures."""
        try:
            def _rec(o: Any) -> Any:
                if o is None or isinstance(o, (str, int, float, bool)):
                    return o
                if isinstance(o, dict):
                    return {k: _rec(v) for k, v in o.items()}
                if isinstance(o, (list, tuple, set)):
                    return [_rec(item) for item in o]
                if hasattr(o, 'dict') and callable(getattr(o, 'dict')):
                    try:
                        return _rec(o.dict())
                    except Exception:
                        pass
                if hasattr(o, '__dict__'):
                    try:
                        return _rec(copy.deepcopy(o.__dict__))
                    except Exception:
                        pass
                try:
                    return json.loads(json.dumps(o, default=lambda x: getattr(x, '__dict__', str(x))))
                except Exception:
                    return str(o)

            return _rec(obj)
        except Exception:
            logger.exception("Failed to serialize artifact for GCS backup; using empty default")
            return {}

    def start_gcs_periodic_backup(self, room_id: str, graph_service, product_id: str, interval_seconds: int = 15) -> bool:
        """Start a background thread that periodically uploads room artifacts to GCS."""
        if not graph_service:
            logger.error("graph_service is required to start GCS periodic backup")
            return False

        with self._gcs_backups_lock:
            if room_id in self._gcs_backup_savers:
                logger.info("GCS backup already running for %s; restarting", room_id)
        try:
            if room_id in self._gcs_backup_savers:
                try:
                    self.stop_gcs_periodic_backup(room_id)
                except Exception:
                    logger.exception("Error stopping existing GCS saver for %s", room_id)

            stop_event = threading.Event()

            def _worker():
                logger.info("GCS periodic backup started for room %s (product=%s, interval=%s)", room_id, product_id, interval_seconds)
                with self._gcs_backups_lock:
                    entry = self._gcs_backup_savers.get(room_id)
                    if entry is not None:
                        entry['started_at'] = time.time()
                        entry['last_run'] = time.time()

                try:
                    iteration = 0
                    while not stop_event.wait(interval_seconds):
                        try:
                            iteration += 1
                            logger.info("GCS backup iteration %s for room %s", iteration, room_id)
                            logger.info("Acquiring data for GCS backup of room %s", room_id)
                            graph_obj = self.room_graph.get(room_id)
                            flows = self.room_flows.get(room_id, [])
                            comments = self.room_comments.get(room_id, {})
                            
                            # Features are stored in Datastore, not GCS - skipping them
                            payload = {
                                'graph_data': self._serialize_artifact(graph_obj),
                                'flows_data': self._serialize_artifact(flows),
                                'comments_data': self._serialize_artifact(comments)
                            }
                            try:
                                filenames = {
                                    'graph_data': f"room_{product_id}_graph-export.json",
                                    'flows_data': f"room_{product_id}_flows-export.json",
                                    'comments_data': f"room_{product_id}_comments.json",
                                }

                                for key, fname in filenames.items():
                                    file_path = os.path.join(self.persistence_dir, fname)
                                    tmp_path = file_path + '.tmp'
                                    try:
                                        with open(tmp_path, 'w') as f:
                                            json.dump(payload.get(key, {}), f, indent=2)
                                        os.replace(tmp_path, file_path)
                                    except Exception:
                                        logger.exception("Failed to write persistence artifact %s for room %s", fname, room_id)
                            except Exception:
                                logger.exception("Error while writing local persistence artifacts for room %s", room_id)

                            try:
                                # Offload upload to dedicated backup executor when possible
                                def _upload_task():
                                    try:
                                        # Prefer combined save_graph_data API if available
                                        if hasattr(graph_service, 'save_graph_data'):
                                            try:
                                                # GraphService.save_graph_data expects (product_id, data) or keyword 'data'
                                                return graph_service.save_graph_data(product_id=product_id, data=payload)
                                            except TypeError:
                                                # Positional fallback
                                                return graph_service.save_graph_data(product_id, payload)
                                        # Fallback: attempt to save individual artifacts if supported
                                        elif hasattr(graph_service, 'save_individual_data'):
                                            results = {}
                                            for key, data_blob in payload.items():
                                                try:
                                                    # GraphService.save_individual_data signature: (product_id, data_type, data)
                                                    results[key] = graph_service.save_individual_data(product_id, key, data_blob)
                                                except Exception:
                                                    logger.exception("Error saving individual artifact %s for room %s", key, room_id)
                                            return {'success': True, 'details': results}
                                        else:
                                            logger.warning("GraphService has no recognized upload API; skipping upload")
                                            return {'success': False, 'message': 'no_upload_api'}
                                    except Exception:
                                        logger.exception("Unhandled exception during GCS upload task for room %s", room_id)
                                        return {'success': False, 'exception': 'upload_failed'}

                                if self._backup_executor:
                                    future = self._backup_executor.submit(_upload_task)

                                    def _upload_done(fut):
                                        try:
                                            res = fut.result()
                                            if not res or not res.get('success'):
                                                logger.warning("GCS backup upload reported failure for room %s: %s", room_id, res)
                                            else:
                                                logger.info("GCS backup upload succeeded for room %s", room_id)
                                        except Exception:
                                            logger.exception("GCS backup upload future failed for room %s", room_id)

                                    try:
                                        future.add_done_callback(_upload_done)
                                    except Exception:
                                        # Some futures implementations don't support add_done_callback reliably; handle best-effort
                                        pass
                                else:
                                    # No dedicated executor: run inline (best-effort)
                                    res = _upload_task()
                                    if not res or not res.get('success'):
                                        logger.warning("GCS backup upload reported failure for room %s: %s", room_id, res)
                                    else:
                                        logger.info("GCS backup upload succeeded for room %s", room_id)

                            except Exception:
                                logger.exception("Error while performing GCS backup upload for room %s", room_id)
                        except Exception:
                            logger.exception("Unhandled exception in GCS backup worker for room %s", room_id)
                    logger.info("GCS periodic backup stopping for room %s", room_id)
                except Exception:
                    logger.exception("Fatal exception in GCS backup worker for room %s", room_id)
                    with self._gcs_backups_lock:
                        if room_id in self._gcs_backup_savers:
                            self._gcs_backup_savers[room_id]['failed_at'] = time.time()
                finally:
                    logger.info("GCS periodic backup stopping for room %s", room_id)

            with self._gcs_backups_lock:
                self._gcs_backup_savers[room_id] = {
                    'thread': None,
                    'stop_event': stop_event,
                    'product_id': product_id,
                    'graph_service': graph_service,
                    'started_at': time.time(),
                    'last_run': time.time(),
                    'failed_at': None,
                }

            t = threading.Thread(target=_worker, daemon=True)
            t.start()

            with self._gcs_backups_lock:
                if room_id in self._gcs_backup_savers:
                    self._gcs_backup_savers[room_id]['thread'] = t

            try:
                if self._gcs_monitor_thread is None or not self._gcs_monitor_thread.is_alive():
                    self._start_gcs_monitor()
            except Exception:
                logger.exception("Failed to start GCS monitor thread")
            return True
        except Exception:
            logger.exception("Failed to start GCS backup thread for room %s", room_id)
            return False

    def stop_gcs_periodic_backup(self, room_id: str) -> bool:
        """Stop a running GCS periodic backup for the specified room."""
        if not hasattr(self, '_gcs_backup_savers'):
            return False
        entry = None
        with self._gcs_backups_lock:
            entry = self._gcs_backup_savers.pop(room_id, None)
        if not entry:
            return False
        try:
            entry['stop_event'].set()
            entry['thread'].join(timeout=5)
        except Exception:
            logger.exception("Error stopping GCS periodic backup for %s", room_id)
        return True

    def stop_all_gcs_backups(self):
        """Stop all running GCS periodic backups."""
        if not hasattr(self, '_gcs_backup_savers'):
            return
        with self._gcs_backups_lock:
            keys = list(self._gcs_backup_savers.keys())

        for rid in keys:
            try:
                self.stop_gcs_periodic_backup(rid)
            except Exception:
                logger.exception("Failed to stop GCS backup for %s", rid)

        try:
            if self._gcs_monitor_stop_event is not None:
                self._gcs_monitor_stop_event.set()
            if self._gcs_monitor_thread is not None:
                self._gcs_monitor_thread.join(timeout=2)
        except Exception:
            logger.exception("Failed to stop GCS monitor thread")
        return

    def _start_gcs_monitor(self):
        """Start a background monitor that ensures per-room saver threads stay alive."""
        if self._gcs_monitor_thread is not None and self._gcs_monitor_thread.is_alive():
            return

        stop_ev = threading.Event()

        def _monitor():
            logger.info("GCS monitor thread started")
            while not stop_ev.wait(10):
                try:
                    with self._gcs_backups_lock:
                        items = list(self._gcs_backup_savers.items())
                    for rid, entry in items:
                        try:
                            thr = entry.get('thread')
                            ev = entry.get('stop_event')
                            prod = entry.get('product_id')
                            failed_at = entry.get('failed_at')
                            if ev is not None and ev.is_set():
                                continue
                            if thr is None or not thr.is_alive():
                                if failed_at and (time.time() - failed_at) < 5:
                                    logger.debug("Recent failure for %s; skipping immediate restart", rid)
                                    continue
                                logger.warning("Detected dead GCS backup worker for room %s; restarting", rid)
                                try:
                                    gs = entry.get('graph_service')
                                    if gs is None:
                                        logger.warning("No graph_service available to restart saver for %s", rid)
                                        continue
                                    self.start_gcs_periodic_backup(rid, gs, prod or rid)
                                except Exception:
                                    logger.exception("Failed to restart GCS backup for %s", rid)
                        except Exception:
                            logger.exception("Error inspecting saver entry for %s", rid)
                except Exception:
                    logger.exception("Unhandled exception in GCS monitor loop")
            logger.info("GCS monitor thread stopping")

        thr = threading.Thread(target=_monitor, daemon=True)
        self._gcs_monitor_thread = thr
        self._gcs_monitor_stop_event = stop_ev
        thr.start()

    def cleanup_room(self, room_id: str):
        """Clean up room data when room is deleted"""
        try:
            try:
                self.stop_gcs_periodic_backup(room_id)
            except Exception:
                logger.exception("Error stopping GCS backup during cleanup for %s", room_id)

            # self._save_room_state(room_id)
            if room_id in self.room_graph:
                del self.room_graph[room_id]
            if room_id in self.room_flows:
                del self.room_flows[room_id]

            if room_id in self.room_comments:
                del self.room_comments[room_id]
            if room_id in self.room_operations:
                del self.room_operations[room_id]
            if room_id in self.save_timers:
                try:
                    self.save_timers[room_id].cancel()
                except Exception:
                    pass
                del self.save_timers[room_id]

                logger.info(f"Cleaned up room {room_id}")

        except Exception as e:
            logger.error(f"Error cleaning up room {room_id}: {e}")

    def sync_user_to_room_state(self, room_id: str, session_id: str):
        """Send the current room state to a user who just joined"""
        try:
            state = self.get_room_state(room_id)
            if state:
                self.socketio.emit("room_state_sync", {
                    "room_id": room_id,
                    "state": state,
                    "timestamp": time.time()
                }, room=session_id)
                
                logger.info(f"Synced room state for {room_id} to user {session_id}")
            else:
                logger.warning(f"No state found for room {room_id} during sync")

        except Exception as e:
            logger.error(f"Error syncing user {session_id} to room {room_id}: {e}")

    def get_persistence_stats(self) -> Dict:
        """Get statistics about the persistence service"""
        try:
            stats = {
                "total_rooms": len(self.room_graph),
                "total_operations": sum(len(ops) for ops in self.room_operations.values()),
                "rooms_info": {},
                "config": {
                    "auto_save_interval": self.auto_save_interval,
                    "max_operations_before_save": self.max_operations_before_save,
                    "state_history_limit": self.state_history_limit,
                    "cleanup_after_hours": self.cleanup_after_hours
                }
            }

            for room_id in self.room_graph.keys():
                stats["rooms_info"][room_id] = {
                    "nodes_count": len(self.room_graph[room_id].nodes),
                    "edges_count": len(self.room_graph[room_id].edges),
                    "features_count": len(self.feature_service.get_features(room_id)) if self.feature_service else 0,
                    "flows_count": len(self.room_flows.get(room_id, [])),
                    "comments_count": len(self.room_comments.get(room_id, {"comments": []}).get('comments', [])),
                    "operations_count": len(self.room_operations.get(room_id, [])),
                    "last_modified": time.time(),
                    "version": 1
                }

            return stats

        except Exception as e:
            logger.error(f"Error getting persistence stats: {e}")
            return {"error": "Failed to get stats"}
