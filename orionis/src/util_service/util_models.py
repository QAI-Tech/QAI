from pydantic import BaseModel
from typing import List


class GetBatchSignedUrlsRequestParams(BaseModel):
    urls: List[str]


class TriggerApiRequestParams(BaseModel):
    base_url: str
    method: str
    headers: dict = {}
    body: dict = {}
