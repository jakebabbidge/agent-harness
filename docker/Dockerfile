FROM node:20

ARG CLAUDE_CODE_VERSION=latest

# Install iptables for firewall
RUN apt-get update && apt-get install -y iptables && rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# Copy firewall init script
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod +x /usr/local/bin/init-firewall.sh

# Environment
ENV CLAUDE_CONFIG_DIR=/home/node/.claude
ENV NODE_OPTIONS=--max-old-space-size=4096

USER node
WORKDIR /home/node
