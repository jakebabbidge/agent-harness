# Agent Harness

## What

Agent harness is a CLI tool wrapping other coding agent tools such as claude code creating a standardised execution workflow around it.

### Standardised prompting

It creates a standardised way to maintain and organise a library of prompt templates, the prompt templating allows for organisation of prompts into separate components and combining different sections along with substituting certain variables in.

### Standardised, isolated execution

It creates a standardised way to execute a prompt against a repository in an isolated manner. The isolated runtime allows for surfacing of agent's questions to answer from the main tool. The isolated runtime allows for many in-flight tasks to be worked on inside a codebase at the same time using git as a codebase tracking mechanism. The isolated runtime allows for tool use without permission by only giving the isolated runtime access to resources it is allowed to access.

### Standardised workflow execution

It creates a standardised way to execute a graph of prompts. Each prompt (node in the graph) might take in some input, and generate some output for the next prompt, or for the workflow execution to know what node to run next. This allows for workflows such as an implementation planner which takes in an implementation change ticket, generates a plan, another agent reviews the plan, and if there is more feedback it repeats that cycle until the plan is approved. It could then flow onto an implementation agent for example.

###

## Why

## How
