import sqlite3

conn = sqlite3.connect("qai-local.sqlite3")
cursor = conn.cursor()

cursor.execute("SELECT kind, payload FROM datastore_entities")

for kind, payload in cursor.fetchall():
    print(kind, payload)  # still binary