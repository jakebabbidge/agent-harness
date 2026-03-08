import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';

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

vi.mock('./stdio-stream.js', () => ({
  sendMessage: vi.fn(),
  readMessages: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  copyFile: vi.fn(),
  mkdtemp: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
}));

import {
  isDockerAvailable,
  spawnContainer,
  buildImage,
  runInteractiveContainer,
} from './docker.js';
import { needsRebuild, computeContextHash, storeHash } from './image-hash.js';
import { sendMessage, readMessages } from './stdio-stream.js';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import {
  assertDockerAvailable,
  ensureImage,
  executeRun,
  executeLogin,
} from './container-lifecycle.js';

const mockIsDockerAvailable = vi.mocked(isDockerAvailable);
const mockBuildImage = vi.mocked(buildImage);
const mockSpawnContainer = vi.mocked(spawnContainer);
const mockRunInteractiveContainer = vi.mocked(runInteractiveContainer);
const mockNeedsRebuild = vi.mocked(needsRebuild);
const mockComputeContextHash = vi.mocked(computeContextHash);
const mockStoreHash = vi.mocked(storeHash);
const mockSendMessage = vi.mocked(sendMessage);
const mockReadMessages = vi.mocked(readMessages);
const mockCopyFile = vi.mocked(copyFile);
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
  beforeEach(() => {
    mockCopyFile.mockResolvedValue(undefined as never);
  });

  it('should copy runtime and messages, skip build when image is up to date', async () => {
    mockNeedsRebuild.mockResolvedValueOnce(false);
    await ensureImage();
    expect(mockCopyFile).toHaveBeenCalledTimes(2);
    expect(mockBuildImage).not.toHaveBeenCalled();
  });

  it('should build and store hash when rebuild needed', async () => {
    mockNeedsRebuild.mockResolvedValueOnce(true);
    mockBuildImage.mockResolvedValueOnce(undefined);
    mockComputeContextHash.mockResolvedValueOnce('abc123');
    mockStoreHash.mockResolvedValueOnce(undefined);

    await ensureImage();

    expect(mockCopyFile).toHaveBeenCalledTimes(2);
    expect(mockBuildImage).toHaveBeenCalledTimes(1);
    expect(mockStoreHash).toHaveBeenCalledWith('abc123');
  });
});

function makeSpawnResult(overrides: { exitCode?: number; stderr?: string }) {
  const stdinStream = new PassThrough();
  const stdoutStream = new PassThrough();
  const result = {
    exitCode: overrides.exitCode ?? 0,
    stderr: overrides.stderr ?? '',
  };
  return {
    child: {} as never,
    stdin: stdinStream,
    stdout: stdoutStream,
    done: Promise.resolve(result),
  };
}

