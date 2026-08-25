from pydantic import BaseModel


class ErrorResponse(BaseModel):
    error: str


class MethodNotAllowedResponse(ErrorResponse):
    error: str = "Method not allowed."


class ForbiddenResponse(ErrorResponse):
    error: str = "Forbidden. The request could not be verified as originating from Twilio."
