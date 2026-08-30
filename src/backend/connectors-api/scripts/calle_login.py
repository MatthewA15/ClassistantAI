#!/usr/bin/env python3
"""Mint or rotate the CALL-E service access token via a brokered browser login.

Purpose
-------
CALL-E authenticates this service with ONE service-level bearer token -- the
same kind of thing as GOOGLE_CLIENT_SECRET, and not a per-user credential. It
is never written to Firestore and never wrapped by KMS:
docs/ENCRYPTION_CONTRACT.md governs per-user credentials, and there is no
per-user CALL-E credential.

The token EXPIRES, which is why this script exists. When
app/services/calle_mcp.py raises CalleAuthError -- CALL-E answered 401 or 403
-- that always means "an operator must run this", never "the student did
something wrong".

Lives in scripts/, deliberately outside app/: minting a token is an operator
action, not a service capability. Nothing here is imported at runtime, and
nothing here touches Firestore, KMS, or any Google API.

Usage
-----
Run from the service root, src/backend/connectors-api/.

    python scripts/calle_login.py

A browser opens for the CALL-E login. On success this prints the token, the
.env line, and the one-line gcloud command that rotates it on Cloud Run. It
prints that command; it never runs it.

    python scripts/calle_login.py --no-browser   # print the url, don't open

Requires
--------
    A CALL-E account that can authorize this integration, and a browser.
    No GCP credentials of any kind.
"""

import argparse
import sys
import time
import webbrowser

import httpx

CALLE_BASE_URL = "https://seleven-mcp-sg.airudder.com"
CALLE_CHANNEL = "openagent_oauth"
SESSIONS_PATH = "/api/v1/openagent-auth/sessions"
SESSION_SECRET_HEADER = "X-OpenAgent-Session-Secret"
INTEGRATION_HEADER = "X-Call-E-Integration"

# Must stay in step with app/services/calle_mcp.py's CLIENT_NAME/CLIENT_VERSION.
CLIENT_NAME = "classistant-connectors"
CLIENT_VERSION = "0.1.0"
SCOPE = "openid email profile"

AUTHORIZED = "AUTHORIZED"
# EXCHANGED is terminal too: it means this session's token was already
# claimed, so polling it further can never succeed.
TERMINAL_STATES = ("FAILED", "EXPIRED", "EXCHANGED")

POLL_TIMEOUT_SECONDS = 300
DEFAULT_POLL_SECONDS = 2.0
MIN_POLL_SECONDS = 0.5           # a bad poll_after_ms must not spin the CPU
MAX_POLL_SECONDS = 10.0          # ...nor stall the operator watching it
REQUEST_TIMEOUT_SECONDS = 30

CLOUD_RUN_SERVICE = "classistant-connectors"
CLOUD_RUN_REGION = "us-central1"


def _headers(extra: dict | None = None) -> dict:
    headers = {INTEGRATION_HEADER: f"{CLIENT_NAME}/{CLIENT_VERSION}"}
    if extra:
        headers.update(extra)
    return headers


def _fail_on_error(response: httpx.Response, what: str) -> dict:
    """Every HTTP hop here fails the same way: prose, no traceback."""
    if response.status_code >= 400:
        sys.exit(f"{what} failed (HTTP {response.status_code}): {response.text[:300]}")
    try:
        return response.json()
    except ValueError:
        sys.exit(f"{what} returned a body that isn't JSON: {response.text[:300]}")


def _poll_delay(body: dict, current: float) -> float:
    """`poll_after_ms` from the server, clamped to something sane."""
    raw = body.get("poll_after_ms")
    if not isinstance(raw, (int, float)) or raw <= 0:
        return current
    return max(MIN_POLL_SECONDS, min(MAX_POLL_SECONDS, raw / 1000))


def create_session(client: httpx.Client, base_url: str, channel: str) -> dict:
    """Start the brokered login: session_id, session_secret, login_url."""
    body = _fail_on_error(
        client.post(
            f"{base_url}{SESSIONS_PATH}",
            json={
                "server_url": f"{base_url}/mcp/{channel}",
                "auth_base_url": base_url,
                "channel": channel,
                "scope": SCOPE,
                "client_name": CLIENT_NAME,
            },
            headers=_headers(),
        ),
        "Starting a CALL-E login session",
    )
    missing = [
        key
        for key in ("session_id", "session_secret", "login_url")
        if not body.get(key)
    ]
    if missing:
        sys.exit(f"CALL-E's session response is missing: {', '.join(missing)}")
    return body


