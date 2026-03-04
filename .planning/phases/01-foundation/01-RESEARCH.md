# Phase 1: Foundation - Research

**Researched:** 2026-03-04
**Domain:** Docker container management, git worktrees, prompt templating, Node.js/TypeScript CLI
**Confidence:** MEDIUM-HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TMPL-01 | User can define a prompt template as a file with `{{variable}}` substitution syntax | Handlebars/Mustache provide `{{variable}}` natively; no hand-rolling needed |
| TMPL-02 | User can compose a prompt from multiple partial template files (section composition) | Handlebars partials system or simple file-concatenation before render covers this |
| TMPL-03 | User can dry-run render a template with given variables to inspect final prompt | Pure render function with stdout output; no side effects needed for dry-run |
| CONT-01 | Each task execution spawns a dedicated Docker container with target repository mounted | dockerode `createContainer` + bind mount pattern is well-established |
| CONT-02 | Container network and filesystem access restricted to only permitted resources | `--network none` + `--read-only` + scoped bind mounts gives required isolation |
| GIT-01 | Each concurrent task gets its own git worktree so tasks do not share filesystem state | `git worktree add` via child_process.execFile; simple-git raw() works as fallback |
| GIT-02 | Harness tracks which git branch each in-flight task is operating on | In-memory registry object (Map) keyed by task ID, persisted via JSON state file |
</phase_requirements>

---

## Summary

Phase 1 builds the core infrastructure that Phase 2 (task execution) sits on top of. There are four distinct sub-domains: prompt templating (TMPL-*), Docker container lifecycle management (CONT-*), git worktree isolation (GIT-*), and the Node.js/TypeScript project scaffold that holds it all together. All four are well-understood problem spaces with mature libraries; the main risks are in operational details — specifically container cleanup under SIGKILL and the async-cleanup limitation in dockerode.

The hardest engineering challenge in this phase is **SIGKILL-safe container cleanup**. Node.js cannot execute async code after SIGKILL; the only reliable mitigation is using Docker's `AutoRemove: true` on `HostConfig` (so the Docker daemon itself removes the container on exit) plus label-based orphan recovery at startup. This combination handles normal exit, SIGTERM, and SIGKILL/crash scenarios without requiring synchronous async cleanup.

**Primary recommendation:** Use `dockerode` for container management, `Handlebars` for templating (gives `{{variable}}` natively), `child_process.execFile` wrapping raw git for worktree operations, and `vitest` for testing. Project scaffold is TypeScript ESM with `"type": "module"` and `moduleResolution: NodeNext`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dockerode | ^4.0.2 | Docker Remote API client | De facto Node.js Docker library; full Docker API coverage; active maintenance |
| handlebars | ^4.7.8 | `{{variable}}` template rendering + partials | Logic-less-friendly, matches required `{{variable}}` syntax exactly; supports partials for TMPL-02 |
| commander | ^12.x | CLI argument parsing + subcommands | Most widely used Node.js CLI framework; excellent TypeScript support; Git-style subcommands |
| typescript | ^5.x | Type safety + ESM compilation | Required for maintainability; ESM-native with `NodeNext` resolution |
| vitest | ^2.x | Unit + integration testing | Native ESM/TS support, no transpilation step needed; fast; Jest-compatible API |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/dockerode | ^3.x | TypeScript types for dockerode | Always — dockerode ships without bundled types |
| @types/handlebars | n/a | Types bundled in handlebars v4 | Not needed — handlebars 4.7+ ships its own types |
| zod | ^3.x | Runtime schema validation for config/state | Validating task state JSON, config files at runtime boundaries |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| dockerode | node-docker-api | Same modem, promise-first API, but smaller community and less complete |
| handlebars | mustache | Mustache is more logic-less but lacks partials support (TMPL-02 needs composition) |
| handlebars | custom regex replace | Insufficient — misses escaping, nested objects, edge cases; don't hand-roll |
| commander | yargs | Yargs has more built-in validation but heavier; commander simpler for this use case |
| vitest | jest | Jest requires ts-jest/babel for ESM+TS; vitest works natively — simpler setup |

