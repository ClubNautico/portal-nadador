// Cuerpo: crecimiento y evolución (antropometría). Tono neutral: sin juicios sobre peso ni grasa.
import { icono } from '../iconos.js';
import { el, vacio, grupoRadio } from '../ui.js';
import { crearGraficoLineas } from '../graficos.js';
import { esc, fechaCorta, fechaMes, plural } from '../formato.js';
import { msDe } from '../datos.js';

const METRICAS = [
  { id: 'talla', campo: 'talla', nombre: 'Talla', unidad: 'cm' },
  { id: 'peso', campo: 'peso', nombre: 'Peso', unidad: 'kg' },
  { id: 'musc', campo: 'musc', nombre: 'Masa magra', unidad: 'kg' },
  { id: 'esqp', campo: 'esqp', nombre: '% Músculo esquelético', unidad: '%' },
  { id: 'grasa', campo: 'grasa', nombre: '% Grasa', unidad: '%' },
  { id: 'k', campo: 'k', nombre: 'Índice K', unidad: '' },
];

const redondear = (v) => Math.round(v * 10) / 10;
const num = (v) => String(redondear(v));
const conUnidad = (v, u) => (u ? `${num(v)} ${u}` : num(v));
const valido = (v) => v != null && isFinite(v);

/** Variación neutral: ▲▼ con signo matemático y color de texto, nunca verde/rojo. */
function delta(d, unidad) {
  if (d == null) return '';
  const r = redondear(d);
  if (r === 0) return '<span class="var var-neu">= sin cambio</span>';
  return `<span class="var var-neu">${r > 0 ? '▲ +' : '▼ −'}${num(Math.abs(r))}${unidad ? ` ${esc(unidad)}` : ''}</span>`;
}

function duracion(a, b) {
  const A = new Date(msDe(a)), B = new Date(msDe(b));
  let m = (B.getUTCFullYear() - A.getUTCFullYear()) * 12 + B.getUTCMonth() - A.getUTCMonth();
  if (B.getUTCDate() < A.getUTCDate()) m -= 1;
  if (m < 1) return 'en menos de un mes';
  const y = Math.floor(m / 12), r = m % 12;
  const partes = [];
  if (y) partes.push(`${y} ${plural(y, 'año', 'años')}`);
  if (r) partes.push(`${r} ${plural(r, 'mes', 'meses')}`);
  return `en ${partes.join(' y ')}`;
}

let grafico = null;
let grupo = null;

export function destroy() {
  grafico?.destroy();
  grafico = null;
  grupo = null;
}

