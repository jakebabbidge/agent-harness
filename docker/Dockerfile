FROM node:20

ARG CLAUDE_CODE_VERSION=latest
ARG AGENT_SDK_VERSION=latest

# Install iptables for firewall
RUN apt-get update && apt-get install -y iptables && rm -rf /var/lib/apt/lists/*

# Install Claude Code globally (the Agent SDK spawns it as a subprocess)
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# Copy firewall init script
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod +x /usr/local/bin/init-firewall.sh

# Copy compiled runtime and messages module, set up as ESM package with local SDK dependency
COPY agent-runner.js /opt/agent-harness/runtime/agent-runner.js
COPY messages.js /opt/agent-harness/messages.js
RUN echo '{"type":"module"}' > /opt/agent-harness/package.json && \
    cd /opt/agent-harness && npm install @anthropic-ai/claude-agent-sdk@${AGENT_SDK_VERSION}

# Environment
ENV CLAUDE_CONFIG_DIR=/home/node/.claude
ENV NODE_OPTIONS=--max-old-space-size=4096

USER node
WORKDIR /home/node
