import { Command } from 'commander';

const program = new Command();

program
  .name('agent-harness')
  .version('0.1.0')
  .description(
    'CLI tool that wraps coding agents to provide standardised prompt management, isolated execution, and workflow orchestration.',
  );

export { program };
