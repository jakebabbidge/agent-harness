import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  isDockerAvailable,
  buildImage,
  runContainer,
  runInteractiveContainer,
} from './docker.js';
import { needsRebuild, computeContextHash, storeHash } from './image-hash.js';
import { ClaudeCodeAdapter } from '../adapters/claude-code.js';

const IMAGE_TAG = 'agent-harness:latest';
const CONTAINER_OUTPUT_DIR = '/tmp/output';
const OUTPUT_FILENAME = 'result.txt';
const CLAUDE_CONFIG_CONTAINER_PATH = '/home/node/.claude';

function getDockerContextPath(): string {
  const currentDir = fileURLToPath(new URL('.', import.meta.url));
  return join(currentDir, '..', '..', 'docker');
}

export async function assertDockerAvailable(): Promise<void> {
  const available = await isDockerAvailable();
  if (!available) {
    throw new Error(
      'Docker is not available. Please install and start Docker.',
    );
  }
}

export async function ensureImage(): Promise<void> {
  const contextPath = getDockerContextPath();
  const rebuild = await needsRebuild(contextPath);

  if (!rebuild) {
    return;
  }

  await buildImage({ contextPath, tag: IMAGE_TAG });
  const hash = await computeContextHash(contextPath);
  await storeHash(hash);
}

export interface RunResult {
  output: string;
  exitCode: number;
}

export async function executeRun(prompt: string): Promise<RunResult> {
  await assertDockerAvailable();
  await ensureImage();

  const adapter = new ClaudeCodeAdapter();
  const tempDir = await mkdtemp(join(tmpdir(), 'agent-harness-'));
  const outputPathInContainer = join(CONTAINER_OUTPUT_DIR, OUTPUT_FILENAME);

  try {
    const command = adapter.buildCommand({
      prompt,
      outputPath: outputPathInContainer,
    });

    const { exitCode } = await runContainer({
      image: IMAGE_TAG,
      command,
      volumes: [
        {
          host: join(homedir(), '.claude'),
          container: CLAUDE_CONFIG_CONTAINER_PATH,
        },
        { host: tempDir, container: CONTAINER_OUTPUT_DIR },
      ],
      capAdd: ['NET_ADMIN', 'NET_RAW'],
    });

    let output = '';
    try {
      output = await readFile(join(tempDir, OUTPUT_FILENAME), 'utf-8');
    } catch {
      if (exitCode === 0) {
        output = '(no output produced)';
      }
    }

    return { output, exitCode };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function executeLogin(): Promise<void> {
  await assertDockerAvailable();
  await ensureImage();

  const adapter = new ClaudeCodeAdapter();
  const command = adapter.buildLoginCommand();

  const { exitCode } = await runInteractiveContainer({
    image: IMAGE_TAG,
    command,
    volumes: [
      {
        host: join(homedir(), '.claude'),
        container: CLAUDE_CONFIG_CONTAINER_PATH,
      },
    ],
    capAdd: ['NET_ADMIN', 'NET_RAW'],
  });

  if (exitCode !== 0) {
    throw new Error(`Login session exited with code ${exitCode}`);
  }
}
