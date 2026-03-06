import Handlebars from 'handlebars';
import { resolveTemplatePath, loadTemplate } from './template-loader.js';
import { resolveFileReferences } from './file-resolver.js';

export interface RenderOptions {
  templatePath: string;
  variables: Record<string, string>;
}

export async function renderTemplate(options: RenderOptions): Promise<string> {
  const { templatePath, variables } = options;

  const rawContent = await loadTemplate(templatePath);
  const resolved = resolveTemplatePath(templatePath);

  const resolvedContent = await resolveFileReferences(rawContent, resolved);

  const compiled = Handlebars.compile(resolvedContent, { strict: true });
  return compiled(variables);
}
