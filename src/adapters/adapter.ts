export interface AgentRunOptions {
  prompt: string;
  outputPath: string;
}

export interface AgentAdapter {
  buildCommand(options: AgentRunOptions): string[];
  buildLoginCommand(): string[];
}
