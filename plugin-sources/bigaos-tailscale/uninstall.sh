#!/bin/bash
# Tailscale VPN — System Cleanup
# Runs with sudo during plugin uninstall.

set -e

# Disconnect from Tailscale network
if command -v tailscale &> /dev/null; then
  tailscale logout 2>/dev/null || true
  tailscale down 2>/dev/null || true
fi

# Stop and disable the service
systemctl stop tailscaled 2>/dev/null || true
systemctl disable tailscaled 2>/dev/null || true

# Note: we do NOT remove the tailscale package itself.
# The user may re-install the plugin, and leaving the package
# avoids a lengthy re-download. The logout above disconnects
# from the network, which is the important part.

echo "UNINSTALL_COMPLETE"
