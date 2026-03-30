import os
import shutil
import sys
import tempfile
from pathlib import Path

from tc_executor.logger_config import logger as system_logger

_QAI_ROOT = Path(__file__).resolve().parents[2]


def _load_workspace_env() -> None:
    env_path = _QAI_ROOT / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue

        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]

        os.environ.setdefault(key, value)


_load_workspace_env()

_ORIONIS_SRC = _QAI_ROOT / "orionis" / "src"
if str(_ORIONIS_SRC) not in sys.path:
    sys.path.insert(0, str(_ORIONIS_SRC))

# Temporarily remove nova's 'utils' from sys.modules so orionis can load its own 'utils'
_nova_utils = sys.modules.pop("utils", None)

try:
    from common.google_cloud_wrappers import (  # type: ignore  # noqa: E402
        GCPDatastoreWrapper as OrionisDatastoreWrapper,
    )
    from common.google_cloud_wrappers import (  # type: ignore  # noqa: E402
        GCPFileStorageWrapper as OrionisFileStorageWrapper,
    )
    from config import Config, config  # type: ignore  # noqa: E402
finally:
    # Restore nova's 'utils'
    if _nova_utils is not None:
        sys.modules["utils"] = _nova_utils


class _LocalBlobShim:
    def __init__(self, root_dir: Path, bucket_name: str, blob_name: str):
        self._root_dir = root_dir
        self.bucket_name = bucket_name
        self.name = blob_name

    @property
    def _path(self) -> Path:
        return self._root_dir / self.bucket_name / self.name

    def upload_from_file(self, file_obj, content_type: str | None = None):
        del content_type
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._path, "wb") as outfile:
            shutil.copyfileobj(file_obj, outfile)

    def upload_from_string(self, data, content_type: str | None = None):
        del content_type
        self._path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(data, bytes):
            self._path.write_bytes(data)
        else:
            self._path.write_text(data, encoding="utf-8")

    def upload_from_filename(self, filename: str):
        self._path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(filename, self._path)

    def exists(self) -> bool:
        return self._path.exists()

    def download_to_filename(self, destination: str):
        Path(destination).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(self._path, destination)


class _LocalBucketShim:
    def __init__(self, root_dir: Path, bucket_name: str):
        self._root_dir = root_dir
        self.name = bucket_name

    def blob(self, blob_name: str):
        return _LocalBlobShim(self._root_dir, self.name, blob_name)


class GCPDatastoreWrapper:
    def __init__(self):
        self._delegate = OrionisDatastoreWrapper()
        self.client = self._delegate.get_datastore_client()

    def get_datastore_client(self):
        return self.client


class GCPFileStorageWrapper:
    def __init__(self):
        self.env_prefix = "-prod" if config.environment == Config.PRODUCTION else ""
        self._delegate = OrionisFileStorageWrapper()
        self._local_storage = getattr(self._delegate, "_local_storage", None)

    def _construct_bucket_name(self, bucket_name: str) -> str:
        return f"{bucket_name}{self.env_prefix}".lower()

    def _resolve_constructed_bucket_name(self, bucket_name: str) -> str:
        bucket_name = bucket_name.lower()
        if self.env_prefix and bucket_name.endswith(self.env_prefix):
            return bucket_name
        return self._construct_bucket_name(bucket_name)

    def get_base_name_from_uri(self, uri: str) -> str:
        return self._delegate.get_base_name_from_uri(uri)

    def copy_blob(
        self,
        source_uri: str,
        destination_bucket_name: str,
        destination_blob_name: str = "",
    ) -> str:
        resolved_bucket_name = self._resolve_constructed_bucket_name(
            destination_bucket_name
        )
        new_blob_uri = self._delegate.copy_blob(
            source_uri=source_uri,
            destination_bucket_name=resolved_bucket_name,
            destination_blob_name=destination_blob_name,
        )
        system_logger.debug(
            f"Successfully copied file from {source_uri} to {new_blob_uri}"
        )
        return new_blob_uri

    def get_bucket(self, bucket_name: str = "nova_assets"):
        if self._local_storage is not None:
            return _LocalBucketShim(self._local_storage.root_dir, bucket_name)

        import google.cloud.storage as storage

        return storage.Client().bucket(bucket_name)

    def parse_uri(self, uri: str) -> tuple[str, str]:
        return self._delegate.parse_uri(uri)

    def store_file(
        self,
        file_contents: str,
        bucket_name: str,
        blob_name: str,
        content_type: str = "text/plain",
    ):
        resolved_bucket_name = self._resolve_constructed_bucket_name(bucket_name)
        bucket_uri = self._delegate.store_file(
            file_contents=file_contents,
            bucket_name=resolved_bucket_name,
            blob_name=blob_name,
            content_type=content_type,
            use_constructed_bucket_name=False,
        )
        system_logger.debug(f"Successfully stored file: {bucket_uri}")
        return bucket_uri

    def store_bytes(
        self,
        file_contents: bytes,
        bucket_name: str,
        blob_name: str,
        content_type: str = "application/octet-stream",
    ):
        resolved_bucket_name = self._resolve_constructed_bucket_name(bucket_name)
        bucket_uri = self._delegate.store_bytes(
            bytes=file_contents,
            bucket_name=resolved_bucket_name,
            blob_name=blob_name,
            content_type=content_type,
            use_constructed_bucket_name=False,
        )
        system_logger.debug(f"Successfully stored bytes: {bucket_uri}")
        return bucket_uri

    def list_blobs(self, bucket_name: str, prefix: str) -> list[str]:
        resolved_bucket_name = self._resolve_constructed_bucket_name(bucket_name)
        return self._delegate.list_blobs(
            bucket_name=resolved_bucket_name,
            prefix=prefix,
            use_constructed_bucket_name=False,
        )

    def download_latest_timestamp_dir(
        self, gcp_prefix, outdirpath, bucket_name="nova_assets"
    ):
        resolved_bucket_name = self._resolve_constructed_bucket_name(bucket_name)
        blob_uris = self._delegate.list_blobs(
            bucket_name=resolved_bucket_name,
            prefix=gcp_prefix,
            use_constructed_bucket_name=False,
        )

        if not blob_uris:
            raise RuntimeError(f"No files found in gs://{resolved_bucket_name}/{gcp_prefix}")

        for blob_uri in blob_uris:
            _, blob_name = self.parse_uri(blob_uri)
            rel_path = os.path.relpath(blob_name, gcp_prefix)
            local_path = os.path.join(outdirpath, rel_path)
            os.makedirs(os.path.dirname(local_path), exist_ok=True)

            temp_path = self._delegate.download_file_locally(
                uri=blob_uri,
                use_constructed_bucket_name=False,
            )
            shutil.copyfile(temp_path, local_path)
            os.remove(temp_path)
            print(f"Downloaded: {blob_name} -> {local_path}")

        print("Download complete.")

    def delete_directory(self, bucket_name: str, directory_prefix: str):
        resolved_bucket_name = self._resolve_constructed_bucket_name(bucket_name)
        self._delegate.delete_directory(resolved_bucket_name, directory_prefix)
        system_logger.debug(
            f"Successfully deleted directory {resolved_bucket_name}/{directory_prefix}"
        )
