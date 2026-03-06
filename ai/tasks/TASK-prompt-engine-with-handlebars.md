# TASK: Prompt engine with Handlebars templating

## Summary

Build the prompt engine as a new subsystem that loads `.md` templates from `~/.agent-harness/prompts/`, resolves file references, substitutes variables via Handlebars, validates inputs, and wire it into the CLI so `run <template-name>` resolves and renders a template before passing it to the execution engine. Also add a `dry-run` command that outputs the rendered prompt without executing it.

## Motivation

The execution engine currently accepts raw prompt strings directly from the CLI. This limits reusability and composability. A proper prompt engine enables users to maintain a library of versioned, parameterised, composable prompt templates — a core design goal of the project (see [PROJECT.md](../PROJECT.md) composability ethos).

## Relevant context

- Domains: [Prompts](../domains/prompts.md), [CLI](../domains/cli.md), [Execution](../domains/execution.md)
- Files/components:
  - `src/cli/index.ts` — `run` command definition (currently takes raw string)
  - `src/execution/container-lifecycle.ts` — `executeRun()` receives prompt string
  - New `src/prompts/` directory for the prompt engine
- ADRs: None directly applicable

## Scope

- Create `src/prompts/` module implementing the prompt engine
- **Template loading**: resolve `<template-name>` to `~/.agent-harness/prompts/<template-name>.md` and read the file
- **File reference resolution**: before Handlebars compilation, recursively resolve `{{file://<relative-path>}}` directives by inlining the referenced file's contents; paths are relative to the file containing the directive; nested references (an included file referencing another file) are supported
- **Circular reference detection**: detect and report circular file references with a clear error
- **Variable substitution**: compile the resolved template with Handlebars and substitute `{{variable}}` placeholders using a provided variable map
- **Validation**: report clear errors for missing template files, unresolvable file references, and variables present in the template but missing from the provided variable map
- **CLI `run` command change**: change `run <template-name>` to resolve the template name through the prompt engine; accept variables via repeatable `--var key=value` flags; raw prompt strings are no longer accepted
- **CLI `dry-run` command**: add `dry-run <template-name>` that accepts the same arguments as `run` but prints the rendered prompt to stdout instead of executing it
- **Unit tests**: cover template loading, file reference resolution (including nested and circular), variable substitution, and validation error cases
- **Integration tests**: cover the `run` and `dry-run` CLI commands with the prompt engine wired in

## Out of scope

- Template creation, editing, or scaffolding commands
- Remote or repo-local template sources (only `~/.agent-harness/prompts/`)
- Variables from files or environment variables (CLI `--var` flags only for now)
- Partials, helpers, or other advanced Handlebars features beyond basic variable substitution
- Caching or precompilation of templates
- Changes to the execution engine interface (`executeRun` still receives a rendered prompt string)

## Acceptance criteria

- [ ] `run my-template --var name=Alice --var greeting=Hello` loads `~/.agent-harness/prompts/my-template.md`, renders it, and passes the result to the execution engine
- [ ] `dry-run my-template --var name=Alice` loads and renders the template, prints the rendered prompt to stdout, and does not start a Docker container
- [ ] `{{file://../components/header.md}}` in a template is replaced with the contents of the referenced file, resolved relative to the template file's directory
- [ ] Nested file references are resolved (an included file can itself contain `{{file://...}}` directives)
- [ ] Circular file references produce a clear error message naming the cycle
- [ ] `{{variable}}` placeholders are substituted via Handlebars using the provided `--var` map
- [ ] If a template file does not exist, the CLI prints a clear error message including the expected path and exits with a non-zero code
- [ ] If a `{{file://...}}` reference points to a non-existent file, the CLI prints a clear error message including the resolved path and exits with a non-zero code
- [ ] If a template contains variables that are not provided via `--var`, the CLI prints a clear error listing the missing variable names and exits with a non-zero code
- [ ] Running `run "some raw string"` where the argument does not match a template file produces a clear error indicating the template was not found (raw prompts are no longer supported)
- [ ] Unit tests cover: template loading, single-level file inclusion, nested file inclusion, circular reference detection, variable substitution, missing template error, missing file reference error, missing variable error
- [ ] Integration tests cover: `run` with a valid template, `dry-run` with a valid template
- [ ] `pnpm lint` and `pnpm test` pass

## Verification checklist

- [ ] Code implemented
- [ ] Tests added/updated
- [ ] Lint/format passed
- [ ] Manual verification completed
- [ ] Docs updated if needed
