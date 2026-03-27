#!/bin/bash
# BigaOS Client Setup Script for Raspberry Pi
#
# Sets up a Raspberry Pi as a BigaOS client with:
#   - Desktop kiosk mode (autologin → Chromium fullscreen, no desktop visible)
#   - GPU-accelerated Chromium via Pi's native compositor
#   - Client Agent (GPIO relay control + display settings)
#   - Plymouth boot animation (BigaOS branded)
#   - Read-only filesystem (overlay FS for SD card protection)
#
# Requires: Raspberry Pi OS Desktop (Bookworm/Trixie, 64-bit)
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
echo "  Requires: Raspberry Pi OS Desktop (64-bit)"
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
echo "    Examples: 1920x1080, 1024x600, 800x480"
echo "    Set this if your display shows the wrong resolution."
echo ""
read -p "  Resolution [auto]: " SCREEN_RESOLUTION < /dev/tty
echo

# Screen rotation
echo "  Screen rotation:"
echo "    0 = normal (default)"
echo "    90 = rotated 90° clockwise"
echo "    180 = upside down"
echo "    270 = rotated 270° clockwise"
echo ""
read -p "  Rotation [0]: " SCREEN_ROTATION < /dev/tty
SCREEN_ROTATION=${SCREEN_ROTATION:-0}
echo

# Display scale
echo "  Display scale (makes everything larger or smaller):"
echo "    1.0 = normal (default)"
echo "    1.2 = 120% (recommended for small screens)"
echo "    1.5 = 150% (wide screens only)"
echo "    0.8 = 80% (fit more on screen)"
echo "    Note: max usable scale depends on screen width"
echo ""
read -p "  Scale [1.0]: " SCREEN_SCALE < /dev/tty
SCREEN_SCALE=${SCREEN_SCALE:-1.0}
echo

# Disable WiFi/Bluetooth
echo "  Disable WiFi and Bluetooth? (saves power, reduces interference)"
echo "    Only do this if using ethernet."
echo ""
read -p "  Disable WiFi/Bluetooth? [y/N] " -n 1 -r DISABLE_WIRELESS < /dev/tty
echo
echo

echo ""
info "Configuration:"
echo "    Server:     ${SERVER_URL}"
echo "    Client ID:  ${CLIENT_ID}"
echo "    Resolution: ${SCREEN_RESOLUTION:-auto}"
echo "    Rotation:   ${SCREEN_ROTATION}°"
echo "    Scale:      ${SCREEN_SCALE}x"
echo "    Wireless:   $([[ $DISABLE_WIRELESS =~ ^[Yy]$ ]] && echo "disabled" || echo "enabled")"
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
step "Updating system packages..."
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -o Dpkg::Options::="--force-confold"

# Install wlr-randr for display control (resolution/rotation)
if ! command -v wlr-randr &> /dev/null; then
  step "Installing wlr-randr..."
  sudo apt-get install -y wlr-randr
  info "wlr-randr installed"
else
  info "wlr-randr already installed"
fi

# Chromium should already be installed on full RPi OS
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
Environment="XDG_RUNTIME_DIR=/run/user/$(id -u)"
Environment="WAYLAND_DISPLAY=wayland-0"
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

# ── Disable WiFi/Bluetooth if requested ───────────────────
sudo sed -i '/^dtoverlay=disable-wifi/d; /^dtoverlay=disable-bt/d' "$BOOT_CONFIG"
if [[ $DISABLE_WIRELESS =~ ^[Yy]$ ]]; then
  step "Disabling WiFi and Bluetooth..."
  echo "dtoverlay=disable-wifi" | sudo tee -a "$BOOT_CONFIG" > /dev/null
  echo "dtoverlay=disable-bt" | sudo tee -a "$BOOT_CONFIG" > /dev/null
  sudo systemctl disable --now hciuart 2>/dev/null || true
  info "WiFi and Bluetooth disabled (saves ~2W, reduces interference)"
fi

# Clean previous resolution settings (re-added below if needed)
sudo sed -i '/^hdmi_group/d; /^hdmi_mode/d; /^hdmi_cvt/d; /^hdmi_drive/d; /^framebuffer_width/d; /^framebuffer_height/d' "$BOOT_CONFIG"

