import { Command } from 'commander';
import { executeRun, executeLogin } from '../execution/container-lifecycle.js';
import { promptUserForAnswer } from './prompt.js';

const program = new Command();

program
  .name('agent-harness')
  .version('0.1.0')
  .description(
    'CLI tool that wraps coding agents to provide standardised prompt management, isolated execution, and workflow orchestration.',
  );

program
  .command('run')
  .description(
    'Run Claude Code with the given prompt in an isolated Docker container',
  )
  .argument('<prompt>', 'Prompt string to send to Claude Code')
  .action(async (prompt: string) => {
    try {
      const result = await executeRun(prompt, promptUserForAnswer);
      if (result.output.trim()) {
        console.log(result.output.trim());
      }
      if (result.exitCode !== 0) {
        if (result.stderr) {
          console.error(result.stderr);
        }
        console.error(`Claude Code exited with code ${result.exitCode}`);
        process.exit(result.exitCode);
      }
    } catch (error) {
      console.error((error as Error).message || 'An unexpected error occurred');
      process.exit(1);
    }
  });

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

export { program };
