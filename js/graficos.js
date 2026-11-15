// Primitivas de gráficos SVG propias. Ver CONTRATO_VISTAS.md.
//   crearGraficoProgresion(host, opts)  -> { update, setActive, activo, destroy }
//   sparkline(valores, opts)            -> cadena SVG
//   barras(items, opts)                 -> cadena HTML
//   columnas(items, opts)               -> cadena SVG
//   radar(ejes, opts)                   -> cadena SVG
//   sparklineMas(valores, opts)         -> cadena SVG (más = arriba)
import { fmtTiempo, fechaCorta, ordinal, esc, MESES, tituloEvento } from './formato.js';
import { rombo } from './iconos.js';

const reducir = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const f1 = (n) => (Math.round(n * 10) / 10).toString();

/* ------------------------------------------------------------------ */
/* Ejes                                                                */
/* ------------------------------------------------------------------ */
const PASOS = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 15, 20, 30, 60, 120, 300, 600, 1800, 3600];

function ticksY(lo, hi, objetivo) {
  const paso = PASOS.find((s) => s >= (hi - lo) / objetivo) || 3600;
  const t = [];
  for (let v = Math.ceil(lo / paso) * paso; v <= hi + 1e-9; v += paso) t.push(Math.round(v * 1000) / 1000);
  return { t, paso };
}

function fmtEjeY(v, paso) {
  const dec = paso >= 1 ? 0 : paso >= 0.1 ? 1 : 2;
  const k = 10 ** dec;
  const total = Math.round(v * k) / k;
  const m = Math.floor(total / 60);
  const r = total - m * 60;
  const rs = r.toFixed(dec);
  if (m > 0) return `${m}:${rs.padStart(dec ? dec + 3 : 2, '0')}`;
  return rs;
}

function ticksX(a, b, maxN) {
  const A = new Date(a), idxA = A.getUTCFullYear() * 12 + A.getUTCMonth();
  for (const st of [1, 2, 3, 6, 12, 24, 36, 60, 120]) {
    const out = [];
    let i = Math.ceil(idxA / st) * st;
    for (; ; i += st) {
      const y = Math.floor(i / 12), m = i % 12;
      const ms = Date.UTC(y, m, 1);
      if (ms > b) break;
      if (ms >= a) out.push({ ms, y, m, st });
    }
    if (out.length <= maxN) return out;
  }
  return [];
}

const etiquetaX = (t) => (t.st >= 12 ? String(t.y) : t.st === 1 && t.m !== 0 ? MESES[t.m] : `${MESES[t.m]} ${String(t.y).slice(2)}`);

/* ------------------------------------------------------------------ */
/* Gráfico de progresión                                               */
/* ------------------------------------------------------------------ */
/**
 * opts = {
 *   ariaLabel: string,
 *   series: [{ id, etiqueta, clase: 'a'|'b', puntos: [{ id, x(ms), y(seg), t, fecha, ev, pu, ed, rp, exh, c }] }],  // máx. 2
 *   activo?: id,
 *   onActivo?: (punto) => void
 * }
 */
