import { describe, it, expect } from 'vitest';
import { ClaudeCodeAdapter } from './claude-code.js';

describe('ClaudeCodeAdapter', () => {
  const adapter = new ClaudeCodeAdapter();

  describe('buildCommand', () => {
    it('should return node command to run agent-runner.js', () => {
      const result = adapter.buildCommand();

      expect(result).toEqual([
        'node',
        '/opt/agent-harness/runtime/agent-runner.js',
      ]);
    });
  });
});
