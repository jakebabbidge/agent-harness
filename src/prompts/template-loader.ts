import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const PROMPTS_DIR = 'prompts';
const TEMPLATE_EXT = '.md';

export function getTemplatePath(templateName: string): string {
  return join(
    homedir(),
    '.agent-harness',
    PROMPTS_DIR,
    templateName + TEMPLATE_EXT,
  );
}

export async function loadTemplate(templateName: string): Promise<string> {
  const templatePath = getTemplatePath(templateName);
  try {
    return await readFile(templatePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Template not found: ${templatePath}`);
    }
    throw error;
  }
}
