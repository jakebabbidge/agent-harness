import { describe, it, expect } from 'vitest';
import { evaluateCondition } from './condition.js';

describe('evaluateCondition', () => {
  it('returns true when condition is undefined (unconditional)', () => {
    expect(evaluateCondition(undefined, { status: 'ok' })).toBe(true);
  });

  it('returns true when equals matches', () => {
    expect(
      evaluateCondition({ field: 'status', equals: 'ok' }, { status: 'ok' }),
    ).toBe(true);
  });

  it('returns false when equals does not match', () => {
    expect(
      evaluateCondition({ field: 'status', equals: 'ok' }, { status: 'bad' }),
    ).toBe(false);
  });

  it('returns true when notEquals does not match', () => {
    expect(
      evaluateCondition({ field: 'x', notEquals: 'y' }, { x: 'z' }),
    ).toBe(true);
  });

  it('returns false when notEquals matches', () => {
    expect(
      evaluateCondition({ field: 'x', notEquals: 'y' }, { x: 'y' }),
    ).toBe(false);
  });

  it('returns true when contains is found in value', () => {
    expect(
      evaluateCondition({ field: 'x', contains: 'bar' }, { x: 'foobar' }),
    ).toBe(true);
  });

  it('returns false when contains is not found in value', () => {
    expect(
      evaluateCondition({ field: 'x', contains: 'baz' }, { x: 'foobar' }),
    ).toBe(false);
  });

  it('treats missing field in output as empty string', () => {
    expect(
      evaluateCondition({ field: 'missing', equals: '' }, { other: 'val' }),
    ).toBe(true);
    expect(
      evaluateCondition({ field: 'missing', equals: 'something' }, { other: 'val' }),
    ).toBe(false);
  });
});
