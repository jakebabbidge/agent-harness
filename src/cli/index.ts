import { Command } from 'commander';
import { runCommand } from './run.js';
import { answerCommand } from './answer.js';
import { resumeCommand } from './resume.js';
import { dryRunCommand } from './dry-run.js';

export const program = new Command();

program
  .name('agent-harness')
  .description('CLI tool for running coding agents')
  .version('0.1.0');

program
  .command('run')
  .description('Run a template or workflow')
  .argument('<target>', 'Template file or workflow YAML')
  .option('-r, --repo <path>', 'Repository path (required for template mode)')
  .option('-v, --variables <json>', 'JSON variables for template', '{}')
  .action(async (target: string, opts: { repo?: string; variables?: string }) => {
    await runCommand(target, opts);
  });

program
  .command('answer')
  .description('Answer a pending agent question')
  .argument('<run-id>', 'Run ID from the question prompt')
  .argument('<answer>', 'Answer text')
  .action(async (runId: string, answer: string) => {
    await answerCommand(runId, answer);
  });

program
  .command('resume')
  .description('Resume an interrupted workflow')
  .argument('<run-id>', 'Run ID of the interrupted workflow')
  .action(async (runId: string) => {
    await resumeCommand(runId);
  });

program
  .command('dry-run')
  .description('Render a template with variables and print the result (no execution)')
  .argument('<template>', 'Template file path')
  .option('-v, --variables <json>', 'JSON variables for template', '{}')
  .option('-p, --partials <paths...>', 'Partial template file paths')
  .action(async (template: string, opts: { variables?: string; partials?: string[] }) => {
    await dryRunCommand(template, opts);
  });

program.parse(process.argv);