**Installation:**
```bash
npm install dockerode handlebars commander zod
npm install -D typescript vitest @types/dockerode @types/node
```

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── cli/                  # Commander command definitions (thin layer)
│   └── index.ts          # Entry point, program.parse()
├── container/            # Docker container lifecycle
│   ├── manager.ts        # ContainerManager class (create, start, stop, cleanup)
│   └── registry.ts       # In-memory container registry (task-id -> container-id)
├── git/                  # Git worktree operations
│   ├── worktree.ts       # WorktreeManager (add, remove, prune)
│   └── tracker.ts        # Branch tracker (task-id -> branch-name, persisted)
├── template/             # Prompt templating
│   ├── renderer.ts       # Template render + dry-run
│   └── loader.ts         # File loading + partial composition
├── types/                # Shared TypeScript interfaces
│   └── index.ts
bin/
└── agent-harness.ts      # #!/usr/bin/env node shebang entry
package.json              # "type": "module", "bin" field
tsconfig.json             # module: NodeNext, moduleResolution: NodeNext
vitest.config.ts
```

### Pattern 1: Container Lifecycle with SIGKILL-Safe Cleanup

**What:** Create containers with `AutoRemove: true` in `HostConfig` so the Docker daemon removes them without async Node.js code. Label containers with a harness-specific label for orphan recovery.

**When to use:** All container creation in the harness.

**Example:**
```typescript
// Source: Docker Remote API docs + dockerode README pattern
import Dockerode from 'dockerode';

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

async function createTaskContainer(taskId: string, repoPath: string): Promise<Dockerode.Container> {
  const container = await docker.createContainer({
    Image: 'node:20-alpine',
    name: `agent-harness-task-${taskId}`,
    Labels: {
      'agent-harness': 'true',
      'agent-harness.task-id': taskId,
    },
    HostConfig: {
      // AutoRemove: Docker daemon removes container when it stops — survives SIGKILL
      AutoRemove: true,
      // Bind mount the repo read-write (agent needs to write code)
      Binds: [`${repoPath}:/workspace:rw`],
      // Disable all network access — agent cannot make outbound calls
      NetworkMode: 'none',
      // Read-only root filesystem except explicit writable paths
      ReadonlyRootfs: true,
      // Tmpfs for writable in-container paths the agent needs
      Tmpfs: { '/tmp': '', '/home': '' },
    },
    WorkingDir: '/workspace',
  });
  return container;
}
```

### Pattern 2: Graceful Shutdown with SIGTERM, Cleanup on SIGKILL via AutoRemove

**What:** Handle SIGTERM for graceful stop; rely on `AutoRemove: true` for SIGKILL/crash cases. Orphan recovery at startup via label filter.

**When to use:** Process-level signal handling in the CLI entry point.

**Example:**
```typescript
// Source: Node.js best practices + dockerode issue #214 findings
const activeContainers = new Map<string, Dockerode.Container>();

async function stopAll(): Promise<void> {
  await Promise.all(
    Array.from(activeContainers.values()).map(c =>
      c.stop({ t: 5 }).catch(() => {/* already stopped */})
    )
  );
}

// Catchable signals — async cleanup possible
process.on('SIGTERM', async () => { await stopAll(); process.exit(0); });
process.on('SIGINT',  async () => { await stopAll(); process.exit(0); });

// SIGKILL CANNOT be caught — AutoRemove on HostConfig is the only defense

// Orphan recovery at startup: find containers we left behind from a previous crash
async function reclaimOrphans(): Promise<void> {
  const orphans = await docker.listContainers({
    all: true,
    filters: { label: ['agent-harness=true'] },
  });
  await Promise.all(
    orphans.map(info =>
      docker.getContainer(info.Id).remove({ force: true }).catch(() => {})
    )
  );
}
```

### Pattern 3: Git Worktree Isolation per Task

**What:** Use `git worktree add` to create a new working tree at a unique path keyed to task ID, on a unique branch. Use `child_process.execFile` since simple-git does not expose a typed worktree API.

**When to use:** Every new task gets a worktree; cleanup on task completion.

**Example:**
```typescript
// Source: git-scm.com/docs/git-worktree + Node.js child_process
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);

export async function createWorktree(
  repoPath: string,
  taskId: string,
  baseBranch = 'main'
): Promise<{ worktreePath: string; branchName: string }> {
  const branchName = `agent-harness/task-${taskId}`;
  const worktreePath = path.join(repoPath, '.worktrees', taskId);

  // Create a new branch and checkout into isolated directory
  await execFileAsync('git', [
    'worktree', 'add',
    '-b', branchName,
    worktreePath,
    baseBranch
  ], { cwd: repoPath });

  return { worktreePath, branchName };
}

export async function removeWorktree(repoPath: string, taskId: string): Promise<void> {
  const worktreePath = path.join(repoPath, '.worktrees', taskId);
  await execFileAsync('git', ['worktree', 'remove', '--force', worktreePath], { cwd: repoPath });
  await execFileAsync('git', ['worktree', 'prune'], { cwd: repoPath });
}
```

### Pattern 4: Template Rendering with Handlebars

**What:** Load template files, register partials for TMPL-02, compile and render with provided variables for TMPL-01, return string for TMPL-03 dry-run.

**When to use:** All prompt construction.

**Example:**
```typescript
// Source: handlebarsjs.com/guide
import Handlebars from 'handlebars';
import fs from 'fs/promises';

