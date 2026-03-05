import * as fs from 'fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';

export const NodeDefSchema = z.object({
  id: z.string(),
  template: z.string(),
  repo: z.string(),
  variables: z.record(z.unknown()).optional().default({}),
});

export const EdgeConditionSchema = z.object({
  field: z.string(),
  equals: z.string().optional(),
  notEquals: z.string().optional(),
  contains: z.string().optional(),
}).refine(
  (c) => c.equals !== undefined || c.notEquals !== undefined || c.contains !== undefined,
  { message: 'EdgeCondition must have at least one operator (equals, notEquals, or contains)' },
);

export const EdgeDefSchema = z.object({
  from: z.string(),
  to: z.string(),
  condition: EdgeConditionSchema.optional(),
});

export const WorkflowDefSchema = z.object({
  version: z.string(),
  nodes: z.array(NodeDefSchema).min(1),
  edges: z.array(EdgeDefSchema).default([]),
});

export type WorkflowDef = z.infer<typeof WorkflowDefSchema>;

export async function parseWorkflow(filePath: string): Promise<WorkflowDef> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = parse(raw);
  return WorkflowDefSchema.parse(parsed);
}
