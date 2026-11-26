// Llavero v2 con "ranuras" (WebCrypto puro, sin librerías). Ver COMO USAR.md ("Cambio de clave").
//   v1: { v:1, salt, iter, iv, ct, w? }   cerrado con PBKDF2(clave) -> AES-GCM. Esa clave derivada ES la llave del llavero.
//   v2: { v:2, iv, ct, w, ranuras:[...] } cerrado con una llave maestra K al azar. Cada ranura guarda K envuelta:
//        { t:'pw',  salt, iter, iv, ct }        la clave escrita
//        { t:'tmp', salt, iter, iv, ct, exp }   un código temporal que dio el entrenador (exp = ms desde 1970)
//        { t:'pk',  cred, iv, ct, nombre, creado }   huella o cara (Fase 2): K envuelta con la llave que sale de PRF + HKDF (ver huella.js)
// En los dos formatos la llave que abre `ct` se llama aquí "k" (v1: los bits de PBKDF2; v2: K).
// Token de escritura = HKDF-SHA256(k, info 'escribir') en hex; el Worker guarda w = SHA-256(token) y solo acepta cambios con un token cuyo hash sea w.
// Este módulo lo usan el portal y la entrada única de la nube (/portal/js/llavero.js), para que haya una sola implementación.
const enc = new TextEncoder();
const dec = new TextDecoder();

export const ITER = 600000;
export const HORAS_TMP = 48;
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // el mismo de cifrar.py (sin 0, 1, I, L, O)

/* ---------------------------------------------------------------- bytes */
export function b64aBytes(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
export function bytesAb64(u) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
const aHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(texto) { return aHex(await crypto.subtle.digest('SHA-256', enc.encode(texto))); }

/* ---------------------------------------------------------------- azar */
/** Entero al azar en [0, n) sin sesgo. */
export function azarEntero(n) {
  const lim = Math.floor(0x100000000 / n) * n, a = new Uint32Array(1);
  do { crypto.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % n;
}
/** Clave al azar XXXX-XXXX-XXXX (31 símbolos, 59 bits). */
export function claveAzar() {
  let s = '';
  for (let i = 0; i < 12; i++) { if (i && i % 4 === 0) s += '-'; s += ALFABETO[azarEntero(ALFABETO.length)]; }
  return s;
}
/** Clave de 5 palabras de la lista (unos 56 bits con 2446 palabras), en minúsculas y con guiones. `palabras` es el arreglo de palabras.js. */
export const N_PALABRAS = 5;
export function clavePalabras(palabras) {
  const p = [];
  for (let i = 0; i < N_PALABRAS; i++) p.push(palabras[azarEntero(palabras.length)]);
  return p.join('-');
}

/* ---------------------------------------------------------------- normalización de la clave escrita */
/** Textos que se prueban como clave. Formato al azar: XXXX-XXXX-XXXX (guiones, espacios y mayúsculas no importan).
 *  Palabras: minúsculas separadas por guion (se aceptan espacios y mayúsculas; desde 4 palabras, por las claves de 4 que se dieron antes). `legado` (llaveros v1): además el texto tal cual, como siempre. */
export function candidatos(texto, legado) {
  const t = String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const al = t.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const c = [];
  if (al.length === 12) c.push(al.slice(0, 4) + '-' + al.slice(4, 8) + '-' + al.slice(8));
  const pal = t.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (pal.length >= 4 && !/[0-9]/.test(t)) c.push(pal.join('-'));
  const limpio = t.toUpperCase().replace(/\s+/g, '');
  if ((legado || !c.length) && limpio && !c.includes(limpio)) c.push(limpio);
  return c;
}
/** El texto con el que se cierra una clave nueva (la misma regla de arriba, un solo candidato). */
export function canonica(texto) { return candidatos(texto, false)[0] || ''; }

/* ---------------------------------------------------------------- primitivas */
const aes = (raw, usos) => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, usos);
async function pbkdf2(texto, salt, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(texto), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, 256));
}
async function cifra(raw, claro) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(raw, ['encrypt']), claro));
  return { iv: bytesAb64(iv), ct: bytesAb64(ct) };
}
async function descifra(raw, ivB64, ctB64) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64aBytes(ivB64) }, await aes(raw, ['decrypt']), b64aBytes(ctB64)));
}

