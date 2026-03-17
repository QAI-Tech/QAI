import os
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional
from google.cloud import datastore

from app.services.features.feature_models import Feature

logger = logging.getLogger(__name__)


class FeatureDatastore:
    """Datastore operations for Features"""

    ENTITY_KIND = "Feature"
    FIELD_PRODUCT_ID = "product_id"
    FIELD_NAME = "name"
    FIELD_DESCRIPTION = "description"
    FIELD_NODE_IDS = "nodeIds"
    FIELD_CREATED_AT = "created_at"
    FIELD_UPDATED_AT = "updated_at"
    FIELD_SORT_INDEX = "sort_index"
    FIELD_KG_FEATURE_ID = "kg_feature_id"
    FIELD_ORIGINAL_ID = "original_id"  # For storing string IDs (nanoid)

    def __init__(self):
        """Initialize Datastore client"""
        try:
            project_id = self._get_gcp_project_id()
            if not project_id:
                logger.error("GCP project_id not found, please set GCP_PROJECT_ID environment variable")
                raise ValueError("GCP project_id not found, please set GCP_PROJECT_ID environment variable")

            use_grpc = os.getenv("DATASTORE_USE_GRPC", "").strip().lower() in ("1", "true", "yes")
            
            if use_grpc:
                # Use default client (may use gRPC)
                self.client = datastore.Client(project=project_id)
                logger.info(f"FeatureDatastore initialized with gRPC transport for project: {project_id}")
            else:
                # Force HTTP/REST transport (non-gRPC) - compatible with eventlet
                try:
                    # Try _use_grpc parameter (newer API)
                    self.client = datastore.Client(project=project_id, _use_grpc=False)
                    logger.info(f"FeatureDatastore initialized with HTTP/REST transport (non-gRPC) for project: {project_id}")
                except TypeError as e:
                    logger.error(f"Failed to initialize Datastore client with HTTP/REST transport: {e}")
                    raise
        except Exception as e:
            logger.error(f"Failed to initialize Datastore client: {e}")
            raise

    def _get_gcp_project_id(self) -> str:
        """Get GCP project ID based on environment (staging vs production).

        """

        env = os.getenv('ENVIRONMENT', 'development')
        if env == 'production':

            project_id = 'qai-tech'
            logger.debug(f"Environment is production, using project_id: {project_id}")
        else:

            project_id = 'qai-tech-staging'
            logger.debug(f"Environment is {env}, using staging project_id: {project_id}")
        
        return project_id

    def get_features(self, product_id: str) -> List[Feature]:
        """Get all features for a product_id"""
        try:
            query = self.client.query(kind=self.ENTITY_KIND)
            query.add_filter(self.FIELD_PRODUCT_ID, "=", product_id)

            features: list[Feature] = []
            for entity in query.fetch():
                # TODO: Refactor: use _create_feature_from_datastore_entity instead
                features.append(
                    Feature(
                        product_id=entity.get(FeatureDatastore.FIELD_PRODUCT_ID),
                        name=entity.get(FeatureDatastore.FIELD_NAME),
                        nodeIds=entity.get(FeatureDatastore.FIELD_NODE_IDS) or [],
                        description=entity.get(FeatureDatastore.FIELD_DESCRIPTION) or "",
                        created_at=entity.get(FeatureDatastore.FIELD_CREATED_AT),
                        updated_at=entity.get(FeatureDatastore.FIELD_UPDATED_AT),
                        id=str(entity.key.id),
                        sort_index=entity.get(FeatureDatastore.FIELD_SORT_INDEX),
                        kg_feature_id=entity.get(FeatureDatastore.FIELD_KG_FEATURE_ID),
                    )
                )

            all_have_sort_index = all(
                feature.sort_index is not None for feature in features
            )

            if all_have_sort_index:
                features.sort(key=lambda x: x.sort_index or 0.0)
            else:
                features.sort(key=lambda x: x.created_at)

            logger.info(
                f"Fetched {len(features)} features for product_id: {product_id}"
            )
            return features
        except Exception as e:
            logger.error(f"Error fetching features for product_id {product_id}: {e}")
            raise

    def add_feature(
        self,
        product_id: str,
        feature: Feature,
        description: str = "",
        kg_feature_id: Optional[str] = None
    ) -> Feature:
        """Add a new feature to Datastore"""
        try:

            query = self.client.query(kind=self.ENTITY_KIND)
            query.add_filter(self.FIELD_PRODUCT_ID, "=", product_id)
            query.order = ["-" + self.FIELD_SORT_INDEX]
            existing = list(query.fetch(limit=1))
            
            max_sort_index = (
                existing[0].get(self.FIELD_SORT_INDEX) or 0 if existing else 0
            )


            key = self.client.key(self.ENTITY_KIND)

            entity = datastore.Entity(key=key)
            now = datetime.now(timezone.utc)
            
            entity.update({
                self.FIELD_PRODUCT_ID: product_id,
                self.FIELD_NAME: feature.name,
                self.FIELD_DESCRIPTION: description,
                self.FIELD_NODE_IDS: feature.nodeIds,
                self.FIELD_CREATED_AT: now,
                self.FIELD_UPDATED_AT: now,
                self.FIELD_SORT_INDEX: max_sort_index + 1,
                self.FIELD_KG_FEATURE_ID: kg_feature_id,
            })


            self.client.put(entity)
            feature_id_str = str(entity.key.id)

            logger.info(
                f"Added feature {feature.name} (id: {feature_id_str}) "
                f"for product: {product_id} with sort_index: {max_sort_index + 1}"
            )

            return Feature(
                id=feature_id_str,
                product_id=product_id,
                name=feature.name,
                description=description,
                nodeIds=feature.nodeIds,
                sort_index=max_sort_index + 1,
                kg_feature_id=kg_feature_id,
                created_at=now,
                updated_at=now
            )
        except Exception as e:
            logger.error(f"Error adding feature: {e}")
            raise ValueError(f"Failed to add feature: {str(e)}")

    def update_feature(
        self,
        product_id: str,
        feature_id: str,
        name: Optional[str] = None,
        nodeIds: Optional[List[str]] = None,
        description: Optional[str] = None
    ) -> Feature:
        """Update an existing feature"""
        try:
            entity = self._get_entity_by_feature_id(feature_id)
            
            if not entity:
                logger.error(f"Feature {feature_id} not found")
                raise ValueError(f"Feature {feature_id} not found for product {product_id}")

            if entity.get(self.FIELD_PRODUCT_ID) != product_id:
                raise ValueError(f"Feature {feature_id} does not belong to product {product_id}")

            updated_entity = {
                self.FIELD_UPDATED_AT: datetime.now(timezone.utc),
                self.FIELD_NAME: name,
                self.FIELD_NODE_IDS: nodeIds,
                self.FIELD_DESCRIPTION: description,
            }
            filtered_update_fields = {
                k: v for k, v in updated_entity.items() if v is not None
            }
            
            entity.update(filtered_update_fields)

            self.client.put(entity)

            logger.info(f"Updated feature {feature_id} for product {product_id}")

            return self._entity_to_feature(entity)

        except Exception as e:
            logger.error(f"Error updating feature {feature_id}: {e}")
            raise ValueError(f"Failed to update feature {feature_id}: {str(e)}")

    def delete_feature(self, product_id: str, feature_id: str) -> None:
        """Delete a feature"""
        try:
            entity = self._get_entity_by_feature_id(feature_id)
            
            if not entity:
                logger.error(f"Feature {feature_id} not found")
                raise ValueError(f"Feature {feature_id} not found for product {product_id}")

            if entity.get(self.FIELD_PRODUCT_ID) != product_id:
                raise ValueError(f"Feature {feature_id} does not belong to product {product_id}")

            self.client.delete(entity.key)
            logger.info(f"Deleted feature {feature_id} for product {product_id}")

        except Exception as e:
            logger.error(f"Error deleting feature {feature_id}: {e}")
            raise ValueError(f"Failed to delete feature {feature_id}: {str(e)}")

    def reorder_features(self, product_id: str, feature_ids: List[str]) -> List[Feature]:
        """Reorder features by updating their sort_index"""
        try:

            entities = []
            for fid in feature_ids:
                entity = self._get_entity_by_feature_id(fid)
                if entity:
                    entities.append(entity)


            updated_entities = []
            for idx, entity in enumerate(entities):
                entity[self.FIELD_SORT_INDEX] = float(idx + 1)
                entity[self.FIELD_UPDATED_AT] = datetime.now(timezone.utc)
                updated_entities.append(entity)

            if updated_entities:
                self.client.put_multi(updated_entities)
                logger.info(f"Reordered {len(updated_entities)} features for product {product_id}")


            return [self._entity_to_feature(e) for e in updated_entities]
        except Exception as e:
            logger.error(f"Error reordering features: {e}")
            raise ValueError(f"Failed to reorder features: {str(e)}")

    def _entity_to_feature(self, entity) -> Feature:
        """Convert Datastore entity to Feature model"""

        feature_id = str(entity.key.id)
        return Feature(
            id=feature_id,
            product_id=entity.get(self.FIELD_PRODUCT_ID),
            name=entity.get(self.FIELD_NAME),
            description=entity.get(self.FIELD_DESCRIPTION, ""),
            nodeIds=entity.get(self.FIELD_NODE_IDS, []),
            created_at=entity.get(self.FIELD_CREATED_AT),
            updated_at=entity.get(self.FIELD_UPDATED_AT),
            sort_index=entity.get(self.FIELD_SORT_INDEX),
            kg_feature_id=entity.get(self.FIELD_KG_FEATURE_ID),
        )

    def _get_entity_by_feature_id(self, feature_id: str):
        """Get Datastore entity by feature_id"""
        try:
            key = self.client.key(self.ENTITY_KIND, int(feature_id))
            entity = self.client.get(key)
            if not entity:
                raise ValueError(f"Feature {feature_id} not found")
            return entity
        except Exception as e:
            logger.error(f"Error fetching feature by id {feature_id}: {e}")
            raise ValueError(f"Invalid feature_id format {feature_id}: {e}")
