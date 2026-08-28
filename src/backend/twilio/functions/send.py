"""Outbound SMS sender.

Looks up a Firestore user by ``user_id`` and sends an SMS to the phone number
on their profile using the Twilio REST API.
"""

from firebase_functions import https_fn
from twilio.rest import Client as TwilioClient
from models import ErrorResponse, SendRequest, SendResponse
from db import db
import logging
from firebase_functions.options import IngressSetting


from constants import (
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER,
)

logger = logging.getLogger(__name__)

# Construct the Twilio REST client once at module import time.
_twilio_client = (
    TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    if (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER)
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
    """Send an outbound SMS to the phone number associated with a Firestore
    user document.

    Expects a JSON body of the shape::

    ```
    { "user_id": "<firestore doc id>", "message": "..." }
    ```
    """
    if req.method != "POST":
        return _json_response(ErrorResponse(error="Method not allowed."), 405)

    try:
        payload = SendRequest.model_validate_json(req.get_data())
    except Exception:
        return _json_response(ErrorResponse(error="Bad request. Missing required 'user_id' and 'message' fields."), 400)

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

    message = _twilio_client.messages.create(
        from_=TWILIO_FROM_NUMBER,
        to=phone_number,
        body=payload.message,
    )
    message_sid = message.sid or "(unknown)"

    logger.info(
        "send_message: sent message '%s' to user %s",
        message_sid,
        payload.user_id,
    )

    return _json_response(
        SendResponse(message_sid=message_sid,
                     to=phone_number, body=payload.message),
        200,
    )
