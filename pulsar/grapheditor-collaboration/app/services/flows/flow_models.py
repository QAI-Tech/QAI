from typing import List, Optional
from pydantic import BaseModel
from app.model.graph_models import Scenario

class Flow(BaseModel):
    id: str
    name: str
    startNodeId: str
    endNodeId: str
    viaNodeIds: List[str]
    pathNodeIds: List[str]
    precondition: Optional[str] = None
    scenarios: Optional[List[Scenario]] = None
    credentials: Optional[List[str]] = None
    videoUrl: Optional[str] = None
    autoPlan: bool = True
    description: Optional[str] = None
    feature_id: str
    product_id: str
