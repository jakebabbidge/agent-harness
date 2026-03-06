# Tech Stack

## Core stack

- Language: TypeScript (strict mode)
- Runtime: Node.js
- Package manager: pnpm
- CLI framework: Commander.js
- Data store: File system only (no database)
- Containerisation: Docker (for agent isolation)

## Coding standards

- Strict TypeScript configuration
- ESLint with @typescript-eslint
- Prettier for formatting
- Prefer industry-standard libraries over custom implementations

## Testing standards

- Framework: Vitest
- Unit tests: extensive coverage expected — the codebase should be agent-friendly with high confidence
- Integration tests: cover execution engine and workflow orchestration
- End-to-end tests: cover CLI commands and full workflow runs

## Local workflow

- Install: `pnpm install`
- Run: `pnpm start`
- Build: `pnpm build`
- Test: `pnpm test`
- Lint/format: `pnpm lint && pnpm format`

## Delivery notes

- Must support Claude Code OAuth login (user's subscription plan), not just API keys
- Global config stored in `~/.agent-harness/`
- Prompt templates and workflow definitions stored in global config directory
