FROM node:20

ARG AGENT_SDK_VERSION=latest

# Install iptables for firewall
RUN apt-get update && apt-get install -y iptables && rm -rf /var/lib/apt/lists/*

# Install Agent SDK globally
RUN npm install -g @anthropic-ai/claude-agent-sdk@${AGENT_SDK_VERSION}

# Copy firewall init script
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod +x /usr/local/bin/init-firewall.sh

# Copy compiled runtime and ESM package.json
COPY agent-runner.js /opt/agent-harness/agent-runner.js
RUN echo '{"type":"module"}' > /opt/agent-harness/package.json

# Environment
ENV NODE_OPTIONS=--max-old-space-size=4096
ENV NODE_PATH=/usr/local/lib/node_modules

USER node
WORKDIR /home/node
