// Sesión: login, restauración, llavero en memoria y caché de perfiles descifrados.
import * as C from './cripto.js';
import { prepararPerfil } from './datos.js';

const KEY = 'portal.sesion.v1';
const KEY_USUARIO = 'portal.usuario.v1';   // solo el nombre de usuario (nunca la clave) para prellenar el login

/** Migración: versiones anteriores guardaban la clave derivada en localStorage. Se borra siempre. */
try { localStorage.removeItem(KEY); } catch {}

export function usuarioRecordado() {
  try { return localStorage.getItem(KEY_USUARIO) || ''; } catch { return ''; }
}

export class ErrorCredenciales extends Error {}
export class ErrorRed extends Error {}

let actual = null;                 // { rol, nombre, perfiles, h, recordar }
const cache = new Map();           // id -> perfil preparado
const promesas = new Map();

export const sesionActual = () => actual;

export function normalizarUsuario(u) {
  return String(u || '').toLowerCase().replace(/\s+/g, '');
}
export function normalizarPassword(p) {
  return String(p || '').toUpperCase().replace(/\s+/g, '');
}

async function pedirJSON(url) {
  let r;
  try {
    r = await fetch(url, { cache: 'no-cache' });
  } catch {
    throw new ErrorRed('sin conexión');
  }
  if (r.status === 404) return null;
  if (!r.ok) throw new ErrorRed(`HTTP ${r.status}`);
  try {
    return await r.json();
  } catch {
    throw new ErrorRed('respuesta inválida');
  }
}

async function abrirLlavero(h, claveRaw) {
  const doc = await pedirJSON(`datos/u/${h}.json`);
  if (!doc) throw new ErrorCredenciales();
  try {
    const clave = await C.importarClave(claveRaw);
    return await C.descifrar(clave, doc.iv, doc.ct);
  } catch {
    throw new ErrorCredenciales();
  }
}

function guardar(h, claveRaw, recordar) {
  const v = JSON.stringify({ h, k: C.bytesAb64(claveRaw) });
  try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch {}
  // La clave derivada vive solo en sessionStorage (se pierde al cerrar la pestaña/navegador).
  try { sessionStorage.setItem(KEY, v); } catch {}
}

function recordarUsuario(usuario, recordar) {
  try {
    if (recordar) localStorage.setItem(KEY_USUARIO, String(usuario || '').trim());
    else localStorage.removeItem(KEY_USUARIO);
  } catch {}
}

function fijar(llavero, h, recordar) {
  actual = { rol: llavero.rol, nombre: llavero.nombre, perfiles: llavero.perfiles || [], h, recordar };
  return actual;
}

export async function iniciar(usuario, password, recordar) {
  if (!C.disponible()) throw new ErrorRed('Este navegador necesita una conexión segura (https) para abrir el portal.');
  const u = normalizarUsuario(usuario);
  const p = normalizarPassword(password);
  if (!u || !p) throw new ErrorCredenciales();
  const h = await C.sha256Hex(u);
  const doc = await pedirJSON(`datos/u/${h}.json`);
  if (!doc) throw new ErrorCredenciales();
  let raw, llavero;
  try {
    raw = await C.derivar(p, doc.salt, doc.iter || 600000);
    llavero = await C.descifrar(await C.importarClave(raw), doc.iv, doc.ct);
  } catch {
    throw new ErrorCredenciales();
  }
  guardar(h, raw, !!recordar);
  recordarUsuario(usuario, !!recordar);
  return fijar(llavero, h, !!recordar);
}

export async function restaurar() {
  if (!C.disponible()) return null;
  let guardado = null, recordar = false;
  try { localStorage.removeItem(KEY); } catch {}   // migración: nunca restaurar desde localStorage
  for (const [st, rec] of [[sessionStorage, false]]) {
    try {
      const v = st.getItem(KEY);
      if (v) { guardado = JSON.parse(v); recordar = rec; break; }
    } catch {}
  }
  if (!guardado) return null;
  try {
    const llavero = await abrirLlavero(guardado.h, C.b64aBytes(guardado.k));
    return fijar(llavero, guardado.h, recordar);
  } catch (e) {
    if (e instanceof ErrorCredenciales) { limpiarAlmacen(); return null; }
    throw e;
  }
}

function limpiarAlmacen() {
  try { sessionStorage.removeItem(KEY); } catch {}
  try { localStorage.removeItem(KEY); } catch {}
}

export function cerrar() {
  limpiarAlmacen();
  try { sessionStorage.removeItem('portal.nadador'); } catch {}
  actual = null;
  cache.clear();
  promesas.clear();
}

/** Descifra (y cachea) el perfil de un nadador a partir de su entrada del llavero. */
export function cargarPerfil(ref) {
  if (cache.has(ref.id)) return Promise.resolve(cache.get(ref.id));
  if (promesas.has(ref.id)) return promesas.get(ref.id);
  const pr = (async () => {
    const doc = await pedirJSON(`datos/d/${ref.token}.json`);
    if (!doc) throw new ErrorRed('perfil no encontrado');
    let datos;
    try {
      datos = await C.descifrar(await C.importarClave(C.b64aBytes(ref.clave)), doc.iv, doc.ct);
    } catch {
      throw new ErrorRed('datos dañados');
    }
    const p = prepararPerfil(datos);
    cache.set(ref.id, p);
    return p;
  })();
  promesas.set(ref.id, pr);
  pr.catch(() => promesas.delete(ref.id));
  return pr;
}
