from __future__ import annotations

import os
import shutil
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


@dataclass
class LocalBlob:
    root_dir: Path
    bucket_name: str
    name: str

    @property
    def generation(self) -> int:
        file_path = self.root_dir / self.bucket_name / self.name
        if not file_path.exists():
            return 0
        return int(file_path.stat().st_mtime_ns)

    def upload_from_string(
        self,
        data: str | bytes,
        content_type: str | None = None,
    ) -> None:
        del content_type
        file_path = self.root_dir / self.bucket_name / self.name
        file_path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(data, str):
            file_path.write_text(data, encoding="utf-8")
        else:
            file_path.write_bytes(data)

    def download_to_filename(self, destination: str) -> None:
        source = self.root_dir / self.bucket_name / self.name
        shutil.copyfile(source, destination)

    def download_as_string(self) -> bytes:
        file_path = self.root_dir / self.bucket_name / self.name
        return file_path.read_bytes()

    def download_as_text(self) -> str:
        file_path = self.root_dir / self.bucket_name / self.name
        return file_path.read_text(encoding="utf-8")

    def exists(self) -> bool:
        file_path = self.root_dir / self.bucket_name / self.name
        return file_path.exists()

    def generate_signed_url(
        self,
        version: str,
        expiration: int,
        method: str,
    ) -> str:
        del version, expiration, method
        file_path = self.root_dir / self.bucket_name / self.name
        return file_path.as_uri()

    def create_resumable_upload_session(
        self,
        content_type: str = "application/octet-stream",
        origin: str | None = None,
    ) -> str:
        del content_type, origin
        file_path = self.root_dir / self.bucket_name / self.name
        file_path.parent.mkdir(parents=True, exist_ok=True)
        return file_path.as_uri()


class LocalBucket:
    def __init__(self, root_dir: Path, name: str):
        self.root_dir = root_dir
        self.name = name

    def blob(self, blob_name: str, generation: str | None = None) -> LocalBlob:
        del generation
        return LocalBlob(root_dir=self.root_dir, bucket_name=self.name, name=blob_name)

    def list_blobs(self, prefix: str = "", versions: bool = False) -> list[LocalBlob]:
        del versions
        bucket_path = self.root_dir / self.name
        if not bucket_path.exists():
            return []

        blobs: list[LocalBlob] = []
        for file_path in bucket_path.rglob("*"):
            if not file_path.is_file():
                continue
            relative_path = str(file_path.relative_to(bucket_path))
            if relative_path.startswith(prefix):
                blobs.append(
                    LocalBlob(
                        root_dir=self.root_dir,
                        bucket_name=self.name,
                        name=relative_path,
                    )
                )
        return blobs

    def delete_blobs(self, blobs: list[LocalBlob]) -> None:
        for blob in blobs:
            file_path = self.root_dir / self.name / blob.name
            if file_path.exists():
                file_path.unlink()

    def copy_blob(
        self,
        source_blob: LocalBlob,
        destination_bucket: LocalBucket,
        destination_blob_name: str,
    ) -> LocalBlob:
        source_path = self.root_dir / source_blob.bucket_name / source_blob.name
        destination_path = (
            destination_bucket.root_dir / destination_bucket.name / destination_blob_name
        )
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_path, destination_path)
        return destination_bucket.blob(destination_blob_name)


