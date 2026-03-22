#!/bin/bash
# Tailscale VPN — System Setup
# Runs with sudo during plugin installation.
# Idempotent — safe to run multiple times.

set -e

# Check if tailscale is already installed
if command -v tailscale &> /dev/null; then
  echo "Tailscale already installed: $(tailscale version | head -1)"
  echo "SETUP_COMPLETE"
  exit 0
fi

# Install Tailscale using the official installer
echo "Installing Tailscale..."
curl -fsSL https://tailscale.com/install.sh | sh

# Enable and start the tailscaled service
systemctl enable tailscaled
systemctl start tailscaled

# Enable IP forwarding (needed for subnet routing)
if ! grep -q "^net.ipv4.ip_forward = 1" /etc/sysctl.conf; then
  echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf
  echo "net.ipv6.conf.all.forwarding = 1" >> /etc/sysctl.conf
  sysctl -p
  echo "IP forwarding enabled"
fi

echo "Tailscale installed: $(tailscale version | head -1)"
echo "SETUP_COMPLETE"
