# Purpose

This document defines a lightweight, spec-driven development standard for using coding agents such as Claude Code to build and evolve software systems.

The goal is to give implementation agents just enough durable context to make good decisions without drowning them in stale or overly-detailed documentation.

This standard supports:

- **Greenfield projects**: seed the repo knowledge from structured questioning
- **Brownfield projects**: seed the repo knowledge from structured questioning plus codebase analysis
- **Ongoing delivery**: implement changes through task files with explicit acceptance criteria
- **Architectural continuity**: track ADRs, domains, and architectural areas through periodic re-indexing

This document defines the **standard only**. It is not intended to be loaded into implementation agents directly.

---

# Design Principles

## 1. Keep context minimal

Only store information that helps an implementation agent make better decisions repeatedly.

## 2. Prefer durable over incidental knowledge

Capture stable truths: architecture, domain boundaries, standards, invariants, decisions.
Avoid ephemeral noise: temporary debugging notes, meeting chatter, speculative ideas.

## 3. One concern per file

Each file should have a narrow role so agents know where to read and where to write.

## 4. Tasks are the unit of change

A requested change must live in exactly one task file.
Task files describe intent, constraints, acceptance criteria, and verification.

## 5. Maps over prose

Prefer navigable summaries and links over long essays.

## 6. Re-index instead of hand-maintaining everything

The system should periodically refresh architectural and domain knowledge from the codebase, especially for brownfield repositories or fast-moving projects.

---

# Repository Layout

```text
/ai/
  .last-indexed
  README.md
  PROJECT.md
  TECH_STACK.md
  ARCHITECTURE.md
  DOMAIN_MAP.md
  domains/
    <domain-slug>.md
  adr/
    <slug>.md
  tasks/
    TASK-<slug>.md
```

---

# File Responsibilities

## `/ai/.last-indexed`

Tracks the last known indexing point so a re-indexer can diff the repo and update only what changed.

It should contain:

- commit hash
- timestamp

This file is machine-oriented and intentionally tiny.

### Minimal template

```text
commit: <git-sha>
timestamp: <iso-8601>
```

---

## `/ai/README.md`

The entry point for agents and humans.

It should explain:

- what the project is
- where to start reading
- what each file in `/ai` is for
- where active tasks live

It should be short and highly navigable.

### Minimal template

```md
# AI Context

## What this repo is

<1-3 paragraph summary>

## Start here

- [PROJECT.md](./PROJECT.md)
- [TECH_STACK.md](./TECH_STACK.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [DOMAIN_MAP.md](./DOMAIN_MAP.md)

## Domains

- [<domain-name>](./domains/<domain-slug>.md)

## Architectural decisions

- [<decision-title>](./adr/<slug>.md)
```

---

## `/ai/PROJECT.md`

Defines the product and business intent behind the software.

It should capture:

- what the product does
- who it is for
- the core problem
- the product ethos
- key success qualities
- non-goals or anti-goals

This is where agents get judgment, not implementation detail.

### Minimal template

```md
# Project

## Summary

<what the software is>

## Users

<who it serves>

## Problem

<what pain/problem it solves>

## Why this exists

<business or product intent>

## Product ethos

- <principle>
- <principle>
- <principle>

## Success qualities

- <quality>
- <quality>
- <quality>

## Non-goals

- <not in scope>
- <not in scope>
```

---

## `/ai/TECH_STACK.md`

Defines the technical operating model.

It should capture:

- languages and frameworks
- major infrastructure/runtime choices
- coding conventions
- testing expectations
- local dev workflow
- build/run/test commands
- deployment or release notes if truly important

It should not become a full onboarding handbook.

### Minimal template

```md
# Tech Stack

## Core stack

- Language(s): <...>
- Framework(s): <...>
- Data store(s): <...>
- Infra/runtime: <...>

## Coding standards

- <standard>
- <standard>

## Testing standards

- Unit tests: <expectation>
- Integration tests: <expectation>
- End-to-end tests: <expectation>

## Local workflow

- Install: `<command>`
- Run: `<command>`
- Test: `<command>`
- Lint/format: `<command>`

## Delivery notes

- <important constraint>
- <important constraint>
```

---

## `/ai/ARCHITECTURE.md`

Defines the high-level shape of the system.

It should capture:

- major components/subsystems
- boundaries and responsibilities
- key data flows
- important integration points
- links to relevant domains

It should stay at the level of architecture, not file-by-file implementation.

### Minimal template

```md
# Architecture

## System overview

<high-level description>

## Major components

- **<component>**: <responsibility>
- **<component>**: <responsibility>

## Boundaries

- <boundary>
- <boundary>

## Key data flows

1. <flow>
2. <flow>

## External integrations

- <integration>: <purpose>

## Domain links

- [<domain-name>](./domains/<domain-slug>.md)
```

---

## `/ai/DOMAIN_MAP.md`

A navigation map of the domains in the codebase.

