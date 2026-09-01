"""Environment-derived constants shared across the Twilio functions."""

from os import environ

SITE_URL = "https://classistant.ca"

# Public URL of the Classy vCard, attached to the welcome SMS as an MMS media payload.
VCARD_URL = "https://classistant.ca/classy.vcf"

AGENT_URL = "https://us-east1-aiplatform.googleapis.com/v1/projects/classisstant/locations/us-east1/reasoningEngines/2528718414210400256"

AGENT_SERVICE_ACCOUNT_EMAIL = "classistant-agent@classisstant.iam.gserviceaccount.com"

QUEUE_NAME = "classistant-messages-queue"
PROJECT_ID = environ.get("GOOGLE_CLOUD_PROJECT", "classisstant")
PROJECT_LOCATION = environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")

# Twilio REST credentials for outbound SMS.
TWILIO_ACCOUNT_SID = environ.get("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = environ.get("TWILIO_AUTH_TOKEN")
TWILIO_FROM_NUMBER = environ.get("TWILIO_FROM_NUMBER")
TWILIO_MESSAGING_SERVICE_SID = environ.get("TWILIO_MESSAGING_SERVICE_SID")

# Polling settings for waiting until the previous message reaches a terminal
# status before sending the next one.
TWILIO_POLL_INTERVAL_S = 0.1   # seconds between status fetches
TWILIO_POLL_TIMEOUT_S = 5      # max seconds to wait before assuming sent

# Generic, friendly nudges shown to unrecognised senders.
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

# Generic, randomized greetings sent to a user the moment their document is
# created in the `users` collection with a phone_number. Each is delivered as
# the body of an MMS that also carries the Classy vCard as an attachment.
WELCOME_MESSAGES = [
    "Hi! This is Classy, your school assistant. Save my contact card so you can text me anytime about assignments, schedules, and more. \U0001f44b",
    "Hey there! I'm Classy, your AI school helper. I've attached my contact card \u2014 save it and text me whenever you need a hand with school.",
    "Welcome! I'm Classy, your school assistant living in your text messages. Save the attached contact card and reach out whenever you need help.",
    "You're in! I'm Classy, here to help with school via text. Save my number from the attached card and message me whenever you need me.",
    "Hi! Classy here. I'm your school assistant, ready to help over text. Save my contact card below and message me anytime!",
    "Welcome to Classistant! I'm Classy, and I'll be your school assistant. Save the attached card and text me whenever school gets tricky.",
]
