import * as fs from 'fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
export const NodeDefSchema = z.object({
    id: z.string(),
    template: z.string(),
    repo: z.string(),
    variables: z.record(z.unknown()).optional().default({}),
});
export const EdgeDefSchema = z.object({
    from: z.string(),
    to: z.string(),
});
export const WorkflowDefSchema = z.object({
    version: z.string(),
    nodes: z.array(NodeDefSchema).min(1),
    edges: z.array(EdgeDefSchema).default([]),
});
export async function parseWorkflow(filePath) {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = parse(raw);
    return WorkflowDefSchema.parse(parsed);
}
//# sourceMappingURL=parser.js.map