from datetime import datetime, timezone
from typing import List
from common.google_cloud_wrappers import GCPDatastoreWrapper
from features.feature_models import (
    Feature,
    AddFeatureRequestParams,
    FeatureNotFoundError,
    UpdateFeatureRequestParams,
)
from models.reorder_features_and_test_cases_model import ReorderableEntity
from utils.util import orionis_log


class FeatureDatastore:

    ENTITY_KIND_FEATURE = "Feature"
    FIELD_PRODUCT_ID = "product_id"
    FIELD_NAME = "name"
    FIELD_DESCRIPTION = "description"
    FIELD_CREATED_AT = "created_at"
    FIELD_UPDATED_AT = "updated_at"
    FIELD_SORT_INDEX = "sort_index"
    FIELD_KG_FEATURE_ID = "kg_feature_id"
    FIELD_NODE_IDS = "nodeIds"

    def __init__(self):
        self.db = GCPDatastoreWrapper().get_datastore_client()

    def get_features(self, product_id: str) -> list[Feature]:
        try:
            query = self.db.query(kind=FeatureDatastore.ENTITY_KIND_FEATURE)
            query.add_filter(FeatureDatastore.FIELD_PRODUCT_ID, "=", product_id)

            features: list[Feature] = []
            for entity in query.fetch():
                # TODO: Refactor: use _create_feature_from_datastore_entity instead
                features.append(
                    Feature(
                        product_id=entity.get(FeatureDatastore.FIELD_PRODUCT_ID),
                        name=entity.get(FeatureDatastore.FIELD_NAME),
                        description=entity.get(FeatureDatastore.FIELD_DESCRIPTION),
                        created_at=entity.get(FeatureDatastore.FIELD_CREATED_AT),
                        updated_at=entity.get(FeatureDatastore.FIELD_UPDATED_AT),
                        id=str(entity.key.id),
                        sort_index=entity.get(FeatureDatastore.FIELD_SORT_INDEX),
                        kg_feature_id=entity.get(FeatureDatastore.FIELD_KG_FEATURE_ID),
                        nodeIds=entity.get(FeatureDatastore.FIELD_NODE_IDS),
                    )
                )

            all_have_sort_index = all(
                feature.sort_index is not None for feature in features
            )

            if all_have_sort_index:
                features.sort(key=lambda x: x.sort_index or 0.0)
            else:
                features.sort(key=lambda x: x.created_at)

            orionis_log(
                f"Fetched {len(features)} features for product_id: {product_id}"
            )
            return features
        except Exception as e:
            orionis_log(f"Error fetching features for product_id {product_id}: {e}", e)
            raise ValueError(
                f"Failed to fetch features for product_id {product_id}: {str(e)}"
            )

    def add_feature(self, add_feature_params: AddFeatureRequestParams) -> Feature:
        query = self.db.query(kind=FeatureDatastore.ENTITY_KIND_FEATURE)
        query.add_filter(
            FeatureDatastore.FIELD_PRODUCT_ID, "=", add_feature_params.product_id
        )
        # Sort by sort_index in descending order
        query.order = ["-" + FeatureDatastore.FIELD_SORT_INDEX]
        features = list(query.fetch(limit=1))

        max_sort_index = (
            features[0].get(FeatureDatastore.FIELD_SORT_INDEX) or 0 if features else 0
        )

        orionis_log(f"Max sort index: {max_sort_index}")

        key = self.db.key(FeatureDatastore.ENTITY_KIND_FEATURE)
        entity = self.db.entity(key=key)

        created_at = datetime.now(timezone.utc)

        entity.update(
            {
                FeatureDatastore.FIELD_PRODUCT_ID: add_feature_params.product_id,
                FeatureDatastore.FIELD_NAME: add_feature_params.name,
                FeatureDatastore.FIELD_DESCRIPTION: add_feature_params.description,
                FeatureDatastore.FIELD_CREATED_AT: created_at,
                FeatureDatastore.FIELD_UPDATED_AT: created_at,
                FeatureDatastore.FIELD_SORT_INDEX: max_sort_index + 1,
                FeatureDatastore.FIELD_KG_FEATURE_ID: add_feature_params.kg_feature_id,
            }
        )

        self.db.put(entity)

        if not entity or not entity.key:
            raise ValueError(
                "Failed to add new feature to the datastore - no entity/key generated"
            )

        feature_id_str = str(entity.key.id)

        orionis_log(
            f"Added new feature "
            f"{add_feature_params.name} "
            f"({feature_id_str}) "
            f"for product: {add_feature_params.product_id} "
            f"with sort_index: {max_sort_index + 1}"
        )

        # TODO: Refactor: use _create_feature_from_datastore_entity instead
        return Feature(
            id=feature_id_str,
            product_id=add_feature_params.product_id,
            name=add_feature_params.name,
            description=add_feature_params.description,
            created_at=created_at,
            updated_at=created_at,
            sort_index=max_sort_index + 1,
        )

    def delete_feature(self, feature_id: str, product_id: str) -> None:
        try:
            feature_id_int = int(feature_id)
            key = self.db.key(FeatureDatastore.ENTITY_KIND_FEATURE, feature_id_int)
            entity = self.db.get(key)

            if not entity:
                orionis_log(f"Feature {feature_id} not found for deletion.")
                raise FeatureNotFoundError(
                    f"Feature {feature_id} not found for deletion."
                )

            if entity.get(FeatureDatastore.FIELD_PRODUCT_ID) != product_id:
                raise ValueError(
                    f"Feature {feature_id} does not belong to product {product_id}"
                )
            self.db.delete(key)
            orionis_log(f"Deleted feature with id: {feature_id}")
        except ValueError as ve:
            orionis_log(f"Invalid request for deleting feature {feature_id}: {ve}", ve)
            raise ValueError(f"Invalid request for deleting feature {feature_id}: {ve}")
        except FeatureNotFoundError:
            raise
        except Exception as e:
            orionis_log(f"Error deleting feature {feature_id}: {e}", e)
            raise ValueError(f"Failed to delete feature {feature_id}: {str(e)}")

    def get_entities_by_ids(self, ids: List[str]) -> List[ReorderableEntity]:
        try:
            orionis_log(
                f"[get_entities_by_ids] Attempting to fetch entities with IDs: {ids}"
            )

            keys = [
                self.db.key(FeatureDatastore.ENTITY_KIND_FEATURE, int(entity_id))
                for entity_id in ids
            ]
            orionis_log(f"[get_entities_by_ids] Generated datastore keys: {keys}")

            entities = self.db.get_multi(keys)
            orionis_log(f"[get_entities_by_ids] Fetched raw entities: {entities}")

            reorderable_entities = [
                ReorderableEntity(
                    id=str(entity.key.id_or_name),
                    sort_index=entity.get("sort_index"),
                    created_at=entity.get("created_at", datetime.min),
                )
                for entity in entities
                if entity is not None
            ]
            orionis_log(
                f"[get_entities_by_ids] Transformed entities: {reorderable_entities}"
            )
            return reorderable_entities

        except Exception as e:
            orionis_log(
                f"[get_entities_by_ids] Error while fetching entities for IDs {ids}: {e}"
            )
            raise ValueError(f"Failed to fetch entities for IDs {ids}: {str(e)}")

    def update_sorting_indexes(
        self, entities: List[ReorderableEntity]
    ) -> List[ReorderableEntity]:
        updated_entities = []

        for entity in entities:
            key = self.db.key(FeatureDatastore.ENTITY_KIND_FEATURE, int(entity.id))
            existing_entity = self.db.get(key)

            if not existing_entity:
                orionis_log(
                    f"[update_sorting_indexes] Entity not found for ID: {entity.id}"
                )
                continue

            existing_entity["sort_index"] = entity.sort_index
            updated_entities.append(existing_entity)

        if not updated_entities:
            return []

        self.db.put_multi(updated_entities)
        orionis_log(
            f"[update_sorting_indexes] Updated {len(updated_entities)} entities with new sort_index only"
        )

        return [
            ReorderableEntity(
                id=str(entity.key.id_or_name),
                sort_index=entity.get("sort_index"),
                created_at=entity.get("created_at", datetime.min),
            )
            for entity in updated_entities
        ]

    def get_feature_by_id(self, feature_id: str) -> Feature:
        try:
            key = self.db.key(self.ENTITY_KIND_FEATURE, int(feature_id))
            entity = self.db.get(key)
            if not entity:
                raise ValueError(f"Feature with id {feature_id} not found.")

            # TODO: Refactor: use _create_feature_from_datastore_entity instead
            return Feature(
                id=str(entity.key.id),
                product_id=entity.get(self.FIELD_PRODUCT_ID),
                name=entity.get(self.FIELD_NAME),
                description=entity.get(self.FIELD_DESCRIPTION, ""),
                created_at=entity.get(self.FIELD_CREATED_AT),
                updated_at=entity.get(self.FIELD_UPDATED_AT),
                sort_index=entity.get(self.FIELD_SORT_INDEX),
                kg_feature_id=entity.get(self.FIELD_KG_FEATURE_ID),
                nodeIds=entity.get(self.FIELD_NODE_IDS),
            )
        except Exception as e:
            orionis_log(f"Error fetching feature by id {feature_id}: {e}", e)
            raise ValueError(f"Failed to fetch feature by id {feature_id}: {str(e)}")

    def get_feature_by_kg_feature_id(
        self, kg_feature_id: str, product_id: str
    ) -> Feature:
        query = self.db.query(kind=FeatureDatastore.ENTITY_KIND_FEATURE)
        query.add_filter(FeatureDatastore.FIELD_KG_FEATURE_ID, "=", kg_feature_id)
        query.add_filter(FeatureDatastore.FIELD_PRODUCT_ID, "=", product_id)
        entities = list(query.fetch(limit=1))
        orionis_log(
            f"Fetched {len(entities)} entities for kg_feature_id: {kg_feature_id}, product_id: {product_id}"
        )
        if not entities:
            raise ValueError(
                f"Feature with kg_feature_id {kg_feature_id} and product_id {product_id} not found."
            )
        entity = entities[0]
        return self._create_feature_from_datastore_entity(entity)

    def update_feature(
        self, update_feature_request_params: UpdateFeatureRequestParams
    ) -> Feature:
        try:
            key = self.db.key(
                self.ENTITY_KIND_FEATURE, int(update_feature_request_params.id)
            )
            entity = self.db.get(key)

            if not entity:
                raise ValueError(
                    f"Feature with id {update_feature_request_params.id} not found"
                )

            update_fields = {
                self.FIELD_UPDATED_AT: datetime.now(timezone.utc),
                self.FIELD_NAME: update_feature_request_params.name,
                self.FIELD_DESCRIPTION: update_feature_request_params.description,
            }
            filtered_update_fields = {
                k: v for k, v in update_fields.items() if v is not None
            }
            entity.update(filtered_update_fields)

            self.db.put(entity)
            orionis_log(
                f"Successfully update feature with id: {update_feature_request_params.id}"
            )

            # TODO: Refactor: use _create_feature_from_datastore_entity instead
            return Feature(
                id=str(entity.key.id),
                product_id=entity.get(self.FIELD_PRODUCT_ID),
                name=entity.get(self.FIELD_NAME),
                description=entity.get(self.FIELD_DESCRIPTION, ""),
                created_at=entity.get(self.FIELD_CREATED_AT),
                updated_at=entity.get(self.FIELD_UPDATED_AT),
                sort_index=entity.get(self.FIELD_SORT_INDEX),
                kg_feature_id=entity.get(self.FIELD_KG_FEATURE_ID),
                nodeIds=entity.get(self.FIELD_NODE_IDS),
            )

        except Exception as e:
            orionis_log(
                f"Error updating feature (id: {update_feature_request_params.id}) in datastore: {e}",
                e,
            )
            raise e

    def _create_feature_from_datastore_entity(self, entity) -> Feature:
        return Feature(
            id=str(entity.key.id),
            product_id=entity.get(self.FIELD_PRODUCT_ID),
            name=entity.get(self.FIELD_NAME),
            description=entity.get(self.FIELD_DESCRIPTION, ""),
            created_at=entity.get(self.FIELD_CREATED_AT),
            updated_at=entity.get(self.FIELD_UPDATED_AT),
            sort_index=entity.get(self.FIELD_SORT_INDEX),
            kg_feature_id=entity.get(self.FIELD_KG_FEATURE_ID),
        )
