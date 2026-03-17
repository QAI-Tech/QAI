from datetime import datetime, timezone
from common.google_cloud_wrappers import GCPDatastoreWrapper
from credentials.credentials_model import (
    Credentials,
    AddCredentialsRequest,
    UpdateCredentialsRequest,
)
from utils.util import orionis_log


class CredentialsDatastore:
    ENTITY_KIND_CREDENTIALS = "Credentials"
    FIELD_USERNAME = "username"
    FIELD_PASSWORD = "password"
    FIELD_DESCRIPTION = "description"
    FIELD_CREATED_AT = "created_at"
    FIELD_UPDATED_AT = "updated_at"
    FIELD_PRODUCT_ID = "product_id"
    FIELD_CREDENTIALS = "credentials"

    def __init__(self):
        self.db = GCPDatastoreWrapper().get_datastore_client()

    def add_credentials(
        self, credentials_request: AddCredentialsRequest
    ) -> Credentials:
        """Add new credentials to the datastore."""
        try:
            key = self.db.key(self.ENTITY_KIND_CREDENTIALS)
            entity = self.db.entity(key=key)
            orionis_log(f"Adding credentials to datastore: {credentials_request}")

            created_at = datetime.now(timezone.utc)
            credentials_data = credentials_request.credentials or {}
            entity.update(
                {
                    self.FIELD_CREDENTIALS: credentials_data,
                    self.FIELD_DESCRIPTION: credentials_request.description or "",
                    self.FIELD_PRODUCT_ID: credentials_request.product_id,
                    self.FIELD_CREATED_AT: created_at,
                    self.FIELD_UPDATED_AT: created_at,
                }
            )
            orionis_log(f"Credentials entity: {entity}")
            self.db.put(entity)
            credentials_id = str(entity.key.id)

            return Credentials(
                id=credentials_id,
                credentials=credentials_data,
                description=credentials_request.description or "",
                product_id=credentials_request.product_id,
                created_at=created_at,
                updated_at=created_at,
            )
        except ValueError as e:
            orionis_log("ValueError while adding credentials", e)
            raise e
        except Exception as e:
            orionis_log("Error adding credentials", e)
            raise e

    def get_credentials(self, product_id: str) -> list[Credentials]:
        """Get credentials for a product."""
        try:
            orionis_log(f"Getting credentials for product_id: {product_id}")

            query = self.db.query(kind=self.ENTITY_KIND_CREDENTIALS)
            query.add_filter(self.FIELD_PRODUCT_ID, "=", product_id)
            query.order = ["-" + self.FIELD_CREATED_AT]
            query_results = list(query.fetch()) or []

            orionis_log(
                f"Fetched {len(query_results)} credentials for product_id: {product_id}"
            )
            credentials_list = []
            for credential in query_results:
                if self.FIELD_CREDENTIALS in credential:
                    credentials_data = credential[self.FIELD_CREDENTIALS]
                else:
                    username = credential.get(self.FIELD_USERNAME)
                    password = credential.get(self.FIELD_PASSWORD)
                    credentials_data = {}
                    if username:
                        credentials_data["username"] = username
                    if password:
                        credentials_data["password"] = password

                credentials_list.append(
                    Credentials(
                        id=str(credential.key.id),
                        credentials=credentials_data,
                        description=credential.get(self.FIELD_DESCRIPTION),
                        product_id=credential.get(self.FIELD_PRODUCT_ID),
                        created_at=credential.get(self.FIELD_CREATED_AT),
                        updated_at=credential.get(self.FIELD_UPDATED_AT),
                    )
                )
            return credentials_list

        except Exception as e:
            orionis_log("Error getting credentials", e)
            raise e

    def update_credentials(
        self, credentials_request: UpdateCredentialsRequest
    ) -> Credentials:
        """Update credentials in the datastore."""
        try:
            orionis_log(f"Updating credentials in datastore: {credentials_request}")

            key = self.db.key(self.ENTITY_KIND_CREDENTIALS, int(credentials_request.id))
            entity = self.db.get(key)

            if not entity:
                raise ValueError(
                    f"Credentials with id {credentials_request.id} not found"
                )

            existing_credentials = entity.get(self.FIELD_CREDENTIALS)

            if existing_credentials is None:
                existing_credentials = {}
                username = entity.get(self.FIELD_USERNAME)
                password = entity.get(self.FIELD_PASSWORD)
                if username:
                    existing_credentials["username"] = username
                if password:
                    existing_credentials["password"] = password

            if credentials_request.credentials:
                existing_credentials = credentials_request.credentials
                orionis_log(f"Updated credentials: {existing_credentials}")
            else:
                raise ValueError("Credentials must be provided for update.")

            entity.update(
                {
                    self.FIELD_UPDATED_AT: datetime.now(timezone.utc),
                    self.FIELD_CREDENTIALS: (
                        existing_credentials if existing_credentials else {}
                    ),
                    self.FIELD_DESCRIPTION: (
                        credentials_request.description
                        if credentials_request.description is not None
                        else entity.get(self.FIELD_DESCRIPTION, "")
                    ),
                }
            )

            self.db.put(entity)

            return Credentials(
                id=credentials_request.id,
                credentials=existing_credentials,
                description=entity[self.FIELD_DESCRIPTION],
                product_id=entity[self.FIELD_PRODUCT_ID],
                created_at=entity[self.FIELD_CREATED_AT],
                updated_at=entity[self.FIELD_UPDATED_AT],
            )

        except ValueError as e:
            orionis_log("ValueError while updating credentials", e)
            raise e
        except Exception as e:
            orionis_log("Error updating credentials", e)
            raise e

    def delete_credentials(self, credentials_id: str):

        key = self.db.key(self.ENTITY_KIND_CREDENTIALS, int(credentials_id))
        entity = self.db.get(key)

        if not entity:
            raise ValueError(f"Credentials with id {credentials_id} not found")

        self.db.delete(key)

        orionis_log(f"Credentials with id {credentials_id} deleted successfully")

        return credentials_id
