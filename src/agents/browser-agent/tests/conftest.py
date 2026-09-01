"""Shared fixtures for app (classy-browser agent) unit tests.

Tests run without ADC/Firestore/KMS/obscura: heavy clients are patched out,
and only pure logic is exercised.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# Make the `app` agent package importable when pytest runs from browser-agent/.
BROWSER_AGENT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BROWSER_AGENT_DIR))

# Keep unit tests away from real GCP: no credentials, no network.
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "test-project")


class FakeFirestoreDoc:
    """Mimics the slice of firestore DocumentSnapshot we rely on."""

    def __init__(self, data: dict | None, exists: bool = True):
        self._data = data
        self.exists = exists

    def to_dict(self):
        return self._data


class FakeCollection:
    def __init__(self, store: dict, path: tuple[str, ...]):
        self._store = store
        self._path = path

    def document(self, doc_id: str):
        return FakeDocRef(self._store, self._path + (doc_id,))

    def collection(self, name: str):
        return FakeCollection(self._store, self._path + (name,))


class FakeDocRef:
    def __init__(self, store: dict, path: tuple[str, ...]):
        self._store = store
        self._path = path

    def get(self):
        node: dict = self._store
        for key in self._path:
            if not isinstance(node, dict) or key not in node:
                return FakeFirestoreDoc(None, exists=False)
            node = node[key]
        if not isinstance(node, dict):
            return FakeFirestoreDoc(None, exists=False)
        return FakeFirestoreDoc(dict(node), exists=True)

    def collection(self, name: str):
        # Firestore allows subcollections off a document ref.
        return FakeCollection(self._store, self._path + (name,))


class FakeFirestoreClient:
    """A tiny stand-in for firestore.Client covering our read pattern."""

    def __init__(self, store: dict):
        self._store = store

    def collection(self, name: str):
        return FakeCollection(self._store, (name,))


class FakeKMSClient:
    """Stands in for kms.KeyManagementServiceClient — records decrypt calls."""

    def __init__(self):
        self.decrypt_calls: list[dict] = []
        # Tests set this to (plaintext, aad_expected) or to raise.
        self.decrypt_result: bytes | Exception | None = None
        self.expected_aad: bytes | None = None

    def decrypt(self, request: dict):
        self.decrypt_calls.append(request)
        if self.expected_aad is not None:
            assert request.get("additional_authenticated_data") == (
                self.expected_aad
            ), "AAD mismatch on KMS decrypt"
        if isinstance(self.decrypt_result, Exception):
            raise self.decrypt_result

        class _Resp:
            plaintext = self.decrypt_result

        return _Resp()

    def crypto_key_path(self, project, location, keyring, key):
        return (
            f"projects/{project}/locations/{location}/keyRings/{keyring}"
            f"/cryptoKeys/{key}"
        )


@pytest.fixture
def fake_kms():
    return FakeKMSClient()


@pytest.fixture
def fake_firestore_store():
    """An empty in-memory Firestore 'database' dict."""
    return {}


@pytest.fixture
def patch_clients(fake_firestore_store, fake_kms, monkeypatch):
    """Point credentials.py at the fake Firestore + KMS clients."""
    from app import credentials

    monkeypatch.setattr(
        credentials,
        "_firestore_client",
        lambda: FakeFirestoreClient(fake_firestore_store),
    )
    monkeypatch.setattr(credentials, "_kms_client", lambda: fake_kms)
    return {"store": fake_firestore_store, "kms": fake_kms}