# Auto-detect which HDMI port has a display connected
# Pi 4 config.txt uses 0-based port index: HDMI-A-1 → :0, HDMI-A-2 → :1
HDMI_SUFFIX=""
HDMI_PORT=""
for STATUS_FILE in /sys/class/drm/card*-HDMI-A-*/status; do
  if [ -f "$STATUS_FILE" ] && [ "$(cat "$STATUS_FILE")" = "connected" ]; then
    PORT_NAME=$(basename "$(dirname "$STATUS_FILE")")
    PORT_NUM=$(echo "$PORT_NAME" | grep -oP 'HDMI-A-\K\d+')
    HDMI_SUFFIX=":$((PORT_NUM - 1))"
    HDMI_PORT="HDMI-A-${PORT_NUM}"
    break
  fi
done
HDMI_PORT=${HDMI_PORT:-HDMI-A-1}

if [ -n "$HDMI_SUFFIX" ]; then
  info "Detected display on ${HDMI_PORT}"
else
  warn "Could not detect HDMI port, using default (HDMI-A-1)"
fi

# ── Set display resolution ───────────────────────────────
if [ -n "$SCREEN_RESOLUTION" ]; then
  # Custom resolution — use fkms + hdmi_cvt so non-standard modes
  # like 1024x600 or 800x480 work (KMS doesn't support them natively)
  step "Setting display resolution to ${SCREEN_RESOLUTION}..."

  RES_W=$(echo "$SCREEN_RESOLUTION" | cut -d'x' -f1)
  RES_H=$(echo "$SCREEN_RESOLUTION" | cut -d'x' -f2)

  # Switch to fkms (firmware handles display setup, supports custom modes)
  sudo sed -i 's/^dtoverlay=vc4-kms-v3d/dtoverlay=vc4-fkms-v3d/' "$BOOT_CONFIG"
  if ! grep -q '^dtoverlay=vc4-fkms-v3d' "$BOOT_CONFIG" 2>/dev/null; then
    echo "dtoverlay=vc4-fkms-v3d" | sudo tee -a "$BOOT_CONFIG" > /dev/null
  fi

  # Add custom HDMI mode via hdmi_cvt for the detected port
  cat << HDMIEOF | sudo tee -a "$BOOT_CONFIG" > /dev/null
hdmi_group${HDMI_SUFFIX}=2
hdmi_mode${HDMI_SUFFIX}=87
hdmi_cvt${HDMI_SUFFIX}=${RES_W} ${RES_H} 60 3 0 0 0
hdmi_drive${HDMI_SUFFIX}=2
HDMIEOF

  # Remove any video= params from cmdline (fkms handles resolution via config.txt)
  CMDLINE=$(cat "$CMDLINE_FILE" | tr -d '\n')
  CMDLINE=$(echo "$CMDLINE" | sed 's/ video=[^ ]*//g')
  echo "$CMDLINE" | sudo tee "$CMDLINE_FILE" > /dev/null

  info "Resolution set to ${SCREEN_RESOLUTION} via fkms + hdmi_cvt"
else
  # Auto-detect — use KMS driver (modern, handles EDID natively)
  if grep -q '^dtoverlay=vc4-fkms-v3d' "$BOOT_CONFIG" 2>/dev/null; then
    sudo sed -i 's/^dtoverlay=vc4-fkms-v3d/dtoverlay=vc4-kms-v3d/' "$BOOT_CONFIG"
  elif ! grep -q '^dtoverlay=vc4-kms-v3d' "$BOOT_CONFIG" 2>/dev/null; then
    echo "dtoverlay=vc4-kms-v3d" | sudo tee -a "$BOOT_CONFIG" > /dev/null
  fi
  info "GPU configured (vc4-kms-v3d, 256MB GPU memory, auto-detect resolution)"
fi

# ── Silent boot ──────────────────────────────────────────
step "Configuring silent boot..."

