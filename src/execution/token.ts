import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

const TOKEN_DIR = join(homedir(), '.agent-harness');
const TOKEN_FILE = join(TOKEN_DIR, 'token.json');
const TOKEN_PATTERN = /sk-ant-oat01-[A-Za-z0-9_-]+/;

export async function extractAndSaveToken(): Promise<void> {
  const token = await runSetupToken();
  await mkdir(TOKEN_DIR, { recursive: true });
  await writeFile(
    TOKEN_FILE,
    JSON.stringify({ CLAUDE_CODE_OAUTH_TOKEN: token }),
    'utf-8',
  );
}

export function runSetupToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['setup-token'], {
      stdio: ['inherit', 'pipe', 'inherit'],
    });

    const stdoutChunks: Buffer[] = [];
    child.stdout!.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude setup-token exited with code ${code}`));
        return;
      }

      const output = Buffer.concat(stdoutChunks).toString('utf-8');
      const match = TOKEN_PATTERN.exec(output);
      if (!match) {
        reject(
          new Error(
            'Could not extract OAuth token from claude setup-token output',
          ),
        );
        return;
      }

      resolve(match[0]);
    });
  });
}

export async function loadToken(): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(TOKEN_FILE, 'utf-8');
  } catch {
    throw new Error(
      `No token found at ${TOKEN_FILE}. Run "agent-harness login" first.`,
    );
  }

  const data = JSON.parse(raw) as { CLAUDE_CODE_OAUTH_TOKEN?: string };
  const token = data.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) {
    throw new Error(
      `Invalid token file at ${TOKEN_FILE}. Run "agent-harness login" to re-authenticate.`,
    );
  }

  return token;
}
