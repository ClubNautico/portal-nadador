// Herramientas de ADMINISTRADOR (comparador y postas): carga de todos los nadadores y cálculo de mejores marcas.
// Solo lo importan vistas/comparar.js y vistas/postas.js, que a su vez solo se cargan si la sesión es de admin.
import * as Sesion from './sesion.js';
import { nombreLimpio } from './formato.js';

export const ESTILOS_POSTA = ['Espalda', 'Pecho', 'Mariposa', 'Libre'];   // orden del combinado

let cacheDe = null;       // sesión a la que pertenece el caché
let cachePromesa = null;
let cacheLista = null;

/**
 * Descifra los perfiles de TODOS los nadadores del llavero (solo admins) con pocas peticiones a la vez.
 * Devuelve [{ id, nombre, grupo, sexo, perfil }]. onProgreso(hechos, total).
 */
export async function cargarTodos(sesion, onProgreso) {
  if (!sesion || sesion.rol !== 'admin') throw new Error('Solo para administradores');
  if (cacheDe !== sesion) { cacheDe = sesion; cachePromesa = null; cacheLista = null; }
  if (cacheLista) { onProgreso?.(cacheLista.length, cacheLista.length); return cacheLista; }
  if (cachePromesa) return cachePromesa;
  const refs = sesion.perfiles;
  const salida = new Array(refs.length);
  let hechos = 0, siguiente = 0, fallos = 0;
  onProgreso?.(0, refs.length);
  async function trabajador() {
    while (siguiente < refs.length) {
      const i = siguiente++;
      const ref = refs[i];
      try {
        const p = await Sesion.cargarPerfil(ref);
        salida[i] = {
          id: ref.id,
          nombre: nombreLimpio(p.etiqueta || ref.etiqueta),
          grupo: p.grupo || 'Sin grupo',
          sexo: p.sexo === 'F' || p.sexo === 'M' ? p.sexo : null,
          perfil: p,
          ...categoriaDe(p),
        };
      } catch { fallos++; }
      hechos++;
      onProgreso?.(hechos, refs.length);
    }
  }
  const p = Promise.all(Array.from({ length: Math.min(6, refs.length || 1) }, trabajador)).then(() => {
    const lista = salida.filter(Boolean);
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    lista.fallos = fallos;
    if (cacheDe === sesion) cacheLista = lista;
    return lista;
  });
  cachePromesa = p;
  p.catch(() => { if (cachePromesa === p) cachePromesa = null; });
  return p;
}

/* ---------- categoría por edad ----------
 * Regla del club: la categoría es la EDAD QUE TIENE EL NADADOR EL 1 DE ENERO del año en curso.
 * Los datos traen solo el año de nacimiento (`anioNac`); edad al 1/1/A = A − anioNac − 1 (nadie nace un 1 de enero en los datos).
 * Si falta el año, se usa la categoría del Maestro (`categoria`) como respaldo y se marca como estimada. */
export const CATS = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: '9-10', etiqueta: '9-10' },
  { valor: '11-12', etiqueta: '11-12' },
  { valor: '13-14', etiqueta: '13-14' },
  { valor: '15-17', etiqueta: '15-17' },
  { valor: '18+', etiqueta: '18 y más' },
];
const CAT_IDX = new Map(CATS.map((c, i) => [c.valor, i]));
export const catIdx = (v) => CAT_IDX.get(v) ?? -1;
export const catEtiqueta = (v) => CATS.find((c) => c.valor === v)?.etiqueta || '';

function catPorEdad(e) { return e < 9 ? null : e <= 10 ? '9-10' : e <= 12 ? '11-12' : e <= 14 ? '13-14' : e <= 17 ? '15-17' : '18+'; }

