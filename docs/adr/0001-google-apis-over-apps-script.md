# ADR-0001: Official Google APIs + per-user OAuth instead of Apps Script

- **Status:** accepted
- **Date:** 2026-08-19
- **Deciders:** Matthew, team (call of Aug 19)

## Context
The connector layer must give the ADK agent access to Gmail, Calendar, and Drive. Apps Script was proposed as a quick path. Our agent stack is Python/ADK on Google Cloud Run, and judges reward a coherent single-platform architecture. The ADK integrations catalog has no pre-built Gmail/Calendar/Drive toolset, so something must be built either way.

## Decision
Build connectors as a Python FastAPI service calling the official Google APIs with per-user OAuth 2.0, exposed as HTTP tools to the ADK agent.

## Alternatives considered
- **Apps Script** — JavaScript runtime split from our Python stack; typically authenticates as the developer account rather than per-user; weaker story for a multi-user, governed platform.
- **ApplicationIntegrationToolset connectors** — pre-built but heavy GCP provisioning for a hackathon timeline; revisit post-MVP.
- **MCP via Composio** — kept as fallback if direct API integration hits blockers; plugs into ADK directly.

## Consequences
More upfront code (OAuth flow, token storage) but one language, one cloud, per-user auth, and a connector layer that doubles as a pitchable product ("the Gmail/Calendar/Drive toolset ADK doesn't ship").
