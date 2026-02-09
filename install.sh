#!/bin/bash
# BigaOS Installer & Updater
# Fresh install:  curl -sSL https://raw.githubusercontent.com/Johannes-Goetz/BigaOS/main/install.sh | bash
# Update:         bash ~/BigaOS/install.sh

set -e

# ── Configuration ──────────────────────────────────────────
GITHUB_REPO="Johannes-Goetz/BigaOS"
INSTALL_DIR="$HOME/BigaOS"
SERVICE_NAME="bigaos"

# ── Safety net: always restart service if it was stopped ───
SERVICE_WAS_STOPPED=false
cleanup_on_failure() {
  if [ "$SERVICE_WAS_STOPPED" = true ]; then
    echo ""
    error "Update failed — restarting BigaOS service..."
    sudo systemctl start "$SERVICE_NAME" 2>/dev/null || true
  fi
}
trap cleanup_on_failure EXIT

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

# ── Detect mode ────────────────────────────────────────────
IS_UPDATE=false
if [ -d "$INSTALL_DIR/server/dist" ]; then
  IS_UPDATE=true
fi

if [ "$IS_UPDATE" = true ]; then
  echo ""
  echo "  BigaOS Updater"
  echo "  ─────────────────"
  echo ""
else
  echo ""
  echo "  BigaOS Installer"
  echo "  ─────────────────"
  echo ""
fi

# ── Check not root ─────────────────────────────────────────
if [ "$EUID" -eq 0 ]; then
  error "Do not run as root. Use a regular user with sudo access."
  exit 1
fi

