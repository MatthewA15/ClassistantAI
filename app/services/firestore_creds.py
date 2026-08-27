"""Firestore + KMS envelope decryption for the google_refresh_token credential
(issue #12; see docs/ENCRYPTION_CONTRACT.md -- the authority for every byte
format below -- and docs/adr/0004's second amendment for why this module
went back to decrypt-only after briefly doing both directions).

This service is the READ side of the envelope only. The frontend (Next.js)
runs the OAuth code exchange, encrypts the resulting refresh token, and
writes the ciphertext to Firestore; this module never produces a credential,
only reads one the frontend already wrote. That split is enforced by IAM
(this service's SA has cryptoKeyDecrypter on the refresh-token key and
nothing at all on the school_password key), not by convention -- but the
code should be structurally incapable of the wrong thing regardless: no KMS
`encrypt` call exists anywhere in this module, and no code path here ever
names, queries, or decrypts a `school_password` credential.

Read (get_access_token, called from google_creds.py per request):
  1. Fetch users/{uid}/credentials/google_refresh_token directly (no query,
     no index -- ENCRYPTION_CONTRACT.md #2).
  2. dkey        <- KMS.decrypt(encrypted_dkey)  [connector SA: decrypter only]
  3. refresh_tok <- AES-256-GCM.decrypt(encrypted_credential, dkey, iv)
  4. access_tok  <- OAuth token endpoint (refresh_token grant, needs client_id+secret)
  5. Cache access token per user until expiry; then repeat from step 1.

Notes:
  - user_id == Firebase UID, full stop. Not the Google `sub` -- the ambiguity
    is settled (ENCRYPTION_CONTRACT.md #9) and this module never falls back
    to any other identifier.
  - One-to-many at the Firestore level: each user has up to two documents
    under users/{uid}/credentials/, one per credential_type. This module only
    ever reads the google_refresh_token one; it has no function, constant, or
    branch that names school_password, and no IAM grant to decrypt it either
    way.
"""

import base64
import logging
import threading
import time
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.cloud import firestore, kms
from google.oauth2.credentials import Credentials

from app.config import settings

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
USERS_COLLECTION = "users"
CREDENTIALS_SUBCOLLECTION = "credentials"
REFRESH_TOKEN_TYPE = "google_refresh_token"

# Refresh this many seconds before Google says the token expires.
_EXPIRY_SKEW_SECONDS = 120


class CredentialError(Exception):
    """Base class — routers can map subclasses to HTTP codes."""


class CredentialNotFound(CredentialError):
    """No google_refresh_token credential stored for this user (-> 404)."""


class CredentialFormatError(CredentialError):
    """Stored blob doesn't match the agreed encoding — sync with frontend (-> 500)."""


# --------------------------------------------------------------------------
# Lazy clients (created once per process; Cloud Run friendly)
# --------------------------------------------------------------------------

_db: firestore.Client | None = None
_kms: kms.KeyManagementServiceClient | None = None
_clients_lock = threading.Lock()


def _firestore_client() -> firestore.Client:
    global _db
    if _db is None:
        with _clients_lock:
            if _db is None:
                _db = firestore.Client(project=settings.gcp_project_id)
    return _db


def _kms_client() -> kms.KeyManagementServiceClient:
    global _kms
    if _kms is None:
        with _clients_lock:
            if _kms is None:
                _kms = kms.KeyManagementServiceClient()
    return _kms


def _kms_key_name() -> str:
    return _kms_client().crypto_key_path(
        settings.gcp_project_id,
        settings.kms_location,
        settings.kms_keyring,      # classistant-keyring
        settings.kms_key,          # classistant-key (refresh-token key only)
    )


# --------------------------------------------------------------------------
# Step 1 — fetch the credential document
#
# ENCRYPTION_CONTRACT.md #2: users/{uid}/credentials/{credential_type}, a
# direct document get. No query, no composite index, and no other
# credential_type is ever named here.
# --------------------------------------------------------------------------

def _fetch_credential_doc(user_id: str) -> dict:
    snapshot = (
        _firestore_client()
        .collection(USERS_COLLECTION)
        .document(user_id)
        .collection(CREDENTIALS_SUBCOLLECTION)
        .document(REFRESH_TOKEN_TYPE)
        .get()
    )

    if not snapshot.exists:
        raise CredentialNotFound(
            f"No {REFRESH_TOKEN_TYPE} credential for user_id={user_id!r}. "
            "Has the user completed Google onboarding?"
        )

    doc = snapshot.to_dict() or {}
    missing = [
        f for f in ("encrypted_credential", "encrypted_dkey", "iv")
        if not doc.get(f)
    ]
    if missing:
        raise CredentialFormatError(
            f"credentials/{REFRESH_TOKEN_TYPE} doc for user_id={user_id!r} is "
            f"missing fields: {missing}."
        )
    return doc


