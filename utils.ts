import { Capacitor, registerPlugin } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { Geolocation } from '@capacitor/geolocation';

interface SecurityCheckPlugin {
  checkSecurity(): Promise<{
    isDeveloperMode: boolean;
    isMockLocation: boolean;
    isEmulator: boolean;
  }>;
  getSecureLocation(): Promise<{
    latitude: number;
    longitude: number;
    accuracy: number;
    time: number;
    provider: string;
    isMock: boolean;
  }>;
  getHardwareId(): Promise<{ id: string }>;
}

const SecurityCheck = registerPlugin<SecurityCheckPlugin>('SecurityCheck');

/**
 * Calculates the distance between two points in meters using Haversine formula
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

export const formatDate = (dateStr: string) => {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(dateStr));
};

// ==========================================
// IndexedDB Persistence Fallback System
// ==========================================
const INDEXED_DB_NAME = 'UniteamSecurityDB';
const INDEXED_STORE_NAME = 'device_store';

const getFromIndexedDB = (key: string): Promise<string | null> => {
  return new Promise((resolve) => {
    try {
      if (typeof window === 'undefined' || !window.indexedDB) return resolve(null);
      const req = indexedDB.open(INDEXED_DB_NAME, 1);
      req.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(INDEXED_STORE_NAME)) {
          db.createObjectStore(INDEXED_STORE_NAME);
        }
      };
      req.onsuccess = (e: any) => {
        try {
          const db = e.target.result;
          const tx = db.transaction(INDEXED_STORE_NAME, 'readonly');
          const store = tx.objectStore(INDEXED_STORE_NAME);
          const getReq = store.get(key);
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => resolve(null);
        } catch (err) {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
};

const saveToIndexedDB = (key: string, val: string): Promise<void> => {
  return new Promise((resolve) => {
    try {
      if (typeof window === 'undefined' || !window.indexedDB) return resolve();
      const req = indexedDB.open(INDEXED_DB_NAME, 1);
      req.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(INDEXED_STORE_NAME)) {
          db.createObjectStore(INDEXED_STORE_NAME);
        }
      };
      req.onsuccess = (e: any) => {
        try {
          const db = e.target.result;
          const tx = db.transaction(INDEXED_STORE_NAME, 'readwrite');
          const store = tx.objectStore(INDEXED_STORE_NAME);
          store.put(val, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (err) {
          resolve();
        }
      };
      req.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
};

// ==========================================
// Robust Device ID Retrieval System (Hardware UUID + IndexedDB)
// ==========================================
let memoryCachedDeviceId: string = '';

/**
 * Initializes and retrieves the device fingerprint async.
 * Uses @capacitor/device Hardware UUID on Mobile/Native.
 * Uses IndexedDB + LocalStorage dual fallback on Web Browsers.
 */
export const initDeviceFingerprint = async (): Promise<string> => {
  if (memoryCachedDeviceId) return memoryCachedDeviceId;

  let deviceId = '';

  // 1. Native: prefer ANDROID_ID from our own plugin.
  //    Unlike Device.getId() (which is stored in app preferences and is lost on
  //    reinstall / "clear data"), ANDROID_ID survives reinstall and only changes
  //    on factory reset. That is what makes "one employee = one phone" hold.
  if (Capacitor.isNativePlatform()) {
    try {
      const hw = await SecurityCheck.getHardwareId();
      if (hw && hw.id) {
        deviceId = 'dev_android_' + hw.id;
      }
    } catch (e) {
      console.warn('Native getHardwareId failed, falling back to Device.getId():', e);
    }

    // Fallback for older APK builds that do not ship getHardwareId yet.
    if (!deviceId) {
      try {
        const code = await Device.getId();
        const uuid = (code as any).uuid || (code as any).identifier || '';
        if (uuid) {
          deviceId = 'dev_android_' + uuid;
        }
      } catch (e) {
        console.warn('Capacitor Device getId error:', e);
      }
    }
  }

  // 2. Web Browser or Fallback logic using IndexedDB & LocalStorage
  if (!deviceId) {
    const localId = localStorage.getItem('uniteam_device_token');
    const idbId = await getFromIndexedDB('uniteam_device_token');

    if (idbId) {
      deviceId = idbId;
      if (!localId) {
        localStorage.setItem('uniteam_device_token', idbId);
      }
    } else if (localId) {
      deviceId = localId;
      await saveToIndexedDB('uniteam_device_token', localId);
    } else {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      localStorage.setItem('uniteam_device_token', deviceId);
      await saveToIndexedDB('uniteam_device_token', deviceId);
    }
  } else {
    // Keep local storage & IndexedDB synced with native Hardware ID
    localStorage.setItem('uniteam_device_token', deviceId);
    await saveToIndexedDB('uniteam_device_token', deviceId);
  }

  memoryCachedDeviceId = deviceId;
  return deviceId;
};

