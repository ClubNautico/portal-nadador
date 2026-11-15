// Formato: tiempos m:ss.cc, fechas en español, deltas, texto.

export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const pad2 = (n) => String(n).padStart(2, '0');

/** Segundos -> "1:05.55", "28.40", "1:02:03.45". */
export function fmtTiempo(s) {
  if (s == null || !isFinite(s)) return '–';
  const cs = Math.round(s * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(sec)}.${pad2(c)}`;
  if (m > 0) return `${m}:${pad2(sec)}.${pad2(c)}`;
  return `${sec}.${pad2(c)}`;
}

/** Diferencia absoluta en segundos: "0.84" (o "1:02.10" si pasa de un minuto). */
export function fmtDelta(s) {
  return fmtTiempo(Math.abs(s));
}

export function parseISO(f) {
  if (!f) return null;
  const [y, m, d] = String(f).split('-').map(Number);
  return { y, m, d: d || 1 };
}

/** "2025-06-28" -> "28 jun 2025" */
export function fechaCorta(f) {
  const p = parseISO(f);
  if (!p) return 'sin fecha';
  return `${p.d} ${MESES[p.m - 1]} ${p.y}`;
}

/** "2025-06" o "2025-06-28" -> "jun 2025" */
export function fechaMes(f) {
  const p = parseISO(f);
  if (!p) return 'sin fecha';
  return `${MESES[p.m - 1]} ${p.y}`;
}

/** "2026-10" -> "Octubre 2026" */
export function mesLargo(f) {
  const p = parseISO(f);
  if (!p) return '';
  const n = MESES_LARGOS[p.m - 1];
  return `${n[0].toUpperCase()}${n.slice(1)} ${p.y}`;
}

/** Rango de fechas ISO: "26–28 jun 2025", "30 may – 2 jun 2025". */
export function rangoFechas(a, b) {
  if (!b || a === b) return fechaCorta(a);
  const x = parseISO(a), y = parseISO(b);
  if (x.y === y.y && x.m === y.m) return `${x.d}–${y.d} ${MESES[x.m - 1]} ${x.y}`;
  if (x.y === y.y) return `${x.d} ${MESES[x.m - 1]} – ${y.d} ${MESES[y.m - 1]} ${x.y}`;
  return `${fechaCorta(a)} – ${fechaCorta(b)}`;
}

export function ordinal(n) {
  return n == null ? '' : `${n}.º`;
}

export function iniciales(nombre) {
  const t = String(nombre || '').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  if (!t.length) return '?';
  if (t.length === 1) return t[0][0].toUpperCase();
  return (t[0][0] + t[t.length - 1][0]).toUpperCase();
}

/** Sin tildes, minúsculas: para búsquedas. */
export function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'al', 'por', 'para', 'con']);
const SIGLAS = new Set(['FENA', 'FINA', 'USA', 'ABC']);

/** Nombres de torneo vienen a veces TODO EN MAYÚSCULAS: los pasa a Título. */
export function tituloEvento(s) {
  const txt = String(s || '').trim();
  const letras = txt.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  const mayus = letras.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length;
  if (!letras.length || mayus / letras.length < 0.7) return txt;
  return txt.split(/(\s+)/).map((w, i) => {
    if (/^\s+$/.test(w) || !w) return w;
    const base = w.replace(/[^A-Za-zÁÉÍÓÚÑ0-9]/g, '');
    if (/^[IVXLC]+$/.test(base) && base.length <= 5) return w;
    if (SIGLAS.has(base)) return w;
    if (/\d/.test(base)) return w;
    const low = w.toLowerCase();
    if (i > 0 && MINUSCULAS.has(base.toLowerCase())) return low;
    return low.replace(/(^|[(\-–/])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase());
  }).join('');
}

export function nombreCorto(etiqueta) {
  return String(etiqueta || '').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || '';
}

export function nombreLimpio(etiqueta) {
  return String(etiqueta || '').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
}

export function plural(n, uno, otros) {
  return n === 1 ? uno : otros;
}

export function pct(x, dec = 0) {
  return x == null ? '–' : `${(x * 100).toFixed(dec).replace(/\.0+$/, '')} %`;
}

/** Texto para etiqueta de prueba: "100 m libre" */
export function nombrePrueba(est, dist) {
  return `${dist} m ${String(est).toLowerCase()}`;
}
