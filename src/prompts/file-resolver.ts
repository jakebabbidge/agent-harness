import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const FILE_REF_REGEX = /\{\{file:\/\/(.+?)\}\}/g;

export async function resolveFileReferences(
  content: string,
  currentFilePath: string,
  ancestors: Set<string> = new Set(),
): Promise<string> {
  const currentAbsolute = resolve(currentFilePath);

  if (ancestors.has(currentAbsolute)) {
    const chain = [...ancestors, currentAbsolute].join(' -> ');
    throw new Error(`Circular file reference detected: ${chain}`);
  }

  const newAncestors = new Set([...ancestors, currentAbsolute]);
  const currentDir = dirname(currentAbsolute);

  const matches = [...content.matchAll(FILE_REF_REGEX)];
  if (matches.length === 0) {
    return content;
  }

  let result = content;
  for (const match of matches) {
    const relativePath = match[1];
    const absolutePath = resolve(currentDir, relativePath);

    let fileContent: string;
    try {
      fileContent = await readFile(absolutePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(
          `File reference not found: {{file://${relativePath}}} resolved to ${absolutePath}`,
        );
      }
      throw error;
    }

    const resolvedContent = await resolveFileReferences(
      fileContent,
      absolutePath,
      newAncestors,
    );
    result = result.replace(match[0], resolvedContent);
  }

  return result;
}
