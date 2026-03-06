import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';
import { resolveTemplatePath, loadTemplate } from './template-loader.js';

const mockReadFile = vi.mocked(readFile);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveTemplatePath', () => {
  it('should resolve a relative path to absolute', () => {
    const result = resolveTemplatePath('prompts/my-template.md');
    expect(result).toBe(resolve('prompts/my-template.md'));
  });

  it('should return absolute paths unchanged', () => {
    const result = resolveTemplatePath('/absolute/path/template.md');
    expect(result).toBe('/absolute/path/template.md');
  });
});

describe('loadTemplate', () => {
  it('should return file content on success', async () => {
    mockReadFile.mockResolvedValue('Hello {{name}}');
    const result = await loadTemplate('/templates/greeting.md');
    expect(result).toBe('Hello {{name}}');
    expect(mockReadFile).toHaveBeenCalledWith(
      '/templates/greeting.md',
      'utf-8',
    );
  });

  it('should throw a descriptive error when template is not found', async () => {
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    mockReadFile.mockRejectedValue(enoent);

    await expect(loadTemplate('/missing/template.md')).rejects.toThrow(
      'Template not found: /missing/template.md',
    );
  });

  it('should re-throw non-ENOENT errors', async () => {
    mockReadFile.mockRejectedValue(new Error('permission denied'));
    await expect(loadTemplate('/secret/template.md')).rejects.toThrow(
      'permission denied',
    );
  });
});
