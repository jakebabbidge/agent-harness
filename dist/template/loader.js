/**
 * Template file loader for the agent-harness template engine.
 *
 * Provides async file reading for template content and partial files.
 * All I/O uses fs/promises (no sync reads).
 */
import { promises as fs } from 'fs';
import * as path from 'path';
/**
 * Reads a template file and returns its content as a string.
 * Throws a descriptive Error (including the file path) if the file is not found.
 */
export async function loadTemplate(templatePath) {
    try {
        return await fs.readFile(templatePath, 'utf-8');
    }
    catch (err) {
        throw new Error(`Template file not found or unreadable: ${templatePath}${err instanceof Error ? ` — ${err.message}` : ''}`);
    }
}
/**
 * Reads all partial files and returns a Map of partial-name → content.
 * Partial name is derived from the filename without extension:
 *   e.g. "/tmp/system-prompt.hbs" → partial name "system-prompt"
 *
 * Throws a descriptive Error (including the file path) for any missing file.
 */
export async function loadPartials(partialPaths) {
    const map = new Map();
    await Promise.all(partialPaths.map(async (partialPath) => {
        let content;
        try {
            content = await fs.readFile(partialPath, 'utf-8');
        }
        catch (err) {
            throw new Error(`Partial file not found or unreadable: ${partialPath}${err instanceof Error ? ` — ${err.message}` : ''}`);
        }
        const name = path.basename(partialPath, path.extname(partialPath));
        map.set(name, content);
    }));
    return map;
}
//# sourceMappingURL=loader.js.map