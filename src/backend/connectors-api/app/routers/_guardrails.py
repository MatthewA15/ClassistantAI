"""Shared guardrail models for write endpoints.

A write endpoint that acts on something the student already has (send this
draft, edit this event, delete this event) makes the agent echo back what it
believes it is acting on. When the echo doesn't match what Google currently
holds, the endpoint answers `409` with this shape and performs no write: the
agent's picture is stale, so the student has to be re-asked rather than the
call retried.

Gmail and Calendar share these models so the ADK tools parse one mismatch
shape, not one per connector. `MismatchResponse` is subclassed per connector
purely to give `detail` a connector-specific default -- the field names and
types are the frozen part.
"""
from pydantic import BaseModel, Field


class FieldMismatch(BaseModel):
    field: str = Field(...,
                       description="The field that failed to match (e.g. 'to', 'subject', 'body', 'summary').")
    expected: str = Field(...,
                          description="The value Google currently holds.")
    got: str = Field(..., description="The value provided in the request.")


class MismatchResponse(BaseModel):
    detail: str = Field(default="Content mismatch.",
                        description="Summary of the mismatch.")
    mismatches: list[FieldMismatch] = Field(
        default_factory=list, description="Per-field mismatch details.")
