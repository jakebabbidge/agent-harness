import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./template-loader.js', () => ({
  loadTemplate: vi.fn(),
  getTemplatePath: vi.fn(),
}));

vi.mock('./file-resolver.js', () => ({
  resolveFileReferences: vi.fn(),
}));

import { loadTemplate, getTemplatePath } from './template-loader.js';
import { resolveFileReferences } from './file-resolver.js';
import { renderTemplate } from './render.js';

const mockLoadTemplate = vi.mocked(loadTemplate);
const mockGetTemplatePath = vi.mocked(getTemplatePath);
const mockResolveFileReferences = vi.mocked(resolveFileReferences);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('renderTemplate', () => {
  it('should load, resolve file refs, and substitute variables', async () => {
    mockLoadTemplate.mockResolvedValue('Hello {{name}}!');
    mockGetTemplatePath.mockReturnValue('/templates/greet.md');
    mockResolveFileReferences.mockResolvedValue('Hello {{name}}!');

    const result = await renderTemplate({
      templateName: 'greet',
      variables: { name: 'Alice' },
    });

    expect(result).toBe('Hello Alice!');
    expect(mockLoadTemplate).toHaveBeenCalledWith('greet');
    expect(mockResolveFileReferences).toHaveBeenCalledWith(
      'Hello {{name}}!',
      '/templates/greet.md',
    );
  });

  it('should throw when a variable is missing (Handlebars strict mode)', async () => {
    mockLoadTemplate.mockResolvedValue('Hello {{name}}, you are {{role}}');
    mockGetTemplatePath.mockReturnValue('/templates/greet.md');
    mockResolveFileReferences.mockResolvedValue(
      'Hello {{name}}, you are {{role}}',
    );

    await expect(
      renderTemplate({
        templateName: 'greet',
        variables: { name: 'Alice' },
      }),
    ).rejects.toThrow();
  });

  it('should render template with no variables', async () => {
    mockLoadTemplate.mockResolvedValue('No variables here.');
    mockGetTemplatePath.mockReturnValue('/templates/static.md');
    mockResolveFileReferences.mockResolvedValue('No variables here.');

    const result = await renderTemplate({
      templateName: 'static',
      variables: {},
    });

    expect(result).toBe('No variables here.');
  });

  it('should propagate errors from template loading', async () => {
    mockLoadTemplate.mockRejectedValue(new Error('Template not found: /path'));

    await expect(
      renderTemplate({ templateName: 'missing', variables: {} }),
    ).rejects.toThrow('Template not found');
  });

  it('should propagate errors from file resolution', async () => {
    mockLoadTemplate.mockResolvedValue('{{file://bad.md}}');
    mockGetTemplatePath.mockReturnValue('/templates/t.md');
    mockResolveFileReferences.mockRejectedValue(
      new Error('File reference not found'),
    );

    await expect(
      renderTemplate({ templateName: 't', variables: {} }),
    ).rejects.toThrow('File reference not found');
  });
});
