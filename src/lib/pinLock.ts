const PIN_HASH_KEY = 'vansales-pin-hash';
const PIN_SALT_KEY = 'vansales-pin-salt';

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hasPinSet(): boolean {
  return !!localStorage.getItem(PIN_HASH_KEY);
}

export async function setPin(pin: string): Promise<void> {
  const salt = crypto.randomUUID();
  const hash = await sha256Hex(salt + pin);
  localStorage.setItem(PIN_SALT_KEY, salt);
  localStorage.setItem(PIN_HASH_KEY, hash);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const salt = localStorage.getItem(PIN_SALT_KEY);
  const storedHash = localStorage.getItem(PIN_HASH_KEY);
  if (!salt || !storedHash) return false;
  const hash = await sha256Hex(salt + pin);
  return hash === storedHash;
}

export function clearPin(): void {
  localStorage.removeItem(PIN_HASH_KEY);
  localStorage.removeItem(PIN_SALT_KEY);
}
