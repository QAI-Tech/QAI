import logging
from typing import List, Optional
from app.services.features.feature_datastore import FeatureDatastore
from app.services.features.feature_models import Feature

logger = logging.getLogger(__name__)


class FeatureService:
    """Service for managing features via Datastore"""

    def __init__(self, datastore: FeatureDatastore):
        self.datastore = datastore

    def get_features(self, product_id: str) -> List[Feature]:
        """Get all features for a product_id"""
        try:
            return self.datastore.get_features(product_id)
        except Exception as e:
            logger.error(f"Error getting features for product_id {product_id}: {e}")
            raise

    def create_feature(
        self,
        product_id: str,
        feature: Feature,
        description: str = "",
        kg_feature_id: Optional[str] = None
    ) -> Feature:
        """Create a new feature."""
        try:
            if not feature.name:
                raise ValueError("Feature name is required")

            return self.datastore.add_feature(
                product_id=product_id,
                feature=feature,
                description=description,
                kg_feature_id=kg_feature_id
            )
        except Exception as e:
            logger.error(f"Error creating feature: {e}")
            raise

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
            return self.datastore.update_feature(
                product_id=product_id,
                feature_id=feature_id,
                name=name,
                nodeIds=nodeIds,
                description=description
            )

        except Exception as e:
            logger.error(f"Error updating feature {feature_id}: {e}")
            raise

    def delete_feature(self, product_id: str, feature_id: str) -> None:
        """Delete a feature"""
        try:
            self.datastore.delete_feature(product_id, feature_id)

        except Exception as e:
            logger.error(f"Error deleting feature {feature_id}: {e}")
            raise

    def reorder_features(self, product_id: str, feature_ids: List[str]) -> List[Feature]:
        """Reorder features by updating their sort_index"""
        try:
            if not feature_ids:
                raise ValueError("feature_ids list cannot be empty")
            
            return self.datastore.reorder_features(product_id, feature_ids)
        except Exception as e:
            logger.error(f"Error reordering features: {e}")
            raise
