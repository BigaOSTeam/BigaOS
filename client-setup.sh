#!/bin/bash
# BigaOS Client Setup Script for Raspberry Pi
#
# Sets up a Raspberry Pi as a BigaOS client with:
#   - Chromium kiosk mode (browser auto-starts on boot)
#   - GPIO Agent (controls relay boards via gpiod)
#   - Read-only filesystem (overlay FS for SD card protection)
#
# Tested on: Raspberry Pi OS Lite (Trixie/Bookworm, 64-bit)
#
# Install: curl -sSL https://raw.githubusercontent.com/BigaOSTeam/BigaOS/main/client-setup.sh | bash

set -e

# ── Colors ─────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; }
step()  { echo -e "${CYAN}[>]${NC} $1"; }

GITHUB_REPO="BigaOSTeam/BigaOS"

# ── Header ─────────────────────────────────────────────────
echo ""
echo "  BigaOS Client Setup"
echo "  ─────────────────────"
echo ""
echo "  This script sets up a Raspberry Pi as a BigaOS display"
echo "  with GPIO relay control and kiosk browser mode."
echo ""

# ── Check not root ─────────────────────────────────────────
if [ "$EUID" -eq 0 ]; then
  error "Do not run as root. Use a regular user with sudo access."
  exit 1
fi

# ── Check architecture ─────────────────────────────────────
ARCH=$(uname -m)
if [[ "$ARCH" != "aarch64" && "$ARCH" != "armv7l" ]]; then
  warn "This script is designed for Raspberry Pi (ARM). Detected: $ARCH"
  read -p "  Continue anyway? [y/N] " -n 1 -r < /dev/tty
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# ── Gather configuration ──────────────────────────────────
echo "  Before you begin, open BigaOS on another device and go to:"
echo "    Settings → Clients → Create Client"
echo ""
echo "  This will give you the Client ID and Server Address."
echo ""

# Server address
read -p "  BigaOS Server Address (e.g., 192.168.1.100:3000): " SERVER_ADDRESS < /dev/tty
SERVER_ADDRESS=$(echo "$SERVER_ADDRESS" | sed 's|^https\?://||' | sed 's|/$||')

if [ -z "$SERVER_ADDRESS" ]; then
  error "Server address cannot be empty."
  exit 1
fi

# Validate server connection
step "Checking server connection..."
SERVER_URL="http://${SERVER_ADDRESS}"
if curl -sSf "${SERVER_URL}/health" > /dev/null 2>&1; then
  info "Server is reachable at ${SERVER_URL}"
else
  error "Cannot reach BigaOS server at ${SERVER_URL}/health"
  error "Make sure the server is running and the address is correct."
  exit 1
fi

# Client ID
read -p "  Client ID (from BigaOS Settings → Clients): " CLIENT_ID < /dev/tty

if [ -z "$CLIENT_ID" ]; then
  error "Client ID cannot be empty."
  exit 1
fi

echo ""
info "Configuration:"
echo "    Server:    ${SERVER_URL}"
echo "    Client ID: ${CLIENT_ID}"
echo ""
read -p "  Is this correct? [Y/n] " -n 1 -r < /dev/tty
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
  echo "  Setup cancelled."
  exit 0
fi
echo ""

# ── Install system packages ───────────────────────────────
step "Updating package lists..."
sudo apt-get update -qq

# Install Wayland kiosk packages (labwc + greetd)
step "Installing kiosk display packages..."
sudo apt-get install -y --no-install-recommends labwc seatd greetd wlr-randr
info "Wayland kiosk packages installed"

# Install Chromium
if ! command -v chromium-browser &> /dev/null && ! command -v chromium &> /dev/null; then
  step "Installing Chromium browser..."
  sudo apt-get install -y chromium-browser || sudo apt-get install -y chromium
  info "Chromium installed"
else
  info "Chromium already installed"
fi

# Install Node.js if missing
if ! command -v node &> /dev/null; then
  step "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  info "Node.js $(node -v) installed"
else
  info "Node.js $(node -v) found"
fi

# Install gpiod
if ! command -v gpioset &> /dev/null; then
  step "Installing gpiod tools..."
  sudo apt-get install -y gpiod
  info "gpiod installed"
else
  info "gpiod already installed"
fi

# Install unclutter (hides mouse cursor)
if ! command -v unclutter &> /dev/null; then
  step "Installing unclutter..."
  sudo apt-get install -y unclutter
fi

# Install Plymouth boot splash
if ! command -v plymouth &> /dev/null; then
  step "Installing boot splash..."
  sudo apt-get install -y plymouth plymouth-themes plymouth-label-pango
fi

# Install BigaOS Plymouth theme
step "Installing BigaOS boot animation..."
PLYMOUTH_THEME_DIR="/usr/share/plymouth/themes/bigaos"
sudo mkdir -p "$PLYMOUTH_THEME_DIR"

# Download theme files from repo
THEME_BASE="https://raw.githubusercontent.com/${GITHUB_REPO}/main/boot-theme"
sudo curl -sSL -o "$PLYMOUTH_THEME_DIR/bigaos.plymouth" "$THEME_BASE/bigaos.plymouth"
sudo curl -sSL -o "$PLYMOUTH_THEME_DIR/bigaos.script" "$THEME_BASE/bigaos.script"
sudo curl -sSL -o "$PLYMOUTH_THEME_DIR/logo.png" "$THEME_BASE/logo.png"

# Generate spinner dot asset
curl -sSL "$THEME_BASE/generate-assets.sh" | sudo bash

# Set as default Plymouth theme and rebuild initramfs
sudo plymouth-set-default-theme bigaos
sudo update-initramfs -u
info "BigaOS boot animation installed"

# ── Disable cloud-init (causes boot hang on Trixie) ──────
if [ -d /etc/cloud ] && [ ! -f /etc/cloud/cloud-init.disabled ]; then
  step "Disabling cloud-init (prevents boot hang)..."
  sudo touch /etc/cloud/cloud-init.disabled
  info "cloud-init disabled"
fi

# ── Install GPIO Agent ────────────────────────────────────
AGENT_DIR="$HOME/bigaos-gpio-agent"

