"""Environment-derived constants shared across the Twilio functions."""

from os import environ

SITE_URL = "https://classistant--classisstant.us-central1.hosted.app"

AGENT_URL = "https://us-east1-aiplatform.googleapis.com/v1/projects/classisstant/locations/us-east1/reasoningEngines/2528718414210400256"

AGENT_SERVICE_ACCOUNT_EMAIL = "classistant-agent@classisstant.iam.gserviceaccount.com"

QUEUE_NAME = "classistant-messages-queue"
PROJECT_ID = environ.get("GOOGLE_CLOUD_PROJECT", "classisstant")
PROJECT_LOCATION = environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")

# Twilio REST credentials for outbound SMS.
TWILIO_ACCOUNT_SID = environ.get("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = environ.get("TWILIO_AUTH_TOKEN")
TWILIO_FROM_NUMBER = environ.get("TWILIO_FROM_NUMBER")

# Generic, friendly nudges shown to unrecognised senders. One is picked at
# random so repeat texts don't feel like a canned autoresponder.
SIGNUP_NUDGES = [
    "Hey! I don't recognise this number yet. Finish signing up at {url} and I'll be able to help.",
    "Hmm, I don't see an account for this phone. Complete your signup at {url} and text me again!",
    "Looks like we haven't met! Finish signing up at {url} so I can start helping you.",
    "You're not in my contacts yet. Wrap up your signup at {url} and I'll take it from here.",
    "I'd love to help, but I need you to sign up first. Head to {url} to finish registration.",
    "New number, who dis? 😄 Finish signing up at {url} and then text me back.",
    "I'm not seeing an account for this number. Complete your signup at {url} to get started.",
    "Almost there! Finish your registration at {url} and I'll be ready to assist you.",
]
