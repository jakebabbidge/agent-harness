import { describe, it, expect } from 'vitest';
import { program } from './index.js';

describe('CLI entry point', () => {
  it('should have the correct program name', () => {
    expect(program.name()).toBe('agent-harness');
  });

  it('should have a version set', () => {
    expect(program.version()).toBe('0.1.0');
  });

  it('should have a description set', () => {
    expect(program.description()).toBeTruthy();
  });
});
