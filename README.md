# BigaOS

**Work in progress** — Marine navigation and boat automation system.

BigaOS is a self-hosted web application designed to run on a Raspberry Pi 5 aboard a vessel. It provides real-time sensor data, chart navigation, weather forecasts, anchor alarms, and more — all accessible from any device on the local network.

> **This project is under active development and not yet ready for production use.**

## Install (Raspberry Pi)

```bash
curl -sSL https://raw.githubusercontent.com/Johannes-Goetz/BigaOS/main/install.sh | bash
```

Installs Node.js, downloads the latest release, sets up a systemd service, and starts BigaOS.
Open `http://<pi-ip>:3000` from any device on the network.

Updates can be installed from Settings or by re-running the script.

## Development

```bash
npm run install:all
npm run dev:server   # Terminal 1 — http://localhost:3000
npm run dev:client   # Terminal 2 — http://localhost:5173
```

## License

MIT
