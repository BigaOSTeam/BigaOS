package BigaOSTeam.bigaos;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Foreground service that keeps the process (and with it the WebView's
 * socket connection to the boat) alive so alerts reach the phone with the
 * screen off or the app in the background. Holds a partial wakelock and a
 * WiFi lock. Started/stopped by KeepAlivePlugin, either while the anchor
 * alarm is armed (reason "anchor") or permanently via the background-alerts
 * setting (reason "alerts").
 *
 * The service is only useful while the WebView is alive — it has no socket
 * of its own. If the task is removed (app swiped away) or the process was
 * restarted by the system, it switches its notification to a "reopen
 * BigaOS" prompt instead of pretending alerts still arrive.
 */
public class KeepAliveService extends Service {

    public static final String EXTRA_REASON = "reason";
    public static final String REASON_ANCHOR = "anchor";
    public static final String REASON_ALERTS = "alerts";

    private static final String CHANNEL_ID = "bigaos_anchor_watch";
    // Same id the web layer uses for critical alerts — the reopen prompt
    // must be loud enough to notice.
    private static final String CRITICAL_CHANNEL_ID = "bigaos_critical";
    private static final int NOTIFICATION_ID = 7401;
    private static final int REOPEN_NOTIFICATION_ID = 7402;

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createChannel();

        // intent == null means START_STICKY restarted us after the process
        // died — the WebView (and its socket) is gone, so alerts cannot
        // arrive. Tell the user instead of showing a reassuring ongoing
        // notification that protects nothing.
        if (intent == null) {
            postReopenNotification(this);
            stopSelf();
            return START_NOT_STICKY;
        }

        String reason = intent.getStringExtra(EXTRA_REASON);
        boolean anchor = REASON_ANCHOR.equals(reason);

        int serviceType = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE;
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(anchor), serviceType);

        acquireLocks();
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // App swiped from recents: the activity (and WebView) is destroyed,
        // the connection to the boat is gone. Stop and prompt to reopen.
        postReopenNotification(this);
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        releaseLocks();
        super.onDestroy();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            getString(R.string.keepalive_channel_name),
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setShowBadge(false);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(boolean anchor) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_anchor_watch)
            .setContentTitle(getString(anchor ? R.string.anchor_watch_title : R.string.alerts_watch_title))
            .setContentText(getString(anchor ? R.string.anchor_watch_text : R.string.alerts_watch_text))
            .setOngoing(true)
            .setShowWhen(false)
            .setContentIntent(launchAppIntent(this))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }

    private static PendingIntent launchAppIntent(Context context) {
        Intent launch = new Intent(context, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
            context, 0, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    /**
     * "BigaOS was closed — tap to reopen" prompt, used when the app can no
     * longer receive alerts (process death, task removed, reboot). Also
     * called by BootReceiver, hence static with a Context parameter.
     */
    static void postReopenNotification(Context context) {
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Ensure the channel exists even if the web layer never ran —
            // it normally creates this id itself with the app language.
            NotificationChannel channel = new NotificationChannel(
                CRITICAL_CHANNEL_ID,
                context.getString(R.string.critical_channel_name),
                NotificationManager.IMPORTANCE_HIGH
            );
            manager.createNotificationChannel(channel);
        }

        Notification notification = new NotificationCompat.Builder(context, CRITICAL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_anchor_watch)
            .setContentTitle(context.getString(R.string.reopen_title))
            .setContentText(context.getString(R.string.reopen_text))
            .setAutoCancel(true)
            .setContentIntent(launchAppIntent(context))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build();
        manager.notify(REOPEN_NOTIFICATION_ID, notification);
    }

    @SuppressWarnings("deprecation")
    private void acquireLocks() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "BigaOS:KeepAlive");
                wakeLock.setReferenceCounted(false);
                // No timeout: an anchor watch or background-alerts session
                // legitimately runs for days. Released in onDestroy.
                wakeLock.acquire();
            }
        }
        if (wifiLock == null) {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "BigaOS:KeepAliveWifi");
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
            }
        }
    }

    private void releaseLocks() {
        if (wakeLock != null) {
            if (wakeLock.isHeld()) wakeLock.release();
            wakeLock = null;
        }
        if (wifiLock != null) {
            if (wifiLock.isHeld()) wifiLock.release();
            wifiLock = null;
        }
    }
}
