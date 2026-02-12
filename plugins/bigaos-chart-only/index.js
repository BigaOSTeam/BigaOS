/**
 * Chart Only Mode Plugin
 *
 * UI-only plugin: when enabled, the client uses the nautical chart
 * as the main screen instead of the dashboard.
 * No server-side logic needed — the client derives the mode
 * from the plugin's enabled/disabled state.
 */

module.exports = {
  async activate(_api) {
    // No server-side work needed
  },
  async deactivate() {
    // Nothing to clean up
  },
};
