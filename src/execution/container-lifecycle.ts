import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  isDockerAvailable,
  buildImage,
  spawnContainer,
  runInteractiveContainer,
} from './docker.js';
import { needsRebuild, computeContextHash, storeHash } from './image-hash.js';
import { ClaudeCodeAdapter } from '../adapters/claude-code.js';
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
const CLAUDE_CONFIG_CONTAINER_PATH = '/home/node/.claude';

export type QuestionHandler = (question: Question) => Promise<QuestionAnswer>;

function getDockerContextPath(): string {
  const currentDir = fileURLToPath(new URL('.', import.meta.url));
  return join(currentDir, '..', '..', 'docker');
}

function getSettingsJsonPath(): string {
  return join(getDockerContextPath(), 'settings.json');
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

  try {
    // Copy settings.json to temp dir for file-level bind mount
    const settingsContent = await readFile(getSettingsJsonPath(), 'utf-8');
    await writeFile(join(tempDir, 'settings.json'), settingsContent);

    const adapterCommand = adapter.buildCommand({
      prompt,
      outputPath: outputPathInContainer,
    });

    // Copy settings.json from shared volume into Claude config dir before running.
    // File-level bind mounts over directory mounts are unreliable on Docker for Mac,
    // so we copy at runtime instead.
    const settingsCopy = `cp ${CONTAINER_OUTPUT_DIR}/settings.json ${CLAUDE_CONFIG_CONTAINER_PATH}/settings.json`;
    const command = ['sh', '-c', `${settingsCopy} && ${adapterCommand[2]}`];

    const { done } = spawnContainer({
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
      // No IPC output file — fall back to container stdout
      output = stdout || (exitCode === 0 ? '(no output produced)' : '');
    }

    // Dump hook handler log for debugging
    try {
      const hookLog = await readFile(
        join(tempDir, 'hook-handler.log'),
        'utf-8',
      );
      console.error('[hook-handler.log]\n' + hookLog);
    } catch {
      console.error('[hook-handler.log] (not found)');
    }

    return { output, stderr, exitCode };
  } finally {
    await cleanupIpcFiles(tempDir);
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
