"""Unit tests for app/services/firestore_creds.py (issue #12).

Firestore and KMS clients are mocked -- these tests never touch GCP. Case
(a) still runs a real AES-256-GCM encrypt/decrypt round trip via
`cryptography` so the actual decrypt path is exercised, not just a stub.
"""
import base64
import time
from unittest.mock import MagicMock, patch

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.services import firestore_creds as fc


@pytest.fixture(autouse=True)
def _clear_token_cache():
    """Isolate tests from firestore_creds' module-level access-token cache."""
    fc.clear_token_cache()
    yield
    fc.clear_token_cache()


def _make_doc(refresh_token: str, dkey: bytes) -> dict:
    """A well-formed user_credentials doc, encrypted the way the frontend does:
    AES-256-GCM with a 12-byte IV, ciphertext||tag, all fields base64.
    """
    iv = b"0123456789ab"  # 12 bytes, as GCM requires
    ciphertext = AESGCM(dkey).encrypt(iv, refresh_token.encode("utf-8"), None)
    return {
        "encrypted_credential": base64.b64encode(ciphertext).decode(),
        # Contents are irrelevant here -- KMS.decrypt() is mocked and never
        # actually unwraps this; only the KMS response plaintext matters.
        "encrypted_dkey": base64.b64encode(b"opaque-kms-wrapped-dkey").decode(),
        "iv": base64.b64encode(iv).decode(),
    }


def _mock_firestore(doc: dict | None):
    """Mock firestore.Client so
    .collection(...).where(...).where(...).limit(1).stream()
    returns either [snapshot] or [] (matches _fetch_credential_doc's chain).
    """
    client = MagicMock()
    query = client.collection.return_value.where.return_value.where.return_value.limit.return_value
    if doc is None:
        query.stream.return_value = []
    else:
        snapshot = MagicMock()
        snapshot.to_dict.return_value = doc
        query.stream.return_value = [snapshot]
    return client


def _mock_kms(plaintext: bytes):
    client = MagicMock()
    client.decrypt.return_value = MagicMock(plaintext=plaintext)
    return client


# --------------------------------------------------------------------------
# (a) well-formed document decrypts to the expected refresh token
# --------------------------------------------------------------------------

def test_well_formed_document_decrypts_to_expected_refresh_token():
    dkey = AESGCM.generate_key(bit_length=256)
    doc = _make_doc("real-refresh-token-value", dkey)
    # Spec: KMS plaintext is the base64 *text* of the raw dkey.
    kms_plaintext = base64.b64encode(dkey)

    firestore_client = _mock_firestore(doc)
    kms_client = _mock_kms(kms_plaintext)

    with patch.object(fc, "_firestore_client", return_value=firestore_client), \
         patch.object(fc, "_kms_client", return_value=kms_client):
        fetched = fc._fetch_credential_doc("user-1")
        refresh_token = fc._decrypt_refresh_token(fetched, "user-1")

    assert refresh_token == "real-refresh-token-value"
    firestore_client.collection.assert_called_once_with(fc.CREDENTIALS_COLLECTION)


def test_well_formed_document_also_accepts_raw_dkey_bytes_from_kms():
    """dkey encoding is unconfirmed (see TODO(matthew) in config.py) -- the
    module must also accept the frontend storing raw key bytes, not just
    base64 text of them.
    """
    dkey = AESGCM.generate_key(bit_length=256)
    doc = _make_doc("another-refresh-token", dkey)
    kms_plaintext = dkey  # raw bytes, not base64 text

    firestore_client = _mock_firestore(doc)
    kms_client = _mock_kms(kms_plaintext)

    with patch.object(fc, "_firestore_client", return_value=firestore_client), \
         patch.object(fc, "_kms_client", return_value=kms_client):
        fetched = fc._fetch_credential_doc("user-1")
        refresh_token = fc._decrypt_refresh_token(fetched, "user-1")

    assert refresh_token == "another-refresh-token"


