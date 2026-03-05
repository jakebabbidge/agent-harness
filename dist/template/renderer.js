/**
 * Template renderer for the agent-harness template engine.
 *
 * Uses Handlebars for {{variable}} substitution and {{> partial}} composition.
 * Each render call uses Handlebars.create() to produce an isolated instance,
 * preventing partial bleed between concurrent renders.
 */
import * as Handlebars from 'handlebars';
import { loadTemplate, loadPartials } from './loader.js';
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
export async function renderTemplate(templatePath, variables, partialPaths) {
    // Load template source and all partial sources concurrently.
    const [templateSource, partialsMap] = await Promise.all([
        loadTemplate(templatePath),
        loadPartials(partialPaths),
    ]);
    // Isolated Handlebars instance — never mutate the global Handlebars object.
    const hbs = Handlebars.create();
    // Register each partial under its derived name.
    for (const [name, content] of partialsMap) {
        hbs.registerPartial(name, content);
    }
    const compiled = hbs.compile(templateSource);
    const rendered = compiled(variables);
    return {
        rendered,
        templatePath,
        partialPaths,
        variables,
    };
}
/**
 * Dry-run render: identical to renderTemplate in logic but additionally
 * writes the rendered output to stdout. No files are written, no containers
 * or git operations are performed.
 *
 * The "dry-run" qualifier means the result is inspectable before any execution
 * pipeline consumes it — not that rendering itself is suppressed.
 */
export async function dryRunRender(templatePath, variables, partialPaths) {
    const result = await renderTemplate(templatePath, variables, partialPaths);
    process.stdout.write(result.rendered + '\n');
    return result;
}
//# sourceMappingURL=renderer.js.map