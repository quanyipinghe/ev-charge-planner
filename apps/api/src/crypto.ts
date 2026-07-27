const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)));

// Built through the sized constructor so the buffer type is a plain ArrayBuffer,
// which is what the WebCrypto signatures require.
const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypts a reminder payload before it touches the database.
 *
 * Scheduled reminders necessarily carry the user's bot token or webhook URL, and
 * the app has no accounts to scope them to — so they are encrypted at rest with a
 * server-held key. Self-hosting remains the recommendation for anyone uneasy about
 * leaving credentials on someone else's instance.
 */
export async function encryptJson(value: unknown, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptJson<T>(payload: string, secret: string): Promise<T> {
  const [ivPart, dataPart] = payload.split('.');
  if (!ivPart || !dataPart) throw new Error('malformed encrypted payload');

  const key = await deriveKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivPart) },
    key,
    fromBase64(dataPart),
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}
