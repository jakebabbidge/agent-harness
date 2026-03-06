import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';
import { getTemplatePath, loadTemplate } from './template-loader.js';

const mockReadFile = vi.mocked(readFile);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getTemplatePath', () => {
  it('should resolve template name to the correct path', () => {
    const result = getTemplatePath('my-template');
    expect(result).toBe(
      join(homedir(), '.agent-harness', 'prompts', 'my-template.md'),
    );
  });
});

describe('loadTemplate', () => {
  it('should return file content on success', async () => {
    mockReadFile.mockResolvedValue('Hello {{name}}');
    const result = await loadTemplate('greeting');
    expect(result).toBe('Hello {{name}}');
    expect(mockReadFile).toHaveBeenCalledWith(
      getTemplatePath('greeting'),
      'utf-8',
    );
  });

  it('should throw a descriptive error when template is not found', async () => {
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    mockReadFile.mockRejectedValue(enoent);

    await expect(loadTemplate('missing')).rejects.toThrow(
      `Template not found: ${getTemplatePath('missing')}`,
    );
  });

  it('should re-throw non-ENOENT errors', async () => {
    mockReadFile.mockRejectedValue(new Error('permission denied'));
    await expect(loadTemplate('secret')).rejects.toThrow('permission denied');
  });
});
