from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime


class Feature(BaseModel):
    id: str  # Empty string allowed for creation - Datastore will generate the ID
    product_id: str
    name: str
    description: str = ""
    nodeIds: List[str] = []
    sort_index: Optional[float] = None
    kg_feature_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime



