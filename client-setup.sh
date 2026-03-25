#!/bin/bash
# BigaOS Client Setup Script for Raspberry Pi
#
# Sets up a Raspberry Pi as a BigaOS client with:
#   - Cage kiosk mode (Wayland, boots straight into Chromium)
#   - GPU-accelerated Chromium with touch support
#   - Client Agent (GPIO relay control + display settings via wlr-randr)
#   - Plymouth boot animation (BigaOS branded)
#   - Read-only filesystem (overlay FS for SD card protection)
#
# Tested on: Raspberry Pi OS Lite (Bookworm/Trixie, 64-bit)
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

# ── Detect Debian version ──────────────────────────────────
DEBIAN_VERSION=""
if [ -f /etc/os-release ]; then
  DEBIAN_VERSION=$(. /etc/os-release && echo "$VERSION_CODENAME")
fi
info "Detected OS: ${DEBIAN_VERSION:-unknown}"

# ── Gather configuration ──────────────────────────────────
echo ""
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

# Screen resolution
echo ""
echo "  Screen Settings"
echo "  ───────────────"
echo ""
echo "  Screen resolution (leave blank for auto-detect):"
echo "    Examples: 1920x1080, 1024x800, 800x480"
echo "    Set this if your display shows the wrong resolution."
echo ""
read -p "  Resolution [auto]: " SCREEN_RESOLUTION < /dev/tty
echo

echo ""
info "Configuration:"
echo "    Server:     ${SERVER_URL}"
echo "    Client ID:  ${CLIENT_ID}"
echo "    Resolution: ${SCREEN_RESOLUTION:-auto}"
echo ""
read -p "  Is this correct? [Y/n] " -n 1 -r < /dev/tty
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
  echo "  Setup cancelled."
  exit 0
fi
echo ""

# ── Find boot config paths ────────────────────────────────
if [ -f /boot/firmware/config.txt ]; then
  BOOT_CONFIG="/boot/firmware/config.txt"
  CMDLINE_FILE="/boot/firmware/cmdline.txt"
else
  BOOT_CONFIG="/boot/config.txt"
  CMDLINE_FILE="/boot/cmdline.txt"
fi

# ── Install system packages ───────────────────────────────
step "Updating package lists..."
sudo apt-get update -qq

# Install kiosk packages: cage (Wayland kiosk compositor) + greetd + seatd
step "Installing kiosk display packages..."
sudo apt-get install -y --no-install-recommends cage seatd greetd wlr-randr
info "Kiosk packages installed (cage + greetd + seatd)"

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

# ── Install Plymouth boot animation ──────────────────────
step "Installing Plymouth boot animation..."

# Handle package name differences between Bookworm and Trixie
if apt-cache show plymouth-label &> /dev/null; then
  PLYMOUTH_LABEL_PKG="plymouth-label"
elif apt-cache show plymouth-label-pango &> /dev/null; then
  PLYMOUTH_LABEL_PKG="plymouth-label-pango"
else
  PLYMOUTH_LABEL_PKG=""
fi

sudo apt-get install -y plymouth plymouth-themes $PLYMOUTH_LABEL_PKG || warn "Plymouth install had warnings (non-fatal)"

# Copy BigaOS Plymouth theme
THEME_DIR="/usr/share/plymouth/themes/bigaos"
sudo mkdir -p "$THEME_DIR"

# Download theme assets directly from repo (raw GitHub)
RAW_BASE="https://raw.githubusercontent.com/${GITHUB_REPO}/main/boot-theme"

THEME_INSTALLED=false
TEMP_THEME=$(mktemp -d)
if curl -sSfL -o "$TEMP_THEME/bigaos.plymouth" "$RAW_BASE/bigaos.plymouth" \
   && curl -sSfL -o "$TEMP_THEME/bigaos.script" "$RAW_BASE/bigaos.script" \
   && curl -sSfL -o "$TEMP_THEME/logo.png" "$RAW_BASE/logo.png"; then
  sudo cp "$TEMP_THEME/bigaos.plymouth" "$THEME_DIR/"
  sudo cp "$TEMP_THEME/bigaos.script" "$THEME_DIR/"
  sudo cp "$TEMP_THEME/logo.png" "$THEME_DIR/"
  # Download and run asset generator (creates dot.png)
  if curl -sSfL -o "$TEMP_THEME/generate-assets.sh" "$RAW_BASE/generate-assets.sh"; then
    sudo bash "$TEMP_THEME/generate-assets.sh"
  fi
  THEME_INSTALLED=true
fi
rm -rf "$TEMP_THEME"

if [ "$THEME_INSTALLED" = true ]; then
  sudo plymouth-set-default-theme bigaos 2>/dev/null || true
  sudo update-initramfs -u 2>/dev/null || warn "update-initramfs failed (may need manual run)"
  info "Plymouth BigaOS theme installed"
else
  warn "Could not download boot theme — Plymouth will use default theme"
fi

# ── Disable cloud-init (causes boot hang on Trixie) ──────
if [ -d /etc/cloud ] && [ ! -f /etc/cloud/cloud-init.disabled ]; then
  step "Disabling cloud-init (prevents boot hang)..."
  sudo touch /etc/cloud/cloud-init.disabled
  info "cloud-init disabled"
fi

# ── Install Client Agent ─────────────────────────────────
AGENT_DIR="$HOME/bigaos-agent"

step "Downloading Client Agent..."

# Download agent files directly from repo
AGENT_RAW_BASE="https://raw.githubusercontent.com/${GITHUB_REPO}/main/client-agent"
rm -rf "$AGENT_DIR"
mkdir -p "$AGENT_DIR"

AGENT_INSTALLED=false
if curl -sSfL -o "$AGENT_DIR/package.json" "$AGENT_RAW_BASE/package.json" \
   && curl -sSfL -o "$AGENT_DIR/index.js" "$AGENT_RAW_BASE/index.js" \
   && curl -sSfL -o "$AGENT_DIR/gpio.js" "$AGENT_RAW_BASE/gpio.js" \
   && curl -sSfL -o "$AGENT_DIR/display.js" "$AGENT_RAW_BASE/display.js"; then
  AGENT_INSTALLED=true
fi

if [ "$AGENT_INSTALLED" = false ]; then
  error "Could not download client agent files from GitHub."
  error "Check your internet connection and try again."
  exit 1
fi

# Install agent dependencies
if [ -f "$AGENT_DIR/package.json" ]; then
  step "Installing Client Agent dependencies..."
  cd "$AGENT_DIR"
  npm install --production --silent
  cd - > /dev/null
  info "Client Agent installed at $AGENT_DIR"
else
  error "Agent package.json not found at $AGENT_DIR"
  error "You may need to copy the client-agent folder from the BigaOS release manually."
  exit 1
fi

# ── Create Client Agent systemd service ──────────────────
step "Setting up Client Agent service..."
NODE_BIN=$(which node)

sudo tee /etc/systemd/system/bigaos-agent.service > /dev/null << EOF
[Unit]
Description=BigaOS Client Agent
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
SyslogIdentifier=bigaos-agent

[Install]
WantedBy=multi-user.target
EOF

# Clean up old gpio-agent service if it exists
if systemctl list-unit-files bigaos-gpio.service &>/dev/null; then
  sudo systemctl stop bigaos-gpio 2>/dev/null || true
  sudo systemctl disable bigaos-gpio 2>/dev/null || true
  sudo rm -f /etc/systemd/system/bigaos-gpio.service
fi

sudo systemctl daemon-reload
sudo systemctl enable bigaos-agent
sudo systemctl start bigaos-agent
info "Client Agent service created and started"

# ── Configure GPU and display ────────────────────────────
step "Configuring GPU acceleration..."

# Ensure KMS driver is enabled
if ! grep -q '^dtoverlay=vc4-kms-v3d' "$BOOT_CONFIG" 2>/dev/null; then
  echo "dtoverlay=vc4-kms-v3d" | sudo tee -a "$BOOT_CONFIG" > /dev/null
fi

# Allocate GPU memory for hardware-accelerated rendering
if grep -q '^gpu_mem=' "$BOOT_CONFIG" 2>/dev/null; then
  sudo sed -i 's/^gpu_mem=.*/gpu_mem=256/' "$BOOT_CONFIG"
else
  echo "gpu_mem=256" | sudo tee -a "$BOOT_CONFIG" > /dev/null
fi

# Disable Pi firmware rainbow splash
if ! grep -q '^disable_splash' "$BOOT_CONFIG" 2>/dev/null; then
  echo "disable_splash=1" | sudo tee -a "$BOOT_CONFIG" > /dev/null
fi

# Enable both HDMI ports
if ! grep -q 'hdmi_force_hotplug:0' "$BOOT_CONFIG"; then
  echo "hdmi_force_hotplug:0=1" | sudo tee -a "$BOOT_CONFIG" > /dev/null
  echo "hdmi_force_hotplug:1=1" | sudo tee -a "$BOOT_CONFIG" > /dev/null
fi

# Remove legacy resolution settings (don't work with KMS driver)
sudo sed -i '/^hdmi_group/d; /^hdmi_mode/d; /^hdmi_cvt/d; /^framebuffer_width/d; /^framebuffer_height/d' "$BOOT_CONFIG"

info "GPU configured (vc4-kms-v3d, 256MB GPU memory)"

# ── Set custom resolution via KMS ────────────────────────
if [ -n "$SCREEN_RESOLUTION" ]; then
  step "Setting display resolution to ${SCREEN_RESOLUTION}..."
  CMDLINE=$(cat "$CMDLINE_FILE" | tr -d '\n')

  # Remove any existing video= parameter
  CMDLINE=$(echo "$CMDLINE" | sed 's/ video=[^ ]*//')

  # Add KMS-compatible resolution parameter
  CMDLINE="$CMDLINE video=HDMI-A-1:${SCREEN_RESOLUTION}@60"

  echo "$CMDLINE" | sudo tee "$CMDLINE_FILE" > /dev/null
  info "Resolution set to ${SCREEN_RESOLUTION} via KMS (cmdline.txt)"
fi

# ── Silent boot ──────────────────────────────────────────
step "Configuring silent boot..."

CMDLINE=$(cat "$CMDLINE_FILE" | tr -d '\n')
for PARAM in quiet splash "loglevel=3" "vt.global_cursor_default=0"; do
  if ! echo "$CMDLINE" | grep -q "$PARAM"; then
    CMDLINE="$CMDLINE $PARAM"
  fi
done
echo "$CMDLINE" | sudo tee "$CMDLINE_FILE" > /dev/null
info "Silent boot configured (quiet + splash)"

# ── Configure greetd + cage (kiosk mode) ─────────────────
step "Configuring kiosk mode..."

# Add user to GPU/seat groups required by cage
sudo usermod -aG video,render "$USER"

# Enable seatd (seat management for Wayland)
sudo systemctl enable seatd
sudo systemctl start seatd 2>/dev/null || true

# Detect Chromium binary
CHROMIUM_BIN="chromium-browser"
if ! command -v chromium-browser &> /dev/null; then
  CHROMIUM_BIN="chromium"
fi

KIOSK_URL="${SERVER_URL}/c/${CLIENT_ID}"

# Create kiosk launch script
cat > "$HOME/bigaos-kiosk.sh" << KIOSKEOF
#!/bin/bash
# BigaOS Kiosk Launcher — launched by greetd via cage

# Source display config if saved by client-agent
. "\$HOME/bigaos-display.conf" 2>/dev/null

# Apply saved display settings (after cage starts)
(
  sleep 2
  if [ -n "\$DISPLAY_RESOLUTION" ]; then
    wlr-randr --output HDMI-A-1 --mode "\$DISPLAY_RESOLUTION" 2>/dev/null || true
  fi
  if [ "\$DISPLAY_ROTATION" != "normal" ] && [ -n "\$DISPLAY_ROTATION" ]; then
    wlr-randr --output HDMI-A-1 --transform "\$DISPLAY_ROTATION" 2>/dev/null || true
  fi
  if [ -n "\$DISPLAY_SCALE" ] && [ "\$DISPLAY_SCALE" != "1.0" ] && [ "\$DISPLAY_SCALE" != "1" ]; then
    wlr-randr --output HDMI-A-1 --scale "\$DISPLAY_SCALE" 2>/dev/null || true
  fi
) &

# Launch Chromium with GPU acceleration and touch support
exec ${CHROMIUM_BIN} \\
  --kiosk \\
  --ozone-platform=wayland \\
  --enable-gpu-rasterization \\
  --enable-zero-copy \\
  --ignore-gpu-blocklist \\
  --enable-features=CanvasOopRasterization \\
  --disable-software-rasterizer \\
  --num-raster-threads=4 \\
  --enable-gpu-compositing \\
  --disable-gpu-driver-bug-workarounds \\
  --enable-oop-rasterization \\
  --cursor-style=none \\
  --touch-events=enabled \\
  --noerrdialogs \\
  --disable-infobars \\
  --no-first-run \\
  --disable-session-crashed-bubble \\
  --disable-translate \\
  --check-for-update-interval=31536000 \\
  --password-store=basic \\
  --disk-cache-size=104857600 \\
  "${KIOSK_URL}"
KIOSKEOF
chmod +x "$HOME/bigaos-kiosk.sh"

# Create transparent cursor theme to hide cursor on touchscreens
CURSOR_DIR="$HOME/.icons/transparent/cursors"
mkdir -p "$CURSOR_DIR"
# Generate a 1x1 transparent cursor using printf (no ImageMagick needed)
printf '\x00\x00\x02\x00\x01\x00\x01\x01\x00\x00\x01\x00\x20\x00\x30\x00\x00\x00\x16\x00\x00\x00\x28\x00\x00\x00\x01\x00\x00\x00\x02\x00\x00\x00\x01\x00\x20\x00\x00\x00\x00\x00\x04\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' > "$CURSOR_DIR/default"
for CURSOR_NAME in left_ptr pointer hand2 text xterm watch arrow top_left_arrow; do
  ln -sf default "$CURSOR_DIR/$CURSOR_NAME" 2>/dev/null || true
done
cat > "$HOME/.icons/transparent/cursor.theme" << THEOF
[Icon Theme]
Name=transparent
Comment=Transparent cursor for touchscreens
THEOF

# Set environment for cage (hide cursor, use transparent theme)
mkdir -p "$HOME/.config/environment.d"
cat > "$HOME/.config/environment.d/bigaos.conf" << ENVEOF
WLR_NO_HARDWARE_CURSORS=1
XCURSOR_THEME=transparent
XCURSOR_SIZE=1
ENVEOF

# Configure greetd to launch cage with the kiosk script
sudo tee /etc/greetd/config.toml > /dev/null << EOF
[terminal]
vt = 7

[default_session]
command = "cage -s -- $HOME/bigaos-kiosk.sh"
user = "$USER"
EOF

# Disable LightDM if present (conflicts with greetd)
sudo systemctl disable lightdm 2>/dev/null || true
sudo rm -f /etc/systemd/system/display-manager.service

sudo systemctl enable greetd
sudo systemctl set-default graphical.target
info "Kiosk mode configured (greetd → cage → Chromium)"
echo "    URL: ${KIOSK_URL}"

# ── Sudoers for service management ────────────────────────
SUDOERS_LINE="$USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart bigaos-agent, /usr/bin/systemctl stop bigaos-agent, /usr/bin/systemctl start bigaos-agent"
SUDOERS_FILE="/etc/sudoers.d/bigaos-client"
echo "$SUDOERS_LINE" | sudo tee "$SUDOERS_FILE" > /dev/null
sudo chmod 440 "$SUDOERS_FILE"

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
echo "  │  • GPU-accelerated rendering enabled             │"
echo "  │  • Touch input enabled                           │"
echo "  │  • Client Agent connects to the server           │"
echo "  │  • Relay control is ready                        │"
echo "  │                                                  │"
echo "  │  Display settings (resolution, rotation, zoom)   │"
echo "  │  can be changed from BigaOS Settings → Clients.  │"
echo "  │                                                  │"
echo "  │  Useful commands:                                │"
echo "  │  • journalctl -u bigaos-agent -f  (agent logs)  │"
echo "  │  • systemctl status bigaos-agent  (agent status) │"
echo "  └──────────────────────────────────────────────────┘"
echo ""
read -p "  Reboot now? [Y/n] " -n 1 -r < /dev/tty
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  sudo reboot
fi
