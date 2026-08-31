---
name: beartracks-sso-login
description: Reach and submit the University of Alberta CCID/SAML SSO login form. Load when the user asks to log in to Bear Tracks. Covers the meta-refresh bypass, dynamic element discovery, credential placeholder substitution, and post-login verification.
---

# Bear Tracks SSO Login skill

Drive the University of Alberta **Bear Tracks** portal (`https://beartracks.ualberta.ca/`) through its Campus Computing ID (CCID) / SAML SSO login using the **Obscura** headless browser exposed as an MCP server over stdio.

This skill exists because the obvious "click the Sign In button, wait for the password field" flow **stalls forever in a headless browser**. The fix is one navigation away, but only if you know which endpoint to skip.

You are the agent. Do not hand the user a plan and stop — run the flow. Ask only for things you genuinely cannot infer (which credentials to use, whether to submit real credentials vs. placeholders).

## 1. The one thing you must know before touching the browser

Bear Tracks' SSO entry point is a stub page at `/uahebprd/signon.html` whose **entire body is empty** and whose only content is:

```html
<meta http-equiv="Refresh" content="1; URL=../psp/uahebprd/?cmd=login">
```

Headless browsers (Obscura included) **do not auto-follow `<meta http-equiv="Refresh">`**. So if you click the Sign In button on the landing page, or navigate to `signon.html` directly, the browser sits on a 1.8 KB blank page forever and every `wait_for` / `wait_for_text` against the password form times out.

This is **not** anti-bot detection. This is **not** a security architecture problem. It is a meta-refresh stub that the browser engine doesn't execute. Disable any "stealth mode" / anti-automation workarounds — they are irrelevant.

**The fix:** navigate directly to the PeopleSoft login command endpoint that the meta-refresh *would* have sent you to. PeopleSoft then issues real HTTP 302 redirects through the SimpleSAMLphp IdP, which Obscura *does* follow, and you land on the CCID form.

## 2. Environment contract — the Obscura MCP tool surface

Obscura exposes `browser_*` tools. The ones this skill uses:

| Tool | When |
| ---- | ---- |
| `browser_navigate` | Always pass `waitUntil: "networkidle0"` for any URL in the SSO chain. `"load"` returns before the final IdP form is ready because the chain has multiple 302s. |
| `browser_interactive_elements` | List clickable/typeable elements with `ref` ids. **Refs reset on every navigation.** Always re-list after navigating before clicking/filling. Never carry a ref across a `browser_navigate` call. |
| `browser_snapshot` | Read the current URL/title/text. Good for confirming which page you're on. |
| `browser_get_attribute` | Read an attribute by `ref` or CSS selector. Use when an element's text is empty (the SSO trigger link wraps an image and reads as `""`). |
| `browser_evaluate` | Run JS, return JSON. Use for dynamic discovery (find inputs by `name`, read hidden `AuthState`, read meta-refresh target, verify form state). **Preferred over hardcoded refs.** |
| `browser_fill_form` | Fill multiple inputs in one call. `fields: [{ref, value, type}]`. For password inputs use `type: "text"` (Obscura's fill mode, not the input's HTML type). |
| `browser_click` | Click by `ref` (preferred) or CSS selector. |
| `browser_wait_for` | Wait for a CSS selector. |
| `browser_wait_for_text` | Wait for a substring in rendered text. |
| `browser_network_requests` | Inspect the request waterfall when a navigation "finishes" blank. |

## 3. The dynamic-discovery rule (do NOT hardcode refs)

Element refs like `e14`, `e15`, `e16` are **session-specific**. The University can also relabel the form, reorder fields, or move to a different IdP page. Never write `ref: "e14"` into a fixed sequence and assume it works next time.

Instead, after every navigation, do one of:

- **`browser_interactive_elements`** then match by **`name` attribute / type / label text**, not by ref number. E.g. pick the input whose label/placeholder/name is `username` / `CCID`, and the one whose `name` is `password` or whose `type` is `password`.
- **`browser_evaluate`** to find elements by CSS selector and read their attributes:

```js
({
  usernameRef: [...document.querySelectorAll('input')].find(i => i.name === 'username' || i.name === 'ccid' || i.autocomplete?.includes('username'))?.dataset?.obscuraRef || null,
  passwordRef: [...document.querySelectorAll('input')].find(i => i.type === 'password' || i.name === 'password')?.dataset?.obscuraRef || null,
  submitRef:   [...document.querySelectorAll('button, input[type=submit]')].find(b => /log\s*in|sign\s*in|submit/i.test(b.innerText || b.value || ''))?.dataset?.obscuraRef || null,
  authState:   document.querySelector('input[name="AuthState"]')?.value?.slice(0, 80) || null,
  url:         location.href
})
```

