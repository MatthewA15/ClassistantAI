"""Builds Google API clients for a user.

Post issue #12: credentials come from Firestore + KMS (firestore_creds),
not Secret Manager. Endpoint code is unchanged — same service_for_user
signature as before, so gmail.py / calendar.py / drive.py / docs.py
don't need to be touched.
"""

from googleapiclient.discovery import build

from app.services.firestore_creds import credentials_for_user


def service_for_user(user_id: str, api: str, version: str):
    """e.g. service_for_user(uid, "gmail", "v1") — exactly as before."""
    return build(
        api,
        version,
        credentials=credentials_for_user(user_id),
        cache_discovery=False,
    )
