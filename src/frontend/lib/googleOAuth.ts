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
 * The one list of Google scopes this product asks for.
 *
 * This file owns it. It used to have to stay byte-identical to a `scopes` list
 * in the connector's app/config.py, because the connector rebuilt a Credentials
 * object from its own copy and google-auth compared the two sets on every
 * refresh. That list is gone: the connector now builds Credentials from a bare
 * access token (app/services/firestore_creds.py) and names no scopes at all, so
 * nothing on that side can disagree with this. Two places still mirror it by
 * hand and are worth a look when this changes:
 *
 *  - scripts/seed_credential.py in the connector, a dev tool that mints a
 *    refresh token the way onboarding does.
 *  - the `scopes` cross-reference on each row of data/access.ts, which tells
 *    the next editor which student-facing switch they have just made a liar.
 *
 * Narrowing this list is safe for students who already consented: google-auth
 * only raises on a scope it asked for and did not get, so an older, broader
 * grant still refreshes. Widening it is the direction that needs re-consent: a
 * token granted under the old list simply lacks the new scope, and the first
 * API call that needs it returns 403 until the student reconnects from
 * /dashboard/access.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
  // Drafts only. There is deliberately no gmail.send anywhere in this product:
  // the agent proposes mail, a human sends it.
  "https://www.googleapis.com/auth/gmail.compose",
  // Events only. Neither of these can delete a calendar, change its sharing, or
  // touch anything that is not an event, which the full `calendar` scope this
  // replaced could all do.
  //
  // They are also not equal, and the difference is worth knowing before editing
  // either line. `calendar.events` is the superset: read and write events on any
  // calendar the student can access. `calendar.events.owned` narrows the same
  // powers to calendars they own, so it grants nothing the line above does not
  // already grant, and is requested to state the intent rather than to add
  // reach. Google renders the first as "View and edit events on all your
  // calendars" and the second as "...and delete events on Google calendars you
  // own"; the two describe the same API surface in different words, because
  // Google publishes no events scope that can create without also being able to
  // delete. What actually holds the line is the connector, which calls
  // events().list and events().insert and owns no delete path at all.
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.events.owned",
  // Read only, and the one calendar scope here that is not about events.
  //
  // The two above can read and write events on any calendar the student can
  // reach, but neither can *name* those calendars: `calendarList.list` sits
  // outside both, so the connector could only ever address `primary`, and a
  // student whose course calendar is a second one, or one a TA shares with the
  // class, was invisible to Classy (issue #49). This lists them and does
  // nothing else. `calendar` and `calendar.readonly` would also list them and
  // were not taken: the first is the delete-everything scope docs/design/17
  // removed, and the second adds reading every event, setting and ACL, none of
  // which is needed to learn that a calendar exists. See docs/design/24.
  //
  // Added 2026-09-03. Anyone who consented before then holds a token without
  // it, and the connector answers `/calendar/calendars` with 403 until they
  // reconnect.
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  // Read only, and both of them: drive.py calls files().list, files().get,
  // export_media and get_media, and nothing that writes.
  //
  // `drive.file` is deliberately absent and must not come back without an
  // argument. It was the only scope in this set that could delete a file, and
  // docs/design/17 records that it was buying nothing: documents.create makes
  // the Doc by itself, and drive.readonly already covers reading one back.
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  // `documents`, NOT `documents.readonly`. The Docs API has no delete method,
  // so the full scope destroys nothing, and the read-only variant cannot call
  // documents().create -- which is the whole feature: "Start outlines in Docs"
  // in data/access.ts is a promise to create a document.
  "https://www.googleapis.com/auth/documents",
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

/**
 * The secret half, which only ever exists on this side of the network.
 *
 * Read through a function rather than at module scope so a missing value fails
 * on the request that needs it, naming itself, instead of at import time where
 * it would take the whole route down with a stack trace that points at a bundle.
 */
function clientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET is not set");
  return secret;
}

/** An error the callback can turn into one of the wizard's messages, rather
 *  than a generic failure. `code` matches the keys in OAUTH_ERRORS. */
export class GrantError extends Error {
  constructor(
    readonly code: "exchange" | "unreachable" | "incomplete",
    message: string,
  ) {
    super(message);
    this.name = "GrantError";
  }
}

/** What the exchange proves. Nothing here is stored raw: the refresh token goes
 *  straight into the envelope (lib/credentials.ts) and is never logged. */
export type GoogleGrant = {
  refreshToken: string;
  /** Google's stable subject id. */
  sub: string;
  /** Lowercased, and the only address in this flow Google has actually
   *  vouched for -- the one typed on the school step is just a claim. */
  email: string;
};

/**
 * Trades the authorization code for tokens. This is the step that used to
 * happen in the connector.
 *
 * It moved here because the connector no longer runs sign-in at all: it reads
 * credentials and calls Google APIs, and the code exchange is the one part of
 * that which belongs to whoever started the flow. See docs/ENCRYPTION_CONTRACT.md
 * §1, and docs/design/12 for why the frontend already owned the consent URL.
 *
 * `redirect_uri` is required by Google even though nothing is being redirected
 * here: it must byte-match the one that started the flow, and is what stops a
 * code stolen from one client being redeemed by another.
 */
export async function exchangeCode(code: string): Promise<GoogleGrant> {
  let res: Response;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cache: "no-store",
      body: new URLSearchParams({
        code,
        client_id: clientId(),
        client_secret: clientSecret(),
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
  } catch (err) {
    throw new GrantError("unreachable", `token endpoint unreachable: ${err}`);
  }

  // Google returns its reason in the body, and it is worth having in the log:
  // `invalid_grant` is a spent or expired code, `invalid_client` is our own
  // credentials being wrong, and treating those two as one failure is what
  // sends someone looking in the wrong place. The body carries no token on any
  // error path, so it is safe to keep.
  const payload = (await res.json().catch(() => ({}))) as {
    refresh_token?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok) {
    throw new GrantError(
      "exchange",
      `google refused the code: ${payload.error ?? res.status} ${payload.error_description ?? ""}`,
    );
  }

  if (!payload.id_token) {
    throw new GrantError("incomplete", "no id_token in the token response");
  }

  /*
   * No refresh token means the whole grant was pointless.
   *
   * Google only issues one when `access_type=offline` is on the consent URL,
   * and only *re-issues* one on a repeat login when `prompt=consent` is too.
   * Both are set in buildAuthUrl above and must stay: without a refresh token
   * the agent cannot act overnight, which is the entire product. Failing loudly
   * here beats writing a credential document with nothing useful in it.
   */
  if (!payload.refresh_token) {
    throw new GrantError(
      "incomplete",
      "google returned no refresh_token (is prompt=consent still set?)",
    );
  }

  const claims = decodeIdToken(payload.id_token);
  if (!claims.sub || !claims.email) {
    throw new GrantError("incomplete", "id_token carried no sub or email");
  }

  return {
    refreshToken: payload.refresh_token,
    sub: claims.sub,
    email: claims.email.toLowerCase(),
  };
}

/**
 * Reads the claims out of an ID token without verifying its signature.
 *
 * That is deliberate and it is what the spec asks for here. OpenID Connect Core
 * §3.1.3.7 allows TLS server validation to stand in for signature checking when
 * the token came directly from the token endpoint, which is exactly this case:
 * the response was fetched over TLS from accounts.google.com, in a request
 * authenticated with our client secret, and nothing untrusted touched it in
 * between. Verifying a signature against Google's JWKS would mean fetching and
 * caching a key set to re-prove a fact TLS has already established.
 *
 * This must not be copied to anywhere that accepts an ID token *from a client*.
 * There the signature is the only thing standing between you and a forged
 * identity, and it has to be checked -- which is what firebase-admin's
 * verifyIdToken does for the session route.
 */
function decodeIdToken(idToken: string): { sub?: string; email?: string } {
  const payload = idToken.split(".")[1];
  if (!payload) throw new GrantError("incomplete", "malformed id_token");
  const json = Buffer.from(payload, "base64url").toString("utf8");
  return JSON.parse(json) as { sub?: string; email?: string };
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
