"""Unit tests for app/services/firestore_creds.py (issue #12, write path
restored). Firestore and KMS clients are mocked -- these tests never touch
GCP. Case (a) and the round-trip test still run real AES-256-GCM via
`cryptography` so the actual crypto path is exercised, not a stub.
"""
import base64
import logging
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


def _make_doc(refresh_token: str, dkey: bytes, user_id: str = "user-1") -> dict:
    """A well-formed user_credentials doc, encrypted the way store_refresh_token
    does: AES-256-GCM with a 12-byte IV, ciphertext||tag, all fields base64.
    """
    iv = b"0123456789ab"  # 12 bytes, as GCM requires
    ciphertext = AESGCM(dkey).encrypt(iv, refresh_token.encode("utf-8"), None)
    return {
        "user_id": user_id,
        "encrypted_credential": base64.b64encode(ciphertext).decode(),
        # Contents are irrelevant here -- KMS.decrypt() is mocked and never
        # actually unwraps this; only the KMS response plaintext matters.
        "encrypted_dkey": base64.b64encode(b"opaque-kms-wrapped-dkey").decode(),
        "iv": base64.b64encode(iv).decode(),
    }


def _mock_firestore(doc: dict | None):
    """Mock firestore.Client so
    .collection(...).where(...).where(...).limit(1).stream()
    returns either [snapshot] or [] (matches _query_credential_doc's chain).
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


def _passthrough_kms():
    """A KMS mock where encrypt/decrypt are simple identity pass-throughs
    (ciphertext == plaintext given), so a round trip through it genuinely
    exercises the AES-GCM layer without needing real KMS.
    """
    client = MagicMock()
    client.encrypt.side_effect = lambda request: MagicMock(ciphertext=request["plaintext"])
    client.decrypt.side_effect = lambda request: MagicMock(plaintext=request["ciphertext"])
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
        refresh_token = fc._decrypt_refresh_token(fetched)

    assert refresh_token == "real-refresh-token-value"
    firestore_client.collection.assert_called_once_with(fc.CREDENTIALS_COLLECTION)


def test_well_formed_document_also_accepts_raw_dkey_bytes_from_kms():
    """dkey encoding is unconfirmed (see TODO(matthew) in config.py) -- the
    module must also accept raw key bytes, not just base64 text of them.
    """
    dkey = AESGCM.generate_key(bit_length=256)
    doc = _make_doc("another-refresh-token", dkey)
    kms_plaintext = dkey  # raw bytes, not base64 text

    firestore_client = _mock_firestore(doc)
    kms_client = _mock_kms(kms_plaintext)

    with patch.object(fc, "_firestore_client", return_value=firestore_client), \
         patch.object(fc, "_kms_client", return_value=kms_client):
        fetched = fc._fetch_credential_doc("user-1")
        refresh_token = fc._decrypt_refresh_token(fetched)

    assert refresh_token == "another-refresh-token"


# --------------------------------------------------------------------------
# Round trip: _encrypt_envelope (write path) -> _decrypt_refresh_token (read
# path), through a pass-through KMS mock. The single most valuable test
# here -- proves the two halves are genuinely mirror images, not just
# individually plausible.
# --------------------------------------------------------------------------

@pytest.mark.parametrize("aad_source", ["none", "iv", "user_id"])
def test_encrypt_then_decrypt_round_trip_preserves_refresh_token(aad_source, monkeypatch):
    monkeypatch.setattr(fc.settings, "kms_aad_source", aad_source)
    kms_client = _passthrough_kms()

    with patch.object(fc, "_kms_client", return_value=kms_client):
        envelope = fc._encrypt_envelope("super-secret-refresh-token", "uid-123")
        doc = {"user_id": "uid-123", **envelope}
        recovered = fc._decrypt_refresh_token(doc)

    assert recovered == "super-secret-refresh-token"


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
            fc._decrypt_refresh_token(fetched)


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
    doc = _make_doc("refresh-token-y", dkey, user_id="user-2")
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


# --------------------------------------------------------------------------
# Write path: store_refresh_token writes all required fields, base64-encoded
# --------------------------------------------------------------------------

def _mock_doc_ref(exists: bool):
    doc_ref = MagicMock()
    doc_ref.get.return_value = MagicMock(exists=exists)
    firestore_client = MagicMock()
    firestore_client.collection.return_value.document.return_value = doc_ref
    return firestore_client, doc_ref


def test_store_refresh_token_writes_all_required_fields_base64_encoded():
    firestore_client, doc_ref = _mock_doc_ref(exists=False)
    kms_client = _passthrough_kms()

    with patch.object(fc, "_firestore_client", return_value=firestore_client), \
         patch.object(fc, "_kms_client", return_value=kms_client):
        fc.store_refresh_token(uid="uid-1", google_sub="sub-1", refresh_token="rt-value")

    firestore_client.collection.assert_called_once_with(fc.CREDENTIALS_COLLECTION)
    firestore_client.collection.return_value.document.assert_called_once_with(
        "uid-1_google_refresh_token"
    )
    doc_ref.set.assert_called_once()
    data, kwargs = doc_ref.set.call_args[0][0], doc_ref.set.call_args[1]

    assert kwargs.get("merge") is True
    assert data["user_id"] == "uid-1"
    assert data["google_sub"] == "sub-1"
    assert data["credential_type"] == fc.REFRESH_TOKEN_TYPE
    assert "created_at" in data  # new doc
    assert "updated_at" in data
    for field in ("encrypted_credential", "encrypted_dkey", "iv"):
        assert isinstance(data[field], str)
        base64.b64decode(data[field], validate=True)  # raises if not valid base64


def test_store_refresh_token_does_not_restamp_created_at_on_existing_doc():
    firestore_client, doc_ref = _mock_doc_ref(exists=True)
    kms_client = _passthrough_kms()

    with patch.object(fc, "_firestore_client", return_value=firestore_client), \
         patch.object(fc, "_kms_client", return_value=kms_client):
        fc.store_refresh_token(uid="uid-1", google_sub="sub-1", refresh_token="rt-value")

    data = doc_ref.set.call_args[0][0]
    assert "created_at" not in data
    assert "updated_at" in data


def test_store_refresh_token_round_trips_through_decrypt():
    """The write path's own output, read back by the read path -- via
    Firestore/KMS mocks wired together rather than calling the crypto
    helpers directly.
    """
    firestore_client, doc_ref = _mock_doc_ref(exists=False)
    kms_client = _passthrough_kms()

    with patch.object(fc, "_firestore_client", return_value=firestore_client), \
         patch.object(fc, "_kms_client", return_value=kms_client):
        fc.store_refresh_token(uid="uid-1", google_sub="sub-1", refresh_token="rt-value")
        written = doc_ref.set.call_args[0][0]
        recovered = fc._decrypt_refresh_token(written)

    assert recovered == "rt-value"


# --------------------------------------------------------------------------
# Read-path ID tolerance: falls back to google_sub when user_id misses
# (transitional -- see TODO(matthew) on _fetch_credential_doc). The write
# path is deliberately NOT covered by this fallback; it always keys on uid.
# --------------------------------------------------------------------------

def test_read_falls_back_to_google_sub_when_user_id_misses(caplog):
    doc = {
        "user_id": "uid-999",
        "google_sub": "sub-999",
        "credential_type": fc.REFRESH_TOKEN_TYPE,
        "encrypted_credential": "AAAA",
        "encrypted_dkey": "BBBB",
        "iv": "CCCC",
    }

    def fake_query(field, value):
        if field == "user_id":
            return None
        assert field == "google_sub"
        assert value == "uid-999"
        return doc

    with patch.object(fc, "_query_credential_doc", side_effect=fake_query):
        with caplog.at_level(logging.INFO, logger=fc.__name__):
            result = fc._fetch_credential_doc("uid-999")

    assert result == doc
    assert "google_sub" in caplog.text


def test_read_does_not_fall_back_when_user_id_matches():
    doc = {
        "user_id": "uid-1",
        "encrypted_credential": "AAAA",
        "encrypted_dkey": "BBBB",
        "iv": "CCCC",
    }

    with patch.object(fc, "_query_credential_doc", side_effect=lambda field, value: doc if field == "user_id" else None):
        result = fc._fetch_credential_doc("uid-1")

    assert result == doc
