"""Inbound Twilio SMS webhook.

Verifies the Twilio signature, looks up the sender in Firestore, and either
nudges an unrecognised number to finish signing up or enqueues an Agent
Engine ``streamQuery`` as a Cloud Task for recognised users.
"""

from firebase_functions import https_fn
from google.cloud.firestore import FieldFilter
from twilio.request_validator import RequestValidator
from twilio.twiml.messaging_response import MessagingResponse
from urllib.parse import urlparse, urlunparse
from models import ErrorResponse
from db import db
from datetime import datetime, timezone
from google.cloud import tasks_v2
import json
import random
import uuid
import logging

from constants import (
    TWILIO_AUTH_TOKEN,
    SITE_URL,
    AGENT_URL,
    AGENT_SERVICE_ACCOUNT_EMAIL,
    SERVICE_ACCOUNT_EMAIL,
    QUEUE_NAME,
    PROJECT_ID,
    PROJECT_LOCATION,
    SIGNUP_NUDGES,
)

logger = logging.getLogger(__name__)


def _get_validated_url(req: https_fn.Request) -> str:
    """Reconstruct the request URL forcing https, since Cloud Run terminates
    TLS at the load balancer and the internal request sees http://."""
    parsed = urlparse(req.url)
    return urlunparse(parsed._replace(scheme="https"))


@https_fn.on_request(max_instances=100, service_account=SERVICE_ACCOUNT_EMAIL)
def twilio_webhook(req: https_fn.Request) -> https_fn.Response:
    if req.method not in ["POST"]:
        return https_fn.Response(
            response=ErrorResponse(
                error="Method not allowed.").model_dump_json(),
            status=405,
            mimetype="application/json",
        )

    validator = RequestValidator(TWILIO_AUTH_TOKEN)
    if not validator.validate(_get_validated_url(req), req.form,
                              req.headers.get("X-TWILIO-SIGNATURE", "")):
        return https_fn.Response(
            response=ErrorResponse(
                error="Forbidden. The request could not be verified as originating from Twilio.").model_dump_json(),
            status=403,
            mimetype="application/json",
        )

    phone_number = req.form.get("From")
    message_body = req.form.get("Body")

    if not (phone_number and message_body):
        return https_fn.Response(
            response=ErrorResponse(
                error="Bad request. Missing required Twilio form fields.").model_dump_json(),
            status=400,
            mimetype="application/json",
        )

    logger.debug("Looking for user with given phone number in db.")

    # Look up the sender in Firestore. If they haven't finished onboarding,
    # reply with a friendly nudge to sign up instead of forwarding the text.
    user_query = (
        db.collection("users")
        .where(filter=FieldFilter("phone_number", "==", phone_number))
        .limit(1)
        .stream()
    )

    if (user_doc := next(user_query, None)) is None:
        logger.info("Unrecognised sender; nudging to sign up.")

        nudge = random.choice(SIGNUP_NUDGES).format(url=SITE_URL)
        resp = MessagingResponse()
        resp.message(nudge)

        return https_fn.Response(str(resp))
    else:
        user_id = user_doc.id
        logger.debug("User with given phone number is " + user_id)

    # Deterministic session id per sender per calendar day: uuid5 (SHA-1) of
    # ``phone_number:date`` under a fixed namespace yields a consistent UUID
    # for the same sender+day, so all messages within a day share one session.
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    session_id = str(uuid.uuid5(uuid.NAMESPACE_DNS,
                     f"{user_id}:{date_str}"))

    logger.debug(
        "User: %s, Session ID: %s, Message size: %d",
        user_id,
        session_id,
        len(message_body),
    )

    # Enqueue the streamQuery as a Cloud Task whose HTTP target is the Agent
    # Engine's ``:streamQuery`` REST endpoint.
    stream_url = f"{AGENT_URL}:streamQuery?alt=sse"
    payload = {
        "class_method": "async_stream_query",
        "input": {
            "user_id": user_id,
            "message": message_body,
            "session_id": session_id,
        },
    }

    task_client = tasks_v2.CloudTasksClient()
    new_task = task_client.create_task(
        tasks_v2.CreateTaskRequest(
            parent=task_client.queue_path(
                PROJECT_ID,
                PROJECT_LOCATION,
                QUEUE_NAME
            ),
            task=tasks_v2.Task(
                http_request=tasks_v2.HttpRequest(
                    http_method=tasks_v2.HttpMethod.POST,
                    url=stream_url,
                    headers={"Content-type": "application/json"},
                    oauth_token=tasks_v2.OAuthToken(
                        service_account_email=AGENT_SERVICE_ACCOUNT_EMAIL
                    ),
                    body=json.dumps(payload).encode(),
                ),
            ),
        )
    )

    task_name = new_task.name  # projects/.../queues/.../tasks/<id>
    task_id = task_name.rsplit("/", 1)[-1] if task_name else "unknown"
    logger.info(
        "Enqueued streamQuery task '%s' for user %s session %s",
        task_id,
        user_id,
        session_id,
    )

    resp = MessagingResponse()
    resp.message("Sending your message to Classy! Stand by...")

    return https_fn.Response(str(resp))