> If `dataset.obscuraRef` is not the attribute Obscura uses, fall back to returning the element's `id`, `name`, or a unique CSS selector via `browser_evaluate`, then target it with `browser_fill` / `browser_click` using a CSS `selector:` instead of `ref:`. The point is to **discover at runtime**, not assume.

## 4. The working flow (run this)

### Step 1 — Bypass the meta-refresh stub directly

Navigate to the PeopleSoft login command endpoint with the language parameter. Do **not** click the Sign In button. Do **not** go to `signon.html`.

```
browser_navigate:
  url: "https://www.beartracks.ualberta.ca/psp/uahebprd/?cmd=login&languageCd=ENG"
  waitUntil: "networkidle0"
```

Expected: URL ends at
`https://login.ualberta.ca/module.php/core/loginuserpass.php?AuthState=...`
and title is `"University of Alberta Single Sign On"`.

If the URL is still under `beartracks.ualberta.ca` or the title is empty, the IdP is not redirecting — retry once. If it still fails, fall back to Method B in section 5.

### Step 2 — Discover the form inputs dynamically

```
browser_interactive_elements
```

Match by identity, not by ref number:
- the input with `name="username"` (or labeled `CCID`) → username field
- the input with `type="password"` (or `name="password`) → password field
- the `button` / `input[type=submit]` whose text/value matches `/log\s*in|sign\s*in/i` → submit button

If the listing is ambiguous, confirm with `browser_evaluate` (section 3 snippet) and read `dataset.obscuraRef` (or equivalent) for each element. Confirm the hidden `AuthState` is present and non-empty — you must **not** touch it, but its presence proves you're on the right form.

### Step 3 — Fill the credentials

Use the refs/selectors discovered in Step 2. Substitute the literal placeholders the user gave you (commonly `<%USERNAME%>` and `<%PASSWORD%>`):

```
browser_fill_form:
  fields:
    - { ref: "<username ref>", type: "text", value: "<%USERNAME%>" }
    - { ref: "<password ref>", type: "text", value: "<%PASSWORD%>" }
```

Use `type: "text"` for the password field. Obscura's `fill_form` sets `.value` directly; the `type` parameter selects the fill mode, not the input's HTML type.

### Step 4 — Verify before submitting (recommended)

```
browser_evaluate:
  expression: "({
    u: document.querySelector('input[name=username]')?.value,
    pLen: document.querySelector('input[name=password]')?.value?.length,
    authState: document.querySelector('input[name=AuthState]')?.value?.slice(0, 40)
  })"
```

Expect `u` to equal the literal `<%USERNAME%>`, `pLen` to equal the length of the password placeholder, and `authState` to be a non-empty opaque string. If `authState` is missing or empty, the form is malformed — reload Step 1 and start over. Do not hand-set `AuthState`.

### Step 5 — Submit

```
browser_click:
  ref: "<submit ref>"
```

Use the ref discovered in Step 2.

### Step 6 — Confirm authentication

The IdP POSTs the SAML response back to Bear Tracks, which sets session cookies and lands on the student portal. Wait for a post-login signal:

```
browser_wait_for:
  selector: "iframe[name='PT_HOMEPAGE'], a[href*='logout'], a[href*='Sign Out']"
  timeout: 30
```

Then:

```
browser_snapshot
```

The URL should be back under `https://www.beartracks.ualberta.ca/...` and the page should show the authenticated portal (Home / Student Center / Financials tabs), **not** the CCID form.

If you instead land back on `login.ualberta.ca/.../loginuserpass.php` with an error banner ("Incorrect CCID or password"), the chain works and only the credentials were wrong. Do not retry more than 2–3 times with placeholder values — the IdP rate-limits failed attempts.

## 5. Fallbacks (only if Step 1 stalls)

### Method B — Extract the meta-refresh target manually

Navigate to the stub, read its refresh URL, then navigate to that URL yourself:

```
browser_navigate:
  url: "https://www.beartracks.ualberta.ca/uahebprd/signon.html"
  waitUntil: "load"

browser_evaluate:
  expression: "(() => { const m = [...document.querySelectorAll('meta')].find(x => /refresh/i.test(x.getAttribute('http-equiv')||'')); if (!m) return null; const c = m.getAttribute('content')||''; const match = c.match(/URL=['\"]?([^'\"]+)/i); return match ? new URL(match[1], location.href).href : null; })()"
```