// Auto-trigger background initialization on load
initDeviceFingerprint().catch(() => {});

/**
 * Returns the cached or synchronous device fingerprint
 */
export const getDeviceFingerprint = (): string => {
  if (memoryCachedDeviceId) return memoryCachedDeviceId;
  const localId = localStorage.getItem('uniteam_device_token');
  if (localId) {
    memoryCachedDeviceId = localId;
    return localId;
  }
  const fallbackId = 'dev_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  localStorage.setItem('uniteam_device_token', fallbackId);
  saveToIndexedDB('uniteam_device_token', fallbackId);
  memoryCachedDeviceId = fallbackId;
  return fallbackId;
};

export const getDeviceFingerprintAsync = async (): Promise<string> => {
  return await initDeviceFingerprint();
};

// ==========================================
// Security Checks (Anti-Mock Location & Anti-Developer Options)
// ==========================================
export interface SecurityCheckResult {
  isAllowed: boolean;
  reason?: string;
  isDeveloperMode?: boolean;
  isMockLocation?: boolean;
}

export interface SecureLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  isMock: boolean;
}

/**
 * Explicitly asks for the runtime location permission on Android.
 * Returns true on web (the browser prompts on first use) and whenever the
 * permission is already granted.
 */
export const ensureLocationPermission = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const current = await Geolocation.checkPermissions();
    if (current.location === 'granted' || current.coarseLocation === 'granted') return true;

    const asked = await Geolocation.requestPermissions();
    return asked.location === 'granted' || asked.coarseLocation === 'granted';
  } catch (e) {
    console.warn('Geolocation permission request failed:', e);
    // Fall through and let the WebView prompt handle it.
    return true;
  }
};

/**
 * Reads the position through the native plugin so we get the OS-provided
 * `isMock` flag, which a Fake GPS app cannot forge.
 * Returns null on web, or when the native read is unavailable — callers should
 * then fall back to navigator.geolocation.
 */
export const getNativeSecureLocation = async (): Promise<SecureLocation | null> => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const loc = await SecurityCheck.getSecureLocation();
    if (!loc || typeof loc.latitude !== 'number') return null;
    return {
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
      isMock: loc.isMock === true
    };
  } catch (e) {
    console.warn('Native getSecureLocation unavailable:', e);
    return null;
  }
};

export const checkSecurityStatus = async (
  position?: { coords: { latitude: number; longitude: number; accuracy: number; speed?: number; [key: string]: any } }
): Promise<SecurityCheckResult> => {
  // 1. Native Android Checks via Capacitor Security Plugin
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await SecurityCheck.checkSecurity();
      if (res) {
        if (res.isDeveloperMode) {
          return {
            isAllowed: false,
            isDeveloperMode: true,
            reason: 'عذراً، وضع المطورين (Developer Options) مفعّل على الهاتف. يرجى إيقافه لتسجيل الحضور والانصراف.'
          };
        }
        if (res.isMockLocation) {
          return {
            isAllowed: false,
            isMockLocation: true,
            reason: 'تم كشف استخدام تطبيق لتزييف الموقع الجغرافي (Mock Location/Fake GPS). يرجى إيقاف التطبيق والمحاولة مجدداً.'
          };
        }
        if (res.isEmulator) {
          return {
            isAllowed: false,
            reason: 'عذراً، لا يمكن استخدام التطبيق من أجهزة المحاكاة (Emulators).'
          };
        }
      }
    } catch (e) {
      console.warn('Native SecurityCheck plugin call error:', e);
    }
  }

  // 2. Location validation (Web + Native)
  if (position && position.coords) {
    const { latitude, longitude, accuracy } = position.coords;
    const rawCoords = position.coords as any;

    // OS-provided mock flag. On native this comes from Location.isMock();
    // it cannot be forged by a Fake GPS app.
    if (rawCoords.isMock === true || rawCoords.mocked === true || rawCoords.isFromMockProvider === true) {
      return {
        isAllowed: false,
        isMockLocation: true,
        reason: 'تم كشف استخدام موقع جغرافي وهمي (Mock Location/Fake GPS). يرجى استخدام الموقع الحقيقي للجهاز.'
      };
    }

    if (latitude === 0 && longitude === 0) {
      return {
        isAllowed: false,
        reason: 'إحداثيات الموقع الجغرافي غير صحيحة (0,0). يرجى تفعيل الـ GPS والمحاولة مجدداً.'
      };
    }

    if (!isFinite(latitude) || !isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return {
        isAllowed: false,
        reason: 'إحداثيات الموقع الجغرافي غير صالحة.'
      };
    }

    if (typeof accuracy === 'number' && accuracy > 200) {
      return {
        isAllowed: false,
        reason: `دقة إشارة الموقع ضعيفة (${Math.round(accuracy)} متر). يرجى الخروج لمكان مكشوف أو فتح تطبيق الخرائط لتنشيط الـ GPS ثم المحاولة مجدداً.`
      };
    }

    // NOTE: heuristics based on "suspiciously round" accuracy values were
    // removed on purpose. Real handsets routinely report accuracy of exactly
    // 5 m or 10 m with speed 0 while the employee is standing still, which
    // blocked legitimate check-ins. The OS `isMock` flag above is the reliable
    // signal; app-level guesswork only produced false rejections.
  }

  return { isAllowed: true };
};

