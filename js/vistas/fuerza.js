// Fuerza: 1RM (gimnasio y evaluación), saltos, test físico, flexibilidad y medidas.
import { el, vacio, reducirMovimiento, pistaScroll } from '../ui.js';
import { sparklineMas } from '../graficos.js';
import { esc, fechaCorta, normalizar, plural, tituloEvento } from '../formato.js';

let limpiezas = [];
export function destroy() {
  limpiezas.forEach((f) => { try { f(); } catch {} });
  limpiezas = [];
}

/* ------------------------------------------------------------------ */
/* Utilidades de datos                                                 */
/* ------------------------------------------------------------------ */
const esNum = (v) => v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v));
const uTxt = (u) => ({ KG: 'kg', LB: 'lb' }[String(u || '').toUpperCase()] || String(u || ''));
const num = (v, dec = 1) => (esNum(v) ? String(Number(Number(v).toFixed(dec))) : '–');
const decDe = (u) => (u === 'm/s' || u === 'm' ? 2 : u === 'W' || u === 'ms' ? 0 : 1);
const fecha = (f) => (f ? fechaCorta(f) : 'sin fecha');
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const norm = (s) => normalizar(s);

/** Agrupa registros {f,v,u} por clave; cada serie queda ordenada por fecha, con una medición por día. */
function agrupar(registros, clave) {
  const mapa = new Map();
  for (const r of registros) {
    if (!r.f || !esNum(r.v)) continue;
    const k = clave(r);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push({ f: r.f, v: Number(r.v), u: r.u || '' });
  }
  const out = new Map();
  for (const [k, arr] of mapa) {
    arr.sort((a, b) => a.f.localeCompare(b.f));
    const dedup = [];
    for (const x of arr) { if (dedup.length && dedup[dedup.length - 1].f === x.f) dedup[dedup.length - 1] = x; else dedup.push(x); }
    out.set(k, dedup);
  }
  return out;
}

const ultimaDe = (pts) => pts[pts.length - 1];
const previaDe = (pts) => (pts.length > 1 ? pts[pts.length - 2] : null);

/** Variación (más es mejor, salvo neutral). delta > 0 sube. */
function varHTML(delta, unidad, { neutral = false, dec } = {}) {
  const u = unidad ? ` ${esc(unidad)}` : '';
  if (!Number.isFinite(delta)) return '';
  const d = dec ?? (Math.abs(delta) >= 10 ? 1 : 2);
  if (Math.abs(delta) < Math.pow(10, -d) / 2) return '<span class="var var-igual">= sin cambio</span>';
  const txt = `${delta > 0 ? '+' : '−'}${num(Math.abs(delta), d)}${u}`;
  const cls = neutral ? 'var-igual' : delta > 0 ? 'var-ok' : 'var-mal';
  return `<span class="var ${cls}">${delta > 0 ? '▲' : '▼'} ${txt}</span>`;
}

/** Cambio de una serie: última contra la anterior en la misma unidad. */
function cambioDe(pts) {
  const ult = ultimaDe(pts), prev = previaDe(pts);
  if (!prev) return { tipo: 'primera' };
  if ((prev.u || '') !== (ult.u || '')) return { tipo: 'unidad', prev };
  return { tipo: 'delta', delta: ult.v - prev.v, prev };
}

/* ------------------------------------------------------------------ */
/* Clasificación                                                       */
/* ------------------------------------------------------------------ */
const REGLAS_ZONA = [
  ['inf', /femoral|isquio|cuadric|pantorr|gemelo|prensa|sentadilla|silla|aductor|abductor|gluteo|pierna/],
  ['sup', /bicep|tricep|hombro|banca|pectoral|bench|dorsal|espalda|pull|press|remo|jalon/],
];
function zona(nombre) {
  const n = norm(nombre);
  for (const [z, re] of REGLAS_ZONA) if (re.test(n)) return z;
  return 'otro';
}
const ZONAS = [['sup', 'Tren superior'], ['inf', 'Tren inferior'], ['otro', 'Otros ejercicios']];