export async function renderTemplate(
  templatePath: string,
  variables: Record<string, unknown>,
  partialPaths: string[] = []
): Promise<string> {
  // Register partials (TMPL-02: composition)
  for (const partialPath of partialPaths) {
    const name = path.basename(partialPath, path.extname(partialPath));
    const content = await fs.readFile(partialPath, 'utf-8');
    Handlebars.registerPartial(name, content);
  }

  const source = await fs.readFile(templatePath, 'utf-8');
  const template = Handlebars.compile(source);
  return template(variables);  // TMPL-01: {{variable}} substitution
}

// TMPL-03: dry-run is just calling this function and printing to stdout
// No separate machinery needed — the render IS the dry-run output
```

### Anti-Patterns to Avoid

- **Hand-rolling `{{variable}}` substitution with regex:** Misses escaping, object paths, and partial injection. Use Handlebars.
- **Using `process.on('exit')` for container cleanup:** The `exit` event only supports synchronous code. Async API calls (dockerode) will silently be abandoned. Use `SIGTERM`/`SIGINT` with async handlers and `AutoRemove: true` for SIGKILL.
- **Running worktree in the same directory as the main repo:** The main repo checkout and the worktrees must be at different paths. Use a `.worktrees/` subdirectory or a sibling directory.
- **Not labeling containers:** Without harness-specific labels, orphan recovery on startup is impossible — you cannot distinguish harness containers from user's own containers.
- **Blocking the event loop with sync file I/O in template loading:** Use `fs/promises` (async) throughout.
- **Shared Handlebars global state for partials across concurrent renders:** If rendering concurrently, be aware Handlebars.registerPartial is global. Use `Handlebars.create()` to get isolated instances.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| `{{variable}}` substitution | Custom regex replace | Handlebars | Escaping, nested objects, type coercion, security |
| Docker socket communication | Raw HTTP to `/var/run/docker.sock` | dockerode | Multiplexing, stream demux, error handling, full API |
| CLI argument parsing | Manual `process.argv` parsing | commander | Help text generation, subcommands, validation, type coercion |
| Partial file composition | Custom string concatenation | Handlebars partials | Order-of-operations, recursive partials, error messages |
| Container orphan detection | PID files or lock files | Docker labels + `listContainers` filter | Label-based detection survives crash without cleanup needed |

**Key insight:** This phase's problems are each well-solved by a single focused library. The harness code should be thin wiring between them, not reimplementing their core logic.

---

## Common Pitfalls

### Pitfall 1: SIGKILL-Unsafe Container Cleanup

**What goes wrong:** Containers remain running after the harness process crashes or is killed. They consume resources and block port/name reuse.

**Why it happens:** SIGKILL cannot be caught by Node.js. Any cleanup in `process.on('SIGTERM')` or `process.on('exit')` will not run after SIGKILL. The dockerode `container.stop()` + `container.remove()` calls are async and will not complete.

**How to avoid:** Set `AutoRemove: true` in `HostConfig` when creating every container. This delegates cleanup responsibility to the Docker daemon itself, which survives the harness process crash. Additionally, run orphan recovery (`listContainers` with label filter + `remove({force:true})`) on every harness startup.

**Warning signs:** Leftover containers visible in `docker ps -a` after crashes during development.

### Pitfall 2: `process.on('exit')` with Async Code

**What goes wrong:** Container removal calls appear to be registered but silently fail — the process exits before any async work happens.

**Why it happens:** The `exit` event handler must be synchronous. Async function calls registered on `exit` are fire-and-forget; the process terminates immediately after the sync portion of the handler.

**How to avoid:** Register cleanup on `SIGTERM` and `SIGINT` with proper `async` handlers that `await` before calling `process.exit(0)`. Never rely on `process.on('exit')` for network I/O.

### Pitfall 3: Git Worktree Branch Name Conflicts

**What goes wrong:** Two tasks with similar IDs or a task retried after partial cleanup may try to create a branch that already exists.

**Why it happens:** `git worktree add -b <branch>` fails if the branch already exists.

**How to avoid:** Use `--force` flag or check-then-create pattern. Prefer UUID-based task IDs to minimize collision probability. On cleanup, always delete the branch after removing the worktree: `git branch -d agent-harness/task-<id>`.

### Pitfall 4: Handlebars Global Partial State in Concurrent Renders

**What goes wrong:** Partial registered for task A bleeds into render for task B when tasks run concurrently.

**Why it happens:** `Handlebars.registerPartial()` modifies global state in the default Handlebars instance.

**How to avoid:** Use `const hbs = Handlebars.create()` for each render call, or per-template-set. This creates an isolated environment instance.

### Pitfall 5: Container `--network none` Breaks Claude Code

**What goes wrong:** If Claude Code itself needs to make outbound API calls from inside the container (e.g., to Anthropic API), `--network none` blocks it.

**Why it happens:** `--network none` is complete network isolation — no loopback to host, no external.

**How to avoid:** Phase 1 defines the isolation primitives; Phase 2 defines the Claude Code invocation model. For Phase 1, document this as a known constraint to resolve in Phase 2. Options are: (a) allowlist specific IPs via iptables/custom Docker network, (b) proxy via host with a named Docker network that only allows host-route traffic. The `--network none` flag is the right default for maximum isolation; Phase 2 must make a deliberate decision about what outbound access Claude Code actually needs.

**Warning signs:** Claude Code invocation fails with network errors from inside the container.

### Pitfall 6: TypeScript ESM Import Extensions

**What goes wrong:** TypeScript with `"moduleResolution": "NodeNext"` requires explicit `.js` extensions on relative imports (even though the source files are `.ts`).

**Why it happens:** Node.js ESM requires file extensions; TypeScript does not rewrite extensions at compile time.

**How to avoid:** Write all relative imports with `.js` extension: `import { foo } from './foo.js'`. TypeScript resolves `.ts` source files when you reference `.js`. This is counterintuitive but is the correct pattern for `NodeNext` mode.

---

## Code Examples

Verified patterns from official sources:

### Handlebars Template with Partials

```typescript
// Source: https://handlebarsjs.com/guide/#partials
// Main template file: prompt.hbs
// {{> systemPrompt}} — includes the partial named "systemPrompt"
// {{task_description}} — variable substitution

