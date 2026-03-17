from pydantic import BaseModel
from typing import List


class FlowChain(BaseModel):
    chain: List[str]


class AllReachableFlows(BaseModel):
    reachable_flows: List[str]
