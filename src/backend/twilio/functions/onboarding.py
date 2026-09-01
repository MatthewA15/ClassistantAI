"""Firestore-triggered welcome SMS.

Fires automatically when a new document is created in the ``users``
collection. If the document carries a ``phone_number``, the function sends
the new user a randomized welcome message via Twilio along with the Classy
vCard (``https://classistant.ca/classy.vcf``) as an MMS attachment.

Firestore delivers events at-least-once, so after a successful send the
function stamps the user document with ``welcome_message_sent_at`` and
skips documents that already carry that field. Writing back to the document
that triggered an ``on_document_created`` event is safe — only updates fire
``on_document_updated``; a create trigger does not re-fire on a subsequent
write, so there is no infinite-loop risk.
"""

import logging
import random
from datetime import datetime, timezone

from firebase_functions.firestore_fn import (
    DocumentSnapshot,
    Event,
    on_document_created,
)
from twilio.rest import Client as TwilioClient

from constants import (
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER,
    TWILIO_MESSAGING_SERVICE_SID,
    VCARD_URL,
    WELCOME_MESSAGES,
)

logger = logging.getLogger(__name__)

# Construct the Twilio REST client once at module import time.
_twilio_client = (
    TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    if (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_MESSAGING_SERVICE_SID)
    else None
)


@on_document_created(
    document="users/{userId}",
    max_instances=50,
)
def on_user_created(event: Event[DocumentSnapshot | None]) -> None:
    """Send a randomized welcome SMS + the Classy vCard to a newly created
    user.

    The trigger fires for *every* new document in ``users``; the body filters
    down to those that actually carry a ``phone_number``. Idempotent across
    Firestore's at-least-once delivery via the ``welcome_message_sent_at``
    field written back to the user document after a successful send.
    """

    snap = event.data
    if snap is None:
        logger.info("on_user_created: no data associated with event; skipping.")
        return

    if not _twilio_client:
        logger.error(
            "on_user_created: Twilio REST credentials are not configured.")
        return

    data = snap.to_dict() or {}
    user_id = event.params.get("userId")

    if not (phone_number := data.get("phone_number")):
        logger.info(
            "on_user_created: user '%s' has no phone_number; skipping.",
            user_id,
        )
        return

    # Idempotency: skip if we already sent the welcome message for this user.
    if data.get("welcome_message_sent_at"):
        logger.info(
            "on_user_created: user '%s' already welcomed; skipping.",
            user_id,
        )
        return

    msg = _twilio_client.messages.create(
        from_=TWILIO_FROM_NUMBER,
        to=phone_number,
        body=random.choice(WELCOME_MESSAGES),
        media_url=[VCARD_URL],
    )

    # Mark the user document so a redelivered event does not re-send.
    snap.reference.update({
        "welcome_message_sid": msg.sid,
        "welcome_message_sent_at": datetime.now(timezone.utc),
    })

    logger.info(
        "on_user_created: sent welcome message %s to user '%s' at %s",
        msg.sid,
        user_id,
        datetime.now(timezone.utc).isoformat(),
    )
