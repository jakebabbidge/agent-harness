/**
 * Tests for template loader and renderer (TMPL-01, TMPL-02, TMPL-03).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { renderTemplate, dryRunRender } from '../template/renderer.js';
import { loadTemplate, loadPartials } from '../template/loader.js';

// Helpers for creating temporary fixture files in a unique temp directory.
// Each test uses files with simple, predictable names so that partial names
// derived from basename-without-ext match the {{> partialName}} references.

let tempDir: string | null = null;
let tempFiles: string[] = [];

async function getTempDir(): Promise<string> {
  if (!tempDir) {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-harness-test-'));
  }
  return tempDir;
}

async function writeTempFile(name: string, content: string): Promise<string> {
  const dir = await getTempDir();
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, content, 'utf-8');
  tempFiles.push(filePath);
  return filePath;
}

afterEach(async () => {
  for (const f of tempFiles) {
    await fs.unlink(f).catch(() => {});
  }
  tempFiles = [];
  // Remove and reset temp dir between tests so each test gets fresh names.
  if (tempDir) {
    await fs.rmdir(tempDir).catch(() => {});
    tempDir = null;
  }
});

// ---------------------------------------------------------------------------
// loadTemplate
// ---------------------------------------------------------------------------

describe('loadTemplate', () => {
  it('reads and returns file content as a string', async () => {
    const p = await writeTempFile('tmpl.hbs', 'Hello {{name}}!');
    const content = await loadTemplate(p);
    expect(content).toBe('Hello {{name}}!');
  });

  it('throws descriptive error when file is missing', async () => {
    const missing = path.join(os.tmpdir(), 'does-not-exist-12345.hbs');
    await expect(loadTemplate(missing)).rejects.toThrow(missing);
  });
});

// ---------------------------------------------------------------------------
// loadPartials
// ---------------------------------------------------------------------------

describe('loadPartials', () => {
  it('returns a map of partial-name → content', async () => {
    const p1 = await writeTempFile('header.hbs', '<header>Header</header>');
    const p2 = await writeTempFile('footer.hbs', '<footer>Footer</footer>');
    const map = await loadPartials([p1, p2]);
    expect(map.get('header')).toBe('<header>Header</header>');
    expect(map.get('footer')).toBe('<footer>Footer</footer>');
  });

  it('returns empty map for empty input', async () => {
    const map = await loadPartials([]);
    expect(map.size).toBe(0);
  });

  it('throws descriptive error when a partial file is missing', async () => {
    const missing = path.join(os.tmpdir(), 'no-such-partial.hbs');
    await expect(loadPartials([missing])).rejects.toThrow(missing);
  });
});

// ---------------------------------------------------------------------------
// TMPL-01: variable substitution
// ---------------------------------------------------------------------------

describe('TMPL-01: renderTemplate - variable substitution', () => {
  it('substitutes a single variable', async () => {
    const p = await writeTempFile('tmpl.hbs', 'Hello {{name}}!');
    const result = await renderTemplate(p, { name: 'world' }, []);
    expect(result.rendered).toBe('Hello world!');
    expect(result.templatePath).toBe(p);
    expect(result.partialPaths).toEqual([]);
    expect(result.variables).toEqual({ name: 'world' });
  });

  it('renders empty string for unknown variable (Handlebars default)', async () => {
    const p = await writeTempFile('tmpl.hbs', 'Hello {{missing}}!');
    const result = await renderTemplate(p, {}, []);
    expect(result.rendered).toBe('Hello !');
  });

  it('substitutes multiple variables', async () => {
    const p = await writeTempFile('tmpl.hbs', '{{greeting}}, {{name}}!');
    const result = await renderTemplate(p, { greeting: 'Hi', name: 'Alice' }, []);
    expect(result.rendered).toBe('Hi, Alice!');
  });
});

// ---------------------------------------------------------------------------
// TMPL-02: partial composition
// ---------------------------------------------------------------------------

describe('TMPL-02: renderTemplate - partial composition', () => {
  it('inlines a single partial at {{> partialName}}', async () => {
    const partial = await writeTempFile('system-prompt.hbs', 'You are a helpful assistant.');
    const tmpl = await writeTempFile('tmpl.hbs', 'Prompt: {{> system-prompt}}');
    const result = await renderTemplate(tmpl, {}, [partial]);
    expect(result.rendered).toBe('Prompt: You are a helpful assistant.');
    expect(result.partialPaths).toEqual([partial]);
  });

  it('renders two partials with different names in one call', async () => {
    const header = await writeTempFile('header.hbs', 'HEADER');
    const footer = await writeTempFile('footer.hbs', 'FOOTER');
    const tmpl = await writeTempFile('tmpl.hbs', '{{> header}} body {{> footer}}');
    const result = await renderTemplate(tmpl, {}, [header, footer]);
    expect(result.rendered).toBe('HEADER body FOOTER');
  });

  it('partial can reference variables', async () => {
    const partial = await writeTempFile('greeting.hbs', 'Hello, {{name}}!');
    const tmpl = await writeTempFile('tmpl.hbs', '{{> greeting}}');
    const result = await renderTemplate(tmpl, { name: 'Bob' }, [partial]);
    expect(result.rendered).toBe('Hello, Bob!');
  });
});

// ---------------------------------------------------------------------------
// TMPL-03: dry-run render
// ---------------------------------------------------------------------------

describe('TMPL-03: dryRunRender', () => {
  it('returns the same RenderResult as renderTemplate', async () => {
    const partial = await writeTempFile('note.hbs', 'NOTE: {{msg}}');
    const tmpl = await writeTempFile('tmpl.hbs', '{{> note}} end');
    const [renderResult, dryResult] = await Promise.all([
      renderTemplate(tmpl, { msg: 'hello' }, [partial]),
      dryRunRender(tmpl, { msg: 'hello' }, [partial]),
    ]);
    expect(dryResult.rendered).toBe(renderResult.rendered);
    expect(dryResult.templatePath).toBe(renderResult.templatePath);
    expect(dryResult.partialPaths).toEqual(renderResult.partialPaths);
    expect(dryResult.variables).toEqual(renderResult.variables);
  });

  it('does not write any files (no observable side effects beyond stdout)', async () => {
    const tmpl = await writeTempFile('tmpl.hbs', '{{val}}');
    const dir = await getTempDir();
    // Snapshot the temp dir contents before the call
    const beforeFiles = await fs.readdir(dir);
    await dryRunRender(tmpl, { val: 'test' }, []);
    const afterFiles = await fs.readdir(dir);
    // dryRunRender must not create any new files inside the temp directory
    const newFiles = afterFiles.filter(f => !beforeFiles.includes(f));
    expect(newFiles.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('renderTemplate - error handling', () => {
  it('throws descriptive error when template file is not found', async () => {
    const missing = path.join(os.tmpdir(), 'no-template.hbs');
    await expect(renderTemplate(missing, {}, [])).rejects.toThrow(missing);
  });

  it('throws descriptive error when a partial file is not found', async () => {
    const tmpl = await writeTempFile('tmpl.hbs', '{{> ghost}}');
    const missing = path.join(os.tmpdir(), 'ghost.hbs');
    await expect(renderTemplate(tmpl, {}, [missing])).rejects.toThrow(missing);
  });
});

// ---------------------------------------------------------------------------
// Concurrency safety
// ---------------------------------------------------------------------------

describe('Concurrency safety', () => {
  it('two concurrent renders with different partials do not cross-contaminate', async () => {
    const partialA = await writeTempFile('partA.hbs', 'ContentA');
    const partialB = await writeTempFile('partB.hbs', 'ContentB');
    const tmplA = await writeTempFile('tmplA.hbs', '{{> partA}}');
    const tmplB = await writeTempFile('tmplB.hbs', '{{> partB}}');

    const [resultA, resultB] = await Promise.all([
      renderTemplate(tmplA, {}, [partialA]),
      renderTemplate(tmplB, {}, [partialB]),
    ]);

    expect(resultA.rendered).toBe('ContentA');
    expect(resultB.rendered).toBe('ContentB');
  });
});
