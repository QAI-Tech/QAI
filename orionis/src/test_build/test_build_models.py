from enum import Enum
from pydantic import BaseModel


class PlatformType(str, Enum):
    IOS = "IOS"
    ANDROID = "ANDROID"
    WEB = "WEB"


class TestBuild(BaseModel):
    executable_url: str
    platform: str
    build_number: str
    product_id: str
