import { Command } from 'commander';
import { runCommand } from './run.js';
import { answerCommand } from './answer.js';
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
    .action(async (target, opts) => {
    await runCommand(target, opts);
});
program
    .command('answer')
    .description('Answer a pending agent question')
    .argument('<run-id>', 'Run ID from the question prompt')
    .argument('<answer>', 'Answer text')
    .action(async (runId, answer) => {
    await answerCommand(runId, answer);
});
program.parse(process.argv);
//# sourceMappingURL=index.js.map