from pydantic import BaseModel, model_validator
from constants import TWILIO_MIN_DELAY_S, TWILIO_MAX_DELAY_S


class ErrorResponse(BaseModel):
    error: str


class OutboundMessage(BaseModel):
    """A single outbound SMS.

    ``delay_s`` is the number of seconds to wait before sending this message
    (relative to the first message). It is:

    * **forbidden** on the first message (which is sent immediately), and
    * **required and strictly > 0** on every subsequent message.
    """

    body: str
    delay_s: float | None = None


class SendRequest(BaseModel):
    user_id: str
    messages: list[OutboundMessage]

    @model_validator(mode="after")
    def _validate_messages(self):
        if not self.messages:
            raise ValueError("messages must contain at least one message")
        for i, m in enumerate(self.messages):
            if i == 0:
                if m.delay_s is not None:
                    raise ValueError(
                        "delay_s must be omitted on the first message"
                    )
            else:
                if m.delay_s is None:
                    raise ValueError(
                        f"delay_s is required on message at index {i}"
                    )
                if m.delay_s <= 0:
                    raise ValueError(
                        f"delay_s must be > 0 on message at index {i}"
                    )
                if m.delay_s < TWILIO_MIN_DELAY_S:
                    raise ValueError(
                        f"delay_s on message at index {i} is {m.delay_s}s; must be at least {TWILIO_MIN_DELAY_S}s"
                    )
                if m.delay_s > TWILIO_MAX_DELAY_S:
                    raise ValueError(
                        f"delay_s on message at index {i} is {m.delay_s}s; must be at most {TWILIO_MAX_DELAY_S}s"
                    )
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
