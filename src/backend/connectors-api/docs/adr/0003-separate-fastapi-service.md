# ADR-0003: Connectors as a separately deployed FastAPI service

- **Status:** accepted
- **Date:** 2026-08-19
- **Deciders:** Matthew, agent-side teammate

## Context
The ADK agent and the connector layer are owned by different teammates on a 3-day timeline. Coupling both in one codebase would serialize work.

## Decision
Connectors ship as their own FastAPI service on Cloud Run. The ADK agent calls it over HTTP; the teammate builds dummy tools against `API_CONTRACT.md` today and swaps in the live base URL when deployed. The contract is frozen for Aug 22 (additive changes only).

## Alternatives considered
- **Single monorepo/service** — simpler deploy, but blocks parallel work and mixes agent and connector concerns.
- **ADK function tools in-process** — ties connector lifecycle to the agent runtime; harder to reuse for the AWS/CALL-E submissions.

## Consequences
Two deploys to manage, but parallel development, independent scaling, and a connector service reusable across all three hackathon submissions.
