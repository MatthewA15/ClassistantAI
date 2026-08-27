import "server-only";

/**
 * Google OAuth entry point.
 *
 * The frontend builds the authorisation URL, and the connector service on Cloud
 * Run exchanges the code. That split is deliberate (see docs/design/12):
 * building a consent URL needs only the *public* client id, while the exchange
 * needs the client secret, which lives in Secret Manager and is mounted into
 * the connector alone. Nothing here can leak a secret because nothing here has
 * one.
 *
 * It also buys the two things a redirect straight to the connector's
 * `/auth/login` cannot give us:
 *  - `hd`, which pins consent to the school's Workspace domain. Without it a
 *    student can connect a personal gmail, which breaks school eligibility.
 *  - `state`, which we mint and verify ourselves against an httpOnly cookie.
 */

/**
 * MUST stay identical to `scopes` in the connector's app/config.py.
 *
 * The connector rebuilds a Credentials object with its own hardcoded scope list
 * and Google validates the granted set during the code exchange. Request a
 * different set here and the exchange either drops permissions the agent needs
 * or throws outright. When config.py changes, change this in the same commit.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
  // Drafts only. There is deliberately no gmail.send anywhere in this product:
  // the agent proposes mail, a human sends it.
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file",
] as const;

/**
 * This app's own public origin, with no trailing slash.
 *
 * Configured rather than derived, and that is the point. On Cloud Run the
 * container is addressed as `0.0.0.0:8080` from inside, so anything built from
 * the incoming request -- `request.nextUrl.origin`, the `Host` header -- yields
 * that internal address and produces links no browser can follow. Only the
 * deployment knows the public name, so only the deployment gets to say it.
 */
export function appBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL is not set");
  return base.replace(/\/$/, "");
}

/** Where Google sends the student back. Must match the connector's
 *  OAUTH_REDIRECT_URI byte for byte, or the code exchange fails. */
export function redirectUri(): string {
  return `${appBaseUrl()}/onboarding/callback`;
}

/**
 * An identity token for calling the connector, or null when there is nobody to
 * ask for one.
 *
 * The connector is a private Cloud Run service: it exchanges authorisation
 * codes and writes refresh tokens to Secret Manager, so it is not something to
 * leave open to the internet. Cloud Run authorises those calls with an OIDC
 * token whose audience is the receiving service's URL, and on Cloud Run the
 * metadata server mints one for the runtime service account for free -- no
 * dependency, no key, nothing to rotate.
 *
 * Returns null off GCP, where there is no metadata server. That keeps local
 * development running unauthenticated instead of crashing, and the connector's
 * own 403 is a clearer report of that than a fetch error would be.
 */
export async function connectorIdToken(): Promise<string | null> {
  const url =
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity" +
    `?audience=${encodeURIComponent(connectorBaseUrl())}`;
  try {
    const res = await fetch(url, {
      headers: { "Metadata-Flavor": "Google" },
      cache: "no-store",
      // Off GCP this name does not resolve, but a hostile DNS wildcard could
      // make it hang. The call is to a link-local address when it is real.
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) {
      console.error("metadata identity token failed", res.status);
      return null;
    }
    return (await res.text()).trim() || null;
  } catch {
    // No metadata server: local development.
    return null;
  }
}

export function clientId(): string {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!id) throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set");
  return id;
}

export function connectorBaseUrl(): string {
  const url = process.env.CONNECTORS_API_URL;
  if (!url) throw new Error("CONNECTORS_API_URL is not set");
  return url.replace(/\/$/, "");
}

/** 32 bytes of CSPRNG, hex encoded. Node's webcrypto, so this runs on the edge
 *  runtime too if the callback ever moves there. */
export function randomState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Builds the consent URL.
 *
 * `access_type=offline` + `prompt=consent` are both required: offline asks for
 * a refresh token at all, and consent forces Google to re-issue one on a repeat
 * login. Without the second, a returning student gets no refresh token and the
 * connector 500s with "No refresh token returned".
 *
 * `include_granted_scopes` is deliberately absent. It makes Google return
 * previously granted scopes too, so the granted set stops matching the
 * requested set and oauthlib raises "Scope has changed" during the exchange.
 */
export function buildAuthUrl(opts: {
  emailDomain: string;
  /** The address to preselect. Since Firebase Auth now runs first, this is the
   *  student's *verified* email rather than the username they typed, so Google
   *  skips its chooser instead of merely narrowing it. */
  loginHint: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: opts.state,
    // The important one. Pins the account chooser to the school's Workspace
    // domain so a personal address cannot be connected by accident.
    hd: opts.emailDomain,
  });

  // A full address lets Google skip its own chooser and hand a federated school
  // straight to its IdP. `hd` alone still stops at Google's screen first.
  if (opts.loginHint) {
    params.set("login_hint", opts.loginHint);
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