export function crearGraficoProgresion(host, opts) {
  let o = opts;
  let W = 0, H = 0;
  let activoId = null;
  let todos = [];
  const mapa = new Map();
  let geo = null;

  host.classList.add('grafico');
  host.innerHTML = `
    <div class="g-lectura" aria-live="off"></div>
    <div class="g-lienzo" tabindex="0" role="group" aria-roledescription="gráfico interactivo">
      <svg class="g-svg" aria-hidden="true" focusable="false"></svg>
      <div class="g-tip" hidden></div>
    </div>
    <div class="g-leyenda"></div>`;
  const lectura = host.querySelector('.g-lectura');
  const lienzo = host.querySelector('.g-lienzo');
  const svg = host.querySelector('.g-svg');
  const tip = host.querySelector('.g-tip');
  const leyenda = host.querySelector('.g-leyenda');

  const alto = () => (innerWidth < 640 ? 240 : innerWidth < 1024 ? 300 : 360);

  function indexar() {
    todos = [];
    mapa.clear();
    for (const s of o.series) for (const p of s.puntos) { const q = { ...p, serie: s }; todos.push(q); mapa.set(p.id, q); }
    todos.sort((a, b) => a.x - b.x || a.y - b.y);
  }

  function textoLectura(p) {
    const partes = [fechaCorta(new Date(p.x).toISOString().slice(0, 10)), tituloEvento(p.ev || '')];
    return partes.filter(Boolean).join(' · ');
  }
  function metaLectura(p) {
    const m = [];
    if (p.pu) m.push(`${ordinal(p.pu)} lugar`);
    if (p.ed) m.push(`${p.ed} años`);
    if (p.exh) m.push('exhibición');
    return m.join(' · ');
  }
  function pintarLectura(p) {
    if (!p) { lectura.innerHTML = '<div class="g-lec-vacio">Sin marcas para mostrar</div>'; return; }
    const serie = o.series.length > 1 ? `<span class="g-lec-serie">${esc(p.serie.etiqueta)}</span>` : '';
    lectura.innerHTML = `
      <div class="g-lec-fila"><span class="g-lec-t num">${esc(p.t)}</span>${p.rp ? `<span class="chip-rp">${rombo(8)}RÉCORD PERSONAL</span>` : ''}${serie}</div>
      <div class="g-lec-meta">${esc(textoLectura(p))}${metaLectura(p) ? ` · ${esc(metaLectura(p))}` : ''}</div>`;
  }

  function dibujar(anim) {
    W = Math.max(280, Math.round(lienzo.clientWidth));
    H = alto();
    indexar();
    const L = W < 520 ? 44 : 52, R = 14, T = 28, B = 28;
    const pw = W - L - R, ph = H - T - B;

    if (!todos.length) {
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.innerHTML = '';
      pintarLectura(null);
      return;
    }
    const ys = todos.map((p) => p.y);
    let ymin = Math.min(...ys), ymax = Math.max(...ys);
    let lo, hi;
    if (ymax - ymin < 1e-6) { const pad = Math.max(ymin * 0.02, 0.3); lo = ymin - pad; hi = ymax + pad; }
    else { const pad = Math.max((ymax - ymin) * 0.1, ymin * 0.01); lo = ymin - pad; hi = ymax + pad; }
    const xs = todos.map((p) => p.x);
    let xmin = Math.min(...xs), xmax = Math.max(...xs);
    if (xmax - xmin < 86400000 * 2) { xmin -= 86400000 * 60; xmax += 86400000 * 60; }
    else { const pad = (xmax - xmin) * 0.04; xmin -= pad; xmax += pad; }

    const X = (x) => L + ((x - xmin) / (xmax - xmin)) * pw;
    const Y = (y) => T + ((y - lo) / (hi - lo)) * ph;  // eje invertido: menos tiempo = más arriba
    geo = { X, Y, L, R, T, B, pw, ph };

    const { t: yt, paso } = ticksY(lo, hi, H < 280 ? 4 : 5);
    const xt = ticksX(xmin, xmax, Math.max(2, Math.floor(pw / (W < 520 ? 76 : 96))));

    let s = '';
    // rejilla + ejes
    s += `<g class="g-grid">`;
    for (const v of yt) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="g-eje" x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${fmtEjeY(v, paso)}</text>`;
    s += `</g><g class="g-xs">`;
    for (const t of xt) s += `<line class="g-tick" x1="${X(t.ms)}" x2="${X(t.ms)}" y1="${T + ph}" y2="${T + ph + 4}"/><text class="g-eje" x="${X(t.ms)}" y="${H - 8}" text-anchor="middle">${etiquetaX(t)}</text>`;
    s += `</g><text class="g-nota" x="${L}" y="14">↑ más rápido</text>`;

    // series
    const muchos = todos.length > 25;
    for (const serie of o.series) {
      const pts = [...serie.puntos].sort((a, b) => a.x - b.x || b.y - a.y);
      if (!pts.length) continue;
      const cls = serie.clase || 'a';
      const mejor = pts.reduce((m, p) => (p.y < m.y ? p : m), pts[0]);
      let linea = '', paso_d = '', best = Infinity;
      pts.forEach((p, i) => {
        linea += `${i ? 'L' : 'M'}${f1(X(p.x))} ${f1(Y(p.y))}`;
        if (p.y < best - 1e-9) { paso_d += i === 0 || !paso_d ? `M${f1(X(p.x))} ${f1(Y(p.y))}` : `H${f1(X(p.x))}V${f1(Y(p.y))}`; best = p.y; }
      });
      paso_d += `H${W - R}`;
      s += `<g class="g-serie g-${cls}" data-serie="${esc(serie.id)}">`;
      if (pts.length > 1) {
        const area = `${linea}L${f1(X(pts[pts.length - 1].x))} ${T + ph}L${f1(X(pts[0].x))} ${T + ph}Z`;
        s += `<path class="g-area" d="${area}"/>`;
        s += `<path class="g-paso" d="${paso_d}"/>`;
        s += `<path class="g-linea${muchos ? ' fina' : ''}" d="${linea}"/>`;
      } else {
        s += `<path class="g-paso" d="${paso_d}"/>`;
      }
      pts.forEach((p, i) => {
        const esUlt = i === pts.length - 1;
        const esMejor = p === mejor;
        const rp = p.rp || (esMejor && pts.length === 1);
        if (rp) {
          s += `<g class="g-rp" style="--d:${Math.min(900, 900 + i * 4)}ms"><circle class="g-anillo" cx="${f1(X(p.x))}" cy="${f1(Y(p.y))}" r="9"/><circle class="g-dot-rp" cx="${f1(X(p.x))}" cy="${f1(Y(p.y))}" r="5"/></g>`;
        } else if (!muchos || esUlt) {
          s += `<circle class="g-dot" cx="${f1(X(p.x))}" cy="${f1(Y(p.y))}" r="3.5"/>`;
        }
      });
      // etiqueta del récord vigente
      if (mejor && (o.series.length === 1 || serie === o.series[0])) {
        const mx = X(mejor.x), my = Y(mejor.y);
        const alinea = mx > W * 0.55 ? 'end' : 'start';
        const dx = alinea === 'end' ? -10 : 10;
        s += `<text class="g-etiqueta" x="${f1(mx + dx)}" y="${f1(my - 12)}" text-anchor="${alinea}">${mejor.rp ? 'RP ' : ''}${esc(mejor.t)}</text>`;
      }
      s += `</g>`;
    }
    s += `<g class="g-act" hidden><line class="g-guia" y1="${T}" y2="${T + ph}"/><circle class="g-act-dot" r="6.5"/></g>`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('height', H);
    svg.classList.toggle('anim', !!anim && !reducir());
    svg.innerHTML = s;

    // leyenda (2 series)
    leyenda.innerHTML = (o.series.length > 1
      ? o.series.map((se) => `<span class="g-ley g-ley-${se.clase || 'a'}"><i></i>${esc(se.etiqueta)}</span>`).join('')
      : '') + '<span class="g-ley"><i class="g-ley-paso"></i>Mejor marca vigente</span><span class="g-ley"><i class="g-ley-rp"></i>Récord personal</span>';

    if (anim && !reducir()) {
      svg.querySelectorAll('.g-linea').forEach((p) => {
        const len = p.getTotalLength();
        p.style.strokeDasharray = len;
        p.style.strokeDashoffset = len;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          p.style.transition = 'stroke-dashoffset var(--dur-draw) var(--ease-out)';
          p.style.strokeDashoffset = 0;
          setTimeout(() => { p.style.strokeDasharray = ''; p.style.transition = ''; }, 1000);
        }));
      });
    }

    const previo = activoId && mapa.has(activoId) ? activoId : (o.activo && mapa.has(o.activo) ? o.activo : todos[todos.length - 1].id);
    fijarActivo(previo, { silencioso: true });
  }

  function fijarActivo(id, { tooltip = false, silencioso = false, enfocar = false } = {}) {
    const p = mapa.get(id);
    if (!p || !geo) return;
    activoId = id;
    const g = svg.querySelector('.g-act');
    if (g) {
      const x = geo.X(p.x), y = geo.Y(p.y);
      g.hidden = false;
      g.querySelector('.g-guia').setAttribute('x1', x);
      g.querySelector('.g-guia').setAttribute('x2', x);
      const d = g.querySelector('.g-act-dot');
      d.setAttribute('cx', x); d.setAttribute('cy', y);
    }
    pintarLectura(p);
    if (tooltip) mostrarTip(p); else tip.hidden = true;
    if (!silencioso && o.onActivo) o.onActivo(p);
  }

  function mostrarTip(p) {
    const x = geo.X(p.x), y = geo.Y(p.y);
    tip.innerHTML = `<b class="num">${esc(p.t)}</b>${p.rp ? ' <span class="tip-rp">RP</span>' : ''}<span>${esc(textoLectura(p))}</span><span>${esc(metaLectura(p))}</span>`;
    tip.hidden = false;
    const tw = tip.offsetWidth;
    let left = x - tw / 2;
    left = Math.max(4, Math.min(W - tw - 4, left));
    const bajo = y < 100;
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(bajo ? y + 14 : y - tip.offsetHeight - 14)}px)`;
  }

  function cercano(e) {
    const r = svg.getBoundingClientRect();
    const k = W / r.width;
    const px = (e.clientX - r.left) * k, py = (e.clientY - r.top) * k;
    let mejor = null, md = Infinity;
    for (const p of todos) {
      const d = Math.abs(geo.X(p.x) - px) + 0.35 * Math.abs(geo.Y(p.y) - py);
      if (d < md) { md = d; mejor = p; }
    }
    return mejor;
  }

  function onPuntero(e) {
    if (!geo || !todos.length) return;
    const p = cercano(e);
    if (p) fijarActivo(p.id, { tooltip: e.pointerType === 'mouse' });
  }
  svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons || e.pointerType === 'touch') onPuntero(e); });
  svg.addEventListener('pointerdown', onPuntero);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
  lienzo.addEventListener('keydown', (e) => {
    if (!todos.length) return;
    let i = todos.findIndex((p) => p.id === activoId);
    if (e.key === 'ArrowRight') i = Math.min(todos.length - 1, i + 1);
    else if (e.key === 'ArrowLeft') i = Math.max(0, i - 1);
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = todos.length - 1;
    else return;
    e.preventDefault();
    lectura.setAttribute('aria-live', 'polite');
    fijarActivo(todos[i].id);
  });
  lienzo.addEventListener('blur', () => lectura.setAttribute('aria-live', 'off'));
  lienzo.setAttribute('aria-label', `${o.ariaLabel || 'Gráfico de progresión'}. Usa las flechas izquierda y derecha para recorrer las marcas.`);

  let timer = null;
  const ro = new ResizeObserver(() => {
    if (Math.abs(lienzo.clientWidth - W) < 2 && alto() === H) return;
    clearTimeout(timer);
    timer = setTimeout(() => dibujar(false), 100);
  });
  ro.observe(lienzo);

  let tOut = null;
  const api = {
    update(nuevo, { anim = true } = {}) {
      o = { ...o, ...nuevo };
      lienzo.setAttribute('aria-label', `${o.ariaLabel || 'Gráfico de progresión'}. Usa las flechas izquierda y derecha para recorrer las marcas.`);
      activoId = nuevo.activo ?? null;
      clearTimeout(tOut);
      if (!anim || reducir() || !svg.innerHTML) { dibujar(anim); return; }
      svg.style.opacity = 0;
      tOut = setTimeout(() => { dibujar(true); svg.style.opacity = 1; }, 130);
    },
    setActive(id) { if (mapa.has(id)) fijarActivo(id, { silencioso: true }); },
    activo: () => mapa.get(activoId) || null,
    destroy() { ro.disconnect(); clearTimeout(timer); clearTimeout(tOut); host.innerHTML = ''; host.classList.remove('grafico'); },
  };
  // primer dibujo (si el contenedor aún no tiene ancho, espera al observador)
  if (lienzo.clientWidth > 0) dibujar(true);
  else requestAnimationFrame(() => dibujar(true));
  return api;
}

