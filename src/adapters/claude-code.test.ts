import { describe, it, expect } from 'vitest';
import { ClaudeCodeAdapter } from './claude-code.js';

describe('ClaudeCodeAdapter', () => {
  const adapter = new ClaudeCodeAdapter();

  describe('buildCommand', () => {
    it('should return claude command with prompt and output path', () => {
      const result = adapter.buildCommand({
        prompt: 'Hello world',
        outputPath: '/tmp/output/result.txt',
      });

      expect(result).toEqual([
        'claude',
        '--dangerously-skip-permissions',
        '-p',
        'Hello world',
        '--output-file',
        '/tmp/output/result.txt',
      ]);
    });

    it('should handle prompts with special characters', () => {
      const result = adapter.buildCommand({
        prompt: 'Fix the "bug" in file.ts',
        outputPath: '/tmp/output/result.txt',
      });

      expect(result[3]).toBe('Fix the "bug" in file.ts');
    });
  });

  describe('buildLoginCommand', () => {
    it('should return bash shell command', () => {
      const result = adapter.buildLoginCommand();
      expect(result).toEqual(['/bin/bash']);
    });
  });
});
