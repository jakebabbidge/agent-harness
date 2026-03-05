FROM node:20

# Install system dependencies for firewall, git, and network tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    iptables \
    ipset \
    iproute2 \
    dnsutils \
    sudo \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI and Agent SDK globally
RUN npm install -g @anthropic-ai/claude-code @anthropic-ai/claude-agent-sdk

# Grant node user passwordless sudo for firewall commands
RUN echo "node ALL=(ALL) NOPASSWD: /usr/sbin/iptables, /usr/sbin/ip6tables, /usr/sbin/ipset, /usr/local/bin/init-firewall.sh" \
    > /etc/sudoers.d/node-firewall \
  && chmod 0440 /etc/sudoers.d/node-firewall

# Copy firewall init script
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod +x /usr/local/bin/init-firewall.sh

# Copy agent-runner script for SDK-based execution with HITL support
COPY agent-runner.js /usr/local/lib/agent-runner.js

WORKDIR /workspace

USER node
