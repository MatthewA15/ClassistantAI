"""Outbound SMS sender.

Looks up a Firestore user by ``user_id`` and sends one or more SMS messages
to the phone number on their profile using the Twilio REST API.

The first message in ``messages`` is sent immediately. Every subsequent
message must include a ``delay_s`` field (> 0); the function sleeps for that
many seconds before sending it, which supports sub-second delays.
"""

from firebase_functions import https_fn
from twilio.rest import Client as TwilioClient
from pydantic import ValidationError
from models import ErrorResponse, SendRequest, SendResponse
from db import db
import logging
import time
from datetime import datetime, timezone
from firebase_functions.options import IngressSetting


from constants import (
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_MESSAGING_SERVICE_SID,
)

logger = logging.getLogger(__name__)

# Construct the Twilio REST client once at module import time.
_twilio_client = (
    TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    if (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_MESSAGING_SERVICE_SID)
    else None
)


def _json_response(model, status: int) -> https_fn.Response:
    return https_fn.Response(
        response=model.model_dump_json(),
        status=status,
        mimetype="application/json",
    )


@https_fn.on_request(max_instances=100,
                     service_account="classistant-message-sender@classisstant.iam.gserviceaccount.com")
def send_message(req: https_fn.Request) -> https_fn.Response:
    """Send one or more outbound SMS messages to the phone number associated
    with a Firestore user document.

    Expects a JSON body of the shape:

    ```
    {
      "user_id": "<firestore doc id>",
      "messages": [
        { "body": "first message" },
        { "body": "second message", "delay_s": 0.5 }
      ]
    }
    ```

    The first message is sent immediately. Every subsequent message must
    include ``delay_s`` (> 0); the function sleeps for that many seconds
    before sending it.
    """
    if req.method != "POST":
        return _json_response(ErrorResponse(error="Method not allowed."), 405)

    try:
        payload = SendRequest.model_validate_json(req.get_data())
    except ValidationError as e:
        return https_fn.Response(e.json(), status=400, mimetype="application/json")

    # Look up the user document to resolve their phone number.
    user_ref = db.collection("users").document(payload.user_id)
    user_snap = user_ref.get()

    if not user_snap.exists:
        logger.info("send_message: user '%s' not found.", payload.user_id)
        return _json_response(ErrorResponse(error="Not found. No user exists for the given user_id."), 404)

    user_data = user_snap.to_dict()
    phone_number = (user_data or {}).get("phone_number")
    if not phone_number:
        logger.info(
            "send_message: user '%s' has no phone_number field.",
            payload.user_id,
        )
        return _json_response(ErrorResponse(error="The given user does not have a phone number saved in the DB."), 400)

    if not _twilio_client:
        logger.error(
            "send_message: Twilio REST credentials are not configured.")
        return _json_response(ErrorResponse(error="Internal server error. Required Twilio environment variables are not set."), 500)

    results = []
    for i, m in enumerate(payload.messages):
        if i > 0 and m.delay_s is not None:
            time.sleep(m.delay_s)  # Wait

        msg = _twilio_client.messages.create(
            messaging_service_sid=TWILIO_MESSAGING_SERVICE_SID,
            to=phone_number,
            body=m.body,
        )
        results.append({
            "message_sid": msg.sid or "(unknown)",
            "body": m.body,
            "sent_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.debug("send_message: sent message of size %d to user %s at %s",
                     len(m.body),
                     payload.user_id,
                     results[-1]["sent_at"]
                     )

    logger.info(
        "send_message: sent %d message(s) to user %s",
        len(results),
        payload.user_id,
    )

    return _json_response(
        SendResponse(to=phone_number, results=results),
        200,
    )