/* ------------------------------------------------------------------ */
/* Sparkline                                                           */
/* ------------------------------------------------------------------ */
/**
 * valores: segundos (eje invertido: menor = más arriba). opts: { ancho=96, alto=28, fluido=false, clase='' }
 * fluido => ocupa el 100 % del ancho del contenedor (preserveAspectRatio none, trazos sin escala).
 */
export function sparkline(valores, { ancho = 96, alto = 28, fluido = false, clase = '', etiqueta = '' } = {}) {
  const v = valores.filter((n) => n != null);
  const pad = 4;
  const attrs = `class="spark ${clase}" viewBox="0 0 ${ancho} ${alto}" ${fluido ? `width="100%" height="${alto}" preserveAspectRatio="none"` : `width="${ancho}" height="${alto}"`} ${etiqueta ? `role="img" aria-label="${esc(etiqueta)}"` : 'aria-hidden="true"'} focusable="false"`;
  if (!v.length) return `<svg ${attrs}></svg>`;
  const mn = Math.min(...v), mx = Math.max(...v);
  const rango = mx - mn || 1;
  const pts = v.map((n, i) => [v.length === 1 ? ancho / 2 : pad + (i / (v.length - 1)) * (ancho - pad * 2), v.length === 1 ? alto / 2 : pad + ((n - mn) / rango) * (alto - pad * 2)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${f1(p[0])} ${f1(p[1])}`).join('');
  const ult = pts[pts.length - 1];
  const dot = `<path class="spark-dot" d="M${f1(ult[0])} ${f1(ult[1])}h0.01" vector-effect="non-scaling-stroke"/>`;
  return `<svg ${attrs}>${v.length > 1 ? `<path class="spark-l" d="${d}" vector-effect="non-scaling-stroke"/>` : ''}${dot}</svg>`;
}

/* ------------------------------------------------------------------ */
/* Barras horizontales (criterios 0-max)                               */
/* ------------------------------------------------------------------ */
/** items: [{ etiqueta, valor, previo? }]. opts: { max=10, unidad='' }. Devuelve HTML. */
export function barras(items, { max = 10, formato = (v) => `${v}/${max}` } = {}) {
  return `<ul class="barras">${items.map((it, i) => `
    <li class="barra">
      <div class="barra-cab"><span class="barra-et">${esc(it.etiqueta)}</span><span class="barra-val num">${esc(formato(it.valor))}</span></div>
      <div class="barra-riel" role="img" aria-label="${esc(it.etiqueta)}: ${esc(formato(it.valor))}${it.previo != null ? `; antes ${esc(formato(it.previo))}` : ''}">
        <span class="barra-rell" style="--v:${Math.max(0, Math.min(1, it.valor / max))};--i:${i}"></span>
        ${it.previo != null ? `<span class="barra-prev" style="left:${Math.max(0, Math.min(1, it.previo / max)) * 100}%"></span>` : ''}
      </div>
    </li>`).join('')}</ul>`;
}

/* ------------------------------------------------------------------ */
/* Columnas verticales (valores por periodo)                           */
/* ------------------------------------------------------------------ */
/** items: [{ etiqueta, valor }]. opts: { alto=160, max?, formato } Devuelve SVG (ancho fluido por viewBox). */
export function columnas(items, { alto = 160, max, formato = (v) => String(v), ancho = 360 } = {}) {
  if (!items.length) return '';
  const m = max ?? Math.max(...items.map((i) => i.valor), 1);
  const T = 20, B = 22, ph = alto - T - B;
  const bw = Math.min(40, (ancho / items.length) * 0.6);
  const paso = ancho / items.length;
  const barrasSvg = items.map((it, i) => {
    const h = Math.max(2, (it.valor / m) * ph);
    const x = paso * i + (paso - bw) / 2;
    return `<g><rect class="col-b" x="${f1(x)}" y="${f1(T + ph - h)}" width="${f1(bw)}" height="${f1(h)}" rx="4"/><text class="col-v" x="${f1(x + bw / 2)}" y="${f1(T + ph - h - 6)}" text-anchor="middle">${esc(formato(it.valor))}</text><text class="g-eje" x="${f1(x + bw / 2)}" y="${alto - 6}" text-anchor="middle">${esc(it.etiqueta)}</text></g>`;
  }).join('');
  return `<svg class="columnas" viewBox="0 0 ${ancho} ${alto}" width="100%" role="img" aria-label="${esc(items.map((i) => `${i.etiqueta}: ${formato(i.valor)}`).join('; '))}"><line class="g-base" x1="0" x2="${ancho}" y1="${T + ph}" y2="${T + ph}"/>${barrasSvg}</svg>`;
}

/* ------------------------------------------------------------------ */
/* Radar                                                               */
/* ------------------------------------------------------------------ */
/** ejes: [{ etiqueta, valor, previo? }]. opts: { max=10, tam=340 }. Devuelve SVG. 5-8 ejes. */
export function radar(ejes, { max = 10, tam = 340 } = {}) {
  const n = ejes.length;
  if (n < 3) return '';
  const c = tam / 2, r = tam / 2 - 54;
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, v) => [c + Math.cos(ang(i)) * r * (v / max), c + Math.sin(ang(i)) * r * (v / max)];
  const poly = (vals) => vals.map((v, i) => pt(i, v).map(f1).join(',')).join(' ');
  let s = '';
  for (let k = 1; k <= 4; k++) s += `<polygon class="rd-anillo" points="${poly(ejes.map(() => (max * k) / 4))}"/>`;
  ejes.forEach((_, i) => { const [x, y] = pt(i, max); s += `<line class="rd-eje" x1="${c}" y1="${c}" x2="${f1(x)}" y2="${f1(y)}"/>`; });
  if (ejes.some((e) => e.previo != null)) s += `<polygon class="rd-prev" points="${poly(ejes.map((e) => e.previo ?? e.valor))}"/>`;
  s += `<polygon class="rd-act" points="${poly(ejes.map((e) => e.valor))}"/>`;
  ejes.forEach((e, i) => {
    const [x, y] = pt(i, max * 1.2);
    const a = Math.cos(ang(i));
    s += `<text class="rd-et" x="${f1(x)}" y="${f1(y + 4)}" text-anchor="${Math.abs(a) < 0.2 ? 'middle' : a > 0 ? 'start' : 'end'}">${esc(e.etiqueta)}</text>`;
    const [vx, vy] = pt(i, e.valor);
    s += `<circle class="rd-dot" cx="${f1(vx)}" cy="${f1(vy)}" r="3.5"/>`;
  });
  return `<svg class="radar" viewBox="0 0 ${tam} ${tam}" width="100%" style="max-width:${tam}px" role="img" aria-label="${esc(ejes.map((e) => `${e.etiqueta} ${e.valor} de ${max}`).join('; '))}">${s}</svg>`;
}

/* ------------------------------------------------------------------ */
/* Sparkline ascendente (más = mejor: fuerza, saltos, repeticiones)    */
/* ------------------------------------------------------------------ */
/** Igual que sparkline() pero con el eje sin invertir: el valor mayor queda arriba. */
export function sparklineMas(valores, opts = {}) {
  return sparkline(valores.filter((n) => n != null).map((n) => -n), opts);
}

/* ------------------------------------------------------------------ */
/* Seguimiento: líneas de valores (eje Y normal), columnas por periodo */
/* y barras apiladas. Añadidas para Cuerpo, Técnica y Asistencia.      */
/* ------------------------------------------------------------------ */
const numFmt = (v, dec) => (Math.round(v * 10 ** dec) / 10 ** dec).toFixed(dec);

/** Escala "bonita" para un eje Y normal. fijo = límites impuestos por quien llama. */
function escalaY(lo, hi, { objetivo = 4, min = null, max = null } = {}) {
  if (hi - lo < 1e-9) { const p = Math.max(Math.abs(hi) * 0.05, 1); lo -= p; hi += p; }
  else { const p = (hi - lo) * 0.14; lo -= p; hi += p; }
  if (min != null) lo = min;
  if (max != null) hi = max;
  const { paso } = ticksY(lo, hi, objetivo);
  if (min == null) lo = Math.floor(lo / paso + 1e-9) * paso;
  if (max == null) hi = Math.ceil(hi / paso - 1e-9) * paso;
  const { t } = ticksY(lo, hi, objetivo);
  return { lo, hi, ticks: t, paso, dec: paso >= 1 ? 0 : paso >= 0.1 ? 1 : 2 };
}

/**
 * Gráfico de líneas de valores. Los puntos con y nulo no se dibujan ni se inventan.
 * opts = {
 *   ariaLabel,
 *   modo: 'tiempo' | 'categoria',        // tiempo: x en ms; categoria: x = índice en etiquetasX
 *   etiquetasX?: string[],               // solo en modo categoria
 *   series: [{ id, etiqueta, clase:'a'|'b', puntos:[{ x, y, xl? }] }],   // máx. 2
 *   ejeY?: { min?, max?, cero?, formato?(v), objetivo? },
 *   unidad?: string,                     // texto bajo la nota del eje ("kg")
 *   formatoValor?: (v) => string,
 *   tituloX?: (x, puntoCualquiera) => string,
 *   lectura?: ({ x, titulo, items:[{ serie, punto }] }) => string (HTML ya escapado),
 *   area?: boolean
 * }
 * Devuelve { update(opts,{anim}), destroy() }.
 */
export function crearGraficoLineas(host, opts) {
  let o = opts;
  let W = 0, H = 0, geo = null, xs = [], activoX = null;
  host.classList.add('grafico', 'grafico-l');
  host.innerHTML = `
    <div class="g-lectura" aria-live="off"></div>
    <div class="g-lienzo" tabindex="0" role="group" aria-roledescription="gráfico interactivo">
      <svg class="g-svg" aria-hidden="true" focusable="false"></svg>
    </div>
    <div class="g-leyenda"></div>`;
  const lectura = host.querySelector('.g-lectura');
  const lienzo = host.querySelector('.g-lienzo');
  const svg = host.querySelector('.g-svg');
  const leyenda = host.querySelector('.g-leyenda');
  const alto = () => (innerWidth < 640 ? 220 : innerWidth < 1024 ? 260 : 300);
  const fmtV = (v) => (o.formatoValor ? o.formatoValor(v) : String(v));
  const series = () => o.series.map((s) => ({ ...s, puntos: s.puntos.filter((p) => p.y != null && isFinite(p.y)).sort((a, b) => a.x - b.x) })).filter((s) => s.puntos.length);
  const tituloDe = (x, p) => (o.tituloX ? o.tituloX(x, p) : o.modo === 'categoria' ? (o.etiquetasX || [])[x] || '' : fechaCorta(new Date(x).toISOString().slice(0, 10)));

  function pintarLectura(x) {
    const ss = series();
    if (x == null) { lectura.innerHTML = '<div class="g-lec-vacio">Sin datos para mostrar</div>'; return; }
    const items = ss.map((s) => ({ serie: s, punto: s.puntos.find((p) => p.x === x) || null }));
    const p0 = items.find((i) => i.punto)?.punto;
    const titulo = tituloDe(x, p0);
    if (o.lectura) { lectura.innerHTML = o.lectura({ x, titulo, items }); return; }
    lectura.innerHTML = `
      <div class="g-lec-fila">${items.map((i) => `<span class="gl-val">${ss.length > 1 ? `<span class="g-lec-serie">${esc(i.serie.etiqueta)}</span>` : ''}<span class="g-lec-t num">${i.punto ? esc(fmtV(i.punto.y)) : '–'}</span></span>`).join('')}</div>
      <div class="g-lec-meta">${esc(titulo)}</div>`;
  }

  function dibujar(anim) {
    W = Math.max(280, Math.round(lienzo.clientWidth));
    H = alto();
    const ss = series();
    const todos = ss.flatMap((s) => s.puntos);
    if (!todos.length) { svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = ''; geo = null; xs = []; pintarLectura(null); leyenda.innerHTML = ''; return; }
    const L = W < 520 ? 40 : 48, R = 18, T = 14, B = 28;
    const pw = W - L - R, ph = H - T - B;
    const cat = o.modo === 'categoria';
    xs = [...new Set(todos.map((p) => p.x))].sort((a, b) => a - b);
    let xmin, xmax;
    if (cat) { xmin = -0.5; xmax = (o.etiquetasX || []).length - 0.5; }
    else {
      xmin = xs[0]; xmax = xs[xs.length - 1];
      if (xmax - xmin < 86400000 * 2) { xmin -= 86400000 * 45; xmax += 86400000 * 45; }
      else { const pad = (xmax - xmin) * 0.04; xmin -= pad; xmax += pad; }
    }
    const ys = todos.map((p) => p.y);
    const ey = o.ejeY || {};
    let dmin = Math.min(...ys), dmax = Math.max(...ys);
    if (ey.cero) dmin = Math.min(0, dmin);
    const esc_ = escalaY(dmin, dmax, { objetivo: ey.objetivo ?? (H < 250 ? 3 : 4), min: ey.min ?? (ey.cero ? 0 : null), max: ey.max ?? null });
    const { lo, hi, ticks } = esc_;
    const X = (x) => L + ((x - xmin) / (xmax - xmin)) * pw;
    const Y = (y) => T + ph - ((y - lo) / (hi - lo)) * ph;
    geo = { X, Y, L, R, T, B, pw, ph };
    const fmtEje = ey.formato || ((v) => numFmt(v, esc_.dec));

    let s = '<g class="g-grid">';
    for (const v of ticks) s += `<line x1="${L}" x2="${W - R}" y1="${f1(Y(v))}" y2="${f1(Y(v))}"/><text class="g-eje" x="${L - 8}" y="${f1(Y(v) + 4)}" text-anchor="end">${esc(fmtEje(v))}</text>`;
    s += '</g><g class="g-xs">';
    if (cat) {
      const n = (o.etiquetasX || []).length;
      const cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 34))));
      for (let i = 0; i < n; i += cada) s += `<text class="g-eje" x="${f1(X(i))}" y="${H - 8}" text-anchor="middle">${esc(o.etiquetasX[i])}</text>`;
    } else {
      for (const t of ticksX(xmin, xmax, Math.max(2, Math.floor(pw / (W < 520 ? 76 : 96))))) s += `<line class="g-tick" x1="${f1(X(t.ms))}" x2="${f1(X(t.ms))}" y1="${T + ph}" y2="${T + ph + 4}"/><text class="g-eje" x="${f1(X(t.ms))}" y="${H - 8}" text-anchor="middle">${etiquetaX(t)}</text>`;
    }
    s += '</g>';

    ss.forEach((se, si) => {
      const cls = se.clase || (si ? 'b' : 'a');
      const pts = se.puntos;
      s += `<g class="g-serie g-${cls}" data-serie="${esc(se.id)}">`;
      if (o.area && si === 0 && pts.length > 1) {
        const l = pts.map((p, i) => `${i ? 'L' : 'M'}${f1(X(p.x))} ${f1(Y(p.y))}`).join('');
        s += `<path class="g-area" d="${l}L${f1(X(pts[pts.length - 1].x))} ${T + ph}L${f1(X(pts[0].x))} ${T + ph}Z"/>`;
      }
      // segmentos; en categorías, un hueco (mes sin dato) se une con trazo discontinuo
      let solido = '', hueco = '';
      pts.forEach((p, i) => {
        if (!i) { solido += `M${f1(X(p.x))} ${f1(Y(p.y))}`; return; }
        const prev = pts[i - 1];
        if (cat && p.x - prev.x > 1) { hueco += `M${f1(X(prev.x))} ${f1(Y(prev.y))}L${f1(X(p.x))} ${f1(Y(p.y))}`; solido += `M${f1(X(p.x))} ${f1(Y(p.y))}`; }
        else solido += `L${f1(X(p.x))} ${f1(Y(p.y))}`;
      });
      if (pts.length > 1) {
        if (hueco) s += `<path class="g-hueco" d="${hueco}"/>`;
        s += `<path class="g-linea${pts.length > 30 ? ' fina' : ''}" d="${solido}"/>`;
      }
      const muchos = pts.length > 30;
      pts.forEach((p, i) => {
        const ult = i === pts.length - 1;
        if (ult) s += `<g class="g-rp"><circle class="g-anillo" cx="${f1(X(p.x))}" cy="${f1(Y(p.y))}" r="9"/><circle class="g-dot-rp" cx="${f1(X(p.x))}" cy="${f1(Y(p.y))}" r="5"/></g>`;
        else if (!muchos) s += `<circle class="g-dot" cx="${f1(X(p.x))}" cy="${f1(Y(p.y))}" r="3.5"/>`;
      });
      const u = pts[pts.length - 1];
      if (si === 0) {
        const ux = X(u.x), alinea = ux > W * 0.62 ? 'end' : 'start';
        s += `<text class="g-etiqueta" x="${f1(ux + (alinea === 'end' ? -12 : 12))}" y="${f1(Y(u.y) - 12)}" text-anchor="${alinea}">${esc(fmtV(u.y))}</text>`;
      }
      s += '</g>';
    });
    s += `<g class="g-act" hidden><line class="g-guia" y1="${T}" y2="${T + ph}"/>${ss.map(() => '<circle class="g-act-dot" r="6.5"/>').join('')}</g>`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('height', H);
    svg.classList.toggle('anim', !!anim && !reducir());
    svg.innerHTML = s;
    leyenda.innerHTML = ss.length > 1 ? ss.map((se, i) => `<span class="g-ley g-ley-${se.clase || (i ? 'b' : 'a')}"><i></i>${esc(se.etiqueta)}</span>`).join('') : '';
    leyenda.hidden = ss.length < 2;

    if (anim && !reducir()) {
      svg.querySelectorAll('.g-linea').forEach((p) => {
        const len = p.getTotalLength();
        p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          p.style.transition = 'stroke-dashoffset var(--dur-draw) var(--ease-out)';
          p.style.strokeDashoffset = 0;
          setTimeout(() => { p.style.strokeDasharray = ''; p.style.transition = ''; }, 1000);
        }));
      });
    }
    fijar(activoX != null && xs.includes(activoX) ? activoX : xs[xs.length - 1]);
  }

  function fijar(x) {
    if (!geo) return;
    activoX = x;
    const g = svg.querySelector('.g-act');
    if (g) {
      const ss = series();
      g.hidden = false;
      const gx = geo.X(x);
      const guia = g.querySelector('.g-guia');
      guia.setAttribute('x1', gx); guia.setAttribute('x2', gx);
      g.querySelectorAll('.g-act-dot').forEach((d, i) => {
        const p = ss[i]?.puntos.find((q) => q.x === x);
        d.style.display = p ? '' : 'none';
        if (p) { d.setAttribute('cx', gx); d.setAttribute('cy', geo.Y(p.y)); }
      });
    }
    pintarLectura(x);
  }

  function cercano(e) {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) * (W / r.width);
    let mejor = null, md = Infinity;
    for (const x of xs) { const d = Math.abs(geo.X(x) - px); if (d < md) { md = d; mejor = x; } }
    return mejor;
  }
  const onPuntero = (e) => { if (geo && xs.length) { const x = cercano(e); if (x != null) fijar(x); } };
  svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons || e.pointerType === 'touch') onPuntero(e); });
  svg.addEventListener('pointerdown', onPuntero);
  lienzo.addEventListener('keydown', (e) => {
    if (!xs.length) return;
    let i = xs.indexOf(activoX);
    if (e.key === 'ArrowRight') i = Math.min(xs.length - 1, i + 1);
    else if (e.key === 'ArrowLeft') i = Math.max(0, i - 1);
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = xs.length - 1;
    else return;
    e.preventDefault();
    lectura.setAttribute('aria-live', 'polite');
    fijar(xs[i]);
  });
  lienzo.addEventListener('blur', () => lectura.setAttribute('aria-live', 'off'));
  const etiquetaAria = () => lienzo.setAttribute('aria-label', `${o.ariaLabel || 'Gráfico'}. Usa las flechas izquierda y derecha para recorrer los puntos.`);
  etiquetaAria();

  let timer = null, tOut = null;
  const ro = new ResizeObserver(() => {
    if (Math.abs(lienzo.clientWidth - W) < 2 && alto() === H) return;
    clearTimeout(timer);
    timer = setTimeout(() => dibujar(false), 100);
  });
  ro.observe(lienzo);
  if (lienzo.clientWidth > 0) dibujar(true); else requestAnimationFrame(() => dibujar(true));
  return {
    update(nuevo, { anim = true } = {}) {
      o = { ...o, ...nuevo };
      etiquetaAria();
      activoX = null;
      clearTimeout(tOut);
      if (!anim || reducir() || !svg.innerHTML) { dibujar(anim); return; }
      svg.style.opacity = 0;
      tOut = setTimeout(() => { dibujar(true); svg.style.opacity = 1; }, 130);
    },
    destroy() { ro.disconnect(); clearTimeout(timer); clearTimeout(tOut); host.innerHTML = ''; host.classList.remove('grafico', 'grafico-l'); },
  };
}

/**
 * Columnas agrupadas por periodo (varias series por categoría) con marca opcional por valor
 * (por ejemplo, sesiones exigidas). Eje Y desde cero. Selección por toque, puntero o flechas.
 * opts = {
 *   ariaLabel,
 *   series: [{ id, etiqueta, clase:'a'|'b' }],
 *   categorias: [{ id, etiqueta, valores:{ [serieId]: n|null }, marcas?:{ [serieId]: n|null } }],
 *   marcaEtiqueta?: string,               // leyenda de la marca ("Exigidas")
 *   lectura: (categoria) => string (HTML ya escapado),
 *   activo?: id de categoría
 * }
 */
export function crearGraficoColumnas(host, opts) {
  let o = opts;
  let W = 0, H = 0, geo = null, activoId = null;
  host.classList.add('grafico', 'grafico-c');
  host.innerHTML = `
    <div class="g-lectura" aria-live="off"></div>
    <div class="g-lienzo" tabindex="0" role="group" aria-roledescription="gráfico interactivo">
      <svg class="g-svg" aria-hidden="true" focusable="false"></svg>
    </div>
    <div class="g-leyenda"></div>`;
  const lectura = host.querySelector('.g-lectura');
  const lienzo = host.querySelector('.g-lienzo');
  const svg = host.querySelector('.g-svg');
  const leyenda = host.querySelector('.g-leyenda');
  const alto = () => (innerWidth < 640 ? 200 : innerWidth < 1024 ? 240 : 260);

  function dibujar(anim) {
    W = Math.max(280, Math.round(lienzo.clientWidth));
    H = alto();
    const cats = o.categorias;
    if (!cats.length) { svg.innerHTML = ''; geo = null; lectura.innerHTML = '<div class="g-lec-vacio">Sin datos para mostrar</div>'; leyenda.innerHTML = ''; return; }
    const L = W < 520 ? 34 : 42, R = 6, T = 12, B = 26;
    const pw = W - L - R, ph = H - T - B;
    const vals = cats.flatMap((c) => [...Object.values(c.valores || {}), ...Object.values(c.marcas || {})]).filter((v) => v != null && isFinite(v));
    const esc_ = escalaY(0, Math.max(...vals, 1), { objetivo: H < 230 ? 3 : 4, min: 0 });
    const { hi, ticks } = esc_;
    const Y = (v) => T + ph - (v / hi) * ph;
    const n = cats.length, slot = pw / n, ns = o.series.length;
    const gw = Math.min(slot * 0.8, ns * 22 + 2), gap = 2;
    const bw = (gw - gap * (ns - 1)) / ns;
    geo = { L, T, ph, pw, slot, n };

    let s = '<g class="g-grid">';
    for (const v of ticks) s += `<line x1="${L}" x2="${W - R}" y1="${f1(Y(v))}" y2="${f1(Y(v))}"/><text class="g-eje" x="${L - 8}" y="${f1(Y(v) + 4)}" text-anchor="end">${v}</text>`;
    s += '</g>';
    s += `<rect class="cg-sel" x="0" y="${T - 4}" width="${f1(slot)}" height="${ph + 4}" rx="6" hidden/>`;
    cats.forEach((c, i) => {
      const cx = L + slot * i + slot / 2, x0 = cx - gw / 2;
      s += `<g class="cg-cat" data-id="${esc(c.id)}">`;
      o.series.forEach((se, k) => {
        const v = c.valores?.[se.id];
        const bx = x0 + k * (bw + gap);
        if (v != null && isFinite(v)) {
          const h = v > 0 ? Math.max(2, (v / hi) * ph) : 0;
          s += `<rect class="cg-barra cg-${se.clase || (k ? 'b' : 'a')}" style="--i:${i}" x="${f1(bx)}" y="${f1(T + ph - h)}" width="${f1(bw)}" height="${f1(h)}" rx="3"/>`;
        }
        const m = c.marcas?.[se.id];
        if (m != null && isFinite(m)) s += `<line class="cg-marca" x1="${f1(bx - 1.5)}" x2="${f1(bx + bw + 1.5)}" y1="${f1(Y(m))}" y2="${f1(Y(m))}"/>`;
      });
      s += `<text class="g-eje" x="${f1(cx)}" y="${H - 8}" text-anchor="middle">${esc(c.etiqueta)}</text></g>`;
    });
    s += `<line class="g-base" x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}"/>`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('height', H);
    svg.classList.toggle('anim', !!anim && !reducir());
    svg.innerHTML = s;
    leyenda.innerHTML = o.series.map((se, i) => `<span class="g-ley"><i class="cg-ley cg-${se.clase || (i ? 'b' : 'a')}"></i>${esc(se.etiqueta)}</span>`).join('')
      + (o.marcaEtiqueta && cats.some((c) => Object.values(c.marcas || {}).some((v) => v != null)) ? `<span class="g-ley"><i class="cg-ley-marca"></i>${esc(o.marcaEtiqueta)}</span>` : '');
    fijar(activoId && cats.some((c) => c.id === activoId) ? activoId : cats[cats.length - 1].id);
  }

  function fijar(id) {
    if (!geo) return;
    const i = o.categorias.findIndex((c) => c.id === id);
    if (i < 0) return;
    activoId = id;
    const sel = svg.querySelector('.cg-sel');
    if (sel) { sel.hidden = false; sel.setAttribute('x', f1(geo.L + geo.slot * i)); }
    lectura.innerHTML = o.lectura(o.categorias[i]);
  }

  function deEvento(e) {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) * (W / r.width) - geo.L;
    const i = Math.max(0, Math.min(geo.n - 1, Math.floor(px / geo.slot)));
    return o.categorias[i].id;
  }
  const onPuntero = (e) => { if (geo) fijar(deEvento(e)); };
  svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons || e.pointerType === 'touch') onPuntero(e); });
  svg.addEventListener('pointerdown', onPuntero);
  lienzo.addEventListener('keydown', (e) => {
    if (!geo) return;
    let i = o.categorias.findIndex((c) => c.id === activoId);
    if (e.key === 'ArrowRight') i = Math.min(geo.n - 1, i + 1);
    else if (e.key === 'ArrowLeft') i = Math.max(0, i - 1);
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = geo.n - 1;
    else return;
    e.preventDefault();
    lectura.setAttribute('aria-live', 'polite');
    fijar(o.categorias[i].id);
  });
  lienzo.addEventListener('blur', () => lectura.setAttribute('aria-live', 'off'));
  lienzo.setAttribute('aria-label', `${o.ariaLabel || 'Gráfico de columnas'}. Usa las flechas izquierda y derecha para recorrer los meses.`);

  let timer = null;
  const ro = new ResizeObserver(() => {
    if (Math.abs(lienzo.clientWidth - W) < 2 && alto() === H) return;
    clearTimeout(timer);
    timer = setTimeout(() => dibujar(false), 100);
  });
  ro.observe(lienzo);
  if (lienzo.clientWidth > 0) dibujar(true); else requestAnimationFrame(() => dibujar(true));
  return {
    update(nuevo) { o = { ...o, ...nuevo }; activoId = null; dibujar(false); },
    destroy() { ro.disconnect(); clearTimeout(timer); host.innerHTML = ''; host.classList.remove('grafico', 'grafico-c'); },
  };
}

