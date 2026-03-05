import { z } from 'zod';
export declare const NodeDefSchema: z.ZodObject<{
    id: z.ZodString;
    template: z.ZodString;
    repo: z.ZodString;
    variables: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    template: string;
    repo: string;
    variables: Record<string, unknown>;
}, {
    id: string;
    template: string;
    repo: string;
    variables?: Record<string, unknown> | undefined;
}>;
export declare const EdgeDefSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
}, "strip", z.ZodTypeAny, {
    from: string;
    to: string;
}, {
    from: string;
    to: string;
}>;
export declare const WorkflowDefSchema: z.ZodObject<{
    version: z.ZodString;
    nodes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        template: z.ZodString;
        repo: z.ZodString;
        variables: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        template: string;
        repo: string;
        variables: Record<string, unknown>;
    }, {
        id: string;
        template: string;
        repo: string;
        variables?: Record<string, unknown> | undefined;
    }>, "many">;
    edges: z.ZodDefault<z.ZodArray<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        from: string;
        to: string;
    }, {
        from: string;
        to: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    version: string;
    nodes: {
        id: string;
        template: string;
        repo: string;
        variables: Record<string, unknown>;
    }[];
    edges: {
        from: string;
        to: string;
    }[];
}, {
    version: string;
    nodes: {
        id: string;
        template: string;
        repo: string;
        variables?: Record<string, unknown> | undefined;
    }[];
    edges?: {
        from: string;
        to: string;
    }[] | undefined;
}>;
export type WorkflowDef = z.infer<typeof WorkflowDefSchema>;
export declare function parseWorkflow(filePath: string): Promise<WorkflowDef>;
//# sourceMappingURL=parser.d.ts.map