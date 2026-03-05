/**
 * Container-side agent runner using the Claude Agent SDK.
 *
 * This script replaces the direct `claude --dangerously-skip-permissions` CLI invocation.
 * It reads a prompt from .harness/prompt.txt, calls the SDK's query() function, and uses
 * the canUseTool callback to intercept AskUserQuestion tool calls for human-in-the-loop
 * interaction via file-based IPC (question.json / answer.json).
 *
 * Environment variables:
 *   HARNESS_IPC_DIR  - directory for IPC files (default: /workspace/.harness)
 *   ANTHROPIC_API_KEY - API key for the Claude SDK
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import * as fs from 'fs/promises';
import * as path from 'path';

const ipcDir = process.env.HARNESS_IPC_DIR || '/workspace/.harness';
const promptPath = path.join(ipcDir, 'prompt.txt');
const questionPath = path.join(ipcDir, 'question.json');
const answerPath = path.join(ipcDir, 'answer.json');

let exitCode = 0;

try {
  const prompt = await fs.readFile(promptPath, 'utf-8');

  const conversation = query({
    prompt,
    options: {
      cwd: '/workspace',
      canUseTool: async (toolName, input) => {
        if (toolName === 'AskUserQuestion') {
          // Normalize questions from tool input
          const questions = Array.isArray(input.questions)
            ? input.questions
            : [{ question: String(input.question || input.text || JSON.stringify(input)) }];

          // Write question record for host-side polling
          await fs.writeFile(
            questionPath,
            JSON.stringify(
              {
                runId: 'container',
                questions,
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          );

          // Poll for answer from host
          while (true) {
            await new Promise((r) => setTimeout(r, 500));
            try {
              const raw = await fs.readFile(answerPath, 'utf-8');
              const record = JSON.parse(raw);
              // Clean up IPC files
              await fs.unlink(answerPath).catch(() => {});
              await fs.unlink(questionPath).catch(() => {});
              // Return answer text to agent via deny message
              const answerText = Object.values(record.answers).join('\n');
              return { behavior: 'deny', message: answerText };
            } catch {
              // answer.json not yet present -- keep polling
            }
          }
        }

        // All other tools: auto-approve
        return { behavior: 'allow' };
      },
    },
  });

  // Consume the async generator to completion
  for await (const msg of conversation) {
    if (msg.type === 'result' && 'error' in msg) {
      exitCode = 1;
    }
  }
} catch (err) {
  console.error('[agent-runner] Error:', err);
  exitCode = 1;
  // Clean up question.json on unexpected exit
  await fs.unlink(questionPath).catch(() => {});
}

process.exit(exitCode);
