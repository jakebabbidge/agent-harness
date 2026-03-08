import type { AgentAdapter } from './adapter.js';

export class ClaudeCodeAdapter implements AgentAdapter {
  buildCommand(): string[] {
    return ['node', '/opt/agent-harness/runtime/agent-runner.js'];
  }
}
