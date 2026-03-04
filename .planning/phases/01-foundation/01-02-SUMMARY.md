---
phase: 01-foundation
plan: 02
subsystem: template
tags: [handlebars, typescript, esm, vitest, tdd, template-engine]

# Dependency graph
requires:
  - phase: 01-01
    provides: TypeScript ESM scaffold, shared types (RenderResult, TemplateVariables), vitest config
provides:
  - Async template file loader (loadTemplate, loadPartials) using fs/promises
  - Handlebars-based renderer with isolated instance per call (renderTemplate, dryRunRender)
  - Full test coverage: TMPL-01 variable substitution, TMPL-02 partial composition, TMPL-03 dry-run render
affects: [01-03, 01-04, phase-2-prompt-construction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Handlebars.create() per render call — never mutate global Handlebars instance for concurrency safety"
    - "Partial name from basename-without-ext: system-prompt.hbs -> partial name 'system-prompt'"
    - "Namespace import for handlebars (import * as Handlebars) due to esModuleInterop: false in tsconfig"
    - "Temp-dir fixture pattern: mkdtemp + simple filenames so partial names are predictable in tests"

key-files:
  created:
    - src/template/loader.ts
    - src/template/renderer.ts
    - src/template/renderer.test.ts
  modified: []

key-decisions:
  - "Handlebars.create() per render call (not global instance) — prevents partial bleed in concurrent invocations"
  - "Partial name derived from path.basename without extension — matches {{> partialName}} syntax naturally"
  - "dryRunRender is renderTemplate + stdout write only — no file writes, no process spawning"
  - "Namespace import 'import * as Handlebars' required by esModuleInterop: false tsconfig setting"
  - "Test fixtures use mkdtemp unique dir + simple filenames so partial names match template references"

patterns-established:
  - "Template fixtures: mkdtemp per test, simple file names (header.hbs not timestamp-prefix-header.hbs)"
  - "Isolated Handlebars: always Handlebars.create() never the global Handlebars object"

requirements-completed: [TMPL-01, TMPL-02, TMPL-03]

# Metrics
duration: 3min
completed: 2026-03-04
---

# Phase 1 Plan 02: Template Engine Summary

**Handlebars template engine with isolated-instance rendering, async partial composition, and dry-run support — 16 tests, 0 failures, tsc --noEmit clean**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-04T12:28:11Z
- **Completed:** 2026-03-04T12:30:18Z
- **Tasks:** 1 (TDD: RED + GREEN + REFACTOR)
- **Files modified:** 3 created

## Accomplishments

- Template loader reads .hbs files async (`loadTemplate`) and builds a Map of name→content for partials (`loadPartials`)
- Renderer uses `Handlebars.create()` per call — concurrent renders never share registered partials
- `dryRunRender` wraps `renderTemplate` and writes result to stdout with no file-system side effects
- 16 vitest tests cover TMPL-01 (variable substitution), TMPL-02 (partial composition), TMPL-03 (dry-run), error paths, and concurrency isolation

## Task Commits

TDD cycle with three commits:

1. **RED - Failing tests** - `f014e96` (test) — `test(01-02): add template renderer tests`
2. **GREEN - Implementation** - `8938b7f` (feat) — `feat(01-02): implement template loader and renderer`

_No REFACTOR commit needed — error messages and .js extensions were correct from initial implementation._

## Files Created/Modified

- `src/template/loader.ts` - `loadTemplate(path): Promise<string>` and `loadPartials(paths): Promise<Map<name, content>>` using fs/promises
- `src/template/renderer.ts` - `renderTemplate()` and `dryRunRender()` using `Handlebars.create()` per invocation
- `src/template/renderer.test.ts` - 16 unit tests (loadTemplate, loadPartials, TMPL-01, TMPL-02, TMPL-03, error handling, concurrency)

## Decisions Made

- **Handlebars.create() per render call**: prevents partial state from leaking between concurrent renders — each call registers its own partials on its own isolated Handlebars environment
- **Partial name from basename without extension**: `path.basename(p, path.extname(p))` maps `system-prompt.hbs` → `system-prompt`, matching Handlebars `{{> system-prompt}}` syntax with no extra configuration
- **Namespace import for Handlebars**: `import * as Handlebars from 'handlebars'` required because tsconfig has `esModuleInterop: false` — default import fails `tsc --noEmit`
- **Test fixture pattern**: `mkdtemp` unique directory + simple filenames (e.g. `header.hbs`) so the derived partial name matches template references exactly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test fixture naming so partial names match template references**
- **Found during:** Task 1 (GREEN phase — first test run)
- **Issue:** `writeTempFile` used timestamp-prefixed filenames (`agent-harness-test-{ts}-{rand}-header.hbs`), making the derived partial name `agent-harness-test-...-header` instead of `header` — partials were registered under the wrong name and `{{> header}}` could not be found
- **Fix:** Switched to `fs.mkdtemp` per test (unique directory, reset in `afterEach`) with simple filenames (`header.hbs`, `footer.hbs`) — derived name is exactly the stem the template references
- **Files modified:** `src/template/renderer.test.ts`
- **Verification:** All 16 tests pass including all TMPL-02 partial composition tests
- **Committed in:** `f014e96` (test commit — test file updated before implementation)

**2. [Rule 1 - Bug] Fixed Handlebars default import for esModuleInterop: false**
- **Found during:** Task 1 (REFACTOR — `tsc --noEmit` check)
- **Issue:** `import Handlebars from 'handlebars'` fails TypeScript with TS1259 when `esModuleInterop: false`
- **Fix:** Changed to `import * as Handlebars from 'handlebars'` (namespace import)
- **Files modified:** `src/template/renderer.ts`
- **Verification:** `tsc --noEmit` exits 0; all 16 tests still pass
- **Committed in:** `8938b7f` (feat commit — implementation file)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs)
**Impact on plan:** Both fixes were necessary for correctness. No scope creep.

## Issues Encountered

- Handlebars namespace import requirement discovered during `tsc --noEmit` — quickly resolved by switching from default to namespace import pattern consistent with `esModuleInterop: false`

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `renderTemplate` and `dryRunRender` are fully functional and tested — Phase 2 prompt construction can immediately import from `src/template/renderer.js`
- `loadTemplate` and `loadPartials` are exported from `src/template/loader.js` for any downstream use
- No blockers for 01-03 (git worktree) or 01-04 (container manager) — those are independent subsystems

---
*Phase: 01-foundation*
*Completed: 2026-03-04*

## Self-Check: PASSED

- src/template/loader.ts: FOUND
- src/template/renderer.ts: FOUND
- src/template/renderer.test.ts: FOUND
- .planning/phases/01-foundation/01-02-SUMMARY.md: FOUND
- Commit f014e96 (test): FOUND
- Commit 8938b7f (feat): FOUND