/** Token de escritura (hex de 32 bytes) que se deriva de la llave k del llavero. */
export async function tokenDe(k) {
  const base = await crypto.subtle.importKey('raw', k, 'HKDF', false, ['deriveBits']);
  return aHex(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('escribir') }, base, 256));
}
export const wDe = async (k) => sha256Hex(await tokenDe(k));

/** Texto cifrado del contenido de un llavero con la llave k (objeto -> { iv, ct }). */
export async function cifraContenido(k, contenido) { return cifra(k, enc.encode(JSON.stringify(contenido))); }

/** ¿`texto` es la clave actual de este llavero? (abre la ranura pw, o el llavero v1, y da la misma llave k que la sesión). */
export async function esClaveActual(doc, texto, k) {
  let r = null;
  try { r = await abrirDoc(doc, texto); } catch { r = null; }
  return !!r && r.via !== 'tmp' && r.k.length === k.length && r.k.every((x, i) => x === k[i]);
}

/** Una ranura de clave (pw o tmp) que guarda K envuelta con la clave escrita. */
export async function ranuraClave(tipo, texto, k, extra = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const clave = await pbkdf2(canonica(texto), salt, ITER);
  const { iv, ct } = await cifra(clave, k);
  return { t: tipo, salt: bytesAb64(salt), iter: ITER, iv, ct, ...extra };
}

/** Llavero v2 nuevo. contenido = {rol, nombre, perfiles}; k = llave maestra (32 bytes);
 *  pw = clave escrita (o null); tmp = {texto, exp} (o null); otras = ranuras que se conservan tal cual (las pk). */
export async function armarV2({ contenido, k, pw = null, tmp = null, otras = [] }) {
  const { iv, ct } = await cifra(k, enc.encode(JSON.stringify(contenido)));
  const ranuras = [];
  if (pw) ranuras.push(await ranuraClave('pw', pw, k));
  if (tmp) ranuras.push(await ranuraClave('tmp', tmp.texto, k, { exp: tmp.exp }));
  for (const r of otras) ranuras.push(r);
  return { v: 2, iv, ct, w: await wDe(k), ranuras };
}

/** Abre un llavero (v1 o v2) con la clave escrita. Devuelve { contenido, k, via, v, doc } o null si la clave no sirve.
 *  via: 'v1' | 'pw' | 'tmp'. Un código temporal vencido no sirve. */
export async function abrirDoc(doc, texto) {
  if (!doc || typeof doc !== 'object') return null;
  if (doc.v === 2 && Array.isArray(doc.ranuras)) {
    const cands = candidatos(texto, false);
    const orden = [...doc.ranuras.filter((r) => r.t === 'pw'), ...doc.ranuras.filter((r) => r.t === 'tmp' && !(r.exp < Date.now()))];
    const pruebas = [];
    for (const r of orden) {
      if (!(r.iter >= 1000 && r.iter <= 2000000)) continue;
      for (const c of cands) {
        pruebas.push((async () => {
          const k = await descifra(await pbkdf2(c, b64aBytes(r.salt), r.iter), r.iv, r.ct);
          if (k.length !== 32) throw new Error('k');
          const contenido = JSON.parse(dec.decode(await descifra(k, doc.iv, doc.ct)));
          return { contenido, k, via: r.t, v: 2, doc };
        })());
      }
    }
    const res = await Promise.allSettled(pruebas);
    const bien = res.find((x) => x.status === 'fulfilled');       // pw va primero: si coincide con las dos, gana la clave escrita
    return bien ? bien.value : null;
  }
  if (doc.v === 2 || !doc.salt || !(doc.iter >= 1000 && doc.iter <= 2000000)) return null;
  const pruebas = candidatos(texto, true).map(async (c) => {
    const k = await pbkdf2(c, b64aBytes(doc.salt), doc.iter);
    return { contenido: JSON.parse(dec.decode(await descifra(k, doc.iv, doc.ct))), k, via: 'v1', v: 1, doc };
  });
  const res = await Promise.allSettled(pruebas);
  const bien = res.find((x) => x.status === 'fulfilled');
  return bien ? bien.value : null;
}

