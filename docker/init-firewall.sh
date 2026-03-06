#!/bin/bash
set -euo pipefail

# Firewall initialization script for Claude Code container
# Restricts outbound traffic to whitelisted domains only
# Requires NET_ADMIN and NET_RAW capabilities

ALLOWED_DOMAINS=(
  "api.anthropic.com"
  "statsig.anthropic.com"
  "sentry.io"
  "github.com"
  "api.github.com"
  "registry.npmjs.org"
)

# Flush existing rules
iptables -F OUTPUT 2>/dev/null || true

# Allow loopback
iptables -A OUTPUT -o lo -j ACCEPT

# Allow established connections
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow DNS
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# Resolve and allow whitelisted domains
for domain in "${ALLOWED_DOMAINS[@]}"; do
  ips=$(dig +short "$domain" 2>/dev/null || true)
  for ip in $ips; do
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      iptables -A OUTPUT -d "$ip" -j ACCEPT
    fi
  done
done

# Drop everything else
iptables -A OUTPUT -j DROP

echo "Firewall initialized: outbound restricted to whitelisted domains"
