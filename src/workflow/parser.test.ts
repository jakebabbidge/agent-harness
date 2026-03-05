import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { parseWorkflow } from './parser.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'parser-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const VALID_SINGLE_NODE = `
version: "1.0"
nodes:
  - id: task-1
    template: templates/coding-task.hbs
    repo: /path/to/repo
`;

const VALID_MULTI_NODE_WITH_EDGES = `
version: "1.0"
nodes:
  - id: task-1
    template: templates/coding-task.hbs
    repo: /path/to/repo
    variables:
      branch: main
  - id: task-2
    template: templates/review-task.hbs
    repo: /path/to/repo
edges:
  - from: task-1
    to: task-2
`;

describe('parseWorkflow', () => {
  it('parses a valid single-node workflow correctly', async () => {
    const filePath = path.join(tmpDir, 'workflow.yaml');
    await fs.writeFile(filePath, VALID_SINGLE_NODE);

    const result = await parseWorkflow(filePath);
    expect(result.version).toBe('1.0');
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('task-1');
    expect(result.nodes[0].template).toBe('templates/coding-task.hbs');
    expect(result.edges).toEqual([]);
  });

  it('parses a valid multi-node workflow with edges correctly', async () => {
    const filePath = path.join(tmpDir, 'workflow.yaml');
    await fs.writeFile(filePath, VALID_MULTI_NODE_WITH_EDGES);

    const result = await parseWorkflow(filePath);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].from).toBe('task-1');
    expect(result.edges[0].to).toBe('task-2');
  });

  it('defaults edges to [] when omitted from YAML', async () => {
    const filePath = path.join(tmpDir, 'workflow.yaml');
    await fs.writeFile(filePath, VALID_SINGLE_NODE);

    const result = await parseWorkflow(filePath);
    expect(result.edges).toEqual([]);
  });

  it('defaults variables to {} when omitted from a node', async () => {
    const filePath = path.join(tmpDir, 'workflow.yaml');
    await fs.writeFile(filePath, VALID_SINGLE_NODE);

    const result = await parseWorkflow(filePath);
    expect(result.nodes[0].variables).toEqual({});
  });

  it('throws ZodError when nodes array is empty', async () => {
    const yaml = `
version: "1.0"
nodes: []
`;
    const filePath = path.join(tmpDir, 'workflow.yaml');
    await fs.writeFile(filePath, yaml);

    await expect(parseWorkflow(filePath)).rejects.toThrow();
  });

  it('throws ZodError when nodes field is missing', async () => {
    const yaml = `
version: "1.0"
`;
    const filePath = path.join(tmpDir, 'workflow.yaml');
    await fs.writeFile(filePath, yaml);

    await expect(parseWorkflow(filePath)).rejects.toThrow();
  });

  it('throws ZodError when version field is missing', async () => {
    const yaml = `
nodes:
  - id: task-1
    template: templates/coding-task.hbs
    repo: /path/to/repo
`;
    const filePath = path.join(tmpDir, 'workflow.yaml');
    await fs.writeFile(filePath, yaml);

    await expect(parseWorkflow(filePath)).rejects.toThrow();
  });

  it('throws an error for invalid YAML syntax', async () => {
    const badYaml = `
version: "1.0"
nodes:
  - id: [unclosed bracket
    template: broken
`;
    const filePath = path.join(tmpDir, 'workflow.yaml');
    await fs.writeFile(filePath, badYaml);

    await expect(parseWorkflow(filePath)).rejects.toThrow();
  });

  it('throws ENOENT for a non-existent file', async () => {
    const filePath = path.join(tmpDir, 'does-not-exist.yaml');

    await expect(parseWorkflow(filePath)).rejects.toThrow(/ENOENT/);
  });

  it('parses a workflow with conditional edges correctly', async () => {
    const yaml = `
version: "1.0"
nodes:
  - id: task-1
    template: templates/coding-task.hbs
    repo: /path/to/repo
  - id: task-2
    template: templates/review-task.hbs
    repo: /path/to/repo
edges:
  - from: task-1
    to: task-2
    condition:
      field: status
      equals: approved
`;
    const filePath = path.join(tmpDir, 'workflow.yaml');
    await fs.writeFile(filePath, yaml);

    const result = await parseWorkflow(filePath);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].condition).toBeDefined();
    expect(result.edges[0].condition!.field).toBe('status');
    expect(result.edges[0].condition!.equals).toBe('approved');
  });

  it('throws validation error for condition with no operator', async () => {
    const yaml = `
version: "1.0"
nodes:
  - id: task-1
    template: templates/coding-task.hbs
    repo: /path/to/repo
  - id: task-2
    template: templates/review-task.hbs
    repo: /path/to/repo
edges:
  - from: task-1
    to: task-2
    condition:
      field: status
`;
    const filePath = path.join(tmpDir, 'workflow.yaml');
    await fs.writeFile(filePath, yaml);

    await expect(parseWorkflow(filePath)).rejects.toThrow();
  });
});