# --------------------------------------------------------------------------
# AAD — must byte-match whatever the frontend passed on the KMS encrypt
# call, or KMS fails closed (ENCRYPTION_CONTRACT.md #5).
# --------------------------------------------------------------------------

def _aad_for(uid: str) -> bytes | None:
    """settings.kms_aad_source: "user_id" (contract default) | "none"."""
    if settings.kms_aad_source == "user_id":
        return uid.encode("utf-8")
    return None


def _b64(value: str, field: str) -> bytes:
    try:
        return base64.b64decode(value, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise CredentialFormatError(f"Field {field!r} is not valid base64.") from exc


# --------------------------------------------------------------------------
# Step 2 — unwrap dkey via KMS
#
# ENCRYPTION_CONTRACT.md #5: KMS plaintext is the base64 *text* of the raw
# 32-byte dkey, encoded UTF-8 -- exactly one shape, not a family of
# tolerated ones.
# --------------------------------------------------------------------------

def _unwrap_dkey(doc: dict, user_id: str) -> bytes:
    response = _kms_client().decrypt(
        request={
            "name": _kms_key_name(),
            "ciphertext": _b64(doc["encrypted_dkey"], "encrypted_dkey"),
            **(
                {"additional_authenticated_data": aad}
                if (aad := _aad_for(user_id))
                else {}
            ),
        }
    )
    plaintext = response.plaintext

    try:
        decoded = base64.b64decode(plaintext.decode("utf-8"), validate=True)
    except Exception as exc:  # noqa: BLE001
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
# Step 3 — decrypt the refresh token
#
# ENCRYPTION_CONTRACT.md #4: 12-byte IV, AES-256-GCM, tag appended to the
# ciphertext -- AESGCM.decrypt() expects exactly that layout.
# --------------------------------------------------------------------------

def _decrypt_refresh_token(doc: dict, user_id: str) -> str:
    dkey = _unwrap_dkey(doc, user_id)
    iv = _b64(doc["iv"], "iv")
    ciphertext = _b64(doc["encrypted_credential"], "encrypted_credential")
    try:
        return AESGCM(dkey).decrypt(iv, ciphertext, None).decode("utf-8")
    except Exception as exc:  # noqa: BLE001
        raise CredentialFormatError(
            "AES-GCM decrypt of encrypted_credential failed. Usual causes: "
            "IV byte-encoding mismatch, tag not appended to ciphertext, an "
            "AAD mismatch, or a dkey encoding mismatch -- see the round-trip "
            "test in tests/test_firestore_creds.py."
        ) from exc


# --------------------------------------------------------------------------
# Steps 4 + 5 — access token exchange with per-user cache
# --------------------------------------------------------------------------

@dataclass
class _CachedToken:
    access_token: str
    expires_at: float  # epoch seconds


_token_cache: dict[str, _CachedToken] = {}
_cache_lock = threading.Lock()


def _exchange(refresh_token: str) -> _CachedToken:
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri=GOOGLE_TOKEN_URI,
        client_id=settings.google_client_id,          # must be the SAME client
        client_secret=settings.google_client_secret,  # that issued the token
    )
    creds.refresh(GoogleAuthRequest())
    expires_at = creds.expiry.timestamp() if creds.expiry else time.time() + 3300
    return _CachedToken(access_token=creds.token, expires_at=expires_at)


def get_access_token(user_id: str) -> str:
    """Valid access token for user_id — cached, refreshed on expiry."""
    now = time.time()
    with _cache_lock:
        cached = _token_cache.get(user_id)
        if cached and cached.expires_at - _EXPIRY_SKEW_SECONDS > now:
            return cached.access_token

    doc = _fetch_credential_doc(user_id)
    refresh_token = _decrypt_refresh_token(doc, user_id)
    try:
        fresh = _exchange(refresh_token)
    finally:
        del refresh_token  # best-effort: don't keep plaintext around

    with _cache_lock:
        _token_cache[user_id] = fresh
    return fresh.access_token


def credentials_for_user(user_id: str) -> Credentials:
    """google.oauth2 Credentials carrying a valid access token only.

    Deliberately no refresh_token attached: refresh goes through our cache
    path so the plaintext token's lifetime stays as short as possible.
    """
    return Credentials(token=get_access_token(user_id))


def clear_token_cache(user_id: str | None = None) -> None:
    with _cache_lock:
        if user_id is None:
            _token_cache.clear()
        else:
            _token_cache.pop(user_id, None)
