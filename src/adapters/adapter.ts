export interface AgentRunOptions {
  promptPath: string;
  outputPath: string;
}

export interface AgentAdapter {
  buildCommand(options: AgentRunOptions): string[];
}
