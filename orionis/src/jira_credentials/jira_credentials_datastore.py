from datetime import datetime, timezone
from typing import Optional, List
from common.google_cloud_wrappers import GCPDatastoreWrapper
from jira_credentials.jira_credentials_model import (
    JiraCredentials,
    JiraCredentialsDecrypted,
    JiraCredentialsResponse,
    AddJiraCredentialsRequest,
)
from jira_credentials.jira_encryption import JiraEncryption
from utils.util import orionis_log


class JiraCredentialsDatastore:
    ENTITY_KIND_JIRA_CREDENTIALS = "JiraCredentials"
    FIELD_EMAIL = "email"
    FIELD_ENCRYPTED_API_TOKEN = "encrypted_api_token"
    FIELD_PRODUCT_ID = "product_id"
    FIELD_JIRA_PROJECT_KEY = "jira_project_key"
    FIELD_JIRA_BASE_URL = "jira_base_url"
    FIELD_CREATED_AT = "created_at"
    FIELD_UPDATED_AT = "updated_at"

    def __init__(self):
        self.db = GCPDatastoreWrapper().get_datastore_client()
        self.encryption = JiraEncryption()

    def add_jira_credentials(
        self, request: AddJiraCredentialsRequest
    ) -> JiraCredentials:
        """Add new Jira credentials to the datastore with encrypted token."""
        try:
            key = self.db.key(self.ENTITY_KIND_JIRA_CREDENTIALS)
            entity = self.db.entity(key=key)

            orionis_log(f"Adding Jira credentials for email: {request.email}")

            # Encrypt the API token before storing
            encrypted_token = self.encryption.encrypt_token(request.api_token)

            created_at = datetime.now(timezone.utc)
            entity.update(
                {
                    self.FIELD_EMAIL: request.email,
                    self.FIELD_ENCRYPTED_API_TOKEN: encrypted_token,
                    self.FIELD_PRODUCT_ID: request.product_id,
                    self.FIELD_JIRA_PROJECT_KEY: request.jira_project_key,
                    self.FIELD_JIRA_BASE_URL: request.jira_base_url,
                    self.FIELD_CREATED_AT: created_at,
                    self.FIELD_UPDATED_AT: created_at,
                }
            )

            self.db.put(entity)
            credentials_id = str(entity.key.id)

            orionis_log(f"Jira credentials added with ID: {credentials_id}")

            return JiraCredentials(
                id=credentials_id,
                email=request.email,
                encrypted_api_token=encrypted_token,
                product_id=request.product_id,
                jira_project_key=request.jira_project_key,
                jira_base_url=request.jira_base_url,
                created_at=created_at,
                updated_at=created_at,
            )
        except ValueError as e:
            orionis_log(f"ValueError while adding Jira credentials: {e}", e)
            raise e
        except Exception as e:
            orionis_log(f"Error adding Jira credentials: {e}", e)
            raise e

    def delete_jira_credentials(self, credentials_id: str) -> str:
        """Delete Jira credentials by ID."""
        try:
            key = self.db.key(self.ENTITY_KIND_JIRA_CREDENTIALS, int(credentials_id))
            entity = self.db.get(key)

            if not entity:
                raise ValueError(f"Jira credentials with id {credentials_id} not found")

            self.db.delete(key)
            orionis_log(
                f"Jira credentials with ID {credentials_id} deleted successfully"
            )

            return credentials_id
        except ValueError as e:
            orionis_log(f"ValueError while deleting Jira credentials: {e}", e)
            raise e
        except Exception as e:
            orionis_log(f"Error deleting Jira credentials: {e}", e)
            raise e

    def get_jira_credentials_for_product(
        self, product_id: str
    ) -> Optional[JiraCredentialsDecrypted]:
        """
        Internal method to get Jira credentials for a product with decrypted token.
        This is for backend use only - not exposed as an API endpoint.

        Args:
            product_id: The product ID to get credentials for

        Returns:
            JiraCredentialsDecrypted object with plaintext token, or None if not found
        """
        try:
            orionis_log(f"Getting Jira credentials for product_id: {product_id}")

            query = self.db.query(kind=self.ENTITY_KIND_JIRA_CREDENTIALS)
            query.add_filter(self.FIELD_PRODUCT_ID, "=", product_id)
            query.order = ["-" + self.FIELD_CREATED_AT]

            results = list(query.fetch(limit=1))

            if not results:
                orionis_log(f"No Jira credentials found for product_id: {product_id}")
                return None

            credential = results[0]

            # Decrypt the token
            encrypted_token = credential[self.FIELD_ENCRYPTED_API_TOKEN]
            decrypted_token = self.encryption.decrypt_token(encrypted_token)

            return JiraCredentialsDecrypted(
                id=str(credential.key.id),
                email=credential[self.FIELD_EMAIL],
                api_token=decrypted_token,
                product_id=credential[self.FIELD_PRODUCT_ID],
                jira_project_key=credential[self.FIELD_JIRA_PROJECT_KEY],
                jira_base_url=credential[self.FIELD_JIRA_BASE_URL],
                created_at=credential[self.FIELD_CREATED_AT],
                updated_at=credential.get(self.FIELD_UPDATED_AT),
            )

        except Exception as e:
            orionis_log(f"Error getting Jira credentials: {e}", e)
            raise e

    def get_jira_credentials_list(
        self, product_id: str
    ) -> List[JiraCredentialsResponse]:
        """
        Get list of Jira credentials for a product (without API tokens).
        This is for frontend display - API tokens are NOT included for security.

        Args:
            product_id: The product ID to get credentials for

        Returns:
            List of JiraCredentialsResponse objects (without API tokens)
        """
        try:
            orionis_log(f"Getting Jira credentials list for product_id: {product_id}")

            query = self.db.query(kind=self.ENTITY_KIND_JIRA_CREDENTIALS)
            query.add_filter(self.FIELD_PRODUCT_ID, "=", product_id)
            query.order = ["-" + self.FIELD_CREATED_AT]

            results = list(query.fetch())

            orionis_log(
                f"Found {len(results)} Jira credentials for product_id: {product_id}"
            )

            credentials_list = []
            for credential in results:
                credentials_list.append(
                    JiraCredentialsResponse(
                        id=str(credential.key.id),
                        email=credential[self.FIELD_EMAIL],
                        product_id=credential[self.FIELD_PRODUCT_ID],
                        jira_project_key=credential[self.FIELD_JIRA_PROJECT_KEY],
                        jira_base_url=credential[self.FIELD_JIRA_BASE_URL],
                        created_at=credential[self.FIELD_CREATED_AT],
                        updated_at=credential.get(self.FIELD_UPDATED_AT),
                    )
                )

            return credentials_list

        except Exception as e:
            orionis_log(f"Error getting Jira credentials list: {e}", e)
            raise e
