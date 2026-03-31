"""
View all data in qai-local.sqlite3.

Usage:
  python view_db.py                    # summary of all kinds
  python view_db.py Product            # show all Product entities
  python view_db.py Product 1          # show Product with ID 1
"""

import os
import tempfile
import subprocess
import sqlite3, pickle, json, sys

DB_PATH = "/app/.qai/sqlite/qai.sqlite3"
FALLBACK_DB_PATH = "qai-local.sqlite3"
CONTAINER_CANDIDATES = ["qai-orionis", "qai-nebula", "qai-graph-collab"]


def has_table(db_path, table_name):
    """Return True if the SQLite DB exists and includes the target table."""
    if not os.path.exists(db_path) or os.path.getsize(db_path) == 0:
        return False
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
            (table_name,),
        )
        found = cur.fetchone() is not None
        conn.close()
        return found
    except Exception:
        return False


def find_container_with_db():
    """Return the first running container that has the expected DB file."""
    for container in CONTAINER_CANDIDATES:
        result = subprocess.run(
            ["docker", "exec", container, "sh", "-lc", f"test -f {DB_PATH}"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            return container
    return None


def copy_db_from_container(container):
    """Copy DB from container to a temp file and return that temp file path."""
    tmp = tempfile.NamedTemporaryFile(prefix="qai-db-", suffix=".sqlite3", delete=False)
    tmp.close()
    result = subprocess.run(
        ["docker", "cp", f"{container}:{DB_PATH}", tmp.name],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Failed to copy DB from {container}: {result.stderr.strip()}")
    return tmp.name


def resolve_db_path():
    """Find a usable DB path from host or running Docker container."""
    env_db = os.getenv("QAI_DB_PATH")
    if env_db and has_table(env_db, "datastore_entities"):
        return env_db, False

    if has_table(DB_PATH, "datastore_entities"):
        return DB_PATH, False

    if has_table(FALLBACK_DB_PATH, "datastore_entities"):
        return FALLBACK_DB_PATH, False

    container = find_container_with_db()
    if container:
        copied_path = copy_db_from_container(container)
        if has_table(copied_path, "datastore_entities"):
            return copied_path, True

    raise RuntimeError(
        "Could not find a valid SQLite DB with table 'datastore_entities'. "
        "If Docker is running, verify containers are up and /app/.qai/sqlite/qai.sqlite3 exists. "
        "You can also set QAI_DB_PATH to a valid DB file."
    )

def pretty(obj):
    """JSON-serialize with fallback for non-serializable types."""
    try:
        return json.dumps(obj, indent=2, default=str)
    except Exception:
        return str(obj)

def main():
    db_path, is_temp_copy = resolve_db_path()
    print(f"Using DB path: {db_path}")
    if is_temp_copy:
        print("(Copied from running Docker container)")

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    kind_filter = sys.argv[1] if len(sys.argv) > 1 else None
    id_filter = int(sys.argv[2]) if len(sys.argv) > 2 else None

    if kind_filter is None:
        # Show summary
        print("=" * 60)
        print("DATABASE SUMMARY")
        print("=" * 60)
        cur.execute("SELECT kind, COUNT(*) FROM datastore_entities GROUP BY kind ORDER BY kind")
        for kind, count in cur.fetchall():
            print(f"  {kind}: {count} entities")
        print()
        print("Usage: python view_db.py <Kind> [ID]")
        print("Available kinds listed above.")
    else:
        # Show entities
        if id_filter is not None:
            cur.execute(
                "SELECT kind, entity_id, payload FROM datastore_entities WHERE kind = ? AND entity_id = ?",
                (kind_filter, id_filter),
            )
        else:
            cur.execute(
                "SELECT kind, entity_id, payload FROM datastore_entities WHERE kind = ?",
                (kind_filter,),
            )

        rows = cur.fetchall()
        if not rows:
            print(f"No entities found for Kind='{kind_filter}'" + (f", ID={id_filter}" if id_filter else ""))
            return

        for kind, entity_id, payload_blob in rows:
            data = pickle.loads(payload_blob)
            print("=" * 60)
            print(f"Kind: {kind}  |  ID: {entity_id}")
            print("-" * 60)
            print(pretty(data))
            print()

    conn.close()
    if is_temp_copy and os.path.exists(db_path):
        os.remove(db_path)

if __name__ == "__main__":
    main()
