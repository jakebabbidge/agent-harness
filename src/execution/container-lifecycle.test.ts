import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./docker.js', () => ({
  isDockerAvailable: vi.fn(),
  buildImage: vi.fn(),
  runContainer: vi.fn(),
  runInteractiveContainer: vi.fn(),
}));

vi.mock('./image-hash.js', () => ({
  needsRebuild: vi.fn(),
  computeContextHash: vi.fn(),
  storeHash: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
}));

import {
  isDockerAvailable,
  buildImage,
  runContainer,
  runInteractiveContainer,
} from './docker.js';
import { needsRebuild, computeContextHash, storeHash } from './image-hash.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import {
  assertDockerAvailable,
  ensureImage,
  executeRun,
  executeLogin,
} from './container-lifecycle.js';

const mockIsDockerAvailable = vi.mocked(isDockerAvailable);
const mockBuildImage = vi.mocked(buildImage);
const mockRunContainer = vi.mocked(runContainer);
const mockRunInteractiveContainer = vi.mocked(runInteractiveContainer);
const mockNeedsRebuild = vi.mocked(needsRebuild);
const mockComputeContextHash = vi.mocked(computeContextHash);
const mockStoreHash = vi.mocked(storeHash);
const mockMkdtemp = vi.mocked(mkdtemp);
const mockReadFile = vi.mocked(readFile);
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

describe('executeRun', () => {
  beforeEach(() => {
    mockIsDockerAvailable.mockResolvedValue(true);
    mockNeedsRebuild.mockResolvedValue(false);
    mockMkdtemp.mockResolvedValue('/tmp/agent-harness-xyz' as never);
    mockRm.mockResolvedValue(undefined as never);
  });

  it('should run container and return output', async () => {
    mockRunContainer.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });
    mockReadFile.mockResolvedValueOnce('Agent output here' as never);

    const result = await executeRun('hello');

    expect(result.output).toBe('Agent output here');
    expect(result.exitCode).toBe(0);
    expect(mockRunContainer).toHaveBeenCalledTimes(1);

    const callArgs = mockRunContainer.mock.calls[0][0];
    expect(callArgs.image).toBe('agent-harness:latest');
    expect(callArgs.command).toContain('claude');
    expect(callArgs.command).toContain('--dangerously-skip-permissions');
    expect(callArgs.command).toContain('hello');
    expect(callArgs.volumes).toHaveLength(2);
    expect(callArgs.capAdd).toEqual(['NET_ADMIN', 'NET_RAW']);
  });

  it('should clean up temp dir even on failure', async () => {
    mockRunContainer.mockRejectedValueOnce(new Error('container failed'));

    await expect(executeRun('hello')).rejects.toThrow('container failed');
    expect(mockRm).toHaveBeenCalledWith('/tmp/agent-harness-xyz', {
      recursive: true,
      force: true,
    });
  });

  it('should return non-zero exit code from container', async () => {
    mockRunContainer.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'error',
    });
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT') as never);

    const result = await executeRun('hello');
    expect(result.exitCode).toBe(1);
  });

  it('should throw when Docker is not available', async () => {
    mockIsDockerAvailable.mockResolvedValueOnce(false);
    await expect(executeRun('hello')).rejects.toThrow(
      'Docker is not available',
    );
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
