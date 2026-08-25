from firebase_functions import https_fn
from firebase_admin import initialize_app
from twilio.request_validator import RequestValidator
from twilio.twiml.messaging_response import MessagingResponse
from os import environ
from models import MethodNotAllowedResponse, ForbiddenResponse

initialize_app()


@https_fn.on_request(max_instances=100)
def twilio_webhook(req: https_fn.Request) -> https_fn.Response:
    if req.method not in ["POST", "GET"]:
        return https_fn.Response(
            response=MethodNotAllowedResponse().model_dump_json(),
            status=405,
            mimetype="application/json",
        )

    validator = RequestValidator(environ.get("TWILIO_AUTH_TOKEN"))
    if not validator.validate(req.url, req.form,
                              req.headers.get("X-TWILIO-SIGNATURE", "")):
        return https_fn.Response(
            response=ForbiddenResponse().model_dump_json(),
            status=403,
            mimetype="application/json",
        )

    resp = MessagingResponse()
    resp.message("Message received!")

    return https_fn.Response(str(resp))
