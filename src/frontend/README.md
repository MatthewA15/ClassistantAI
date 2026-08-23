# Classistant frontend

Marketing site and onboarding funnel for Classistant, the school assistant that
lives in your text messages.

Next.js 15 (App Router), React 19, Tailwind CSS v4, TypeScript. No other runtime
dependencies.

## Running it

```bash
cd src/frontend
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build        # production build
npm run typecheck    # tsc --noEmit
```

## Pages

| Route | What it is |
| --- | --- |
| `/` | Landing page |
| `/onboarding` | Six-step setup wizard, plus the waitlist branch for unsupported schools |
| `/privacy` | Privacy policy |
| `/terms` | Terms of service |

## Layout

```
app/
  layout.tsx          fonts, metadata, the .js flag for scroll reveal
  globals.css         every design token, in one @theme block
  page.tsx            landing page composition
  onboarding/
    page.tsx
    actions.ts        server actions (validate only, see below)
  privacy/  terms/
components/
  brand/              LogoMark and Logo
  site/               Header, Footer, LegalLayout
  landing/            one file per landing section, plus glyphs.tsx
  onboarding/         wizard, school picker, form fields
  ui/                 primitives, Reveal, PlaceholderShot, PhoneThread
data/
  schools.ts          supported schools, source-verified
  legal.ts            entity details and sub-processors
```

## Things to know before you change something

**This is frontend only.** No database, no auth, no provider SDKs. The server
actions in `app/onboarding/actions.ts` do real validation and return the shape
the UI expects, with `TODO(backend)` markers where the integrations go. See
[docs/design/07-backend-contract.md](../../docs/design/07-backend-contract.md).

**The portal password must never be logged, echoed, or stored here.** There is a
comment saying so in `actions.ts`. Please leave it there.

**Screenshots are placeholders.** `PlaceholderShot` draws a skeleton of each real
screen so crop and rhythm are already right. Each carries a visible "Screenshot
placeholder" tag. Swap the skeleton for `<Image>`, keep the wrapper classes.

**The school list is a factual claim on a public page.** Nothing goes in as
`live` without a `source` URL from the school's own IT documentation, and the
whole list needs re-verifying each August. See
[docs/design/05-schools-data.md](../../docs/design/05-schools-data.md).

**The legal pages have not been reviewed by a lawyer,** and `data/legal.ts` still
has placeholder entity details. See
[docs/design/08-legal-pages.md](../../docs/design/08-legal-pages.md).

## House rules for copy and design

No purple. No em dashes. No badge chips above headings. Palette is dark blue,
light blue, and white, with the Google sign-in button as the single sanctioned
exception. Full reasoning in
[docs/design/02-design-system.md](../../docs/design/02-design-system.md).

## Design docs

All of it is written up in [docs/design/](../../docs/design/). Start with the
[README](../../docs/design/README.md).
