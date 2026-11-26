// Sesión: login, restauración, llavero en memoria y caché de perfiles descifrados.
import * as C from './cripto.js';
import * as L from './llavero.js';
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
export class ErrorProfesor extends Error {}   // un profesor (admin) intentó ingresar en la versión pública: entra por el Panel del profesor

/** Los profesores entran solo por la puerta del club. En la versión pública (github.io) el ingreso es solo para nadadores. */
function entradaProfesorBloqueada() {
  const h = location.hostname;
  return !bajoPuerta() && h !== 'localhost' && h !== '127.0.0.1' && h !== '[::1]';   // vista previa en la PC del club: permitida
}

let actual = null;                 // { rol, nombre, perfiles, h, recordar, forzarClave }
let llave = null;                  // { h, k }: la llave que abrió el llavero (solo en memoria; k es un Uint8Array)
const cache = new Map();           // id -> perfil preparado
const promesas = new Map();

export const sesionActual = () => actual;

/** Igual que normUsuario del Worker y usuario_de de cifrar.py: NFD sin tildes, minúsculas, solo letras, números, punto, guion y guion bajo (sin espacios), 60 como máximo. */
export function normalizarUsuario(u) {
  return String(u || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 60);
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

function guardar(h, claveRaw, forzar = false) {
  const v = JSON.stringify(forzar ? { h, k: C.bytesAb64(claveRaw), f: 1 } : { h, k: C.bytesAb64(claveRaw) });   // f: entró con un código temporal y debe elegir su clave
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

function fijar(llavero, h, recordar, k, forzar = false) {
  actual = { rol: llavero.rol, nombre: llavero.nombre, perfiles: llavero.perfiles || [], h, recordar, forzarClave: !!forzar };
  llave = { h, k };
  return actual;
}

export async function iniciar(usuario, password, recordar) {
  if (!C.disponible()) throw new ErrorRed('Este navegador necesita una conexión segura (https) para abrir el portal.');
  const u = normalizarUsuario(usuario);
  const p = String(password || '').trim();
  if (!u || !p) throw new ErrorCredenciales();
  const h = await C.sha256Hex(u);
  const doc = await pedirJSON(`datos/u/${h}.json`);
  if (!doc) throw new ErrorCredenciales();
  let r;
  try { r = await L.abrirDoc(doc, p); } catch { r = null; }
  if (!r) throw new ErrorCredenciales();
  if (r.contenido.rol === 'admin' && entradaProfesorBloqueada()) throw new ErrorProfesor();
  const forzar = r.via === 'tmp';        // entró con el código temporal del entrenador: tiene que elegir su clave antes de seguir
  guardar(h, r.k, forzar);
  recordarUsuario(usuario, !!recordar);
  return fijar(r.contenido, h, !!recordar, r.k, forzar);
}

/* Ingreso único: dentro de la puerta del club (https://…/portal/) la puerta ya sabe quién es el profesor.
   Entrega, solo al mismo origen y con su cookie, la clave derivada del llavero; así el portal se abre solo.
   Fuera de la puerta (github.io, vista previa local) esto no hace nada y el portal funciona como siempre. */
export function bajoPuerta() {
  return location.pathname === '/portal' || location.pathname.startsWith('/portal/');
}

async function entrarPorPuerta() {
  if (!bajoPuerta()) return null;
  let j;
  try {
    const r = await fetch('/portal-sesion', { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) return null;
    j = await r.json();
  } catch { return null; }
  if (!j || j.ok !== true || !j.usuario || !j.k) return null;
  try {
    const h = await C.sha256Hex(normalizarUsuario(j.usuario));
    const llavero = await abrirLlavero(h, C.b64aBytes(j.k));
    return fijar(llavero, h, false, C.b64aBytes(j.k));
  } catch { return null; }   // sin material válido (p. ej. datos nuevos): se muestra el ingreso normal
}

/** Cierra también la sesión de la puerta (solo dentro de la puerta). Devuelve true si redirige. */
export async function salirDePuerta() {
  if (!bajoPuerta()) return false;
  try { await fetch('/salir', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '' }); } catch {}
  location.replace('/ingreso');
  return true;
}

export async function restaurar() {
  if (!C.disponible()) return null;
  const p = await entrarPorPuerta();
  if (p) return p;
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
    if (llavero.rol === 'admin' && entradaProfesorBloqueada()) { limpiarAlmacen(); return null; }
    return fijar(llavero, guardado.h, recordar, C.b64aBytes(guardado.k), !!guardado.f);
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
  llave = null;
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

/* ------------------------------------------------------------------ */
/* Cambio de clave y acceso nuevo (solo con la nube: bajoPuerta())     */
/* ------------------------------------------------------------------ */
export class ErrorCambio extends Error {}   // el mensaje ya está listo para mostrarse

async function enviar(url, cuerpo, metodo = 'POST') {
  let r;
  try {
    r = await fetch(url, { method: metodo, credentials: 'same-origin', cache: 'no-store',
      headers: metodo === 'POST' ? { 'Content-Type': 'application/json' } : {}, body: metodo === 'POST' ? JSON.stringify(cuerpo) : undefined });
  } catch { throw new ErrorCambio('No pudimos conectar. Revisa tu conexión e intenta de nuevo.'); }
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, j: j || {} };
}

function falloCambio(r) {
  const e = r.j && r.j.error;
  if (r.status === 429) return new ErrorCambio('Demasiados intentos. Espera unos minutos y vuelve a intentar.');
  if (r.status === 403 && e === 'actual') return new ErrorCambio('La clave actual no es correcta.');
  if (r.status === 409) return new ErrorCambio('Tu llavero cambió en otro celular justo ahora. Sal, vuelve a entrar e intenta de nuevo.');
  if (r.status === 403 && e === 'vencido') return new ErrorCambio('Tu código temporal venció. Pide uno nuevo a tu entrenador.');
  if (r.status === 403) return new ErrorCambio('Tu llavero cambió en otro celular. Sal y vuelve a entrar.');
  if (r.status === 401) return new ErrorCambio('La sesión venció. Sal y vuelve a entrar.');
  return new ErrorCambio('No se pudo guardar. Intenta de nuevo; si sigue igual, avisa a tu entrenador.');
}

/** Cambia la clave de quien está dentro. `nueva` es una clave generada (al azar o 5 palabras).
 *  SIEMPRE se genera una llave maestra nueva y las huellas se desactivan (devuelve { huellasPerdidas }).
 *  (La clave nueva NO cambia las llaves de datos de los perfiles: eso solo lo hace cifrar.py --nuevas-claves.) Los profesores deben dar su clave `actual`
 *  (el Worker la comprueba y guarda el hash nuevo en la misma operación que el llavero: o se cambian las dos cosas o ninguna). */
export async function cambiarClave(nueva, { actual: claveActual = '' } = {}) {
  if (!bajoPuerta() || !actual || !llave) throw new ErrorCambio('Cambiar la clave solo funciona dentro del portal del club.');
  const esProfe = actual.rol === 'admin';
  const { h, k } = llave;
  const { doc, prev } = await pedirLlavero(h);
  let contenido;
  try { contenido = await L.abrirConK(doc, k); } catch { throw new ErrorCambio('Tu llavero cambió en otro celular. Sal y vuelve a entrar.'); }
  const token = await L.tokenDe(k);
  const { doc: nuevo, k: kNueva, huellasPerdidas } = await L.llaveroConClaveNueva(doc, k, contenido, nueva);
  let r;
  if (esProfe) {
    const q = await enviar('/clave-profesor', null, 'GET');
    if (!q.j.ok || !q.j.iter || !q.j.salt) throw falloCambio(q);
    const hash = await L.hashProfesor(nueva, q.j.iter, q.j.salt);
    r = await enviar('/clave-profesor', { actual: claveActual, hash, sal: { exp: q.j.exp, mac: q.j.mac }, llavero: { h, token, doc: nuevo }, pk: C.bytesAb64(kNueva), prev });
  } else {
    r = await enviar('/portal/api/llavero', { h, token, llavero: nuevo, prev });
  }
  if (r.status !== 200 || !r.j.ok) throw falloCambio(r);
  llave = { h, k: kNueva };
  let enAlmacen = false;
  try { enAlmacen = !!sessionStorage.getItem(KEY); } catch {}
  if (enAlmacen || !esProfe) guardar(h, kNueva, false);   // sin la bandera "f": ya eligió su clave
  actual.forzarClave = false;
  cache.clear(); promesas.clear();
  return { huellasPerdidas };
}

/** El entrenador da un acceso nuevo a un nadador: se arma en este navegador un llavero v2 con un código temporal (48 h) y se sube a la nube.
 *  Devuelve { codigo, exp }. El código no se guarda en ninguna parte. */
export async function darAccesoNuevo(perfil) {
  if (!bajoPuerta() || !actual || actual.rol !== 'admin') throw new ErrorCambio('Esto solo funciona dentro del portal del club.');
  if (!perfil || !perfil.usuario) throw new ErrorCambio('Este nadador no tiene usuario propio.');
  const k = crypto.getRandomValues(new Uint8Array(32));
  const codigo = L.claveAzar();
  const exp = Math.ceil((Date.now() + L.HORAS_TMP * 3600 * 1000) / 3600000) * 3600000;      // se redondea a la hora hacia arriba (el Worker lo exige)
  const { usuario, ...ref } = perfil;                      // el llavero del nadador es idéntico al de siempre (sin el campo usuario)
  const contenido = { rol: 'nadador', nombre: perfil.etiqueta, perfiles: [ref] };
  const llavero = await L.armarV2({ contenido, k, tmp: { texto: codigo, exp } });
  const r = await enviar('/portal/api/acceso-nuevo', { usuario, llavero });
  if (r.status === 404) throw new ErrorCambio('Ese nadador no tiene llavero en la nube.');
  if (r.status !== 200 || !r.j.ok) throw falloCambio(r);
  return { codigo, exp };
}

/* ------------------------------------------------------------------ */
/* Entrar con huella o cara (Fase 2; solo con la nube y si el celular puede) */
/* ------------------------------------------------------------------ */
/** ¿Se ofrece "Entrar con huella o cara"? Solo dentro de la nube (bajoPuerta) y si el celular tiene autenticador de plataforma.
 *  En la versión pública (github.io) siempre es false y ni siquiera se carga js/huella.js. */
export async function huellaDisponible() {
  if (!bajoPuerta() || !C.disponible()) return false;
  try { return await (await import('./huella.js')).disponible(); } catch { return false; }
}

/** Llavero de h y el SHA-256 del texto exacto que se leyó (`prev`): el Worker lo compara con el que tiene y, si otro cambio ganó, responde 409. */
async function pedirLlavero(h) {
  let r;
  try { r = await fetch(`datos/u/${h}.json`, { cache: 'no-cache' }); } catch { throw new ErrorCambio('No pudimos conectar. Revisa tu conexión e intenta de nuevo.'); }
  if (r.status === 404) throw new ErrorCambio('No encontramos tu llavero. Avisa a tu entrenador.');
  if (!r.ok) throw new ErrorCambio('No pudimos conectar. Revisa tu conexión e intenta de nuevo.');
  const txt = await r.text();
  let doc;
  try { doc = JSON.parse(txt); } catch { throw new ErrorCambio('No encontramos tu llavero. Avisa a tu entrenador.'); }
  return { doc, prev: await C.sha256Hex(txt) };
}
async function llaveroPropio() { return (await pedirLlavero(llave.h)).doc; }

/** Celulares con huella de quien está dentro: [{ cred, nombre, creado }]. El nombre y la fecha viven DENTRO del contenido cifrado del llavero
 *  (contenido.celulares); el Worker solo ve las ranuras pk (cred, iv, ct). Se muestran solo los que todavía tienen su ranura. */
export async function huellasGuardadas() {
  if (!bajoPuerta() || !actual || !llave) return [];
  const doc = await llaveroPropio();
  if (doc.v !== 2 || !Array.isArray(doc.ranuras)) return [];
  let contenido;
  try { contenido = await L.abrirConK(doc, llave.k); } catch { throw new ErrorCambio('Tu llavero cambió en otro celular. Sal y vuelve a entrar.'); }
  const guardados = Array.isArray(contenido.celulares) ? contenido.celulares : [];
  return doc.ranuras.filter((r) => r.t === 'pk').map((r) => {
    const c = guardados.find((x) => x && x.cred === r.cred) || {};
    return { cred: r.cred, nombre: String(c.nombre || 'Celular'), creado: c.creado || 0 };
  });
}

function nombreCelularSugerido() {
  const ua = navigator.userAgent || '';
  if (/iPhone/.test(ua)) return 'iPhone'; if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Celular Android';
  if (/Windows/.test(ua)) return 'Computador Windows'; if (/Mac/.test(ua)) return 'Mac';
  return 'Mi celular';
}
export { nombreCelularSugerido };

function guardaLlaveNueva(esProfe, h, kNueva) {
  llave = { h, k: kNueva };
  let enAlmacen = false;
  try { enAlmacen = !!sessionStorage.getItem(KEY); } catch {}
  if (enAlmacen || !esProfe) guardar(h, kNueva, false);
}

/** Primer nombre para el título de la passkey ("Sofía · Club Náutico"): distingue a los hermanos sin mostrar el apellido. */
function primerNombre() {
  const n = String((actual && actual.nombre) || '').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0];
  return n || 'Club Náutico';
}

/** Activa la huella o cara en ESTE celular. Pide la clave actual (en nadadores y profesores): crea la passkey, envuelve K con la salida PRF (ranura pk)
 *  y sube el llavero. Agregar un celular NO rota K: las huellas de los demás celulares se conservan. Si el llavero venía de v1 (copias viejas) se pasa a v2
 *  con K nueva. Profesores: además la llave pública va a la nube (/pk/registro, que vuelve a comprobar la clave actual, en la misma operación). */
export async function activarHuella(nombre, claveActual) {
  if (!bajoPuerta() || !actual || !llave) throw new ErrorCambio('Esto solo funciona dentro del portal del club.');
  nombre = String(nombre || '').trim().slice(0, 40) || nombreCelularSugerido();
  const H = await import('./huella.js');
  const esProfe = actual.rol === 'admin';
  const { h, k } = llave;
  const { doc, prev } = await pedirLlavero(h);
  if (!(await L.esClaveActual(doc, String(claveActual || ''), k))) throw new ErrorCambio('La clave actual no es correcta.');
  let contenido;
  try { contenido = await L.abrirConK(doc, k); } catch { throw new ErrorCambio('Tu llavero cambió en otro celular. Sal y vuelve a entrar.'); }
  const previas = doc.v === 2 ? doc.ranuras.filter((r) => r.t === 'pk') : [];
  if (previas.length >= 8) throw new ErrorCambio('Ya hay muchos celulares con huella. Quita alguno antes de activar otro.');
  let c;
  try { c = await H.crear({ h, name: 'Club Náutico', displayName: `${primerNombre()} · Club Náutico`, excluir: previas.map((r) => L.b64uAbytes(r.cred)) }); }
  catch (e) { throw new ErrorCambio(e instanceof H.ErrorHuella ? e.message : 'No se pudo usar la huella en este celular. Sigue con tu clave.'); }
  const llaveH = await L.llaveDeHuella(c.prf, c.credId);
  const credB64u = L.bytesAb64u(c.credId);
  const celulares = [...(Array.isArray(contenido.celulares) ? contenido.celulares : []).filter((x) => x && x.cred !== credB64u), { cred: credB64u, nombre, creado: Date.now() }];
  const contenidoNuevo = { ...contenido, celulares };
  let kNueva = k, ranuras = doc.v === 2 ? doc.ranuras : [], base = null;
  if (doc.v === 1) { const m = await L.migrarV1(doc, k, contenidoNuevo); kNueva = m.k; ranuras = m.doc.ranuras; base = m.doc; }
  const slot = await L.ranuraPk(c.credId, llaveH, kNueva);
  ranuras = [...ranuras.filter((r) => !(r.t === 'pk' && r.cred === slot.cred)), slot];
  if (ranuras.length > 10) throw new ErrorCambio('Ya hay muchos celulares con huella. Quita alguno antes de activar otro.');
  const nuevo = base ? { ...base, ranuras } : await L.conContenido(doc, kNueva, contenidoNuevo, ranuras);
  const token = await L.tokenDe(k);
  const r = esProfe
    ? await enviar('/pk/registro', { cred: slot.cred, pub: C.bytesAb64(c.spki), alg: c.alg, actual: String(claveActual), llavero: { h, token, doc: nuevo }, prev, ...(doc.v === 1 ? { pk: C.bytesAb64(kNueva) } : {}) })
    : await enviar('/portal/api/llavero', { h, token, llavero: nuevo, prev });
  if (r.status === 409 && r.j.error !== 'otro cambio ganó, recarga') throw new ErrorCambio('Ya hay muchos celulares con huella. Quita alguno antes de activar otro.');
  if (r.status !== 200 || !r.j.ok) throw falloCambio(r);
  guardaLlaveNueva(esProfe, h, kNueva);
  cache.clear(); promesas.clear();
  return { nombre };
}

/** Quita un celular de "Mis celulares con huella". Pide la clave actual y, POR SEGURIDAD, rota la llave maestra: se genera una K' nueva, el llavero queda
 *  con la ranura pw nueva y se descartan TODAS las ranuras pk (también las de los demás celulares, que tendrán que activar la huella otra vez);
 *  si es profesor, también se borran sus llaves públicas de la nube y caducan sus otras sesiones. `cred` identifica el celular que se quita. */
export async function quitarHuella(cred, claveActual) {
  if (!bajoPuerta() || !actual || !llave) throw new ErrorCambio('Esto solo funciona dentro del portal del club.');
  const esProfe = actual.rol === 'admin';
  const { h, k } = llave;
  const { doc, prev } = await pedirLlavero(h);
  if (!(await L.esClaveActual(doc, String(claveActual || ''), k))) throw new ErrorCambio('La clave actual no es correcta.');
  if (doc.v !== 2 || !doc.ranuras.some((r) => r.t === 'pk' && r.cred === cred)) return { otros: 0 };       // ya no estaba
  let contenido;
  try { contenido = await L.abrirConK(doc, k); } catch { throw new ErrorCambio('Tu llavero cambió en otro celular. Sal y vuelve a entrar.'); }
  const otros = doc.ranuras.filter((r) => r.t === 'pk' && r.cred !== cred).length;
  const { doc: nuevo, k: kNueva } = await L.llaveroConClaveNueva(doc, k, contenido, String(claveActual));
  const token = await L.tokenDe(k);
  const r = esProfe
    ? await enviar('/pk/quitar', { actual: String(claveActual), llavero: { h, token, doc: nuevo }, pk: C.bytesAb64(kNueva), prev })
    : await enviar('/portal/api/llavero', { h, token, llavero: nuevo, prev });
  if (r.status !== 200 || !r.j.ok) throw falloCambio(r);
  guardaLlaveNueva(esProfe, h, kNueva);
  cache.clear(); promesas.clear();
  try { const H = await import('./huella.js'); await H.avisarQuitada(L.b64uAbytes(cred)); } catch {}
  return { otros };
}
