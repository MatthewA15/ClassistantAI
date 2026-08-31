"""Tests for app.credentials (Firestore + KMS envelope decrypt).

All GCP clients are faked; the point is the *logic*: document paths, error
shapes, AAD binding, byte-for-byte decrypt steps per ENCRYPTION_CONTRACT.md,
and ttl_cache behaviour.
"""

from __future__ import annotations

import base64
import os

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app import credentials


# --------------------------------------------------------------------------
# Helpers to build a realistic envelope the same way the frontend would
# --------------------------------------------------------------------------

def make_envelope(password: str, aad: bytes):
    """Encrypt `password` exactly like the frontend does (contract #4/#5)."""
    dkey = os.urandom(32)
    iv = os.urandom(12)
    ciphertext = AESGCM(dkey).encrypt(iv, password.encode("utf-8"), None)
    # KMS plaintext = base64 TEXT of the raw dkey, utf-8 encoded (contract #5)
    kms_plaintext = base64.b64encode(dkey)  # bytes of the b64 text
    return dkey, {
        "encrypted_credential": base64.b64encode(ciphertext).decode(),
        "encrypted_dkey": base64.b64encode(kms_plaintext).decode(),
        "iv": base64.b64encode(iv).decode(),
    }, aad


def seed_user(store: dict, uid: str, username: str, password_doc: dict):
    store["users"] = store.get("users", {})
    store["users"][uid] = {"school_username": username}
    store["users"][uid]["credentials"] = {
        credentials.PASSWORD_CREDENTIAL_TYPE: password_doc
    }


# --------------------------------------------------------------------------
# Happy path
# --------------------------------------------------------------------------

def _seed_full_user(store: dict, uid: str, username: str, password: str):
    """Seed a user with a realistic envelope built from a fresh dkey."""
    dkey = os.urandom(32)
    iv = os.urandom(12)
    ciphertext = AESGCM(dkey).encrypt(iv, password.encode("utf-8"), None)
    doc = {
        "encrypted_credential": base64.b64encode(ciphertext).decode(),
        # KMS plaintext = base64 TEXT of the raw dkey, utf-8 (contract #5)
        "encrypted_dkey": base64.b64encode(base64.b64encode(dkey)).decode(),
        "iv": base64.b64encode(iv).decode(),
    }
    seed_user(store, uid, username, doc)
    return doc, dkey


async def test_decrypts_password_and_reads_username(patch_clients):
    store, kms = patch_clients["store"], patch_clients["kms"]
    uid = "uid-1"
    aad = uid.encode("utf-8")
    _, dkey = _seed_full_user(store, uid, "s1234567", "hunter2")
    kms.decrypt_result = base64.b64encode(dkey)  # KMS plaintext = b64 text

    creds = credentials.get_portal_credentials(uid)
    assert creds == {"username": "s1234567", "password": "hunter2"}
    assert len(kms.decrypt_calls) == 1
    call = kms.decrypt_calls[0]
    assert call["name"].endswith("cryptoKeys/classistant-password-key")
    assert call["additional_authenticated_data"] == aad
    credentials.clear_cache()


async def test_ttl_cache_avoids_second_decrypt(patch_clients):
    store, kms = patch_clients["store"], patch_clients["kms"]
    uid = "uid-2"
    _, dkey = _seed_full_user(store, uid, "user2", "pw2")
    kms.decrypt_result = base64.b64encode(dkey)

    first = credentials.get_portal_credentials(uid)
    second = credentials.get_portal_credentials(uid)
    assert first == second
    assert len(kms.decrypt_calls) == 1  # cached, no second KMS hit

    credentials.clear_cache()


async def test_aad_source_none_skips_aad(patch_clients, monkeypatch):
    store, kms = patch_clients["store"], patch_clients["kms"]
    monkeypatch.setenv("KMS_AAD_SOURCE", "none")
    uid = "uid-3"
    _, dkey = _seed_full_user(store, uid, "user3", "pw3")
    kms.decrypt_result = base64.b64encode(dkey)

    creds = credentials.get_portal_credentials(uid)
    assert creds["password"] == "pw3"
    assert "additional_authenticated_data" not in kms.decrypt_calls[0]
    credentials.clear_cache()


# --------------------------------------------------------------------------
# Error shapes (mirror connectors-api semantics)
# --------------------------------------------------------------------------

