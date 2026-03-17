"""Utilities for applying collaboration graph events via REST API."""

import requests
from typing import Any, Dict, List, Optional, Set


class GraphEventsClient:
    """Client for sending collaboration graph events to the backend API."""

    def __init__(
        self,
        base_url: str = "https://graphcollab-prod.qaitech.ai",
        request_timeout: int = 30,
    ):
        self.base_url = base_url.rstrip("/")
        self.request_timeout = request_timeout
        print(
            f"DEBUG: GraphEventsClient initialized with base_url: {self.base_url}, timeout: {self.request_timeout}s"
        )

    def _deduplicate_by_id(
        self, items: List[Dict[str, Any]], item_type: str
    ) -> List[Dict[str, Any]]:
        """Remove duplicate items with the same ID, keeping the last occurrence."""
        if not items:
            return []

        deduped: Dict[str, Dict[str, Any]] = {}
        items_without_id: List[Dict[str, Any]] = []
        for item in items:
            identifier = item.get("id")
            if not identifier:
                items_without_id.append(item)
                continue
            deduped[identifier] = item

        if len(deduped) != len(items):
            print(
                f"DEBUG: Deduplicated {item_type}: {len(items)} original -> {len(deduped)} unique"
            )

        # Preserve the order based on last occurrence by re-iterating original list
        ordered_unique: List[Dict[str, Any]] = []
        seen: Set[str] = set()
        for item in items:
            identifier = item.get("id")
            if not identifier:
                continue
            if identifier in seen:
                continue
            if identifier in deduped:
                ordered_unique.append(deduped[identifier])
                seen.add(identifier)

        # Append items that lacked IDs in their original order
        ordered_unique.extend(items_without_id)

        return ordered_unique

    def convert_nodes_to_collaboration_format(
        self, nodes: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Convert internal node representation to collaboration backend format."""
        collaboration_nodes: List[Dict[str, Any]] = []

        for node in nodes:
            collaboration_node = {
                "id": node.get("id"),
                "x": node.get("position", {}).get("x", 0),
                "y": node.get("position", {}).get("y", 0),
                "title": node.get("data", {}).get("title", ""),
                "type": node.get("type", "rectangle"),
                "description": node.get("data", {}).get("description", ""),
                "detailed_description": node.get("data", {}).get(
                    "detailed_description", ""
                ),
                "width": node.get("width", 150),
                "height": node.get("height", 80),
                "color": node.get("style", {}).get("backgroundColor", "#3498db"),
                "metadata": {
                    "description": node.get("data", {}).get("description", ""),
                    **node.get("data", {}),
                },
            }
            collaboration_nodes.append(collaboration_node)

        return collaboration_nodes

    def convert_edges_to_collaboration_format(
        self, edges: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Convert internal edge representation to collaboration backend format."""
        collaboration_edges: List[Dict[str, Any]] = []

        for edge in edges:
            collaboration_edge = {
                "id": edge.get("id"),
                "source": edge.get("source"),
                "target": edge.get("target"),
                "source_anchor": edge.get("sourceHandle"),
                "target_anchor": edge.get("targetHandle"),
                "label": edge.get("data", {}).get("description", ""),
                "business_logic": edge.get("data", {}).get("business_logic", ""),
                "curvature": 0,
                "type": "arrow",
                "style": "solid",
            }
            collaboration_edges.append(collaboration_edge)

        return collaboration_edges

    def convert_flows_to_collaboration_format(
        self, flows: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Convert internal flow representation to collaboration backend format."""
        collaboration_flows: List[Dict[str, Any]] = []

        for flow in flows:
            collaboration_flow = {
                "id": flow.get("id"),
                "name": flow.get("name", "Generated Flow"),
                "startNodeId": flow.get("startNodeId"),
                "endNodeId": flow.get("endNodeId"),
                "viaNodeIds": flow.get("viaNodeIds", []),
                "pathNodeIds": flow.get("pathNodeIds", []),
                "description": flow.get("description", ""),
                "precondition": flow.get("precondition", ""),
                "credentials": flow.get("credentials", []),
                "scenarios": flow.get("scenarios", []),
                "autoPlan": flow.get("autoPlan", False),
                "videoUrl": flow.get("videoUrl", ""),
            }
            collaboration_flows.append(collaboration_flow)

        return collaboration_flows

    def _build_events(
        self,
        product_id: str,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        flows: Optional[List[Dict[str, Any]]] = None,
        is_incremental: bool = True,
    ) -> List[Dict[str, Any]]:
        """Construct the ordered list of collaboration events from graph components."""
        events: List[Dict[str, Any]] = []

        unique_nodes = self._deduplicate_by_id(nodes, "nodes")
        collab_nodes = self.convert_nodes_to_collaboration_format(unique_nodes)
        if collab_nodes:
            events.append(
                {
                    "event": "nodes_create" if is_incremental else "nodes_replace",
                    "data": collab_nodes,
                    "session_id": "add_flow",
                    "product_id": product_id,
                }
            )

        unique_edges = self._deduplicate_by_id(edges, "edges")
        collab_edges = self.convert_edges_to_collaboration_format(unique_edges)
        if collab_edges:
            events.append(
                {
                    "event": "edges_create" if is_incremental else "edges_replace",
                    "data": collab_edges,
                    "session_id": "add_flow",
                    "product_id": product_id,
                }
            )

        if flows:
            unique_flows = self._deduplicate_by_id(flows, "flows")
            collab_flows = self.convert_flows_to_collaboration_format(unique_flows)
            if collab_flows:
                events.append(
                    {
                        "event": "flows_create" if is_incremental else "flows_replace",
                        "data": collab_flows,
                        "session_id": "add_flow",
                        "product_id": product_id,
                    }
                )
        return events

    def apply_graph_events(
        self, product_id: str, events: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Send the provided events to the collaboration backend and return the response."""
        if not product_id:
            raise ValueError("product_id must be provided for graph events")

        payload = {"product_id": product_id, "events": events}
        url = f"{self.base_url}/api/graph-events/apply"

        print(
            f"DEBUG: Applying {len(events)} graph events via REST API for product: {product_id}"
        )

        try:
            response = requests.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=self.request_timeout,
            )
        except requests.RequestException as exc:
            print(
                f"DEBUG: Request to graph events API failed for product {product_id}: {exc}"
            )
            raise RuntimeError("Graph events API request failed") from exc

        print(
            f"DEBUG: Graph events API raw response for product {product_id}: status={response.status_code}, "
            f"content_type={response.headers.get('Content-Type')}, body={response.text}"
        )

        content_type = response.headers.get("Content-Type", "")
        raw_text = response.text
        body: Optional[Dict[str, Any]] = None

        if "application/json" in content_type.lower():
            try:
                body = response.json()
            except ValueError as exc:
                print(
                    f"DEBUG: Graph events API returned invalid JSON for product {product_id}: status={response.status_code}, raw={raw_text}"
                )
                if response.ok:
                    print(
                        "DEBUG: Treating invalid JSON response as success due to 2xx status"
                    )
                    return {
                        "success": True,
                        "events_received": len(events),
                        "events_applied": len(events),
                        "mode": "fallback_invalid_json",
                        "status_code": response.status_code,
                        "raw_response": raw_text,
                    }
                raise RuntimeError("Graph events API returned invalid JSON") from exc
        else:
            print(
                f"DEBUG: Graph events API returned non-JSON content-type '{content_type}' for product {product_id}: status={response.status_code}"
            )

        if body is None:
            if response.ok:
                print(
                    "DEBUG: Non-JSON response received with successful status; applying fallback success"
                )
                return {
                    "success": True,
                    "events_received": len(events),
                    "events_applied": len(events),
                    "mode": "fallback_non_json",
                    "status_code": response.status_code,
                    "raw_response": raw_text,
                }

            raise RuntimeError(
                f"Graph events API returned non-JSON error response (status {response.status_code})"
            )

        if not response.ok or not body.get("success", False):
            error_detail = body.get("events_failed") or body
            print(
                f"DEBUG: Graph events API reported failure for product {product_id}: status={response.status_code}, detail={error_detail}"
            )
            raise RuntimeError(
                f"Graph events API failed with status {response.status_code}: {error_detail}"
            )

        print(
            f"DEBUG: Graph events applied successfully for product {product_id}: "
            f"events_applied={body.get('events_applied')}, mode={body.get('mode')}"
        )

        return body

    def get_graph_data(self, product_id: str) -> Dict[str, Any]:
        """Fetch graph data via the REST API."""
        if not product_id:
            raise ValueError("product_id must be provided to fetch graph data")

        url = f"{self.base_url}/api/graph-events/graph"
        params = {"product_id": product_id}

        print(
            f"DEBUG: Fetching graph data via REST API for product: {product_id}"
        )

        try:
            response = requests.get(
                url,
                params=params,
                headers={"Content-Type": "application/json"},
                timeout=self.request_timeout,
            )
        except requests.RequestException as exc:
            print(
                f"DEBUG: Request to fetch graph data failed for product {product_id}: {exc}"
            )
            raise RuntimeError("Graph data API request failed") from exc

        print(
            f"DEBUG: Graph data API raw response for product {product_id}: status={response.status_code}"
        )

        if not response.ok:
            print(
                f"DEBUG: Graph data API reported failure for product {product_id}: status={response.status_code}, body={response.text}"
            )
            raise RuntimeError(
                f"Graph data API failed with status {response.status_code}"
            )

        try:
            return response.json()
        except ValueError as exc:
            print(
                f"DEBUG: Graph data API returned invalid JSON for product {product_id}: status={response.status_code}, body={response.text}"
            )
            raise RuntimeError("Graph data API returned invalid JSON") from exc

    def emit_graph_changes_sync(
        self,
        product_id: str,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        flows: Optional[List[Dict[str, Any]]] = None,
        is_incremental: bool = True,
    ) -> Dict[str, Any]:
        """Synchronously emit graph changes via the REST API."""
        events = self._build_events(product_id, nodes, edges, flows, is_incremental)

        if not events:
            print(
                f"DEBUG: No graph events to emit for product {product_id}; skipping API call"
            )
            return {"success": True, "events_received": 0, "events_applied": 0}

        return self.apply_graph_events(product_id, events)

    def emit_graph_event(
        self, product_id: str, event: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Emit a single graph event via the REST API."""
        if not product_id:
            raise ValueError("product_id must be provided for graph events")

        if not event:
            raise ValueError("event must be provided to emit")

        print(
            f"DEBUG: Emitting single graph event via REST API for product: {product_id}"
        )

        return self.apply_graph_events(product_id, [event])


# Global instance for easy access
collaboration_manager = GraphEventsClient()

# Backwards compatibility aliases
CollaborationClient = GraphEventsClient
CollaborationClientManager = GraphEventsClient
PersistentCollaborationClient = GraphEventsClient
PersistentCollaborationClientManager = GraphEventsClient
