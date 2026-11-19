// Cálculos sobre el JSON del nadador (compartidos por todas las vistas).
import { normalizar, tituloEvento } from './formato.js';

export const ESTILOS = ['Libre', 'Espalda', 'Pecho', 'Mariposa', 'Combinado'];

export function msDe(f) {
  if (!f) return null;
  const [y, m, d] = f.split('-').map(Number);
  return Date.UTC(y, m - 1, d || 1);
}

/**
 * Añade al perfil descifrado los campos derivados (prefijo "_"):
 *  _t        marcas ordenadas por fecha; cada una con ms, mejorAntes y delta (mejor anterior - este tiempo; >0 = el tiempo bajó = mejora)
 *  _pruebas  Map "Libre|100|25" -> { key, est, dist, c, p, marcas[], mejor, primera }
 *  _comps    competencias agrupadas, de la más antigua a la más reciente
 */
export function prepararPerfil(raw) {
  // Datos que falten o vengan en null: se dejan vacíos para que ninguna vista se caiga.
  for (const k of ['tiempos', 'testsAgua', 'testsFisicos', 'rm', 'antropometria', 'asistencia', 'aguasAbiertas']) {
    if (!Array.isArray(raw[k])) raw[k] = [];
  }
  if (!raw.mejores || typeof raw.mejores !== 'object') raw.mejores = {};
  if (!raw.tecnica || typeof raw.tecnica !== 'object' || Array.isArray(raw.tecnica)) raw.tecnica = {};
  for (const k of ['evals', 'mejorar', 'brazadas']) if (!Array.isArray(raw.tecnica[k])) raw.tecnica[k] = [];
  const t = (raw.tiempos || []).filter((m) => m.f && m.s != null).map((m, i) => ({ ...m, _i: i, ms: msDe(m.f) }));
  t.sort((a, b) => a.ms - b.ms || a._i - b._i);

  const pruebas = new Map();
  for (const m of t) {
    const key = `${m.est}|${m.dist}|${m.c}`;
    let pr = pruebas.get(key);
    if (!pr) {
      pr = { key, est: m.est, dist: m.dist, c: m.c, p: m.p, marcas: [], mejor: null, primera: null, _dia: null, _diaMejor: Infinity, _prev: Infinity };
      pruebas.set(key, pr);
    }
    if (m.ms !== pr._dia) {
      pr._prev = Math.min(pr._prev, pr._diaMejor);
      pr._diaMejor = Infinity;
      pr._dia = m.ms;
    }
    m.mejorAntes = pr._prev === Infinity ? null : pr._prev;
    m.delta = m.mejorAntes == null ? null : m.mejorAntes - m.s;
    m.esRP = !!m.pb && !m.primera;
    pr._diaMejor = Math.min(pr._diaMejor, m.s);
    pr.marcas.push(m);
    if (!pr.mejor || m.s < pr.mejor.s) pr.mejor = m;
  }
  for (const pr of pruebas.values()) {
    pr.primera = pr.marcas[0];
    delete pr._dia; delete pr._diaMejor; delete pr._prev;
  }

  raw._t = t;
  raw._pruebas = pruebas;
  raw._comps = agruparCompetencias(t);
  return raw;
}

const clavePrefijo = (ev) => normalizar(ev).replace(/[^a-z0-9]/g, '').slice(0, 14);

/** Agrupa marcas en competencias: mismo prefijo de nombre y fechas a <= 4 días de la última. */
export function agruparCompetencias(t) {
  const grupos = [];
  const abiertos = [];
  for (const m of t) {
    const k = clavePrefijo(m.ev);
    let g = null;
    for (let i = abiertos.length - 1; i >= 0; i--) {
      const a = abiertos[i];
      if (m.ms - a.msFin > 4 * 86400000) { abiertos.splice(i, 1); continue; }
      if (a.k === k) { g = a; break; }
    }
    if (!g) {
      g = { id: `c${grupos.length}`, k, ev: m.ev, ini: m.f, fin: m.f, msIni: m.ms, msFin: m.ms, items: [], nombres: new Map(), pools: new Set() };
      grupos.push(g);
      abiertos.push(g);
    }
    g.items.push(m);
    g.fin = m.f;
    g.msFin = m.ms;
    g.pools.add(m.c);
    g.nombres.set(m.ev, (g.nombres.get(m.ev) || 0) + 1);
  }
  for (const g of grupos) {
    let mejor = null;
    for (const [n, c] of g.nombres) if (!mejor || c > mejor[1] || (c === mejor[1] && n.length < mejor[0].length)) mejor = [n, c];
    g.nombre = tituloEvento(mejor[0]);
    g.rp = g.items.filter((m) => m.esRP).length;
    delete g.nombres;
  }
  return grupos;
}

export function estadisticas(pr) {
  const mejor = pr.mejor, primera = pr.primera;
  const mejoraS = primera.s - mejor.s;
  return { mejor, primera, veces: pr.marcas.length, mejoraS, mejoraPct: primera.s ? mejoraS / primera.s : 0 };
}

/** Últimos n récords personales (con cuánto mejoraron). */
export function ultimosRP(p, n = 5) {
  return p._t.filter((m) => m.esRP && m.delta != null && m.delta > 0).slice(-n).reverse();
}

/** Prueba (key) con más marcas; en empate, la más reciente. */
export function pruebaMasNadada(p) {
  let mejor = null;
  for (const pr of p._pruebas.values()) {
    if (!mejor || pr.marcas.length > mejor.marcas.length ||
      (pr.marcas.length === mejor.marcas.length && pr.marcas[pr.marcas.length - 1].ms > mejor.marcas[mejor.marcas.length - 1].ms)) mejor = pr;
  }
  return mejor;
}

export function ultimoPor(lista, campo = 'f') {
  if (!lista || !lista.length) return null;
  let m = null;
  for (const x of lista) if (x[campo] && (!m || x[campo] > m[campo])) m = x;
  return m || lista[lista.length - 1];
}
