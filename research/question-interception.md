## Spec: Intercepting Claude Code's `AskUserQuestion` via Hooks

### Overview

Claude Code has a **hooks** system that lets external programs intercept tool calls before they execute. This repo uses a `PreToolUse` hook to intercept `AskUserQuestion` tool calls, relay questions to the host via file-based IPC, and return the user's answer as modified tool input.

**Important**: `AskUserQuestion` is a tool call, not a permission dialog. It must be intercepted via `PreToolUse` (not `PermissionRequest`). `PreToolUse` fires before tool execution regardless of permission mode, including when `--dangerously-skip-permissions` is active.

### 1. Hook Registration

The hook is registered in `~/.claude/settings.json` under `hooks.PreToolUse`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [
          {
            "type": "command",
            "command": "node /opt/agent-harness/hook-handler.mjs"
          }
        ]
      }
    ]
  }
}
```

- `matcher` filters on tool name. `"AskUserQuestion"` ensures the hook only runs for question tool calls.
- `type` is `"command"` for a shell command hook.
- The three-level nesting is: hook event → matcher group → hook handlers.

### 2. Hook Invocation Protocol

When Claude Code is about to execute a tool, the `PreToolUse` hook fires:

1. **Pipes a JSON payload to the hook command's stdin.** The payload includes:
   - `hook_event_name` — `"PreToolUse"`
   - `tool_name` — `"AskUserQuestion"`
   - `tool_input` — the tool's parameters (contains `questions[]` with `question`, `options[]`, `header`, `multiSelect`)
   - Common fields: `session_id`, `transcript_path`, `cwd`, `permission_mode`

2. **Reads the hook's stdout for a JSON decision.**

3. **Exit code 0 with no stdout** = allow the tool call to proceed normally.

4. **Stderr is informational only** (logged but not parsed).

### 3. Response Format (stdout JSON)

To provide answers to a question, the hook returns:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "questions": [
        /* original questions array, passed back unchanged */
      ],
      "answers": {
        "<question text>": "<selected option label>"
      }
    }
  }
}
```

- `permissionDecision`: `"allow"` bypasses the permission system, `"deny"` blocks the tool call, `"ask"` prompts the user.
- `updatedInput`: modifies the tool's input before execution. For `AskUserQuestion`, this sets the `answers` map so Claude Code receives the answers without prompting the user.
- `answers` is a map of question text → chosen option label.
- `questions` is passed back unchanged from the input.

#### No output (fallback)

Exiting with code 0 and no stdout lets the tool call proceed normally (Claude Code will try to prompt the user as usual). This is the safe default for errors or timeouts.

### 4. Hook Events Reference

| Event | When it fires | Matcher | Can block? |
|---|---|---|---|
| `PreToolUse` | Before a tool call executes | Tool name | Yes |
| `PermissionRequest` | When a permission dialog appears | Tool name | Yes |
| `PostToolUse` | After a tool call succeeds | Tool name | No |
| `Notification` | When Claude Code sends a notification | Notification type | No |

`PermissionRequest` does NOT fire for `AskUserQuestion` — it only fires for actual permission dialogs (e.g. "Allow Bash to run X?"). With `--dangerously-skip-permissions`, `PermissionRequest` never fires at all, but `PreToolUse` still fires.

### 5. Key Constraints

- The hook command **blocks** Claude Code until it exits.
- stdout must contain **exactly one valid JSON object** or be empty — no extra output.
- The hook runs once per tool call; there's no persistent connection.
- Hooks are loaded at **session startup** — changes to `settings.json` require starting a new Claude Code session.
- `--dangerously-skip-permissions` sets `permission_mode: "bypassPermissions"` but does NOT prevent `PreToolUse` hooks from firing.
