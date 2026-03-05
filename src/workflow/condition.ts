/**
 * Edge condition evaluator for workflow DAG edges.
 * Evaluates whether an edge should activate based on a node's output.
 */

import type { EdgeCondition } from '../types/index.js';

/**
 * Evaluate an edge condition against a node's output.
 *
 * @param condition - The edge condition, or undefined for unconditional edges
 * @param nodeOutput - The key-value output of the source node
 * @returns true if the edge should activate
 */
export function evaluateCondition(
  condition: EdgeCondition | undefined,
  nodeOutput: Record<string, unknown>,
): boolean {
  if (condition === undefined) {
    return true;
  }

  const value = String(nodeOutput[condition.field] ?? '');

  if (condition.equals !== undefined) {
    return value === condition.equals;
  }
  if (condition.notEquals !== undefined) {
    return value !== condition.notEquals;
  }
  if (condition.contains !== undefined) {
    return value.includes(condition.contains);
  }

  // No operator specified (shouldn't happen with schema validation)
  return true;
}
