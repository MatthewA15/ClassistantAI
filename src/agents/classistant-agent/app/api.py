"""Connector API toolset for the Classistant agent.

Fetches the OpenAPI spec from the connector service at runtime and caches
it for half a day, then builds an ADK ``OpenAPIToolset`` so the agent can
call the connector endpoints as tools.
"""

import logging
from os import environ
import httpx
from google.adk.auth.auth_credential import (
    AuthCredential,
    AuthCredentialTypes,
    ServiceAccount,
)
from google.adk.tools.openapi_tool.auth.auth_helpers import service_account_scheme_credential, token_to_scheme_credential
from google.adk.tools import BaseTool, ToolContext
from google.adk.tools.openapi_tool.openapi_spec_parser.openapi_toolset import (
    OpenAPIToolset,
)
from cachetools.func import ttl_cache

from .util import get_id_token

logger = logging.getLogger(__name__)

API_URL = environ.get("CONNECTOR_URL")
_SPEC_PATH = "/openapi.json"
_CACHE_TTL_S = 12 * 60 * 60  # half a day
_REQUEST_TIMEOUT_S = 15

_CONNECTOR_PREFIX = "connector"


@ttl_cache(maxsize=5, ttl=_CACHE_TTL_S)
def _fetch_openapi_spec(base_url: str) -> dict:
    """Fetch the connector OpenAPI spec, serving a cached copy when fresh.

    The spec is fetched from ``{base_url}/openapi.json`` using a
    Google-signed ID token for service-to-service auth on Cloud Run. The
    result is cached for ``_CACHE_TTL_S`` seconds (half a day) so the spec
    isn't re-fetched on every agent startup or request.

    Args:
        base_url: The connector service base URL.

    Returns:
        The OpenAPI spec as a JSON string.

    Raises:
        RuntimeError: If the spec cannot be fetched or parsed and no
            cached copy is available.
    """
    url = base_url.rstrip("/") + _SPEC_PATH

    logger.info("fetching openapi spec from %s", url)
    try:
        id_token = get_id_token(base_url)
        headers = {"Authorization": f"Bearer {id_token}"} if id_token else {}
        resp = httpx.get(url, headers=headers, timeout=_REQUEST_TIMEOUT_S)
        resp.raise_for_status()

        spec = resp.json()
        # Specify url for calls
        spec["servers"] = [
            {
                "url": API_URL,
                "description": "Connectors API server"
            }
        ]
    except Exception as exc:
        raise RuntimeError(
            f"Could not fetch OpenAPI spec from {url}: {exc}"
        ) from exc

    return spec


def build_connector_api() -> OpenAPIToolset | None:
    """Build the connector ``OpenAPIToolset`` from the live service spec.

    Returns ``None`` when ``CONNECTOR_URL`` is unset, so the agent can
    still run (without connector tools) in environments that don't expose
    the connector service.
    """
    if not API_URL:
        logger.warning(
            "CONNECTOR_URL is not set; connector tools will not be "
            "available."
        )
        return None

    # service_account = ServiceAccount(
    #     use_default_credential=True,
    #     use_id_token=True,
    #     audience=API_URL,
    # )
    # auth_scheme, auth_creds = service_account_scheme_credential(
    #     service_account)

    auth_scheme, auth_creds = token_to_scheme_credential(
        token_type="oauth2Token",
        location="header",
        name="Authorization",
        credential_value=get_id_token(API_URL)
    )

    return OpenAPIToolset(
        spec_dict=_fetch_openapi_spec(API_URL),
        tool_name_prefix=_CONNECTOR_PREFIX,
        auth_scheme=auth_scheme,
        auth_credential=auth_creds,
    )


def inject_user_id(
    tool: BaseTool, args: dict, tool_context: ToolContext
) -> dict | None:
    """``before_tool_callback`` that fills ``user_id`` on connector tools.

    Returns ``None`` to let the tool proceed with the patched args.
    """
    if not tool.name.startswith(_CONNECTOR_PREFIX + "_"):
        return None  # only connector tools

    user_id = (
        tool_context.user_id
        if environ.get("DEBUG", "false") == "false"
        else environ.get("TEST_USER_ID")
    )
    if not user_id:
        logger.warning(
            "inject_user_id: no user_id available for tool %s; "
            "connector call will likely fail with a missing path param.",
            tool.name,
        )

    # Inject `user_id`
    args["user_id"] = user_id

    return None
