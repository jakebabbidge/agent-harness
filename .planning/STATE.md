# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** Multiple concurrent coding agent tasks run in full isolation against a codebase, coordinated by a declarative workflow graph, with human oversight surfaced at the CLI when agents need input.
**Current focus:** Phase 1 — Foundation

## Current Position

Phase: 1 of 3 (Foundation)
Plan: 3 of 4 in current phase (01-01, 01-03 complete)
Status: In progress
Last activity: 2026-03-04 — 01-03 complete: git worktree isolation, branch tracker, 17 tests green

Progress: [██░░░░░░░░] 17% (2/12 plans estimated)

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: ~1.5 min
- Total execution time: ~3 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2 | ~3 min | ~1.5 min |

**Recent Trend:**
- Last 5 plans: 01-01 (~1 min), 01-03 (~2 min)
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

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: Claude Code invocation model inside a container is LOW-MEDIUM confidence — verify `@anthropic-ai/claude-code` npm package API and subprocess flags before committing to IPC architecture
- [Phase 2]: Claude Code question-surfacing mechanism (SDK hook vs. stdout marker vs. file signal) is LOW confidence — needs verification before Phase 2 HITL implementation

## Session Continuity

Last session: 2026-03-04
Stopped at: Completed 01-03-PLAN.md — git worktree isolation, branch tracker, 17 tests green
Resume file: None
