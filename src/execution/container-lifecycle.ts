import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  isDockerAvailable,
  buildImage,
  spawnContainer,
  runInteractiveContainer,
} from './docker.js';
import { needsRebuild, computeContextHash, storeHash } from './image-hash.js';
import { sendMessage, readMessages } from './stdio-stream.js';
import { ClaudeCodeAdapter } from '../adapters/claude-code.js';
import type {
  QuestionMessage,
  AnswerMessage,
  MessageHandler,
} from '../messages.js';

const IMAGE_TAG = 'agent-harness:latest';
const CLAUDE_CONFIG_CONTAINER_PATH = '/home/node/.claude';

export type QuestionHandler = (
  question: QuestionMessage,
) => Promise<AnswerMessage>;

function getDockerContextPath(): string {
  const currentDir = fileURLToPath(new URL('.', import.meta.url));
  return join(currentDir, '..', '..', 'docker');
}

function getProjectRoot(): string {
  const currentDir = fileURLToPath(new URL('.', import.meta.url));
  return join(currentDir, '..', '..');
}

function getDistRuntimePath(): string {
  return join(getProjectRoot(), 'dist', 'runtime', 'agent-runner.js');
}

function getDistMessagesPath(): string {
  return join(getProjectRoot(), 'dist', 'messages.js');
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

  // Copy compiled runtime and messages into docker context before build
  const runtimeSrc = getDistRuntimePath();
  const runtimeDst = join(contextPath, 'agent-runner.js');
  await copyFile(runtimeSrc, runtimeDst);

  const messagesSrc = getDistMessagesPath();
  const messagesDst = join(contextPath, 'messages.js');
  await copyFile(messagesSrc, messagesDst);

  const rebuild = await needsRebuild(contextPath);

  if (!rebuild) {
    return;
  }

  await buildImage({ contextPath, tag: IMAGE_TAG });
  const hash = await computeContextHash(contextPath);
  await storeHash(hash);
}

const CONTAINER_LOG_DIR = '/tmp/agent-log';
const RAW_LOG_FILENAME = 'raw.jsonl';

export interface RunResult {
  output: string;
  stderr: string;
  exitCode: number;
  rawLogPath?: string;
}

export async function executeRun(
  prompt: string,
  onQuestion?: QuestionHandler,
  onMessage?: MessageHandler,
): Promise<RunResult> {
  await assertDockerAvailable();
  await ensureImage();

  const adapter = new ClaudeCodeAdapter();
  const command = adapter.buildCommand();

  const logDir = await mkdtemp(join(tmpdir(), 'agent-harness-log-'));
  const rawLogPathInContainer = join(CONTAINER_LOG_DIR, RAW_LOG_FILENAME);

  try {
    const { child, stdin, stdout, done } = spawnContainer({
      image: IMAGE_TAG,
      command,
      volumes: [
        {
          host: join(homedir(), '.claude'),
          container: CLAUDE_CONFIG_CONTAINER_PATH,
        },
        { host: logDir, container: CONTAINER_LOG_DIR },
      ],
      capAdd: ['NET_ADMIN', 'NET_RAW'],
      env: {
        AGENT_RAW_LOG: rawLogPathInContainer,
      },
    });

    // Send prompt to container
    sendMessage(stdin, { type: 'prompt', prompt });

    let output = '';

    // Read messages from container stdout
    for await (const message of readMessages(stdout)) {
      if (message.type === 'question' && onQuestion) {
        try {
          const answer = await onQuestion(message);
          sendMessage(stdin, answer);
        } catch {
          // If the user handler fails, skip (agent will timeout and fallback)
        }
      } else if (message.type === 'result') {
        output = message.result;
      } else if (message.type === 'error') {
        output = output || message.error;
      }

      if (onMessage) {
        onMessage(message);
      }

      if (message.type === 'result' || message.type === 'error') {
        break;
      }
    }

    stdin.end();

    const { exitCode, stderr } = await done;

    if (!output && exitCode === 0) {
      output = '(no output produced)';
    }

    // Check if raw log was produced
    const hostLogPath = join(logDir, RAW_LOG_FILENAME);
    let rawLogPath: string | undefined;
    try {
      await readFile(hostLogPath);
      rawLogPath = hostLogPath;
    } catch {
      // No log file produced
    }

    return { output, stderr, exitCode, rawLogPath };
  } catch (err) {
    await rm(logDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

export async function executeLogin(): Promise<void> {
  await assertDockerAvailable();
  await ensureImage();

  const { exitCode } = await runInteractiveContainer({
    image: IMAGE_TAG,
    command: ['/bin/bash'],
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

export async function executeDebugContainer(): Promise<void> {
  await assertDockerAvailable();
  await ensureImage();

  const { exitCode } = await runInteractiveContainer({
    image: IMAGE_TAG,
    command: ['/bin/bash'],
    volumes: [
      {
        host: join(homedir(), '.claude'),
        container: CLAUDE_CONFIG_CONTAINER_PATH,
      },
    ],
    capAdd: ['NET_ADMIN', 'NET_RAW'],
  });

  if (exitCode !== 0) {
    throw new Error(`Debug container exited with code ${exitCode}`);
  }
}