async def test_missing_user_doc_raises_not_found(patch_clients):
    import pytest

    with pytest.raises(credentials.CredentialNotFound):
        credentials.get_portal_credentials("ghost-uid")
    credentials.clear_cache()


async def test_missing_username_raises_not_found(patch_clients):
    import pytest

    store = patch_clients["store"]
    store["users"] = {"uid-4": {}}  # user exists, no school_username
    with pytest.raises(credentials.CredentialNotFound):
        credentials.get_portal_credentials("uid-4")
    credentials.clear_cache()


async def test_missing_credential_doc_raises_not_found(patch_clients):
    import pytest

    store = patch_clients["store"]
    store["users"] = {"uid-5": {"school_username": "u5"}}
    with pytest.raises(credentials.CredentialNotFound):
        credentials.get_portal_credentials("uid-5")
    credentials.clear_cache()


async def test_malformed_doc_raises_format_error(patch_clients):
    import pytest

    store = patch_clients["store"]
    store["users"] = {
        "uid-6": {
            "school_username": "u6",
            "credentials": {
                credentials.PASSWORD_CREDENTIAL_TYPE: {"iv": "AAAA"}
            },
        }
    }
    with pytest.raises(credentials.CredentialFormatError):
        credentials.get_portal_credentials("uid-6")
    credentials.clear_cache()


async def test_kms_decrypt_failure_raises_kms_error(patch_clients):
    import pytest

    store, kms = patch_clients["store"], patch_clients["kms"]
    uid = "uid-7"
    _, doc, _ = make_envelope("x", b"")
    seed_user(store, uid, "u7", doc)
    kms.decrypt_result = ValueError("kms permission denied")

    # KMS-side failures (IAM etc.) map to KmsDecryptError, distinct from a
    # malformed stored envelope (CredentialFormatError) — see the contract's
    # verification table.
    with pytest.raises(credentials.KmsDecryptError):
        credentials.get_portal_credentials(uid)
    credentials.clear_cache()


async def test_wrong_key_name_used(patch_clients):
    """KMS path must target classistant-password-key, not the refresh key."""
    store, kms = patch_clients["store"], patch_clients["kms"]
    uid = "uid-8"
    _, doc, _ = make_envelope("x", b"")
    seed_user(store, uid, "u8", doc)
    kms.decrypt_result = base64.b64encode(b"0" * 32)  # won't validate as dkey

    try:
        credentials.get_portal_credentials(uid)
    except Exception:
        pass
    assert "classistant-password-key" in kms.decrypt_calls[0]["name"]
    assert "classistant-key/" not in kms.decrypt_calls[0]["name"]
    credentials.clear_cache()


# --------------------------------------------------------------------------
# Debug env override (PORTAL_DEBUG_USERNAME / PORTAL_DEBUG_PASSWORD)
# --------------------------------------------------------------------------

async def test_debug_env_override_skips_firestore_and_kms(
    patch_clients, monkeypatch
):
    """Both env vars set -> returned for every user, no GCP touch at all."""
    monkeypatch.setenv("PORTAL_DEBUG_USERNAME", "debug-user")
    monkeypatch.setenv("PORTAL_DEBUG_PASSWORD", "debug-pass")

    for uid in ("uid-real-1", "ghost-uid"):
        creds = credentials.get_portal_credentials(uid)
        assert creds == {"username": "debug-user", "password": "debug-pass"}

    # Neither Firestore nor KMS was consulted, even for nonexistent users.
    assert not patch_clients["store"].get("users")
    assert patch_clients["kms"].decrypt_calls == []


async def test_debug_env_unset_uses_firestore_path(patch_clients, monkeypatch):
    """No env vars -> the production Firestore+KMS path is untouched."""
    monkeypatch.delenv("PORTAL_DEBUG_USERNAME", raising=False)
    monkeypatch.delenv("PORTAL_DEBUG_PASSWORD", raising=False)

    store, kms = patch_clients["store"], patch_clients["kms"]
    uid = "uid-11"
    _, dkey = _seed_full_user(store, uid, "u11", "pw11")
    kms.decrypt_result = base64.b64encode(dkey)

    creds = credentials.get_portal_credentials(uid)
    assert creds == {"username": "u11", "password": "pw11"}
    assert len(kms.decrypt_calls) == 1
    credentials.clear_cache()
