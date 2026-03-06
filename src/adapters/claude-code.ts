import { AgentAdapter, AgentRunOptions } from './adapter.js';

export class ClaudeCodeAdapter implements AgentAdapter {
  buildCommand(options: AgentRunOptions): string[] {
    return [
      'sh',
      '-c',
      `claude -p ${this.shellEscape(options.prompt)} > ${options.outputPath} 2>&1`,
    ];
  }

  private shellEscape(str: string): string {
    return "'" + str.replace(/'/g, "'\\''") + "'";
  }

  buildLoginCommand(): string[] {
    return ['/bin/bash'];
  }
}
