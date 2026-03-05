/**
 * Template file loader for the agent-harness template engine.
 *
 * Provides async file reading for template content and partial files.
 * All I/O uses fs/promises (no sync reads).
 */
/**
 * Reads a template file and returns its content as a string.
 * Throws a descriptive Error (including the file path) if the file is not found.
 */
export declare function loadTemplate(templatePath: string): Promise<string>;
/**
 * Reads all partial files and returns a Map of partial-name → content.
 * Partial name is derived from the filename without extension:
 *   e.g. "/tmp/system-prompt.hbs" → partial name "system-prompt"
 *
 * Throws a descriptive Error (including the file path) for any missing file.
 */
export declare function loadPartials(partialPaths: string[]): Promise<Map<string, string>>;
//# sourceMappingURL=loader.d.ts.map