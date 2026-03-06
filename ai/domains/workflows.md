# Workflows

## Purpose

Orchestrates multi-step agent executions as directed acyclic graphs defined in YAML/JSON configuration files.

## Responsibilities

- Parse workflow definitions from YAML/JSON files
- Validate DAG structure (no cycles, all referenced nodes exist)
- Execute nodes in dependency order
- Route outputs from one node as inputs to the next
- Support conditional branching based on node output
- Report workflow-level status and progress

## Invariants

- Workflow definitions are declarative — no imperative code in workflow files
- A workflow is a valid DAG — cycles are rejected at parse time
- Each node in a workflow maps to exactly one execution engine invocation

## Interfaces

- Inputs: workflow definition file path, initial input variables
- Outputs: final workflow output, per-node results, workflow status
- Public APIs/events: runWorkflow(definitionPath, inputs)

## Key flows

1. User triggers workflow via CLI -> workflow engine loads YAML definition -> validates DAG
2. Workflow engine determines next runnable node(s) -> invokes execution engine for each
3. Node completes -> workflow engine captures output -> determines next node(s) based on output and graph edges
4. All nodes complete -> workflow reports final status and output

## Dependencies

- Upstream: CLI (invokes workflows)
- Downstream: execution (runs individual nodes), prompts (templates for each node)

## Constraints

- Workflow definitions stored in `~/.agent-harness/`
- Must support feedback loops (e.g., plan -> review -> revise -> re-review) expressed as valid DAG structures with conditional edges

## High level code locations

- (not yet implemented)