CMDLINE=$(cat "$CMDLINE_FILE" | tr -d '\n')
for PARAM in quiet splash "loglevel=3" "vt.global_cursor_default=0" "plymouth.ignore-serial-consoles"; do
  if ! echo "$CMDLINE" | grep -q "$PARAM"; then
    CMDLINE="$CMDLINE $PARAM"
  fi
done
echo "$CMDLINE" | sudo tee "$CMDLINE_FILE" > /dev/null
info "Silent boot configured (quiet + splash)"

# ── Boot display rotation (Plymouth) ─────────────────────
# Set panel_orientation on the DRM connector so Plymouth renders rotated
CMDLINE=$(cat "$CMDLINE_FILE" | tr -d '\n')
CMDLINE=$(echo "$CMDLINE" | sed "s/ video=${HDMI_PORT}:[^ ]*//g")

if [ "$SCREEN_ROTATION" != "0" ]; then
  case "$SCREEN_ROTATION" in
    90)  PANEL_ORIENT="left_side_up" ;;
    180) PANEL_ORIENT="upside_down" ;;
    270) PANEL_ORIENT="right_side_up" ;;
  esac

  CMDLINE="$CMDLINE video=${HDMI_PORT}:panel_orientation=${PANEL_ORIENT}"
  echo "$CMDLINE" | sudo tee "$CMDLINE_FILE" > /dev/null
  info "Boot rotation set (panel_orientation=${PANEL_ORIENT} on ${HDMI_PORT})"
else
  echo "$CMDLINE" | sudo tee "$CMDLINE_FILE" > /dev/null
fi

# ── Configure kiosk mode ──────────────────────────────────
step "Configuring kiosk mode..."

# Detect Chromium binary
CHROMIUM_BIN="chromium-browser"
if ! command -v chromium-browser &> /dev/null; then
  CHROMIUM_BIN="chromium"
fi

KIOSK_URL="${SERVER_URL}/c/${CLIENT_ID}"

# Install packages for bare kiosk (no desktop environment)
if ! command -v unclutter &> /dev/null; then
  sudo apt-get install -y unclutter
fi
if ! command -v swaybg &> /dev/null; then
  sudo apt-get install -y swaybg 2>/dev/null || true
fi

# Create the kiosk launcher script
cat > "$HOME/bigaos-kiosk.sh" << 'KIOSKEOF'
#!/bin/bash
# BigaOS Kiosk Launcher — runs as labwc startup command

# Source display config
. "$HOME/bigaos-display.conf" 2>/dev/null

# Auto-detect connected output name
sleep 0.5
OUTPUT=$(wlr-randr 2>/dev/null | grep -oP '^\S+' | head -1)
OUTPUT=${OUTPUT:-HDMI-A-1}

# Apply saved display settings
if [ -n "$DISPLAY_RESOLUTION" ]; then
  wlr-randr --output "$OUTPUT" --mode "$DISPLAY_RESOLUTION" 2>/dev/null || true
fi
if [ "$DISPLAY_ROTATION" != "normal" ] && [ -n "$DISPLAY_ROTATION" ]; then
  wlr-randr --output "$OUTPUT" --transform "$DISPLAY_ROTATION" 2>/dev/null || true
fi
# Reset compositor scale (only Chromium handles zoom)
wlr-randr --output "$OUTPUT" --scale 1 2>/dev/null || true
SCALE=${DISPLAY_SCALE:-1.0}

KIOSKEOF

# Append Chromium launch with the actual URL (not single-quoted)
cat >> "$HOME/bigaos-kiosk.sh" << KIOSKEOF
# Launch Chromium (background so we can dismiss Plymouth after)
${CHROMIUM_BIN} \\
  --kiosk \\
  --start-fullscreen \\
  --ozone-platform=wayland \\
  --enable-gpu-rasterization \\
  --enable-zero-copy \\
  --ignore-gpu-blocklist \\
  --enable-features=CanvasOopRasterization,TouchpadOverscrollHistoryNavigation \\
  --num-raster-threads=4 \\
  --enable-gpu-compositing \\
  --touch-events=enabled \\
  --noerrdialogs \\
  --disable-infobars \\
  --no-first-run \\
  --disable-session-crashed-bubble \\
  --disable-translate \\
  --check-for-update-interval=31536000 \\
  --password-store=basic \\
  --disk-cache-size=104857600 \\
  --force-device-scale-factor=\$SCALE \\
  "${KIOSK_URL}" &

