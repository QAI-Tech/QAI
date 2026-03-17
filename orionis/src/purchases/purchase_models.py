from datetime import datetime
from pydantic import BaseModel


class Purchase(BaseModel):
    purchase_id: str
    organisation_id: str
    qubit_amount: int
    amount_cents: int
    is_auto_reload: bool
    created_at: datetime
