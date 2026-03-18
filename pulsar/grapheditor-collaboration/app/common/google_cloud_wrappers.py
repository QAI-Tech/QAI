import os
from pathlib import Path
from google.cloud import datastore
from app.common.sqlite_datastore import SQLiteDatastoreClient


def _get_qai_root() -> Path:
    """Detect QAI root by looking for orionis and pulsar directories."""
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "orionis").exists() and (parent / "pulsar").exists():
            return parent
    return current.parents[4]


def _get_shared_state_root() -> Path:
    """Get the shared state root at QAI/.qai."""
    return _get_qai_root() / ".qai"


class GCPDatastoreWrapper:
    """Wrapper that provides backend-agnostic datastore access.
    
    Automatically selects between SQLite (local) and Google Datastore (GCP)
    based on environment variables. This allows Pulsar Feature and Flow
    entities to share the same persistence layer as Orionis.
    """

    def __init__(self):

        storage_backend = os.getenv("STORAGE_BACKEND", "gcs").lower()
        datastore_backend = "sqlite" if storage_backend == "local" else "gcp"

        if datastore_backend == "sqlite":

            default_sqlite_path = _get_shared_state_root() / "sqlite" / "qai.sqlite3"
            sqlite_db_path = os.getenv(
                "ORIONIS_SQLITE_DB_PATH", str(default_sqlite_path)
            )
            self.client = SQLiteDatastoreClient(sqlite_db_path=sqlite_db_path)
        else:

            self.client = datastore.Client()

    def get_datastore_client(self):
        """Return the datastore client (SQLite or GCP)."""
        return self.client
