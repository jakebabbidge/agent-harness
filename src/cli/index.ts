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
        session.registerExecution('run-1', templatePath);
        const app = renderApp(session);

        let runResult: Awaited<ReturnType<typeof session.startExecution>>;
        try {
          runResult = await session.startExecution('run-1', rendered);
        } catch (execError) {
          // Execution failed — wait for user to review and exit
          await app.waitUntilExit();
          throw execError;
        }

        // Hold the UI open until the user presses q
        await app.waitUntilExit();

        if (runResult.rawLogPath) {
          console.error(
            `${DIM}Raw container log: ${runResult.rawLogPath}${RESET}`,
          );
        }
        if (runResult.exitCode !== 0) {
          if (runResult.stderr) {
            console.error(runResult.stderr);
          }
          console.error(`Claude Code exited with code ${runResult.exitCode}`);
          process.exit(runResult.exitCode);
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
