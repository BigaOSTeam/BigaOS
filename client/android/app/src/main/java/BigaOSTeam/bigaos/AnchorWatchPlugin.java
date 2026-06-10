package BigaOSTeam.bigaos;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS bridge for the anchor-watch keep-alive service.
 * Used by client/src/services/anchorWatch.ts.
 */
@CapacitorPlugin(name = "AnchorWatch")
public class AnchorWatchPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), AnchorWatchService.class);
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception e) {
            // Android 12+ rejects foreground-service starts from the
            // background; the JS side retries on the next app resume.
            call.reject("anchor watch start failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), AnchorWatchService.class);
        getContext().stopService(intent);
        call.resolve();
    }
}
