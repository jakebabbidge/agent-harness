import { describe, it, expect } from 'vitest';
import { ClaudeCodeAdapter } from './claude-code.js';

describe('ClaudeCodeAdapter', () => {
  const adapter = new ClaudeCodeAdapter();

  describe('buildCommand', () => {
    it('should return node command to run agent-runner.js', () => {
      const result = adapter.buildCommand({
        promptPath: '/tmp/output/prompt.txt',
        outputPath: '/tmp/output/result.txt',
      });

      expect(result).toEqual(['node', '/opt/agent-harness/agent-runner.js']);
    });
  });
});
