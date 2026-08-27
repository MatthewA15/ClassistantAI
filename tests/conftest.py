"""Shared test setup.

app/config.py builds the module-level `settings` singleton from process env
vars + `.env` the moment `app.config` is first imported. We don't want tests
depending on -- or ever reading -- a developer's real `.env`: it's
untracked, may hold live secrets, and (pre issue #12) may still have stale
fields from before this migration that would fail Settings() validation on
someone else's machine.

So on first import here we build `settings` from explicit test values, with
dotenv resolution pointed at an empty temp directory instead of the repo
root.  Every other test module just imports the already-configured
app.config / app.services.firestore_creds normally.
"""
import os
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

_TEST_ENV = {
    "GCP_PROJECT_ID": "test-project",
    "GOOGLE_CLIENT_ID": "test-client.apps.googleusercontent.com",
    "GOOGLE_CLIENT_SECRET": "test-client-secret",
    "KMS_LOCATION": "us-central1",
    "KMS_KEYRING": "test-keyring",
    "KMS_KEY": "test-key",
    "KMS_AAD_SOURCE": "none",
}

if "app.config" not in sys.modules:
    for _key, _value in _TEST_ENV.items():
        os.environ.setdefault(_key, _value)

    _cwd = os.getcwd()
    with tempfile.TemporaryDirectory() as _empty_dir:
        os.chdir(_empty_dir)
        try:
            import app.config  # noqa: F401  (triggers Settings() with no .env in scope)
        finally:
            os.chdir(_cwd)
