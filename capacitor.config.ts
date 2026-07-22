import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.uniteam.attendance',
  appName: 'Uniteam',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    // Live updates from GitHub Pages: the APK loads the latest web build from this URL.
    // When offline or server unreachable, Capacitor falls back to bundled local files.
    url: 'https://bahaamohamed51-coder.github.io/Uniteam-v3/',
    allowNavigation: ['*']
  },
  plugins: {
    CapacitorCookies: {
      enabled: true
    }
  }
};

export default config;

