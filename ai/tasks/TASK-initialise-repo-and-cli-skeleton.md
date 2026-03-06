# TASK: Initialise repo structure and CLI skeleton

## Summary

Set up the foundational project structure (package.json, TypeScript config, linting, testing) and create a barebones CLI entry point using Commander.js with no functional commands yet.

## Motivation

The repo is currently greenfield — it contains only `/ai/` context files and no source code. All future work depends on having the project scaffolding and a working CLI entry point in place.

## Relevant context

- Domains: [CLI](../domains/cli.md)
- Files/components: `package.json`, `tsconfig.json`, `src/`, `src/cli/`
- ADRs: None directly, though the tech stack choices (TypeScript strict, pnpm, Commander.js, Vitest) are defined in [TECH_STACK.md](../TECH_STACK.md)

## Scope

- Initialise `package.json` with pnpm
- Configure TypeScript in strict mode (`tsconfig.json`)
- Configure ESLint with `@typescript-eslint`
- Configure Prettier
- Configure Vitest
- Create `src/cli/index.ts` as the CLI entry point using Commander.js
- Register the CLI program with a name, version, and description — no functional commands yet
- Add npm scripts: `start`, `test`, `lint`, `format`
- Add a single smoke test that verifies the CLI entry point can be imported without errors

## Out of scope

- Any functional CLI commands (run, prompt, workflow, question answering)
- Docker setup or Dockerfiles
- Prompt engine, execution engine, workflow engine, or adapter code
- Global config directory (`~/.agent-harness/`) setup
- CI/CD pipeline

## Acceptance criteria

- [ ] `pnpm install` completes without errors
- [ ] `pnpm test` runs Vitest and the smoke test passes
- [ ] `pnpm lint` runs ESLint with `@typescript-eslint` and reports no errors
- [ ] `pnpm format` runs Prettier and reports no unformatted files
- [ ] TypeScript compiles in strict mode with no errors
- [ ] `src/cli/index.ts` exports a Commander.js program with name, version, and description set
- [ ] Running the CLI with `--help` prints usage information
- [ ] Running the CLI with `--version` prints the version number

## Verification checklist

- [ ] Code implemented
- [ ] Tests added/updated
- [ ] Lint/format passed
- [ ] Manual verification completed
- [ ] Docs updated if needed
