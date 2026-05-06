# Setup

To install the plugin you'll need a Tailscale account (the free tier is plenty for one boat) and an auth key.

## 1. Get an auth key

1. Sign in to [tailscale.com](https://tailscale.com) and open **Settings → Keys**.
2. Generate a new **Auth Key**. Mark it **Reusable** if you want the boat to re-auth on its own after expiry, or generate a single-use key if you prefer to re-paste manually each time.
3. Copy the key — you only see it once.

## 2. Install in BigaOS

1. **Settings → Plugins** → find Tailscale VPN → **Install**.
2. Open the plugin's settings and paste the auth key into the **Auth Key** field.
3. Optionally change the **Hostname** (default `bigaos`). The hostname is what you'll type into a browser later — keep it short and obvious.
4. Hit **Connect**.

The plugin will register the machine with Tailscale and bring up the connection. The status row tells you whether it's authenticated and connected.

## 3. Connect from a phone

1. Install Tailscale on the phone or laptop and sign into the same account.
2. Open a browser to **`http://<hostname>:3000`** (e.g. `http://bigaos:3000`).
3. The BigaOS UI loads as if you were on the local Wi-Fi.

If the hostname doesn't resolve, MagicDNS may be off in your Tailscale admin. Re-enable it in **DNS → MagicDNS** on tailscale.com.

## Subnet routes (advanced)

If you have other devices on the boat's local network that you want to reach from off-boat (e.g. a cellular router admin page, a NAS, a CCTV system):

1. Enter the subnet in CIDR form into **Advertise Routes**, e.g. `192.168.1.0/24`.
2. In your Tailscale admin (**Machines → bigaos → Edit route settings**), approve the route.
3. Other devices on your tailnet can now reach IPs in that range as if they were local.
