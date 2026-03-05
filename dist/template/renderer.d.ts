/**
 * Template renderer for the agent-harness template engine.
 *
 * Uses Handlebars for {{variable}} substitution and {{> partial}} composition.
 * Each render call uses Handlebars.create() to produce an isolated instance,
 * preventing partial bleed between concurrent renders.
 */
import type { RenderResult, TemplateVariables } from '../types/index.js';
/**
 * Renders a Handlebars template with the given variables and optional partials.
 *
 * @param templatePath  - Absolute or relative path to the .hbs template file.
 * @param variables     - Key/value pairs substituted into {{variable}} slots.
 * @param partialPaths  - Paths to partial .hbs files (composed via {{> name}}).
 * @returns             A RenderResult containing the rendered string and metadata.
 *
 * Each call creates a fresh Handlebars environment (Handlebars.create()) so
 * concurrent invocations cannot share registered partials.
 */
export declare function renderTemplate(templatePath: string, variables: TemplateVariables, partialPaths: string[]): Promise<RenderResult>;
/**
 * Dry-run render: identical to renderTemplate in logic but additionally
 * writes the rendered output to stdout. No files are written, no containers
 * or git operations are performed.
 *
 * The "dry-run" qualifier means the result is inspectable before any execution
 * pipeline consumes it — not that rendering itself is suppressed.
 */
export declare function dryRunRender(templatePath: string, variables: TemplateVariables, partialPaths: string[]): Promise<RenderResult>;
//# sourceMappingURL=renderer.d.ts.map