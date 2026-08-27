#!/usr/bin/env python3
"""Seed one envelope-encrypted credential document into Firestore.

Purpose
-------
Proves the connector's read path end to end before the frontend's write path
exists. Also serves as the reference implementation of
docs/ENCRYPTION_CONTRACT.md -- if the TypeScript in the Next.js callback
produces bytes this script would produce, the two sides interoperate.

Lives in scripts/, deliberately outside app/, so the capability-absence test
that forbids KMS encrypt inside the service does not trip on it. Nothing here
is imported by the service at runtime.

Usage
-----
    # 1. Get a refresh token for a real Google account (one-off, interactive)
    python scripts/seed_credential.py --get-token

    # 2. Encrypt it and write the Firestore document
    python scripts/seed_credential.py --uid <FIREBASE_UID> --refresh-token <TOKEN>

    # Or do both at once
    python scripts/seed_credential.py --uid <FIREBASE_UID> --get-token

Requires
--------
    roles/cloudkms.cryptoKeyEncrypter on classistant-key for whoever runs this
    (your own account is fine, and should be removed once the frontend works).
    gcloud auth application-default login
"""

import argparse
import base64
import os
import sys

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from google.cloud import firestore, kms

PROJECT_ID = "classisstant"          # double-s; permanent typo
KMS_LOCATION = "us-central1"
KMS_KEYRING = "classistant-keyring"
KMS_KEY = "classistant-key"          # refresh-token key, NOT the password key
CREDENTIAL_TYPE = "google_refresh_token"

# Must stay byte-identical to GOOGLE_SCOPES in the frontend's lib/googleOAuth.ts
# and to `scopes` in app/config.py.
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
]


def key_name() -> str:
    return kms.KeyManagementServiceClient().crypto_key_path(
        PROJECT_ID, KMS_LOCATION, KMS_KEYRING, KMS_KEY
    )


def get_refresh_token_interactively() -> str:
    """Runs the OAuth consent flow locally and returns a refresh token.

    This is the step the Next.js callback will own. Doing it here is purely a
    stand-in so the read path can be tested before that exists.
    """
    from google_auth_oauthlib.flow import InstalledAppFlow

    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    if not client_id or not client_secret:
        sys.exit(
            "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first (Richard's "
            "client -- refresh tokens only redeem against the client that "
            "issued them)."
        )

    flow = InstalledAppFlow.from_client_config(
        {
            "installed": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": ["http://localhost"],
            }
        },
        scopes=SCOPES,
    )
    # access_type/prompt are what actually guarantee a refresh token comes back.
    creds = flow.run_local_server(
        port=0, access_type="offline", prompt="consent"
    )
    if not creds.refresh_token:
        sys.exit("Google returned no refresh token. Retry with prompt=consent.")
    return creds.refresh_token


def encrypt_credential(uid: str, plaintext: str, use_aad: bool) -> dict:
    """The write half of ENCRYPTION_CONTRACT.md sections 4 and 5.

    Mirror this in TypeScript for the Next.js callback. The two details that
    matter most:
      * AESGCM here returns ciphertext||tag as one buffer. Node's
        createCipheriv returns them separately -- concat before base64.
      * The KMS plaintext is the base64 *text* of dkey, not the raw bytes.
    """
    dkey = os.urandom(32)          # AES-256
    iv = os.urandom(12)            # 96-bit, the GCM standard length

    # Inner layer: AES-256-GCM, tag appended to the ciphertext.
    ciphertext = AESGCM(dkey).encrypt(iv, plaintext.encode("utf-8"), None)

    # Outer layer: KMS wraps dkey. AAD binds the wrapped key to this one user,
    # so it cannot be moved into another user's document.
    request = {
        "name": key_name(),
        "plaintext": base64.b64encode(dkey),   # base64 TEXT, per contract 5
    }
    if use_aad:
        request["additional_authenticated_data"] = uid.encode("utf-8")

    wrapped = kms.KeyManagementServiceClient().encrypt(request=request)

    return {
        "user_id": uid,
        "credential_type": CREDENTIAL_TYPE,
        "encrypted_credential": base64.b64encode(ciphertext).decode(),
        "encrypted_dkey": base64.b64encode(wrapped.ciphertext).decode(),
        "iv": base64.b64encode(iv).decode(),
    }


def write_document(uid: str, doc: dict) -> str:
    """users/{uid}/credentials/{credential_type} -- contract section 2."""
    db = firestore.Client(project=PROJECT_ID)
    ref = (
        db.collection("users")
        .document(uid)
        .collection("credentials")
        .document(CREDENTIAL_TYPE)
    )
    exists = ref.get().exists
    payload = {**doc, "updated_at": firestore.SERVER_TIMESTAMP}
    if not exists:
        payload["created_at"] = firestore.SERVER_TIMESTAMP
    ref.set(payload, merge=True)
    return ref.path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--uid", help="Firebase Auth UID (the users/ doc id)")
    parser.add_argument("--refresh-token", help="an existing refresh token")
    parser.add_argument(
        "--get-token",
        action="store_true",
        help="run the consent flow to obtain a refresh token first",
    )
    parser.add_argument(
        "--no-aad",
        action="store_true",
        help="omit AAD (use only if the frontend also omits it)",
    )
    args = parser.parse_args()

    if args.get_token and not args.uid:
        print(get_refresh_token_interactively())
        return

    if not args.uid:
        sys.exit("--uid is required")

    token = args.refresh_token
    if args.get_token:
        token = get_refresh_token_interactively()
    if not token:
        sys.exit("Provide --refresh-token or --get-token")

    doc = encrypt_credential(args.uid, token, use_aad=not args.no_aad)
    path = write_document(args.uid, doc)

    del token  # best effort; don't leave the plaintext lying around

    print(f"wrote {path}")
    print(f"  aad: {'uid' if not args.no_aad else 'none'}")
    print()
    print("Verify the read path:")
    print(f'  curl "http://localhost:8000/users/{args.uid}/emails?max_results=1"')


if __name__ == "__main__":
    main()
