import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./docker.js', () => ({
  isDockerAvailable: vi.fn(),
  buildImage: vi.fn(),
  spawnContainer: vi.fn(),
  runInteractiveContainer: vi.fn(),
}));

vi.mock('./image-hash.js', () => ({
  needsRebuild: vi.fn(),
  computeContextHash: vi.fn(),
  storeHash: vi.fn(),
}));

vi.mock('./ipc.js', () => ({
  pollForQuestions: vi.fn().mockImplementation(async function* () {
    // Empty async generator by default
  }),
  writeAnswer: vi.fn(),
  cleanupIpcFiles: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rm: vi.fn(),
}));

import {
  isDockerAvailable,
  spawnContainer,
  runInteractiveContainer,
} from './docker.js';
import { needsRebuild, computeContextHash, storeHash } from './image-hash.js';
import { cleanupIpcFiles } from './ipc.js';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import {
  assertDockerAvailable,
  ensureImage,
  executeRun,
  executeLogin,
} from './container-lifecycle.js';
import { buildImage } from './docker.js';

const mockIsDockerAvailable = vi.mocked(isDockerAvailable);
const mockBuildImage = vi.mocked(buildImage);
const mockSpawnContainer = vi.mocked(spawnContainer);
const mockRunInteractiveContainer = vi.mocked(runInteractiveContainer);
const mockNeedsRebuild = vi.mocked(needsRebuild);
const mockComputeContextHash = vi.mocked(computeContextHash);
const mockStoreHash = vi.mocked(storeHash);
const mockCleanupIpcFiles = vi.mocked(cleanupIpcFiles);
const mockMkdtemp = vi.mocked(mkdtemp);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockRm = vi.mocked(rm);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assertDockerAvailable', () => {
  it('should not throw when Docker is available', async () => {
    mockIsDockerAvailable.mockResolvedValueOnce(true);
    await expect(assertDockerAvailable()).resolves.toBeUndefined();
  });

  it('should throw when Docker is not available', async () => {
    mockIsDockerAvailable.mockResolvedValueOnce(false);
    await expect(assertDockerAvailable()).rejects.toThrow(
      'Docker is not available',
    );
  });
});

describe('ensureImage', () => {
  it('should skip build when image is up to date', async () => {
    mockNeedsRebuild.mockResolvedValueOnce(false);
    await ensureImage();
    expect(mockBuildImage).not.toHaveBeenCalled();
  });

  it('should build and store hash when rebuild needed', async () => {
    mockNeedsRebuild.mockResolvedValueOnce(true);
    mockBuildImage.mockResolvedValueOnce(undefined);
    mockComputeContextHash.mockResolvedValueOnce('abc123');
    mockStoreHash.mockResolvedValueOnce(undefined);

    await ensureImage();

    expect(mockBuildImage).toHaveBeenCalledTimes(1);
    expect(mockStoreHash).toHaveBeenCalledWith('abc123');
  });
});

function makeSpawnResult(overrides: {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}) {
  const result = {
    exitCode: overrides.exitCode ?? 0,
    stdout: overrides.stdout ?? '',
    stderr: overrides.stderr ?? '',
  };
  return {
    child: {} as never,
    done: Promise.resolve(result),
  };
}

