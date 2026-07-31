const CREDENTIAL_ID_KEY = 'vansales-webauthn-credential-id';

export function isBiometricSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

export function hasBiometricRegistered(): boolean {
  return !!localStorage.getItem(CREDENTIAL_ID_KEY);
}

function randomChallenge(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32)) as Uint8Array<ArrayBuffer>;
}

/** Registers this device's platform authenticator (fingerprint/face) for quick-unlock. */
export async function registerBiometric(userId: string, userName: string): Promise<{ error: string | null }> {
  if (!isBiometricSupported()) return { error: 'Biometric unlock isn\'t supported on this device/browser.' };
  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: 'Van Sales ERP' },
        user: { id: new TextEncoder().encode(userId), name: userName, displayName: userName },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000,
      },
    }) as PublicKeyCredential | null;
    if (!credential) return { error: 'Registration was cancelled.' };
    localStorage.setItem(CREDENTIAL_ID_KEY, credential.id);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Biometric registration failed.' };
  }
}

/** Verifies the registered platform authenticator (fingerprint/face) to unlock. */
export async function verifyBiometric(): Promise<boolean> {
  const credentialId = localStorage.getItem(CREDENTIAL_ID_KEY);
  if (!credentialId || !isBiometricSupported()) return false;
  try {
    const idBytes = Uint8Array.from(atob(credentialId.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: [{ id: idBytes, type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

export function clearBiometric(): void {
  localStorage.removeItem(CREDENTIAL_ID_KEY);
}
