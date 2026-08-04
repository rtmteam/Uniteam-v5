import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.uniteam.attendance',
  appName: 'Uniteam',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Live updates from GitHub Pages: the APK loads the latest web build from this URL,
    // so employees get updates without reinstalling the APK.
    //
    // IMPORTANT: Capacitor does NOT automatically fall back to the bundled files
    // when this URL is unreachable. Instead, `errorPath` below points at a local
    // page that is shown when the WebView fails to load, so the employee sees a
    // clear Arabic message instead of a blank white screen.
    url: 'https://rtmteam.github.io/Uniteam-v5/',
    errorPath: 'error.html',
    // Restricted on purpose: '*' would let any page opened inside the WebView
    // keep access to the native Capacitor bridge (location, device id).
    allowNavigation: [
      'rtmteam.github.io',
      'script.google.com',
      'script.googleusercontent.com',
      'cdn.tailwindcss.com',
      'fonts.googleapis.com',
      'fonts.gstatic.com'
    ]
  },
  plugins: {
    CapacitorCookies: {
      enabled: true
    }
  }
};

export default config;
