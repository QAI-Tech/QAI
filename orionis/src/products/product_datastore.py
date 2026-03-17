from datetime import datetime, timezone
from typing import List, Dict, Union
from common.google_cloud_wrappers import GCPDatastoreWrapper
from constants import Constants
from products.product_models import (
    AddFunctionalityRequestParamsDeprecated,
    AddProductRequestParams,
    ProductEntity,
    ProductFeatureEntityDeprecated,
    AddScreenRequestParams,
    FunctionalityEntity,
    ScreenEntity,
    UpdateProductRequestParams,
)
from utils.util import orionis_log
from config import config


class ProductDatastore:

    class FieldProduct:
        KIND = "Product"
        NAME = "product_name"
        ORGANISATION_ID = "organisation_id"
        WEB_URL = "web_url"
        GOOGLE_PLAY_STORE_URL = "google_play_store_url"
        APPLE_APP_STORE_URL = "apple_app_store_url"
        RELATED_PRODUCTS = "related_products"
        DEFAULT_CREDENTIALS_ID = "default_credentials_id"
        EXPECTED_APP_BEHAVIOUR = "expected_app_behaviour"
        WHEN_TO_USE_WHICH_UI_ELEMENT = "when_to_use_which_ui_element"
        STATUS = "status"
        VALUE_DELETED = "deleted"

    ENTITY_KIND_PRODUCT_FEATURE = "Feature"
    FIELD_FEATURE_NAME = "name"
    FIELD_FEATURE_DESCRIPTION = "description"
    FIELD_KG_FEATURE_ID = "kg_feature_id"

    ENTITY_KIND_SCREEN = "Screen"
    FIELD_SCREEN_ID = "screen_id"
    FIELD_SCREEN_NAME = "screen_name"

    ENTITY_KIND_FUNCTIONALITY = "Functionality"
    FIELD_FUNCTIONALITY_ID = "functionality_id"
    FIELD_FUNCTIONALITY_NAME = "name"
    FIELD_FUNCTIONALITY_INTERACTIONS = "interactions"
    FIELD_FUNCTIONALITY_SCREEN_IDS = "screen_ids"

    FIELD_PRODUCT_ID = "product_id"
    FIELD_FEATURE_ID = "feature_id"
    FIELD_DESIGN_FRAME_URLS = "design_frame_urls"
    FIELD_CREATED_AT = "created_at"
    FIELD_UPDATED_AT = "updated_at"

    def __init__(self):
        self.db = GCPDatastoreWrapper().get_datastore_client()

    def get_product_from_id(self, product_id: str) -> ProductEntity:
        try:
            orionis_log(f"Fetching product with ID: {product_id}")

            key = self.db.key(self.FieldProduct.KIND, int(product_id))
            entity = self.db.get(key)

            if not entity:
                orionis_log(f"No product found with ID: {product_id}")
                raise ValueError(f"Product with ID {product_id} not found.")

            orionis_log(f"Successfully fetched product with ID: {product_id}")

            product = ProductEntity(
                product_id=str(entity.key.id),
                product_name=entity.get(self.FieldProduct.NAME, ""),
                organisation_id=entity.get(self.FieldProduct.ORGANISATION_ID, ""),
                web_url=entity.get(self.FieldProduct.WEB_URL, ""),
                google_play_store_url=entity.get(
                    self.FieldProduct.GOOGLE_PLAY_STORE_URL, ""
                ),
                apple_app_store_url=entity.get(
                    self.FieldProduct.APPLE_APP_STORE_URL, ""
                ),
                related_products=entity.get(self.FieldProduct.RELATED_PRODUCTS, []),
                created_at=entity.get(self.FIELD_CREATED_AT),
                default_credentials_id=entity.get(
                    self.FieldProduct.DEFAULT_CREDENTIALS_ID, ""
                ),
                expected_app_behaviour=entity.get(
                    self.FieldProduct.EXPECTED_APP_BEHAVIOUR, ""
                ),
                when_to_use_which_ui_element=entity.get(
                    self.FieldProduct.WHEN_TO_USE_WHICH_UI_ELEMENT, ""
                ),
                status=entity.get(self.FieldProduct.STATUS),
            )

            if product.status == self.FieldProduct.VALUE_DELETED:
                orionis_log(f"Product with ID {product_id} is deleted.")
                raise ValueError(f"Product with ID {product_id} not found.")

            return product
        except Exception as e:
            orionis_log(f"Error fetching product with ID {product_id}", e)
            raise RuntimeError(
                f"Failed to fetch product with ID {product_id}: {str(e)}"
            ) from e

    def add_product(
        self,
        organisation_id: str,
        addProductRequestParams: AddProductRequestParams,
        default_credentials_id: str = "",
    ) -> ProductEntity:
        key = self.db.key(self.FieldProduct.KIND)
        entity = self.db.entity(key=key)

        created_at = datetime.now(timezone.utc)

        entity.update(
            {
                self.FieldProduct.NAME: addProductRequestParams.product_name,
                self.FieldProduct.ORGANISATION_ID: organisation_id,
                self.FieldProduct.WEB_URL: addProductRequestParams.web_url or "",
                self.FieldProduct.GOOGLE_PLAY_STORE_URL: addProductRequestParams.google_play_store_url
                or "",
                self.FieldProduct.APPLE_APP_STORE_URL: addProductRequestParams.apple_app_store_url
                or "",
                self.FieldProduct.RELATED_PRODUCTS: [],
                self.FIELD_CREATED_AT: created_at,
                self.FieldProduct.DEFAULT_CREDENTIALS_ID: default_credentials_id,
            }
        )

        self.db.put(entity)
        if not entity or not entity.key:
            raise ValueError(
                "Failed to add new product to the datastore - no entity/key generated"
            )

        product_id = entity.key.id

        return ProductEntity(
            product_id=str(product_id),
            product_name=addProductRequestParams.product_name,
            organisation_id=organisation_id,
            web_url=addProductRequestParams.web_url or "",
            google_play_store_url=addProductRequestParams.google_play_store_url or "",
            apple_app_store_url=addProductRequestParams.apple_app_store_url or "",
            related_products=[],
            created_at=created_at,
            default_credentials_id=default_credentials_id,
        )

    def get_all_products(self, organisation_id: str) -> List[ProductEntity]:
        product_query = self.db.query(kind=self.FieldProduct.KIND)

        if organisation_id != config.team_qai_org_id:
            product_query.add_filter(
                self.FieldProduct.ORGANISATION_ID, "=", organisation_id
            )
        db_products = product_query.fetch()

        products = []
        for product in db_products:
            if product.get(self.FieldProduct.STATUS) == self.FieldProduct.VALUE_DELETED:
                continue

            product_entity = ProductEntity(
                product_id=str(product.key.id),
                product_name=product.get(self.FieldProduct.NAME),
                organisation_id=product.get(self.FieldProduct.ORGANISATION_ID),
                web_url=product.get(self.FieldProduct.WEB_URL),
                google_play_store_url=product.get(
                    self.FieldProduct.GOOGLE_PLAY_STORE_URL
                ),
                apple_app_store_url=product.get(self.FieldProduct.APPLE_APP_STORE_URL),
                related_products=product.get(self.FieldProduct.RELATED_PRODUCTS) or [],
                created_at=product.get(self.FIELD_CREATED_AT),
                default_credentials_id=product.get(
                    self.FieldProduct.DEFAULT_CREDENTIALS_ID
                )
                or "",
                status=product.get(self.FieldProduct.STATUS),
            )
            products.append(product_entity)

        return products

    def get_product_feature_deprecated(
        self, feature_id: str
    ) -> ProductFeatureEntityDeprecated:
        key = self.db.key(self.ENTITY_KIND_PRODUCT_FEATURE, int(feature_id))
        entity = self.db.get(key)

        if not entity:
            raise ValueError(f"Feature with id {feature_id} not found")

        functionalities: List[FunctionalityEntity] = self.get_functionalities(
            feature_id
        )

        return ProductFeatureEntityDeprecated(
            feature_id=feature_id,
            product_id=entity[self.FIELD_PRODUCT_ID],
            feature_name=entity[self.FIELD_FEATURE_NAME],
            description=entity[self.FIELD_FEATURE_DESCRIPTION],
            kg_feature_id=entity.get(self.FIELD_KG_FEATURE_ID, None),
            created_at=entity[self.FIELD_CREATED_AT],
            updated_at=entity[self.FIELD_UPDATED_AT],
            functionalities=functionalities,
        )

    def add_functionality(
        self,
        functionality_params: AddFunctionalityRequestParamsDeprecated,
    ) -> FunctionalityEntity:

        product_id = functionality_params.product_id
        feature_id = functionality_params.feature_id
        created_at = datetime.now(timezone.utc)

        key = self.db.key(ProductDatastore.ENTITY_KIND_FUNCTIONALITY)
        entity = self.db.entity(key=key)
        entity.update(
            {
                ProductDatastore.FIELD_PRODUCT_ID: product_id,
                ProductDatastore.FIELD_FEATURE_ID: feature_id,
                ProductDatastore.FIELD_FUNCTIONALITY_NAME: functionality_params.functionality_name,
                ProductDatastore.FIELD_FUNCTIONALITY_INTERACTIONS: functionality_params.interactions,
                ProductDatastore.FIELD_DESIGN_FRAME_URLS: functionality_params.design_frame_urls,
                ProductDatastore.FIELD_FUNCTIONALITY_SCREEN_IDS: functionality_params.screen_ids,
                ProductDatastore.FIELD_CREATED_AT: created_at,
                ProductDatastore.FIELD_UPDATED_AT: created_at,
            }
        )

        self.db.put(entity)

        if not entity or not entity.key:
            raise ValueError(
                "Failed to add new product functionality to the datastore - no entity/key generated"
            )

        functionality_id = entity.key.id

        orionis_log(
            f"Added new product functionality "
            f"{functionality_params.functionality_name} "
            f"({functionality_id}) "
            f"for feature: {functionality_params.feature_id} "
            f"for product: {functionality_params.product_id}"
        )

        try:
            key = self.db.key(self.ENTITY_KIND_PRODUCT_FEATURE, int(feature_id))
            entity = self.db.get(key)

            if not entity:
                raise ValueError(f"Feature with id {feature_id} not found")

            entity.update(
                {
                    ProductDatastore.FIELD_UPDATED_AT: created_at,
                }
            )

            self.db.put(entity)

        except Exception as e:
            orionis_log(f"Error updating feature with id {feature_id}: {e}", e)

        screens = self.get_screens(product_id, functionality_params.screen_ids)

        return FunctionalityEntity(
            functionality_id=str(functionality_id),
            product_id=product_id,
            feature_id=feature_id,
            functionality_name=functionality_params.functionality_name,
            interactions=functionality_params.interactions,
            design_frame_urls=functionality_params.design_frame_urls,
            created_at=created_at,
            updated_at=created_at,
            screens=screens,
        )

    def get_functionalities(self, feature_id: str) -> List[FunctionalityEntity]:
        query = self.db.query(kind=self.ENTITY_KIND_FUNCTIONALITY)
        query.add_filter(self.FIELD_FEATURE_ID, "=", feature_id)
        query.order = [Constants.FIELD_CREATED_AT]
        db_functionalities = query.fetch()

        functionalities: List[FunctionalityEntity] = []
        for functionality in db_functionalities:
            product_id = functionality.get(self.FIELD_PRODUCT_ID)
            functionality_entity = FunctionalityEntity(
                functionality_id=str(functionality.key.id),
                product_id=product_id,
                feature_id=feature_id,
                functionality_name=functionality.get(self.FIELD_FUNCTIONALITY_NAME),
                interactions=functionality.get(self.FIELD_FUNCTIONALITY_INTERACTIONS),
                screens=self.get_screens(
                    product_id,
                    functionality.get(self.FIELD_FUNCTIONALITY_SCREEN_IDS),
                ),
                design_frame_urls=functionality.get(self.FIELD_DESIGN_FRAME_URLS),
                created_at=functionality.get(self.FIELD_CREATED_AT),
                updated_at=functionality.get(self.FIELD_UPDATED_AT),
            )
            functionalities.append(functionality_entity)

        orionis_log(
            f"Fetched {len(functionalities)} product functionalities for feature {feature_id}"
        )

        return functionalities

    def add_screen(
        self,
        screen_params: AddScreenRequestParams,
    ) -> ScreenEntity:

        product_id = screen_params.product_id
        created_at = datetime.now(timezone.utc)

        key = self.db.key(ProductDatastore.ENTITY_KIND_SCREEN)
        entity = self.db.entity(key=key)
        entity.update(
            {
                ProductDatastore.FIELD_PRODUCT_ID: product_id,
                ProductDatastore.FIELD_SCREEN_NAME: screen_params.screen_name,
                ProductDatastore.FIELD_DESIGN_FRAME_URLS: screen_params.design_frame_urls,
                ProductDatastore.FIELD_CREATED_AT: created_at,
                ProductDatastore.FIELD_UPDATED_AT: created_at,
            }
        )

        self.db.put(entity)

        if not entity or not entity.key:
            raise ValueError(
                "Failed to add new product feature screen to the datastore - no entity/key generated"
            )

        screen_id = entity.key.id

        orionis_log(
            f"Added new feature screen "
            f"{screen_params.screen_name} "
            f"({screen_id}) "
            f"for product: {screen_params.product_id}"
        )

        return ScreenEntity(
            screen_id=str(screen_id),
            product_id=product_id,
            screen_name=screen_params.screen_name,
            design_frame_urls=screen_params.design_frame_urls,
            created_at=created_at,
            updated_at=created_at,
        )

    def get_screens(
        self, product_id: str, screen_ids: List[str] = []
    ) -> List[ScreenEntity]:
        query = self.db.query(kind=self.ENTITY_KIND_SCREEN)
        query.add_filter(self.FIELD_PRODUCT_ID, "=", product_id)

        screen_entities: List[ScreenEntity] = []

        if screen_ids:
            # Query by keys directly
            for screen_id in screen_ids:
                key = self.db.key(self.ENTITY_KIND_SCREEN, int(screen_id))
                screen = self.db.get(key)
                if (
                    screen
                    and screen.key
                    and screen.get(self.FIELD_PRODUCT_ID) == product_id
                ):
                    screen_entity = ScreenEntity(
                        screen_id=str(screen.key.id),
                        product_id=screen[self.FIELD_PRODUCT_ID],
                        screen_name=screen[self.FIELD_SCREEN_NAME],
                        design_frame_urls=screen[self.FIELD_DESIGN_FRAME_URLS],
                        created_at=screen[self.FIELD_CREATED_AT],
                        updated_at=screen[self.FIELD_UPDATED_AT],
                    )
                    screen_entities.append(screen_entity)

        # If no screen_ids provided, fetch all screens for the product
        else:
            db_screens = query.fetch()
            for screen in db_screens:
                if screen.key:
                    screen_entity = ScreenEntity(
                        screen_id=str(screen.key.id),
                        product_id=screen[self.FIELD_PRODUCT_ID],
                        screen_name=screen[self.FIELD_SCREEN_NAME],
                        design_frame_urls=screen[self.FIELD_DESIGN_FRAME_URLS],
                        created_at=screen[self.FIELD_CREATED_AT],
                        updated_at=screen[self.FIELD_UPDATED_AT],
                    )
                    screen_entities.append(screen_entity)

        orionis_log(
            f"Fetched {len(screen_entities)} feature screens for product {product_id}   "
            f"and screen ids {screen_ids}"
        )

        return screen_entities

    def update_product(
        self, update_product_request_params: UpdateProductRequestParams
    ) -> str:
        try:
            key = self.db.key(
                self.FieldProduct.KIND, int(update_product_request_params.product_id)
            )
            entity = self.db.get(key)

            if not entity:
                raise ValueError(
                    f"Product with id {update_product_request_params.product_id} not found"
                )

            update_fields: Dict[str, Union[str, List[str], datetime, bool, None]] = {
                self.FieldProduct.NAME: update_product_request_params.product_name,
                self.FieldProduct.WEB_URL: update_product_request_params.web_url,
                self.FieldProduct.GOOGLE_PLAY_STORE_URL: update_product_request_params.google_play_store_url,
                self.FieldProduct.APPLE_APP_STORE_URL: update_product_request_params.apple_app_store_url,
                self.FieldProduct.RELATED_PRODUCTS: update_product_request_params.related_products,
            }

            if update_product_request_params.default_credentials_id:
                current_default = entity.get(
                    self.FieldProduct.DEFAULT_CREDENTIALS_ID, ""
                )
                if update_product_request_params.is_default or not current_default:
                    update_fields[self.FieldProduct.DEFAULT_CREDENTIALS_ID] = (
                        update_product_request_params.default_credentials_id
                    )
                    orionis_log(
                        f"Set credentials {update_product_request_params.default_credentials_id} as default "
                        f"for product {update_product_request_params.product_id}"
                    )

            filtered_fields = {k: v for k, v in update_fields.items() if v is not None}

            if filtered_fields:
                filtered_fields[self.FIELD_UPDATED_AT] = datetime.now(timezone.utc)
                entity.update(filtered_fields)
                self.db.put(entity)
                orionis_log(
                    f"Successfully updated product {update_product_request_params.product_id}"
                )

            return (
                update_product_request_params.default_credentials_id
                or "Product updated successfully"
            )

        except Exception as e:
            orionis_log(
                f"Error updating product {update_product_request_params.product_id}", e
            )
            raise e

    def soft_delete_product(self, product_id: str) -> str:
        try:
            key = self.db.key(self.FieldProduct.KIND, int(product_id))
            entity = self.db.get(key)

            if not entity:
                raise ValueError(f"Product with id {product_id} not found")

            entity.update(
                {
                    self.FieldProduct.STATUS: self.FieldProduct.VALUE_DELETED,
                    self.FIELD_UPDATED_AT: datetime.now(timezone.utc),
                }
            )
            self.db.put(entity)
            orionis_log(f"Successfully Deleted product {product_id}")
            return "Product deleted successfully"

        except Exception as e:
            orionis_log(f"Error deleting product {product_id}", e)
            raise e
