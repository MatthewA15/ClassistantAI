# Classy Agent

This is where all agent code will live.

## Deployment requirements

`TWILIO_SEND_URL` is read at import with no default and no startup check, so
**a missing value fails nothing**. The agent boots clean, answers normally, and
only `send_text` goes quiet — returning a `not_configured` error the model sees
but nobody is paged about. It is not set by [`deploy.sh`](deploy.sh) or by
[`deployment/terraform/single-project/service.tf`](deployment/terraform/single-project/service.tf),
which is exactly why it is written down here.

| Env var | What it is | Read by | Missing in production means |
|---|---|---|---|
| `TWILIO_SEND_URL` | The Cloud Run URL of the Twilio SMS function that sends outbound texts. | [`app/tools.py`](app/tools.py) (`send_text`) | `send_text` returns `not_configured`. Classy cannot reply to the student **at all** — texting is its only channel, so the agent is effectively mute. |

It is set out of band today — pass it at deploy time with
`gcloud run services update ... --update-env-vars`, or add it to the service
config. **The failure is silent by construction, so verify after deploying**:
trigger one `send_text` and check the tool response, rather than waiting for a
crash that will not come.

Local development only, and not needed in production: `DEBUG` (set to anything
other than `"false"` to substitute a test user) and `TEST_USER_ID` (the Firebase
UID used when `DEBUG` is on). `deploy.sh` sets `DEBUG="false"` explicitly for
this reason. Neither appears in [`.env.example`](.env.example).

## Tests

```bash
uv run pytest tests/unit tests/integration
```

`tests/unit` needs no credentials and no network.

`tests/integration` is different: it spawns a uvicorn server and calls the live
Gemini model, so it needs GCP credentials and bills real inference.
