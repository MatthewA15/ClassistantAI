from firebase_functions import https_fn
from firebase_admin import initialize_app
from twilio.request_validator import RequestValidator
from twilio.twiml.messaging_response import MessagingResponse
from os import environ
from urllib.parse import urlparse, urlunparse
from models import (
    MethodNotAllowedResponse,
    ForbiddenResponse,
    BadRequestResponse,
)
from datetime import datetime, timezone
from google.cloud import tasks_v2
import json
import logging

logger = logging.getLogger(__name__)

initialize_app()

AGENT_URL = "https://us-east1-aiplatform.googleapis.com/v1/projects/classisstant/locations/us-east1/reasoningEngines/2528718414210400256"
QUEUE_NAME = "classistant-messages-queue"

SERVICE_ACCOUNT_EMAIL = "classistant-twilio-webhook@classisstant.iam.gserviceaccount.com"
PROJECT_ID = environ.get("GOOGLE_CLOUD_PROJECT", "classisstant")
PROJECT_LOCATION = environ.get("GOOGLE_CLOUD_LOCATION", "us-central")


def _get_validated_url(req: https_fn.Request) -> str:
    """Reconstruct the request URL forcing https, since Cloud Run terminates
    TLS at the load balancer and the internal request sees http://."""
    parsed = urlparse(req.url)
    return urlunparse(parsed._replace(scheme="https"))


@https_fn.on_request(max_instances=100)
def twilio_webhook(req: https_fn.Request) -> https_fn.Response:
    if req.method not in ["POST"]:
        return https_fn.Response(
            response=MethodNotAllowedResponse().model_dump_json(),
            status=405,
            mimetype="application/json",
        )

    validator = RequestValidator(environ.get("TWILIO_AUTH_TOKEN"))
    if not validator.validate(_get_validated_url(req), req.form,
                              req.headers.get("X-TWILIO-SIGNATURE", "")):
        return https_fn.Response(
            response=ForbiddenResponse().model_dump_json(),
            status=403,
            mimetype="application/json",
        )

    phone_number = req.form.get("From")
    message_body = req.form.get("Body")

    if not (phone_number and message_body):
        return https_fn.Response(
            response=BadRequestResponse().model_dump_json(),
            status=400,
            mimetype="application/json",
        )

    session_id = datetime.now(timezone.utc).strftime("%Y-%b-%d")

    logger.debug(
        "User: %s, Session ID: %s, Message size: %d",
        phone_number,
        session_id,
        len(message_body),
    )

    # Enqueue the streamQuery as a Cloud Task whose HTTP target is the Agent
    # Engine's ``:streamQuery`` REST endpoint.
    stream_url = f"{AGENT_URL}:streamQuery?alt=sse"
    payload = {
        "class_method": "async_stream_query",
        "input": {
            "user_id": phone_number,
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
                        service_account_email=SERVICE_ACCOUNT_EMAIL
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
        phone_number,
        session_id,
    )

    resp = MessagingResponse()
    resp.message(f"Message received from {phone_number}! (task: {task_id})")

    return https_fn.Response(str(resp))
