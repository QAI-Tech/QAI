from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class ReorderableEntity(BaseModel):
    id: str
    sort_index: Optional[float]
    created_at: datetime
