from typing import List, Dict
from utils.collaboration_client import collaboration_manager

def _emit_nodes(product_id: str, nodes: List[Dict]) -> None:
    """Emit nodes to collaboration backend."""
    if not product_id or not nodes:
        return
    try:
        print(f"Emitting {len(nodes)} nodes to collaboration backend")
        collaboration_manager.emit_graph_changes_sync(
            product_id=product_id,
            nodes=nodes,
            edges=[],
            flows=None,
        )
        print(f"✓ Successfully emitted {len(nodes)} nodes")
    except Exception as e:
        print(f"Failed to emit nodes: {str(e)}", e)

def _emit_edge(product_id: str, edge: Dict) -> None:
    """Emit a single edge to collaboration backend."""
    if not product_id or not edge:
        return
    try:
        print(f"Emitting edge {edge.get('id')} to collaboration backend")
        collaboration_manager.emit_graph_changes_sync(
            product_id=product_id,
            nodes=[],
            edges=[edge],
            flows=None,
        )
        print(f"✓ Successfully emitted edge {edge.get('id')}")
    except Exception as e:
        print(f"Failed to emit edge: {str(e)}", e)

def _emit_flow(product_id: str, flow: Dict) -> None:
    """Emit a flow to collaboration backend."""
    if not product_id or not flow:
        return
    try:
        print(f"Emitting flow {flow.get('id')} to collaboration backend")
        collaboration_manager.emit_graph_changes_sync(
            product_id=product_id,
            nodes=[],
            edges=[],
            flows=[flow],
        )
        print(f"✓ Successfully emitted flow {flow.get('id')}")
    except Exception as e:
        print(f"Failed to emit flow: {str(e)}", e)
