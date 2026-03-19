from datetime import datetime, timezone
from typing import List
from common.google_cloud_wrappers import GCPDatastoreWrapper
from organisations.org_models import Organisation, UpdateOrganisationRequestParams
from users.user_datastore import UserDatastore
from utils.util import orionis_log
from google.cloud import datastore
from constants import Constants


class OrganisationDatastore:
    ENTITY_KIND_ORG = "Organisation"
    FIELD_ORGANISATION_NAME = "organisation_name"
    FIELD_HUMAN_READABLE_ORG_ID = "human_readable_org_id"
    FIELD_WHITELISTED_DOMAINS = "whitelisted_domains"
    FIELD_CREATED_AT = "created_at"
    FIELD_QUBIT_BALANCE = "qubit_balance"
    FIELD_STRIPE_CUSTOMER_ID = "stripe_customer_id"
    FIELD_AUTO_RELOAD_ENABLED = "auto_reload_enabled"
    FIELD_AUTO_RELOAD_THRESHOLD = "auto_reload_threshold"
    FIELD_AUTO_RELOAD_AMOUNT = "auto_reload_amount"
    FIELD_DEFAULT_QUBIT_BALANCE = 5
    FIELD_DEFAULT_AUTO_RELOAD_THRESHOLD = 5
    FIELD_DEFAULT_AUTO_RELOAD_AMOUNT = 100

    def __init__(self):
        self.db = GCPDatastoreWrapper().get_datastore_client()

    def _entity_to_model(self, entity: datastore.Entity) -> Organisation:
        """Convert a datastore entity to an Organisation model."""
        return Organisation(
            organisation_id=str(entity.key.id),
            organisation_name=entity.get(self.FIELD_ORGANISATION_NAME, ""),
            human_readable_org_id=entity.get(self.FIELD_HUMAN_READABLE_ORG_ID, ""),
            whitelisted_domains=entity.get(self.FIELD_WHITELISTED_DOMAINS, []),
            created_at=entity.get(self.FIELD_CREATED_AT, datetime.now(timezone.utc)),
            qubit_balance=entity.get(self.FIELD_QUBIT_BALANCE, 5),
            stripe_customer_id=entity.get(self.FIELD_STRIPE_CUSTOMER_ID),
            auto_reload_enabled=entity.get(self.FIELD_AUTO_RELOAD_ENABLED, False),
            auto_reload_threshold=entity.get(self.FIELD_AUTO_RELOAD_THRESHOLD, 5),
            auto_reload_amount=entity.get(self.FIELD_AUTO_RELOAD_AMOUNT, 100),
        )

    def add_organisation(self, organisation_name: str, user_id: str) -> Organisation:

        entity = self.db.entity(key=self.db.key(self.ENTITY_KIND_ORG))

        entity.update(
            {
                self.FIELD_ORGANISATION_NAME: organisation_name,
                self.FIELD_HUMAN_READABLE_ORG_ID: organisation_name,
                self.FIELD_WHITELISTED_DOMAINS: [],
                self.FIELD_CREATED_AT: datetime.now(timezone.utc),
                self.FIELD_QUBIT_BALANCE: self.FIELD_DEFAULT_QUBIT_BALANCE,
                self.FIELD_STRIPE_CUSTOMER_ID: None,
                self.FIELD_AUTO_RELOAD_ENABLED: False,
                self.FIELD_AUTO_RELOAD_THRESHOLD: self.FIELD_DEFAULT_AUTO_RELOAD_THRESHOLD,
                self.FIELD_AUTO_RELOAD_AMOUNT: self.FIELD_DEFAULT_AUTO_RELOAD_AMOUNT,
            }
        )

        self.db.put(entity)

        organisation_id = entity.key.id

        orionis_log(f"Successfully created organisation {organisation_id}")

        user_key = self.db.key(UserDatastore.ENTITY_KIND_USER, int(user_id))
        user_entity = self.db.get(user_key)

        if not user_entity:
            raise ValueError(f"User with ID {user_id} not found")

        existing_orgs = user_entity.get(UserDatastore.FIELD_ORGANISATION_IDS, [])
        if str(organisation_id) not in existing_orgs:
            existing_orgs.append(str(organisation_id))

        user_entity.update(
            {
                UserDatastore.FIELD_ORGANISATION_ID: str(organisation_id),
                UserDatastore.FIELD_ORGANISATION_IDS: existing_orgs,
                UserDatastore.FIELD_ROLES: [Constants.FIELD_OWNER_ROLE],
                UserDatastore.FIELD_UPDATED_AT: datetime.now(timezone.utc),
            }
        )

        self.db.put(user_entity)
        orionis_log(
            f"Successfully updated user {user_id} with organisation_id {organisation_id} and Admin role"
        )

        return self._entity_to_model(entity)

    def get_all_organisations(self) -> List[Organisation]:
        """Get all organisations from the datastore."""
        query = self.db.query(kind=self.ENTITY_KIND_ORG)
        entities = list(query.fetch())

        organisations = []
        for entity in entities:
            organisations.append(self._entity_to_model(entity))

        return organisations

    def get_qubit_balance(self, organisation_id: str) -> int:
        """Get qubit balance for an organisation."""
        key = self.db.key(self.ENTITY_KIND_ORG, int(organisation_id))
        entity = self.db.get(key)

        if not entity:
            raise ValueError(f"Organisation with id {organisation_id} not found")

        return entity.get(self.FIELD_QUBIT_BALANCE)

    def add_qubits(self, organisation_id: str, amount: int) -> int:
        """Add qubits to organisation balance. Returns new balance."""
        key = self.db.key(self.ENTITY_KIND_ORG, int(organisation_id))
        entity = self.db.get(key)

        if not entity:
            raise ValueError(f"Organisation with id {organisation_id} not found")

        current_balance = entity.get(self.FIELD_QUBIT_BALANCE)
        new_balance = current_balance + amount
        entity[self.FIELD_QUBIT_BALANCE] = new_balance
        self.db.put(entity)

        orionis_log(
            f"Added {amount} qubits to organisation {organisation_id}. New balance: {new_balance}"
        )
        return new_balance

    def deduct_qubits(self, organisation_id: str, amount: int) -> int:
        """Deduct qubits from organisation balance. Returns new balance."""
        key = self.db.key(self.ENTITY_KIND_ORG, int(organisation_id))
        entity = self.db.get(key)

        if not entity:
            raise ValueError(f"Organisation with id {organisation_id} not found")

        current_balance = entity.get(self.FIELD_QUBIT_BALANCE)
        if current_balance < amount:
            raise ValueError(
                f"Insufficient balance. Current: {current_balance}, Required: {amount}"
            )

        new_balance = current_balance - amount
        entity[self.FIELD_QUBIT_BALANCE] = new_balance
        self.db.put(entity)

        orionis_log(
            f"Deducted {amount} qubits from organisation {organisation_id}. New balance: {new_balance}"
        )
        return new_balance

    def get_organisation(self, organisation_id: str) -> Organisation:
        """Get organisation by ID."""
        key = self.db.key(self.ENTITY_KIND_ORG, int(organisation_id))
        entity = self.db.get(key)

        if not entity:
            raise ValueError(f"Organisation with id {organisation_id} not found")

        return self._entity_to_model(entity)

    def update_stripe_customer_id(
        self, organisation_id: str, stripe_customer_id: str
    ) -> None:
        """Update stripe customer ID for an organisation."""
        key = self.db.key(self.ENTITY_KIND_ORG, int(organisation_id))
        entity = self.db.get(key)

        if not entity:
            raise ValueError(f"Organisation with id {organisation_id} not found")

        entity[self.FIELD_STRIPE_CUSTOMER_ID] = stripe_customer_id
        self.db.put(entity)

        orionis_log(
            f"Updated stripe_customer_id for organisation {organisation_id}: {stripe_customer_id}"
        )

    def update_organisation(
        self, update_params: UpdateOrganisationRequestParams
    ) -> Organisation:
        """Update organisation with generic parameters."""
        key = self.db.key(self.ENTITY_KIND_ORG, int(update_params.organisation_id))
        entity = self.db.get(key)

        if not entity:
            raise ValueError(
                f"Organisation with id {update_params.organisation_id} not found"
            )

        update_fields = {
            self.FIELD_AUTO_RELOAD_ENABLED: update_params.auto_reload_enabled,
            self.FIELD_AUTO_RELOAD_THRESHOLD: update_params.auto_reload_threshold,
            self.FIELD_AUTO_RELOAD_AMOUNT: update_params.auto_reload_amount,
            self.FIELD_WHITELISTED_DOMAINS: update_params.whitelisted_domains,
        }

        filtered_update_fields = {
            key: value for key, value in update_fields.items() if value is not None
        }

        entity.update(filtered_update_fields)
        self.db.put(entity)

        orionis_log(
            f"Updated organisation {update_params.organisation_id} with fields: {list(filtered_update_fields.keys())}"
        )

        return self.get_organisation(update_params.organisation_id)
