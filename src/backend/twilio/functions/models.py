from pydantic import BaseModel


class ErrorResponse(BaseModel):
    error: str


class SendRequest(BaseModel):
    user_id: str
    message: str


class SendResponse(BaseModel):
    ok: bool = True
    message_sid: str
    to: str
    body: str