step "Downloading GPIO Agent..."
RELEASE_JSON=$(curl -sSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest")
ASSET_URL=$(echo "$RELEASE_JSON" | grep -o '"browser_download_url": "[^"]*\.tar\.gz"' | head -1 | sed 's/.*: "//;s/"//')

if [ -n "$ASSET_URL" ]; then
  TEMP_DIR=$(mktemp -d)
  curl -sSL -o "$TEMP_DIR/release.tar.gz" "$ASSET_URL"
  tar xz -C "$TEMP_DIR" -f "$TEMP_DIR/release.tar.gz"

  # Copy gpio-agent from release
  if [ -d "$TEMP_DIR/gpio-agent" ]; then
    rm -rf "$AGENT_DIR"
    cp -r "$TEMP_DIR/gpio-agent" "$AGENT_DIR"
  fi
  rm -rf "$TEMP_DIR"
else
  warn "Could not fetch release. Creating GPIO agent from scratch..."
  mkdir -p "$AGENT_DIR"
fi

# Install agent dependencies
if [ -f "$AGENT_DIR/package.json" ]; then
  step "Installing GPIO Agent dependencies..."
  cd "$AGENT_DIR"
  npm install --production --silent
  cd -
  info "GPIO Agent installed at $AGENT_DIR"
else
  error "GPIO Agent package.json not found at $AGENT_DIR"
  error "You may need to copy the gpio-agent folder from the BigaOS release manually."
  exit 1
fi

# ── Create GPIO Agent systemd service ─────────────────────
step "Setting up GPIO Agent service..."
NODE_BIN=$(which node)

sudo tee /etc/systemd/system/bigaos-gpio.service > /dev/null << EOF
[Unit]
Description=BigaOS GPIO Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$AGENT_DIR
Environment="BIGAOS_SERVER_URL=${SERVER_URL}"
Environment="BIGAOS_CLIENT_ID=${CLIENT_ID}"
ExecStart=$NODE_BIN $AGENT_DIR/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bigaos-gpio

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable bigaos-gpio
sudo systemctl start bigaos-gpio
info "GPIO Agent service created and started"

# ── Configure greetd (auto-login into labwc) ─────────────
step "Configuring auto-login..."
sudo tee /etc/greetd/config.toml > /dev/null << EOF
[terminal]
vt = 7

[default_session]
command = "/usr/bin/labwc"
user = "$USER"
EOF

# Disable LightDM if present (conflicts with greetd)
sudo systemctl disable lightdm 2>/dev/null || true
sudo rm -f /etc/systemd/system/display-manager.service

sudo systemctl enable greetd
sudo systemctl set-default graphical.target
info "Auto-login configured (greetd -> labwc)"

# ── Boot splash screen ───────────────────────────────────
step "Configuring boot splash..."

# Find the correct cmdline.txt
if [ -f /boot/firmware/cmdline.txt ]; then
  CMDLINE_FILE="/boot/firmware/cmdline.txt"
elif [ -f /boot/cmdline.txt ]; then
  CMDLINE_FILE="/boot/cmdline.txt"
fi

if [ -n "$CMDLINE_FILE" ]; then
  # Add quiet splash if not already present
  if ! grep -q 'quiet' "$CMDLINE_FILE"; then
    sudo sed -i 's/$/ quiet/' "$CMDLINE_FILE"
  fi
  if ! grep -q 'splash' "$CMDLINE_FILE"; then
    sudo sed -i 's/$/ splash/' "$CMDLINE_FILE"
  fi
  # Hide kernel messages and blinking cursor
  if ! grep -q 'loglevel=' "$CMDLINE_FILE"; then
    sudo sed -i 's/$/ loglevel=3/' "$CMDLINE_FILE"
  fi
  if ! grep -q 'vt.global_cursor_default=' "$CMDLINE_FILE"; then
    sudo sed -i 's/$/ vt.global_cursor_default=0/' "$CMDLINE_FILE"
  fi
  info "Boot splash configured"
else
  warn "Could not find cmdline.txt — boot splash not configured"
fi

# ── Screen configuration ─────────────────────────────────
echo ""
echo "  Screen Settings"
echo "  ───────────────"
echo ""
echo "  Screen rotation:"
echo "    0) Normal (landscape)"
echo "    1) 90° clockwise (portrait)"
echo "    2) 180° (inverted landscape)"
echo "    3) 270° clockwise (portrait inverted)"
echo ""
read -p "  Rotation [0]: " -n 1 -r SCREEN_ROTATION < /dev/tty
echo
SCREEN_ROTATION=${SCREEN_ROTATION:-0}

if [[ ! "$SCREEN_ROTATION" =~ ^[0-3]$ ]]; then
  warn "Invalid rotation, using 0 (normal)"
  SCREEN_ROTATION=0
fi

echo ""
echo "  Screen resolution (leave blank for auto-detect):"
echo "    Examples: 1920x1080, 1024x600, 800x480"
echo ""
read -p "  Resolution [auto]: " SCREEN_RESOLUTION < /dev/tty
echo

# ── Set up Chromium kiosk via labwc autostart ─────────────
step "Setting up kiosk mode..."

CHROMIUM_BIN="chromium-browser"
if ! command -v chromium-browser &> /dev/null; then
  CHROMIUM_BIN="chromium"
fi

KIOSK_URL="${SERVER_URL}/c/${CLIENT_ID}"

# Build labwc autostart script
mkdir -p "$HOME/.config/labwc"

AUTOSTART_CONTENT=""

# Screen rotation via wlr-randr
if [ "$SCREEN_ROTATION" != "0" ]; then
  ROTATE_MAP=("normal" "90" "180" "270")
  AUTOSTART_CONTENT+="wlr-randr --transform ${ROTATE_MAP[$SCREEN_ROTATION]} &\nsleep 1\n"
  info "Rotation set to ${ROTATE_MAP[$SCREEN_ROTATION]}"
fi

# Screen resolution via wlr-randr
if [ -n "$SCREEN_RESOLUTION" ]; then
  SCREEN_W=$(echo "$SCREEN_RESOLUTION" | cut -dx -f1)
  SCREEN_H=$(echo "$SCREEN_RESOLUTION" | cut -dx -f2)
  if [ -n "$SCREEN_W" ] && [ -n "$SCREEN_H" ]; then
    AUTOSTART_CONTENT+="wlr-randr --mode ${SCREEN_W}x${SCREEN_H} &\nsleep 1\n"
    info "Resolution set to ${SCREEN_W}x${SCREEN_H}"
  fi
fi

# Hide cursor and launch Chromium kiosk
AUTOSTART_CONTENT+="unclutter -idle 0.5 -root &\n"
AUTOSTART_CONTENT+="sleep 2\n"
AUTOSTART_CONTENT+="${CHROMIUM_BIN} --kiosk --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble --disable-translate --check-for-update-interval=31536000 --password-store=basic \"${KIOSK_URL}\" &\n"

echo -e "$AUTOSTART_CONTENT" > "$HOME/.config/labwc/autostart"
chmod +x "$HOME/.config/labwc/autostart"

info "Kiosk mode configured"
echo "    URL: ${KIOSK_URL}"

# ── Sudoers for service management ────────────────────────
SUDOERS_LINE="$USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart bigaos-gpio, /usr/bin/systemctl stop bigaos-gpio, /usr/bin/systemctl start bigaos-gpio"
SUDOERS_FILE="/etc/sudoers.d/bigaos-client"
if [ ! -f "$SUDOERS_FILE" ]; then
  echo "$SUDOERS_LINE" | sudo tee "$SUDOERS_FILE" > /dev/null
  sudo chmod 440 "$SUDOERS_FILE"
fi

# ── Enable overlay filesystem ─────────────────────────────
echo ""
echo "  ┌──────────────────────────────────────────────────┐"
echo "  │  IMPORTANT: Read-Only Filesystem                 │"
echo "  │                                                  │"
echo "  │  The next step enables the overlay filesystem,   │"
echo "  │  which makes the SD card read-only to protect    │"
echo "  │  it from power loss corruption.                  │"
echo "  │                                                  │"
echo "  │  After reboot, no changes can be written to      │"
echo "  │  the SD card. To make changes later, run:        │"
echo "  │                                                  │"
echo "  │    sudo raspi-config nonint disable_overlayfs    │"
echo "  │    sudo reboot                                   │"
echo "  │                                                  │"
echo "  │  Then make your changes and re-enable:           │"
echo "  │                                                  │"
echo "  │    sudo raspi-config nonint enable_overlayfs     │"
echo "  │    sudo reboot                                   │"
echo "  └──────────────────────────────────────────────────┘"
echo ""
read -p "  Enable read-only filesystem now? [Y/n] " -n 1 -r < /dev/tty
echo

if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  step "Enabling overlay filesystem..."
  sudo raspi-config nonint enable_overlayfs
  info "Overlay filesystem enabled (takes effect after reboot)"
else
  warn "Overlay filesystem NOT enabled. SD card is writable."
  warn "Enable it later with: sudo raspi-config nonint enable_overlayfs"
fi

# ── Done ──────────────────────────────────────────────────
echo ""
echo "  ┌──────────────────────────────────────────────────┐"
echo "  │  Setup Complete!                                 │"
echo "  │                                                  │"
echo "  │  After reboot:                                   │"
echo "  │  • Chromium opens BigaOS in kiosk mode           │"
echo "  │  • GPIO Agent connects to the server             │"
echo "  │  • Relay control is ready                        │"
echo "  │                                                  │"
echo "  │  Useful commands:                                │"
echo "  │  • journalctl -u bigaos-gpio -f   (agent logs)  │"
echo "  │  • systemctl status bigaos-gpio   (agent status) │"
echo "  └──────────────────────────────────────────────────┘"
echo ""
read -p "  Reboot now? [Y/n] " -n 1 -r < /dev/tty
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  sudo reboot
fi