/** { cat: '9-10'|…|'18+'|null, edad1: edad al 1 de enero (o null), estim: true si sale de la categoría del Maestro, menor: true si < 9 }. */
export function categoriaDe(perfil, anio = new Date().getFullYear()) {
  const a = Number(perfil?.anioNac);
  if (Number.isInteger(a) && a > 1900 && a < anio) { const e = anio - a - 1; return { cat: catPorEdad(e), edad1: e, estim: false, menor: e < 9 }; }
  const c = String(perfil?.categoria || '').toLowerCase();
  if (/master/.test(c)) return { cat: '18+', edad1: null, estim: true, menor: false };
  if (/menores/.test(c)) return { cat: null, edad1: null, estim: true, menor: true };
  const m = c.match(/^(\d+)\s*a\s*\d+/);
  if (m) return { cat: catPorEdad(Number(m[1])), edad1: null, estim: true, menor: false };
  return { cat: null, edad1: null, estim: true, menor: false };
}

/** ¿El nadador entra en la categoría elegida? (`chicos`: también las categorías menores, pero nunca los menores de 9 ni los sin dato). */
export function enCategoria(n, sel, chicos = false) {
  if (!sel || sel === 'todas') return true;
  if (!n.cat) return false;
  const i = catIdx(n.cat), j = catIdx(sel);
  return chicos ? i <= j : i === j;
}

/** Texto corto: "14 años al 1/1 · 13-14", "categoría 18 y más (sin fecha de nacimiento)" o "sin categoría". */
export function textoCategoria(n) {
  if (n.edad1 != null) return `${n.edad1} años al 1/1 · ${n.cat ? catEtiqueta(n.cat) : 'menor de 9'}`;
  if (n.cat) return `${catEtiqueta(n.cat)} (sin fecha de nacimiento)`;
  return n.menor ? 'menor de 9' : 'sin dato de edad';
}

/** Fecha mínima (UTC, ms) de "el último año": hoy menos 12 meses. */
export function inicioUltimoAnio(hoy = new Date()) {
  return Date.UTC(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate());
}

/**
 * Mejor marca de un nadador en una prueba y piscina.
 * modo: 'historica' | 'anio'. Devuelve la marca ({s, f, ev, exh, ...}) o null.
 * En empate gana la más antigua (igual que `mejores` en los datos).
 */
export function mejorMarca(perfil, est, dist, piscina, modo) {
  const pr = perfil._pruebas?.get(`${est}|${dist}|${piscina}`);
  if (!pr) return null;
  const desde = modo === 'anio' ? inicioUltimoAnio() : -Infinity;
  let mejor = null;
  for (const m of pr.marcas) {      // ordenadas por fecha
    if (m.ms < desde) continue;
    if (!mejor || m.s < mejor.s) mejor = m;
  }
  return mejor;
}

/** Pruebas disponibles en los datos: Map piscina -> Map estilo -> [distancias ordenadas]. */
export function pruebasDisponibles(lista) {
  const r = new Map();
  for (const n of lista) for (const pr of n.perfil._pruebas.values()) {
    if (!r.has(pr.c)) r.set(pr.c, new Map());
    const m = r.get(pr.c);
    if (!m.has(pr.est)) m.set(pr.est, new Set());
    m.get(pr.est).add(pr.dist);
  }
  const fin = new Map();
  for (const [c, m] of r) fin.set(c, new Map([...m].map(([e, s]) => [e, [...s].sort((a, b) => a - b)])));
  return fin;
}

export const MODOS = [
  { valor: 'historica', etiqueta: 'Mejor marca' },
  { valor: 'anio', etiqueta: 'Mejor del último año' },
];

/** Fila de enlaces entre las pantallas de administrador (HTML). */
export function navAdminHtml(actual, icono, esc) {
  const items = [['nadadores', 'Nadadores', 'usuarios'], ['comparar', 'Comparar nadadores', 'comparar'], ['postas', 'Armar postas', 'postas']];
  return `<nav class="adm-nav" aria-label="Pantallas de administrador">${items.map(([n, t, i]) =>
    `<a class="chip adm-nav-a" href="#/${n}" ${n === actual ? 'aria-current="page"' : ''}>${icono(i, 18)}<span>${esc(t)}</span></a>`).join('')}</nav>`;
}

/** Texto de la diferencia con el más rápido: "+0.84 s" (o "+1:02.10" si pasa de un minuto). */
export function textoDif(dif, fmtTiempo) {
  const a = Math.abs(dif);
  return `${dif < 0 ? '−' : '+'}${a >= 60 ? fmtTiempo(a) : a.toFixed(2) + ' s'}`;
}