# ── Fetch latest release info ──────────────────────────────
step "Checking latest release..."
RELEASE_JSON=$(curl -sSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest")
LATEST_TAG=$(echo "$RELEASE_JSON" | grep '"tag_name"' | head -1 | sed 's/.*: "//;s/".*//')
ASSET_URL=$(echo "$RELEASE_JSON" | grep -o '"browser_download_url": "[^"]*\.tar\.gz"' | head -1 | sed 's/.*: "//;s/"//')

if [ -z "$LATEST_TAG" ] || [ -z "$ASSET_URL" ]; then
  error "Could not fetch release info from GitHub."
  error "Check that GITHUB_REPO is set correctly: $GITHUB_REPO"
  exit 1
fi

# ── Check if already up to date ────────────────────────────
if [ "$IS_UPDATE" = true ] && [ -f "$INSTALL_DIR/package.json" ]; then
  CURRENT_VERSION=$(grep '"version"' "$INSTALL_DIR/package.json" | head -1 | sed 's/.*: "//;s/".*//')
  LATEST_VERSION="${LATEST_TAG#v}"
  if [ "$CURRENT_VERSION" = "$LATEST_VERSION" ]; then
    info "Already running the latest version ($CURRENT_VERSION)."
    exit 0
  fi
  info "Updating: v${CURRENT_VERSION} -> ${LATEST_TAG}"
else
  info "Installing ${LATEST_TAG}..."
fi

# ── Install Node.js if missing ─────────────────────────────
if ! command -v node &> /dev/null; then
  step "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  info "Node.js $(node -v) installed"
else
  info "Node.js $(node -v) found"
fi

# ── Stop service if running ────────────────────────────────
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  step "Stopping BigaOS service..."
  sudo systemctl stop "$SERVICE_NAME"
  SERVICE_WAS_STOPPED=true
fi

# ── Download and extract release ───────────────────────────
step "Downloading ${LATEST_TAG}..."
TEMP_DIR=$(mktemp -d)
curl -sSL -o "$TEMP_DIR/release.tar.gz" "$ASSET_URL"
tar xz -C "$TEMP_DIR" -f "$TEMP_DIR/release.tar.gz"
rm "$TEMP_DIR/release.tar.gz"

# ── Install files ──────────────────────────────────────────
step "Installing files..."
mkdir -p "$INSTALL_DIR"

# Preserve user data
if [ -d "$INSTALL_DIR/server/data" ]; then
  cp -r "$INSTALL_DIR/server/data" "$TEMP_DIR/_data_backup"
fi
if [ -d "$INSTALL_DIR/server/src/data" ]; then
  cp -r "$INSTALL_DIR/server/src/data" "$TEMP_DIR/_srcdata_backup"
fi

# Copy release files
cp -r "$TEMP_DIR/server" "$INSTALL_DIR/"
cp -r "$TEMP_DIR/client" "$INSTALL_DIR/"
cp "$TEMP_DIR/package.json" "$INSTALL_DIR/"
cp "$TEMP_DIR/install.sh" "$INSTALL_DIR/" 2>/dev/null || true

# Restore user data
if [ -d "$TEMP_DIR/_data_backup" ]; then
  cp -r "$TEMP_DIR/_data_backup" "$INSTALL_DIR/server/data"
fi
if [ -d "$TEMP_DIR/_srcdata_backup" ]; then
  mkdir -p "$INSTALL_DIR/server/src"
  cp -r "$TEMP_DIR/_srcdata_backup" "$INSTALL_DIR/server/src/data"
fi

# Ensure data directories exist
mkdir -p "$INSTALL_DIR/server/data"
mkdir -p "$INSTALL_DIR/server/src/data"

# ── Install server dependencies ────────────────────────────
step "Installing dependencies..."
cd "$INSTALL_DIR/server"
npm install --production --silent

# ── Create .env if missing ─────────────────────────────────
if [ ! -f "$INSTALL_DIR/server/.env" ]; then
  cat > "$INSTALL_DIR/server/.env" << 'ENVEOF'
NODE_ENV=production
PORT=3000
ENVEOF
  info "Created .env"
fi

# ── Setup systemd service (first install only) ─────────────
if [ "$IS_UPDATE" = false ]; then
  step "Setting up systemd service..."

  NODE_BIN=$(which node)
  sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=BigaOS - Marine Navigation System
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR/server
Environment="NODE_ENV=production"
ExecStart=$NODE_BIN dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bigaos

[Install]
WantedBy=multi-user.target
EOF

  # Allow passwordless restart for the update system
  SUDOERS_LINE="$USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart ${SERVICE_NAME}, /usr/bin/systemctl stop ${SERVICE_NAME}, /usr/bin/systemctl start ${SERVICE_NAME}"
  SUDOERS_FILE="/etc/sudoers.d/bigaos"
  if [ ! -f "$SUDOERS_FILE" ]; then
    echo "$SUDOERS_LINE" | sudo tee "$SUDOERS_FILE" > /dev/null
    sudo chmod 440 "$SUDOERS_FILE"
    info "Sudoers rule created for service management"
  fi

  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE_NAME"
  info "Service created and enabled"
fi

# ── Clean up ───────────────────────────────────────────────
rm -rf "$TEMP_DIR"

# ── Start / Restart ────────────────────────────────────────
# Clear the failure trap — we're about to start intentionally
trap - EXIT
step "Starting BigaOS..."
sudo systemctl daemon-reload
sudo systemctl start "$SERVICE_NAME"

# Wait for server to be ready
for i in $(seq 1 10); do
  if curl -sSf http://localhost:3000/health > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# ── Done ───────────────────────────────────────────────────
echo ""
IP=$(hostname -I | awk '{print $1}')
if [ "$IS_UPDATE" = true ]; then
  info "Updated to ${LATEST_TAG} successfully!"
else
  info "BigaOS ${LATEST_TAG} installed successfully!"
  echo ""
  echo "  Open in your browser:  http://${IP}:3000"
  echo ""
  echo "  Useful commands:"
  echo "    sudo systemctl status bigaos   - Check status"
  echo "    sudo journalctl -u bigaos -f   - View logs"
fi
echo ""
