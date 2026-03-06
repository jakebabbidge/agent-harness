# Prompts

## Purpose

Manages the prompt template library. Loads, composes, and renders prompt templates with variable substitution.

## Responsibilities

- Load prompt templates from `~/.agent-harness/`
- Support composing prompts from multiple template sections/components
- Substitute variables into templates
- Validate templates and report errors on missing variables or sections

## Invariants

- Prompt rendering is stateless and pure — same inputs always produce the same output
- Templates are read-only during rendering

## Interfaces

- Inputs: template name/path, variable map, composition directives
- Outputs: rendered prompt string
- Public APIs/events: render(template, variables) -> string

## Key flows

1. Execution engine requests a prompt -> prompt engine resolves template path -> loads and composes sections -> substitutes variables -> returns rendered prompt

## Dependencies

- Upstream: execution, workflows (consumers of rendered prompts)
- Downstream: file system (template storage in `~/.agent-harness/`)

## Constraints

- Templates live in global config, not in the target repo

## High level code locations

- (not yet implemented)
