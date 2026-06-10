package BigaOSTeam.bigaos;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS bridge for the keep-alive service and battery-optimization exemption.
 * Used by client/src/services/keepAlive.ts.
 */
@CapacitorPlugin(name = "KeepAlive")
public class KeepAlivePlugin extends Plugin {

    static final String PREFS = "bigaos_keepalive";
    static final String PREF_BACKGROUND_ALERTS = "background_alerts_enabled";

    @PluginMethod
    public void start(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), KeepAliveService.class);
            String reason = call.getString("reason", KeepAliveService.REASON_ALERTS);
            intent.putExtra(KeepAliveService.EXTRA_REASON, reason);
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception e) {
            // Android 12+ rejects foreground-service starts from the
            // background; the JS side retries on the next app resume.
            call.reject("keep-alive start failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), KeepAliveService.class);
        getContext().stopService(intent);
        call.resolve();
    }

    /**
     * Mirror of the web-side background-alerts setting, readable by
     * BootReceiver (which has no access to WebView localStorage).
     */
    @PluginMethod
    public void setBackgroundAlertsEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(PREF_BACKGROUND_ALERTS, enabled).apply();
        call.resolve();
    }

    /**
     * Ask the system to exempt BigaOS from battery optimization. Without
     * this, deep Doze ignores the service's wakelock and alerts stall while
     * the phone lies still. Shows the system dialog only when not already
     * exempted.
     */
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        try {
            Context context = getContext();
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(context.getPackageName())) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + context.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("battery exemption request failed: " + e.getMessage());
        }
    }
}
