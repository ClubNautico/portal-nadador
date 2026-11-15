// Tests de agua: progresión de tus tests de entrenamiento frente a tus marcas de competencia.
import { el, variacion, animarTiempo, vacio, grupoRadio, guardado, reducirMovimiento } from '../ui.js';
import { crearGraficoProgresion } from '../graficos.js';
import { esc, fechaCorta, fmtTiempo, fmtDelta, plural, parseISO, MESES, tituloEvento } from '../formato.js';
import { ESTILOS, msDe } from '../datos.js';
import { rombo } from '../iconos.js';

const CLAVE = 'portal.agua.prueba';
const DIA = 86400000;
let limpiezas = [];

export function destroy() {
  limpiezas.forEach((f) => { try { f(); } catch {} });
  limpiezas = [];
}

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */
const esAprox = (t) => /aproximad|d[ií]a no registrado/i.test(t.fu || '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const hora = (t) => t.t || fmtTiempo(t.s);
const nombreDe = (pr) => `${pr.dist} m ${pr.est.toLowerCase()}${pr.sal ? ' con salida' : ''}`;
const obsLimpia = (t) => String(t.obs || '').replace(/^con salida;?\s*/i, '').trim();

function fechaTxt(f, aprox) {
  const x = parseISO(f);
  if (!x) return 'sin fecha';
  return aprox ? `${MESES[x.m - 1]} ${x.y} aprox.` : fechaCorta(f);
}

function preparar(p) {
  const tests = (p.testsAgua || [])
    .filter((t) => t && t.f && Number.isFinite(t.s) && t.est && t.dist)
    .map((t, i) => {
      const sal = /^con salida/i.test(t.obs || '');
      return { ...t, _i: i, ms: msDe(t.f), sal, aprox: esAprox(t), key: `${t.est}|${t.dist}|${sal ? 's' : ''}` };
    })
    .sort((a, b) => a.ms - b.ms || a._i - b._i);
  const pruebas = new Map();
  for (const t of tests) {
    let pr = pruebas.get(t.key);
    if (!pr) { pr = { key: t.key, est: t.est, dist: t.dist, sal: t.sal, tests: [] }; pruebas.set(t.key, pr); }
    pr.tests.push(t);
  }
  for (const pr of pruebas.values()) {
    pr.mejor = pr.tests.reduce((m, t) => (t.s < m.s ? t : m), pr.tests[0]);
    pr.ultimo = pr.tests[pr.tests.length - 1];
  }
  return { tests, pruebas };
}

/** Test inmediatamente anterior (otro día) de la misma prueba; si hubo varios ese día, el más rápido. */
function anteriorDe(pr, t) {
  const previos = pr.tests.filter((x) => x.ms < t.ms);
  if (!previos.length) return null;
  const dia = previos[previos.length - 1].ms;
  return previos.filter((x) => x.ms === dia).reduce((m, x) => (x.s < m.s ? x : m));
}

const ordenPruebas = (a, b) => ESTILOS.indexOf(a.est) - ESTILOS.indexOf(b.est) || a.dist - b.dist || Number(a.sal) - Number(b.sal);

/* ------------------------------------------------------------------ */
/* Vista                                                               */
/* ------------------------------------------------------------------ */
export function render(cont, p, ctx) {
  destroy();
  const { tests, pruebas } = preparar(p);
  cont.innerHTML = '<div class="ag"><h1 class="vista-h1">Tests de agua</h1><div id="ag-cuerpo" class="ag-cuerpo"></div></div>';
  const cuerpo = cont.querySelector('#ag-cuerpo');

  if (!tests.length) {
    cuerpo.append(vacio({
      titulo: 'Aún no hay tests de agua',
      texto: 'Cuando hagas tu primer test en la piscina, aquí verás tus tiempos y cómo se comparan con tus marcas de competencia.',
      icon: 'carril',
    }));
    return;
  }

  const lista = [...pruebas.values()].sort(ordenPruebas);
  const fechas = [...new Set(tests.map((t) => t.f))];
  const ultimaFecha = fechas[fechas.length - 1];
  const ultimosDia = tests.filter((t) => t.f === ultimaFecha);
  const ultimaAprox = ultimosDia.every((t) => t.aprox);

  // ---- prueba inicial: la guardada si existe; si no, la más repetida (y, a igualdad, la más reciente)
  const guardada = guardado.leer(CLAVE);
  const masTests = [...pruebas.values()].sort((a, b) => b.tests.length - a.tests.length || b.ultimo.ms - a.ultimo.ms)[0];
  const claveGuardada = guardada ? `${guardada.est}|${guardada.dist}|${guardada.sal ? 's' : ''}` : null;
  const estado = { key: claveGuardada && pruebas.has(claveGuardada) ? claveGuardada : masTests.key };
  const actual = () => pruebas.get(estado.key);

  cuerpo.innerHTML = `
    <dl class="cifras" aria-label="Resumen de tus tests de agua">
      <div class="cifra"><dt class="label">${plural(tests.length, 'Test registrado', 'Tests registrados')}</dt><dd class="num">${tests.length}</dd></div>
      <div class="cifra"><dt class="label">${plural(pruebas.size, 'Prueba distinta', 'Pruebas distintas')}</dt><dd class="num">${pruebas.size}</dd></div>
      <div class="cifra"><dt class="label">${plural(fechas.length, 'Día de tests', 'Días de tests')}</dt><dd class="num">${fechas.length}</dd></div>
      <div class="cifra cifra-fecha"><dt class="label">Último test</dt><dd class="num">${esc(fechaTxt(ultimaFecha, ultimaAprox).replace(' aprox.', ''))}${ultimaAprox ? '<span class="cifra-aprox"> aprox.</span>' : ''}</dd></div>
    </dl>

    <div class="selector">
      <div class="selector-fila" id="ag-est"></div>
      <div class="selector-fila selector-2"><div class="chips-dist" id="ag-dist"></div></div>
    </div>

    <section class="card card-grafico ag-graf" aria-labelledby="ag-gt">
      <div class="graf-titulo"><h2 class="h3" id="ag-gt"></h2><p class="ag-graf-sub" id="ag-gs"></p></div>
      <div id="ag-g"></div>
    </section>

    <div id="ag-stats"></div>

    <section class="card ag-ses" aria-labelledby="ag-st">
      <div class="card-cab"><h2 class="h3" id="ag-st">Última sesión de tests</h2><span class="ag-ses-f num">${esc(fechaTxt(ultimaFecha, ultimaAprox))}</span></div>
      <ul class="lista-filas" id="ag-ses"></ul>
    </section>

    <section class="card rend-tabla-card" aria-labelledby="ag-mt">
      <div class="card-cab rend-pad"><h2 class="h3" id="ag-mt">Todos tus tests, prueba por prueba</h2></div>
      <div id="ag-mx"></div>
    </section>`;
  const $ = (s) => cuerpo.querySelector(s);

  /* ---------------------------- selector ---------------------------- */
  const prsDe = (est) => lista.filter((pr) => pr.est === est);
  const estilosItems = () => ESTILOS.map((e) => ({ valor: e, etiqueta: e, deshabilitado: !prsDe(e).length }));
  const distItems = () => {
    const act = actual();
    const dists = [...new Map(lista.map((pr) => [`${pr.dist}|${pr.sal}`, pr])).values()].sort((a, b) => a.dist - b.dist || Number(a.sal) - Number(b.sal));
    return dists.map((d) => ({
      valor: `${d.dist}${d.sal ? 's' : ''}`,
      etiqueta: d.sal ? `${d.dist} con salida` : String(d.dist),
      deshabilitado: !pruebas.has(`${act.est}|${d.dist}|${d.sal ? 's' : ''}`),
    }));
  };
  const valorDist = () => `${actual().dist}${actual().sal ? 's' : ''}`;

  const gEst = grupoRadio($('#ag-est'), {
    items: estilosItems(), valor: actual().est, aria: 'Estilo', onChange: (v) => {
      const act = actual();
      const igual = pruebas.get(`${v}|${act.dist}|${act.sal ? 's' : ''}`);
      if (igual) estado.key = igual.key;
      else estado.key = prsDe(v).sort((a, b) => b.tests.length - a.tests.length || b.ultimo.ms - a.ultimo.ms)[0].key;
      actualizar(true);
    },
  });
  const gDist = grupoRadio($('#ag-dist'), {
    items: distItems(), valor: valorDist(), aria: 'Distancia en metros', onChange: (v) => {
      const sal = v.endsWith('s');
      const dist = Number(v.replace('s', ''));
      estado.key = `${actual().est}|${dist}|${sal ? 's' : ''}`;
      actualizar(true);
    },
  });

  /* ---------------------------- gráfico ---------------------------- */
  let grafico = null;
  let primeraVez = true;

  function competencia(pr) {
    if (pr.sal) return null;
    return (p.mejores?.['25'] || []).find((m) => m.est === pr.est && Number(m.dist) === Number(pr.dist) && Number.isFinite(m.s)) || null;
  }

  function series(pr) {
    const a = {
      id: 'tests', etiqueta: 'Tests de agua', clase: 'a',
      puntos: pr.tests.map((t, j) => ({
        id: `t-${j}`, x: t.ms, y: t.s, t: hora(t),
        ev: `Test de agua${t.br != null ? ` · ${t.br} brazadas` : ''}${t.aprox ? ' · fecha aproximada' : ''}`,
        rp: false,
      })),
    };
    const comp = competencia(pr);
    if (!comp) return [a];
    const x0 = pr.tests[0].ms, x1 = pr.tests[pr.tests.length - 1].ms;
    const [xa, xb] = x1 - x0 < DIA * 2 ? [x0 - DIA * 45, x1 + DIA * 45] : [x0, x1];
    const ev = `Referencia: tu mejor en competencia, ${fechaCorta(comp.f)}${comp.ev ? ` · ${tituloEvento(comp.ev)}` : ''}`;
    const b = {
      id: 'comp', etiqueta: 'Tu mejor en competencia', clase: 'b',
      puntos: [{ id: 'c-0', x: xa, y: comp.s, t: comp.t || fmtTiempo(comp.s), ev, rp: false }, { id: 'c-1', x: xb, y: comp.s, t: comp.t || fmtTiempo(comp.s), ev, rp: false }],
    };
    return [a, b];
  }

  function pintarGrafico(pr, anim) {
    const nombre = nombreDe(pr);
    $('#ag-gt').textContent = cap(nombre);
    const comp = competencia(pr);
    $('#ag-gs').textContent = comp
      ? `La línea punteada es tu mejor marca en competencia (piscina de 25 m): ${comp.t || fmtTiempo(comp.s)}.`
      : pr.sal ? 'Este test se hace con salida; no tiene una marca de competencia equivalente.' : 'Aún no tienes marca de competencia en esta prueba para comparar.';
    const primero = pr.tests[0], ult = pr.ultimo;
    const desc = pr.tests.length > 1
      ? `Progresión de tus tests de ${nombre}: de ${hora(primero)} el ${fechaTxt(primero.f, primero.aprox)} a ${hora(ult)} el ${fechaTxt(ult.f, ult.aprox)}.${comp ? ` Tu mejor en competencia es ${comp.t || fmtTiempo(comp.s)}.` : ''}`
      : `Test de ${nombre}: ${hora(ult)} el ${fechaTxt(ult.f, ult.aprox)}.`;
    const opts = { ariaLabel: desc, series: series(pr), activo: `t-${pr.tests.length - 1}` };
    if (!grafico) grafico = crearGraficoProgresion($('#ag-g'), opts);
    else grafico.update(opts, { anim: !primeraVez || anim });
    primeraVez = false;
  }

  /* ---------------------------- tarjetas ---------------------------- */
  function pintarTarjetas(pr) {
    const nombre = nombreDe(pr);
    const { mejor, ultimo } = pr;
    const prev = anteriorDe(pr, ultimo);
    const unico = pr.tests.length === 1;
    const esMejor = ultimo.s <= mejor.s + 0.004;
    const comp = competencia(pr);

    // brecha frente a competencia
    let brecha = '';
    if (comp) {
      const g = mejor.s - comp.s;
      brecha = Math.abs(g) < 0.005
        ? `Tu mejor test iguala tu mejor marca en competencia (${esc(comp.t || fmtTiempo(comp.s))}).`
        : g > 0
          ? `Tu mejor test está a <b class="num">${fmtDelta(g)} s</b> de tu mejor marca en competencia (${esc(comp.t || fmtTiempo(comp.s))}).`
          : `Tu mejor test es <b class="num">${fmtDelta(g)} s</b> más rápido que tu mejor marca en competencia (${esc(comp.t || fmtTiempo(comp.s))}).`;
    }

    // brazadas
    const conBr = pr.tests.filter((t) => t.br != null && Number.isFinite(t.br));
    let brV, brS = '';
    if (ultimo.br != null) {
      brV = `<p class="metrica-v num">${ultimo.br}<span class="u"> br</span></p>`;
      const antes = conBr.filter((t) => t.ms < ultimo.ms);
      const ant = antes.length ? antes[antes.length - 1] : null;
      if (ant) {
        const d = ant.br - ultimo.br;
        brS += d === 0 ? '<p class="metrica-s var-igual">= igual que el test anterior</p>'
          : `<p class="metrica-s"><span class="var ${d > 0 ? 'var-ok' : 'var-mal'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)} ${d > 0 ? 'menos' : 'más'}</span> que el test anterior</p>`;
      } else brS += '<p class="metrica-s">Primer test con brazadas</p>';
      if (conBr.length >= 3) {
        const primeraBr = conBr[0].br;
        brS += `<p class="metrica-s">Tendencia: de ${primeraBr} a ${ultimo.br} en ${conBr.length} tests</p>`;
      }
    } else if (conBr.length) {
      const l = conBr[conBr.length - 1];
      brV = '<p class="metrica-v num sin">–</p>';
      brS = `<p class="metrica-s">No contaron brazadas en el último test. La última vez: ${l.br} (${esc(fechaTxt(l.f, l.aprox))}).</p>`;
    } else {
      brV = '<p class="metrica-v num sin">–</p>';
      brS = '<p class="metrica-s">Aún no hay brazadas registradas en esta prueba.</p>';
    }

    const dif = ultimo.s - mejor.s;
    $('#ag-stats').innerHTML = `
      <div class="prog-bloque">
        <article class="card hero-card hero-prog" aria-label="Mejor test de ${esc(nombre)}">
          <p class="label">Mejor test · ${esc(pr.dist)}<span class="u-m">m</span> ${esc(pr.est)}${pr.sal ? ' · con salida' : ''}</p>
          <p class="hero-tiempo num" data-s="${mejor.s}">${esc(hora(mejor))}</p>
          <p class="hero-sub">${esc(fechaTxt(mejor.f, mejor.aprox))}${mejor.br != null ? ` · ${mejor.br} brazadas` : ''}</p>
          ${brecha ? `<p class="hero-sub ag-brecha">${brecha}</p>` : ''}
        </article>
        <div class="metricas">
          <div class="metrica"><p class="label">Último test</p><p class="metrica-v num">${esc(hora(ultimo))}</p>
            <p class="metrica-s">${esc(fechaTxt(ultimo.f, ultimo.aprox))}</p>
            ${prev ? `<p class="metrica-s">${variacion(prev.s - ultimo.s)} vs. test anterior (${esc(hora(prev))})</p>` : '<p class="metrica-s">Primer test de esta prueba</p>'}
          </div>
          <div class="metrica"><p class="label">Frente a tu mejor</p>
            ${unico || esMejor
              ? `<p class="metrica-v num ok">${unico ? '–' : '= mejor'}</p><p class="metrica-s">${unico ? 'Con tu próximo test verás el cambio' : 'Tu último test es tu mejor marca de entrenamiento'}</p>`
              : `<p class="metrica-v num">+${esc(fmtDelta(dif))}<span class="u"> s</span></p><p class="metrica-s">más lento que tu mejor test</p>`}
          </div>
          <div class="metrica"><p class="label">Brazadas del último</p>${brV}${brS}</div>
        </div>
      </div>`;
    const h = $('#ag-stats .hero-tiempo');
    if (h) animarTiempo(h, Number(h.dataset.s), 'agua-hero');
  }

  /* ---------------------------- última sesión ---------------------------- */
  (function sesion() {
    const filas = ultimosDia.map((t) => ({ t, pr: pruebas.get(t.key) })).sort((a, b) => ordenPruebas(a.pr, b.pr) || a.t._i - b.t._i);
    $('#ag-ses').innerHTML = filas.map(({ t, pr }) => {
      const ant = anteriorDe(pr, t);
      const obs = obsLimpia(t);
      return `
        <li class="fila-rp ag-fila">
          <div class="fr-main">
            <p class="fr-t">${esc(cap(nombreDe(pr)))}</p>
            <p class="fr-s">${ant ? `Anterior ${esc(hora(ant))} · ${esc(fechaTxt(ant.f, ant.aprox))}` : 'Primer test de esta prueba'}${t.br != null ? ` · ${t.br} brazadas` : ''}</p>
            ${obs ? `<p class="ag-obs">${esc(obs)}</p>` : ''}
          </div>
          <div class="fr-der"><span class="fr-tiempo num">${esc(hora(t))}</span>${ant ? variacion(ant.s - t.s) : '<span class="var var-igual">primer test</span>'}</div>
        </li>`;
    }).join('');
  })();

  /* ---------------------------- matriz ---------------------------- */
  const porDia = new Map(); // key -> Map(f -> mejor del día)
  for (const t of tests) {
    if (!porDia.has(t.key)) porDia.set(t.key, new Map());
    const m = porDia.get(t.key);
    if (!m.has(t.f) || t.s < m.get(t.f).s) m.set(t.f, t);
  }
  const aproxFecha = new Map(fechas.map((f) => [f, tests.filter((t) => t.f === f).every((t) => t.aprox)]));
  const hayAprox = [...aproxFecha.values()].some(Boolean);
  const hayVarios = tests.some((t) => tests.some((u) => u !== t && u.key === t.key && u.f === t.f));

  const mx = $('#ag-mx');
  mx.innerHTML = `
    <div class="mx-wrap" tabindex="0" role="region" aria-label="Tabla de tus tests por fecha. Desplázala hacia los lados para ver más fechas.">
      <table class="mx">
        <caption class="sr-only">Mejor tiempo de cada prueba en cada día de tests. Más a la derecha, más reciente.</caption>
        <thead><tr><th scope="col" class="mx-h0"><span class="label">Prueba</span></th>${fechas.map((f) => {
          const x = parseISO(f), ap = aproxFecha.get(f);
          return `<th scope="col" class="mx-h" ${f === ultimaFecha ? 'data-ult' : ''}><span class="mx-d">${ap ? MESES[x.m - 1] : `${x.d} ${MESES[x.m - 1]}`}${ap ? '<span aria-hidden="true">~</span><span class="sr-only"> (fecha aproximada)</span>' : ''}</span><span class="mx-a">${x.y}</span></th>`;
        }).join('')}</tr></thead>
        <tbody>${lista.map((pr) => {
          const dias = porDia.get(pr.key);
          const mejorS = Math.min(...[...dias.values()].map((t) => t.s));
          return `<tr data-k="${esc(pr.key)}"><th scope="row" class="mx-f"><button type="button" class="mx-fila" data-k="${esc(pr.key)}" title="Ver esta prueba en el gráfico"><span class="mx-n">${pr.dist}<span class="u-m">m</span> ${esc(pr.est)}</span>${pr.sal ? '<span class="mx-s">con salida</span>' : ''}</button></th>${fechas.map((f) => {
            const t = dias.get(f);
            if (!t) return `<td class="mx-v mx-nada${f === ultimaFecha ? ' mx-ult' : ''}"><span aria-hidden="true">·</span><span class="sr-only">Sin test</span></td>`;
            const es = Math.abs(t.s - mejorS) < 0.0005 && dias.size > 1;
            return `<td class="mx-v${es ? ' mx-mejor' : ''}${f === ultimaFecha ? ' mx-ult' : ''}"><span class="num mx-t">${esc(hora(t))}</span>${t.br != null ? `<span class="mx-br">${t.br} br</span>` : ''}${es ? '<span class="sr-only"> (tu mejor test)</span>' : ''}</td>`;
          }).join('')}</tr>`;
        }).join('')}</tbody>
      </table>
    </div>
    <p class="mx-nota rend-pad">${rombo(8)} Resaltado: tu mejor test de cada prueba (con 2 o más fechas). <span class="mx-br-nota">br = brazadas.</span>${hayVarios ? ' Si hubo dos tests el mismo día, se muestra el más rápido.' : ''}${hayAprox ? ' ~ = el día exacto no quedó registrado.' : ''}</p>`;

  const wrap = mx.querySelector('.mx-wrap');
  const borde = () => {
    const resto = wrap.scrollWidth - wrap.clientWidth - wrap.scrollLeft;
    wrap.classList.toggle('mx-mas', resto > 2);
  };
  wrap.addEventListener('scroll', borde, { passive: true });
  const ro = new ResizeObserver(borde);
  ro.observe(wrap);
  limpiezas.push(() => ro.disconnect());
  wrap.scrollLeft = wrap.scrollWidth; // lo más reciente a la vista
  borde();

  function marcarFila() {
    mx.querySelectorAll('tr[data-k]').forEach((tr) => {
      const es = tr.dataset.k === estado.key;
      tr.classList.toggle('mx-actual', es);
      const b = tr.querySelector('.mx-fila');
      if (es) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
  }
  mx.addEventListener('click', (e) => {
    const b = e.target.closest('.mx-fila');
    if (!b) return;
    estado.key = b.dataset.k;
    actualizar(true);
    const host = $('.ag-graf');
    const r = host.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) host.scrollIntoView({ block: 'start', behavior: reducirMovimiento() ? 'auto' : 'smooth' });
  });

  /* ---------------------------- orquesta ---------------------------- */
  function actualizar(anim) {
    const pr = actual();
    guardado.poner(CLAVE, { est: pr.est, dist: pr.dist, sal: pr.sal });
    gEst.setItems(estilosItems(), pr.est);
    gDist.setItems(distItems(), valorDist());
    pintarGrafico(pr, anim);
    pintarTarjetas(pr);
    marcarFila();
  }
  actualizar(false);
  limpiezas.push(() => { grafico?.destroy(); grafico = null; });
}
