const STORAGE_KEY = 'vansales-device-id';

export function getDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

/**
 * Best-effort device model/manufacturer detection from the user agent.
 * Professional Android PDTs (Zebra, Chainway, Urovo, Honeywell, Sunmi,
 * Newland) typically include their model in the UA string when the
 * manufacturer hasn't stripped it — this is a heuristic, not a guarantee,
 * since UA strings vary by OEM/Android version/WebView build.
 */
export function getDeviceInfo(): { model: string | null; manufacturer: string | null; osVersion: string | null } {
  const ua = navigator.userAgent;
  const manufacturerPatterns: [RegExp, string][] = [
    [/Zebra|TC2[0-9]|TC5[0-9]|MC[0-9]{2}/i, 'Zebra'],
    [/Chainway|C6[0-9]/i, 'Chainway'],
    [/Urovo|DT[0-9]{2}|RT[0-9]{2}/i, 'Urovo'],
    [/Honeywell|EDA[0-9]{2}|CT[0-9]{2}/i, 'Honeywell'],
    [/Sunmi/i, 'Sunmi'],
    [/Newland/i, 'Newland'],
  ];
  let manufacturer: string | null = null;
  for (const [pattern, name] of manufacturerPatterns) {
    if (pattern.test(ua)) { manufacturer = name; break; }
  }
  if (!manufacturer && /Android/i.test(ua)) manufacturer = 'Generic Android';

  const modelMatch = ua.match(/;\s*([A-Za-z0-9\- ]+)\s+Build\//);
  const model = modelMatch ? modelMatch[1].trim() : null;

  const osMatch = ua.match(/Android\s([\d.]+)/);
  const osVersion = osMatch ? `Android ${osMatch[1]}` : null;

  return { model, manufacturer, osVersion };
}

export function getNetworkStatus(): 'online' | 'offline' {
  return navigator.onLine ? 'online' : 'offline';
}

/** Battery Status API is deprecated/removed in most browsers except Chrome on some platforms — genuinely best-effort, resolves to null where unsupported rather than pretending it works everywhere. */
export async function getBatteryStatus(): Promise<{ level: number; charging: boolean } | null> {
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> };
  if (!nav.getBattery) return null;
  try {
    const battery = await nav.getBattery();
    return { level: Math.round(battery.level * 100), charging: battery.charging };
  } catch {
    return null;
  }
}

/** Best-effort human-readable device/browser label from the user agent — not a hardware fingerprint. */
export function getDeviceLabel(): string {
  const ua = navigator.userAgent;
  const platform =
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|iPod/.test(ua) ? 'iOS' :
    /Windows/.test(ua) ? 'Windows' :
    /Macintosh/.test(ua) ? 'Mac' :
    /Linux/.test(ua) ? 'Linux' : 'Unknown device';
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Safari\//.test(ua) && !/Chrome/.test(ua) ? 'Safari' :
    /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  return `${platform} · ${browser}`;
}
