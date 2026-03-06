#!/usr/bin/env node

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const IPC_DIR = '/tmp/output';
const POLL_INTERVAL_MS = 500;
const TIMEOUT_MS = 5 * 60 * 1000;

function allowResponse() {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'allow' },
    },
  });
}

function fallbackResponse() {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'ask' },
    },
  });
}

function answerResponse(questions, answers) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: {
        behavior: 'allow',
        updatedInput: { questions, answers },
      },
    },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeAtomic(filePath, data) {
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, data, 'utf-8');
  renameSync(tmp, filePath);
}

async function handleAskUserQuestion(toolInput) {
  const id = randomUUID();
  const questions = toolInput.questions || [];

  const questionFile = join(IPC_DIR, `question-${id}.json`);
  writeAtomic(questionFile, JSON.stringify({ id, questions }));

  const answerFile = join(IPC_DIR, `answer-${id}.json`);
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    if (existsSync(answerFile)) {
      const raw = readFileSync(answerFile, 'utf-8');
      const answer = JSON.parse(raw);
      return answerResponse(questions, answer.answers);
    }
  }

  return fallbackResponse();
}

async function main() {
  try {
    const input = readFileSync(0, 'utf-8');
    const payload = JSON.parse(input);

    if (payload.tool_name === 'AskUserQuestion') {
      const response = await handleAskUserQuestion(payload.tool_input);
      process.stdout.write(response);
    } else {
      process.stdout.write(allowResponse());
    }
  } catch {
    process.stdout.write(fallbackResponse());
  }
}

main();
