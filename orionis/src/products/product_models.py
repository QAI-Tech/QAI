from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from credentials.credentials_model import DefaultCredentialsRequest


class ProductEntity(BaseModel):
    product_id: str
    product_name: str
    organisation_id: str
    web_url: str
    google_play_store_url: str
    apple_app_store_url: str
    related_products: List[str]
    created_at: datetime
    default_credentials_id: Optional[str] = None
    status: Optional[str] = None
    expected_app_behaviour: Optional[str] = None
    when_to_use_which_ui_element: Optional[str] = None


class AddProductRequestParams(BaseModel):
    product_name: str
    web_url: Optional[str] = None
    google_play_store_url: Optional[str] = None
    apple_app_store_url: Optional[str] = None
    organisation_id: str
    default_credentials: Optional[DefaultCredentialsRequest] = None


class GetAllProductsParams(BaseModel):
    organisation_id: str


class GetAllProductsResponse(BaseModel):
    products: List[ProductEntity]


class AddProductFeatureRequestParamsDeprecated(BaseModel):
    product_id: str
    feature_name: str
    description: str = ""
    kg_feature_id: str | None = None


class AddFunctionalityRequestParamsDeprecated(BaseModel):
    product_id: str
    feature_id: str
    functionality_name: str
    interactions: List[str]
    design_frame_urls: List[str]
    screen_ids: List[str]


class AddScreenRequestParams(BaseModel):
    product_id: str
    screen_name: str
    design_frame_urls: List[str]


class ScreenEntity(BaseModel):
    screen_id: str
    product_id: str
    screen_name: str
    design_frame_urls: List[str]
    created_at: datetime
    updated_at: datetime


class FunctionalityEntity(BaseModel):
    functionality_id: str
    product_id: str
    feature_id: str
    functionality_name: str
    interactions: List[str]
    design_frame_urls: List[str]
    screens: List[ScreenEntity]
    created_at: datetime
    updated_at: datetime


# Use Feature instead
class ProductFeatureEntityDeprecated(BaseModel):
    feature_id: str
    product_id: str
    feature_name: str
    description: str
    kg_feature_id: str | None = None
    created_at: datetime
    updated_at: datetime
    functionalities: List[FunctionalityEntity]


class UpdateProductRequestParams(BaseModel):
    product_id: str
    product_name: Optional[str] = None
    web_url: Optional[str] = None
    google_play_store_url: Optional[str] = None
    apple_app_store_url: Optional[str] = None
    related_products: Optional[List[str]] = None
    default_credentials_id: Optional[str] = None
    is_default: Optional[bool] = None


class DeleteProductRequestParams(BaseModel):
    product_id: str
