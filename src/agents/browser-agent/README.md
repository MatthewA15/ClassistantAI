# classy-browser agent

Headless browser agent for [Classistant](../../README.md). The main
classistant agent (Classy) delegates heavy web tasks here — logging into the
student's school portal, reading deadline pages, checking grades — instead of
doing browser automation itself.

Runs a real, **per-student** browser session (cookies persist across tasks in
that student's own profile) via the [obscura](https://github.com/h4ckf0r0day/obscura)
MCP server.

## Architecture

```
classistant-agent (Classy)          this agent (classy_browser)
        │  A2A (follow-up)                 │ MCP over stdio
        ▼                                  ▼
   text the student                  obscura process per user
                                     └── --storage-dir /mnt/cookie-storage/<user_id>
```

- **`browser_tools.py`** — obscura is spawned over stdio, one process per
  `user_id`, each with its own `--storage-dir` (cookie isolation between
  students). Tool names/schemas come **directly from the obscura MCP
  server** (its tools are already named `browser_*` — no prefixing, no
  hand-written tool wrappers); `McpToolset` handles discovery, Gemini
  declarations, and session lifecycle. Note `--storage-dir` is a
  *top-level* flag: `obscura --storage-dir <dir> mcp`.
- **`callbacks.py`** — the credential placeholder protocol (below).
- **`credentials.py`** — Firestore + KMS decrypt of the school-portal
  password (`users/{uid}/credentials/school_password`, envelope per
  [`docs/ENCRYPTION_CONTRACT.md`](../../../docs/ENCRYPTION_CONTRACT.md),
  key `classistant-password-key`), plus `school_username` from the user
  document. **Decrypt-only**; credentials are TTL-cached (10 min).
- **`agent.py` / `prompt.md`** — the agent definition and its instructions.

### Credential placeholder protocol

The model never sees real credentials. It emits the literals
`<%USERNAME%>` / `<%PASSWORD%>` when filling login forms; then:

1. `inject_credentials` (before_tool_callback) swaps them for the real
   decrypted values immediately before the tool runs.
2. `scrub_credentials` (after_tool_callback) replaces any occurrence of the
   real values in the tool result with the placeholders, so plaintext never
   enters the model's context (portals happily echo the signed-in username
   in page content).

## Layout

```
main.py               # FastAPI serving (Cloud Run entrypoint)
classy_browser/       # agent package (discovered by ADK)
  agent.py            # root_agent: model + tools + callbacks
  prompt.md           # system instructions
  browser_tools.py    # per-user obscura MCP toolset manager
  callbacks.py        # placeholder inject/scrub
  credentials.py      # Firestore + KMS envelope decrypt (decrypt-only)
  util.py
tests/                # unit tests (GCP clients faked)
Dockerfile            # bakes obscura into /usr/local/bin; runs as myuser
deploy.sh             # Cloud Run deploy (us-central1)
```

> Note: the agent directory is `classy_browser` (underscore) — ADK requires
> agent directory names to be valid Python identifiers.

## Running locally

```bash
# 1. Python 3.13 + deps (uv or pip)
uv venv && uv pip install -r requirements.txt pytest pytest-asyncio

# 2. obscura on PATH (or set OBSCURA_BIN); see repo root for the binary
# 3. Env: copy classy_browser/.env.example -> classy_browser/.env and fill in
#    (OBSCURA_STORAGE_BASE should be a writable local dir, e.g. /tmp/cookie-storage)

# 4. Serve / dev UI
.venv/bin/python main.py            # uvicorn on $PORT (8080)
# or
.venv/bin/adk web                   # ADK dev UI for local poking
```

## Tests

```bash
.venv/bin/python -m pytest tests/ -q
```

Firestore/KMS/obscura are faked; no GCP access needed.

## Deployment notes

- `deploy.sh` deploys to Cloud Run `us-central1` as
  `classistant-browser-agent@classisstant.iam.gserviceaccount.com`.
- **IAM prerequisite**: that service account needs
  `roles/cloudkms.cryptoKeyDecrypter` on
  `projects/classisstant/locations/us-central1/keyRings/classistant-keyring/cryptoKeys/classistant-password-key`.
  (It must *not* get any grant on the refresh-token key — that's the
  connector's; see ENCRYPTION_CONTRACT.md #1.)
- Per-user browser state lives under `/mnt/cookie-storage/<user_id>`. Persisted to a GCS bucket. 
## Follow-ups

- **A2A wiring**: expose this agent via A2A and register it in
  classistant-agent so Classy can delegate browser tasks (out of scope here).
- Optionally add a `tool_filter` on the `McpToolset` to narrow the exposed
  obscura tool surface.