# Dismiss boot splash after Chromium has had time to render
sleep 3
plymouth quit --retain-splash 2>/dev/null
wait
KIOSKEOF
chmod +x "$HOME/bigaos-kiosk.sh"

# labwc autostart — bare minimum: black background + kiosk
mkdir -p "$HOME/.config/labwc"
cat > "$HOME/.config/labwc/autostart" << 'LABWCEOF'
swaybg -c '#000000' &
unclutter -idle 0.1 -root &
/home/$USER/bigaos-kiosk.sh &
LABWCEOF
# Fix $USER in the autostart file (written inside single-quoted heredoc)
sed -i "s|\$USER|$USER|g" "$HOME/.config/labwc/autostart"

# ── Set up greetd for direct kiosk boot (no desktop) ─────
# greetd auto-logs in and starts labwc directly — no desktop environment,
# no panels, no file manager, no XDG autostart processing
step "Configuring greetd (direct boot to kiosk)..."

if ! command -v greetd &> /dev/null; then
  sudo apt-get install -y greetd 2>/dev/null || true
fi

if command -v greetd &> /dev/null; then
  # Disable any existing display manager
  sudo systemctl disable lightdm 2>/dev/null || true
  sudo systemctl disable gdm 2>/dev/null || true

  # Boot to multi-user (no graphical.target desktop session)
  sudo systemctl set-default multi-user.target

  # Configure greetd: autologin → labwc (bare compositor)
  sudo mkdir -p /etc/greetd
  sudo tee /etc/greetd/config.toml > /dev/null << EOF
[terminal]
vt = 7

[default_session]
command = "labwc"
user = "$USER"
EOF

  sudo systemctl enable greetd
  info "greetd configured (autologin → labwc → Chromium kiosk)"
else
  # Fallback for Bookworm where greetd may not be in repos:
  # Use a systemd service to launch labwc directly
  warn "greetd not available — using systemd service fallback"

  sudo tee /etc/systemd/system/bigaos-kiosk.service > /dev/null << EOF
[Unit]
Description=BigaOS Kiosk
After=systemd-user-sessions.service plymouth-start.service
Conflicts=getty@tty7.service

[Service]
Type=simple
User=$USER
PAMName=login
TTYPath=/dev/tty7
Environment=XDG_SESSION_TYPE=wayland
Environment=XDG_RUNTIME_DIR=/run/user/$(id -u)
Environment=WLR_LIBINPUT_NO_DEVICES=1
ExecStart=/usr/bin/labwc
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

  # Disable desktop autologin, enable kiosk service
  sudo raspi-config nonint do_boot_behaviour B1 2>/dev/null || true
  sudo systemctl set-default multi-user.target
  sudo systemctl disable lightdm 2>/dev/null || true
  sudo systemctl enable bigaos-kiosk
  info "Systemd kiosk service configured (labwc → Chromium kiosk)"
fi

# ── Write initial display config ─────────────────────────
# Map rotation degrees to wlr-randr transform name
case "$SCREEN_ROTATION" in
  90)  WLR_TRANSFORM="90"  ;;
  180) WLR_TRANSFORM="180" ;;
  270) WLR_TRANSFORM="270" ;;
  *)   WLR_TRANSFORM="normal" ;;
esac

cat > "$HOME/bigaos-display.conf" << EOF
DISPLAY_ROTATION=$WLR_TRANSFORM
DISPLAY_SCALE=$SCREEN_SCALE
EOF

cat > "$HOME/bigaos-display.json" << EOF
{
  "resolution": "",
  "rotation": "$WLR_TRANSFORM",
  "scale": $SCREEN_SCALE
}
EOF
info "Display config written (rotation: ${WLR_TRANSFORM}, scale: ${SCREEN_SCALE}x)"

# ── Configure touchscreen ─────────────────────────────────
# Auto-detect USB touchscreen device
TOUCH_DEVICE=$(libinput list-devices 2>/dev/null | awk '/^Device:/{name=$0} /Capabilities:.*touch/{print name; exit}' | sed 's/^Device: *//')

