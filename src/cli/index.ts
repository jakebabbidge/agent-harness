import { Command } from 'commander';
import {
  executeLogin,
  executeDebugContainer,
} from '../execution/container-lifecycle.js';
import { renderTemplate } from '../prompts/index.js';
import { RunSession } from '../run-session/index.js';
import { renderApp } from '../ui/render.js';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const program = new Command();

function collectVars(
  value: string,
  previous: Record<string, string>,
): Record<string, string> {
  const eqIndex = value.indexOf('=');
  if (eqIndex === -1) {
    throw new Error(`Invalid variable format: "${value}". Expected key=value`);
  }
  const key = value.slice(0, eqIndex);
  const val = value.slice(eqIndex + 1);
  return { ...previous, [key]: val };
}

program
  .name('agent-harness')
  .version('0.1.0')
  .description(
    'CLI tool that wraps coding agents to provide standardised prompt management, isolated execution, and workflow orchestration.',
  );

program
  .command('run')
  .description(
    'Run Claude Code with a prompt template in an isolated Docker container',
  )
  .argument('<template>', 'Path to the prompt template file')
  .option(
    '--var <key=value>',
    'Template variable (repeatable)',
    collectVars,
    {},
  )
  .action(
    async (templatePath: string, opts: { var: Record<string, string> }) => {
      try {
        const rendered = await renderTemplate({
          templatePath,
          variables: opts.var,
        });

        const session = new RunSession();
        const app = renderApp(session);
        const resultPromise = session.addExecution(
          'run-1',
          templatePath,
          rendered,
        );

        const result = await resultPromise;
        app.unmount();

        if (result.rawLogPath) {
          console.error(
            `${DIM}Raw container log: ${result.rawLogPath}${RESET}`,
          );
        }
        if (result.exitCode !== 0) {
          if (result.stderr) {
            console.error(result.stderr);
          }
          console.error(`Claude Code exited with code ${result.exitCode}`);
          process.exit(result.exitCode);
        }
      } catch (error) {
        console.error(
          (error as Error).message || 'An unexpected error occurred',
        );
        process.exit(1);
      }
    },
  );

program
  .command('dry-run')
  .description('Render a prompt template and print it without executing')
  .argument('<template>', 'Path to the prompt template file')
  .option(
    '--var <key=value>',
    'Template variable (repeatable)',
    collectVars,
    {},
  )
  .action(
    async (templatePath: string, opts: { var: Record<string, string> }) => {
      try {
        const rendered = await renderTemplate({
          templatePath,
          variables: opts.var,
        });
        process.stdout.write(rendered);
      } catch (error) {
        console.error(
          (error as Error).message || 'An unexpected error occurred',
        );
        process.exit(1);
      }
    },
  );

program
  .command('login')
  .description('Start interactive container for Claude Code OAuth login')
  .action(async () => {
    try {
      await executeLogin();
    } catch (error) {
      console.error((error as Error).message || 'An unexpected error occurred');
      process.exit(1);
    }
  });

program
  .command('debug-container')
  .description(
    'Launch an interactive shell inside the agent container for debugging',
  )
  .action(async () => {
    try {
      await executeDebugContainer();
    } catch (error) {
      console.error((error as Error).message || 'An unexpected error occurred');
      process.exit(1);
    }
  });

export { program };