This is the bridge between architecture and implementation.

It should capture:

- domain names
- their responsibilities
- their primary ownership boundaries
- links to per-domain files

It should remain concise.

### Minimal template

```md
# Domain Map

## Domains

- **<domain-name>** — <short description>  
  Link: [domains/<domain-slug>.md](./domains/<domain-slug>.md)

- **<domain-name>** — <short description>  
  Link: [domains/<domain-slug>.md](./domains/<domain-slug>.md)
```

---

## `/ai/domains/<domain-slug>.md`

Defines one domain or architectural area.

It should capture:

- purpose
- responsibilities
- invariants
- interfaces
- important flows
- dependencies
- notable implementation constraints

This is the most useful document for change execution inside a bounded area.

### Minimal template

```md
# <Domain Name>

## Purpose

<why this domain exists>

## Responsibilities

- <responsibility>
- <responsibility>

## Invariants

- <must always be true>
- <must always be true>

## Interfaces

- Inputs: <...>
- Outputs: <...>
- Public APIs/events: <...>

## Key flows

1. <flow>
2. <flow>

## Dependencies

- Upstream: <...>
- Downstream: <...>

## Constraints

- <technical or business constraint>

## High level code locations

- [high level code file (no line numbers)]
```

---

## `/ai/adr/<slug>.md`

Captures a single important architectural decision.

ADRs should exist only for decisions that affect future implementation judgment.

Examples:

- framework choice
- state management strategy
- eventing vs synchronous orchestration
- multi-tenant isolation model
- testing strategy choice

Do not create ADRs for trivial or obvious decisions.

### Minimal template

```md
# ADR: <Decision Title>

## Status

<proposed | accepted | superseded>

## Context

<why this decision matters>

## Decision

<what was chosen>

## Consequences

- Positive: <...>
- Negative: <...>

## Alternatives considered

- <alternative> — <why not chosen>
```

---

## `/ai/tasks/TASK-<slug>.md`

Defines one requested change.

This is the only canonical place describing a change request.

A task file should contain:

- problem or request
- relevant context
- scope
- out-of-scope items
- acceptance criteria
- verification checklist

It may also link to domains or ADRs, but it should not duplicate them excessively.

### Minimal template

```md
# TASK: <Short Title>

## Summary

<the requested change>

## Motivation

<why this is needed>

## Relevant context

- Domains: <...>
- Files/components: <...>
- ADRs: <...>

## Scope

- <in scope>
- <in scope>

## Out of scope

- <not in scope>
- <not in scope>

## Acceptance criteria

- [ ] <criterion>
- [ ] <criterion>
- [ ] <criterion>

## Verification checklist

- [ ] Code implemented
- [ ] Tests added/updated
- [ ] Lint/format passed
- [ ] Manual verification completed
- [ ] Docs updated if needed
```

---

# Greenfield Seeding Workflow

For a greenfield project, the system should create the initial `/ai` files by asking targeted questions and synthesizing the answers into minimal durable docs.

## Objectives

- establish product intent
- establish technical direction
- establish initial architecture
- define early domains
- avoid over-specifying details not yet decided

## Recommended flow

### 1. Project discovery

Ask focused questions about:

- what the product does
- target users
- user problems
- primary workflows
- success criteria
- non-goals

Use answers to seed:

- `PROJECT.md`

### 2. Technical discovery

Ask focused questions about:

- language/framework preferences
- persistence layer
- hosting/runtime
- testing expectations
- developer workflow
- constraints around performance, compliance, scale, or cost

Use answers to seed:

- `TECH_STACK.md`

### 3. Initial architecture shaping

Ask focused questions about:

- major functional areas
- external systems
- data movement
- trust boundaries
- synchronous vs asynchronous workflows
- likely modules/domains

Use answers to seed:

- `ARCHITECTURE.md`
- `DOMAIN_MAP.md`
- initial `domains/*.md`

### 4. Early ADR capture

Only create ADRs for major decisions already made.
Do not force ADR creation if the project is still exploratory.

### 5. Readme assembly

Generate `README.md` last so it links to the seeded files.

---

# Brownfield Seeding Workflow

For a brownfield project, the system should combine structured questioning with repo analysis.

## Objectives

- understand what the system is supposed to do
- understand what the code actually does today
- extract coding norms from reality, not aspiration
- detect existing domains and architecture
- document without rewriting the repo’s history

## Recommended flow

### 1. Intent discovery

Ask the same core product and technical questions as greenfield, but treat answers as guidance rather than truth until cross-checked against the codebase.

### 2. Codebase analysis

Inspect the repository to infer:

- major modules and directories
- runtime boundaries
- integration points
- core data models
- recurring coding patterns
- testing setup
- linting/formatting rules
- naming conventions
- build/dev commands
- architectural hotspots

### 3. Reconcile stated vs actual

Where the code and user description differ:

- prefer documenting **actual current state**
- optionally note major drift in concise terms
- avoid inventing a target-state architecture unless explicitly asked

