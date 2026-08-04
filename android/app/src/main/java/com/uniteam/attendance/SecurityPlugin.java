package com.uniteam.attendance;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

@CapacitorPlugin(name = "SecurityCheck")
public class SecurityPlugin extends Plugin {

    /** Packages that are also declared in the <queries> block of AndroidManifest.xml. */
    private static final String[] KNOWN_MOCK_APPS = {
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
        "com.psp.locationchanger",
        "com.theappninjas.fakegpsjoystick",
        "com.blogspot.newapphorizons.fakegps",
        "com.rosteam.gpsemulator",
        "com.evezzon.fakegps",
        "net.marlove.mockgps",
        "com.just4funtools.fakegpslocationprofessional",
        "com.txy.androidfaker",
        "com.byyoung.setting"
    };

    // =====================================================================
    // 1. General device security posture
    // =====================================================================
    @PluginMethod
    public void checkSecurity(PluginCall call) {
        Context context = getContext();
        JSObject ret = new JSObject();

        ret.put("isDeveloperMode", isDeveloperModeEnabled(context));
        ret.put("isMockLocation", hasMockLocationApp(context) || hasMockLocationAppSelected(context));
        ret.put("isEmulator", isEmulator());

        call.resolve(ret);
    }

    // =====================================================================
    // 2. Authoritative location read with a real mock flag
    //
    // This is the ONLY reliable way to detect a spoofed position.
    // Location.isMock() (API 31+) / isFromMockProvider() is set by the OS
    // itself and cannot be forged by a Fake GPS app.
    // =====================================================================
    @PluginMethod
    public void getSecureLocation(PluginCall call) {
        Context context = getContext();

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            call.reject("PERMISSION_DENIED");
            return;
        }

        LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) {
            call.reject("NO_LOCATION_MANAGER");
            return;
        }

        Location best = null;
        boolean anyProviderWasMocked = false;

        try {
            List<String> providers = lm.getProviders(true);
            for (String provider : providers) {
                Location loc;
                try {
                    loc = lm.getLastKnownLocation(provider);
                } catch (SecurityException se) {
                    continue;
                }
                if (loc == null) continue;

                if (isMocked(loc)) {
                    // Remember it even if we end up preferring another fix:
                    // any mocked provider at all is a strong fraud signal.
                    anyProviderWasMocked = true;
                }

                if (best == null || loc.getTime() > best.getTime()) {
                    best = loc;
                }
            }
        } catch (Exception e) {
            call.reject("LOCATION_ERROR: " + e.getMessage());
            return;
        }

        if (best == null) {
            call.reject("NO_LOCATION");
            return;
        }

        JSObject ret = new JSObject();
        ret.put("latitude", best.getLatitude());
        ret.put("longitude", best.getLongitude());
        ret.put("accuracy", best.getAccuracy());
        ret.put("time", best.getTime());
        ret.put("provider", best.getProvider());
        ret.put("isMock", isMocked(best) || anyProviderWasMocked);
        call.resolve(ret);
    }

    // =====================================================================
    // 3. Stable hardware-backed device identifier
    //
    // ANDROID_ID survives app reinstall and "clear data" (unlike the
    // preference-backed id returned by @capacitor/device). It only changes on
    // a factory reset, or if the APK is re-signed with a different key.
    // =====================================================================
    @PluginMethod
    public void getHardwareId(PluginCall call) {
        JSObject ret = new JSObject();
        String androidId;
        try {
            androidId = Settings.Secure.getString(
                getContext().getContentResolver(),
                Settings.Secure.ANDROID_ID
            );
        } catch (Exception e) {
            androidId = "";
        }
        ret.put("id", androidId != null ? androidId : "");
        call.resolve(ret);
    }

    // =====================================================================
    // Helpers
    // =====================================================================

    private boolean isMocked(Location loc) {
        if (loc == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return loc.isMock();
        }
        return loc.isFromMockProvider();
    }

    private boolean isDeveloperModeEnabled(Context context) {
        try {
            int devOptions = Settings.Global.getInt(
                context.getContentResolver(),
                Settings.Global.DEVELOPMENT_SETTINGS_ENABLED,
                0
            );
            return devOptions != 0;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Reads the "select mock location app" developer setting.
     * Note: on Android 6.0+ this returns "0" on most devices, so it is kept
     * only as a cheap extra signal — never as the primary check.
     */
    private boolean hasMockLocationAppSelected(Context context) {
        try {
            String setting = Settings.Secure.getString(
                context.getContentResolver(),
                "mock_location"
            );
            return setting != null && !setting.isEmpty() && !setting.equals("0");
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Detects installed fake-GPS apps.
     * Requires the matching <queries> block in AndroidManifest.xml, otherwise
     * getPackageInfo always throws NameNotFoundException on API 30+.
     */
    private boolean hasMockLocationApp(Context context) {
        PackageManager pm = context.getPackageManager();
        for (String pkg : KNOWN_MOCK_APPS) {
            try {
                pm.getPackageInfo(pkg, 0);
                return true;
            } catch (PackageManager.NameNotFoundException e) {
                // Not installed (or not visible) — keep looking.
            } catch (Exception e) {
                // Ignore and keep looking.
            }
        }
        return false;
    }

    private boolean isEmulator() {
        return Build.FINGERPRINT.startsWith("generic")
            || Build.FINGERPRINT.startsWith("unknown")
            || Build.MODEL.contains("google_sdk")
            || Build.MODEL.contains("Emulator")
            || Build.MODEL.contains("Android SDK built for x86")
            || Build.MANUFACTURER.contains("Genymotion")
            || (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"))
            || "google_sdk".equals(Build.PRODUCT);
    }
}