# --------------------------------------------------------------------------
# (b) missing document raises CredentialNotFound
# --------------------------------------------------------------------------

def test_missing_document_raises_credential_not_found():
    firestore_client = _mock_firestore(None)

    with patch.object(fc, "_firestore_client", return_value=firestore_client):
        with pytest.raises(fc.CredentialNotFound):
            fc._fetch_credential_doc("no-such-user")


def test_missing_document_surfaces_through_get_access_token():
    firestore_client = _mock_firestore(None)

    with patch.object(fc, "_firestore_client", return_value=firestore_client):
        with pytest.raises(fc.CredentialNotFound):
            fc.get_access_token("no-such-user")


# --------------------------------------------------------------------------
# (c) malformed base64 field raises CredentialFormatError
# --------------------------------------------------------------------------

def test_malformed_base64_field_raises_credential_format_error():
    dkey = AESGCM.generate_key(bit_length=256)
    doc = _make_doc("token", dkey)
    doc["iv"] = "not-valid-base64!!!"  # bad padding -> base64.b64decode raises

    firestore_client = _mock_firestore(doc)
    kms_client = _mock_kms(base64.b64encode(dkey))

    with patch.object(fc, "_firestore_client", return_value=firestore_client), \
         patch.object(fc, "_kms_client", return_value=kms_client):
        fetched = fc._fetch_credential_doc("user-1")
        with pytest.raises(fc.CredentialFormatError):
            fc._decrypt_refresh_token(fetched, "user-1")


def test_missing_required_field_raises_credential_format_error():
    doc = _make_doc("token", AESGCM.generate_key(bit_length=256))
    del doc["encrypted_dkey"]

    firestore_client = _mock_firestore(doc)

    with patch.object(fc, "_firestore_client", return_value=firestore_client):
        with pytest.raises(fc.CredentialFormatError):
            fc._fetch_credential_doc("user-1")


# --------------------------------------------------------------------------
# (d) cached access token returned on second call, no re-query
# --------------------------------------------------------------------------

def test_cached_access_token_returned_without_requerying_firestore():
    dkey = AESGCM.generate_key(bit_length=256)
    doc = _make_doc("refresh-token-x", dkey)
    firestore_client = _mock_firestore(doc)
    kms_client = _mock_kms(base64.b64encode(dkey))
    fresh = fc._CachedToken(access_token="access-token-1", expires_at=time.time() + 3600)

    with patch.object(fc, "_firestore_client", return_value=firestore_client), \
         patch.object(fc, "_kms_client", return_value=kms_client), \
         patch.object(fc, "_exchange", return_value=fresh) as mock_exchange:
        token1 = fc.get_access_token("user-1")
        token2 = fc.get_access_token("user-1")

    assert token1 == token2 == "access-token-1"
    mock_exchange.assert_called_once()
    firestore_client.collection.assert_called_once()


# --------------------------------------------------------------------------
# (e) expired cached token triggers a re-fetch
# --------------------------------------------------------------------------

def test_expired_cached_token_triggers_refetch():
    dkey = AESGCM.generate_key(bit_length=256)
    doc = _make_doc("refresh-token-y", dkey)
    firestore_client = _mock_firestore(doc)
    kms_client = _mock_kms(base64.b64encode(dkey))

    fc._token_cache["user-2"] = fc._CachedToken(
        access_token="stale-token", expires_at=time.time() - 10
    )
    fresh = fc._CachedToken(access_token="fresh-token", expires_at=time.time() + 3600)

    with patch.object(fc, "_firestore_client", return_value=firestore_client), \
         patch.object(fc, "_kms_client", return_value=kms_client), \
         patch.object(fc, "_exchange", return_value=fresh) as mock_exchange:
        token = fc.get_access_token("user-2")

    assert token == "fresh-token"
    mock_exchange.assert_called_once()
    firestore_client.collection.assert_called_once()
