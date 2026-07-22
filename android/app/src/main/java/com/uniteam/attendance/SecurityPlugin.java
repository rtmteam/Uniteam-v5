package com.uniteam.attendance;

import android.content.Context;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SecurityCheck")
public class SecurityPlugin extends Plugin {

    @PluginMethod
    public void checkSecurity(PluginCall call) {
        Context context = getContext();
        JSObject ret = new JSObject();

        boolean isDevMode = false;
        try {
            int devOptions = Settings.Global.getInt(
                context.getContentResolver(),
                Settings.Global.DEVELOPMENT_SETTINGS_ENABLED,
                0
            );
            isDevMode = (devOptions != 0);
        } catch (Exception e) {
            isDevMode = false;
        }

        boolean isMockLocationAppEnabled = false;
        try {
            String mockLocationSetting = Settings.Secure.getString(
                context.getContentResolver(),
                "mock_location"
            );
            if (mockLocationSetting != null && !mockLocationSetting.equals("0")) {
                isMockLocationAppEnabled = true;
            }
        } catch (Exception e) {
            isMockLocationAppEnabled = false;
        }

        boolean isEmulator = android.os.Build.FINGERPRINT.startsWith("generic")
            || android.os.Build.FINGERPRINT.startsWith("unknown")
            || android.os.Build.MODEL.contains("google_sdk")
            || android.os.Build.MODEL.contains("Emulator")
            || android.os.Build.MODEL.contains("Android SDK built for x86")
            || android.os.Build.MANUFACTURER.contains("Genymotion")
            || (android.os.Build.BRAND.startsWith("generic") && android.os.Build.DEVICE.startsWith("generic"))
            || "google_sdk".equals(android.os.Build.PRODUCT);

        ret.put("isDeveloperMode", isDevMode);
        ret.put("isMockLocation", isMockLocationAppEnabled);
        ret.put("isEmulator", isEmulator);

        call.resolve(ret);
    }
}
