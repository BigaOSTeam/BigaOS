# BigaOS Installation Guide

Complete guide for installing BigaOS on a Raspberry Pi. Covers initial OS setup, optional NVMe boot, and BigaOS installation.

## Requirements

### Hardware
- Raspberry Pi 4 or 5 (RPi 5 recommended)
- MicroSD card (16GB+ recommended)
- Ethernet cable or WiFi connection
- Power supply (official RPi USB-C PSU recommended)

### Optional Hardware
- NVMe SSD + M.2 HAT/base board (for faster storage and more space)
- MacArthur HAT (for NMEA 2000 connectivity)

### Software
- [Raspberry Pi Imager](https://www.raspberrypi.com/software/) (on your PC)
- SSH client (built into Windows 10+, macOS, Linux)

---

## Step 1: Flash Raspberry Pi OS

1. Insert your **MicroSD card** into your PC
2. Open **Raspberry Pi Imager**
3. Choose device: **Raspberry Pi 5** (or your model)
4. Choose OS: **Raspberry Pi OS Lite (64-bit)** (under "Raspberry Pi OS (other)")
5. Choose storage: your MicroSD card
6. Click the **gear icon** (or "Edit Settings") and configure:
   - **Hostname:** `bigaos`
   - **Enable SSH:** Yes (password authentication)
   - **Username:** `bigaos` (or your preferred username)
   - **Password:** choose a secure password
   - **WiFi:** configure if not using ethernet
   - **Locale:** set your timezone
7. Click **Write** and wait for it to finish

## Step 2: First Boot

1. Insert the MicroSD card into the Raspberry Pi
2. Connect ethernet (if not using WiFi)
3. Connect power
4. Wait ~60 seconds for the first boot to complete

### Connect via SSH

```bash
ssh bigaos@bigaos.local
```

If `bigaos.local` doesn't resolve, find the Pi's IP address from your router's admin page and use that instead:
```bash
ssh bigaos@192.168.x.x
```

### Update the system

```bash
sudo apt update && sudo apt upgrade -y
```

---

## Step 3 (Optional): Boot from NVMe SSD

Skip this section if you don't have an NVMe drive. BigaOS runs fine from an SD card.

An NVMe SSD provides significantly faster read/write speeds and more storage. This step clones your SD card to the NVMe and configures the Pi to boot from it.

### Prerequisites
- NVMe SSD installed in an M.2 HAT or base board connected to the Pi
- Pi is currently booted from the SD card

### Clone SD to NVMe

```bash
# Verify both drives are visible
lsblk
# You should see mmcblk0 (SD card) and nvme0n1 (NVMe)

# Copy the entire SD card to the NVMe drive
sudo dd if=/dev/mmcblk0 of=/dev/nvme0n1 bs=4M status=progress conv=fsync

# Assign a new disk ID to the NVMe to avoid PARTUUID conflicts with the SD card
sudo sfdisk --disk-id /dev/nvme0n1 0x$(openssl rand -hex 4)

# Store the new PARTUUIDs
NEW_BOOT=$(sudo blkid -s PARTUUID -o value /dev/nvme0n1p1)
NEW_ROOT=$(sudo blkid -s PARTUUID -o value /dev/nvme0n1p2)
echo "Boot PARTUUID: $NEW_BOOT"
echo "Root PARTUUID: $NEW_ROOT"

# Expand the root partition to use the full NVMe capacity
sudo parted -s /dev/nvme0n1 resizepart 2 100%
sudo e2fsck -f /dev/nvme0n1p2
sudo resize2fs /dev/nvme0n1p2

# Mount the NVMe partitions
sudo mount /dev/nvme0n1p2 /mnt
sudo mount /dev/nvme0n1p1 /mnt/boot/firmware

# Update partition references on the NVMe
sudo sed -i "s|PARTUUID=[^ ]*\s*/boot/firmware|PARTUUID=$NEW_BOOT  /boot/firmware|" /mnt/etc/fstab
sudo sed -i "s|PARTUUID=[^ ]*\s*/\s|PARTUUID=$NEW_ROOT  / |" /mnt/etc/fstab
sudo sed -i "s|root=PARTUUID=[^ ]*|root=PARTUUID=$NEW_ROOT|" /mnt/boot/firmware/cmdline.txt

# Verify the changes
echo "=== fstab ==="
cat /mnt/etc/fstab
echo "=== cmdline.txt ==="
cat /mnt/boot/firmware/cmdline.txt

# Unmount
sudo umount /mnt/boot/firmware
sudo umount /mnt

# Set boot order to NVMe first
sudo raspi-config nonint do_boot_order B2

# Shut down
sudo shutdown -h now
```

### Switch to NVMe

1. **Remove the SD card** from the Pi
2. **Power on** the Pi
3. Wait ~30 seconds, then SSH back in:
   ```bash
   ssh bigaos@bigaos.local
   ```
4. Verify you're running from NVMe:
   ```bash
   lsblk
   # Root (/) should be on nvme0n1p2
   findmnt /
   ```

> **Tip:** Keep the SD card as a recovery tool. If the NVMe ever has boot issues, insert the SD card, change boot order back to SD (`sudo raspi-config nonint do_boot_order B1`), reboot, and you can mount and fix the NVMe from there.

---

## Step 4: Install BigaOS

With the Pi booted and SSH connected, run the one-line installer:

```bash
curl -sSL https://raw.githubusercontent.com/BigaOSTeam/BigaOS/main/install.sh | bash
```

This will:
- Install Node.js 20 LTS (if not already installed)
- Download the latest BigaOS release
- Install server dependencies
- Create and enable a systemd service
- Configure sudoers for self-update capability
- Start BigaOS

The installer takes 2-5 minutes depending on your internet speed.

### Access BigaOS

Once installed, open a browser on any device on the same network and go to:

```
http://bigaos.local:3000
```

Or use the Pi's IP address:
```
http://192.168.x.x:3000
```

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `sudo systemctl status bigaos` | Check if BigaOS is running |
| `sudo systemctl restart bigaos` | Restart BigaOS |
| `sudo systemctl stop bigaos` | Stop BigaOS |
| `sudo journalctl -u bigaos -f` | View live logs |
| `sudo journalctl -u bigaos --since "1 hour ago"` | View recent logs |
| `bash ~/BigaOS/install.sh` | Manually trigger an update |

---

## Updating BigaOS

BigaOS checks for updates automatically every 6 hours. When an update is available, it will appear in **Settings > System**. Click **Update** to install it.

You can also update manually via SSH:
```bash
bash ~/BigaOS/install.sh
```

---

## Troubleshooting

### Can't find the Pi on the network
- Make sure the Pi has finished booting (wait 60 seconds)
- Try `ping bigaos.local` from your PC
- Check your router's DHCP client list for the Pi's IP
- If using WiFi, verify the credentials were entered correctly in Raspberry Pi Imager

### BigaOS won't start
```bash
# Check the service status
sudo systemctl status bigaos

# View the error logs
sudo journalctl -u bigaos --no-pager -n 50
```

### NVMe drive not detected
```bash
# Check if the drive appears
lsblk
ls /dev/nvme*

# Check kernel messages for NVMe errors
dmesg | grep -i nvme
```

### Pi won't boot from NVMe
1. Insert the SD card back into the Pi
2. Change boot order back to SD: `sudo raspi-config nonint do_boot_order B1`
3. Reboot, then mount and inspect the NVMe:
   ```bash
   sudo mount /dev/nvme0n1p2 /mnt
   sudo mount /dev/nvme0n1p1 /mnt/boot/firmware
   cat /mnt/boot/firmware/config.txt
   cat /mnt/etc/fstab
   ```
4. Fix any issues, unmount, change boot order back to NVMe, remove SD card, and reboot
