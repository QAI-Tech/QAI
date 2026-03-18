import os
import tempfile
from pathlib import Path
from google.cloud import datastore
import google.cloud.storage as storage
from google.oauth2 import service_account
from googleapiclient.discovery import build  # type: ignore
from email.message import EmailMessage
import base64
from constants import Constants
from utils.util import orionis_log
from config import Config, config
import json
from tenacity import retry, stop_after_attempt, wait_exponential
from common.local_file_storage import LocalFileStorageWrapper
from common.sqlite_datastore import SQLiteDatastoreClient


def _get_repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


class GCPDatastoreWrapper:
    def __init__(self):
        backend_mode = os.getenv("ORIONIS_BACKEND", "").lower()
        default_datastore_backend = "sqlite" if backend_mode == "local" else "gcp"
        datastore_backend = os.getenv(
            "ORIONIS_DATASTORE_BACKEND", default_datastore_backend
        ).lower()

        if datastore_backend == "sqlite":
            default_sqlite_path = _get_repo_root() / ".orionis" / "orionis.sqlite3"
            sqlite_db_path = os.getenv(
                "ORIONIS_SQLITE_DB_PATH", str(default_sqlite_path)
            )
            self.client = SQLiteDatastoreClient(sqlite_db_path=sqlite_db_path)
        else:
            self.client = datastore.Client()

    def get_datastore_client(self):
        return self.client


