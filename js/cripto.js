// Cripto: PBKDF2-SHA256 + AES-256-GCM con Web Crypto (sin librerías).
const enc = new TextEncoder();
const dec = new TextDecoder();

export function disponible() {
  return !!(globalThis.crypto && crypto.subtle);
}

export function b64aBytes(s) {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

export function bytesAb64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function sha256Hex(texto) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Deriva 32 bytes con PBKDF2-HMAC-SHA256. */
export async function derivar(password, saltB64, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64aBytes(saltB64), iterations: iter }, base, 256);
  return new Uint8Array(bits);
}

export function importarClave(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
}

/** Descifra AES-GCM (el tag de 16 bytes va al final de ct) y parsea JSON. */
export async function descifrar(clave, ivB64, ctB64) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64aBytes(ivB64) }, clave, b64aBytes(ctB64));
  return JSON.parse(dec.decode(pt));
}
