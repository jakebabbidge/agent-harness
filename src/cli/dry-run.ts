import { dryRunRender } from '../template/renderer.js';

export async function dryRunCommand(
  template: string,
  options: { variables?: string; partials?: string[] },
): Promise<void> {
  let variables: Record<string, unknown> = {};
  try {
    variables = JSON.parse(options.variables ?? '{}') as Record<string, unknown>;
  } catch {
    console.error('[agent-harness] Error: --variables must be a valid JSON string.');
    process.exit(1);
  }
  const partialPaths = options.partials ?? [];
  await dryRunRender(template, variables, partialPaths);
}
