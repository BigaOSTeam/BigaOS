# Console & Logs

**Settings → Advanced** opens onto the console — a live view of the BigaOS server's logs plus an interactive shell. It's the same view your boat's developer would open if asked "what's happening on the server right now?"

## Live server logs

The top half of the page streams `journalctl` for the BigaOS service. Three controls:

- **Refresh** — pulls the most recent ~200 lines on demand.
- **Follow** — when on, new log lines append in real time and the view auto-scrolls to the bottom (unless you've scrolled up to read older lines, in which case auto-scroll pauses until you return to the bottom).
- **Reboot** — reboots the server hardware. Asks for confirmation.

Useful for: watching plugin output, catching the moment a sensor stream went silent, seeing why a download failed.

## Interactive shell

The bottom half is a command prompt that runs commands on the server. Press **Enter** to run, **↑** / **↓** to walk through history (last 50 commands kept). Output is shown inline below each command, with stderr highlighted and a non-zero exit code shown explicitly.

A small **?** button opens a list of pre-baked commands you can run with one tap:

- `uname -a` — kernel and architecture.
- `uptime` — load average and uptime.
- `df -h` — disk free.
- `free -h` — memory.
- `vcgencmd measure_temp` — Pi SoC temperature.
- `hostname -I` — IP addresses.
- `ip -details link show can0` — CAN interface state (for boats with a CAN HAT).
- `i2cdetect -y 1` — list I2C devices on bus 1.
- `systemctl status bigaos --no-pager -l` — BigaOS service status.
- `node --version` — Node version.

These are read-only diagnostics — nothing that changes state. For destructive commands you type the command in directly.

## Use with care

The shell runs as the BigaOS service user. It can do everything that user can do, including breaking the server if you `rm -rf` something important. There's no sandboxing. Treat it the way you'd treat SSH access — useful, but not where you experiment with unfamiliar commands.

## When you'd open this

- A plugin isn't producing data — watch the logs for parse errors, init failures, or "interface not found".
- A download stuck in **extracting** for a long time — see what's happening on disk (`df -h`, `ls -la /path`).
- The server feels sluggish — `uptime`, `free -h`, `vcgencmd measure_temp` (Pi-specific) tell you whether it's load, memory pressure, or thermal throttling.
- Something on the bus is misbehaving — `candump can0` or `i2cdetect -y 1` to confirm devices are present.
