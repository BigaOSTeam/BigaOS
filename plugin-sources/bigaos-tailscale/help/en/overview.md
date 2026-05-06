# Tailscale VPN

The Tailscale plugin gives you secure remote access to the boat from anywhere. Once installed, the boat joins your Tailscale network as a regular machine — and your phone can reach it by name (`http://bigaos:3000`) without messing with IP addresses, port forwarding, or VPN configs.

## Why Tailscale

A boat moves between marinas. Each marina hands out different public IPs, often behind carrier-grade NAT, and dropping cellular dead-zones break any classic port-forward setup. Tailscale punches through all of that, encrypts the link end-to-end, and gives the boat a stable name (MagicDNS).

## What this plugin does

- Installs `tailscaled` on the BigaOS server.
- Joins your Tailscale network using an auth key you paste in once.
- Sets the machine's hostname (default `bigaos`) so MagicDNS resolves it cleanly.
- Optionally advertises subnet routes so other devices on the boat's local network are reachable from your Tailscale net.
- Optionally accepts subnet routes from other Tailscale machines.

After setup, navigate phones and laptops to **`http://bigaos:3000`** — works from anywhere your phone has internet.

## Privacy

Tailscale traffic is end-to-end encrypted. The plugin doesn't proxy your data through any BigaOS or third-party server beyond Tailscale's own coordination service (which only handles connection setup, not your traffic). Your boat data stays between your devices and the boat.

## Disabling

If you stop using Tailscale: disable the plugin in **Settings → Plugins**, or uninstall it. The plugin's `uninstall.sh` removes `tailscaled` cleanly so the system boots without it after a restart.