class GCPFileStorageWrapper:
    def __init__(self):
        self.env_prefix = "-prod" if config.environment == Config.PRODUCTION else ""
        backend_mode = os.getenv("ORIONIS_BACKEND", "").lower()
        default_file_backend = "local" if backend_mode == "local" else "gcp"
        self._file_storage_backend = os.getenv(
            "ORIONIS_FILE_STORAGE_BACKEND", default_file_backend
        ).lower()
        self._local_storage: LocalFileStorageWrapper | None = None

        if self._file_storage_backend == "local":
            default_storage_root = _get_repo_root() / ".orionis" / "storage"
            local_storage_root = os.getenv(
                "ORIONIS_LOCAL_STORAGE_ROOT",
                str(default_storage_root),
            )
            self._local_storage = LocalFileStorageWrapper(
                root_directory=local_storage_root,
                env_prefix=self.env_prefix,
            )
            self.bucket = self._local_storage.get_bucket()
        else:
            self.bucket = storage.Client().bucket(
                self._construct_bucket_name(Constants.PRODUCT_EXECUTION_VIDEO_STORE)
            )

    def _construct_bucket_name(self, bucket_name: str) -> str:
        return f"{bucket_name}{self.env_prefix}".lower()

    def get_base_name_from_uri(self, uri: str) -> str:
        if self._local_storage is not None:
            return self._local_storage.get_base_name_from_uri(uri)

        blob_name = self.parse_uri(uri)[1]
        base_name = os.path.basename(blob_name)
        return base_name

    def get_latest_version_number(self, bucket_name, blob_name) -> str:
        """
        Returns the generation (version) number of the latest version of a given blob as a string.
        """
        if self._local_storage is not None:
            return self._local_storage.get_latest_version_number(bucket_name, blob_name)

        try:
            client = storage.Client()
            bucket_name = self._construct_bucket_name(bucket_name)
            bucket = client.bucket(bucket_name)
            # List all versions of the object, filter to exact name, and get max generation
            blobs = list(bucket.list_blobs(prefix=blob_name, versions=True))
            candidates = [b for b in blobs if b.name == blob_name]
            if not candidates:
                orionis_log(
                    f"No versions found for object: {blob_name}",
                    Exception(f"No versions found for object: {blob_name}"),
                )
                raise Exception(f"No versions found for object: {blob_name}")
            latest_blob = max(candidates, key=lambda b: b.generation)
            return str(latest_blob.generation)  # Return as string
        except Exception as e:
            orionis_log(
                f"Error retrieving latest version for {blob_name} in bucket {bucket_name}: {e}",
                e,
            )
            raise

    def copy_blob(
        self,
        source_uri: str,
        destination_bucket_name: str,
        destination_blob_name: str = "",
    ) -> str:
        if self._local_storage is not None:
            return self._local_storage.copy_blob(
                source_uri=source_uri,
                destination_bucket_name=destination_bucket_name,
                destination_blob_name=destination_blob_name,
            )

        source_bucket_name, source_blob_name = self.parse_uri(source_uri)

        source_bucket = storage.Client().bucket(source_bucket_name)
        source_blob = source_bucket.blob(source_blob_name)

        destination_bucket = storage.Client().bucket(
            self._construct_bucket_name(destination_bucket_name)
        )
        if not destination_blob_name:
            destination_blob_name = source_blob_name

        new_blob = destination_bucket.copy_blob(
            source_blob, destination_bucket, destination_blob_name
        )

        new_blob_uri = f"gs://{new_blob.bucket.name}/{new_blob.name}"

        orionis_log(f"Successfully copied file from {source_uri} to {new_blob_uri}")

        return new_blob_uri

    def get_bucket(self):
        if self._local_storage is not None:
            return self._local_storage.get_bucket()

        return self.bucket

    def parse_uri(self, uri: str) -> tuple[str, str]:
        if self._local_storage is not None:
            return self._local_storage.parse_uri(uri)

        if not uri.startswith("gs://"):
            raise ValueError("Invalid GCS URI format for source_uri")

        uri_parts = uri[5:].split("/", 1)
        if len(uri_parts) != 2:
            raise ValueError("Invalid GCS URI format for source_uri")

        bucket_name, blob_name = uri_parts
        if not bucket_name:
            raise ValueError("Bucket name is missing in the source_uri")
        if not blob_name:
            raise ValueError("Blob name is missing in the source_uri")

        return bucket_name, blob_name

    def store_file(
        self,
        file_contents: str,
        bucket_name: str,
        blob_name: str,
        content_type: str = "text/plain",
        use_constructed_bucket_name: bool = True,
    ):
        if self._local_storage is not None:
            return self._local_storage.store_file(
                file_contents=file_contents,
                bucket_name=bucket_name,
                blob_name=blob_name,
                content_type=content_type,
                use_constructed_bucket_name=use_constructed_bucket_name,
            )

        bucket_name = (
            self._construct_bucket_name(bucket_name)
            if use_constructed_bucket_name
            else bucket_name
        )
        bucket = storage.Client().bucket(bucket_name)
        blob = bucket.blob(blob_name)
        blob.upload_from_string(file_contents, content_type=content_type)

        bucket_uri = f"gs://{bucket_name}/{blob_name}"
        orionis_log(f"Successfully stored file in GCS: {bucket_uri}")

        return bucket_uri

    def store_bytes(
        self,
        bytes: bytes,
        bucket_name: str,
        blob_name: str,
        content_type: str = "application/octet-stream",
        use_constructed_bucket_name: bool = True,
    ):
        if self._local_storage is not None:
            return self._local_storage.store_bytes(
                bytes=bytes,
                bucket_name=bucket_name,
                blob_name=blob_name,
                content_type=content_type,
                use_constructed_bucket_name=use_constructed_bucket_name,
            )

        if use_constructed_bucket_name:
            bucket_name = self._construct_bucket_name(bucket_name)
        bucket = storage.Client().bucket(bucket_name)
        blob = bucket.blob(blob_name)
        blob.upload_from_string(bytes, content_type=content_type)

        bucket_uri = f"gs://{bucket_name}/{blob_name}"
        orionis_log(f"Successfully stored file in GCS: {bucket_uri}")

        return bucket_uri

    def create_resumable_upload_session(
        self,
        bucket_name: str,
        blob_name: str,
        content_type: str = "application/octet-stream",
        origin: str | None = None,
    ) -> str:
        """
        Creates a GCS resumable upload session URL for large uploads.

        Args:
            bucket_name: Logical bucket name (will be suffixed based on environment).
            blob_name: Destination object path in the bucket.
            content_type: MIME type of the object to be uploaded.
            origin: Optional CORS origin to allow from browser uploads.

        Returns:
            A resumable upload session URL which the client can upload to directly.
        """
        if self._local_storage is not None:
            return self._local_storage.create_resumable_upload_session(
                bucket_name=bucket_name,
                blob_name=blob_name,
                content_type=content_type,
                origin=origin,
            )

        bucket = storage.Client().bucket(self._construct_bucket_name(bucket_name))
        blob = bucket.blob(blob_name)
        session_url = blob.create_resumable_upload_session(
            content_type=content_type,
            origin=origin,
        )
        return session_url

    def download_file_locally(
        self,
        uri: str,
        generation: str | None = None,
        use_constructed_bucket_name: bool = True,
    ) -> str:
        if self._local_storage is not None:
            return self._local_storage.download_file_locally(
                uri=uri,
                generation=generation,
                use_constructed_bucket_name=use_constructed_bucket_name,
            )

        bucket_name, blob_name = self.parse_uri(uri)

        if use_constructed_bucket_name:
            bucket_name = self._construct_bucket_name(bucket_name)

        bucket = storage.Client().bucket(bucket_name)

        if generation is not None:
            blob = bucket.blob(blob_name, generation=generation)
        else:
            blob = bucket.blob(blob_name)

        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            blob.download_to_filename(temp_file.name)
            orionis_log(f"Downloaded file {blob_name} to {temp_file.name}")
            return temp_file.name

    def list_blobs(
        self,
        bucket_name: str,
        prefix: str,
        use_constructed_bucket_name: bool = True,
    ) -> list[str]:
        if self._local_storage is not None:
            return self._local_storage.list_blobs(
                bucket_name=bucket_name,
                prefix=prefix,
                use_constructed_bucket_name=use_constructed_bucket_name,
            )

        resolved_bucket_name = (
            self._construct_bucket_name(bucket_name)
            if use_constructed_bucket_name
            else bucket_name
        )
        bucket = storage.Client().bucket(resolved_bucket_name)
        blobs = bucket.list_blobs(prefix=prefix)
        return [f"gs://{resolved_bucket_name}/{blob.name}" for blob in blobs]

    def delete_directory(self, bucket_name: str, directory_prefix: str):
        if self._local_storage is not None:
            self._local_storage.delete_directory(
                bucket_name=bucket_name,
                directory_prefix=directory_prefix,
            )
            return

        bucket = storage.Client().bucket(self._construct_bucket_name(bucket_name))
        blobs = list(bucket.list_blobs(prefix=directory_prefix))
        bucket.delete_blobs(blobs)
        orionis_log(
            f"Successfully deleted directory {self._construct_bucket_name(bucket_name)}/{directory_prefix}"
        )

    def _gcs_blob_exists(self, uri: str) -> bool:
        """Check if a GCS blob exists given its URI."""
        if self._local_storage is not None:
            return self._local_storage._gcs_blob_exists(uri)

        try:
            bucket_name, blob_name = self.parse_uri(uri)
            client = storage.Client()
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(blob_name)
            return blob.exists()
        except Exception as e:
            orionis_log(f"Error checking GCS blob existence for {uri}", e)
            return False

    def generate_signed_url(
        self,
        blob_name: str,
        bucket_name: str,
        expiration: int = 15 * 60,  # 15 minutes
        method: str = "GET",
    ) -> str:
        """Generate a V4 signed URL for a blob in GCS."""
        if self._local_storage is not None:
            return self._local_storage.generate_signed_url(
                blob_name=blob_name,
                bucket_name=bucket_name,
                expiration=expiration,
                method=method,
            )

        bucket = storage.Client().bucket(bucket_name)
        blob = bucket.blob(blob_name)
        return blob.generate_signed_url(
            version="v4", expiration=expiration, method=method
        )


