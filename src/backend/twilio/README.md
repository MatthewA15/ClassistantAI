# Twilio SMS Backend

Firebase Cloud Functions (Python 3.12) that expose a Twilio webhook for
inbound SMS. 

## Webhook authentication

Every request is verified as genuinely coming from Twilio before any
processing happens:

1. Twilio signs each request with HMAC-SHA1 using the **Account Auth Token**
   and sends the signature in the `X-TWILIO-SIGNATURE` header.
2. The function reconstructs the **full request URL**, forcing the scheme to
   `https`. This is required because Cloud Run terminates TLS at the load
   balancer, so the function internally sees `http://` (if we validated
   against that URL the signature would never match).
3. `RequestValidator.validate(url, form, signature)` compares the computed
   signature against the header. On mismatch the function returns
   `403 Forbidden` with a `ForbiddenResponse` JSON body.

## Local development

### Prerequisites

- Python 3.12
- [Firebase CLI](https://firebase.google.com/docs/cli): `npm i -g firebase-tools`
- A Twilio account. Note the **Account SID** and **Auth Token** from the Twilio console.

### Setup

```bash
cd src/backend/twilio/functions
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create `functions/.env` (git-ignored) by filling `functions/.env.example` with your Twilio credentials.

### Run the emulators

From the `src/backend/twilio` directory:

```bash
firebase emulators:start
```

This starts the Functions emulator on `http://localhost:5001`. The webhook is
served at:

```
POST http://localhost:5001/classisstant/us-central1/twilio_webhook
```

### Test the webhook locally

Twilio must be able to reach your local emulator. Use a tunnel such as
[ngrok](https://ngrok.com) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

```bash
# Expose the functions emulator port
ngrok http 5001
# or
cloudflared tunnel --url http://localhost:5001
```

Copy the tunnel URL into the Twilio console:

1. Twilio Console → Phone Numbers → Active numbers → your number.
2. **A Messaging Comes In** → `Webhook` →
   `https://<tunnel-host>/classisstant/us-central1/twilio_webhook`.
3. Save and send a test SMS to the number.

## Deployment

The project is wired to Firebase project `classisstant` (`.firebaserc`).

### One-step deploy

```bash
sh deploy.sh
```
