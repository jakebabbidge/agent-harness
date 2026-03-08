import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./docker.js', () => ({
  isDockerAvailable: vi.fn(),
  buildImage: vi.fn(),
  spawnContainer: vi.fn(),
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

vi.mock('./token.js', () => ({
  loadToken: vi.fn(),
  extractAndSaveToken: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rm: vi.fn(),
  copyFile: vi.fn(),
}));

import { isDockerAvailable, spawnContainer, buildImage } from './docker.js';
import { needsRebuild, computeContextHash, storeHash } from './image-hash.js';
import { cleanupIpcFiles } from './ipc.js';
import { loadToken, extractAndSaveToken } from './token.js';
import { mkdtemp, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import {
  assertDockerAvailable,
  ensureImage,
  executeRun,
  executeLogin,
} from './container-lifecycle.js';

const mockIsDockerAvailable = vi.mocked(isDockerAvailable);
const mockBuildImage = vi.mocked(buildImage);
const mockSpawnContainer = vi.mocked(spawnContainer);
const mockNeedsRebuild = vi.mocked(needsRebuild);
const mockComputeContextHash = vi.mocked(computeContextHash);
const mockStoreHash = vi.mocked(storeHash);
const mockCleanupIpcFiles = vi.mocked(cleanupIpcFiles);
const mockLoadToken = vi.mocked(loadToken);
const mockExtractAndSaveToken = vi.mocked(extractAndSaveToken);
const mockMkdtemp = vi.mocked(mkdtemp);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockRm = vi.mocked(rm);
const mockCopyFile = vi.mocked(copyFile);

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
  beforeEach(() => {
    mockCopyFile.mockResolvedValue(undefined as never);
  });

  it('should copy runtime and skip build when image is up to date', async () => {
    mockNeedsRebuild.mockResolvedValueOnce(false);
    await ensureImage();
    expect(mockCopyFile).toHaveBeenCalledTimes(1);
    expect(mockBuildImage).not.toHaveBeenCalled();
  });

  it('should build and store hash when rebuild needed', async () => {
    mockNeedsRebuild.mockResolvedValueOnce(true);
    mockBuildImage.mockResolvedValueOnce(undefined);
    mockComputeContextHash.mockResolvedValueOnce('abc123');
    mockStoreHash.mockResolvedValueOnce(undefined);

    await ensureImage();

    expect(mockCopyFile).toHaveBeenCalledTimes(1);
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
    mockCopyFile.mockResolvedValue(undefined as never);
    mockMkdtemp.mockResolvedValue('/tmp/agent-harness-xyz' as never);
    mockRm.mockResolvedValue(undefined as never);
    mockWriteFile.mockResolvedValue(undefined as never);
    mockCleanupIpcFiles.mockResolvedValue(undefined);
    mockLoadToken.mockResolvedValue('sk-ant-oat01-testtoken');
  });

  it('should spawn container with prompt file and token env var', async () => {
    mockSpawnContainer.mockReturnValueOnce(makeSpawnResult({ exitCode: 0 }));
    mockReadFile.mockResolvedValueOnce('Agent output here' as never);

    const result = await executeRun('hello');

    expect(result.output).toBe('Agent output here');
    expect(result.exitCode).toBe(0);
    expect(mockSpawnContainer).toHaveBeenCalledTimes(1);

    const callArgs = mockSpawnContainer.mock.calls[0][0];
    expect(callArgs.image).toBe('agent-harness:latest');
    expect(callArgs.command).toEqual([
      'node',
      '/opt/agent-harness/agent-runner.js',
    ]);
    expect(callArgs.env).toEqual({
      PROMPT_FILE: '/tmp/output/prompt.txt',
      OUTPUT_FILE: '/tmp/output/result.txt',
      CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-testtoken',
    });
    expect(callArgs.volumes).toHaveLength(1);
    expect(callArgs.volumes![0].host).toBe('/tmp/agent-harness-xyz');
    expect(callArgs.capAdd).toEqual(['NET_ADMIN', 'NET_RAW']);
  });

  it('should write prompt to temp dir', async () => {
    mockSpawnContainer.mockReturnValueOnce(makeSpawnResult({}));
    mockReadFile.mockResolvedValueOnce('output' as never);

    await executeRun('my test prompt');

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/agent-harness-xyz/prompt.txt',
      'my test prompt',
    );
  });

  it('should not mount ~/.claude directory', async () => {
    mockSpawnContainer.mockReturnValueOnce(makeSpawnResult({}));
    mockReadFile.mockResolvedValueOnce('output' as never);

    await executeRun('hello');

    const callArgs = mockSpawnContainer.mock.calls[0][0];
    const claudeMount = callArgs.volumes?.find((v: { container: string }) =>
      v.container.includes('.claude'),
    );
    expect(claudeMount).toBeUndefined();
  });

  it('should clean up IPC files and temp dir', async () => {
    mockSpawnContainer.mockReturnValueOnce(makeSpawnResult({}));
    mockReadFile.mockResolvedValueOnce('output' as never);

    await executeRun('hello');

    expect(mockCleanupIpcFiles).toHaveBeenCalledWith('/tmp/agent-harness-xyz');
    expect(mockRm).toHaveBeenCalledWith('/tmp/agent-harness-xyz', {
      recursive: true,
      force: true,
    });
  });

  it('should clean up temp dir even on failure', async () => {
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
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT') as never);

    const result = await executeRun('hello');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('something went wrong');
  });

  it('should fall back to container stdout when no output file exists', async () => {
    mockSpawnContainer.mockReturnValueOnce(
      makeSpawnResult({ stdout: 'stdout output' }),
    );
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT') as never);

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
    mockReadFile.mockResolvedValueOnce('output' as never);

    const onQuestion = vi.fn().mockResolvedValue({
      id: 'q1',
      answers: { 'What?': 'Yes' },
    });

    await executeRun('hello', onQuestion);

    expect(mockSpawnContainer).toHaveBeenCalledTimes(1);
  });
});

describe('executeLogin', () => {
  it('should call extractAndSaveToken', async () => {
    mockExtractAndSaveToken.mockResolvedValueOnce(undefined);

    await executeLogin();

    expect(mockExtractAndSaveToken).toHaveBeenCalledTimes(1);
  });
});
