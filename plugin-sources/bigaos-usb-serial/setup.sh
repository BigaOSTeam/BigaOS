#!/bin/bash
# USB GPS System Setup
# Runs with sudo during plugin installation.
# Idempotent — safe to run multiple times.
#
# A USB GPS shows up as /dev/ttyUSB* or /dev/ttyACM*, owned by group
# "dialout". The BigaOS server process must be in that group to read it.

set -e

# The user that runs BigaOS is the one that invoked sudo for this script.
TARGET_USER="${SUDO_USER:-}"

if [ -z "$TARGET_USER" ] || [ "$TARGET_USER" = "root" ]; then
  # Server runs as root (or user unknown) — root can already read tty devices.
  echo "Running as root — no dialout group change needed"
else
  if id -nG "$TARGET_USER" | tr ' ' '\n' | grep -qx dialout; then
    echo "User '$TARGET_USER' already in dialout group"
  else
    echo "Adding user '$TARGET_USER' to dialout group (for serial GPS access)..."
    usermod -aG dialout "$TARGET_USER"
    echo "User added to dialout group"
    # Group membership only takes effect after the process restarts.
    echo "REBOOT_REQUIRED"
  fi
fi

echo "SETUP_COMPLETE"
