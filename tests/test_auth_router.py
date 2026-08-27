"""Tests for GET /auth/callback (app/auth/router.py).

The code exchange itself (Flow.fetch_token, id_token verification) hits
Google over the network, so these tests mock _flow() and id_token
verification rather than calling them for real. The write path
(store_refresh_token) is unit-tested directly in test_firestore_creds.py --
here we only need it mocked so a happy-path response is reachable, plus the
two failure cases that must never get that far.
"""
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_callback_missing_uid_returns_400():
    # No uid at all -> should 400 before ever touching _flow()/Google.
    resp = client.get("/auth/callback", params={"code": "abc123"})
    assert resp.status_code == 400
    assert "uid" in resp.json()["detail"].lower()


def test_callback_missing_code_returns_400():
    resp = client.get("/auth/callback", params={"uid": "uid-1"})
    assert resp.status_code == 400
    assert "code" in resp.json()["detail"].lower()


def test_callback_error_param_returns_400():
    resp = client.get("/auth/callback", params={"error": "access_denied"})
    assert resp.status_code == 400


def test_callback_no_refresh_token_returns_500():
    fake_creds = MagicMock(id_token="fake-id-token", refresh_token=None)
    fake_flow = MagicMock()
    fake_flow.credentials = fake_creds

    with patch("app.auth.router._flow", return_value=fake_flow), \
         patch(
             "app.auth.router.gid.verify_oauth2_token",
             return_value={"sub": "google-sub-1", "email": "student@school.edu"},
         ), \
         patch("app.auth.router.firestore_creds.store_refresh_token") as store:
        resp = client.get("/auth/callback", params={"code": "abc123", "uid": "uid-1"})

    assert resp.status_code == 500
    store.assert_not_called()


def test_callback_success_writes_credential_and_returns_frozen_shape():
    fake_creds = MagicMock(id_token="fake-id-token", refresh_token="a-refresh-token")
    fake_flow = MagicMock()
    fake_flow.credentials = fake_creds

    with patch("app.auth.router._flow", return_value=fake_flow), \
         patch(
             "app.auth.router.gid.verify_oauth2_token",
             return_value={"sub": "google-sub-1", "email": "student@school.edu"},
         ), \
         patch("app.auth.router.firestore_creds.store_refresh_token") as store:
        resp = client.get("/auth/callback", params={"code": "abc123", "uid": "uid-1"})

    assert resp.status_code == 200
    body = resp.json()
    # Frozen shape (API_CONTRACT.md) -- frontend reads user_id/email/status.
    assert body["user_id"] == "google-sub-1"
    assert body["email"] == "student@school.edu"
    assert body["status"] == "connected"
    assert body["firebase_uid"] == "uid-1"  # additive, not a replacement

    store.assert_called_once_with(
        uid="uid-1", google_sub="google-sub-1", refresh_token="a-refresh-token"
    )
