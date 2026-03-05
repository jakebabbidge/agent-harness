# Phase 5: Wire Container Isolation - Research

**Researched:** 2026-03-05
**Domain:** Docker container lifecycle, iptables firewall, Claude Code CLI subprocess execution
**Confidence:** HIGH

## Summary

This phase transforms the execution model from in-process SDK calls to running the full Claude Code CLI inside Docker containers with iptables-based network isolation. The existing `ContainerManager` (Phase 1) needs significant rework: replace `NetworkMode: none` with bridge networking + iptables firewall, drop `ReadonlyRootfs`, change the base image from `node:20-alpine` to a custom image with Claude Code CLI pre-installed, and add `~/.claude` volume mount for auth. The `TaskExecutor` must change from calling the SDK `query()` function to spawning the Claude CLI as a subprocess inside the container via `docker exec` (or using the container's entrypoint command with `container.wait()`).

The devcontainer reference from Anthropic provides a proven pattern: node:20 base, iptables/ipset firewall with default-deny and explicit whitelists (Anthropic API, npm, GitHub, DNS), sudoers for the `node` user to run firewall init, and `/workspace` mount for the codebase. The HITL pattern continues to work via the mounted volume -- the agent writes question files, the host polls and writes answers, all through the shared worktree mount.

**Primary recommendation:** Use the container's own command/entrypoint to run Claude CLI (not `docker exec`), and use `container.wait()` to block until the process exits. This is simpler, avoids exec lifecycle complexity, and maps cleanly to the "one container per task" model.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Full agent runs inside the container (not host SDK + container tools)
- Claude Code CLI invoked as subprocess: `claude --dangerously-skip-permissions -p <prompt>`
- Host starts container, waits for process exit, reads RESULT.md from mounted worktree
- File-based IPC via mounted volume for HITL (matches existing QuestionStore pattern)
- Pre-built image: ship Dockerfile in repo, user builds once (`agent-harness build-image` or auto-build on first run)
- Fork the Claude Code devcontainer Dockerfile (node:20 base, Claude Code CLI, iptables, git, zsh, dev tools)
- Single global image tag: `agent-harness:latest`
- iptables/ipset firewall inside the container (not NetworkMode:none)
- Whitelist: Anthropic API, npm registry, GitHub, DNS
- Container requires `--cap-add=NET_ADMIN,NET_RAW` for iptables
- Firewall init script runs as postStart command before agent executes
- Default-deny policy: all non-whitelisted outbound traffic is dropped
- Mount local `~/.claude` directory into container for Claude Code auth
- No ANTHROPIC_API_KEY env var passthrough -- use existing local credentials
- Drop ReadonlyRootfs -- devcontainer model doesn't use it, Claude Code needs write access
- Worktree mounted at `/workspace` (rw)
- No memory/CPU limits for v1
- reclaimOrphans() already exists but isn't called -- wire it into startup
- AutoRemove: true still applies for normal exit cleanup

### Claude's Discretion
- Exact container entrypoint script structure
- How to orchestrate firewall init + agent execution sequencing
- Whether to keep or remove AutoRemove flag given the new model
- ContainerManager API changes needed to support the devcontainer model

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONT-01 | Each task execution spawns a dedicated Docker container with the target repository mounted | ContainerManager.createContainer() reworked with new image, mounts, caps; container.wait() for lifecycle; Dockerfile + init-firewall.sh new files |
| CONT-02 | Container network and filesystem access is restricted to only permitted resources | iptables/ipset firewall with default-deny + whitelist; init-firewall.sh runs before agent; verified via devcontainer reference pattern |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dockerode | ^4.0.0 | Docker API client | Already in use; container.create, container.wait, container.exec all available |
| @types/dockerode | ^3.3.0 | TypeScript types | Already installed; CapAdd, ExecCreateOptions, ContainerWaitOptions typed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:child_process | built-in | Docker image build via `docker build` | Auto-build image on first run if not present |

### No New Dependencies
This phase does not require any new npm dependencies. All Docker interaction goes through the already-installed `dockerode` package. The Dockerfile and firewall script are standalone shell/Docker artifacts.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── container/
│   ├── manager.ts        # Reworked: new createContainer API, runInContainer method
│   ├── registry.ts       # Unchanged
│   └── image.ts          # NEW: ensureImage() -- build if not present
├── executor/
│   └── executor.ts       # Rewritten: container exec instead of SDK query()
docker/
├── Dockerfile            # NEW: agent-harness container image
└── init-firewall.sh      # NEW: iptables firewall setup script
```

### Pattern 1: Container-as-Process (not Container-as-Service)
**What:** Each task creates a container whose Cmd runs the Claude CLI directly. The host uses `container.wait()` to block until the process exits, then reads output from the mounted volume.
**When to use:** Always -- this is the execution model for v1.
**Why over docker exec:** The container's main process IS the task. No need to keep a long-running container and exec into it. Simpler lifecycle, cleaner cleanup (AutoRemove removes container when process exits).

```typescript
// Container creation with Claude CLI as the command
const container = await docker.createContainer({
  Image: 'agent-harness:latest',
  name: containerName,
  Cmd: ['bash', '-c', '/usr/local/bin/init-firewall.sh && claude --dangerously-skip-permissions -p "$(cat /workspace/.harness/prompt.txt)"'],
  User: 'node',
  WorkingDir: '/workspace',
  Labels: { 'agent-harness': 'true', 'agent-harness.task-id': taskId },
  HostConfig: {
    AutoRemove: true,
    CapAdd: ['NET_ADMIN', 'NET_RAW'],
    Binds: [
      `${worktreePath}:/workspace:rw`,
      `${homedir}/.claude:/home/node/.claude:ro`,
    ],
  },
});

await container.start();
const { StatusCode } = await container.wait();
```

### Pattern 2: Prompt Delivery via File Mount
**What:** Write the rendered prompt to a file in the worktree before container start. The container command reads it from the mounted path.
**When to use:** Always -- avoids shell escaping issues with large prompts passed as arguments.
**Example flow:**
1. Host writes prompt to `{worktreePath}/.harness/prompt.txt`
2. Container Cmd reads: `claude --dangerously-skip-permissions -p "$(cat /workspace/.harness/prompt.txt)"`
3. Agent writes RESULT.md to `/workspace/RESULT.md`
4. Host reads `{worktreePath}/RESULT.md` after container exits

### Pattern 3: Firewall Init Before Agent
**What:** The container's Cmd chains firewall init and agent execution: `init-firewall.sh && claude ...`
**When to use:** Always -- firewall must be active before any agent network requests.
**Key detail:** init-firewall.sh must run with sudo (the Dockerfile grants passwordless sudo for iptables commands to the node user).

### Pattern 4: HITL via Shared Volume
**What:** QuestionStore already uses file-based IPC. Since the worktree is mounted at `/workspace`, the agent inside the container and the host outside share the same filesystem path for question/answer files.
**When to use:** When agent asks questions during execution.
**Important consideration:** The QuestionStore base directory is currently `os.tmpdir()/agent-harness/runs`. For container IPC, question files need to be written to the mounted volume (e.g., `/workspace/.harness/`) so the host can see them. This requires either:
- (a) Configuring the agent's QuestionStore to use `/workspace/.harness/` as base dir, OR
- (b) Adding a separate mount for the HITL directory

Since we're now running the Claude CLI directly (not our SDK wrapper), HITL works differently: Claude Code's `--dangerously-skip-permissions` flag skips all permission prompts. If the agent needs to ask the user a question, it would use AskUserQuestion which is a tool call. But since we're running CLI mode with `-p`, the agent runs non-interactively. HITL in the container model may need to be deferred or handled via a different mechanism (e.g., the agent writes a question file, the host injects the answer, and the agent is re-run). This is a design consideration for the planner.

### Anti-Patterns to Avoid
- **Long-running container + exec:** Don't create a container with `sleep infinity` and exec into it. The container-as-process model is simpler and AutoRemove handles cleanup.
- **Passing prompt as Cmd argument:** Shell escaping issues with large prompts. Use file-based prompt delivery.
- **NetworkMode: none:** Blocks all networking including DNS. The iptables approach allows selective access.
- **ReadonlyRootfs with Claude Code:** Claude Code needs to write to various paths (~/.claude, node_modules, etc.). Use iptables for isolation instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IP range resolution for GitHub | Custom DNS resolver | ipset + GitHub API meta endpoint | GitHub publishes IP ranges at api.github.com/meta; ipset handles CIDR aggregation |
| Docker image management | Manual docker build calls | dockerode.buildImage() or child_process docker build | Handles build context, streaming output, error handling |
| Container cleanup on crash | Custom process signal handlers | AutoRemove: true + reclaimOrphans() | Docker daemon handles normal exit cleanup; reclaimOrphans() catches crash cases |
| Firewall rules | Node.js iptables wrapper | Shell script (init-firewall.sh) | iptables is a shell tool; wrapping in Node adds complexity without benefit |

## Common Pitfalls

### Pitfall 1: AutoRemove + container.wait() Race
**What goes wrong:** With `AutoRemove: true`, the container is removed immediately after the process exits. If you try to inspect or read logs after `container.wait()` returns, you get a 404.
**Why it happens:** Docker daemon removes the container asynchronously after the main process exits.
**How to avoid:** Read all output from mounted volumes AFTER wait() returns but BEFORE any container operations. Since we read RESULT.md from the host filesystem (the mount), this is not an issue -- the file persists after container removal.
**Warning signs:** 404 errors from container.inspect() after wait().

### Pitfall 2: iptables Requires Capabilities
**What goes wrong:** Container fails to start or init-firewall.sh fails with "permission denied" when running iptables.
**Why it happens:** iptables requires NET_ADMIN and NET_RAW capabilities which Docker drops by default.
**How to avoid:** Always pass `CapAdd: ['NET_ADMIN', 'NET_RAW']` in HostConfig.
**Warning signs:** "Operation not permitted" errors in container logs during firewall init.

### Pitfall 3: DNS Resolution in Firewalled Container
**What goes wrong:** Domain-name-based whitelisting resolves to IPs at firewall init time, but IPs can change (CDNs, load balancers).
**Why it happens:** iptables works with IPs, not domains. DNS resolution happens once during init.
**How to avoid:** Use ipset for dynamic sets. Allow DNS (port 53) traffic. For critical services (api.anthropic.com), resolve and add IPs to the ipset. Accept that some CDN IPs may rotate. The devcontainer reference handles this by resolving at init time and allowing DNS through.
**Warning signs:** Intermittent network failures hours into execution.

### Pitfall 4: Shell Escaping in Container Cmd
**What goes wrong:** Prompts containing quotes, backticks, or special characters break the shell command.
**Why it happens:** The prompt is interpolated into a bash -c string.
**How to avoid:** Write prompt to a file, read it with `cat`. Never interpolate user content into shell strings.
**Warning signs:** Syntax errors in container logs, truncated prompts.

### Pitfall 5: Image Not Built Before First Run
**What goes wrong:** `docker.createContainer()` fails with "image not found" error.
**Why it happens:** User hasn't run the build step.
**How to avoid:** Add `ensureImage()` check before container creation. Either auto-build or provide a clear error message with build instructions.
**Warning signs:** "No such image: agent-harness:latest" error.

### Pitfall 6: ~/.claude Mount Permissions
**What goes wrong:** Claude Code inside the container can't read auth credentials from mounted ~/.claude directory.
**Why it happens:** UID mismatch between host user and container's `node` user (uid 1000).
**How to avoid:** Mount as `:ro` (read-only is fine for auth). If UID mismatch occurs, the Dockerfile can adjust the node user's UID or use `--user` flag matching host UID. The devcontainer reference handles this by running as the `node` user which typically matches.
**Warning signs:** "Permission denied" or "unauthorized" errors from Claude Code.

## Code Examples

### ContainerManager.createContainer() -- Reworked

```typescript
// Key changes from Phase 1 version:
// - Image: 'agent-harness:latest' (not node:20-alpine)
// - No NetworkMode: 'none' (bridge networking for iptables)
// - No ReadonlyRootfs
// - CapAdd: ['NET_ADMIN', 'NET_RAW']
// - Additional bind mount for ~/.claude
// - Cmd runs firewall init + claude CLI

async createContainer(
  taskId: TaskId,
  worktreePath: string,
  promptFile: string, // path relative to worktree, e.g. '.harness/prompt.txt'
): Promise<ContainerInfo> {
  const containerName = `agent-harness-task-${taskId}`;
  const homeDir = os.homedir();

  const container = await this.docker.createContainer({
    Image: IMAGE_NAME,
    name: containerName,
    Cmd: [
      'bash', '-c',
      `sudo /usr/local/bin/init-firewall.sh && claude --dangerously-skip-permissions -p "$(cat /workspace/${promptFile})"`,
    ],
    User: 'node',
    WorkingDir: '/workspace',
    Labels: {
      'agent-harness': 'true',
      'agent-harness.task-id': taskId,
    },
    HostConfig: {
      AutoRemove: true,
      CapAdd: ['NET_ADMIN', 'NET_RAW'],
      Binds: [
        `${worktreePath}:/workspace:rw`,
        `${homeDir}/.claude:/home/node/.claude:ro`,
      ],
    },
  });

  await container.start();

  const info: ContainerInfo = {
    taskId,
    containerId: container.id,
    containerName,
    repoPath: worktreePath,
    startedAt: new Date(),
  };

  this.registry.register(info);
  return info;
}
```

### TaskExecutor.executeTask() -- Rewritten

```typescript
// Key changes:
// - No more SDK query() call
// - Writes prompt to file in worktree
// - Delegates to ContainerManager for container lifecycle
// - Reads RESULT.md from worktree after container exits

async executeTask(
  prompt: string,
  worktreePath: string,
  runId: string,
): Promise<TaskResult> {
  // Write prompt to file for container to read
  const harnessDir = path.join(worktreePath, '.harness');
  await fs.mkdir(harnessDir, { recursive: true });
  await fs.writeFile(path.join(harnessDir, 'prompt.txt'), prompt, 'utf-8');

  // Container lifecycle managed externally (by workflow runner)
  // This method is called with an active container
  // ... or this method creates the container itself

  // Read RESULT.md after container exits
  let resultText = '';
  try {
    resultText = await fs.readFile(path.join(worktreePath, 'RESULT.md'), 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  return { exitCode, resultText };
}
```

### Dockerfile (agent-harness image)

```dockerfile
# Based on Claude Code devcontainer reference
FROM node:20

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    iptables \
    ipset \
    iproute2 \
    dnsutils \
    sudo \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Grant node user passwordless sudo for iptables/ipset
RUN echo "node ALL=(ALL) NOPASSWD: /usr/sbin/iptables, /usr/sbin/ip6tables, /usr/sbin/ipset, /usr/local/bin/init-firewall.sh" \
    >> /etc/sudoers.d/node-firewall

# Copy firewall init script
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod +x /usr/local/bin/init-firewall.sh

# Set working directory
WORKDIR /workspace
USER node
```

### init-firewall.sh (reference)

```bash
#!/usr/bin/env bash
set -euo pipefail

# Flush existing rules
iptables -F
iptables -X

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow DNS (udp/tcp port 53)
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# Create ipset for allowed destinations
ipset create allowed-domains hash:net -exist

# Resolve and add whitelisted domains
for domain in api.anthropic.com registry.npmjs.org; do
  for ip in $(dig +short "$domain" 2>/dev/null); do
    ipset add allowed-domains "$ip/32" -exist
  done
done

# Add GitHub IP ranges from their meta API
curl -s https://api.github.com/meta | \
  grep -oP '"[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+"' | \
  tr -d '"' | while read cidr; do
    ipset add allowed-domains "$cidr" -exist
  done

# Allow traffic to whitelisted IPs
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

# Default deny all other outbound
iptables -A OUTPUT -j DROP
iptables -P OUTPUT DROP

echo "[init-firewall] Firewall configured successfully"
```

## State of the Art

| Old Approach (Phase 1) | New Approach (Phase 5) | Why Changed |
|------------------------|------------------------|-------------|
| NetworkMode: none | Bridge + iptables firewall | Agent needs selective network access (API, npm, GitHub) |
| ReadonlyRootfs: true | Writable rootfs | Claude Code needs write access to ~/.claude, npm cache, etc. |
| node:20-alpine image | Custom agent-harness:latest | Need Claude Code CLI, iptables, ipset pre-installed |
| SDK query() in-process | Claude CLI subprocess in container | Full isolation -- agent process runs entirely inside container |
| sleep infinity + exec | Container Cmd runs task directly | Simpler lifecycle, cleaner cleanup |

## Open Questions

1. **HITL in Container Model**
   - What we know: Current HITL uses SDK's `canUseTool` callback to intercept AskUserQuestion. In the container model, the agent runs as a CLI subprocess with `--dangerously-skip-permissions`, which skips permission prompts.
   - What's unclear: How does AskUserQuestion work in CLI `-p` mode? Does Claude Code CLI support file-based question/answer IPC?
   - Recommendation: For v1, run in non-interactive mode. If the agent needs human input, it can write a question to a file and exit with a specific exit code. The host detects this, surfaces the question, gets the answer, and re-runs. Alternatively, HITL may be deferred for containerized execution in v1.

2. **AutoRemove vs Manual Cleanup**
   - What we know: AutoRemove: true removes the container after process exit. reclaimOrphans() handles crash cases by force-removing labeled containers.
   - What's unclear: If the Docker daemon crashes or the host is killed (SIGKILL), AutoRemove may not fire, and reclaimOrphans() won't run until next startup.
   - Recommendation: Keep AutoRemove: true for normal path. reclaimOrphans() on startup catches the crash path. This is the existing pattern and works well.

3. **Image Build Timing**
   - What we know: The image must be built before first use. User decision says "auto-build on first run."
   - What's unclear: Build can take minutes. Should it block the first run, or should there be an explicit `agent-harness build-image` command?
   - Recommendation: Provide both. `ensureImage()` checks if `agent-harness:latest` exists, if not, triggers build with progress output. Also expose `agent-harness build-image` CLI command for explicit builds.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 2.x |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run src/container/manager.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONT-01 | Container created with correct image, mounts, caps | integration | `npx vitest run src/container/manager.test.ts -x` | Exists but needs update |
| CONT-01 | TaskExecutor writes prompt file and reads RESULT.md after container exit | unit (mocked) | `npx vitest run src/executor/executor.test.ts -x` | Exists but needs rewrite |
| CONT-02 | Container has iptables firewall blocking non-whitelisted traffic | integration | `npx vitest run src/container/manager.test.ts -x` | Needs new test |
| CONT-02 | init-firewall.sh runs successfully inside container | integration | `npx vitest run src/container/manager.test.ts -x` | Needs new test |

### Sampling Rate
- **Per task commit:** `npx vitest run src/container/ src/executor/ -x`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/container/manager.test.ts` -- update tests for new createContainer signature (CapAdd, new image, mounts)
- [ ] `src/container/manager.test.ts` -- add firewall verification test (wget blocked, API reachable)
- [ ] `src/executor/executor.test.ts` -- rewrite for container-based execution (mock dockerode, not SDK)
- [ ] `docker/Dockerfile` -- new file, no test needed (validated by integration tests)
- [ ] `docker/init-firewall.sh` -- new file, validated by integration tests

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/container/manager.ts`, `src/executor/executor.ts`, `src/workflow/runner.ts` -- read directly
- `@types/dockerode` index.d.ts -- Container.exec, Container.wait, ExecCreateOptions, CapAdd API verified
- Claude Code devcontainer Dockerfile (raw.githubusercontent.com) -- node:20, iptables, ipset, Claude CLI, node user
- Claude Code devcontainer.json (raw.githubusercontent.com) -- cap-add NET_ADMIN/NET_RAW, volume mounts, postStartCommand

### Secondary (MEDIUM confidence)
- Claude Code init-firewall.sh (raw.githubusercontent.com) -- ipset allowed-domains, GitHub meta API, default-deny pattern
- Dockerode container.wait() API -- returns `{ StatusCode }` promise

### Tertiary (LOW confidence)
- HITL behavior in Claude CLI `-p` mode -- unclear how AskUserQuestion tool works in non-interactive mode; needs validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- dockerode already in use, API surface verified via types
- Architecture: HIGH -- devcontainer reference provides proven pattern, existing code paths clear
- Pitfalls: HIGH -- identified from devcontainer reference and Docker documentation patterns
- HITL in containers: LOW -- unclear how CLI `-p` mode handles AskUserQuestion tool

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable Docker/iptables patterns, slow-moving ecosystem)
