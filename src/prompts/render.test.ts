import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./template-loader.js', () => ({
  loadTemplate: vi.fn(),
  resolveTemplatePath: vi.fn(),
}));

vi.mock('./file-resolver.js', () => ({
  resolveFileReferences: vi.fn(),
}));

import { loadTemplate, resolveTemplatePath } from './template-loader.js';
import { resolveFileReferences } from './file-resolver.js';
import { renderTemplate } from './render.js';

const mockLoadTemplate = vi.mocked(loadTemplate);
const mockResolveTemplatePath = vi.mocked(resolveTemplatePath);
const mockResolveFileReferences = vi.mocked(resolveFileReferences);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('renderTemplate', () => {
  it('should load, resolve file refs, and substitute variables', async () => {
    mockLoadTemplate.mockResolvedValue('Hello {{name}}!');
    mockResolveTemplatePath.mockReturnValue('/templates/greet.md');
    mockResolveFileReferences.mockResolvedValue('Hello {{name}}!');

    const result = await renderTemplate({
      templatePath: '/templates/greet.md',
      variables: { name: 'Alice' },
    });

    expect(result).toBe('Hello Alice!');
    expect(mockLoadTemplate).toHaveBeenCalledWith('/templates/greet.md');
    expect(mockResolveFileReferences).toHaveBeenCalledWith(
      'Hello {{name}}!',
      '/templates/greet.md',
    );
  });

  it('should throw when a variable is missing (Handlebars strict mode)', async () => {
    mockLoadTemplate.mockResolvedValue('Hello {{name}}, you are {{role}}');
    mockResolveTemplatePath.mockReturnValue('/templates/greet.md');
    mockResolveFileReferences.mockResolvedValue(
      'Hello {{name}}, you are {{role}}',
    );

    await expect(
      renderTemplate({
        templatePath: '/templates/greet.md',
        variables: { name: 'Alice' },
      }),
    ).rejects.toThrow();
  });

  it('should render template with no variables', async () => {
    mockLoadTemplate.mockResolvedValue('No variables here.');
    mockResolveTemplatePath.mockReturnValue('/templates/static.md');
    mockResolveFileReferences.mockResolvedValue('No variables here.');

    const result = await renderTemplate({
      templatePath: '/templates/static.md',
      variables: {},
    });

    expect(result).toBe('No variables here.');
  });

  it('should propagate errors from template loading', async () => {
    mockLoadTemplate.mockRejectedValue(
      new Error('Template not found: /path.md'),
    );

    await expect(
      renderTemplate({ templatePath: '/path.md', variables: {} }),
    ).rejects.toThrow('Template not found');
  });

  it('should propagate errors from file resolution', async () => {
    mockLoadTemplate.mockResolvedValue('{{file://bad.md}}');
    mockResolveTemplatePath.mockReturnValue('/templates/t.md');
    mockResolveFileReferences.mockRejectedValue(
      new Error('File reference not found'),
    );

    await expect(
      renderTemplate({ templatePath: '/templates/t.md', variables: {} }),
    ).rejects.toThrow('File reference not found');
  });
});