// ==========================================
// Time Sync & Anti-Clock Tampering System
// ==========================================
let syncBaseTimeMs = Date.now();
let syncBasePerfMs = performance.now();
let lastSavedTimeMs = 0;
let hasSyncedWithServer = false;

const savedOffsetStr = localStorage.getItem('uniteam_time_offset');
let initialOffset = 0;
if (savedOffsetStr) {
  initialOffset = parseInt(savedOffsetStr, 10) || 0;
}

let initialTimeMs = Date.now() + initialOffset;

const lastKnownStr = localStorage.getItem('uniteam_last_known_real_time');
if (lastKnownStr) {
  const lastKnown = parseInt(lastKnownStr, 10) || 0;
  if (initialTimeMs < lastKnown) {
    console.warn('Clock tampering/rewinding detected on startup.');
    initialTimeMs = lastKnown + 1000;
    initialOffset = initialTimeMs - Date.now();
    localStorage.setItem('uniteam_time_offset', initialOffset.toString());
  }
}

syncBaseTimeMs = initialTimeMs;
syncBasePerfMs = performance.now();

export const syncTimeWithServer = async () => {
  const startTime = performance.now();
  
  try {
    // Relative path is required: on GitHub Pages the app is served from a
    // sub-path (…/Uniteam-v5/), so a leading "/" would 404 every time.
    const res = await fetch('./server-config.json?t=' + Date.now(), { method: 'HEAD', cache: 'no-store' });
    const serverDateHeader = res.headers.get('date');
    if (serverDateHeader) {
      const serverTime = new Date(serverDateHeader).getTime();
      const endTime = performance.now();
      const rtt = endTime - startTime;
      const adjustedServerTime = serverTime + (rtt / 2);

      const offset = adjustedServerTime - Date.now();
      localStorage.setItem('uniteam_time_offset', offset.toString());
      
      syncBaseTimeMs = adjustedServerTime;
      syncBasePerfMs = endTime;
      hasSyncedWithServer = true;
      console.log('Time synced with app server. Base:', new Date(syncBaseTimeMs).toISOString());
      return;
    }
  } catch (e) {
    console.warn('App server sync failed, attempting fallbacks...', e);
  }

  try {
    const res = await fetch('https://worldtimeapi.org/api/timezone/Africa/Cairo');
    if (res.ok) {
      const data = await res.json();
      if (data && data.unixtime) {
        const serverTime = data.unixtime * 1000;
        const endTime = performance.now();
        const rtt = endTime - startTime;
        const adjustedServerTime = serverTime + (rtt / 2);

        const offset = adjustedServerTime - Date.now();
        localStorage.setItem('uniteam_time_offset', offset.toString());

        syncBaseTimeMs = adjustedServerTime;
        syncBasePerfMs = endTime;
        hasSyncedWithServer = true;
        console.log('Time synced with WorldTimeAPI (Egypt). Base:', new Date(syncBaseTimeMs).toISOString());
        return;
      }
    }
  } catch (e) {
    console.warn('WorldTimeAPI sync failed.', e);
  }
};

export const getRealNetworkTime = (): Date => {
  const elapsedMs = performance.now() - syncBasePerfMs;
  const currentRealTimeMs = syncBaseTimeMs + elapsedMs;

  const nowPerf = performance.now();
  if (nowPerf - lastSavedTimeMs > 5000) {
    localStorage.setItem('uniteam_last_known_real_time', Math.round(currentRealTimeMs).toString());
    lastSavedTimeMs = nowPerf;
  }

  return new Date(currentRealTimeMs);
};

export function getEgyptDateTimeComponents(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const components: { [key: string]: number } = {};
  parts.forEach(p => {
    if (p.type !== 'literal') {
      components[p.type] = parseInt(p.value, 10);
    }
  });
  return components;
}

export function getEgyptTime(dateInput?: Date | number | string): Date {
  const baseDate = dateInput ? new Date(dateInput) : getRealNetworkTime();
  const comps = getEgyptDateTimeComponents(baseDate);
  
  const d = new Date(baseDate.getTime());
  d.setFullYear(comps.year, comps.month - 1, comps.day);
  d.setHours(comps.hour, comps.minute, comps.second, 0);
  return d;
}
