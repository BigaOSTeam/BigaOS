# BigaOS Client Setup Guide

Set up a Raspberry Pi as a BigaOS display client with GPIO relay control and kiosk browser mode. The setup script handles everything: browser kiosk mode, GPIO agent, and read-only filesystem for SD card protection.

## Requirements

### Hardware
- Raspberry Pi 4B or 5
- MicroSD card (8GB+)
- Power supply
- Network connection (WiFi or Ethernet)
- Optional: AZ Delivery 8-Relay Board (or similar relay module)

### Software
- Raspberry Pi OS Lite (64-bit) — flashed on the MicroSD card
- BigaOS server running on another device (or the same Pi)

### Before You Start
- The BigaOS server must be installed and running
- You need SSH access to the Raspberry Pi
- Know the display's resolution and whether it needs to be rotated

---

## Step 1: Flash Raspberry Pi OS

1. Flash **Raspberry Pi OS Lite (64-bit)** using Raspberry Pi Imager
2. In the imager settings:
   - Set hostname (e.g., `bigaos-salon`)
   - Enable SSH
   - Configure WiFi (if not using Ethernet)
   - Set username and password
3. Boot the Pi and SSH into it

> **Note:** You do **not** need to install a desktop environment manually — the setup script handles this automatically.

---

## Step 2: Create a Client in BigaOS

1. Open BigaOS in your browser on any device
2. Go to **Settings** → **Clients**
3. Click **Create Client**
4. Enter a name for this Pi (e.g., "Salon Display")
5. After creation, you'll see:
   - **Client ID** — a UUID like `a1b2c3d4-e5f6-...`
   - **Server Address** — like `192.168.1.100:3000`
6. Keep these values ready — you'll need them in the next step

---

## Step 3: Run the Setup Script

SSH into the Raspberry Pi and run:

```bash
curl -sSL https://raw.githubusercontent.com/BigaOSTeam/BigaOS/main/client-setup.sh | bash
```

The script will prompt you for:
1. **Server Address** — the IP:port from Step 2 (e.g., `192.168.1.100:3000`)
2. **Client ID** — the UUID from Step 2
3. **Screen Rotation** — 0 (normal), 1 (90°), 2 (180°), or 3 (270°)
4. **Screen Resolution** — e.g., `1920x1080`, `1024x600`, or leave blank for auto-detect

### What the Script Does

1. **Installs a desktop environment** — uses Raspberry Pi's recommended desktop, falls back to LXDE
2. **Installs Node.js 20 LTS** (if not already installed)
3. **Installs gpiod** — GPIO control tools (works on both RPi 4B and 5)
4. **Installs Chromium** — for kiosk browser mode
5. **Downloads and installs the GPIO Agent** — a lightweight Node.js process that controls relay boards
6. **Creates a systemd service** (`bigaos-gpio`) — auto-starts the GPIO agent on boot
7. **Enables desktop autologin** — boots straight to the desktop without requiring login
8. **Configures screen rotation and resolution** — applies settings via `config.txt` and `wlr-randr` (Wayland)
9. **Configures Chromium kiosk mode** — auto-starts the browser pointed at BigaOS on boot
10. **Disables screen blanking** — keeps the display always on, hides the mouse cursor
11. **Enables overlay filesystem** (optional) — makes the SD card read-only for protection against power loss

After the script completes, it will prompt you to reboot.

---

## Step 4: Reboot and Verify

After reboot, the Pi will:
- Automatically start Chromium in kiosk mode, showing BigaOS
- Automatically start the GPIO Agent, connecting to your server

### Verify the GPIO Agent

```bash
# Check agent status
systemctl status bigaos-gpio

# View agent logs
journalctl -u bigaos-gpio -f
```

You should see:
```
[Agent] Connected to server (socket: ...)
[Agent] Received gpio_init with N switch(es)
```

---

## Configuring Switches

Once the client Pi is set up and connected:

1. Go to **Settings** → **Switches** in BigaOS (from any client)
2. Click **Add Switch**
3. Configure:
   - **Name**: e.g., "Navigation Lights"
   - **Icon**: choose from the icon picker
   - **Target Device**: select the Pi you just set up
   - **Device Type**: Raspberry Pi 4B or 5
   - **GPIO Pin**: the BCM pin number your relay is connected to (2-27)
   - **Relay Type**:
     - *Normally Off* — relay resets to OFF when power is lost
     - *Normally On* — relay resets to ON when power is lost
