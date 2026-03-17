from typing import Any, ClassVar
from attr import dataclass
from pydantic import BaseModel


@dataclass(frozen=True)
class ApiRequestEntity(BaseModel):

    API_METHOD_GET: ClassVar[str] = "GET"
    API_METHOD_POST: ClassVar[str] = "POST"
    API_METHOD_PUT: ClassVar[str] = "PUT"
    API_METHOD_DELETE: ClassVar[str] = "DELETE"

    data: Any
    method: str


@dataclass(frozen=True)
class ApiResponseEntity(BaseModel):

    HTTP_STATUS_OK: ClassVar[int] = 200
    HTTP_STATUS_BAD_REQUEST: ClassVar[int] = 400
    HTTP_STATUS_UNAUTHORIZED: ClassVar[int] = 401
    HTTP_STATUS_FORBIDDEN: ClassVar[int] = 403
    HTTP_STATUS_NOT_FOUND: ClassVar[int] = 404
    HTTP_STATUS_METHOD_NOT_ALLOWED: ClassVar[int] = 405
    HTTP_STATUS_INTERNAL_SERVER_ERROR: ClassVar[int] = 500

    response: dict[str, Any] | list[Any]
    status_code: int