const hbs = Handlebars.create();
hbs.registerPartial('systemPrompt', 'You are a coding assistant.\n');
const template = hbs.compile('{{> systemPrompt}}\nTask: {{task_description}}');
const result = template({ task_description: 'Fix the bug in auth.ts' });
// result: "You are a coding assistant.\nTask: Fix the bug in auth.ts"
```

### dockerode Container Create + Start

```typescript
// Source: https://github.com/apocas/dockerode README
const container = await docker.createContainer({
  Image: 'node:20-alpine',
  Cmd: ['sh', '-c', 'echo hello'],
  HostConfig: {
    AutoRemove: true,
    NetworkMode: 'none',
    Binds: ['/host/path:/workspace:rw'],
  },
});
await container.start();
const exitCode = await container.wait();
// container auto-removed by Docker daemon after wait() resolves
```

### Git Worktree Lifecycle

```bash
# Add worktree on new branch
git worktree add -b agent-harness/task-abc123 .worktrees/abc123 main

# List all worktrees
git worktree list

# Remove worktree + prune refs
git worktree remove --force .worktrees/abc123
git worktree prune
git branch -d agent-harness/task-abc123
```

### TypeScript ESM Package Setup

```json
// package.json
{
  "type": "module",
  "bin": { "agent-harness": "./dist/bin/agent-harness.js" },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "declaration": true
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ChildProcess.exec('docker run ...')` | dockerode programmatic API | Ongoing | Type safety, stream handling, full API access |
| `process.on('exit')` for async cleanup | `SIGTERM`/`SIGINT` handlers + `AutoRemove` | Recognized pattern | Reliable cleanup under all exit modes |
| Jest + ts-jest for ESM TS | vitest (native ESM+TS) | 2022-present | Zero-config, faster, no transpilation step |
| `tsc --watch` + nodemon | `tsx` for dev, `tsc` for production | 2023-present | Faster dev iteration |

**Deprecated/outdated:**
- `node-docker-api`: Less maintained than dockerode; same underlying modem; prefer dockerode
- `@types/handlebars`: Handlebars 4.7+ ships its own TypeScript definitions; separate @types package is outdated

---

## Open Questions

1. **Network access for Claude Code inside container**
   - What we know: `--network none` blocks all networking including Anthropic API calls that Claude Code may need
   - What's unclear: Does Claude Code require outbound internet during task execution, or can it operate with pre-loaded context? What network access is actually needed?
   - Recommendation: Phase 1 implements `--network none` as default. Phase 2 must verify Claude Code invocation model and determine minimum required network access. Document as a known blocker in STATE.md (already noted as LOW-MEDIUM confidence item).

2. **Worktree path strategy: sibling vs. subdirectory**
   - What we know: Worktrees cannot be inside the `.git` directory; they can be subdirectories of the repo or sibling directories
   - What's unclear: Whether `.worktrees/` inside the repo root creates problems for git operations or agent file enumeration
   - Recommendation: Use `.worktrees/<task-id>/` inside repo root, add `.worktrees/` to `.gitignore`. Simpler path management than siblings.

3. **dockerode version compatibility**
   - What we know: dockerode is at version 4.x; the npm page was not accessible to verify exact version
   - What's unclear: Whether v4 has any breaking changes from v3 for the basic `createContainer`/`start`/`stop` API
   - Recommendation: Install and verify with `npm install dockerode@latest`; check package.json for actual resolved version. LOW confidence on exact semver.

---

## Validation Architecture

> nyquist_validation is enabled in .planning/config.json

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (^2.x) |
| Config file | vitest.config.ts — Wave 0 creation required |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TMPL-01 | `{{variable}}` is substituted in rendered output | unit | `npx vitest run src/template/renderer.test.ts` | Wave 0 |
| TMPL-02 | Multiple partial files compose into single rendered string | unit | `npx vitest run src/template/renderer.test.ts` | Wave 0 |
| TMPL-03 | Dry-run returns rendered string without executing any container/git side effects | unit | `npx vitest run src/template/renderer.test.ts` | Wave 0 |
| CONT-01 | Container is created, started, and stopped; container ID is returned | integration (requires Docker socket) | `npx vitest run src/container/manager.test.ts` | Wave 0 |
| CONT-02 | Container with `NetworkMode: none` + `ReadonlyRootfs: true` matches expected HostConfig in inspect | integration | `npx vitest run src/container/manager.test.ts` | Wave 0 |
| GIT-01 | Two worktree paths for different task IDs do not share filesystem state (write to one, assert absent in other) | integration (requires git repo) | `npx vitest run src/git/worktree.test.ts` | Wave 0 |
| GIT-02 | After `createWorktree`, tracker returns correct branch name for task ID | unit | `npx vitest run src/git/tracker.test.ts` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/template/` (fast unit tests only, < 5s)
- **Per wave merge:** `npx vitest run` (all tests including integration)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `vitest.config.ts` — configure test environment (node), coverage
- [ ] `src/template/renderer.test.ts` — covers TMPL-01, TMPL-02, TMPL-03
- [ ] `src/container/manager.test.ts` — covers CONT-01, CONT-02 (requires Docker socket; mark as integration)
- [ ] `src/git/worktree.test.ts` — covers GIT-01 (requires temp git repo fixture)
- [ ] `src/git/tracker.test.ts` — covers GIT-02
- [ ] `package.json` — install vitest, add test script
- [ ] `tsconfig.json` — initialize with NodeNext ESM settings

---

## Sources

### Primary (HIGH confidence)

- Docker official docs (docs.docker.com/engine/network/drivers/none/) — none network driver behavior verified
- Docker official docs (docs.docker.com/engine/storage/bind-mounts/ + tmpfs) — filesystem isolation flags verified
- git-scm.com/docs/git-worktree — worktree add/remove/prune command flags verified
- handlebarsjs.com/guide — partials API and compile() pattern verified

### Secondary (MEDIUM confidence)

- github.com/apocas/dockerode (README + issue #214) — createContainer API shape, AutoRemove pattern, async cleanup limitation
- Node.js best practices (goldbergyoni/nodebestpractices) — SIGTERM/SIGINT graceful shutdown pattern
- TypeScript ESM docs (typescriptlang.org/docs/handbook/esm-node.html) — NodeNext module resolution, .js extension requirement

### Tertiary (LOW confidence)

- dockerode exact version (npmjs.com/package/dockerode) — 403 response; version inferred from GitHub as "4.x"
- simple-git worktree API — confirmed absent from main API; raw() workaround is inference not verified from source

---

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM-HIGH — libraries verified via GitHub/official docs; exact semver not confirmed for dockerode
- Architecture: MEDIUM-HIGH — patterns derived from official docs and well-known Node.js idioms; Handlebars concurrency pitfall is documented behavior
- Pitfalls: HIGH — SIGKILL limitation is a fundamental Node.js constraint; AutoRemove pattern is Docker-documented; ESM extension requirement is TypeScript-official

**Research date:** 2026-03-04
**Valid until:** 2026-06-04 (stable stack; 90 days reasonable; re-verify dockerode version before install)