4. Save the switch

### Add to Dashboard

1. Enter edit mode on the dashboard (pencil icon)
2. Click **+** to add a new item
3. Select **Switch**
4. Click the gear icon on the new item to bind it to a switch and choose a color
5. Exit edit mode

Now you can tap the switch widget to toggle the relay on/off from any client.

---

## Wiring the Relay Board

### AZ Delivery 8-Relay Board

Connect the relay board to the Pi's GPIO header:

| Relay Pin | Pi Pin | Description |
|-----------|--------|-------------|
| VCC       | 5V (Pin 2 or 4) | Power |
| GND       | GND (Pin 6, 9, 14, 20, 25, 30, 34, 39) | Ground |
| IN1       | GPIO pin of your choice | Relay 1 control |
| IN2       | GPIO pin of your choice | Relay 2 control |
| ...       | ...    | ... |

**Important notes:**
- Most relay boards are **active LOW** — the relay turns ON when the GPIO pin goes LOW
- Use BCM pin numbering (not physical pin numbers) when configuring switches in BigaOS
- Available GPIO pins: BCM 2-27
- Don't use pins already assigned to other functions (I2C, SPI, UART) unless you've disabled those interfaces

### BCM Pin Reference

| BCM | Physical | BCM | Physical |
|-----|----------|-----|----------|
| 2   | 3        | 3   | 5        |
| 4   | 7        | 17  | 11       |
| 27  | 13       | 22  | 15       |
| 10  | 19       | 9   | 21       |
| 11  | 23       | 5   | 29       |
| 6   | 31       | 13  | 33       |
| 19  | 35       | 26  | 37       |
| 14  | 8        | 15  | 10       |
| 18  | 12       | 23  | 16       |
| 24  | 18       | 25  | 22       |
| 8   | 24       | 7   | 26       |
| 12  | 32       | 16  | 36       |
| 20  | 38       | 21  | 40       |

---

## Troubleshooting

### GPIO Agent won't connect
- Check the server is reachable: `curl http://<server-ip>:3000/health`
- Check the Client ID matches: `journalctl -u bigaos-gpio -f`
- Check the service env vars: `systemctl show bigaos-gpio | grep Environment`

### Display is blank after reboot
- Check desktop autologin is enabled: `sudo raspi-config nonint get_boot_cli` (should return `1`)
- Check LightDM is running: `systemctl status lightdm`
- If desktop is missing, re-run the setup script — it will install one automatically

### Browser doesn't start in kiosk mode
- Check autostart file exists: `cat ~/.config/autostart/bigaos-kiosk.desktop`
- Check display manager is running: `systemctl status lightdm`
- Check Chromium is installed: `which chromium-browser || which chromium`

### Screen rotation or resolution is wrong
- Re-run the setup script to reconfigure, or edit manually:
  - **Wayland (labwc):** `wlr-randr --transform 90` / `wlr-randr --mode 1920x1080`
  - **config.txt:** `sudo nano /boot/firmware/config.txt` (look for `framebuffer_width`, `framebuffer_height`)

### Need to make changes (filesystem is read-only)
```bash
# Disable overlay filesystem
sudo raspi-config nonint disable_overlayfs
sudo reboot

# Make your changes...

# Re-enable overlay filesystem
sudo raspi-config nonint enable_overlayfs
sudo reboot
```

### Relay doesn't switch
- Test GPIO directly: `gpioset gpiochip0 17=1` (RPi 4B) or `gpioset gpiochip4 17=1` (RPi 5)
- Check wiring: relay board VCC, GND, and signal pins
- Check `journalctl -u bigaos-gpio -f` for errors during toggle
- Verify the correct BCM pin number in BigaOS settings

### Update the GPIO Agent
```bash
# Disable read-only first
sudo raspi-config nonint disable_overlayfs && sudo reboot

# After reboot, re-run the setup script
curl -sSL https://raw.githubusercontent.com/BigaOSTeam/BigaOS/main/client-setup.sh | bash
```
