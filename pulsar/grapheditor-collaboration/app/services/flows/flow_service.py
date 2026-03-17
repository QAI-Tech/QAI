import logging
from typing import List, Optional
from app.services.flows.flow_datastore import FlowDatastore
from app.services.flows.flow_models import Flow
from app.model.graph_models import Scenario

logger = logging.getLogger(__name__)


class FlowService:
    """Service for managing flows via Datastore"""

    def __init__(self, datastore: FlowDatastore):
        self.datastore = datastore

    def get_flows(self, product_id: str) -> List[Flow]:
        """Get all flows for a product_id"""
        try:
            return self.datastore.get_flows(product_id)
        except Exception as e:
            logger.error(f"Error getting flows for product_id {product_id}: {e}")
            raise

    def create_flow(
        self,
        product_id: str,
        flow: Flow
    ) -> Flow:
        """Create a new flow."""
        try:
            if not flow.name:
                raise ValueError("Flow name is required")
            
            return self.datastore.add_flow(
                product_id=product_id,
                flow=flow
            )
        except Exception as e:
            logger.error(f"Error creating flow: {e}")
            raise

    def update_flow(
        self,
        product_id: str,
        flow_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        startNodeId: Optional[str] = None,
        endNodeId: Optional[str] = None,
        viaNodeIds: Optional[List[str]] = None,
        pathNodeIds: Optional[List[str]] = None,
        precondition: Optional[str] = None,
        scenarios: Optional[List[Scenario]] = None,
        credentials: Optional[List[str]] = None,
        videoUrl: Optional[str] = None,
        autoPlan: Optional[bool] = None,
        feature_id: Optional[str] = None
    ) -> Flow:
        """Update an existing flow"""
        try:
            updates = {
                "name": name,
                "description": description,
                "startNodeId": startNodeId,
                "endNodeId": endNodeId,
                "viaNodeIds": viaNodeIds,
                "pathNodeIds": pathNodeIds,
                "precondition": precondition,
                "scenarios": scenarios,
                "credentials": credentials,
                "videoUrl": videoUrl,
                "autoPlan": autoPlan,
                "feature_id": feature_id
            }
            # Remove None values
            updates = {k: v for k, v in updates.items() if v is not None}
            
            return self.datastore.update_flow(
                product_id=product_id,
                flow_id=flow_id,
                updates=updates
            )

        except Exception as e:
            logger.error(f"Error updating flow {flow_id}: {e}")
            raise

    def delete_flow(self, product_id: str, flow_id: str) -> None:
        """Delete a flow"""
        try:
            self.datastore.delete_flow(product_id, flow_id)

        except Exception as e:
            logger.error(f"Error deleting flow {flow_id}: {e}")
            raise
    def create_flows(self, product_id: str, flows: List[Flow]) -> List[Flow]:
        """Create multiple flows in a batch"""
        try:
            return self.datastore.add_flows(product_id, flows)
        except Exception as e:
            logger.error(f"Error bulk creating flows: {e}")
            raise

    def update_flows(self, product_id: str, updates_list: List[dict]) -> List[Flow]:
        """
        Update multiple flows in a batch.
        updates_list: list of dicts with 'id' and fields to update
        """
        try:
            return self.datastore.update_flows(product_id, updates_list)
        except Exception as e:
            logger.error(f"Error bulk updating flows: {e}")
            raise

    def delete_flows(self, product_id: str, flow_ids: List[str]) -> None:
        """Delete multiple flows in a batch"""
        try:
            self.datastore.delete_flows(product_id, flow_ids)
        except Exception as e:
            logger.error(f"Error bulk deleting flows: {e}")
            raise