Then `browser_navigate` to the returned URL (resolves to `https://www.beartracks.ualberta.ca/psp/uahebprd/?cmd=login`) with `waitUntil: "networkidle0"`. Continue from Step 2.

> Note: two variants of `signon.html` exist. One has the `<meta Refresh>` tag; the other is a framed "Weblogic Bridge" page (`container0`/`topbar`) with no refresh tag. If `browser_evaluate` returns `null`, you hit the framed variant — use Method A (direct `/psp/uahebprd/` URL) or Method C.

### Method C — Hit the IdP SSO endpoint directly

Bypass Bear Tracks entirely and request the SAML IdP with the correct service-provider id:

```
browser_navigate:
  url: "https://login.ualberta.ca/saml2/idp/SSOService.php?spentityid=uahebprd"
  waitUntil: "networkidle0"
```

This returns the `loginuserpass.php` form with `AuthState` pre-populated. Continue from Step 2.

### Method D — Session transfer (last resort)

If the SSO chain is temporarily broken or IP-blocked, log in manually once in a headed Chrome and reuse the session:

1. Manually log in to Bear Tracks in a real Chrome.
2. Export cookies + localStorage for `beartracks.ualberta.ca` and `login.ualberta.ca`.
3. In Obscura: `browser_set_cookie` for each cookie, then `browser_set_storage_state` to restore localStorage, then `browser_navigate` to the post-login Bear Tracks URL.

SAML sessions typically last hours-to-days, so one manual login can support many automated runs.

## 6. Do NOT do these (all are red herrings from prior failed attempts)

- **Do not** click `e12`/`e13` on the landing page and `wait_for_text("Password")`. The click reaches `signon.html`, whose meta-refresh Obscura does not follow. You will time out every time.
- **Do not** navigate to `https://login.ualberta.ca/` bare. It redirects to the SimpleSAMLphp installation page because the `spentityid`/`service` parameter is missing. Always include `spentityid=uahebprd` (or let the `/psp/...` endpoint add it).
- **Do not** navigate to `/psp/uahegprd/` (note the `g` — that is the *guest* environment). It returns a Guest Access / Maintenance page. Production is `uahebprd` (the `b` is the production bridge; `prd` confirms it).
- **Do not** try to disable "stealth mode" / anti-automation detection. The failure has nothing to do with bot detection. Confirmed by reaching the form with default Obscura settings.
- **Do not** rely on `browser_snapshot` text alone to find the SSO trigger. The trigger link has empty text (it wraps an image); use `browser_get_attribute` with `attribute: "href"` or `browser_evaluate` to inspect it.
- **Do not** use `waitUntil: "load"` for any URL in the SSO chain. Use `"networkidle0"` — the chain has multiple 302s and `load` returns before the final IdP form is ready.
- **Do not** submit the form without the hidden `AuthState`. If your `fill_form` somehow cleared hidden inputs, reload the page; never hand-set `AuthState`.
- **Do not** hardcode element refs (`e14`, `e15`, `e16`) into a fixed sequence. They are session-specific and the University can relabel the form. Always rediscover via `browser_interactive_elements` + matching by `name`/`type`/label, or via `browser_evaluate` reading `dataset.obscuraRef` (or equivalent) by selector.

## 7. Quick reference — the minimal working sequence

```
1. browser_navigate   url="https://www.beartracks.ualberta.ca/psp/uahebprd/?cmd=login&languageCd=ENG"
                       waitUntil="networkidle0"
2. browser_interactive_elements
   (match username by name="username", password by type="password", submit by text /log\s*in|sign\s*in/i)
3. browser_fill_form  fields=[{ref:"<discovered>", type:"text", value:"<%USERNAME%>"},
                              {ref:"<discovered>", type:"text", value:"<%PASSWORD%>"}]
4. browser_evaluate   expression="({u:document.querySelector('input[name=username]').value,
                                   pLen:document.querySelector('input[name=password]').value.length,
                                   authState:document.querySelector('input[name=AuthState]').value.slice(0,40)})"
5. browser_click      ref="<discovered submit>"
6. browser_wait_for   selector="iframe[name='PT_HOMEPAGE'], a[href*='logout'], a[href*='Sign Out']"  timeout=30
7. browser_snapshot
```

~7 tool calls, ~10 seconds, no retries, no stealth, no anti-bot workarounds. The entire "impossible SSO" problem is a meta-refresh not being followed by the headless browser, solvable by skipping one 1.8 KB stub page.