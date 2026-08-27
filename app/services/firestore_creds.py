"""Firestore + KMS envelope encryption for the google_refresh_token credential
(issue #12; write path restored -- see docs/adr/0004 amendment).

This service performs BOTH halves of the envelope now: /auth/callback
(app/auth/router.py) is the only thing holding the OAuth client secret, so
it's also the only thing that can produce a refresh token to encrypt. Read
and write flows:

  Write (store_refresh_token, called from /auth/callback):
    1. dkey, iv  <- os.urandom(32), os.urandom(12)
    2. encrypted_credential <- AES-256-GCM.encrypt(refresh_token, dkey, iv)
    3. encrypted_dkey       <- KMS.encrypt(base64_text(dkey))  [connector SA: encrypter]
    4. Firestore doc write, keyed on the Firebase UID (never google_sub)

  Read (get_access_token, called from google_creds.py per request):
    1. Query `user_credentials` for (user_id, credential_type="google_refresh_token")
    2. dkey        <- KMS.decrypt(encrypted_dkey)          [connector SA: decrypter]
    3. refresh_tok <- AES-256-GCM.decrypt(encrypted_credential, dkey, iv)
    4. access_tok  <- OAuth token endpoint (refresh_token grant, needs client_id+secret)
    5. Cache access token per user until expiry; then repeat from step 1.

_encrypt_envelope / _decrypt_refresh_token (+ _unwrap_dkey) and _aad_for are
deliberately mirror images of each other -- see the comments on each for how
that's kept true structurally, not just by convention.

Notes:
  - user_id == Firebase UID (this is what the agent sends us). See the
    TODO(matthew) on _fetch_credential_doc for a transitional exception.
  - One-to-many: each user has up to two docs in `user_credentials`;
    we filter by credential_type. We NEVER query "school_password" —
    our SA must not even have decrypt (or encrypt) rights on that key,
    by design (see docs/adr/0004).

Still to confirm with the team (see TODO(matthew) comments in app/config.py
and docs/MIGRATION.md):
  - KMS location for classistant-keyring/classistant-key  -> kms_location
  - Whether frontend passes AAD on the KMS encrypt        -> kms_aad_source
"""

import base64
import logging
import os
import threading
import time
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.cloud import firestore, kms
from google.cloud.firestore_v1.base_query import FieldFilter
from google.oauth2.credentials import Credentials

from app.config import settings

logger = logging.getLogger(__name__)

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

def _query_credential_doc(field: str, value: str) -> dict | None:
    query = (
        _firestore_client()
        .collection(CREDENTIALS_COLLECTION)
        .where(filter=FieldFilter(field, "==", value))
        .where(filter=FieldFilter("credential_type", "==", REFRESH_TOKEN_TYPE))
        .limit(1)
    )
    docs = list(query.stream())
    return docs[0].to_dict() if docs else None


def _fetch_credential_doc(user_id: str) -> dict:
    doc = _query_credential_doc("user_id", user_id)
    matched_field = "user_id"

    if doc is None:
        # TODO(matthew): transitional ID tolerance -- unresolved contradiction
        # between the frontend's lib/users.ts (which addresses this service's
        # /users/{user_id}/... endpoints by the Google `sub`, stored on the
        # user doc as google_sub) and the team's verbal agreement that
        # user_id means the Firebase UID, which is what this module and the
        # write path (store_refresh_token) were built against. Until the
        # team picks one identifier, fall back to a google_sub lookup before
        # giving up. Remove this fallback once that's settled. The WRITE
        # path is deliberately NOT tolerant -- it only ever keys on the
        # Firebase UID.
        doc = _query_credential_doc("google_sub", user_id)
        matched_field = "google_sub"

    if doc is None:
        raise CredentialNotFound(
            f"No {REFRESH_TOKEN_TYPE} credential for user_id={user_id!r} "
            "(checked both user_id and google_sub). Has the user completed "
            "Google onboarding?"
        )

    if matched_field == "google_sub":
        logger.info(
            "user_credentials lookup for %r matched on google_sub, not "
            "user_id (transitional ID tolerance -- see TODO(matthew) in "
            "firestore_creds.py)",
            user_id,
        )

    missing = [
        f for f in ("user_id", "encrypted_credential", "encrypted_dkey", "iv")
        if not doc.get(f)
    ]
    if missing:
        raise CredentialFormatError(
            f"user_credentials doc for {user_id!r} is missing fields: {missing}. "
            "The frontend may still be writing the legacy secret_name shape."
        )
    return doc


# --------------------------------------------------------------------------
# Shared by both encrypt (store_refresh_token) and decrypt (_unwrap_dkey) —
# same function, not two copies, so they cannot drift apart.
# --------------------------------------------------------------------------

def _aad_for(iv_b64: str, uid: str) -> bytes | None:
    """AAD must byte-match between the KMS encrypt call that wrapped a dkey
    and the decrypt call that unwraps it, or KMS fails closed.

    `uid` must always be the canonical Firebase UID -- on the read side that
    means doc["user_id"], NEVER whatever value a query happened to match on
    (the google_sub fallback above must not change what AAD is expected, or
    decrypt would fail for exactly the users that fallback exists to help).

    settings.kms_aad_source: "none" (default until confirmed) | "iv" | "user_id"
    """
    source = settings.kms_aad_source
    if source == "iv":
        return iv_b64.encode("utf-8")
    if source == "user_id":
        return uid.encode("utf-8")
    return None


