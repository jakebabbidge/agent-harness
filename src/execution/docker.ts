import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface DockerBuildOptions {
  contextPath: string;
  tag: string;
  buildArgs?: Record<string, string>;
}

export interface VolumeMount {
  host: string;
  container: string;
}

export interface DockerRunOptions {
  image: string;
  command: string[];
  volumes?: VolumeMount[];
  capAdd?: string[];
  env?: Record<string, string>;
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync('docker', ['info'], { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

export async function buildImage(options: DockerBuildOptions): Promise<void> {
  const args = ['build', '-t', options.tag];

  if (options.buildArgs) {
    for (const [key, value] of Object.entries(options.buildArgs)) {
      args.push('--build-arg', `${key}=${value}`);
    }
  }

  args.push(options.contextPath);

  try {
    await execFileAsync('docker', args, { timeout: 600000 });
  } catch (error) {
    const err = error as Error & { stderr?: string };
    throw new Error(`Docker image build failed:\n${err.stderr || err.message}`);
  }
}

export async function runContainer(
  options: DockerRunOptions,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const args = ['run', '--rm'];

  if (options.volumes) {
    for (const vol of options.volumes) {
      args.push('-v', `${vol.host}:${vol.container}`);
    }
  }

  if (options.capAdd) {
    for (const cap of options.capAdd) {
      args.push('--cap-add', cap);
    }
  }

  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      args.push('-e', `${key}=${value}`);
    }
  }

  args.push(options.image, ...options.command);

  try {
    const result = await execFileAsync('docker', args, {
      timeout: 600000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const err = error as Error & {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    if (typeof err.code === 'number') {
      return {
        exitCode: err.code,
        stdout: err.stdout || '',
        stderr: err.stderr || '',
      };
    }
    throw error;
  }
}

export interface SpawnedContainer {
  child: ChildProcess;
  done: Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export function spawnContainer(options: DockerRunOptions): SpawnedContainer {
  const args = ['run']; //, '--rm'];

  if (options.volumes) {
    for (const vol of options.volumes) {
      args.push('-v', `${vol.host}:${vol.container}`);
    }
  }

  if (options.capAdd) {
    for (const cap of options.capAdd) {
      args.push('--cap-add', cap);
    }
  }

  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      args.push('-e', `${key}=${value}`);
    }
  }

  args.push(options.image, ...options.command);

  const child = spawn('docker', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  child.stdout!.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
  child.stderr!.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

  const done = new Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
      });
    });
  });

  return { child, done };
}

export function runInteractiveContainer(
  options: DockerRunOptions,
): Promise<{ exitCode: number }> {
  return new Promise((resolve, reject) => {
    const args = ['run', '--rm', '-it'];

    if (options.volumes) {
      for (const vol of options.volumes) {
        args.push('-v', `${vol.host}:${vol.container}`);
      }
    }

    if (options.capAdd) {
      for (const cap of options.capAdd) {
        args.push('--cap-add', cap);
      }
    }

    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    args.push(options.image, ...options.command);

    const child = spawn('docker', args, { stdio: 'inherit' });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1 });
    });
  });
}
