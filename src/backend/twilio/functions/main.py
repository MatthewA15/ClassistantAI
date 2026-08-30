"""Firebase Cloud Functions entrypoint.

The actual function logic lives in sibling modules. Importing them here is
what registers their ``@https_fn.on_request`` decorators with the Firebase
Functions runtime, so they are discovered and deployed.
"""

from firebase_admin import initialize_app

initialize_app()

# Importing the modules below registers their HTTP functions. Each module
# owns its own ``@https_fn.on_request`` decorator definition. `
from webhook import twilio_webhook  # noqa: F401
from send import send_message  # noqa: F401
