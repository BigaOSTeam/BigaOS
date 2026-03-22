/**
 * BigaOS Tailscale VPN Plugin
 *
 * Manages a Tailscale VPN connection for remote access to the boat.
 * Runs `tailscale up/down` and monitors connection status.
 *
 * Actions (RPC from client):
 *   getStatus   – Returns current Tailscale connection status
 *   connect     – Bring Tailscale up with configured auth key
 *   disconnect  – Bring Tailscale down
 */

const { execSync, exec } = require('child_process');

let api = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Auto-detect the local /24 subnet from the default route. */
function detectLocalSubnet() {
  try {
    const output = execSync('ip route show default', { timeout: 5000 }).toString();
    // e.g. "default via 192.168.1.1 dev eth0 proto dhcp ..."
    const match = output.match(/via\s+(\d+\.\d+\.\d+)\.\d+/);
    if (match) return `${match[1]}.0/24`;
  } catch (_) { /* ignore */ }
  return null;
}

/** Query `tailscale status --json` and return a normalised status object. */
function getStatus() {
  try {
    const raw = execSync('tailscale status --json', { timeout: 10000 }).toString();
    const status = JSON.parse(raw);
    const self = status.Self || {};
    return {
      connected: status.BackendState === 'Running',
      backendState: status.BackendState,
      tailscaleIP: (self.TailscaleIPs && self.TailscaleIPs[0]) || null,
      hostname: self.HostName || null,
      online: !!self.Online,
      detectedSubnet: detectLocalSubnet(),
    };
  } catch (e) {
    return {
      connected: false,
      backendState: 'Stopped',
      tailscaleIP: null,
      hostname: null,
      error: e.message,
      detectedSubnet: detectLocalSubnet(),
    };
  }
}

/** Bring Tailscale up with the configured auth key and options. */
async function connectTailscale() {
  const authKey = await api.getSetting('authKey');
  if (!authKey) {
    api.log('Cannot connect — no auth key configured', 'warn');
    return { error: 'No auth key configured' };
  }

  const hostname = (await api.getSetting('hostname')) || 'bigaos';
  let routes = (await api.getSetting('advertiseRoutes')) || '';
  const acceptRoutes = (await api.getSetting('acceptRoutes')) !== false;

  // Auto-detect subnet when not manually configured
  if (!routes) {
    routes = detectLocalSubnet() || '';
  }

  const args = ['tailscale', 'up', `--authkey=${authKey}`, `--hostname=${hostname}`];
  if (routes) args.push(`--advertise-routes=${routes}`);
  if (acceptRoutes) args.push('--accept-routes');
  args.push('--reset');

  return new Promise((resolve) => {
    exec(args.join(' '), { timeout: 30000 }, (err, _stdout, stderr) => {
      if (err) {
        api.log(`Tailscale connect failed: ${stderr || err.message}`, 'error');
        resolve({ error: stderr || err.message });
      } else {
        api.log('Tailscale connected successfully');
        resolve({ success: true });
      }
    });
  });
}

/** Bring Tailscale down. */
function disconnectTailscale() {
  try {
    execSync('tailscale down', { timeout: 10000 });
    api.log('Tailscale disconnected');
    return { success: true };
  } catch (e) {
    api.log(`Tailscale disconnect failed: ${e.message}`, 'error');
    return { error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Plugin lifecycle
// ---------------------------------------------------------------------------

module.exports = {
  async activate(pluginApi) {
    api = pluginApi;
    api.log('Tailscale VPN plugin activating...');

    // Auto-connect if auth key is already configured
    const authKey = await api.getSetting('authKey');
    if (authKey) {
      const status = getStatus();
      if (!status.connected) {
        api.log('Auth key found, connecting...');
        await connectTailscale();
      } else {
        api.log(`Already connected: ${status.tailscaleIP}`);
      }
    } else {
      api.log('No auth key configured — open plugin settings to set up');
    }
  },

  async deactivate() {
    // Disconnect when the plugin is disabled
    const status = getStatus();
    if (status.connected) {
      disconnectTailscale();
    }
    api = null;
  },

  async onAction(action, _params) {
    switch (action) {
      case 'getStatus':
        return getStatus();
      case 'connect':
        if (!api) return { error: 'Plugin not active' };
        return await connectTailscale();
      case 'disconnect':
        return disconnectTailscale();
      default:
        return { error: `Unknown action: ${action}` };
    }
  },
};