def _b64(value: str, field: str) -> bytes:
    try:
        return base64.b64decode(value)
    except Exception as exc:  # noqa: BLE001
        raise CredentialFormatError(f"Field {field!r} is not valid base64.") from exc


# --------------------------------------------------------------------------
# Step 2 — unwrap dkey via KMS
# --------------------------------------------------------------------------

def _unwrap_dkey(doc: dict) -> bytes:
    response = _kms_client().decrypt(
        request={
            "name": _kms_key_name(),
            "ciphertext": _b64(doc["encrypted_dkey"], "encrypted_dkey"),
            **(
                {"additional_authenticated_data": aad}
                if (aad := _aad_for(doc["iv"], doc["user_id"]))
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
        f"bytes (got {len(plaintext)} bytes). This service writes this field "
        "itself now (see store_refresh_token/_encrypt_envelope) -- a mismatch "
        "here means the read and write paths have drifted, not a frontend bug."
    )


# --------------------------------------------------------------------------
# Step 3 — decrypt the refresh token
# --------------------------------------------------------------------------

def _decrypt_refresh_token(doc: dict) -> str:
    dkey = _unwrap_dkey(doc)
    iv = _b64(doc["iv"], "iv")
    ciphertext = _b64(doc["encrypted_credential"], "encrypted_credential")
    try:
        return AESGCM(dkey).decrypt(iv, ciphertext, None).decode("utf-8")
    except Exception as exc:  # noqa: BLE001
        raise CredentialFormatError(
            "AES-GCM decrypt of encrypted_credential failed. Usual causes: "
            "IV byte-encoding mismatch, tag not appended to ciphertext, or a "
            "dkey encoding mismatch between _encrypt_envelope and here -- see "
            "the round-trip test in tests/test_firestore_creds.py."
        ) from exc


# --------------------------------------------------------------------------
# Write path — envelope-encrypt a refresh token and store it
# (app/auth/router.py calls this; it's the only thing that ever produces a
# refresh token to encrypt, since it's the only thing holding the OAuth
# client secret needed to get one out of Google in the first place.)
# --------------------------------------------------------------------------

def _encrypt_envelope(refresh_token: str, uid: str) -> dict:
    """Mirror image of _unwrap_dkey + _decrypt_refresh_token: produces
    exactly the three base64 fields those functions read back, using the
    same _aad_for() so encrypt and decrypt can never disagree about what
    they authenticated.
    """
    iv = os.urandom(12)  # 96-bit GCM IV, the standard/recommended size
    dkey = os.urandom(32)  # AES-256
    iv_b64 = base64.b64encode(iv).decode("utf-8")

    # AESGCM.encrypt() appends the tag to the ciphertext -- exactly the
    # ciphertext||tag shape _decrypt_refresh_token expects.
    ciphertext = AESGCM(dkey).encrypt(iv, refresh_token.encode("utf-8"), None)

    # Spec (issue #12): the plaintext sent to KMS is the base64 *text* of the
    # raw key bytes -- the mirror of _unwrap_dkey's first (preferred) decode
    # branch.
    kms_request = {
        "name": _kms_key_name(),
        "plaintext": base64.b64encode(dkey),
    }
    if aad := _aad_for(iv_b64, uid):
        kms_request["additional_authenticated_data"] = aad
    wrapped = _kms_client().encrypt(request=kms_request)

    return {
        "encrypted_credential": base64.b64encode(ciphertext).decode("utf-8"),
        "encrypted_dkey": base64.b64encode(wrapped.ciphertext).decode("utf-8"),
        "iv": iv_b64,
    }


def store_refresh_token(uid: str, google_sub: str, refresh_token: str) -> None:
    """Envelope-encrypts refresh_token and writes it to `user_credentials`,
    in exactly the shape _fetch_credential_doc / _decrypt_refresh_token read
    back. Deterministic doc id so re-onboarding updates rather than
    duplicates; created_at is stamped only the first time.

    Always keyed on the Firebase UID -- unlike the read path (see the
    TODO(matthew) on _fetch_credential_doc), the write side has exactly one
    identifier and is never tolerant of google_sub.
    """
    envelope = _encrypt_envelope(refresh_token, uid)
    doc_ref = (
        _firestore_client()
        .collection(CREDENTIALS_COLLECTION)
        .document(f"{uid}_{REFRESH_TOKEN_TYPE}")
    )
    is_new = not doc_ref.get().exists

    data = {
        "user_id": uid,
        "google_sub": google_sub,
        "credential_type": REFRESH_TOKEN_TYPE,
        "updated_at": firestore.SERVER_TIMESTAMP,
        **envelope,
    }
    if is_new:
        data["created_at"] = firestore.SERVER_TIMESTAMP
    doc_ref.set(data, merge=True)

    # A fresh refresh token invalidates any cached access token from a prior
    # connection for this user -- don't serve a stale one after re-onboarding.
    clear_token_cache(uid)


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
    refresh_token = _decrypt_refresh_token(doc)
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
