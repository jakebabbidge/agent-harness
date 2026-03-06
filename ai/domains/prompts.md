# Prompts

## Purpose

Manages the prompt template library. Loads, composes, and renders prompt templates with variable substitution.

## Responsibilities

- Load prompt templates from `~/.agent-harness/prompts/`
- Resolve `{{file://<path>}}` directives by inlining referenced files (recursive, with circular detection)
- Compile templates with Handlebars (variables, loops, conditionals, etc.)
- Validate templates and report errors on missing files, circular references, or missing variables (via Handlebars strict mode)

## Invariants

- Prompt rendering is stateless and pure — same inputs always produce the same output
- Templates are read-only during rendering

## Interfaces

- Inputs: template name, variable map (`Record<string, string>`)
- Outputs: rendered prompt string
- Public APIs/events: `renderTemplate({ templateName, variables }) -> Promise<string>`

## Key flows

1. CLI calls `renderTemplate()` -> loads template from `~/.agent-harness/prompts/<name>.md` -> resolves `{{file://...}}` directives recursively -> compiles with Handlebars (strict mode) -> returns rendered prompt

## Dependencies

- Upstream: CLI, workflows (consumers of rendered prompts)
- Downstream: file system (template storage in `~/.agent-harness/`)

## Constraints

- Templates live in global config, not in the target repo

## High level code locations

- Template loading: `src/prompts/template-loader.ts`
- File reference resolution: `src/prompts/file-resolver.ts`
- Render orchestration (Handlebars compilation): `src/prompts/render.ts`
- Barrel export: `src/prompts/index.ts`
