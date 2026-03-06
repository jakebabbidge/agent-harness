# Project

## Summary

Agent Harness is a CLI tool that wraps coding agents (such as Claude Code) to provide standardised prompt management, isolated execution, and workflow orchestration. It gives individual developers a reliable, composable system for running agent-driven coding tasks against their repositories.

## Users

- Individual developers using coding agents in their own projects

## Problem

Coding agents like Claude Code lack standardised ways to:
- Organise and compose prompt templates
- Execute tasks in isolation without risking the working repository
- Run multiple tasks in parallel against the same codebase
- Chain agent executions into multi-step workflows with feedback loops

## Why this exists

To make coding agents more reliable, repeatable, and safe by providing the execution infrastructure around them rather than reimplementing the agents themselves.

## Product ethos

- **Composability** — small, composable primitives that users combine into workflows
- **Safety first** — isolation and sandboxing are first-class concerns, not afterthoughts
- **Agent-agnostic** — not tied to any single agent tool; Claude Code today, others tomorrow
- **Convention over configuration** — sensible defaults, minimal setup, opinionated where it matters

## Success qualities

- Reliable and correct agent execution every time
- Extensible to new agent backends and workflow patterns
- Efficient parallel task execution
- Simple to set up and intuitive to use

## Non-goals

- Not a UI or dashboard — CLI only
- Not an agent itself — wraps existing agents, does not implement its own AI reasoning
- Not a hosting platform — local execution only
- Not a prompt marketplace — users manage their own prompt library
