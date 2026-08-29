from pydantic import BaseModel, model_validator


class ErrorResponse(BaseModel):
    error: str


class SendRequest(BaseModel):
    user_id: str
    messages: list[str]

    @model_validator(mode="after")
    def _validate_messages(self):
        if not self.messages:
            raise ValueError("messages must contain at least one message")
        return self


class SendResult(BaseModel):
    message_sid: str
    body: str
    # ISO 8601 timestamp marking when the message was sent.
    sent_at: str


class SendResponse(BaseModel):
    ok: bool = True
    to: str
    results: list[SendResult]