def wait_for_authorization(
    client: httpx.Client,
    base_url: str,
    session_id: str,
    secret: str,
    timeout: int,
    delay: float,
) -> None:
    """Poll the session until the operator authorizes it in the browser."""
    deadline = time.monotonic() + timeout
    state = "PENDING"
    while time.monotonic() < deadline:
        time.sleep(delay)
        body = _fail_on_error(
            client.get(
                f"{base_url}{SESSIONS_PATH}/{session_id}",
                headers=_headers({SESSION_SECRET_HEADER: secret}),
            ),
            "Checking the login session",
        )
        reported = str(body.get("status") or body.get("state") or "").upper()
        if reported and reported != state:
            # Printed only on change, so a slow login doesn't scroll away.
            print(f"  {reported.lower()}")
            state = reported
        if state == AUTHORIZED:
            return
        if state in TERMINAL_STATES:
            sys.exit(
                f"CALL-E login {state.lower()}. Start over: "
                "python scripts/calle_login.py"
            )
        delay = _poll_delay(body, delay)
    sys.exit(
        f"Timed out after {timeout}s waiting for the browser login "
        f"(last state: {state.lower()})."
    )


def exchange(
    client: httpx.Client, base_url: str, session_id: str, secret: str
) -> tuple[str, str]:
    """Trade the authorized session for the access token itself."""
    body = _fail_on_error(
        client.post(
            f"{base_url}{SESSIONS_PATH}/{session_id}/exchange",
            headers=_headers({SESSION_SECRET_HEADER: secret}),
        ),
        "Exchanging the authorized session for a token",
    )
    token = (body.get("token") or {}).get("access_token")
    if not token:
        sys.exit("CALL-E authorized the session but returned no access_token.")
    return token, body.get("expires_at") or "not reported"


def print_result(access_token: str, expires_at: str, service: str, region: str) -> None:
    """The token, where to put it, and how to rotate it on Cloud Run."""
    assignment = f"CALLE_ACCESS_TOKEN={access_token}"
    print()
    print("CALL-E access token minted.")
    print()
    print("  *** SENSITIVE *** This token authorizes real outbound phone calls.")
    print("  Don't commit it and don't paste it into chat. Rerun to rotate.")
    print(f"  expires_at: {expires_at}")
    print()
    print("Local -- .env in src/backend/connectors-api/:")
    print()
    print(f"  {assignment}")
    print()
    print("Cloud Run -- one line, safe to paste into PowerShell:")
    print()
    if "," in access_token:
        # gcloud splits --update-env-vars on commas itself, and quoting does
        # not stop that: the shell strips the quotes before gcloud sees the
        # value. The ^:^ prefix reassigns the delimiter for this one argument.
        print(
            f"  gcloud run services update {service} --region {region} "
            f'--update-env-vars "^:^{assignment}"'
        )
    else:
        print(
            f"  gcloud run services update {service} --region {region} "
            f'--update-env-vars "{assignment}"'
        )
    print()
    print("  (--update-env-vars, not --set-env-vars: set would wipe")
    print("   GOOGLE_CLIENT_ID, the KMS_* vars and everything else.)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=CALLE_BASE_URL,
                        help="CALL-E base url")
    parser.add_argument("--channel", default=CALLE_CHANNEL,
                        help="CALL-E channel")
    parser.add_argument("--no-browser", action="store_true",
                        help="print the login url instead of opening it")
    parser.add_argument("--timeout", type=int, default=POLL_TIMEOUT_SECONDS,
                        help="seconds to wait for the browser login")
    parser.add_argument("--service", default=CLOUD_RUN_SERVICE,
                        help="cloud run service named in the printed command")
    parser.add_argument("--region", default=CLOUD_RUN_REGION,
                        help="cloud run region named in the printed command")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            session = create_session(client, base_url, args.channel)

            # Printed before the browser opens: on a headless box or over SSH
            # webbrowser.open() returns False silently, and the operator still
            # needs the link.
            print("Authorize this integration in your browser:")
            print()
            print(f"  {session['login_url']}")
            print()
            if not args.no_browser:
                webbrowser.open(session["login_url"])

            print("Waiting for authorization...")
            wait_for_authorization(
                client,
                base_url,
                session["session_id"],
                session["session_secret"],
                args.timeout,
                _poll_delay(session, DEFAULT_POLL_SECONDS),
            )
            token, expires_at = exchange(
                client, base_url, session["session_id"], session["session_secret"]
            )
    except httpx.HTTPError as exc:
        sys.exit(f"Could not reach CALL-E at {base_url}: {type(exc).__name__}")
    except KeyboardInterrupt:
        sys.exit("\nCancelled. No token was minted.")

    print_result(token, expires_at, args.service, args.region)


if __name__ == "__main__":
    main()
