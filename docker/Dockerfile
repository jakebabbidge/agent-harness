FROM node:20

ARG AGENT_SDK_VERSION=latest

# Install iptables for firewall
RUN apt-get update && apt-get install -y iptables && rm -rf /var/lib/apt/lists/*

# Copy firewall init script
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod +x /usr/local/bin/init-firewall.sh

# Copy compiled runtime and set up as ESM package with local SDK dependency
COPY agent-runner.js /opt/agent-harness/agent-runner.js
RUN echo '{"type":"module"}' > /opt/agent-harness/package.json && \
    cd /opt/agent-harness && npm install @anthropic-ai/claude-agent-sdk@${AGENT_SDK_VERSION}

# Environment
ENV NODE_OPTIONS=--max-old-space-size=4096

USER node
WORKDIR /home/node
