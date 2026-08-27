"""Credential retrieval via Firestore + KMS envelope encryption (issue #12).

Replaces the Secret Manager module entirely (docs/adr/0004). Flow:

  1. Query `user_credentials` for (user_id, credential_type="google_refresh_token")
  2. dkey        <- KMS.decrypt(encrypted_dkey)          [connector SA: decrypter only]
  3. refresh_tok <- AES-256-GCM.decrypt(encrypted_credential, dkey, iv)
  4. access_tok  <- OAuth token endpoint (refresh_token grant, needs client_id+secret)
  5. Cache access token per user until expiry; then repeat from step 1.

Notes:
  - user_id == Firebase UID (this is what the agent sends us).
  - One-to-many: each user has up to two docs in `user_credentials`;
    we filter by credential_type. We NEVER query "school_password" —
    our SA must not even have decrypt rights on that key, by design
    (see docs/adr/0004).

Still to confirm with the team (see TODO(matthew) comments in app/config.py
and docs/MIGRATION.md):
  - KMS location for classistant-keyring/classistant-key  -> kms_location
  - Whether frontend passes AAD on the KMS encrypt        -> kms_aad_source
"""

import base64
import threading
import time
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.cloud import firestore, kms
from google.cloud.firestore_v1.base_query import FieldFilter
from google.oauth2.credentials import Credentials

from app.config import settings

GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
CREDENTIALS_COLLECTION = "user_credentials"
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
        settings.kms_location,       # confirm with Obalua ("global" vs a region)
        settings.kms_keyring,        # classistant-keyring
        settings.kms_key,            # classistant-key (refresh-token key post-split)
    )


# --------------------------------------------------------------------------
# Step 1 — fetch the credential document
# --------------------------------------------------------------------------

def _fetch_credential_doc(user_id: str) -> dict:
    query = (
        _firestore_client()
        .collection(CREDENTIALS_COLLECTION)
        .where(filter=FieldFilter("user_id", "==", user_id))
        .where(filter=FieldFilter("credential_type", "==", REFRESH_TOKEN_TYPE))
        .limit(1)
    )
    docs = list(query.stream())
    if not docs:
        raise CredentialNotFound(
            f"No {REFRESH_TOKEN_TYPE} credential for user_id={user_id!r}. "
            "Has the user completed Google onboarding?"
        )
    doc = docs[0].to_dict()

    missing = [f for f in ("encrypted_credential", "encrypted_dkey", "iv") if not doc.get(f)]
    if missing:
        raise CredentialFormatError(
            f"user_credentials doc for {user_id!r} is missing fields: {missing}. "
            "The frontend may still be writing the legacy secret_name shape."
        )
    return doc


# --------------------------------------------------------------------------
# Step 2 — unwrap dkey via KMS
# --------------------------------------------------------------------------

def _aad_for(doc: dict, user_id: str) -> bytes | None:
    """AAD must byte-match whatever the frontend passed at encrypt time.

    settings.kms_aad_source: "none" (default until confirmed) | "iv" | "user_id"
    """
    source = settings.kms_aad_source
    if source == "iv":
        return doc["iv"].encode("utf-8")
    if source == "user_id":
        return user_id.encode("utf-8")
    return None


def _b64(value: str, field: str) -> bytes:
    try:
        return base64.b64decode(value)
    except Exception as exc:  # noqa: BLE001
        raise CredentialFormatError(f"Field {field!r} is not valid base64.") from exc


def _unwrap_dkey(doc: dict, user_id: str) -> bytes:
    response = _kms_client().decrypt(
        request={
            "name": _kms_key_name(),
            "ciphertext": _b64(doc["encrypted_dkey"], "encrypted_dkey"),
            **(
                {"additional_authenticated_data": aad}
                if (aad := _aad_for(doc, user_id))
                else {}
            ),
        }
    )
    plaintext = response.plaintext

    # Spec says the KMS plaintext is the base64 *text* of the raw key
    # ("decode it to utf8 from base64"). Accept that, but also tolerate the
    # frontend storing raw key bytes directly — fail loudly on anything else.
    try:
        decoded = base64.b64decode(plaintext.decode("utf-8"), validate=True)
        if len(decoded) in (16, 24, 32):
            return decoded
    except Exception:  # noqa: BLE001
        pass
    if len(plaintext) in (16, 24, 32):
        return plaintext
    raise CredentialFormatError(
        "Unwrapped dkey is neither base64 text of an AES key nor raw AES key "
        f"bytes (got {len(plaintext)} bytes). Sync the dkey encoding with the "
        "frontend's encrypt code before proceeding."
    )


# --------------------------------------------------------------------------
# Step 3 — decrypt the refresh token
# --------------------------------------------------------------------------

def _decrypt_refresh_token(doc: dict, user_id: str) -> str:
    dkey = _unwrap_dkey(doc, user_id)
    iv = _b64(doc["iv"], "iv")
    # WebCrypto's AES-GCM output is ciphertext||tag — exactly what AESGCM expects.
    ciphertext = _b64(doc["encrypted_credential"], "encrypted_credential")
    try:
        return AESGCM(dkey).decrypt(iv, ciphertext, None).decode("utf-8")
    except Exception as exc:  # noqa: BLE001
        raise CredentialFormatError(
            "AES-GCM decrypt of encrypted_credential failed. Usual causes: "
            "IV byte-encoding mismatch, tag not appended to ciphertext, or a "
            "dkey encoding mismatch. Compare against the frontend's encrypt code."
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
        client_id=settings.google_client_id,        # must be the SAME client
        client_secret=settings.google_client_secret,  # that issued the token (Richard's)
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
