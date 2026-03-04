# Stack Research

**Domain:** CLI tool for coding agent orchestration with Docker isolation and concurrent workflow execution
**Researched:** 2026-03-04
**Confidence:** MEDIUM (web tools unavailable; versions from training data through Aug 2025 — verify before pinning)

---

## Verification Note

WebSearch and WebFetch were unavailable during this research session. Version numbers below reflect knowledge through August 2025. **Before finalizing package.json, run `npm show <package> version` for each library to confirm current stable releases.** The technology choices themselves are high-confidence; the specific version numbers are the uncertain part.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22.x LTS | Runtime | Long-term support, native ESM, stable `--watch` mode, strong Docker tooling ecosystem. TypeScript first-class. 22.x is current LTS as of 2025. |
| TypeScript | 5.x | Language | Type safety for complex workflow graph types, container state machines, and IPC message schemas. Non-negotiable for a tool this stateful. |
| Commander.js | 12.x | CLI framework | De-facto standard for Node.js CLI tools. Lightweight, zero magic, well-typed with TypeScript. Does not force a plugin architecture you don't need. |
| dockerode | 4.x | Docker SDK | The standard Node.js Docker Engine API client. Wraps the Docker socket directly — no subprocess shelling. Supports container lifecycle, exec, attach, streams. |
| simple-git | 3.x | Git integration | Typed, promise-based wrapper around git CLI. Needed for worktree management (one worktree per task), branch creation, and commit tracking. |
| Zod | 3.x | Schema validation | Validate YAML/JSON workflow configs at load time with excellent TypeScript inference. Industry standard for runtime validation. |
| js-yaml | 4.x | YAML parsing | Parse declarative workflow files. Lightweight, well-maintained, no surprises. |
| p-queue | 8.x | Concurrent task queue | Controls concurrency of in-flight container tasks. Simple priority queue with concurrency limits. ESM-native. |
| execa | 9.x | Subprocess execution | ESM-native, typed subprocess management. Used for invoking Claude Code inside containers or for git commands where simple-git falls short. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ink | 5.x | Rich CLI output (React for terminals) | Use if task status display grows beyond simple log lines — concurrent task status board. Do NOT add in MVP; add when `console.log` output becomes unreadable. |
| chalk | 5.x | Terminal color | Color-coded status output (running/done/error). ESM-native v5+. Add from day one for readability. |
| ora | 8.x | Spinners | Per-task progress spinners. Use when single-task feedback matters; skip if using ink for multi-task display. |
| conf | 12.x | Persistent user config | Store operator preferences (default image, concurrency limits). Wraps OS-appropriate config directory. |
| pino | 9.x | Structured logging | JSON-structured logs for debugging container lifecycle and workflow execution. Essential for non-interactive/CI use. |
| yaml | 2.x | YAML stringify (bidirectional) | If you need to write YAML back (e.g., output manifests). `js-yaml` is parse-only focused; `yaml` package handles round-trips cleanly. |
| @anthropic-ai/claude-code | latest | Claude Code SDK | Official SDK for programmatic Claude Code invocation if available; otherwise use subprocess + execa. Verify existence before depending on it. |
| socket.io or WebSocket (ws) | 8.x / 8.x | IPC for agent questions | Surfacing agent questions from inside container to CLI host. A lightweight WebSocket server in the host CLI; container agent POSTs question, host CLI blocks on reply. |
| eventemitter3 | 5.x | Internal event bus | Decoupled communication between workflow executor, container manager, and CLI layer. Prefer over Node's built-in EventEmitter for typed events. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| tsx | TypeScript execution | Run `.ts` files directly in development without a build step. Use `tsx watch` for hot reload. Faster than `ts-node`. |
| tsup | Build/bundle | Bundles TypeScript to CJS+ESM dual output for npm distribution. Zero-config for CLI tools. |
| vitest | Testing | ESM-native, fast, Jest-compatible API. Co-locate tests with source. Required for testing workflow graph logic and container state machines. |
| eslint + @typescript-eslint | Linting | Standard TypeScript linting. Catch async/await mistakes early — critical in a concurrent system. |
| prettier | Formatting | Consistent code style. Set once, forget. |
| @types/dockerode | Type definitions | Type stubs for dockerode. Install alongside dockerode. |
| @types/js-yaml | Type definitions | Type stubs for js-yaml. |

---

## Installation

