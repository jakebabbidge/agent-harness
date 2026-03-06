import Handlebars from 'handlebars';
import { getTemplatePath, loadTemplate } from './template-loader.js';
import { resolveFileReferences } from './file-resolver.js';

export interface RenderOptions {
  templateName: string;
  variables: Record<string, string>;
}

export async function renderTemplate(options: RenderOptions): Promise<string> {
  const { templateName, variables } = options;

  const rawContent = await loadTemplate(templateName);
  const templatePath = getTemplatePath(templateName);

  const resolvedContent = await resolveFileReferences(rawContent, templatePath);

  const compiled = Handlebars.compile(resolvedContent, { strict: true });
  return compiled(variables);
}
