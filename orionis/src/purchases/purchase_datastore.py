from common.google_cloud_wrappers import GCPDatastoreWrapper
from purchases.purchase_models import Purchase
from google.cloud import datastore
from datetime import datetime, timezone
from utils.util import orionis_log
from typing import List


class PurchaseDatastore:
    ENTITY_KIND_PURCHASE = "QubitPurchase"
    FIELD_PURCHASE_ID = "purchase_id"
    FIELD_ORGANISATION_ID = "organisation_id"
    FIELD_QUBIT_AMOUNT = "qubit_amount"
    FIELD_AMOUNT_CENTS = "amount_cents"
    FIELD_IS_AUTO_RELOAD = "is_auto_reload"
    FIELD_CREATED_AT = "created_at"

    def __init__(self):
        self.db = GCPDatastoreWrapper().get_datastore_client()

    def add_purchase(
        self,
        organisation_id: str,
        qubit_amount: int,
        amount_cents: int,
        is_auto_reload: bool,
    ) -> Purchase:
        """Add a purchase record."""
        entity = datastore.Entity(key=self.db.key(self.ENTITY_KIND_PURCHASE))

        created_at = datetime.now(timezone.utc)

        entity.update(
            {
                self.FIELD_ORGANISATION_ID: organisation_id,
                self.FIELD_QUBIT_AMOUNT: qubit_amount,
                self.FIELD_AMOUNT_CENTS: amount_cents,
                self.FIELD_IS_AUTO_RELOAD: is_auto_reload,
                self.FIELD_CREATED_AT: created_at,
            }
        )

        self.db.put(entity)

        purchase_id = str(entity.key.id)

        orionis_log(
            f"Added purchase {purchase_id} for organisation {organisation_id}: "
            f"{qubit_amount} qubits, {amount_cents} cents, auto_reload={is_auto_reload}"
        )

        return Purchase(
            purchase_id=purchase_id,
            organisation_id=organisation_id,
            qubit_amount=qubit_amount,
            amount_cents=amount_cents,
            is_auto_reload=is_auto_reload,
            created_at=created_at,
        )

    def get_purchases_for_organisation(self, organisation_id: str) -> List[Purchase]:
        """Get purchase history for an organisation, ordered by most recent first."""
        query = self.db.query(kind=self.ENTITY_KIND_PURCHASE)
        query.add_filter(self.FIELD_ORGANISATION_ID, "=", organisation_id)
        query.order = ["-created_at"]

        entities = list(query.fetch())

        purchases = []
        for entity in entities:
            purchase = Purchase(
                purchase_id=str(entity.key.id),
                organisation_id=entity.get(self.FIELD_ORGANISATION_ID),
                qubit_amount=entity.get(self.FIELD_QUBIT_AMOUNT, 0),
                amount_cents=entity.get(self.FIELD_AMOUNT_CENTS, 0),
                is_auto_reload=entity.get(self.FIELD_IS_AUTO_RELOAD, False),
                created_at=entity.get(self.FIELD_CREATED_AT),
            )
            purchases.append(purchase)

        return purchases
