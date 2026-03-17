import os
from google.cloud import datastore
import google.cloud.storage as storage
from gcp_upload.constants import Constants
from gcp_upload.config import Config, config
from tc_executor.logger_config import logger as system_logger

class GCPDatastoreWrapper:
    def __init__(self):
        self.client = datastore.Client()

    def get_datastore_client(self):
        return self.client


class GCPFileStorageWrapper:
    def __init__(self):
        self.env_prefix = "-prod" if config.environment == Config.PRODUCTION else ""
        

    def _construct_bucket_name(self, bucket_name: str) -> str:
        return f"{bucket_name}{self.env_prefix}".lower()

    def get_base_name_from_uri(self, uri: str) -> str:
        blob_name = self.parse_uri(uri)[1]
        base_name = os.path.basename(blob_name)
        return base_name

    def copy_blob(
        self,
        source_uri: str,
        destination_bucket_name: str,
        destination_blob_name: str = "",
    ) -> str:
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

        system_logger.debug(f"Successfully copied file from {source_uri} to {new_blob_uri}")

        return new_blob_uri

    def get_bucket(self, bucket_name: str = "nova_assets") -> storage.Bucket:
        return storage.Client().bucket(bucket_name)

    def parse_uri(self, uri: str) -> tuple[str, str]:
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
    ):
        bucket = storage.Client().bucket(self._construct_bucket_name(bucket_name))
        blob = bucket.blob(blob_name)
        blob.upload_from_string(file_contents, content_type=content_type)

        bucket_uri = f"gs://{self._construct_bucket_name(bucket_name)}/{blob_name}"
        system_logger.debug(f"Successfully stored file in GCS: {bucket_uri}")

        return bucket_uri

    def list_blobs(self, bucket_name: str, prefix: str) -> list[str]:
        bucket = storage.Client().bucket(self._construct_bucket_name(bucket_name))
        blobs = bucket.list_blobs(prefix=prefix)
        return [
            f"gs://{self._construct_bucket_name(bucket_name)}/{blob.name}"
            for blob in blobs
        ]
    
    def download_latest_timestamp_dir(self, gcp_prefix, outdirpath, bucket_name='nova_assets'):
        client = storage.Client()
        bucket = client.bucket(bucket_name)

        blobs = list(bucket.list_blobs(prefix=gcp_prefix))

        if not blobs:
            raise RuntimeError(f"No files found in gs://{bucket_name}/{gcp_prefix}")

        for blob in blobs:
            # Create local file path
            rel_path = os.path.relpath(blob.name, gcp_prefix)
            local_path = os.path.join(outdirpath, rel_path)

            # Ensure local directory exists
            os.makedirs(os.path.dirname(local_path), exist_ok=True)

            # Download blob to local file
            blob.download_to_filename(local_path)
            print(f'Downloaded: {blob.name} → {local_path}')

    print("Download complete.")

    def delete_directory(self, bucket_name: str, directory_prefix: str):
        bucket = storage.Client().bucket(self._construct_bucket_name(bucket_name))
        blobs = list(bucket.list_blobs(prefix=directory_prefix))
        bucket.delete_blobs(blobs)
        system_logger.debug(
            f"Successfully deleted directory {self._construct_bucket_name(bucket_name)}/{directory_prefix}"
        )
