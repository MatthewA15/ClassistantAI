"""Decrypt the student's school-portal credentials (Firestore + KMS).

The browser agent is the only component with decrypt rights on the
``school_password`` credential (ENCRYPTION_CONTRACT.md #1: the connector is
denied the password key; this agent is denied the refresh-token key). Two
reads per student:

1. ``users/{uid}.school_username`` — a plain field on the user document
   (written by the frontend's ``recordSchoolUsername``). No decryption.
2. ``users/{uid}/credentials/school_password`` — the envelope-encrypted
   password. Plaintext is *just the password string*, nothing else.

Envelope (docs/ENCRYPTION_CONTRACT.md, "classistant-password-key"):
   dkey        <- KMS.decrypt(encrypted_dkey, AAD=uid)   [plaintext = b64 text]
   password    <- AES-256-GCM.decrypt(encrypted_credential, dkey, iv)
"""

import base64
import logging
import os
from typing import Any
from cachetools.func import ttl_cache
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from google.cloud import firestore, kms

logger = logging.getLogger(__name__)

USERS_COLLECTION = "users"
CREDENTIALS_SUBCOLLECTION = "credentials"
PASSWORD_CREDENTIAL_TYPE = "school_password"

_PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "classisstant")
# KMS key resource parts for the school-password key. Defaults follow
# docs/ENCRYPTION_CONTRACT.md #5 (classistant-keyring / classistant-password-key
# in us-central1).
_KMS_LOCATION = os.environ.get("KMS_LOCATION", "us-central1")
_KEYRING = os.environ.get("KMS_KEYRING", "classistant-keyring")
_KEY = os.environ.get("KMS_KEY", "classistant-password-key")


class CredentialError(Exception):
    """Base class — callers can branch on the subclasses."""


class CredentialNotFound(CredentialError):
    """No school_password credential stored for this user."""


class CredentialFormatError(CredentialError):
    """Stored envelope doesn't match the agreed encoding (ENCRYPTION_CONTRACT)."""


class KmsDecryptError(CredentialError):
    """KMS itself failed (IAM, wrong key, service error) — see contract's
    verification table; distinct from a malformed stored envelope."""


# --------------------------------------------------------------------------
# Lazy clients (created once per process; Cloud Run friendly)
# --------------------------------------------------------------------------

_db: firestore.Client | None = None
_kms: kms.KeyManagementServiceClient | None = None


def _firestore_client() -> firestore.Client:
    global _db
    if _db is None:
        _db = firestore.Client()
    return _db


def _kms_client() -> kms.KeyManagementServiceClient:
    global _kms
    if _kms is None:
        _kms = kms.KeyManagementServiceClient()
    return _kms


def _key_name(project_id: str) -> str:
    """Full resource name of the school-password KMS key."""
    return _kms_client().crypto_key_path(
        project_id, _KMS_LOCATION, _KEYRING, _KEY
    )


# --------------------------------------------------------------------------
# Step 1 — fetch the documents
#
# ENCRYPTION_CONTRACT.md #2: users/{uid}/credentials/{credential_type} is a
# direct document get — no query, no index.
# --------------------------------------------------------------------------

def _fetch_username(user_id: str) -> str | None:
    snapshot = (
        _firestore_client()
        .collection(USERS_COLLECTION)
        .document(user_id)
        .get()
    )
    if not snapshot.exists:
        raise CredentialNotFound(f"No user document for user_id={user_id!r}.")
    return (snapshot.to_dict() or {}).get("school_username")


def _fetch_password_doc(user_id: str) -> dict[str, Any]:
    snapshot = (
        _firestore_client()
        .collection(USERS_COLLECTION)
        .document(user_id)
        .collection(CREDENTIALS_SUBCOLLECTION)
        .document(PASSWORD_CREDENTIAL_TYPE)
        .get()
    )
    if not snapshot.exists:
        raise CredentialNotFound(
            f"No {PASSWORD_CREDENTIAL_TYPE} credential for user_id={user_id!r}. "
            "Has the user saved their portal password in the dashboard?"
        )
    doc = snapshot.to_dict() or {}
    missing = [
        f
        for f in ("encrypted_credential", "encrypted_dkey", "iv")
        if not doc.get(f)
    ]
    if missing:
        raise CredentialFormatError(
            f"credentials/{PASSWORD_CREDENTIAL_TYPE} doc for "
            f"user_id={user_id!r} is missing fields: {missing}."
        )
    return doc


# --------------------------------------------------------------------------
# AAD — must byte-match whatever the frontend passed on the KMS encrypt
# call, or KMS fails closed (ENCRYPTION_CONTRACT.md #5).
# --------------------------------------------------------------------------

