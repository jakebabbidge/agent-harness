import { AgentAdapter, AgentRunOptions } from './adapter.js';

export class ClaudeCodeAdapter implements AgentAdapter {
  buildCommand(options: AgentRunOptions): string[] {
    return [
      'claude',
      '--dangerously-skip-permissions',
      '-p',
      options.prompt,
      '--output-file',
      options.outputPath,
    ];
  }

  buildLoginCommand(): string[] {
    return ['/bin/bash'];
  }
}