### 4. Seed documents

Generate:

- `PROJECT.md` from user intent + observed system purpose
- `TECH_STACK.md` from actual tools and standards in use
- `ARCHITECTURE.md` from observed structure
- `DOMAIN_MAP.md` from major bounded areas
- `domains/*.md` from real modules
- ADRs only where decisions are visible and materially important

### 5. Keep it approximate where needed

Brownfield systems are often messy.
It is acceptable for the first pass to describe “best current understanding” rather than perfect truth.

---

# Re-indexing Standard

A periodic re-indexing agent should refresh the `/ai` layer as the repo evolves.

Its purpose is not to rewrite everything, but to detect drift and update stable docs carefully.

## Re-indexer responsibilities

- read `.last-indexed`
- diff current repo state against prior indexed commit
- identify changed architectural areas
- update `TECH_STACK.md` if real stack conventions changed
- update `ARCHITECTURE.md` if major boundaries or flows changed
- update relevant `domains/*.md`
- update `DOMAIN_MAP.md` when domains are added, merged, renamed, or removed
- suggest or add ADRs when a major decision becomes clear
- refresh `.last-indexed`

## Re-indexer rules

### 1. Be conservative

Do not rewrite docs for incidental refactors.

### 2. Update only what changed

Prefer targeted edits over full regeneration.

### 3. Respect human-authored intent

If a document contains purposeful judgment, do not flatten it into generic summaries.

### 4. Document current state, not aspirations

Unless a task explicitly requests future-state planning.

### 5. Avoid noise

Do not add low-signal details such as every folder, every class, or every endpoint.

---

# Change Execution Model

This standard intentionally keeps change management simple.

Roadmapping and planning may happen outside the system.
The formal input to an implementation agent is a task file plus the relevant `/ai` context.

## Rule: one task, one requested change

A change should be described in a single `TASK-*.md` file.

## Recommended implementation input

An implementation agent should usually read:

- `README.md`
- the task file
- relevant domain files
- relevant ADRs
- optionally `ARCHITECTURE.md` and `TECH_STACK.md`

## Task lifecycle

### 1. Create task

Add a `TASK-<slug>.md` file.

### 2. Implement

Agent performs the change against the codebase.

### 3. Verify

Agent checks acceptance criteria and verification checklist.

### 4. Re-index if needed

If the task changed architecture, domain boundaries, or technical standards, refresh the affected docs.

---

# Authoring Rules

These rules keep the system useful to agents.

## Prefer short sections

Most files should be skimmable in under a few minutes.

## Prefer bullets over essays

Especially for responsibilities, invariants, boundaries, and criteria.

## Avoid duplication

If architecture is described in `ARCHITECTURE.md`, domain files should link or specialize rather than restate everything.

## Mark uncertainty honestly

Use phrases like:

- “Current observed behavior”
- “Best current understanding”
- “Needs confirmation”

## Use stable names

Domain names and file names should not change casually.

## Avoid speculative detail

Do not document imagined future architecture unless a task explicitly requests it.

---

# What Belongs Where

## Put it in `PROJECT.md` when it explains:

- why the product exists
- who it serves
- what good looks like

## Put it in `TECH_STACK.md` when it explains:

- how the team builds and tests
- the concrete tools and standards in use

## Put it in `ARCHITECTURE.md` when it explains:

- major system structure
- boundaries
- data flow

## Put it in `DOMAIN_MAP.md` when it explains:

- how to navigate the system by area

## Put it in `domains/*.md` when it explains:

- local behavior and invariants of one bounded area

## Put it in `adr/*.md` when it explains:

- a meaningful architectural decision with tradeoffs

## Put it in `tasks/*.md` when it explains:

- a specific requested change

---

# What Not To Do

- Do not turn `/ai` into a second codebase
- Do not document every file or function
- Do not duplicate README-level content across all files
- Do not create ADRs for trivial choices
- Do not put change requests in architecture or domain docs
- Do not let task files become product roadmaps
- Do not let re-indexing overwrite careful human judgment without cause

---

# Success Criteria For This Standard

This standard is working if:

- a new implementation agent can understand the project quickly
- a brownfield repo can be summarized without massive manual effort
- requested changes are consistently implemented from task files
- architecture drift is periodically corrected
- the `/ai` folder stays lean enough to remain trustworthy

---

# Minimal Example File Set

```text
/ai/
  .last-indexed
  README.md
  PROJECT.md
  TECH_STACK.md
  ARCHITECTURE.md
  DOMAIN_MAP.md
  domains/
    auth.md
    billing.md
    reporting.md
  adr/
    event-driven-sync.md
    postgres-as-source-of-truth.md
  tasks/
    TASK-add-export-csv.md
```

---

# Final Note

This system is intentionally small.

Its job is not to fully specify the software.
Its job is to preserve enough product, technical, and architectural context that coding agents can make better decisions repeatedly and safely.
