"""
View all data in qai-local.sqlite3.

Usage:
  python view_db.py                    # summary of all kinds
  python view_db.py Product            # show all Product entities
  python view_db.py Product 1          # show Product with ID 1
"""

import sqlite3, pickle, json, sys

DB_PATH = "qai-local.sqlite3"

def pretty(obj):
    """JSON-serialize with fallback for non-serializable types."""
    try:
        return json.dumps(obj, indent=2, default=str)
    except Exception:
        return str(obj)

def main():
    conn = sqlite3.connect(DB_PATH)
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

if __name__ == "__main__":
    main()
