"""Per-user refresh token storage in Google Secret Manager.

Why Secret Manager (ADR-0002): KMS-encrypted at rest, IAM-scoped access,
audit-logged reads -> maps directly onto the hackathon's compliance /
observability judging criteria, and it's less code than hand-rolling crypto.

Secret naming: user-{google_sub}-refresh-token
The Google `sub` claim is a stable numeric user id -> safe for secret ids.
"""
from google.api_core import exceptions as gexc
from google.cloud import secretmanager

_client = secretmanager.SecretManagerServiceClient()


def _secret_id(user_id: str) -> str:
    return f"user-{user_id}-refresh-token"


def store_refresh_token(project_id: str, user_id: str, refresh_token: str) -> None:
    parent = f"projects/{project_id}"
    secret_name = f"{parent}/secrets/{_secret_id(user_id)}"
    try:
        _client.create_secret(
            request={
                "parent": parent,
                "secret_id": _secret_id(user_id),
                "secret": {"replication": {"automatic": {}}},
            }
        )
    except gexc.AlreadyExists:
        pass  # re-consent / re-login just adds a new version
    _client.add_secret_version(
        request={
            "parent": secret_name,
            "payload": {"data": refresh_token.encode()},
        }
    )


def get_refresh_token(project_id: str, user_id: str) -> str | None:
    name = f"projects/{project_id}/secrets/{_secret_id(user_id)}/versions/latest"
    try:
        resp = _client.access_secret_version(request={"name": name})
        return resp.payload.data.decode()
    except gexc.NotFound:
        return None