```bash
# Core runtime
npm install commander dockerode simple-git zod js-yaml p-queue execa chalk eventemitter3 pino

# Supporting
npm install conf ora ws

# Dev dependencies
npm install -D typescript tsx tsup vitest eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier @types/node @types/dockerode @types/js-yaml @types/ws
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Commander.js | @oclif/core | Use oclif when building a plugin-extensible CLI platform (like Heroku CLI). Overkill here — adds generator scaffolding and plugin loader complexity you won't use. |
| Commander.js | Yargs | Yargs is fine but Commander has better TypeScript ergonomics and more predictable subcommand structure. Yargs is better for heavily nested argument parsing. |
| dockerode | Dockerode alternatives / `docker` CLI subprocess | Shell subprocess to `docker` CLI works but loses streaming attach, typed responses, and proper error objects. dockerode wraps the API directly. |
| p-queue | BullMQ | BullMQ requires Redis, adds operational overhead. BullMQ is correct when you need persistence, retry-across-restart, and distributed workers. For local in-process concurrency, p-queue is the right tool. |
| p-queue | async.js | async.js is legacy callback-style. p-queue is promise-native and ESM-first. |
| simple-git | isomorphic-git | isomorphic-git is pure JS (no system git required) but lacks worktree support — a core requirement here. simple-git delegates to system git, which is fine since we control the environment. |
| Zod | Joi / Yup | Zod has superior TypeScript inference — the inferred type IS the schema. Joi and Yup require manual type duplication. |
| execa | child_process | Node's built-in `child_process` is verbose, error-prone with stream handling, and requires manual promise wrapping. execa is the typed, ergonomic wrapper the community uses. |
| pino | Winston | Pino is 5-10x faster (async writes), JSON-first, and has a smaller footprint. Winston has richer transports but is overkill for a CLI tool. |
| ink | blessed / terminal-kit | Blessed is largely unmaintained. ink uses React model which is familiar and composable. Only adopt ink if raw `chalk` + `ora` output becomes insufficient. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| @oclif/core | Forces plugin architecture, generators, and config conventions designed for Salesforce/Heroku-scale CLIs. This project's subcommands are simple; Commander handles it without the overhead. | Commander.js |
| ts-node | Slower startup than `tsx`, less maintained, has known ESM interop issues. The ecosystem has moved to `tsx` for development execution. | tsx |
| inquirer (v8 and below) | The legacy callback API is confusing. The project uses agent questions surfaced over IPC, not local readline prompts — so full inquirer is likely unnecessary anyway. | readline/promises (built-in Node) or @inquirer/prompts for any local CLI prompts |
| BullMQ / Redis | Introduces a stateful external service dependency for what is fundamentally an in-process concurrency problem. Adds Docker Compose requirements and operational complexity before v1 is even validated. | p-queue |
| glob (v8 and below) | Old API, not ESM-native. | fast-glob (ESM-native, faster) or Node 22's built-in `fs.glob` |
| dotenv | Loading `.env` files for a CLI tool is an antipattern — config should come from flags, env vars directly, or the `conf` persistent config store. | OS env vars + conf |
| Webpack | Overconfigured for bundling a CLI tool. tsup handles TypeScript → CJS/ESM bundling with zero config. | tsup |
| Jest | ESM support in Jest requires babel transforms and is fragile. Vitest is Jest-compatible and ESM-native. | vitest |

---

## Stack Patterns by Variant

**If IPC for agent questions uses HTTP (simpler, stateless):**
- Use `fastify` (lightweight, fast, typed) rather than a raw `http.createServer`
- Host runs a local fastify server on a random port, passed to container as env var
- Container agent POSTs question JSON, host replies with answer
- Simpler than WebSocket for request/response semantics

**If IPC for agent questions needs bidirectional streaming:**
- Use `ws` (WebSocket) library
- Host WebSocket server, container connects, protocol handles question/answer and status updates over single connection
- Better if you need to push cancellation signals back to the container agent

**If Claude Code provides an official SDK:**
- Prefer SDK over subprocess invocation — avoids shell escaping, gets typed responses
- Verify `@anthropic-ai/claude-code` or `@anthropic-ai/sdk` packages on npm before deciding
- As of Aug 2025: Claude Code was primarily a CLI tool; SDK access may be subprocess-based

**If workflow graphs grow complex (DAGs, cycles, conditional branching):**
- Consider `graphlib` for graph data structure and traversal
- Do NOT reach for a full workflow engine (Temporal, Prefect) — these require external servers
- A custom DAG executor with p-queue is ~200 lines and fully owned

**If containerization needs to support Podman as well as Docker:**
- dockerode works against any Docker-compatible socket, including Podman's socket
- Set `DOCKER_HOST` env var to point at Podman socket
- No code change required; document as configuration option

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| execa@9.x | Node.js >=18.12 | ESM-only. Requires `"type": "module"` in package.json or `.mjs` extension. |
| p-queue@8.x | Node.js >=18 | ESM-only. Same constraint as execa. |
| chalk@5.x | Node.js >=12 | ESM-only. Do not mix with CommonJS-only tooling without tsup bundling. |
| commander@12.x | Node.js >=18 | Supports both CJS and ESM imports. |
| dockerode@4.x | Node.js >=14 | Requires Docker daemon running and socket accessible (`/var/run/docker.sock`). |
| ink@5.x | Node.js >=18, React 18 | ESM-only. Heavy dependency if only basic output needed — defer until justified. |
| ts-node (DO NOT USE) | — | Known ESM interop issues in complex projects. Replaced by tsx. |

**Critical note on ESM:** Many modern Node.js packages (execa, p-queue, chalk) are ESM-only. Set `"type": "module"` in `package.json` from day one. Configure `tsup` to output both CJS and ESM for the published binary. Configure `tsx` for development execution. Retrofitting a CJS project to ESM is painful.

---

## Sources

- Training data through August 2025 — core technology choices (HIGH confidence)
- npm ecosystem patterns: Commander, dockerode, p-queue, execa, simple-git are well-established (HIGH confidence for choice, MEDIUM for specific versions)
- ESM migration patterns: established community direction as of 2025 (HIGH confidence)
- Version numbers: MEDIUM confidence — run `npm show <package> version` before pinning

---

*Stack research for: Agent Harness — CLI coding agent orchestration tool*
*Researched: 2026-03-04*
