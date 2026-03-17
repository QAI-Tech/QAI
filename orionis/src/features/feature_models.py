from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime


class Feature(BaseModel):
    product_id: str
    name: str
    description: str
    created_at: datetime
    updated_at: datetime
    id: str
    sort_index: Optional[float] = None
    kg_feature_id: str | None = None
    nodeIds: Optional[List[str]] = None


class AddFeatureRequestParams(BaseModel):
    product_id: str
    name: str
    description: str = ""
    kg_feature_id: str | None = None


class DeleteFeatureRequestParams(BaseModel):
    id: str
    product_id: str


class FeatureNotFoundError(Exception):
    """Custom exception for when a feature is not found."""

    pass


class FeatureInputModel(BaseModel):
    feature_id: str
    sort_index: Optional[float] = None


class ReorderFeatureRequestModel(BaseModel):
    feature_changed: str
    features: List[FeatureInputModel]


class ReorderFeatureResponse(BaseModel):
    success: bool
    feature_id: str
    new_sort_index: float


class UpdateFeatureRequestParams(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    id: str
