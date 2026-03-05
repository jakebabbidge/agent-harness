/**
 * DAG topological sort with tier grouping using Kahn's algorithm.
 * Groups independent nodes into the same tier for concurrent execution.
 */

interface Edge {
  from: string;
  to: string;
}

/**
 * Compute topological tiers from a set of node IDs and directed edges.
 * Each tier contains nodes that can execute concurrently (all dependencies satisfied).
 *
 * @param nodeIds - Array of node identifiers
 * @param edges - Array of directed edges { from, to }
 * @returns string[][] - Array of tiers, each tier is an array of node IDs
 * @throws Error if the graph contains a cycle or edges reference unknown nodes
 */
export function topologicalTiers(nodeIds: string[], edges: Edge[]): string[][] {
  const nodeSet = new Set(nodeIds);

  // Validate edge references
  for (const edge of edges) {
    if (!nodeSet.has(edge.from)) {
      throw new Error(`Edge references unknown node: "${edge.from}"`);
    }
    if (!nodeSet.has(edge.to)) {
      throw new Error(`Edge references unknown node: "${edge.to}"`);
    }
  }

  // Build adjacency list and in-degree map
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of nodeIds) {
    adjacency.set(id, []);
    inDegree.set(id, 0);
  }

  for (const edge of edges) {
    adjacency.get(edge.from)!.push(edge.to);
    inDegree.set(edge.to, inDegree.get(edge.to)! + 1);
  }

  // BFS in waves -- each wave is one tier
  const tiers: string[][] = [];
  let queue: string[] = [];

  // Seed with nodes having in-degree 0
  for (const id of nodeIds) {
    if (inDegree.get(id) === 0) {
      queue.push(id);
    }
  }

  let scheduled = 0;

  while (queue.length > 0) {
    tiers.push([...queue]);
    scheduled += queue.length;

    const nextQueue: string[] = [];
    for (const node of queue) {
      for (const neighbor of adjacency.get(node)!) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          nextQueue.push(neighbor);
        }
      }
    }
    queue = nextQueue;
  }

  if (scheduled !== nodeIds.length) {
    const unscheduled = nodeIds.filter((id) => inDegree.get(id)! > 0);
    throw new Error(
      `Circular dependency detected among nodes: ${unscheduled.join(', ')}`,
    );
  }

  return tiers;
}
