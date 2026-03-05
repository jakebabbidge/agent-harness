#!/usr/bin/env bash
set -euo pipefail

# Flush existing rules
iptables -F
iptables -X

# Allow loopback traffic
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Allow established and related connections
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow DNS (UDP and TCP port 53)
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# Create ipset for allowed domains
ipset create allowed-domains hash:net -exist
ipset flush allowed-domains

# Resolve and add IPs for whitelisted domains
for domain in api.anthropic.com registry.npmjs.org; do
  for ip in $(dig +short "$domain" 2>/dev/null); do
    # Only add valid IPv4 addresses (skip CNAME records)
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      ipset add allowed-domains "$ip/32" -exist
    fi
  done
done

# Fetch GitHub IP ranges and add to ipset
GITHUB_META=$(curl -s https://api.github.com/meta 2>/dev/null || true)
if [ -n "$GITHUB_META" ]; then
  for cidr in $(echo "$GITHUB_META" | grep -oE '"[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+"' | tr -d '"' | sort -u); do
    ipset add allowed-domains "$cidr" -exist
  done
fi

# Allow OUTPUT to whitelisted IPs
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

# Default deny all other outbound traffic
iptables -A OUTPUT -j DROP
iptables -P OUTPUT DROP

echo "[init-firewall] Firewall initialized: default-deny with whitelisted domains"