# Detect compositor (labwc = Trixie, wayfire = Bookworm)
COMPOSITOR=""
if command -v labwc &> /dev/null; then
  COMPOSITOR="labwc"
elif command -v wayfire &> /dev/null; then
  COMPOSITOR="wayfire"
fi

if [ -n "$TOUCH_DEVICE" ]; then
  step "Configuring touchscreen: ${TOUCH_DEVICE}"

  # Escape device name for XML (handle special chars)
  TOUCH_DEVICE_XML=$(echo "$TOUCH_DEVICE" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g')

  # Use HDMI port detected earlier
  TOUCH_OUTPUT="$HDMI_PORT"

  # Map rotation to libinput calibration matrix
  case "$SCREEN_ROTATION" in
    90)  CAL_MATRIX="0 -1 1 1 0 0 0 0 1" ;;
    180) CAL_MATRIX="-1 0 1 0 -1 1 0 0 1" ;;
    270) CAL_MATRIX="0 1 0 -1 0 1 0 0 1" ;;
    *)   CAL_MATRIX="" ;;
  esac

  if [ "$COMPOSITOR" = "labwc" ]; then
    # Write labwc rc.xml with touch mapping and calibration
    if [ -n "$CAL_MATRIX" ]; then
      cat > "$HOME/.config/labwc/rc.xml" << RCEOF
<?xml version="1.0"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
        <touch deviceName="${TOUCH_DEVICE_XML}" mapToOutput="${TOUCH_OUTPUT}" mouseEmulation="no"/>
        <libinput>
                <device deviceName="${TOUCH_DEVICE_XML}">
                        <calibrationMatrix>${CAL_MATRIX}</calibrationMatrix>
                </device>
        </libinput>
</openbox_config>
RCEOF
    else
      cat > "$HOME/.config/labwc/rc.xml" << RCEOF
<?xml version="1.0"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
        <touch deviceName="${TOUCH_DEVICE_XML}" mapToOutput="${TOUCH_OUTPUT}" mouseEmulation="no"/>
</openbox_config>
RCEOF
    fi
    info "Touchscreen configured for labwc (device: ${TOUCH_DEVICE}, output: ${TOUCH_OUTPUT}, rotation: ${SCREEN_ROTATION}°)"

  elif [ "$COMPOSITOR" = "wayfire" ]; then
    # Wayfire uses libinput plugin in wayfire.ini for touch calibration
    WAYFIRE_INI="$HOME/.config/wayfire.ini"
    if [ -f "$WAYFIRE_INI" ]; then
      # Remove existing touch calibration section if present
      sed -i '/^\[QDTECH\|^\[touchscreen\|^\[libinput:/d' "$WAYFIRE_INI" 2>/dev/null || true
      # Add touch device config
      cat >> "$WAYFIRE_INI" << WFEOF

[libinput:${TOUCH_DEVICE}]
output = ${TOUCH_OUTPUT}
WFEOF
      if [ -n "$CAL_MATRIX" ]; then
        echo "calibration_matrix = ${CAL_MATRIX}" >> "$WAYFIRE_INI"
      fi
      info "Touchscreen configured for wayfire (device: ${TOUCH_DEVICE}, output: ${TOUCH_OUTPUT}, rotation: ${SCREEN_ROTATION}°)"
    else
      warn "wayfire.ini not found — touch calibration not applied"
    fi
  else
    warn "Unknown compositor — touch calibration not applied"
  fi
else
  warn "No touchscreen detected — skipping touch configuration"
fi

info "Kiosk mode configured (greetd → labwc → Chromium fullscreen)"
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
echo "  │  • Boots directly to Chromium (no desktop)        │"
echo "  │  • GPU acceleration via Pi's native compositor   │"
echo "  │  • Touch input enabled, cursor hidden            │"
echo "  │  • Client Agent connects to the server           │"
echo "  │  • Relay control is ready                        │"
echo "  │                                                  │"
echo "  │  Display settings (resolution, rotation, zoom)   │"
echo "  │  can be changed from BigaOS Settings → Display.  │"
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
