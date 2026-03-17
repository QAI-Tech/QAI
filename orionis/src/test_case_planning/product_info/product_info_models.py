from typing import List, Optional
from openai import BaseModel


class ProductInfo(BaseModel):
    description: str
    infographic_urls: Optional[List[str]]
