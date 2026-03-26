#!/bin/bash
# Tailscale VPN — System Setup
# Runs with sudo during plugin installation.
# Idempotent — safe to run multiple times.

set -e

# Install Tailscale if not already present
if ! command -v tailscale &> /dev/null; then
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
else
  echo "Tailscale already installed: $(tailscale version | head -1)"
fi

# Allow the BigaOS service user to run tailscale commands without sudo
TS_OPERATOR="${SUDO_USER:-$USER}"
if [ -n "$TS_OPERATOR" ]; then
  tailscale set --operator="$TS_OPERATOR" 2>/dev/null || true
  echo "Tailscale operator set to: $TS_OPERATOR"
fi

echo "Tailscale installed: $(tailscale version | head -1)"
echo "SETUP_COMPLETE"
