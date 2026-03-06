# ADR: Claude Code OAuth as Primary Authentication

## Status

accepted

## Context

Agent Harness wraps Claude Code as its first agent backend. Claude Code supports both API key authentication and OAuth login (user's Claude subscription plan). The OAuth plan is significantly more cost-effective for individual developers, who are the target users.

## Decision

Support Claude Code OAuth login (user's subscription plan) as the primary authentication method. API key authentication is secondary.

## Consequences

- Positive: dramatically lower cost for users on Claude subscription plans
- Positive: no need for users to manage API keys
- Positive: aligns with target user profile (individual developers)
- Negative: depends on Claude Code's OAuth flow, which may change
- Negative: OAuth tokens require refresh handling
- Negative: may not work in fully headless environments without prior login

## Alternatives considered

- **API key only** — simpler to implement but far more expensive for individual users
- **Support both equally** — adds complexity; OAuth should be the default path