class LocalFileStorageWrapper:
    def __init__(self, root_directory: str, env_prefix: str):
        self.root_dir = Path(root_directory).expanduser().resolve()
        self.root_dir.mkdir(parents=True, exist_ok=True)
        self.env_prefix = env_prefix
        self.bucket = LocalBucket(
            root_dir=self.root_dir,
            name=self._construct_bucket_name("product_execution_video_store"),
        )

    def _construct_bucket_name(self, bucket_name: str) -> str:
        return f"{bucket_name}{self.env_prefix}".lower()

    def get_base_name_from_uri(self, uri: str) -> str:
        blob_name = self.parse_uri(uri)[1]
        return os.path.basename(blob_name)

    def get_latest_version_number(self, bucket_name: str, blob_name: str) -> str:
        bucket = LocalBucket(self.root_dir, self._construct_bucket_name(bucket_name))
        blob = bucket.blob(blob_name)
        if not blob.exists():
            raise FileNotFoundError(f"Blob not found: gs://{bucket_name}/{blob_name}")
        return str(blob.generation)

    def copy_blob(
        self,
        source_uri: str,
        destination_bucket_name: str,
        destination_blob_name: str = "",
    ) -> str:
        source_bucket_name, source_blob_name = self.parse_uri(source_uri)
        source_bucket = LocalBucket(self.root_dir, source_bucket_name)
        source_blob = source_bucket.blob(source_blob_name)

        destination_bucket = LocalBucket(
            self.root_dir,
            self._construct_bucket_name(destination_bucket_name),
        )
        if not destination_blob_name:
            destination_blob_name = source_blob_name

        new_blob = source_bucket.copy_blob(
            source_blob,
            destination_bucket,
            destination_blob_name,
        )
        return f"gs://{new_blob.bucket_name}/{new_blob.name}"

    def get_bucket(self) -> LocalBucket:
        return self.bucket

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
        use_constructed_bucket_name: bool = True,
    ) -> str:
        del content_type
        bucket_name = (
            self._construct_bucket_name(bucket_name)
            if use_constructed_bucket_name
            else bucket_name
        )
        bucket = LocalBucket(self.root_dir, bucket_name)
        bucket.blob(blob_name).upload_from_string(file_contents)
        return f"gs://{bucket_name}/{blob_name}"

    def store_bytes(
        self,
        bytes: bytes,
        bucket_name: str,
        blob_name: str,
        content_type: str = "application/octet-stream",
        use_constructed_bucket_name: bool = True,
    ) -> str:
        del content_type
        if use_constructed_bucket_name:
            bucket_name = self._construct_bucket_name(bucket_name)
        bucket = LocalBucket(self.root_dir, bucket_name)
        bucket.blob(blob_name).upload_from_string(bytes)
        return f"gs://{bucket_name}/{blob_name}"

    def create_resumable_upload_session(
        self,
        bucket_name: str,
        blob_name: str,
        content_type: str = "application/octet-stream",
        origin: str | None = None,
    ) -> str:
        bucket = LocalBucket(self.root_dir, self._construct_bucket_name(bucket_name))
        blob = bucket.blob(blob_name)
        return blob.create_resumable_upload_session(
            content_type=content_type,
            origin=origin,
        )

    def download_file_locally(
        self,
        uri: str,
        generation: str | None = None,
        use_constructed_bucket_name: bool = True,
    ) -> str:
        del generation
        bucket_name, blob_name = self.parse_uri(uri)

        if use_constructed_bucket_name:
            bucket_name = self._construct_bucket_name(bucket_name)

        bucket = LocalBucket(self.root_dir, bucket_name)
        blob = bucket.blob(blob_name)

        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            blob.download_to_filename(temp_file.name)
            return temp_file.name

    def list_blobs(
        self,
        bucket_name: str,
        prefix: str,
        use_constructed_bucket_name: bool = True,
    ) -> list[str]:
        if use_constructed_bucket_name:
            bucket_name = self._construct_bucket_name(bucket_name)
        bucket = LocalBucket(self.root_dir, bucket_name)
        blobs = bucket.list_blobs(prefix=prefix)
        return [f"gs://{bucket_name}/{blob.name}" for blob in blobs]

    def delete_directory(self, bucket_name: str, directory_prefix: str) -> None:
        bucket_name = self._construct_bucket_name(bucket_name)
        bucket = LocalBucket(self.root_dir, bucket_name)
        blobs = bucket.list_blobs(prefix=directory_prefix)
        bucket.delete_blobs(blobs)

    def _gcs_blob_exists(self, uri: str) -> bool:
        try:
            bucket_name, blob_name = self.parse_uri(uri)
            bucket = LocalBucket(self.root_dir, bucket_name)
            return bucket.blob(blob_name).exists()
        except Exception:
            return False

    def generate_signed_url(
        self,
        blob_name: str,
        bucket_name: str,
        expiration: int = 15 * 60,
        method: str = "GET",
    ) -> str:
        bucket = LocalBucket(self.root_dir, bucket_name)
        blob = bucket.blob(blob_name)
        return blob.generate_signed_url(
            version="v4",
            expiration=expiration,
            method=method,
        )

    @staticmethod
    def default_root_dir() -> str:
        date_segment = datetime.now().strftime("%Y%m%d")
        return str(Path(".orionis") / "storage" / date_segment)