def _aad_for(uid: str) -> bytes | None:
    """AAD source: "user_id" (contract default) | "none" (KMS_AAD_SOURCE env)."""
    if os.environ.get("KMS_AAD_SOURCE", "user_id") == "user_id":
        return uid.encode("utf-8")
    return None


def _b64(value: str, field: str) -> bytes:
    try:
        return base64.b64decode(value, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise CredentialFormatError(
            f"Field {field!r} is not valid base64."
        ) from exc


# --------------------------------------------------------------------------
# Step 2 — unwrap dkey via KMS
#
# ENCRYPTION_CONTRACT.md #5: KMS plaintext is the base64 *text* of the raw
# 32-byte dkey, encoded UTF-8 — exactly one shape, not a family of
# tolerated ones.
# --------------------------------------------------------------------------

def _unwrap_dkey(doc: dict[str, Any], user_id: str, project_id: str) -> bytes:
    try:
        response = _kms_client().decrypt(
            request={
                "name": _key_name(project_id),
                "ciphertext": _b64(doc["encrypted_dkey"], "encrypted_dkey"),
                **(
                    {"additional_authenticated_data": aad}
                    if (aad := _aad_for(user_id))
                    else {}
                ),
            }
        )
    except CredentialError:
        raise
    except Exception as exc:
        # KMS-side failure (PermissionDenied, wrong key, outage)
        raise KmsDecryptError(
            f"KMS decrypt of encrypted_dkey failed: {exc}"
        ) from exc

    plaintext = response.plaintext
    try:
        decoded = base64.b64decode(plaintext.decode("utf-8"), validate=True)
    except Exception as exc:
        raise CredentialFormatError(
            "Unwrapped dkey is not the base64 text of a key (expected utf-8 "
            "base64, per ENCRYPTION_CONTRACT.md #5)."
        ) from exc
    if len(decoded) != 32:
        raise CredentialFormatError(
            f"Unwrapped dkey decoded to {len(decoded)} bytes, expected 32 "
            "(AES-256)."
        )

    return decoded


# --------------------------------------------------------------------------
# Step 3 — decrypt the password
#
# ENCRYPTION_CONTRACT.md #4: 12-byte IV, AES-256-GCM, tag appended to the
# ciphertext — AESGCM.decrypt() expects exactly that layout. Plaintext is
# just the password string.
# --------------------------------------------------------------------------

def _decrypt_password(
    doc: dict[str, Any],
    user_id: str,
    project_id: str
) -> str:
    dkey = _unwrap_dkey(doc, user_id, project_id)
    iv = _b64(doc["iv"], "iv")
    ciphertext = _b64(doc["encrypted_credential"], "encrypted_credential")
    try:
        return AESGCM(dkey).decrypt(iv, ciphertext, None).decode("utf-8")
    except Exception as exc:  # noqa: BLE001
        raise CredentialFormatError(
            "AES-GCM decrypt of encrypted_credential failed. Usual causes: "
            "IV byte-encoding mismatch, tag not appended to ciphertext, an "
            "AAD mismatch, or a dkey encoding mismatch (see "
            "docs/ENCRYPTION_CONTRACT.md #4/#5)."
        ) from exc


# --------------------------------------------------------------------------
# Public API — cached per user (+ env-var debug override)
# --------------------------------------------------------------------------

@ttl_cache(maxsize=128, ttl=60*10)
def get_portal_credentials(user_id: str) -> dict[str, str]:
    """Return ``{"username": ..., "password": ...}`` for this student.

    - Username comes from the plain ``school_username`` field on the user
    document.
    - Password is envelope-decrypted from ``credentials/school_password``.

    Cached with a 10-minute TTL. A login flow may hit this several times,
    but plaintext doesn't live in the cache forever.

    Raises

    - ``CredentialNotFound``
    - ``CredentialFormatError``

    Callers (callbacks.py) translate those into agent-friendly error dicts.
    """

    debug_username = os.environ.get("PORTAL_DEBUG_USERNAME")
    debug_password = os.environ.get("PORTAL_DEBUG_PASSWORD")

    if debug_username and debug_password:
        return {"username": str(debug_username), "password": debug_password}

    if not (username := _fetch_username(user_id)):
        raise CredentialNotFound(
            f"No school_username for this user. The student hasn't "
            "saved their portal username yet."
        )

    password_doc = _fetch_password_doc(user_id)
    password = _decrypt_password(password_doc, user_id, _PROJECT_ID)

    return {"username": str(username), "password": password}


def clear_cache() -> None:
    """Drop the credential cache (useful after a password update, and tests)."""
    get_portal_credentials.cache_clear()
