# BigaOS Client Setup Guide

Set up a Raspberry Pi as a BigaOS display client with GPIO relay control, kiosk browser mode, and remote display control. The setup script handles everything automatically.

## Requirements

### Hardware
- Raspberry Pi 4B or 5
- MicroSD card (8GB+)
- Power supply
- Network connection (WiFi or Ethernet)
- HDMI display (touchscreen supported via USB)
- Optional: AZ Delivery 8-Relay Board (or similar relay module)

### Software
- Raspberry Pi OS Desktop (64-bit) — flashed on the MicroSD card
- BigaOS server running on another device (or the same Pi)

### Before You Start
- The BigaOS server must be installed and running
- You need SSH access to the Raspberry Pi

---

## Step 1: Flash Raspberry Pi OS

1. Flash **Raspberry Pi OS Desktop (64-bit)** using Raspberry Pi Imager
2. In the imager settings:
   - Set hostname (e.g., `bigaos-salon`)
   - Enable SSH
   - Configure WiFi (if not using Ethernet)
   - Set username and password
3. Boot the Pi and SSH into it

> **Note:** Use the full Desktop version, not Lite. The setup script configures the desktop as a kiosk automatically.

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
3. **Screen Resolution** — e.g., `1024x800`, `1920x1080`, or leave blank for auto-detect

### What the Script Does

1. **Installs cage** — a minimal Wayland kiosk compositor (single-app, no desktop)
2. **Installs Chromium** — with GPU acceleration and touch support
3. **Installs Node.js 20 LTS** (if not already installed)
4. **Installs gpiod** — GPIO control tools (works on both RPi 4B and 5)
5. **Installs Plymouth** — boot animation with BigaOS branding
6. **Downloads the Client Agent** — controls GPIO relays and display settings
7. **Creates a systemd service** (`bigaos-agent`) — auto-starts the agent on boot
8. **Configures greetd** — auto-login directly into cage kiosk
9. **Configures GPU** — enables `vc4-kms-v3d` driver with 256MB GPU memory
10. **Sets screen resolution** — via KMS `video=` parameter in cmdline.txt
11. **Enables overlay filesystem** (optional) — makes the SD card read-only

After the script completes, it will prompt you to reboot.

---

## Step 4: Reboot and Verify

After reboot, the Pi will:
- Show the BigaOS boot animation
- Automatically start Chromium in kiosk mode, showing BigaOS
- Automatically start the Client Agent, connecting to your server

### Verify the Client Agent

```bash
# Check agent status
systemctl status bigaos-agent

# View agent logs
journalctl -u bigaos-agent -f
```

You should see:
```
[Agent] Connected to server (socket: ...)
[Agent] Received gpio_init with N switch(es)
```

---

## Display Settings

Resolution, rotation, and zoom can be changed directly from the BigaOS web UI — no SSH required.

1. Open **Settings** on the Pi client (the Display tab only appears on Pi clients with a connected agent)
2. Go to the **Display** tab
3. Change:
   - **Resolution** — dropdown of available modes detected from the display
   - **Rotation** — Normal, 90°, 180°, 270°
   - **Zoom** — scale factor (1.0 = 100%, 1.5 = 150%, etc.)
4. Click **Apply**

Settings are persisted and survive reboots.

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

### Client Agent won't connect
- Check the server is reachable: `curl http://<server-ip>:3000/health`
- Check the Client ID matches: `journalctl -u bigaos-agent -f`
- Check the service env vars: `systemctl show bigaos-agent | grep Environment`

### Display is blank after reboot
- Check greetd is running: `systemctl status greetd`
- Check cage is launching: `journalctl -u greetd -f`
- Check Chromium is installed: `which chromium-browser || which chromium`

### Browser is slow or laggy
- Verify GPU acceleration: navigate to `chrome://gpu` in Chromium
- "Rasterization" and "Compositing" should show "Hardware accelerated"
- Check `gpu_mem=256` is in `/boot/firmware/config.txt`
- Check `dtoverlay=vc4-kms-v3d` is in `/boot/firmware/config.txt`

### Screen resolution is wrong
- Resolution can be changed from **Settings → Display** in the BigaOS UI
- Or manually: `wlr-randr --output HDMI-A-1 --mode 1024x800`
- For boot-time resolution, check `video=HDMI-A-1:1024x800@60` is in cmdline.txt

### Touch not working
- USB touchscreens should work automatically via libinput
- Check `dmesg | grep -i touch` for device detection
- Ensure `--touch-events=enabled` is in the Chromium flags

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
- Check `journalctl -u bigaos-agent -f` for errors during toggle
- Verify the correct BCM pin number in BigaOS settings

### Update the Client Agent
```bash
# Disable read-only first
sudo raspi-config nonint disable_overlayfs && sudo reboot

# After reboot, re-run the setup script
curl -sSL https://raw.githubusercontent.com/BigaOSTeam/BigaOS/main/client-setup.sh | bash
```
