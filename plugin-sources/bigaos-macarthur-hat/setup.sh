#!/bin/bash
# MacArthur HAT System Setup
# Runs with sudo during plugin installation.
# Idempotent — safe to run multiple times.

set -e

BOOT_CONFIG="/boot/firmware/config.txt"
REBOOT_NEEDED=false

# Fallback for older Raspberry Pi OS
if [ ! -f "$BOOT_CONFIG" ]; then
  BOOT_CONFIG="/boot/config.txt"
fi

# ── Install native module build tools (for i2c-bus) ───────
NEED_REBUILD=false
if ! dpkg -s build-essential &> /dev/null; then
  echo "Installing build-essential (needed for native Node modules)..."
  apt-get update -qq
  apt-get install -y -qq build-essential python3
  NEED_REBUILD=true
  echo "build-essential installed"
else
  echo "build-essential already installed"
fi

# ── Install can-utils if missing ──────────────────────────
if ! command -v candump &> /dev/null; then
  echo "Installing can-utils..."
  apt-get update -qq
  apt-get install -y -qq can-utils
  echo "can-utils installed"
else
  echo "can-utils already installed"
fi

# ── Install i2c-tools if missing ───────────────────────────
if ! command -v i2cdetect &> /dev/null; then
  echo "Installing i2c-tools..."
  apt-get update -qq
  apt-get install -y -qq i2c-tools
  echo "i2c-tools installed"
else
  echo "i2c-tools already installed"
fi

# ── Enable SPI in boot config ────────────────────────────
if [ -f "$BOOT_CONFIG" ]; then
  if ! grep -q "^dtparam=spi=on" "$BOOT_CONFIG"; then
    echo "" >> "$BOOT_CONFIG"
    echo "# MacArthur HAT - SPI enabled by BigaOS" >> "$BOOT_CONFIG"
    echo "dtparam=spi=on" >> "$BOOT_CONFIG"
    echo "SPI enabled in $BOOT_CONFIG"
    REBOOT_NEEDED=true
  else
    echo "SPI already enabled"
  fi

  # ── Enable I2C in boot config ──────────────────────────────
  if ! grep -q "^dtparam=i2c_arm=on" "$BOOT_CONFIG"; then
    echo "" >> "$BOOT_CONFIG"
    echo "# MacArthur HAT - I2C enabled by BigaOS (for ICM-20948 IMU)" >> "$BOOT_CONFIG"
    echo "dtparam=i2c_arm=on" >> "$BOOT_CONFIG"
    echo "I2C enabled in $BOOT_CONFIG"
    REBOOT_NEEDED=true
  else
    echo "I2C already enabled"
  fi

  # ── Ensure i2c-dev module loads at boot (creates /dev/i2c-*) ──
  if [ ! -f /etc/modules-load.d/i2c-dev.conf ]; then
    echo "i2c-dev" > /etc/modules-load.d/i2c-dev.conf
    echo "i2c-dev module configured for auto-load"
    # Load it now if not already loaded
    modprobe i2c-dev 2>/dev/null || true
  else
    echo "i2c-dev module already configured"
  fi

  # ── Add CAN overlay ──────────────────────────────────────
  if ! grep -q "^dtoverlay=mcp251xfd" "$BOOT_CONFIG"; then
    echo "dtoverlay=mcp251xfd,spi0-1,oscillator=20000000,interrupt=25" >> "$BOOT_CONFIG"
    echo "CAN overlay added to $BOOT_CONFIG"
    REBOOT_NEEDED=true
  else
    echo "CAN overlay already configured"
  fi

  # ── Safe shutdown via power module (GPIO 21 in, GPIO 26 out) ──
  if ! grep -q "^dtoverlay=gpio-shutdown" "$BOOT_CONFIG"; then
    echo "" >> "$BOOT_CONFIG"
    echo "# MacArthur HAT - Safe shutdown (power module)" >> "$BOOT_CONFIG"
    echo "dtoverlay=gpio-shutdown,gpio_pin=21" >> "$BOOT_CONFIG"
    echo "dtoverlay=gpio-poweroff,gpiopin=26,active_low=y" >> "$BOOT_CONFIG"
    echo "Safe shutdown overlays added to $BOOT_CONFIG"
    REBOOT_NEEDED=true
  else
    echo "Safe shutdown overlays already configured"
  fi
else
  echo "WARNING: Boot config not found at $BOOT_CONFIG"
fi

# ── Create systemd service for CAN interface ──────────────
SERVICE_FILE="/etc/systemd/system/can0.service"
if [ ! -f "$SERVICE_FILE" ]; then
  cat > "$SERVICE_FILE" << 'EOF'
[Unit]
Description=CAN bus interface can0 (NMEA 2000)
After=network-pre.target
Wants=network-pre.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/sbin/ip link set can0 up type can bitrate 250000
ExecStop=/sbin/ip link set can0 down

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable can0.service
  echo "can0.service created and enabled"

  # Try to start now (will fail if overlay not loaded yet)
  if systemctl start can0.service 2>/dev/null; then
    echo "can0 interface started"
  else
    echo "can0 interface will start after reboot"
    REBOOT_NEEDED=true
  fi
else
  echo "can0.service already exists"
  # Ensure it's enabled
  systemctl enable can0.service 2>/dev/null || true
fi

# ── Rebuild native Node modules if build tools were just installed ──
if [ "$NEED_REBUILD" = true ] && [ -d "node_modules/i2c-bus" ]; then
  echo "Rebuilding native Node modules..."
  npm rebuild i2c-bus 2>&1 || echo "WARNING: npm rebuild failed — IMU may not work"
  echo "Native modules rebuilt"
fi

# ── Report status ─────────────────────────────────────────
if [ "$REBOOT_NEEDED" = true ]; then
  echo "REBOOT_REQUIRED"
fi

echo "SETUP_COMPLETE"
