# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** Multiple concurrent coding agent tasks run in full isolation against a codebase, coordinated by a declarative workflow graph, with human oversight surfaced at the CLI when agents need input.
**Current focus:** Phase 1 — Foundation

## Current Position

Phase: 1 of 3 (Foundation)
Plan: 3 of 4 in current phase (01-01, 01-02, 01-03 complete)
Status: In progress
Last activity: 2026-03-04 — 01-02 complete: Handlebars template engine, async loader, dryRunRender, 16 tests green

Progress: [███░░░░░░░] 25% (3/12 plans estimated)

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: ~2 min
- Total execution time: ~6 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3 | ~6 min | ~2 min |

**Recent Trend:**
- Last 5 plans: 01-01 (~1 min), 01-03 (~2 min), 01-02 (~3 min)
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Container isolation (Docker) chosen over worktrees-only; IPC protocol must be designed in Phase 1 — retrofitting is expensive
- [Roadmap]: Coarse granularity applied — 3 phases cover 16 requirements; research suggests Node.js/TypeScript ESM-native stack
- [01-01]: NodeNext module/moduleResolution chosen over bundler/ESNext — required for native Node.js ESM runtime (not bundler-transformed)
- [01-01]: src/types/index.ts is a zero-import leaf node — enforces clean dependency direction across all subsystems
- [01-01]: vitest@2.x chosen over jest — native ESM support without transform configuration
- [01-03]: Branch conflict: fail-fast (error on duplicate branch) rather than --force reuse — safer, prevents silent state corruption
- [01-03]: execFile over exec for git commands — eliminates shell injection surface
- [01-03]: Optional BranchTracker parameter on createWorktree/removeWorktree — enables isolated git-op unit tests
- [01-03]: Void-fire save() on mutations — persistence is best-effort, does not block synchronous register/unregister API
- [01-02]: Handlebars.create() per render call — prevents partial bleed between concurrent invocations
- [01-02]: Partial name from path.basename without extension — maps system-prompt.hbs to 'system-prompt' matching {{> system-prompt}} syntax
- [01-02]: Namespace import 'import * as Handlebars' required by esModuleInterop: false in tsconfig
- [01-02]: Test fixtures use mkdtemp unique dir + simple filenames so partial names match template references

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: Claude Code invocation model inside a container is LOW-MEDIUM confidence — verify `@anthropic-ai/claude-code` npm package API and subprocess flags before committing to IPC architecture
- [Phase 2]: Claude Code question-surfacing mechanism (SDK hook vs. stdout marker vs. file signal) is LOW confidence — needs verification before Phase 2 HITL implementation

## Session Continuity

Last session: 2026-03-04
Stopped at: Completed 01-02-PLAN.md — Handlebars template engine, async loader, dryRunRender, 16 tests green
Resume file: None