describe('executeRun', () => {
  beforeEach(() => {
    mockIsDockerAvailable.mockResolvedValue(true);
    mockNeedsRebuild.mockResolvedValue(false);
    mockMkdtemp.mockResolvedValue('/tmp/agent-harness-xyz' as never);
    mockRm.mockResolvedValue(undefined as never);
    mockWriteFile.mockResolvedValue(undefined as never);
    mockCleanupIpcFiles.mockResolvedValue(undefined);
  });

  it('should spawn container and return output', async () => {
    mockSpawnContainer.mockReturnValueOnce(makeSpawnResult({ exitCode: 0 }));
    // First readFile call: settings.json, second: output file
    mockReadFile
      .mockResolvedValueOnce('{"hooks":{}}' as never)
      .mockResolvedValueOnce('Agent output here' as never);

    const result = await executeRun('hello');

    expect(result.output).toBe('Agent output here');
    expect(result.exitCode).toBe(0);
    expect(mockSpawnContainer).toHaveBeenCalledTimes(1);

    const callArgs = mockSpawnContainer.mock.calls[0][0];
    expect(callArgs.image).toBe('agent-harness:latest');
    expect(callArgs.command[0]).toBe('sh');
    expect(callArgs.command[1]).toBe('-c');
    expect(callArgs.command[2]).toContain('cp /tmp/output/settings.json');
    expect(callArgs.command[2]).toContain('claude');
    expect(callArgs.command[2]).not.toContain('--dangerously-skip-permissions');
    expect(callArgs.command[2]).toContain('hello');
    expect(callArgs.volumes).toHaveLength(2);
    expect(callArgs.capAdd).toEqual(['NET_ADMIN', 'NET_RAW']);
  });

  it('should copy settings.json via command instead of file mount', async () => {
    mockSpawnContainer.mockReturnValueOnce(makeSpawnResult({}));
    mockReadFile
      .mockResolvedValueOnce('{"hooks":{}}' as never)
      .mockResolvedValueOnce('output' as never);

    await executeRun('hello');

    const callArgs = mockSpawnContainer.mock.calls[0][0];
    // No file-level mount for settings.json
    const settingsMount = callArgs.volumes?.find((v: { container: string }) =>
      v.container.includes('settings.json'),
    );
    expect(settingsMount).toBeUndefined();
    // Settings copy is in the command
    expect(callArgs.command[2]).toContain(
      'cp /tmp/output/settings.json /home/node/.claude/settings.json',
    );
  });

  it('should write settings.json to temp dir', async () => {
    mockSpawnContainer.mockReturnValueOnce(makeSpawnResult({}));
    mockReadFile
      .mockResolvedValueOnce('{"hooks":{"PermissionRequest":[]}}' as never)
      .mockResolvedValueOnce('output' as never);

    await executeRun('hello');

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/agent-harness-xyz/settings.json',
      '{"hooks":{"PermissionRequest":[]}}',
    );
  });

  it('should clean up IPC files and temp dir', async () => {
    mockSpawnContainer.mockReturnValueOnce(makeSpawnResult({}));
    mockReadFile
      .mockResolvedValueOnce('{}' as never)
      .mockResolvedValueOnce('output' as never);

    await executeRun('hello');

    expect(mockCleanupIpcFiles).toHaveBeenCalledWith('/tmp/agent-harness-xyz');
    expect(mockRm).toHaveBeenCalledWith('/tmp/agent-harness-xyz', {
      recursive: true,
      force: true,
    });
  });

  it('should clean up temp dir even on failure', async () => {
    mockReadFile.mockResolvedValueOnce('{}' as never);
    mockSpawnContainer.mockImplementationOnce(() => {
      throw new Error('container failed');
    });

    await expect(executeRun('hello')).rejects.toThrow('container failed');
    expect(mockRm).toHaveBeenCalledWith('/tmp/agent-harness-xyz', {
      recursive: true,
      force: true,
    });
  });

  it('should return non-zero exit code and stderr from container', async () => {
    mockSpawnContainer.mockReturnValueOnce(
      makeSpawnResult({ exitCode: 1, stderr: 'something went wrong' }),
    );
    mockReadFile
      .mockResolvedValueOnce('{}' as never)
      .mockRejectedValueOnce(new Error('ENOENT') as never);

    const result = await executeRun('hello');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('something went wrong');
  });

  it('should fall back to container stdout when no output file exists', async () => {
    mockSpawnContainer.mockReturnValueOnce(
      makeSpawnResult({ stdout: 'stdout output' }),
    );
    mockReadFile
      .mockResolvedValueOnce('{}' as never)
      .mockRejectedValueOnce(new Error('ENOENT') as never);

    const result = await executeRun('hello');
    expect(result.output).toBe('stdout output');
  });

  it('should throw when Docker is not available', async () => {
    mockIsDockerAvailable.mockResolvedValueOnce(false);
    await expect(executeRun('hello')).rejects.toThrow(
      'Docker is not available',
    );
  });

  it('should pass onQuestion handler that writes answers', async () => {
    mockSpawnContainer.mockReturnValueOnce(makeSpawnResult({}));
    mockReadFile
      .mockResolvedValueOnce('{}' as never)
      .mockResolvedValueOnce('output' as never);

    const onQuestion = vi.fn().mockResolvedValue({
      id: 'q1',
      answers: { 'What?': 'Yes' },
    });

    await executeRun('hello', onQuestion);

    // The question handler is set up but since pollForQuestions is mocked
    // and returns nothing by default, onQuestion won't be called
    // The full integration of polling is tested in ipc.test.ts
    expect(mockSpawnContainer).toHaveBeenCalledTimes(1);
  });
});

describe('executeLogin', () => {
  beforeEach(() => {
    mockIsDockerAvailable.mockResolvedValue(true);
    mockNeedsRebuild.mockResolvedValue(false);
  });

  it('should run interactive container with credentials mounted', async () => {
    mockRunInteractiveContainer.mockResolvedValueOnce({ exitCode: 0 });

    await executeLogin();

    expect(mockRunInteractiveContainer).toHaveBeenCalledTimes(1);
    const callArgs = mockRunInteractiveContainer.mock.calls[0][0];
    expect(callArgs.command).toEqual(['/bin/bash']);
    expect(callArgs.volumes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ container: '/home/node/.claude' }),
      ]),
    );
  });

  it('should throw on non-zero exit', async () => {
    mockRunInteractiveContainer.mockResolvedValueOnce({ exitCode: 1 });
    await expect(executeLogin()).rejects.toThrow(
      'Login session exited with code 1',
    );
  });
});
