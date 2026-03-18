from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Iterator, Sequence

from sqlalchemy import DateTime, Integer, PickleType, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class SQLiteEntityRecord(Base):
    __tablename__ = "datastore_entities"

    kind: Mapped[str] = mapped_column(String, primary_key=True)
    entity_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payload: Mapped[dict[str, Any]] = mapped_column(PickleType, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class SQLiteKindCounter(Base):
    __tablename__ = "datastore_kind_counters"

    kind: Mapped[str] = mapped_column(String, primary_key=True)
    next_id: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


@dataclass
class SQLiteDatastoreKey:
    kind: str
    id: int | None = None

    @property
    def id_or_name(self) -> int | None:
        return self.id


class SQLiteDatastoreEntity(dict):
    def __init__(self, key: SQLiteDatastoreKey, initial: dict[str, Any] | None = None):
        super().__init__(initial or {})
        self.key = key
        self.exclude_from_indexes: set[str] = set()


class SQLiteDatastoreQuery:
    def __init__(self, client: SQLiteDatastoreClient, kind: str):
        self._client = client
        self._kind = kind
        self._filters: list[tuple[str, str, Any]] = []
        self._keys_only = False
        self.order: list[str] = []

    def add_filter(self, field_name: str, operator: str, value: Any) -> None:
        self._filters.append((field_name, operator, value))

    def keys_only(self) -> None:
        self._keys_only = True

    def fetch(self, limit: int | None = None) -> Iterator[SQLiteDatastoreEntity]:
        entities = [
            self._client._to_entity(record)
            for record in self._client._list_records(self._kind)
        ]
        filtered = [entity for entity in entities if self._matches(entity)]

        if self.order:
            for order_field in reversed(self.order):
                reverse = order_field.startswith("-")
                field_name = order_field[1:] if reverse else order_field
                filtered.sort(
                    key=lambda entity: entity.get(field_name),
                    reverse=reverse,
                )

        if self._keys_only:
            for entity in filtered:
                entity.clear()

        if limit is not None:
            filtered = filtered[:limit]

        return iter(filtered)

    def _matches(self, entity: SQLiteDatastoreEntity) -> bool:
        for field_name, operator, value in self._filters:
            actual = entity.get(field_name)
            if operator == "=":
                if actual != value:
                    return False
            elif operator == "IN":
                if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
                    return False
                if actual not in value:
                    return False
            else:
                raise ValueError(f"Unsupported filter operator for sqlite backend: {operator}")
        return True


class SQLiteDatastoreClient:
    def __init__(self, sqlite_db_path: str):
        if sqlite_db_path != ":memory:":
            db_path = Path(sqlite_db_path).expanduser()
            db_path.parent.mkdir(parents=True, exist_ok=True)
            sqlite_db_path = str(db_path)

        self._engine = create_engine(f"sqlite:///{sqlite_db_path}")
        self._session_factory = sessionmaker(bind=self._engine, expire_on_commit=False)
        self._counter_lock = Lock()

        Base.metadata.create_all(self._engine)

    def key(self, kind: str, id: int | None = None) -> SQLiteDatastoreKey:
        return SQLiteDatastoreKey(kind=kind, id=id)

    def entity(self, key: SQLiteDatastoreKey) -> SQLiteDatastoreEntity:
        return SQLiteDatastoreEntity(key=key)

    def get(self, key: SQLiteDatastoreKey) -> SQLiteDatastoreEntity | None:
        if key.id is None:
            return None

        with self._session_factory() as session:
            record = session.get(SQLiteEntityRecord, (key.kind, key.id))
            if record is None:
                return None
            return self._to_entity(record)

    def get_multi(
        self, keys: list[SQLiteDatastoreKey]
    ) -> list[SQLiteDatastoreEntity | None]:
        return [self.get(key) for key in keys]

    def put(self, entity: SQLiteDatastoreEntity) -> None:
        if entity.key.id is None:
            entity.key.id = self._allocate_id(entity.key.kind)

        now = datetime.now(timezone.utc)
        with self._session_factory() as session:
            existing = session.get(
                SQLiteEntityRecord,
                (entity.key.kind, entity.key.id),
            )
            if existing is None:
                record = SQLiteEntityRecord(
                    kind=entity.key.kind,
                    entity_id=entity.key.id,
                    payload=dict(entity),
                    created_at=now,
                    updated_at=now,
                )
                session.add(record)
            else:
                existing.payload = dict(entity)
                existing.updated_at = now
            session.commit()

    def put_multi(self, entities: list[SQLiteDatastoreEntity]) -> None:
        for entity in entities:
            self.put(entity)

    def delete(self, key: SQLiteDatastoreKey) -> None:
        if key.id is None:
            return

        with self._session_factory() as session:
            record = session.get(SQLiteEntityRecord, (key.kind, key.id))
            if record is not None:
                session.delete(record)
                session.commit()

    def delete_multi(self, keys: list[SQLiteDatastoreKey]) -> None:
        for key in keys:
            self.delete(key)

    def query(self, kind: str) -> SQLiteDatastoreQuery:
        return SQLiteDatastoreQuery(client=self, kind=kind)

    def _list_records(self, kind: str) -> list[SQLiteEntityRecord]:
        with self._session_factory() as session:
            stmt = select(SQLiteEntityRecord).where(SQLiteEntityRecord.kind == kind)
            return list(session.scalars(stmt))

    def _to_entity(self, record: SQLiteEntityRecord) -> SQLiteDatastoreEntity:
        return SQLiteDatastoreEntity(
            key=SQLiteDatastoreKey(kind=record.kind, id=record.entity_id),
            initial=dict(record.payload),
        )

    def _allocate_id(self, kind: str) -> int:
        with self._counter_lock:
            with self._session_factory() as session:
                counter = session.get(SQLiteKindCounter, kind)
                if counter is None:
                    counter = SQLiteKindCounter(kind=kind, next_id=2)
                    session.add(counter)
                    session.commit()
                    return 1

                allocated_id = counter.next_id
                counter.next_id += 1
                session.commit()
                return allocated_id