function partirNombre(nombre) {
  const m = String(nombre || '').match(/^(.*?)\s*\((.+)\)\s*$/);
  return m ? { main: m[1], sub: m[2] } : { main: String(nombre || ''), sub: '' };
}
/** "Salto largo (m)" -> "Salto largo" cuando el paréntesis solo repite la unidad. */
function nombreTest(t, u) {
  const m = String(t || '').match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m && (norm(m[2]) === norm(u) || ['cm', 'm', 'kg', 'w', 'ms', 'm/s'].includes(norm(m[2])))) return m[1];
  return String(t || '');
}

const porBloque = (lista, b) => lista.filter((r) => norm(r.b) === norm(b));

/* ------------------------------------------------------------------ */
/* Vista                                                               */
/* ------------------------------------------------------------------ */
export function render(cont, p, ctx) {
  destroy();
  const rm = (p.rm || []).filter((r) => r && r.ej);
  const tf = (p.testsFisicos || []).filter((r) => r && r.t);
  cont.innerHTML = '<div class="fz"><h1 class="vista-h1">Fuerza</h1><div id="fz-cuerpo" class="fz-cuerpo"></div></div>';
  const cuerpo = cont.querySelector('#fz-cuerpo');

  if (!rm.length && !tf.length) {
    cuerpo.append(vacio({
      titulo: 'Aún no hay tests de fuerza',
      texto: 'Cuando midan tu 1RM, tus saltos o tu flexibilidad, aquí verás cada medición y cuánto cambió desde la anterior.',
      icon: 'carril',
    }));
    return;
  }

  /* ------------------------- series ------------------------- */
  const sinFecha = tf.filter((r) => !r.f);
  const rmGym = agrupar(rm, (r) => r.ej);
  const bl = {
    eval1rm: agrupar(porBloque(tf, '1RM'), (r) => r.t),
    saltos: porBloque(tf, 'Salto'),
    test: agrupar(porBloque(tf, 'Test físico'), (r) => r.t),
    flex: agrupar(porBloque(tf, 'Flexibilidad'), (r) => r.t),
    medidas: agrupar(porBloque(tf, 'Medidas'), (r) => r.t),
    perfil: porBloque(tf, 'Perfil').filter((r) => r.f && r.v != null && r.v !== ''),
  };

  // saltos: tipo -> métrica -> serie
  const saltos = new Map();
  for (const r of bl.saltos) {
    if (!r.f || !esNum(r.v)) continue;
    const [tipoRaw, metRaw] = String(r.t).split(/\s[–-]\s/);
    const tipo = (tipoRaw || r.t).trim();
    const nMet = norm(metRaw || 'altura');
    const met = /altura/.test(nMet) ? 'altura' : /vuelo/.test(nMet) ? 'vuelo' : /veloc/.test(nMet) ? 'velocidad' : /potenc/.test(nMet) ? 'potencia' : nMet;
    if (!saltos.has(tipo)) saltos.set(tipo, []);
    saltos.get(tipo).push({ ...r, _met: met });
  }
  const saltosSeries = new Map();
  for (const [tipo, regs] of saltos) saltosSeries.set(tipo, agrupar(regs, (r) => r._met));

  // resumen general
  const fechasTodas = new Set([...rm.map((r) => r.f), ...tf.map((r) => r.f)].filter(Boolean));
  const ultimaFecha = [...fechasTodas].sort().pop() || null;
  let comparables = 0, mejoras = 0, pruebasMedidas = 0;
  const cuenta = (pts, { suma = true } = {}) => {
    pruebasMedidas += 1;
    if (!suma) return;
    const c = cambioDe(pts);
    if (c.tipo === 'delta') { comparables += 1; if (c.delta > 0) mejoras += 1; }
  };
  rmGym.forEach((pts) => cuenta(pts));
  bl.eval1rm.forEach((pts) => cuenta(pts));
  bl.test.forEach((pts) => cuenta(pts));
  bl.flex.forEach((pts) => cuenta(pts, { suma: false }));
  saltosSeries.forEach((mets) => {
    pruebasMedidas += 1;
    mets.forEach((pts) => { const c = cambioDe(pts); if (c.tipo === 'delta') { comparables += 1; if (c.delta > 0) mejoras += 1; } });
  });

  const hay = {
    rm: rmGym.size > 0 || bl.eval1rm.size > 0,
    saltos: saltosSeries.size > 0,
    test: bl.test.size > 0,
    flex: bl.flex.size > 0,
    medidas: bl.medidas.size > 0 || bl.perfil.length > 0,
    sinfecha: sinFecha.length > 0,
  };

  /* ------------------------- cifras ------------------------- */
  const cifras = `
    <dl class="cifras" aria-label="Resumen de tu fuerza y condición física">
      <div class="cifra"><dt class="label">${plural(pruebasMedidas, 'Prueba medida', 'Pruebas medidas')}</dt><dd class="num">${pruebasMedidas}</dd></div>
      <div class="cifra"><dt class="label">${plural(fechasTodas.size, 'Día de medición', 'Días de medición')}</dt><dd class="num">${fechasTodas.size}</dd></div>
      <div class="cifra cifra-fecha"><dt class="label">Última medición</dt><dd class="num">${ultimaFecha ? esc(fechaCorta(ultimaFecha)) : '–'}</dd></div>
      <div class="cifra"><dt class="label">Pruebas con mejora</dt><dd class="num ${mejoras ? 'cifra-acento' : ''}">${comparables ? `${mejoras}<span class="cifra-de"> de ${comparables}</span>` : '–'}</dd></div>
    </dl>
    ${comparables ? `<p class="fz-resumen">${mejoras
      ? `Subiste en <b class="num">${mejoras}</b> de <b class="num">${comparables}</b> ${plural(comparables, 'prueba', 'pruebas')} frente a tu medición anterior.`
      : `Comparamos tu última medición con la anterior en <b class="num">${comparables}</b> ${plural(comparables, 'prueba', 'pruebas')}. La próxima vez, a subir.`}</p>` : ''}`;

  /* ------------------------- navegación ------------------------- */
  const SECCIONES = [
    { id: 'rm', t: '1RM' },
    { id: 'saltos', t: 'Saltos' },
    { id: 'test', t: 'Test físico' },
    { id: 'flex', t: 'Flexibilidad' },
    { id: 'medidas', t: 'Medidas' },
    ...(hay.sinfecha ? [{ id: 'sinfecha', t: 'Sin fecha' }] : []),
  ];
  const nav = `
    <div class="selector fz-selector">
      <nav aria-label="Secciones de fuerza"><div class="selector-fila fz-nav">${SECCIONES.map((s) => `<button type="button" class="chip" data-sec="${s.id}" ${hay[s.id] ? '' : 'aria-disabled="true"'}>${esc(s.t)}</button>`).join('')}</div></nav>
    </div>`;

  cuerpo.innerHTML = `${cifras}${nav}<div class="fz-secciones" id="fz-secs"></div>`;
  const secs = cuerpo.querySelector('#fz-secs');

  const seccion = (id, titulo, intro) => {
    const s = el(`<section class="fz-sec" id="fz-s-${id}" aria-labelledby="fz-h-${id}" data-id="${id}"><div class="fz-sec-cab"><h2 class="h2" id="fz-h-${id}">${esc(titulo)}</h2>${intro ? `<p class="fz-intro">${esc(intro)}</p>` : ''}</div></section>`);
    secs.append(s);
    return s;
  };
  const html = (s, h) => s.append(el(`<div class="fz-bloque">${h}</div>`));

  /* ------------------------- 1RM ------------------------- */
  (function () {
    const s = seccion('rm', '1RM · fuerza máxima', hay.rm ? 'Cuánto peso levantas en una sola repetición, ejercicio por ejercicio.' : '');
    if (!hay.rm) { s.append(vacio({ titulo: 'Aún no hay mediciones de 1RM', texto: 'Cuando midan tu fuerza máxima en pesas, verás cada ejercicio con su evolución.', icon: 'carril' })); return; }

    if (rmGym.size) {
      const grupos = ZONAS.map(([z, nombre]) => ({ nombre, items: [...rmGym].filter(([ej]) => zona(ej) === z).sort((a, b) => a[0].localeCompare(b[0], 'es')) })).filter((g) => g.items.length);
      html(s, `
        <div class="fz-sub-cab"><h3 class="h3">Sistema RM del gimnasio</h3><p class="fz-sub-txt">Mediciones en las máquinas del gimnasio. Cada ejercicio se compara solo con mediciones en su misma unidad (kg o lb).</p></div>
        ${grupos.map((g) => `
          <div class="fz-zona"><p class="label fz-zona-t">${esc(g.nombre)}</p>
            <div class="rejilla-metricas fz-rejilla">${g.items.map(([ej, pts]) => tarjetaRM(ej, pts)).join('')}</div>
          </div>`).join('')}`);
    }

    if (bl.eval1rm.size) {
      const grupos = ZONAS.map(([z, nombre]) => ({ nombre, items: [...bl.eval1rm].filter(([t]) => zona(t) === z).sort((a, b) => a[0].localeCompare(b[0], 'es')) })).filter((g) => g.items.length);
      html(s, `
        <div class="fz-sub-cab"><h3 class="h3">Evaluación 1RM</h3><p class="fz-sub-txt">Evaluaciones de fuerza máxima registradas siempre en kg. Son aparte del sistema del gimnasio: no se suman ni se comparan con él.</p></div>
        <div class="card fz-eval">${grupos.map((g) => `
          <p class="label fz-zona-t">${esc(g.nombre)}</p>
          <ul class="lista-filas">${g.items.map(([t, pts]) => filaEval(t, pts)).join('')}</ul>`).join('')}</div>`);
    }
  })();

  function textoCambio(c, ult, { neutral = false } = {}) {
    if (c.tipo === 'primera') return '<p class="fz-var"><span class="var var-igual">Primera medición</span></p>';
    if (c.tipo === 'unidad') return `<p class="fz-var"><span class="tag">Cambió la unidad</span></p><p class="fz-nota">Antes: ${esc(num(c.prev.v, decDe(c.prev.u)))} ${esc(uTxt(c.prev.u))} · ${esc(fecha(c.prev.f))}. Con otra unidad no hay variación.</p>`;
    return `<p class="fz-var">${varHTML(c.delta, uTxt(ult.u), { neutral, dec: decDe(ult.u) })}<span class="fz-vs">vs. ${esc(fecha(c.prev.f))}</span></p>`;
  }

  function tarjetaRM(ej, pts) {
    const ult = ultimaDe(pts);
    const c = cambioDe(pts);
    const comp = pts.filter((x) => (x.u || '') === (ult.u || ''));
    const { main, sub } = partirNombre(ej);
    const spark = comp.length >= 3
      ? `<div class="fz-spark">${sparklineMas(comp.map((x) => x.v), { fluido: true, ancho: 200, alto: 40, etiqueta: `Evolución de ${ej} en ${uTxt(ult.u)}: ${comp.map((x) => num(x.v)).join(', ')}` })}<p class="fz-spark-cap">${comp.length} mediciones en ${esc(uTxt(ult.u))}</p></div>`
      : '';
    return `
      <article class="metrica-card fz-card">
        <h4 class="fz-nombre">${esc(main)}${sub ? `<span class="fz-sub"> ${esc(sub)}</span>` : ''}</h4>
        <p class="valor num">${esc(num(ult.v))}<span class="unidad">${esc(uTxt(ult.u))}</span></p>
        ${textoCambio(c, ult)}
        ${spark}
        <p class="fz-fecha">${esc(fecha(ult.f))}</p>
      </article>`;
  }

  function filaEval(t, pts) {
    const ult = ultimaDe(pts), c = cambioDe(pts);
    return `
      <li class="fila-rp">
        <div class="fr-main"><p class="fr-t">${esc(t)}</p><p class="fr-s">${esc(fecha(ult.f))}${c.tipo === 'delta' ? ` · antes ${esc(num(c.prev.v))} ${esc(uTxt(c.prev.u))}` : ''}</p></div>
        <div class="fr-der"><span class="fr-tiempo num">${esc(num(ult.v))}<span class="fz-u"> ${esc(uTxt(ult.u))}</span></span>${c.tipo === 'delta' ? varHTML(c.delta, uTxt(ult.u), { dec: decDe(ult.u) }) : '<span class="var var-igual">primera</span>'}</div>
      </li>`;
  }

  /* ------------------------- Saltos ------------------------- */
  (function () {
    const s = seccion('saltos', 'Saltos', hay.saltos ? 'Qué tan alto saltas, cuánto tiempo estás en el aire y con qué velocidad despegas.' : '');
    if (!hay.saltos) { s.append(vacio({ titulo: 'Aún no hay tests de salto', texto: 'Cuando midan tu salto vertical, verás tu altura, tiempo de vuelo y velocidad.', icon: 'carril' })); return; }
    const orden = ['squat jump', 'salto vertical', 'abalakov'];
    const tipos = [...saltosSeries].sort((a, b) => (orden.indexOf(norm(a[0])) + 1 || 99) - (orden.indexOf(norm(b[0])) + 1 || 99));
    html(s, `<div class="fz-saltos">${tipos.map(([tipo, mets]) => {
      const prim = mets.get('altura') || [...mets.values()][0];
      const ult = ultimaDe(prim), c = cambioDe(prim);
      const otros = [['vuelo', 'Tiempo de vuelo'], ['velocidad', 'Velocidad'], ['potencia', 'Potencia']].filter(([k]) => mets.has(k));
      const esAltura = mets.has('altura');
      const unidad = esAltura ? 'cm' : uTxt(ult.u);
      const spark = prim.length >= 3
        ? `<div class="fz-spark">${sparklineMas(prim.map((x) => x.v), { fluido: true, ancho: 200, alto: 40, etiqueta: `Evolución de la altura de ${tipo}: ${prim.map((x) => num(x.v)).join(', ')} cm` })}<p class="fz-spark-cap">${prim.length} mediciones</p></div>`
        : '';
      return `
        <article class="metrica-card fz-card fz-salto">
          <h4 class="fz-nombre">${esc(tipo)}<span class="fz-sub"> · ${esAltura ? 'altura' : esc([...mets.keys()][0])}</span></h4>
          <p class="valor num">${esc(num(ult.v, esAltura ? 1 : decDe(ult.u)))}<span class="unidad">${esc(unidad)}</span></p>
          ${textoCambio(c, { ...ult, u: unidad }, {})}
          ${spark}
          ${otros.length ? `<dl class="fz-mini">${otros.map(([k, et]) => {
            const pts = mets.get(k), u2 = ultimaDe(pts), c2 = cambioDe(pts);
            return `<div><dt>${et}</dt><dd class="num">${esc(num(u2.v, decDe(u2.u)))}<span class="fz-u"> ${esc(uTxt(u2.u))}</span>${c2.tipo === 'delta' ? ` ${varHTML(c2.delta, '', { dec: decDe(u2.u) })}` : ''}</dd></div>`;
          }).join('')}</dl>` : ''}
          <p class="fz-fecha">${esc(fecha(ult.f))}</p>
        </article>`;
    }).join('')}</div>`);
  })();

  /* ------------------------- Test físico ------------------------- */
  (function () {
    const s = seccion('test', 'Test físico', hay.test ? 'Repeticiones y distancias en cada prueba. Aquí, más es mejor.' : '');
    if (!hay.test) { s.append(vacio({ titulo: 'Aún no hay tests físicos', texto: 'Abdominales, lumbares, flexiones, sentadillas y saltos aparecerán aquí con su evolución.', icon: 'carril' })); return; }
    const items = [...bl.test].sort((a, b) => ultimaDe(b[1]).f.localeCompare(ultimaDe(a[1]).f) || a[0].localeCompare(b[0], 'es'));
    html(s, `<div class="rejilla-metricas fz-rejilla fz-tests">${items.map(([t, pts]) => {
      const ult = ultimaDe(pts), c = cambioDe(pts);
      const u = uTxt(ult.u);
      const dec = decDe(ult.u);
      const barras = pts.length >= 2 ? (() => {
        const ver = pts.slice(-4);
        const max = Math.max(...ver.map((x) => x.v), 1e-9);
        return `<ul class="barras fz-barras" aria-label="Evolución de ${esc(nombreTest(t, ult.u))}">${ver.map((x, i) => `
          <li class="barra ${i === ver.length - 1 ? 'fz-ahora' : 'fz-antes'}">
            <div class="barra-cab"><span class="barra-et">${esc(fecha(x.f))}</span><span class="barra-val num">${esc(num(x.v, decDe(x.u)))} ${esc(uTxt(x.u))}</span></div>
            <div class="barra-riel" aria-hidden="true"><span class="barra-rell" style="--v:${Math.max(0.02, Math.min(1, x.v / max))};--i:${i}"></span></div>
          </li>`).join('')}</ul>`;
      })() : '';
      return `
        <article class="metrica-card fz-card fz-test">
          <h4 class="fz-nombre">${esc(nombreTest(t, ult.u))}</h4>
          <p class="valor num">${esc(num(ult.v, dec))}<span class="unidad">${esc(u)}</span></p>
          ${textoCambio(c, ult)}
          ${barras}
          ${pts.length < 2 ? `<p class="fz-fecha">${esc(fecha(ult.f))}</p>` : ''}
        </article>`;
    }).join('')}</div>`);
  })();

  /* ------------------------- Flexibilidad ------------------------- */
  (function () {
    const s = seccion('flex', 'Flexibilidad', hay.flex ? 'Medidas en centímetros. Las flechas solo dicen si el número subió o bajó: qué es mejor depende de cada prueba.' : '');
    if (!hay.flex) { s.append(vacio({ titulo: 'Aún no hay medidas de flexibilidad', texto: 'Hombro, tobillo e isquiotibiales aparecerán aquí con su evolución.', icon: 'carril' })); return; }
    const items = [...bl.flex].sort((a, b) => a[0].localeCompare(b[0], 'es'));
    html(s, `<div class="card fz-flex"><ul class="lista-filas">${items.map(([t, pts]) => {
      const ult = ultimaDe(pts), c = cambioDe(pts);
      const nombre = cap(String(t).replace(/^flexibilidad\s+(de\s+|en\s+)?/i, '').replace(/\s*\(cm\)\s*$/i, '')) || t;
      const hist = pts.slice(0, -1).slice(-3);
      return `
        <li class="fila-rp">
          <div class="fr-main"><p class="fr-t">${esc(nombre)}</p><p class="fr-s">${esc(fecha(ult.f))}${hist.length ? ` · antes ${hist.map((x) => esc(num(x.v))).join(', ')}` : ''}</p></div>
          <div class="fr-der"><span class="fr-tiempo num">${esc(num(ult.v))}<span class="fz-u"> ${esc(uTxt(ult.u) || 'cm')}</span></span>${c.tipo === 'delta' ? varHTML(c.delta, uTxt(ult.u) || 'cm', { neutral: true, dec: 1 }) : '<span class="var var-igual">primera</span>'}</div>
        </li>`;
    }).join('')}</ul></div>`);
  })();

  /* ------------------------- Medidas y perfil ------------------------- */
  (function () {
    const s = seccion('medidas', 'Medidas y perfil', hay.medidas ? 'Datos de referencia que se toman junto con los tests.' : '');
    if (!hay.medidas) { s.append(vacio({ titulo: 'Aún no hay medidas en tus tests', texto: 'Peso, estatura, envergadura y especialización aparecerán aquí.', icon: 'carril' })); return; }
    const orden = ['peso corporal', 'estatura', 'envergadura'];
    const items = [...bl.medidas].sort((a, b) => (orden.indexOf(norm(a[0])) + 1 || 99) - (orden.indexOf(norm(b[0])) + 1 || 99));
    const perfil = bl.perfil.slice().sort((a, b) => a.f.localeCompare(b.f)).pop();
    html(s, `
      <div class="card fz-medidas">
        <ul class="lista-filas">${items.map(([t, pts]) => {
          const ult = ultimaDe(pts), c = cambioDe(pts);
          return `
            <li class="fila-rp">
              <div class="fr-main"><p class="fr-t">${esc(t)}</p><p class="fr-s">${esc(fecha(ult.f))}</p></div>
              <div class="fr-der"><span class="fr-tiempo num">${esc(num(ult.v))}<span class="fz-u"> ${esc(uTxt(ult.u))}</span></span>${c.tipo === 'delta' ? varHTML(c.delta, uTxt(ult.u), { neutral: true, dec: 1 }) : ''}</div>
            </li>`;
        }).join('')}
        ${perfil ? `<li class="fila-rp"><div class="fr-main"><p class="fr-t">Especialización</p><p class="fr-s">${esc(fecha(perfil.f))}</p></div><div class="fr-der"><span class="chip-neutro fz-chip">${esc(tituloEvento(String(perfil.v)))}</span></div></li>` : ''}</ul>
      </div>`);
  })();

  /* ------------------------- Sin fecha ------------------------- */
  if (hay.sinfecha) {
    const s = seccion('sinfecha', 'Sin fecha', 'Mediciones cuyo día no quedó registrado.');
    html(s, `<div class="card"><ul class="lista-filas">${sinFecha.map((r) => `
      <li class="fila-rp"><div class="fr-main"><p class="fr-t">${esc(nombreTest(r.t, r.u))}</p><p class="fr-s">${esc(r.b || 'Test')}</p></div>
      <div class="fr-der"><span class="fr-tiempo num">${esc(esNum(r.v) ? num(r.v, decDe(r.u)) : String(r.v ?? '–'))}<span class="fz-u"> ${esc(uTxt(r.u))}</span></span></div></li>`).join('')}</ul></div>`);
  }

  /* ------------------------- interacción de la navegación ------------------------- */
  const chips = [...cuerpo.querySelectorAll('.fz-nav .chip')];
  const marcar = (id) => chips.forEach((c) => { if (c.dataset.sec === id) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current'); });
  let bloquear = 0;
  pistaScroll(cuerpo.querySelector('.fz-nav'));
  cuerpo.querySelector('.fz-nav').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    const dest = cuerpo.querySelector(`#fz-s-${b.dataset.sec}`);
    if (!dest) return;
    marcar(b.dataset.sec);
    bloquear = Date.now() + 900;
    dest.scrollIntoView({ block: 'start', behavior: reducirMovimiento() ? 'auto' : 'smooth' });
    b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
  });
  if ('IntersectionObserver' in window) {
    const visibles = new Set();
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach((x) => { if (x.isIntersecting) visibles.add(x.target.dataset.id); else visibles.delete(x.target.dataset.id); });
      if (Date.now() < bloquear || !visibles.size) return;
      const id = SECCIONES.map((s) => s.id).find((k) => visibles.has(k));
      marcar(id);
      const chip = chips.find((c) => c.dataset.sec === id);
      const fila = chip?.parentElement;
      if (chip && fila && fila.scrollWidth > fila.clientWidth) fila.scrollTo({ left: chip.offsetLeft - 16, behavior: 'auto' });
    }, { rootMargin: '-120px 0px -65% 0px' });
    secs.querySelectorAll('.fz-sec').forEach((n) => io.observe(n));
    limpiezas.push(() => io.disconnect());
  }
}
