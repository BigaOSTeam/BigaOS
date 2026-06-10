package BigaOSTeam.bigaos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/**
 * After a reboot the app is not running and background alerts silently
 * stop. If the user had background alerts enabled, prompt them to reopen
 * BigaOS (launching an activity from boot is not allowed, a notification
 * is the best we can do).
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;

        SharedPreferences prefs =
            context.getSharedPreferences(KeepAlivePlugin.PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean(KeepAlivePlugin.PREF_BACKGROUND_ALERTS, false)) {
            KeepAliveService.postReopenNotification(context);
        }
    }
}