class GmailWrapper:
    def __init__(self):
        self.delegated_user = Constants.GMAIL_DELEGATED_USER
        self.scopes = [Constants.GMAIL_SCOPE_SEND]
        backend_mode = os.getenv("ORIONIS_BACKEND", "").lower()
        self.enabled = (
            os.getenv("ORIONIS_ENABLE_GMAIL", "false").lower() == "true"
            if backend_mode == "local"
            else True
        )
        self.service = None

    def _initialize_service(self):
        creds_env_var = (
            "PATH_TO_GMAIL_CREDS_PRODUCTION"
            if config.environment == Config.PRODUCTION
            else "PATH_TO_GMAIL_CREDS_STAGING"
        )

        if creds_env_var not in os.environ:
            raise KeyError(f"Required environment variable {creds_env_var} is not set")

        creds_value = os.environ[creds_env_var]

        try:
            if os.path.isfile(creds_value):
                with open(creds_value, "r") as f:
                    service_account_info = json.load(f)
            else:
                try:
                    service_account_info = json.loads(creds_value)
                except json.JSONDecodeError as e:
                    raise ValueError(
                        f"Value in {creds_env_var} is neither a valid file path nor valid JSON: {str(e)}"
                    )

            credentials = service_account.Credentials.from_service_account_info(
                service_account_info, scopes=self.scopes
            )
        except Exception as e:
            orionis_log(f"Failed to initialize Gmail service: {str(e)}", e)
            raise RuntimeError(f"Failed to initialize Gmail service: {str(e)}") from e
        delegated_creds = credentials.with_subject(self.delegated_user)
        return build("gmail", "v1", credentials=delegated_creds)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
    )
    def send_email(
        self, to_email: str, subject: str, body: str, is_html: bool = False
    ) -> str:
        if not self.enabled:
            orionis_log(
                f"Skipping email send in local mode for recipient {to_email}: Gmail is disabled"
            )
            return "disabled"

        if self.service is None:
            self.service = self._initialize_service()

        message = EmailMessage()
        if is_html:
            message.set_content(body, subtype="html")
        else:
            message.set_content(body)

        message["To"] = to_email
        message["From"] = self.delegated_user
        message["Subject"] = subject

        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        create_message = {"raw": encoded_message}

        response = (
            self.service.users()
            .messages()
            .send(userId="me", body=create_message)
            .execute()
        )

        return response.get("id")
