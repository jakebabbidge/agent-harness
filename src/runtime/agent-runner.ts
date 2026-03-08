import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';
import { query, type CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import {
  serialize,
  parseInboundLine,
  type OutboundMessage,
  type InboundMessage,
} from '../messages.js';

let rawLogPath: string | null = null;

export function initRawLog(path: string): void {
  rawLogPath = path;
  writeFileSync(path, '', 'utf-8');
}

function logRawMessage(message: unknown): void {
  if (rawLogPath) {
    appendFileSync(rawLogPath, JSON.stringify(message) + '\n', 'utf-8');
  }
}

function emit(message: OutboundMessage): void {
  process.stdout.write(serialize(message));
}

type PendingAnswer = {
  resolve: (answers: Record<string, string>) => void;
};

const pendingAnswers = new Map<string, PendingAnswer>();

function handleInbound(message: InboundMessage): void {
  if (message.type === 'answer') {
    const pending = pendingAnswers.get(message.id);
    if (pending) {
      pendingAnswers.delete(message.id);
      pending.resolve(message.answers);
    }
  }
}

export function createCanUseTool(): CanUseTool {
  return async (toolName, input) => {
    if (toolName !== 'AskUserQuestion') {
      return { behavior: 'allow' };
    }

    const questions = (input.questions as Array<{ question: string }>) ?? [];
    const id = randomUUID();

    emit({ type: 'question', id, questions });

    const answers = await new Promise<Record<string, string>>((resolve) => {
      pendingAnswers.set(id, { resolve });
    });

    return {
      behavior: 'allow',
      updatedInput: { ...input, answers },
    };
  };
}

async function main(): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  // Wait for prompt message, then continue dispatching answers.
  // We use event-based listening throughout — breaking out of
  // `for await (... of rl)` closes the readline, which would
  // silently kill all subsequent line delivery.
  const prompt = await new Promise<string>((resolve) => {
    const onLine = (line: string) => {
      const msg = parseInboundLine(line.trim());
      if (!msg) return;

      if (msg.type === 'prompt') {
        rl.off('line', onLine);
        resolve(msg.prompt);
      }
    };
    rl.on('line', onLine);
  });

  if (!prompt) {
    emit({ type: 'error', error: 'No prompt message received on stdin' });
    process.exit(1);
  }

  const debugLog = process.env['AGENT_RAW_LOG'];
  if (debugLog) {
    initRawLog(debugLog);
  }

  // Continue listening for answer messages in background
  rl.on('line', (line) => {
    const msg = parseInboundLine(line.trim());
    if (msg) handleInbound(msg);
  });

  try {
    let result = '';

    for await (const message of query({
      prompt,
      options: {
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        canUseTool: createCanUseTool(),
      },
    })) {
      logRawMessage(message);

      if ('result' in message) {
        result = message.result as string;
        break;
      } else if ('message' in message) {
        const sdkMessage = message.message as {
          role?: string;
          content?: Array<{
            type: string;
            thinking?: string;
            text?: string;
            name?: string;
            input?: Record<string, unknown>;
          }>;
        };
        if (
          sdkMessage.role === 'assistant' &&
          Array.isArray(sdkMessage.content)
        ) {
          for (const block of sdkMessage.content) {
            if (block.type === 'thinking' && block.thinking) {
              emit({ type: 'thinking', content: block.thinking });
            } else if (block.type === 'tool_use' && block.name) {
              emit({
                type: 'tool_use',
                name: block.name,
                input: block.input ?? {},
              });
            }
          }
        }
      }
    }

    emit({ type: 'result', result });
    process.exit(0);
  } catch (err) {
    emit({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

// Only run main when executed directly (not imported by tests)
const isDirectExecution = process.argv[1]?.endsWith('agent-runner.js');
if (isDirectExecution) {
  main().catch((err) => {
    console.error('agent-runner failed:', err);
    process.exit(1);
  });
}
