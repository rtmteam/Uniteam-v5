package com.uniteam.attendance;

import android.content.Context;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;

@CapacitorPlugin(name = "SecurityCheck")
public class SecurityPlugin extends Plugin {

    @PluginMethod
    public void checkSecurity(PluginCall call) {
        Context context = getContext();
        JSObject ret = new JSObject();

        // 1. Developer Mode Check
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

        // 2. Mock Location Detection (Modern Android)
        boolean isMockLocation = false;
        try {
            // Method A: Check if mock location apps are allowed (Android 4.1 - 14)
            String mockLocationSetting = Settings.Secure.getString(
                context.getContentResolver(),
                "mock_location"
            );
            if (mockLocationSetting != null && !mockLocationSetting.equals("0")) {
                isMockLocation = true;
            }
        } catch (Exception e) {
            isMockLocation = false;
        }

        // Method B: Check for active mock location providers using LocationManager
        if (!isMockLocation) {
            try {
                LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
                if (lm != null) {
                    for (String provider : lm.getAllProviders()) {
                        if (provider != null && provider.toLowerCase().contains("mock")) {
                            isMockLocation = true;
                            break;
                        }
                    }
                }
            } catch (Exception e) {
                // Ignore
            }
        }

        // Method C: Check for known mock location apps
        if (!isMockLocation) {
            String[] knownMockApps = {
                "com.incorporateapps.fakegps.fakenet",
                "com.lexa.fakegps",
                "com.lexa.fakegps.free",
                "com.fakegps.mock",
                "com.gsmartstudio.fakelocation",
                "com.ovlesser.fakelocation",
                "com.casual.fakelocation",
                "com.applisto.fakelocation",
                "com.fakegps.location",
                "com.eclipsim.gpsstatus",
                "com.android.fakegps",
                "org.ajeje.fakegps",
                "com.limelocation",
                "io.app.signalfake",
                "com.mygps.fake",
                "com.location.faker",
                "com.hola.fakegps",
                "com.express.fakegps",
                "com.fake.location.gps.changer",
                "com.gpsspoofer",
                "com.psp.locationchanger"
            };
            PackageManager pm = context.getPackageManager();
            for (String pkg : knownMockApps) {
                try {
                    pm.getPackageInfo(pkg, PackageManager.GET_ACTIVITIES);
                    isMockLocation = true;
                    break;
                } catch (PackageManager.NameNotFoundException e) {
                    // App not installed, continue
                }
            }
        }

        // 3. Emulator Detection
        boolean isEmulator = android.os.Build.FINGERPRINT.startsWith("generic")
            || android.os.Build.FINGERPRINT.startsWith("unknown")
            || android.os.Build.MODEL.contains("google_sdk")
            || android.os.Build.MODEL.contains("Emulator")
            || android.os.Build.MODEL.contains("Android SDK built for x86")
            || android.os.Build.MANUFACTURER.contains("Genymotion")
            || (android.os.Build.BRAND.startsWith("generic") && android.os.Build.DEVICE.startsWith("generic"))
            || "google_sdk".equals(android.os.Build.PRODUCT);

        ret.put("isDeveloperMode", isDevMode);
        ret.put("isMockLocation", isMockLocation);
        ret.put("isEmulator", isEmulator);

        call.resolve(ret);
    }
}
