import { describe, it, expect } from 'vitest';
import { ClaudeCodeAdapter } from './claude-code.js';

describe('ClaudeCodeAdapter', () => {
  const adapter = new ClaudeCodeAdapter();

  describe('buildCommand', () => {
    it('should return sh -c command that redirects claude output to file', () => {
      const result = adapter.buildCommand({
        prompt: 'Hello world',
        outputPath: '/tmp/output/result.txt',
      });

      expect(result).toEqual([
        'sh',
        '-c',
        "claude -p 'Hello world' > /tmp/output/result.txt 2>&1",
      ]);
    });

    it('should shell-escape single quotes in prompts', () => {
      const result = adapter.buildCommand({
        prompt: "it's a test",
        outputPath: '/tmp/output/result.txt',
      });

      expect(result[2]).toContain("'it'\\''s a test'");
    });

    it('should handle prompts with double quotes', () => {
      const result = adapter.buildCommand({
        prompt: 'Fix the "bug" in file.ts',
        outputPath: '/tmp/output/result.txt',
      });

      expect(result[2]).toContain('\'Fix the "bug" in file.ts\'');
    });
  });

  describe('buildLoginCommand', () => {
    it('should return bash shell command', () => {
      const result = adapter.buildLoginCommand();
      expect(result).toEqual(['/bin/bash']);
    });
  });
});
