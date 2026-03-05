import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dryRunCommand } from './dry-run.js';

vi.mock('../template/renderer.js', () => ({
  dryRunRender: vi.fn().mockResolvedValue({
    rendered: 'rendered output',
    templatePath: 'test.hbs',
    partialPaths: [],
    variables: {},
  }),
}));

import { dryRunRender } from '../template/renderer.js';

const mockDryRunRender = vi.mocked(dryRunRender);

describe('dryRunCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls dryRunRender with parsed variables and partial paths', async () => {
    await dryRunCommand('template.hbs', {
      variables: '{"name":"test","count":3}',
      partials: ['header.hbs', 'footer.hbs'],
    });

    expect(mockDryRunRender).toHaveBeenCalledWith(
      'template.hbs',
      { name: 'test', count: 3 },
      ['header.hbs', 'footer.hbs'],
    );
  });

  it('uses empty object for default variables', async () => {
    await dryRunCommand('template.hbs', {});

    expect(mockDryRunRender).toHaveBeenCalledWith(
      'template.hbs',
      {},
      [],
    );
  });

  it('uses empty array when partials not provided', async () => {
    await dryRunCommand('template.hbs', { variables: '{"x":1}' });

    expect(mockDryRunRender).toHaveBeenCalledWith(
      'template.hbs',
      { x: 1 },
      [],
    );
  });

  it('exits with code 1 on invalid JSON variables', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      dryRunCommand('template.hbs', { variables: 'not-json' }),
    ).rejects.toThrow('process.exit called');

    expect(mockError).toHaveBeenCalledWith(
      '[agent-harness] Error: --variables must be a valid JSON string.',
    );
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    mockError.mockRestore();
  });
});
