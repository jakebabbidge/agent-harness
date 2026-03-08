import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { loadToken, runSetupToken, extractAndSaveToken } from './token.js';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);
const mockSpawn = vi.mocked(spawn);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadToken', () => {
  it('should read and return token from file', async () => {
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({
        CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-testtoken123',
      }) as never,
    );

    const token = await loadToken();
    expect(token).toBe('sk-ant-oat01-testtoken123');
  });

  it('should throw when token file does not exist', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT') as never);

    await expect(loadToken()).rejects.toThrow('No token found');
  });

  it('should throw when token file has no token value', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify({}) as never);

    await expect(loadToken()).rejects.toThrow('Invalid token file');
  });
});

describe('runSetupToken', () => {
  it('should extract token from claude setup-token output', async () => {
    const mockChild = {
      stdout: {
        on: vi.fn((event: string, handler: (chunk: Buffer) => void) => {
          if (event === 'data') {
            handler(Buffer.from('Token: sk-ant-oat01-abc123_XYZ-def456\n'));
          }
        }),
      },
      on: vi.fn((event: string, handler: (code: number | null) => void) => {
        if (event === 'close') {
          setTimeout(() => handler(0), 0);
        }
      }),
    };

    mockSpawn.mockReturnValueOnce(mockChild as never);

    const token = await runSetupToken();
    expect(token).toBe('sk-ant-oat01-abc123_XYZ-def456');
    expect(mockSpawn).toHaveBeenCalledWith('claude', ['setup-token'], {
      stdio: ['inherit', 'pipe', 'inherit'],
    });
  });

  it('should reject when no token found in output', async () => {
    const mockChild = {
      stdout: {
        on: vi.fn((event: string, handler: (chunk: Buffer) => void) => {
          if (event === 'data') {
            handler(Buffer.from('No token here\n'));
          }
        }),
      },
      on: vi.fn((event: string, handler: (code: number | null) => void) => {
        if (event === 'close') {
          setTimeout(() => handler(0), 0);
        }
      }),
    };

    mockSpawn.mockReturnValueOnce(mockChild as never);

    await expect(runSetupToken()).rejects.toThrow(
      'Could not extract OAuth token',
    );
  });

  it('should reject when process exits with non-zero code', async () => {
    const mockChild = {
      stdout: {
        on: vi.fn(),
      },
      on: vi.fn((event: string, handler: (code: number | null) => void) => {
        if (event === 'close') {
          setTimeout(() => handler(1), 0);
        }
      }),
    };

    mockSpawn.mockReturnValueOnce(mockChild as never);

    await expect(runSetupToken()).rejects.toThrow(
      'claude setup-token exited with code 1',
    );
  });
});

describe('extractAndSaveToken', () => {
  it('should extract token and save to file', async () => {
    const mockChild = {
      stdout: {
        on: vi.fn((event: string, handler: (chunk: Buffer) => void) => {
          if (event === 'data') {
            handler(Buffer.from('sk-ant-oat01-mytoken\n'));
          }
        }),
      },
      on: vi.fn((event: string, handler: (code: number | null) => void) => {
        if (event === 'close') {
          setTimeout(() => handler(0), 0);
        }
      }),
    };

    mockSpawn.mockReturnValueOnce(mockChild as never);
    mockMkdir.mockResolvedValueOnce(undefined as never);
    mockWriteFile.mockResolvedValueOnce(undefined as never);

    await extractAndSaveToken();

    expect(mockMkdir).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('token.json'),
      JSON.stringify({ CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-mytoken' }),
      'utf-8',
    );
  });
});