describe('executeRun', () => {
  beforeEach(() => {
    mockIsDockerAvailable.mockResolvedValue(true);
    mockNeedsRebuild.mockResolvedValue(false);
    mockCopyFile.mockResolvedValue(undefined as never);
    mockMkdtemp.mockResolvedValue('/tmp/agent-harness-log-xyz' as never);
    mockReadFile.mockRejectedValue(new Error('ENOENT') as never);
    mockRm.mockResolvedValue(undefined as never);
  });

  it('should spawn container and send prompt via stdin', async () => {
    const spawn = makeSpawnResult({ exitCode: 0 });
    mockSpawnContainer.mockReturnValueOnce(spawn);

    // Mock readMessages to yield a result
    mockReadMessages.mockImplementationOnce(async function* () {
      yield { type: 'result' as const, result: 'Agent output here' };
    });

    const result = await executeRun('hello');

    expect(result.output).toBe('Agent output here');
    expect(result.exitCode).toBe(0);
    expect(mockSpawnContainer).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith(spawn.stdin, {
      type: 'prompt',
      prompt: 'hello',
    });

    const callArgs = mockSpawnContainer.mock.calls[0][0];
    expect(callArgs.image).toBe('agent-harness:latest');
    expect(callArgs.command).toEqual([
      'node',
      '/opt/agent-harness/runtime/agent-runner.js',
    ]);
    expect(callArgs.volumes).toHaveLength(2);
    expect(callArgs.capAdd).toEqual(['NET_ADMIN', 'NET_RAW']);
    expect(callArgs.env).toEqual({
      AGENT_RAW_LOG: '/tmp/agent-log/raw.jsonl',
    });
  });

  it('should mount ~/.claude for authentication', async () => {
    mockSpawnContainer.mockReturnValueOnce(makeSpawnResult({}));
    mockReadMessages.mockImplementationOnce(async function* () {
      yield { type: 'result' as const, result: 'output' };
    });

    await executeRun('hello');

    const callArgs = mockSpawnContainer.mock.calls[0][0];
    const claudeMount = callArgs.volumes?.find(
      (v: { container: string }) => v.container === '/home/node/.claude',
    );
    expect(claudeMount).toBeDefined();
  });

  it('should handle questions by calling onQuestion and sending answer', async () => {
    const spawn = makeSpawnResult({});
    mockSpawnContainer.mockReturnValueOnce(spawn);

    const questionMsg = {
      type: 'question' as const,
      id: 'q1',
      questions: [{ question: 'Pick?' }],
    };
    const answerMsg = {
      type: 'answer' as const,
      id: 'q1',
      answers: { 'Pick?': 'Yes' },
    };

    mockReadMessages.mockImplementationOnce(async function* () {
      yield questionMsg;
      yield { type: 'result' as const, result: 'done' };
    });

    const onQuestion = vi.fn().mockResolvedValue(answerMsg);

    const result = await executeRun('hello', onQuestion);

    expect(onQuestion).toHaveBeenCalledWith(questionMsg);
    // First call is prompt, second call is answer
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(mockSendMessage).toHaveBeenCalledWith(spawn.stdin, answerMsg);
    expect(result.output).toBe('done');
  });

  it('should call onMessage for each streamed message', async () => {
    mockSpawnContainer.mockReturnValueOnce(makeSpawnResult({}));

    const thinkingMsg = { type: 'thinking' as const, content: 'hmm' };
    const resultMsg = { type: 'result' as const, result: 'done' };

    mockReadMessages.mockImplementationOnce(async function* () {
      yield thinkingMsg;
      yield resultMsg;
    });

    const onMessage = vi.fn();
    await executeRun('hello', undefined, onMessage);

    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenCalledWith(thinkingMsg);
    expect(onMessage).toHaveBeenCalledWith(resultMsg);
  });

  it('should return non-zero exit code and stderr from container', async () => {
    mockSpawnContainer.mockReturnValueOnce(
      makeSpawnResult({ exitCode: 1, stderr: 'something went wrong' }),
    );
    mockReadMessages.mockImplementationOnce(async function* () {
      // No messages
    });

    const result = await executeRun('hello');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('something went wrong');
  });

  it('should return default output when no result message and exit 0', async () => {
    mockSpawnContainer.mockReturnValueOnce(makeSpawnResult({}));
    mockReadMessages.mockImplementationOnce(async function* () {
      // No messages
    });

    const result = await executeRun('hello');
    expect(result.output).toBe('(no output produced)');
  });

  it('should return rawLogPath when log file exists', async () => {
    mockSpawnContainer.mockReturnValueOnce(makeSpawnResult({}));
    mockReadMessages.mockImplementationOnce(async function* () {
      yield { type: 'result' as const, result: 'done' };
    });
    mockReadFile.mockResolvedValueOnce('' as never);

    const result = await executeRun('hello');
    expect(result.rawLogPath).toBe('/tmp/agent-harness-log-xyz/raw.jsonl');
  });

  it('should not return rawLogPath when log file does not exist', async () => {
    mockSpawnContainer.mockReturnValueOnce(makeSpawnResult({}));
    mockReadMessages.mockImplementationOnce(async function* () {
      yield { type: 'result' as const, result: 'done' };
    });

    const result = await executeRun('hello');
    expect(result.rawLogPath).toBeUndefined();
  });

  it('should throw when Docker is not available', async () => {
    mockIsDockerAvailable.mockResolvedValueOnce(false);
    await expect(executeRun('hello')).rejects.toThrow(
      'Docker is not available',
    );
  });

  it('should clean up log dir on spawn failure', async () => {
    mockSpawnContainer.mockImplementationOnce(() => {
      throw new Error('container failed');
    });

    await expect(executeRun('hello')).rejects.toThrow('container failed');
    expect(mockRm).toHaveBeenCalledWith('/tmp/agent-harness-log-xyz', {
      recursive: true,
      force: true,
    });
  });
});

describe('executeLogin', () => {
  beforeEach(() => {
    mockIsDockerAvailable.mockResolvedValue(true);
    mockNeedsRebuild.mockResolvedValue(false);
    mockCopyFile.mockResolvedValue(undefined as never);
  });

  it('should run interactive container with ~/.claude mounted', async () => {
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