/**
 * Barras apiladas horizontales (una fila por elemento). Devuelve HTML.
 * items: [{ etiqueta, nota?, segmentos:[{ clave, etiqueta, valor }] }]
 * Cada segmento lleva su número dentro cuando cabe y siempre un aria-label con el texto completo.
 */
export function barrasApiladas(items) {
  return `<ul class="b-apil">${items.map((it) => {
    const total = it.segmentos.reduce((a, s) => a + s.valor, 0);
    const texto = it.segmentos.map((s) => `${s.etiqueta} ${s.valor}`).join(', ');
    return `
    <li class="ba-fila">
      <div class="ba-cab"><span class="ba-et">${esc(it.etiqueta)}</span>${it.nota ? `<span class="ba-nota">${esc(it.nota)}</span>` : ''}</div>
      <div class="ba-pista" role="img" aria-label="${esc(it.etiqueta)}: ${esc(texto)}">
        ${total ? it.segmentos.filter((s) => s.valor > 0).map((s) => `<span class="ba-seg ba-${esc(s.clave)}" style="flex-grow:${s.valor}">${s.valor / total >= 0.1 ? `<b class="num">${s.valor}</b>` : ''}</span>`).join('') : '<span class="ba-seg ba-vacio"></span>'}
      </div>
    </li>`;
  }).join('')}</ul>`;
}
