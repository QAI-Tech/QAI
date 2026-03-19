import os
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from app.services.flows.flow_models import Flow
from app.model.graph_models import Scenario
from app.common.google_cloud_wrappers import GCPDatastoreWrapper

logger = logging.getLogger(__name__)


class FlowDatastore:
    """Datastore operations for Flows.
    
    Uses GCPDatastoreWrapper which auto-selects between SQLite (local) and
    Google Datastore (GCP) based on ORIONIS_BACKEND environment variable.
    This allows Flow persistence to be shared with Orionis.
    """

    ENTITY_KIND = "Flow"
    FIELD_ID = "id"
    FIELD_PRODUCT_ID = "product_id"
    FIELD_NAME = "name"
    FIELD_DESCRIPTION = "description"
    FIELD_START_NODE_ID = "startNodeId"
    FIELD_END_NODE_ID = "endNodeId"
    FIELD_VIA_NODE_IDS = "viaNodeIds"
    FIELD_PATH_NODE_IDS = "pathNodeIds"
    FIELD_PRECONDITION = "precondition"
    FIELD_SCENARIOS = "scenarios"
    FIELD_CREDENTIALS = "credentials"
    FIELD_VIDEO_URL = "videoUrl"
    FIELD_AUTO_PLAN = "autoPlan"
    FIELD_FEATURE_ID = "feature_id"
    
    FIELD_CREATED_AT = "created_at"
    FIELD_UPDATED_AT = "updated_at"

    def __init__(self):
        """Initialize shared Datastore client (SQLite or GCP based on backend)"""
        try:
            self.client = GCPDatastoreWrapper().get_datastore_client()
            self._is_sqlite_backend = hasattr(self.client, '_engine')
            backend_info = "SQLite (shared with Orionis)" if self._is_sqlite_backend else "Google Datastore"
            logger.info(f"FlowDatastore initialized with {backend_info} backend")
        except Exception as e:
            logger.error(f"Failed to initialize Datastore client: {e}")
            raise

    def get_flows(self, product_id: str) -> List[Flow]:
        """Get all flows for a product_id"""
        try:
            query = self.client.query(kind=self.ENTITY_KIND)
            query.add_filter(self.FIELD_PRODUCT_ID, "=", product_id)

            flows: list[Flow] = []
            for entity in query.fetch():
                try:
                    flows.append(self._entity_to_flow(entity))
                except Exception as e:
                    logger.error(f"Error converting flow entity {entity.key.name}: {e}")
                    continue
            
            logger.info(f"Fetched {len(flows)} flows for product_id: {product_id}")
            return flows
        except Exception as e:
            logger.error(f"Error fetching flows for product_id {product_id}: {e}")
            raise

    def add_flow(self, product_id: str, flow: Flow) -> Flow:
        """Add a new flow to Datastore"""
        try:
            if self._is_sqlite_backend:
                key = self.client.key(self.ENTITY_KIND)
            else:
                key = self.client.key(self.ENTITY_KIND, flow.id) if flow.id else self.client.key(self.ENTITY_KIND)
            entity = self.client.entity(key=key)
            now = datetime.now(timezone.utc)
            flow_id = flow.id or f"flow-{int(now.timestamp() * 1000)}"
            
            scenarios_data = [s.dict() for s in flow.scenarios] if flow.scenarios else None

            entity.update({
                self.FIELD_PRODUCT_ID: product_id,
                self.FIELD_NAME: flow.name,
                self.FIELD_DESCRIPTION: flow.description,
                self.FIELD_START_NODE_ID: flow.startNodeId,
                self.FIELD_END_NODE_ID: flow.endNodeId,
                self.FIELD_VIA_NODE_IDS: flow.viaNodeIds,
                self.FIELD_PATH_NODE_IDS: flow.pathNodeIds,
                self.FIELD_PRECONDITION: flow.precondition,
                self.FIELD_SCENARIOS: scenarios_data,
                self.FIELD_CREDENTIALS: flow.credentials,
                self.FIELD_VIDEO_URL: flow.videoUrl,
                self.FIELD_AUTO_PLAN: flow.autoPlan,
                self.FIELD_FEATURE_ID: flow.feature_id,
                self.FIELD_CREATED_AT: now,
                self.FIELD_UPDATED_AT: now,
            })

            if self._is_sqlite_backend:
                entity[self.FIELD_ID] = flow_id

            self.client.put(entity)
            flow_id_str = self._extract_flow_id(entity)

            logger.info(f"Added flow {flow.name} (id: {flow_id_str}) for product: {product_id}")

            return flow.copy(update={"id": flow_id_str})
            
        except Exception as e:
            logger.error(f"Error adding flow: {e}")
            raise ValueError(f"Failed to add flow: {str(e)}")

    def update_flow(self, product_id: str, flow_id: str, updates: dict) -> Flow:
        """Update an existing flow"""
        try:
            entity = self._get_entity_by_flow_id(flow_id)
            
            if not entity:
                logger.error(f"Flow {flow_id} not found")
                raise ValueError(f"Flow {flow_id} not found for product {product_id}")

            if entity.get(self.FIELD_PRODUCT_ID) != product_id:
                raise ValueError(f"Flow {flow_id} does not belong to product {product_id}")

            update_data = {
                self.FIELD_UPDATED_AT: datetime.now(timezone.utc)
            }
            
            field_map = {
                "name": self.FIELD_NAME,
                "description": self.FIELD_DESCRIPTION,
                "startNodeId": self.FIELD_START_NODE_ID,
                "endNodeId": self.FIELD_END_NODE_ID,
                "viaNodeIds": self.FIELD_VIA_NODE_IDS,
                "pathNodeIds": self.FIELD_PATH_NODE_IDS,
                "precondition": self.FIELD_PRECONDITION,
                "scenarios": self.FIELD_SCENARIOS,
                "credentials": self.FIELD_CREDENTIALS,
                "videoUrl": self.FIELD_VIDEO_URL,
                "autoPlan": self.FIELD_AUTO_PLAN,
                "feature_id": self.FIELD_FEATURE_ID
            }

            for model_field, db_field in field_map.items():
                if model_field in updates:
                     val = updates[model_field]
                     if model_field == "scenarios" and val is not None:
                         # Handle list of Scenario objects or list of dicts
                         val = [s.dict() if hasattr(s, 'dict') else s for s in val]
                     update_data[db_field] = val
            
            entity.update(update_data)
            self.client.put(entity)

            logger.info(f"Updated flow {flow_id} for product {product_id}")
            return self._entity_to_flow(entity)

        except Exception as e:
            logger.error(f"Error updating flow {flow_id}: {e}")
            raise ValueError(f"Failed to update flow {flow_id}: {str(e)}")

    def delete_flow(self, product_id: str, flow_id: str) -> None:
        """Delete a flow"""
        try:
            entity = self._get_entity_by_flow_id(flow_id)
            
            if not entity:
                 logger.warning(f"Flow {flow_id} not found during delete")
                 return

            if entity.get(self.FIELD_PRODUCT_ID) != product_id:
                raise ValueError(f"Flow {flow_id} does not belong to product {product_id}")

            self.client.delete(entity.key)
            logger.info(f"Deleted flow {flow_id} for product {product_id}")

        except Exception as e:
            logger.error(f"Error deleting flow {flow_id}: {e}")
            raise ValueError(f"Failed to delete flow {flow_id}: {str(e)}")

    def add_flows(self, product_id: str, flows: List[Flow]) -> List[Flow]:
        """Add multiple flows to Datastore in a batch"""
        if not flows:
            return []
            
        try:
            entities = []
            now = datetime.now(timezone.utc)
            
            for flow in flows:
                flow_id = flow.id or f"flow-{int(now.timestamp() * 1000)}"
                if self._is_sqlite_backend:
                    entity_key = self.client.key(self.ENTITY_KIND)
                else:
                    entity_key = self.client.key(self.ENTITY_KIND, flow_id)
                entity = self.client.entity(key=entity_key)
                
                scenarios_data = [s.dict() for s in flow.scenarios] if flow.scenarios else None

                entity.update({
                    self.FIELD_PRODUCT_ID: product_id,
                    self.FIELD_NAME: flow.name,
                    self.FIELD_DESCRIPTION: flow.description,
                    self.FIELD_START_NODE_ID: flow.startNodeId,
                    self.FIELD_END_NODE_ID: flow.endNodeId,
                    self.FIELD_VIA_NODE_IDS: flow.viaNodeIds,
                    self.FIELD_PATH_NODE_IDS: flow.pathNodeIds,
                    self.FIELD_PRECONDITION: flow.precondition,
                    self.FIELD_SCENARIOS: scenarios_data,
                    self.FIELD_CREDENTIALS: flow.credentials,
                    self.FIELD_VIDEO_URL: flow.videoUrl,
                    self.FIELD_AUTO_PLAN: flow.autoPlan,
                    self.FIELD_FEATURE_ID: flow.feature_id,
                    self.FIELD_CREATED_AT: now,
                    self.FIELD_UPDATED_AT: now,
                })
                if self._is_sqlite_backend:
                    entity[self.FIELD_ID] = flow_id
                entities.append(entity)
            
            # Batch put
            if entities:
                self.client.put_multi(entities)
            
            # Map back to Flow models with new IDs
            results = []
            for i, entity in enumerate(entities):
                original_flow = flows[i]
                flow_id_str = self._extract_flow_id(entity)
                results.append(original_flow.copy(update={"id": flow_id_str}))
                
            logger.info(f"Batch added {len(results)} flows for product: {product_id}")
            return results
            
        except Exception as e:
            logger.error(f"Error adding batch flows: {e}")
            raise ValueError(f"Failed to add batch flows: {str(e)}")

    def update_flows(self, product_id: str, updates_list: List[Dict]) -> List[Flow]:
        """
        Update multiple flows in a batch. If a flow does not exist, it will be created (Upsert).
        updates_list: list of dicts, each must contain 'id' and fields to update.
        """
        if not updates_list:
            return []

        try:
            # Filter and validate IDs
            flow_ids_to_check = []
            for u in updates_list:
                fid = u.get('id')
                if fid:
                    flow_ids_to_check.append(fid)
            
            if not flow_ids_to_check:
                return []

            if self._is_sqlite_backend:
                existing_query = self.client.query(kind=self.ENTITY_KIND)
                existing_query.add_filter(self.FIELD_PRODUCT_ID, "=", product_id)
                existing_entities = list(existing_query.fetch())
                entity_map = {
                    str(e.get(self.FIELD_ID) or ""): e
                    for e in existing_entities
                    if e.get(self.FIELD_ID)
                }
            else:
                keys = [self.client.key(self.ENTITY_KIND, fid) for fid in flow_ids_to_check]
                existing_entities = self.client.get_multi(keys)
                entity_map = {
                    str(getattr(e.key, "name", "") or ""): e
                    for e in existing_entities
                    if e is not None
                }
            
            entities_to_put = []
            updated_flows = []
            now = datetime.now(timezone.utc)
            
            field_map = {
                "name": self.FIELD_NAME,
                "description": self.FIELD_DESCRIPTION,
                "startNodeId": self.FIELD_START_NODE_ID,
                "endNodeId": self.FIELD_END_NODE_ID,
                "viaNodeIds": self.FIELD_VIA_NODE_IDS,
                "pathNodeIds": self.FIELD_PATH_NODE_IDS,
                "precondition": self.FIELD_PRECONDITION,
                "scenarios": self.FIELD_SCENARIOS,
                "credentials": self.FIELD_CREDENTIALS,
                "videoUrl": self.FIELD_VIDEO_URL,
                "autoPlan": self.FIELD_AUTO_PLAN,
                "feature_id": self.FIELD_FEATURE_ID
            }

            for update_item in updates_list:
                flow_id = update_item.get('id')
                if not flow_id: 
                    continue
                
                # Check if we have an existing entity or need to create a new one
                if flow_id in entity_map:
                    entity = entity_map[flow_id]
                    if entity.get(self.FIELD_PRODUCT_ID) != product_id:
                        logger.warning(f"Flow {flow_id} product mismatch (existing: {entity.get(self.FIELD_PRODUCT_ID)}, requested: {product_id}), skipping")
                        continue
                    
                    # Update timestamp for existing
                    entity.update({self.FIELD_UPDATED_AT: now})
                else:
                    # Upsert: Create new entity
                    try:
                        if self._is_sqlite_backend:
                            key = self.client.key(self.ENTITY_KIND)
                        else:
                            key = self.client.key(self.ENTITY_KIND, flow_id)
                        entity = self.client.entity(key=key)
                        entity.update({
                            self.FIELD_PRODUCT_ID: product_id,
                            self.FIELD_CREATED_AT: now,
                            self.FIELD_UPDATED_AT: now
                        })
                        if self._is_sqlite_backend:
                            entity[self.FIELD_ID] = flow_id
                    except Exception as e:
                        logger.warning(f"Error creating flow entity key: {e}")
                        continue

                # Apply fields
                for model_field, db_field in field_map.items():
                    if model_field in update_item:
                         val = update_item[model_field]
                         if model_field == "scenarios" and val is not None:
                             val = [s.dict() if hasattr(s, 'dict') else s for s in val]
                         entity[db_field] = val
                
                entities_to_put.append(entity)
            
            if entities_to_put:
                self.client.put_multi(entities_to_put)
                updated_flows = [self._entity_to_flow(e) for e in entities_to_put]
                
            logger.info(f"Batch updated/created {len(updated_flows)} flows for product: {product_id}")
            return updated_flows

        except Exception as e:
            logger.error(f"Error updating/upserting batch flows: {e}")
            raise ValueError(f"Failed to update/upsert batch flows: {str(e)}")

    def delete_flows(self, product_id: str, flow_ids: List[str]) -> None:
        """Delete multiple flows in a batch"""
        if not flow_ids:
            return

        try:
            if self._is_sqlite_backend:
                query = self.client.query(kind=self.ENTITY_KIND)
                query.add_filter(self.FIELD_PRODUCT_ID, "=", product_id)
                query.add_filter(self.FIELD_ID, "IN", flow_ids)
                entities = list(query.fetch())
            else:
                keys = [self.client.key(self.ENTITY_KIND, fid) for fid in flow_ids]
                entities = self.client.get_multi(keys)
            
            keys_to_delete = []
            for entity in entities:
                if entity is None:
                    continue
                if entity.get(self.FIELD_PRODUCT_ID) == product_id:
                    keys_to_delete.append(entity.key)
            
            if keys_to_delete:
                self.client.delete_multi(keys_to_delete)
                logger.info(f"Batch deleted {len(keys_to_delete)} flows for product: {product_id}")
            else:
                 logger.info(f"No valid flows found to delete for product: {product_id} from requested list")

        except Exception as e:
            logger.error(f"Error deleting batch flows: {e}")
            raise ValueError(f"Failed to delete batch flows: {str(e)}")

    def _entity_to_flow(self, entity) -> Flow:
        """Convert Datastore entity to Flow model"""
        scenarios_data = entity.get(self.FIELD_SCENARIOS)
        scenarios = None
        if scenarios_data:
            scenarios = [Scenario(**s) for s in scenarios_data]

        return Flow(
            id=self._extract_flow_id(entity),
            name=entity.get(self.FIELD_NAME),
            startNodeId=entity.get(self.FIELD_START_NODE_ID),
            endNodeId=entity.get(self.FIELD_END_NODE_ID),
            viaNodeIds=entity.get(self.FIELD_VIA_NODE_IDS, []),
            pathNodeIds=entity.get(self.FIELD_PATH_NODE_IDS, []),
            precondition=entity.get(self.FIELD_PRECONDITION),
            scenarios=scenarios,
            credentials=entity.get(self.FIELD_CREDENTIALS),
            videoUrl=entity.get(self.FIELD_VIDEO_URL),
            autoPlan=entity.get(self.FIELD_AUTO_PLAN, True),
            description=entity.get(self.FIELD_DESCRIPTION),
            feature_id=entity.get(self.FIELD_FEATURE_ID,"") or "",
            product_id=entity.get(self.FIELD_PRODUCT_ID,"") or ""
        )

    def _get_entity_by_flow_id(self, flow_id: str):
        """Get Datastore entity by flow_id"""
        try:
            if self._is_sqlite_backend:
                query = self.client.query(kind=self.ENTITY_KIND)
                query.add_filter(self.FIELD_ID, "=", flow_id)
                results = list(query.fetch(limit=1))
                return results[0] if results else None

            key = self.client.key(self.ENTITY_KIND, flow_id)
            return self.client.get(key)
        except Exception as e:
            logger.error(f"Error fetching flow by id {flow_id}: {e}")
            raise ValueError(f"Invalid flow_id format {flow_id}: {e}")

    def _extract_flow_id(self, entity) -> str:
        """Get flow id in a backend-compatible way."""
        if entity is None:
            return ""

        flow_id = entity.get(self.FIELD_ID)
        if flow_id:
            return str(flow_id)

        key_name = getattr(entity.key, "name", None)
        if key_name:
            return str(key_name)

        key_id = getattr(entity.key, "id", None)
        return str(key_id or "")
