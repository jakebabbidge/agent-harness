import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve, dirname, join } from 'node:path';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';
import { resolveFileReferences } from './file-resolver.js';

const mockReadFile = vi.mocked(readFile);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveFileReferences', () => {
  const basePath = '/home/user/.agent-harness/prompts/main.md';

  it('should return content unchanged when there are no file references', async () => {
    const content = 'Hello {{name}}, welcome!';
    const result = await resolveFileReferences(content, basePath);
    expect(result).toBe(content);
  });

  it('should resolve a single file reference', async () => {
    const content = 'Header: {{file://header.md}}\nBody here';
    mockReadFile.mockResolvedValue('Welcome Banner');

    const result = await resolveFileReferences(content, basePath);

    expect(result).toBe('Header: Welcome Banner\nBody here');
    expect(mockReadFile).toHaveBeenCalledWith(
      resolve(dirname(basePath), 'header.md'),
      'utf-8',
    );
  });

  it('should resolve multiple file references', async () => {
    const content = '{{file://header.md}}\n{{file://footer.md}}';
    mockReadFile.mockImplementation(async (path) => {
      if ((path as string).endsWith('header.md')) return 'HEADER';
      if ((path as string).endsWith('footer.md')) return 'FOOTER';
      throw new Error('unexpected');
    });

    const result = await resolveFileReferences(content, basePath);
    expect(result).toBe('HEADER\nFOOTER');
  });

  it('should resolve nested file references', async () => {
    const content = '{{file://outer.md}}';
    mockReadFile.mockImplementation(async (path) => {
      if ((path as string).endsWith('outer.md'))
        return 'Outer: {{file://inner.md}}';
      if ((path as string).endsWith('inner.md')) return 'Inner Content';
      throw new Error('unexpected');
    });

    const result = await resolveFileReferences(content, basePath);
    expect(result).toBe('Outer: Inner Content');
  });

  it('should resolve paths relative to the containing file', async () => {
    const content = '{{file://sub/component.md}}';
    const subDir = resolve(dirname(basePath), 'sub');
    mockReadFile.mockImplementation(async (path) => {
      if ((path as string).endsWith('component.md'))
        return '{{file://nested.md}}';
      if ((path as string) === join(subDir, 'nested.md')) return 'Nested!';
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await resolveFileReferences(content, basePath);
    expect(result).toBe('Nested!');
  });

  it('should detect circular references', async () => {
    const content = '{{file://a.md}}';
    mockReadFile.mockImplementation(async (path) => {
      if ((path as string).endsWith('a.md')) return '{{file://b.md}}';
      if ((path as string).endsWith('b.md')) return '{{file://a.md}}';
      throw new Error('unexpected');
    });

    await expect(resolveFileReferences(content, basePath)).rejects.toThrow(
      'Circular file reference detected',
    );
  });

  it('should detect self-references', async () => {
    const selfPath = '/home/user/.agent-harness/prompts/self.md';
    const content = '{{file://self.md}}';
    mockReadFile.mockResolvedValue('{{file://self.md}}');

    await expect(resolveFileReferences(content, selfPath)).rejects.toThrow(
      'Circular file reference detected',
    );
  });

  it('should throw a descriptive error for missing file references', async () => {
    const content = '{{file://missing.md}}';
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    mockReadFile.mockRejectedValue(enoent);

    await expect(resolveFileReferences(content, basePath)).rejects.toThrow(
      /File reference not found.*missing\.md/,
    );
  });
});
