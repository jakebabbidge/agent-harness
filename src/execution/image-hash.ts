import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HASH_FILE = join(homedir(), '.agent-harness', 'docker-image-hash');

export async function computeContextHash(
  dockerContextPath: string,
): Promise<string> {
  const files = ['Dockerfile', 'init-firewall.sh'];
  const hash = createHash('sha256');

  for (const file of files) {
    const content = await readFile(join(dockerContextPath, file), 'utf-8');
    hash.update(file);
    hash.update(content);
  }

  return hash.digest('hex');
}

export async function getStoredHash(): Promise<string | null> {
  try {
    return await readFile(HASH_FILE, 'utf-8');
  } catch {
    return null;
  }
}

export async function storeHash(hash: string): Promise<void> {
  await mkdir(join(homedir(), '.agent-harness'), { recursive: true });
  await writeFile(HASH_FILE, hash, 'utf-8');
}

export async function needsRebuild(
  dockerContextPath: string,
): Promise<boolean> {
  const current = await computeContextHash(dockerContextPath);
  const stored = await getStoredHash();
  return current !== stored;
}