/** Abre el contenido de un llavero (v1 o v2) con la llave k ya conocida. */
export async function abrirConK(doc, k) {
  return JSON.parse(dec.decode(await descifra(k, doc.iv, doc.ct)));
}

/** Llavero nuevo para una clave nueva (cambio de clave, o quitar un celular con la clave de siempre): SIEMPRE una K' nueva, el contenido cifrado de nuevo
 *  con ella y UNA sola ranura pw. Las ranuras pk y tmp se descartan (y la lista de celulares del contenido): así la K vieja y cualquier huella o
 *  código anterior dejan de servir. `huellasPerdidas` dice si había celulares con huella que hay que volver a activar. */
export async function llaveroConClaveNueva(doc, k, contenido, claveNueva) {
  const kNueva = crypto.getRandomValues(new Uint8Array(32));
  const huellasPerdidas = doc.v === 2 && doc.ranuras.some((r) => r.t === 'pk');
  const { celulares, ...limpio } = contenido;
  const nuevo = await armarV2({ contenido: limpio, k: kNueva, pw: claveNueva });
  return { doc: nuevo, k: kNueva, huellasPerdidas };
}

/* ---------------------------------------------------------------- huella o cara (ranura pk) */
export function b64uAbytes(s) { return b64aBytes(String(s).replace(/-/g, '+').replace(/_/g, '/')); }
export function bytesAb64u(u) { return bytesAb64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

/** Llave que envuelve K en una ranura pk: HKDF-SHA256(salida PRF, info = credId). La sal PRF es fija de la app (ver huella.js), así que la
 *  salida PRF ya es distinta por credencial; el credId en info separa además los usos. */
export async function llaveDeHuella(prf, credId) {
  const base = await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: credId }, base, 256));
}

/** Ranura pk: K envuelta con la llave de la huella (solo cred, iv y ct: el Worker no ve nada más). */
export async function ranuraPk(credId, llave, k) {
  const { iv, ct } = await cifra(llave, k);
  return { t: 'pk', cred: bytesAb64u(credId), iv, ct };        // el nombre y la fecha del celular van DENTRO del contenido cifrado (contenido.celulares)
}

/** K de una ranura pk, o lanza si la llave no es la de esa huella. */
export async function abrirRanuraPk(ranura, llave) {
  const k = await descifra(llave, ranura.iv, ranura.ct);
  if (k.length !== 32) throw new Error('k');
  return k;
}

/** Pasa un llavero v1 abierto (con su llave k de PBKDF2; solo copias viejas: cifrar.py ya genera v2) a v2: la clave escrita sigue valiendo como
 *  ranura pw, porque k ES PBKDF2(clave, sal, iter) y se usa tal cual para envolver la K nueva. Devuelve { doc, k: K nueva }. */
export async function migrarV1(doc, k, contenido) {
  if (doc.v !== 1) throw new Error('v1');
  const kNueva = crypto.getRandomValues(new Uint8Array(32));
  const { iv, ct } = await cifra(k, kNueva);
  const nuevo = await armarV2({ contenido, k: kNueva });
  nuevo.ranuras.push({ t: 'pw', salt: doc.salt, iter: doc.iter, iv, ct });
  return { doc: nuevo, k: kNueva };
}

/** Llavero v2 con la MISMA K pero el contenido cambiado (por ejemplo la lista de celulares) y las mismas ranuras (más o menos las que se pasen). */
export async function conContenido(doc, k, contenido, ranuras) {
  const { iv, ct } = await cifraContenido(k, contenido);
  return { v: 2, iv, ct, w: doc.w, ranuras };
}

/** Hash de la clave de un profesor para el login del Panel (mismo formato que el secreto USUARIOS del Worker: PBKDF2-SHA256, sal y hash en hex).
 *  El Worker aplica normClave (solo letras y números, en mayúsculas), así que aquí se hace igual. */
export async function hashProfesor(texto, iter, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g).map((x) => parseInt(x, 16)));      // la sal la da el Worker (firmada), el navegador ya no la elige
  const clave = canonica(texto).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return { salt: aHex(salt), iter, hash: aHex(await pbkdf2(clave, salt, iter)) };
}
