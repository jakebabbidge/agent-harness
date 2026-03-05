import { describe, it, expect } from 'vitest';
import { topologicalTiers } from './dag.js';

describe('topologicalTiers', () => {
  it('returns single node in one tier when no edges', () => {
    const result = topologicalTiers(['A'], []);
    expect(result).toEqual([['A']]);
  });

  it('groups two independent nodes into the same tier', () => {
    const result = topologicalTiers(['A', 'B'], []);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('A');
    expect(result[0]).toContain('B');
  });

  it('produces linear tiers for a chain A->B->C', () => {
    const result = topologicalTiers(
      ['A', 'B', 'C'],
      [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
      ],
    );
    expect(result).toEqual([['A'], ['B'], ['C']]);
  });

  it('produces correct tiers for a diamond DAG', () => {
    const result = topologicalTiers(
      ['A', 'B', 'C', 'D'],
      [
        { from: 'A', to: 'B' },
        { from: 'A', to: 'C' },
        { from: 'B', to: 'D' },
        { from: 'C', to: 'D' },
      ],
    );
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(['A']);
    expect(result[1]).toContain('B');
    expect(result[1]).toContain('C');
    expect(result[2]).toEqual(['D']);
  });

  it('throws error with "circular" for a cycle A->B->A', () => {
    expect(() =>
      topologicalTiers(
        ['A', 'B'],
        [
          { from: 'A', to: 'B' },
          { from: 'B', to: 'A' },
        ],
      ),
    ).toThrow(/circular/i);
  });

  it('throws error with "circular" for a self-loop A->A', () => {
    expect(() =>
      topologicalTiers(['A'], [{ from: 'A', to: 'A' }]),
    ).toThrow(/circular/i);
  });

  it('throws error when edge references unknown node', () => {
    expect(() =>
      topologicalTiers(['A'], [{ from: 'A', to: 'Z' }]),
    ).toThrow();
  });
});
