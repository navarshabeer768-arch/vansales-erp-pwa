const STORAGE_KEY = 'vansales-device-id';

export function getDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
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
