import type { AgentAdapter, AgentRunOptions } from './adapter.js';

export class ClaudeCodeAdapter implements AgentAdapter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  buildCommand(options: AgentRunOptions): string[] {
    return ['node', '/opt/agent-harness/agent-runner.js'];
  }
}
