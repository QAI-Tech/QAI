from pydantic import BaseModel
from constants import ModeType


class TitleGenerationRequest(BaseModel):
    node_id: str
    image_url: str


class TitleGenerationResponse(BaseModel):
    node_id: str
    title: str
    description: str


class FormatBusinessLogicRequest(BaseModel):
    business_logic: str
    edge_id: str
    mode: ModeType = ModeType.FORMAT_BUSINESS_LOGIC


class FormatBusinessLogicResponse(BaseModel):
    formatted_business_logic: str
    edge_id: str
    meta_logic: str


class FormatEdgeDescriptionRequest(BaseModel):
    description: str
    edge_id: str


class FormatEdgeDescriptionResponse(BaseModel):
    formatted_description: str
    edge_id: str
    meta_logic: str
