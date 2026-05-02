package BigaOSTeam.bigaos;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // targetSdk 35 (Android 15) defaults to edge-to-edge, which lets the
        // WebView draw under the status bar and gesture nav bar. The app's
        // toolbars assume reserved system-bar space, so we opt back out.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    }
}
