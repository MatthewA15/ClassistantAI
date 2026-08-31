# Classy Agent

This is where all agent code will live.

## Deployment requirements

Two environment variables are read at import with no default and no startup
check, so **a missing value fails nothing**. The agent boots clean, answers
normally, and only the affected tool goes quiet — returning a `not_configured`
error the model sees but nobody is paged about. Neither variable is set by
[`deploy.sh`](deploy.sh) or by
[`deployment/terraform/single-project/service.tf`](deployment/terraform/single-project/service.tf),
which is exactly why they are written down here.

| Env var | What it is | Read by | Missing in production means |
|---|---|---|---|
| `TWILIO_SEND_URL` | The Cloud Run URL of the Twilio SMS function that sends outbound texts. | [`app/tools.py`](app/tools.py) (`send_text`) | `send_text` returns `not_configured`. Classy cannot reply to the student **at all** — texting is its only channel, so the agent is effectively mute. |
| `CONNECTORS_API_URL` | The base URL of the connectors service, which places phone calls (and holds the Gmail/Calendar/Drive tools). Base URL only, no trailing path — it is also the audience of the Google-signed ID token, which Cloud Run validates against the service root. | [`app/tools_calls.py`](app/tools_calls.py) (`call_student`, `get_call_result`) | Both call tools return `not_configured`. Classy silently loses the ability to phone anyone; it will fall back to texting and never say why. |

Both are set out of band today — pass them at deploy time with
`gcloud run services update ... --update-env-vars`, or add them to the service
config. **The failure is silent by construction, so verify after deploying**:
trigger one `send_text` and one `call_student` and check the tool responses,
rather than waiting for a crash that will not come.

Local development only, and not needed in production: `DEBUG` (set to anything
other than `"false"` to substitute a test user) and `TEST_USER_ID` (the Firebase
UID used when `DEBUG` is on). `deploy.sh` sets `DEBUG="false"` explicitly for
this reason. Neither appears in [`.env.example`](.env.example).

## Tests

```bash
uv run pytest tests/unit tests/integration
```

`tests/unit` needs no credentials and no network — `tests/unit/conftest.py`
stubs `google.adk` when it is not installed, so the tool logic can be tested
without the full ADK. Without `uv`, run them against any interpreter that has
`pytest` and `httpx`:

```bash
python -m pytest tests/unit -q     # from src/agent/
```

`tests/integration` is different: it spawns a uvicorn server and calls the live
Gemini model, so it needs GCP credentials and bills real inference.
