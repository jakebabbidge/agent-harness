import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function resolveTemplatePath(templatePath: string): string {
  return resolve(templatePath);
}

export async function loadTemplate(templatePath: string): Promise<string> {
  const resolved = resolveTemplatePath(templatePath);
  try {
    return await readFile(resolved, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Template not found: ${resolved}`);
    }
    throw error;
  }
}
