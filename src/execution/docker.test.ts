import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isDockerAvailable,
  buildImage,
  runContainer,
  spawnContainer,
} from './docker.js';

vi.mock('node:child_process', () => {
  const execFile = vi.fn();
  return { execFile, spawn: vi.fn() };
});

vi.mock('node:util', () => ({
  promisify: (fn: unknown) => fn,
}));

import { execFile, spawn } from 'node:child_process';
import { EventEmitter, Readable } from 'node:stream';

const mockExecFile = vi.mocked(execFile) as unknown as ReturnType<typeof vi.fn>;
const mockSpawn = vi.mocked(spawn) as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isDockerAvailable', () => {
  it('should return true when docker info succeeds', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
    const result = await isDockerAvailable();
    expect(result).toBe(true);
    expect(mockExecFile).toHaveBeenCalledWith('docker', ['info'], {
      timeout: 10000,
    });
  });

  it('should return false when docker info fails', async () => {
    mockExecFile.mockRejectedValueOnce(new Error('not found'));
    const result = await isDockerAvailable();
    expect(result).toBe(false);
  });
});

describe('buildImage', () => {
  it('should call docker build with correct args', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

    await buildImage({
      contextPath: '/path/to/docker',
      tag: 'agent-harness:latest',
    });

    expect(mockExecFile).toHaveBeenCalledWith(
      'docker',
      ['build', '-t', 'agent-harness:latest', '/path/to/docker'],
      { timeout: 600000 },
    );
  });

  it('should pass build args', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

    await buildImage({
      contextPath: '/path/to/docker',
      tag: 'agent-harness:latest',
      buildArgs: { CLAUDE_CODE_VERSION: '1.0.0' },
    });

    const args = mockExecFile.mock.calls[0][1] as string[];
    expect(args).toContain('--build-arg');
    expect(args).toContain('CLAUDE_CODE_VERSION=1.0.0');
  });

  it('should throw with stderr on build failure', async () => {
    const error = Object.assign(new Error('build failed'), {
      stderr: 'some build error',
    });
    mockExecFile.mockRejectedValueOnce(error);

    await expect(
      buildImage({ contextPath: '/path', tag: 'test' }),
    ).rejects.toThrow('Docker image build failed:\nsome build error');
  });
});

describe('runContainer', () => {
  it('should call docker run with correct args', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: 'output', stderr: '' });

    const result = await runContainer({
      image: 'agent-harness:latest',
      command: ['claude', '-p', 'hello'],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('output');
    const args = mockExecFile.mock.calls[0][1] as string[];
    expect(args[0]).toBe('run');
    expect(args[1]).toBe('--rm');
    expect(args).toContain('agent-harness:latest');
  });

  it('should pass volume mounts', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

    await runContainer({
      image: 'test',
      command: ['echo'],
      volumes: [{ host: '/home/.claude', container: '/home/node/.claude' }],
    });

    const args = mockExecFile.mock.calls[0][1] as string[];
    expect(args).toContain('-v');
    expect(args).toContain('/home/.claude:/home/node/.claude');
  });

  it('should pass cap-add flags', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

    await runContainer({
      image: 'test',
      command: ['echo'],
      capAdd: ['NET_ADMIN', 'NET_RAW'],
    });

    const args = mockExecFile.mock.calls[0][1] as string[];
    expect(args.filter((a: string) => a === '--cap-add')).toHaveLength(2);
    expect(args).toContain('NET_ADMIN');
    expect(args).toContain('NET_RAW');
  });

  it('should pass env vars', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

    await runContainer({
      image: 'test',
      command: ['echo'],
      env: { FOO: 'bar' },
    });

    const args = mockExecFile.mock.calls[0][1] as string[];
    expect(args).toContain('-e');
    expect(args).toContain('FOO=bar');
  });

  it('should return non-zero exit code on failure', async () => {
    const error = Object.assign(new Error('failed'), {
      code: 1,
      stdout: 'some output',
      stderr: 'some error',
    });
    mockExecFile.mockRejectedValueOnce(error);

    const result = await runContainer({
      image: 'test',
      command: ['false'],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('some output');
    expect(result.stderr).toBe('some error');
  });
});

function createMockChildProcess(stdoutData?: string, stderrData?: string) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: Readable;
    stderr: Readable;
  };
  child.stdout = new Readable({
    read() {
      if (stdoutData) {
        this.push(Buffer.from(stdoutData));
      }
      this.push(null);
    },
  });
  child.stderr = new Readable({
    read() {
      if (stderrData) {
        this.push(Buffer.from(stderrData));
      }
      this.push(null);
    },
  });
  return child;
}

describe('spawnContainer', () => {
  it('should call spawn with correct docker args', () => {
    const child = createMockChildProcess();
    mockSpawn.mockReturnValueOnce(child);

    spawnContainer({
      image: 'agent-harness:latest',
      command: ['sh', '-c', 'echo hello'],
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining([
        'run',
        '--rm',
        'agent-harness:latest',
        'sh',
        '-c',
        'echo hello',
      ]),
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  });

  it('should resolve done promise with exit code and output', async () => {
    const child = createMockChildProcess('hello', '');
    mockSpawn.mockReturnValueOnce(child);

    const { done } = spawnContainer({
      image: 'test',
      command: ['echo'],
    });

    // Allow streams to be consumed before emitting close
    await new Promise((resolve) => setTimeout(resolve, 10));
    child.emit('close', 0);

    const result = await done;
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello');
    expect(result.stderr).toBe('');
  });

  it('should pass volume mounts', () => {
    const child = createMockChildProcess();
    mockSpawn.mockReturnValueOnce(child);

    spawnContainer({
      image: 'test',
      command: ['echo'],
      volumes: [{ host: '/host/path', container: '/container/path' }],
    });

    const args = mockSpawn.mock.calls[0][1] as string[];
    expect(args).toContain('-v');
    expect(args).toContain('/host/path:/container/path');
  });

  it('should pass cap-add flags', () => {
    const child = createMockChildProcess();
    mockSpawn.mockReturnValueOnce(child);

    spawnContainer({
      image: 'test',
      command: ['echo'],
      capAdd: ['NET_ADMIN'],
    });

    const args = mockSpawn.mock.calls[0][1] as string[];
    expect(args).toContain('--cap-add');
    expect(args).toContain('NET_ADMIN');
  });

  it('should handle non-zero exit code', async () => {
    const child = createMockChildProcess('', 'error');
    mockSpawn.mockReturnValueOnce(child);

    const { done } = spawnContainer({
      image: 'test',
      command: ['false'],
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    child.emit('close', 1);

    const result = await done;
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('error');
  });
});
