import { mkdtemp, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  isDockerAvailable,
  buildImage,
  spawnContainer,
  runInteractiveContainer,
} from './docker.js';
import { needsRebuild, computeContextHash, storeHash } from './image-hash.js';
import { ClaudeCodeAdapter } from '../adapters/claude-code.js';
import { loadToken } from './token.js';
import {
  pollForQuestions,
  writeAnswer,
  cleanupIpcFiles,
  type Question,
  type QuestionAnswer,
} from './ipc.js';

const IMAGE_TAG = 'agent-harness:latest';
const CONTAINER_OUTPUT_DIR = '/tmp/output';
const OUTPUT_FILENAME = 'result.txt';
const PROMPT_FILENAME = 'prompt.txt';

export type QuestionHandler = (question: Question) => Promise<QuestionAnswer>;

function getDockerContextPath(): string {
  const currentDir = fileURLToPath(new URL('.', import.meta.url));
  return join(currentDir, '..', '..', 'docker');
}

function getProjectRoot(): string {
  const currentDir = fileURLToPath(new URL('.', import.meta.url));
  // Works from both src/execution/ (tsx) and dist/execution/ (node)
  return join(currentDir, '..', '..');
}

function getDistRuntimePath(): string {
  return join(getProjectRoot(), 'dist', 'runtime', 'agent-runner.js');
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

  // Copy compiled runtime into docker context before build
  const runtimeSrc = getDistRuntimePath();
  const runtimeDst = join(contextPath, 'agent-runner.js');
  await copyFile(runtimeSrc, runtimeDst);

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
  stderr: string;
  exitCode: number;
}

async function handleQuestions(
  dir: string,
  signal: AbortSignal,
  onQuestion?: QuestionHandler,
): Promise<void> {
  if (!onQuestion) return;

  for await (const question of pollForQuestions(dir, signal)) {
    try {
      const answer = await onQuestion(question);
      await writeAnswer(dir, answer);
    } catch {
      // If the user handler fails, skip the question (hook will timeout and fallback)
    }
  }
}

export async function executeRun(
  prompt: string,
  onQuestion?: QuestionHandler,
): Promise<RunResult> {
  await assertDockerAvailable();
  await ensureImage();

  const adapter = new ClaudeCodeAdapter();
  const tempDir = await mkdtemp(join(tmpdir(), 'agent-harness-'));
  const outputPathInContainer = join(CONTAINER_OUTPUT_DIR, OUTPUT_FILENAME);
  const promptPathInContainer = join(CONTAINER_OUTPUT_DIR, PROMPT_FILENAME);

  try {
    // Write prompt to temp dir
    await writeFile(join(tempDir, PROMPT_FILENAME), prompt);

    // Load OAuth token
    const token = await loadToken();

    const command = adapter.buildCommand({
      promptPath: promptPathInContainer,
      outputPath: outputPathInContainer,
    });

    const { done } = spawnContainer({
      image: IMAGE_TAG,
      command,
      volumes: [{ host: tempDir, container: CONTAINER_OUTPUT_DIR }],
      capAdd: ['NET_ADMIN', 'NET_RAW'],
      env: {
        PROMPT_FILE: promptPathInContainer,
        OUTPUT_FILE: outputPathInContainer,
        CLAUDE_CODE_OAUTH_TOKEN: token,
      },
    });

    // Poll for questions while container runs
    const abortController = new AbortController();
    const questionLoop = handleQuestions(
      tempDir,
      abortController.signal,
      onQuestion,
    );

    // Wait for container to finish
    const { exitCode, stdout, stderr } = await done;
    abortController.abort();
    await questionLoop;

    let output = '';
    try {
      output = await readFile(join(tempDir, OUTPUT_FILENAME), 'utf-8');
    } catch {
      // No output file — fall back to container stdout
      output = stdout || (exitCode === 0 ? '(no output produced)' : '');
    }

    return { output, stderr, exitCode };
  } finally {
    await cleanupIpcFiles(tempDir);
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function executeLogin(): Promise<void> {
  const { extractAndSaveToken } = await import('./token.js');
  await extractAndSaveToken();
}

export async function executeDebugContainer(): Promise<void> {
  await assertDockerAvailable();
  await ensureImage();

  const token = await loadToken();

  const { exitCode } = await runInteractiveContainer({
    image: IMAGE_TAG,
    command: ['/bin/bash'],
    volumes: [],
    capAdd: ['NET_ADMIN', 'NET_RAW'],
    env: {
      CLAUDE_CODE_OAUTH_TOKEN: token,
    },
  });

  if (exitCode !== 0) {
    throw new Error(`Debug container exited with code ${exitCode}`);
  }
}