export function render(cont, p) {
  destroy();
  const filas = (p.antropometria || [])
    .filter((r) => r && r.f && METRICAS.some((m) => valido(r[m.campo])))
    .slice()
    .sort((a, b) => (a.f < b.f ? -1 : a.f > b.f ? 1 : 0));

  if (!filas.length) {
    cont.innerHTML = '<div class="cuerpo"><h1 class="vista-h1">Cuerpo</h1><div id="cu-vacio"></div></div>';
    cont.querySelector('#cu-vacio').replaceWith(vacio({
      icon: 'cuerpo',
      titulo: 'Aún no hay mediciones registradas',
      texto: 'Cuando te midan por primera vez, aquí verás cómo cambian tu talla, tu peso y tu masa magra mientras creces.',
    }));
    return;
  }

  // Serie por métrica: solo con los valores que existen, cada punto con su variación vs. el anterior que tenga ese dato.
  const series = {};
  for (const m of METRICAS) {
    let prev = null;
    series[m.id] = [];
    for (const r of filas) {
      if (!valido(r[m.campo])) continue;
      series[m.id].push({ x: msDe(r.f), y: r[m.campo], f: r.f, d: prev == null ? null : r[m.campo] - prev });
      prev = r[m.campo];
    }
  }
  const ultimaFila = filas[filas.length - 1];

  /* ---- Héroe: crecimiento ---- */
  const tallas = series.talla;
  let hero = '';
  if (tallas.length >= 2) {
    const a = tallas[0], b = tallas[tallas.length - 1];
    const dif = redondear(b.y - a.y);
    hero = dif > 0.04
      ? `<article class="card hero-card cu-hero" aria-labelledby="cu-hero-l">
          <p class="label" id="cu-hero-l">Tu crecimiento</p>
          <p class="cu-hero-pre">Creciste</p>
          <p class="hero-tiempo num cu-hero-n">${esc(num(dif))}<span class="cu-hero-u">cm</span></p>
          <p class="hero-sub">desde el ${esc(fechaCorta(a.f))}: de ${esc(num(a.y))} a ${esc(num(b.y))} cm ${esc(duracion(a.f, b.f))}.</p>
        </article>`
      : `<article class="card hero-card cu-hero" aria-labelledby="cu-hero-l">
          <p class="label" id="cu-hero-l">Tu crecimiento</p>
          <p class="cu-hero-pre">Tu talla se mantiene</p>
          <p class="hero-tiempo num cu-hero-n">${esc(num(b.y))}<span class="cu-hero-u">cm</span></p>
          <p class="hero-sub">Desde el ${esc(fechaCorta(a.f))} no hay cambio en tu talla. Es normal: el crecimiento llega por etapas.</p>
        </article>`;
  } else if (tallas.length === 1) {
    hero = `<article class="card hero-card cu-hero" aria-labelledby="cu-hero-l">
        <p class="label" id="cu-hero-l">Tu crecimiento</p>
        <p class="cu-hero-pre">Tu primera medición de talla</p>
        <p class="hero-tiempo num cu-hero-n">${esc(num(tallas[0].y))}<span class="cu-hero-u">cm</span></p>
        <p class="hero-sub">Medida el ${esc(fechaCorta(tallas[0].f))}. Con la próxima medición verás cuánto creciste.</p>
      </article>`;
  }

  /* ---- Tarjetas de la última medición ---- */
  const tarjetas = METRICAS.map((m) => {
    const s = series[m.id];
    const u = s[s.length - 1];
    if (!u) {
      return `<div class="cu-card cu-card-vacia"><p class="label">${esc(m.nombre)}</p><p class="cu-v num">–</p><p class="cu-d">Sin medición registrada</p></div>`;
    }
    const prev = s.length > 1 ? s[s.length - 2] : null;
    const distinta = u.f !== ultimaFila.f;
    return `
      <div class="cu-card">
        <p class="label">${esc(m.nombre)}</p>
        <p class="cu-v num">${esc(num(u.y))}${m.unidad ? `<span class="u"> ${esc(m.unidad)}</span>` : ''}</p>
        <p class="cu-d">${prev ? `${delta(u.d, m.unidad)}<span class="cu-vs">vs. ${esc(fechaCorta(prev.f))}</span>` : '<span class="cu-vs">Primera medición</span>'}</p>
        ${distinta ? `<p class="cu-vs">Medido el ${esc(fechaCorta(u.f))}</p>` : ''}
      </div>`;
  }).join('');

  /* ---- Tabla ---- */
  const dAnt = (campo) => {
    const m = new Map();
    let prev = null;
    for (const r of filas) {
      if (valido(r[campo])) { m.set(r, prev == null ? null : r[campo] - prev); prev = r[campo]; }
    }
    return m;
  };
  const dTalla = dAnt('talla'), dPeso = dAnt('peso');
  const celda = (v, dec = true) => (valido(v) ? `<td class="num">${esc(dec ? num(v) : String(v))}</td>` : '<td class="num cu-nd">–</td>');
  const celdaDelta = (d) => (d == null ? '<td class="num cu-nd">–</td>' : `<td class="num">${delta(d, '')}</td>`);
  const cuerpoTabla = filas.slice().reverse().map((r, i) => `
      <tr${i === 0 ? ' class="cu-ultima"' : ''}>
        <th scope="row" class="cu-fecha">${esc(fechaCorta(r.f))}</th>
        ${celda(r.talla)}${celdaDelta(dTalla.get(r))}
        ${celda(r.peso)}${celdaDelta(dPeso.get(r))}
        ${celda(r.musc)}${celda(r.esqp)}${celda(r.grasa)}${celda(r.k, false)}
      </tr>`).join('');

  cont.innerHTML = `
    <div class="cuerpo">
      <h1 class="vista-h1">Cuerpo</h1>

      <div class="cu-top">
        ${hero}
        <section class="cu-ult" aria-labelledby="cu-ult-h">
          <div class="cu-ult-cab"><h2 class="h3" id="cu-ult-h">Última medición</h2><p class="cu-fecha-ult"><time datetime="${esc(ultimaFila.f)}">${esc(fechaCorta(ultimaFila.f))}</time></p></div>
          <div class="cu-cards">${tarjetas}</div>
        </section>
      </div>

      <section class="card" aria-labelledby="cu-evo-h">
        <div class="card-cab"><h2 class="h3" id="cu-evo-h">Tu evolución</h2></div>
        <div class="cu-selector"><div id="cu-metricas"></div></div>
        <p class="cu-evo-sub" id="cu-evo-sub"></p>
        <div id="cu-graf"></div>
        <p class="cu-nota" id="cu-nota" hidden></p>
      </section>

      <section aria-labelledby="cu-tab-h" class="cu-tabla">
        <h2 class="h3" id="cu-tab-h">Todas tus mediciones</h2>
        <div class="tabla-wrap" tabindex="0" role="region" aria-labelledby="cu-tab-h">
          <table class="tabla cu-tabla-t">
            <thead><tr>
              <th scope="col">Fecha</th>
              <th scope="col" class="num">Talla<span class="u-m">cm</span></th><th scope="col" class="num">Cambio</th>
              <th scope="col" class="num">Peso<span class="u-m">kg</span></th><th scope="col" class="num">Cambio</th>
              <th scope="col" class="num">Masa magra<span class="u-m">kg</span></th>
              <th scope="col" class="num">Músculo esquelético<span class="u-m">%</span></th>
              <th scope="col" class="num">Grasa<span class="u-m">%</span></th>
              <th scope="col" class="num">Índice K</th>
            </tr></thead>
            <tbody>${cuerpoTabla}</tbody>
          </table>
        </div>
        <p class="cu-pie">Los cambios se calculan frente a la medición anterior que tenga ese dato.</p>
      </section>

      <details class="cu-det">
        <summary><span>¿Qué es el Índice K?</span>${icono('chev-abajo', 20, 'cu-det-ico')}</summary>
        <div class="cu-det-cuerpo">
          <p>El Índice K relaciona tu talla con tu peso: es tu talla en centímetros menos 100, menos tu peso en kilos.</p>
          <p>Es un dato más para acompañar cómo te desarrollas, no una calificación ni una meta. Durante la adolescencia cambia con naturalidad, porque la estatura y el peso no crecen al mismo ritmo.</p>
        </div>
      </details>
    </div>`;

  /* ---- Gráfico con conmutador de métrica ---- */
  const disponibles = METRICAS.filter((m) => series[m.id].length);
  let activa = disponibles[0].id;
  const $ = (s) => cont.querySelector(s);

  function pintarGrafico(anim) {
    const m = METRICAS.find((x) => x.id === activa);
    const pts = series[m.id];
    const a = pts[0], b = pts[pts.length - 1];
    $('#cu-evo-sub').textContent = pts.length > 1
      ? `${m.nombre}: de ${conUnidad(a.y, m.unidad)} en ${fechaMes(a.f)} a ${conUnidad(b.y, m.unidad)} en ${fechaMes(b.f)}.`
      : `${m.nombre}: ${conUnidad(a.y, m.unidad)} en ${fechaMes(a.f)}.`;
    const nota = $('#cu-nota');
    nota.hidden = pts.length > 1;
    nota.textContent = 'Con tu próxima medición se dibujará la curva de evolución.';
    const opts = {
      ariaLabel: `Evolución de ${m.nombre.toLowerCase()}. ${$('#cu-evo-sub').textContent} La tabla de mediciones debajo contiene los mismos datos`,
      modo: 'tiempo',
      area: true,
      series: [{ id: m.id, etiqueta: m.nombre, clase: 'a', puntos: pts }],
      formatoValor: (v) => conUnidad(v, m.unidad),
      lectura: ({ titulo, items }) => {
        const pt = items[0].punto;
        if (!pt) return '<div class="g-lec-vacio">Sin datos para mostrar</div>';
        return `<div class="g-lec-fila"><span class="g-lec-t num">${esc(conUnidad(pt.y, m.unidad))}</span>${pt.d != null ? delta(pt.d, m.unidad) : ''}</div><div class="g-lec-meta">${esc(titulo)}${pt.d != null ? ' · frente a la medición anterior' : ' · primera medición de este dato'}</div>`;
      },
    };
    if (!grafico) grafico = crearGraficoLineas($('#cu-graf'), opts);
    else grafico.update(opts, { anim });
  }

  grupo = grupoRadio($('#cu-metricas'), {
    items: METRICAS.map((m) => ({ valor: m.id, etiqueta: m.nombre, deshabilitado: !series[m.id].length })),
    valor: activa,
    aria: 'Métrica del gráfico',
    onChange: (v) => { activa = v; pintarGrafico(true); },
  });
  pintarGrafico(true);
}
