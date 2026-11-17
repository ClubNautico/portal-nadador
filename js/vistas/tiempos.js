// Tiempos: Progresión, Mejores marcas y Línea de tiempo.
import { icono } from '../iconos.js';
import { el, chipRP, variacion, animarTiempo, vacio, grupoRadio, pestanas, guardado, reducirMovimiento } from '../ui.js';
import { crearGraficoProgresion } from '../graficos.js';
import { esc, fechaCorta, fechaMes, ordinal, tituloEvento, fmtTiempo, rangoFechas, plural, parseISO, MESES } from '../formato.js';
import { ESTILOS, estadisticas, msDe } from '../datos.js';

const CLAVE = 'portal.tiempos.prueba';
let limpiezas = [];

export function destroy() {
  limpiezas.forEach((f) => { try { f(); } catch {} });
  limpiezas = [];
}

export function render(cont, p, ctx) {
  destroy();
  const t = p._t;
  cont.innerHTML = `
    <div class="tiempos">
      <h1 class="vista-h1">Tiempos</h1>
      <div class="tabs-wrap"><div id="tt-tabs"></div></div>
      <div id="tt-panel" role="tabpanel" aria-labelledby="tab-progresion"></div>
    </div>`;
  const panel = cont.querySelector('#tt-panel');
  if (!t.length) {
    panel.replaceChildren(vacio({ titulo: 'Aún no hay tiempos registrados', texto: 'En cuanto compitas, aquí verás tu progresión prueba por prueba.' }));
    cont.querySelector('.tabs-wrap').hidden = true;
    return;
  }

  // ---- estado compartido
  const dispon = new Map(); // "est|dist" -> {25:n, 50:n}
  for (const pr of p._pruebas.values()) {
    const k = `${pr.est}|${pr.dist}`;
    if (!dispon.has(k)) dispon.set(k, {});
    dispon.get(k)[pr.c] = pr.marcas.length;
  }
  const total = (k) => Object.values(dispon.get(k) || {}).reduce((a, b) => a + b, 0);
  const masNadada = [...dispon.keys()].sort((a, b) => total(b) - total(a))[0];
  const guardada = guardado.leer(CLAVE);
  const estado = { est: null, dist: null, pool: null, tab: ctx.params.tab || 'progresion', poolMejores: null };
  const inicial = guardada && dispon.has(`${guardada.est}|${guardada.dist}`) ? `${guardada.est}|${guardada.dist}` : masNadada;
  [estado.est, estado.dist] = [inicial.split('|')[0], Number(inicial.split('|')[1])];
  estado.pool = guardada && guardada.pool && dispon.get(inicial)[guardada.pool] ? guardada.pool : poolPorDefecto(inicial);

  function poolPorDefecto(k) {
    const d = dispon.get(k) || {};
    return (d['25'] || 0) >= (d['50'] || 0) ? '25' : '50';
  }
  const persistir = () => guardado.poner(CLAVE, { est: estado.est, dist: estado.dist, pool: estado.pool });

  // ---- pestañas
  let vistaActiva = null;
  const tabs = pestanas(cont.querySelector('#tt-tabs'), {
    items: [{ valor: 'progresion', etiqueta: 'Progresión' }, { valor: 'mejores', etiqueta: 'Mejores marcas' }, { valor: 'linea', etiqueta: 'Línea de tiempo' }],
    valor: ['progresion', 'mejores', 'linea'].includes(estado.tab) ? estado.tab : 'progresion',
    aria: 'Secciones de tiempos',
    idPanel: 'tt-panel',
    onChange: (v) => { estado.tab = v; ctx.setParams({ tab: v === 'progresion' ? null : v }); montarTab(); },
  });
  limpiezas.push(() => tabs.destroy());
  if (!['progresion', 'mejores', 'linea'].includes(estado.tab)) estado.tab = 'progresion';

  function montarTab() {
    if (vistaActiva?.destroy) vistaActiva.destroy();
    panel.setAttribute('aria-labelledby', `tab-${estado.tab}`);
    panel.replaceChildren();
    const caja = el('<div class="tab-cuerpo"></div>');
    panel.append(caja);
    if (estado.tab === 'progresion') vistaActiva = progresion(caja);
    else if (estado.tab === 'mejores') vistaActiva = mejores(caja);
    else vistaActiva = linea(caja);
  }
  limpiezas.push(() => vistaActiva?.destroy?.());

  /* ================================================================ */
  /* PROGRESIÓN                                                       */
  /* ================================================================ */
  function progresion(caja) {
    caja.innerHTML = `
      <div class="selector">
        <div class="selector-fila" id="sel-estilo"></div>
        <div class="selector-fila selector-2">
          <div class="chips-dist" id="sel-dist"></div>
          <div class="seg-wrap"><div id="sel-pool"></div></div>
        </div>
      </div>
      <section class="card card-grafico" aria-label="Gráfico de progresión">
        <div class="graf-titulo"><h2 class="h3" id="g-titulo"></h2></div>
        <div id="g-host"></div>
      </section>
      <div id="p-stats"></div>
      <section class="card lista-card" aria-labelledby="l-titulo">
        <div class="card-cab"><h2 class="h3" id="l-titulo"></h2></div>
        <div id="p-lista"></div>
      </section>`;
    const $ = (s) => caja.querySelector(s);

    const items = (arr) => arr;
    const estilosItems = () => ESTILOS.map((e) => ({ valor: e, etiqueta: e, deshabilitado: ![...dispon.keys()].some((k) => k.startsWith(e + '|')) }));
    const distItems = () => {
      const todas = [...new Set([...dispon.keys()].map((k) => Number(k.split('|')[1])))].sort((a, b) => a - b);
      return todas.map((d) => ({ valor: String(d), etiqueta: String(d), deshabilitado: !dispon.has(`${estado.est}|${d}`) }));
    };
    const poolItems = () => {
      const d = dispon.get(`${estado.est}|${estado.dist}`) || {};
      return [
        { valor: '25', etiqueta: '25 m', deshabilitado: !d['25'] },
        { valor: '50', etiqueta: '50 m', deshabilitado: !d['50'] },
        { valor: 'ambas', etiqueta: 'Ambas', deshabilitado: !(d['25'] && d['50']) },
      ];
    };

    const gEstilo = grupoRadio($('#sel-estilo'), {
      items: estilosItems(), valor: estado.est, aria: 'Estilo', onChange: (v) => {
        estado.est = v;
        if (!dispon.has(`${v}|${estado.dist}`)) {
          const ds = [...dispon.keys()].filter((k) => k.startsWith(v + '|')).sort((a, b) => total(b) - total(a));
          estado.dist = Number(ds[0].split('|')[1]);
        }
        ajustarPool(); actualizar(true);
      },
    });
    const gDist = grupoRadio($('#sel-dist'), {
      items: distItems(), valor: String(estado.dist), aria: 'Distancia en metros', onChange: (v) => { estado.dist = Number(v); ajustarPool(); actualizar(true); },
    });
    const gPool = grupoRadio($('#sel-pool'), {
      items: poolItems(), valor: estado.pool, aria: 'Piscina', variante: 'seg', onChange: (v) => { estado.pool = v; actualizar(true); },
    });
    function ajustarPool() {
      const d = dispon.get(`${estado.est}|${estado.dist}`) || {};
      if (estado.pool === 'ambas' && !(d['25'] && d['50'])) estado.pool = poolPorDefecto(`${estado.est}|${estado.dist}`);
      else if (estado.pool !== 'ambas' && !d[estado.pool]) estado.pool = poolPorDefecto(`${estado.est}|${estado.dist}`);
    }

    let grafico = null;
    let primera = true;
    let limite = 20;
    let marcasLista = [];

    function seriesActuales() {
      const pools = estado.pool === 'ambas' ? ['25', '50'] : [estado.pool];
      return pools.map((c, i) => {
        const pr = p._pruebas.get(`${estado.est}|${estado.dist}|${c}`);
        const mejorId = pr ? `${c}-${pr.marcas.indexOf(pr.mejor)}` : null;
        return {
          pr, c,
          serie: {
            id: c, etiqueta: `${c} m`, clase: i === 0 ? 'a' : 'b',
            puntos: pr ? pr.marcas.map((m, j) => ({ id: `${c}-${j}`, x: m.ms, y: m.s, t: m.t, ev: m.ev, pu: m.pu, ed: m.ed, rp: m.esRP, exh: m.exh, c, delta: m.delta, deltaBase: 'tu mejor marca anterior' })) : [],
          },
        };
      }).filter((x) => x.pr);
    }

    function actualizar(anim) {
      persistir();
      gEstilo.setItems(estilosItems(), estado.est);
      gDist.setItems(distItems(), String(estado.dist));
      gPool.setItems(poolItems(), estado.pool);
      const ss = seriesActuales();
      const nombre = `${estado.dist} m ${estado.est.toLowerCase()}`;
      $('#g-titulo').textContent = `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} · ${estado.pool === 'ambas' ? 'piscinas de 25 y 50 m' : `piscina de ${estado.pool} m`}`;
      const pts = ss.flatMap((s) => s.serie.puntos);
      const desc = pts.length
        ? `Progresión de ${nombre} (bajar el tiempo es mejorar): de ${pts[0].t} en ${fechaMes(new Date(pts[0].x).toISOString().slice(0, 10))} a ${pts[pts.length - 1].t} en ${fechaMes(new Date(pts[pts.length - 1].x).toISOString().slice(0, 10))}. La lista de marcas debajo contiene los mismos datos`
        : `Progresión de ${nombre}`;
      const opts = { ariaLabel: desc, series: ss.map((s) => s.serie), activo: undefined, onActivo: (pt) => marcarFila(pt.id) };
      if (!grafico) grafico = crearGraficoProgresion($('#g-host'), { ...opts, activo: undefined });
      else grafico.update(opts, { anim: !primera || anim });
      primera = false;
      pintarStats(ss);
      pintarLista(ss);
    }

    function pintarStats(ss) {
      const cont2 = $('#p-stats');
      cont2.innerHTML = ss.map(({ pr, c }) => {
        const st = estadisticas(pr);
        const etiqueta = `${esc(pr.dist)}<span class="u-m">m</span> ${esc(pr.est)} · piscina ${esc(c)}<span class="u-m">m</span>`;
        const soloUna = st.veces === 1;
        const mejora = st.mejoraS > 0.004;
        return `
          <div class="prog-bloque ${ss.length > 1 ? 'prog-doble' : ''}">
            <article class="card hero-card hero-prog">
              <p class="label">Mejor marca · ${etiqueta}</p>
              <p class="hero-tiempo num" data-s="${esc(st.mejor.s)}">${esc(st.mejor.t)}</p>
              <div class="hero-linea">${st.mejor.esRP ? chipRP() : ''}${st.mejor.delta > 0 ? variacion(st.mejor.delta, { largo: true, sufijo: ' respecto a tu mejor marca anterior' }) : ''}</div>
              <p class="hero-sub">${esc(fechaCorta(st.mejor.f))} · ${esc(tituloEvento(st.mejor.ev))}</p>
            </article>
            <div class="metricas">
              <div class="metrica"><p class="label">Primera marca</p><p class="metrica-v num">${esc(st.primera.t)}</p><p class="metrica-s">${esc(fechaCorta(st.primera.f))}</p></div>
              <div class="metrica"><p class="label">Mejora total</p>${mejora
                ? `<p class="metrica-v num ok"><span aria-hidden="true">▼ −</span><span class="sr-only">Bajaste </span>${st.mejoraS.toFixed(2)}<span class="u"> s</span></p><p class="metrica-s">−${(st.mejoraPct * 100).toFixed(1).replace('.', ',')} % desde tu primera marca</p>`
                : `<p class="metrica-v num sin">–</p><p class="metrica-s">${soloUna ? 'Con tu próxima marca verás el cambio' : 'Aún sin mejora sobre tu primera marca'}</p>`}</div>
              <div class="metrica"><p class="label">Veces nadada</p><p class="metrica-v num">${st.veces}</p><p class="metrica-s">${st.veces === 1 ? 'una marca registrada' : 'marcas registradas'}</p></div>
            </div>
          </div>`;
      }).join('');
      cont2.querySelectorAll('.hero-tiempo').forEach((h, i) => { if (i === 0) animarTiempo(h, Number(h.dataset.s), 'tiempos-hero'); });
    }

    function pintarLista(ss) {
      limite = 20;
      marcasLista = ss.flatMap(({ pr, c }) => pr.marcas.map((m, j) => ({ ...m, _id: `${c}-${j}`, _c: c }))).sort((a, b) => b.ms - a.ms || b._id.localeCompare(a._id));
      $('#l-titulo').textContent = `Todas tus marcas (${marcasLista.length})`;
      dibujarFilas();
    }
    function dibujarFilas() {
      const host = $('#p-lista');
      const mostrar = marcasLista.slice(0, limite);
      const doble = estado.pool === 'ambas';
      host.innerHTML = `<ul class="lista-t">${mostrar.map((m) => `
        <li><button type="button" class="fila-t" data-id="${esc(m._id)}">
          <span class="ft-main">
            <span class="ft-ev">${esc(tituloEvento(m.ev))}</span>
            <span class="ft-sub">${esc(fechaCorta(m.f))}${m.pu ? ` · ${esc(ordinal(m.pu))} lugar` : ''}${m.ed ? ` · ${esc(m.ed)} años` : ''}${doble ? ` · ${esc(m._c)} m` : ''}${m.exh ? ' · <span class="tag">Exhibición</span>' : ''}${m.esRP ? ` ${chipRP(true)}` : m.primera ? ' <span class="tag">Primera vez</span>' : ''}</span>
          </span>
          <span class="ft-der"><span class="ft-t num ${m.esRP ? 'acento' : ''}">${esc(m.t)}</span>${m.mejorAntes == null ? '<span class="var var-igual">primera</span>' : variacion(m.delta)}</span>
        </button></li>`).join('')}</ul>
        ${marcasLista.length > limite ? `<button type="button" class="btn btn-sec ver-mas">Ver más (${marcasLista.length - limite})</button>` : ''}`;
      host.querySelector('.ver-mas')?.addEventListener('click', () => { limite += 25; dibujarFilas(); });
      const act = grafico?.activo();
      if (act) marcarFila(act.id);
    }
    function marcarFila(id) {
      caja.querySelectorAll('.fila-t.activa').forEach((n) => n.classList.remove('activa'));
      caja.querySelector(`.fila-t[data-id="${id}"]`)?.classList.add('activa');
    }
    $('#p-lista').addEventListener('click', (e) => {
      const b = e.target.closest('.fila-t');
      if (!b) return;
      grafico.setActive(b.dataset.id);
      marcarFila(b.dataset.id);
      const host = $('#g-host');
      const r = host.getBoundingClientRect();
      if (r.top < 56 || r.bottom > innerHeight) host.scrollIntoView({ block: 'center', behavior: reducirMovimiento() ? 'auto' : 'smooth' });
    });

    actualizar(false);
    return { destroy() { grafico?.destroy(); } };
  }

  /* ================================================================ */
  /* MEJORES MARCAS                                                   */
  /* ================================================================ */
  function mejores(caja) {
    const n25 = (p.mejores?.['25'] || []).length, n50 = (p.mejores?.['50'] || []).length;
    if (!n25 && !n50) {
      caja.append(vacio({ titulo: 'Aún no hay mejores marcas', texto: 'Se calculan a partir de tus competencias oficiales.' }));
      return {};
    }
    if (!estado.poolMejores) estado.poolMejores = n25 >= n50 ? '25' : '50';
    caja.innerHTML = `
      <div class="mej-cab"><p class="mej-txt">Tu mejor tiempo en cada prueba. Toca una para ver su progresión.</p><div id="mej-pool"></div></div>
      <div id="mej-cuerpo"></div>`;
    const pintar = () => {
      const lista = (p.mejores?.[estado.poolMejores] || []).slice();
      const cuerpo = caja.querySelector('#mej-cuerpo');
      if (!lista.length) {
        cuerpo.replaceChildren(vacio({ titulo: `Sin marcas en piscina de ${estado.poolMejores} m`, texto: 'Prueba con la otra piscina: los tiempos de 25 y 50 m no se mezclan.', accion: { texto: `Ver piscina de ${estado.poolMejores === '25' ? 50 : 25} m`, onClick: () => { estado.poolMejores = estado.poolMejores === '25' ? '50' : '25'; gp.set(estado.poolMejores); pintar(); } } }));
        return;
      }
      cuerpo.innerHTML = ESTILOS.map((est) => {
        const g = lista.filter((m) => m.est === est).sort((a, b) => a.dist - b.dist);
        if (!g.length) return '';
        return `<section class="mej-grupo" aria-label="${esc(est)}"><h2 class="h3 mej-est">${esc(est)}</h2><div class="mej-rejilla">${g.map((m) => `
          <button type="button" class="mej-card" data-est="${esc(m.est)}" data-dist="${esc(m.dist)}">
            <span class="label">${esc(m.dist)}<span class="u-m">m</span></span>
            <span class="mej-t num">${esc(m.t)}</span>
            <span class="mej-f">${esc(fechaCorta(m.f))}${m.ed ? ` · ${esc(m.ed)} años` : ''}</span>
            <span class="mej-ev">${esc(tituloEvento(m.ev))}</span>
          </button>`).join('')}</div></section>`;
      }).join('');
    };
    const gp = grupoRadio(caja.querySelector('#mej-pool'), {
      items: [{ valor: '25', etiqueta: '25 m', deshabilitado: !n25 }, { valor: '50', etiqueta: '50 m', deshabilitado: !n50 }],
      valor: estado.poolMejores, aria: 'Piscina', variante: 'seg', onChange: (v) => { estado.poolMejores = v; pintar(); },
    });
    pintar();
    caja.addEventListener('click', (e) => {
      const b = e.target.closest('.mej-card');
      if (!b) return;
      estado.est = b.dataset.est; estado.dist = Number(b.dataset.dist); estado.pool = estado.poolMejores;
      persistir();
      estado.tab = 'progresion';
      tabs.set('progresion');
      ctx.setParams({ tab: null });
      montarTab();
      window.scrollTo({ top: 0 });
    });
    return {};
  }

  /* ================================================================ */
  /* LÍNEA DE TIEMPO                                                  */
  /* ================================================================ */
  function linea(caja) {
    const comps = p._comps;
    const aa = (p.aguasAbiertas || []).slice().sort((a, b) => (b.f || b.fa || '').localeCompare(a.f || a.fa || ''));
    const primeraM = t[0], ultimaM = t[t.length - 1];
    const f = { est: 'todos', soloRP: false, orden: 'desc' };
    const estilosCon = ESTILOS.filter((e) => t.some((m) => m.est === e));

    caja.innerHTML = `
      <header class="tl-resumen">
        <p class="tl-frase"><b class="num">${t.length}</b> ${plural(t.length, 'marca', 'marcas')} en <b class="num">${comps.length}</b> ${plural(comps.length, 'competencia', 'competencias')} desde el ${esc(fechaCorta(primeraM.f))}</p>
        <p class="tl-sub">Tu primera marca fue ${esc(primeraM.p.toLowerCase())} · ${esc(primeraM.t)}. La más reciente, el ${esc(fechaCorta(ultimaM.f))}.</p>
      </header>
      <div class="tl-filtros">
        <div class="selector-fila" id="tl-est"></div>
        <div class="tl-ctl">
          <button type="button" class="chip chip-toggle" id="tl-rp" aria-pressed="false">${icono('medalla', 18)}Solo récords</button>
          <button type="button" class="chip chip-toggle" id="tl-ord" aria-label="Orden: más reciente primero">${icono('chev-abajo', 18)}<span>Más reciente primero</span></button>
        </div>
      </div>
      <div id="tl-cuerpo" aria-live="polite"></div>`;
    const cuerpo = caja.querySelector('#tl-cuerpo');

    const opcionesEst = [{ valor: 'todos', etiqueta: 'Todo' }, ...estilosCon.map((e) => ({ valor: e, etiqueta: e }))];
    if (aa.length) opcionesEst.push({ valor: 'aa', etiqueta: 'Aguas abiertas' });
    const gE = grupoRadio(caja.querySelector('#tl-est'), { items: opcionesEst, valor: 'todos', aria: 'Filtrar por estilo', onChange: (v) => { f.est = v; reiniciar(); } });
    const bRP = caja.querySelector('#tl-rp'), bOrd = caja.querySelector('#tl-ord');
    bRP.addEventListener('click', () => { f.soloRP = !f.soloRP; bRP.setAttribute('aria-pressed', f.soloRP); reiniciar(); });
    bOrd.addEventListener('click', () => {
      f.orden = f.orden === 'desc' ? 'asc' : 'desc';
      bOrd.querySelector('span').textContent = f.orden === 'desc' ? 'Más reciente primero' : 'Más antigua primero';
      bOrd.setAttribute('aria-label', `Orden: ${f.orden === 'desc' ? 'más reciente' : 'más antigua'} primero`);
      bOrd.classList.toggle('inv', f.orden === 'asc');
      reiniciar();
    });

    let grupos = [], cursor = 0, anioActual = null, seccionAnio = null, btnMas = null;
    const LOTE = 12;

    function filtrar() {
      let gs = comps.map((g) => {
        const items = g.items.filter((m) => (f.est === 'todos' || m.est === f.est) && (!f.soloRP || m.esRP));
        return items.length ? { ...g, items } : null;
      }).filter(Boolean);
      gs.sort((a, b) => (f.orden === 'desc' ? b.msIni - a.msIni : a.msIni - b.msIni));
      return gs;
    }

    function reiniciar() {
      cuerpo.replaceChildren();
      anioActual = null; seccionAnio = null; cursor = 0;
      if (f.est === 'aa') { grupos = []; pintarAA(); return; }
      grupos = filtrar();
      if (!grupos.length) {
        cuerpo.append(vacio({ titulo: f.soloRP ? 'Aún no hay récords con este filtro' : 'Sin marcas con este filtro', texto: 'Cambia el estilo o quita el filtro de récords para ver más.', accion: { texto: 'Quitar filtros', onClick: () => { f.est = 'todos'; f.soloRP = false; bRP.setAttribute('aria-pressed', 'false'); gE.set('todos'); reiniciar(); } } }));
      } else {
        const filas = grupos.reduce((n, g) => n + g.items.length, 0);
        cuerpo.append(el(`<p class="tl-cuenta">${filas} ${plural(filas, 'marca', 'marcas')} en ${grupos.length} ${plural(grupos.length, 'competencia', 'competencias')}</p>`));
        lote();
      }
      if (f.est === 'todos' && !f.soloRP && aa.length) cuerpo.append(seccionAA());
    }

    function lote() {
      btnMas?.remove();
      const hasta = Math.min(grupos.length, cursor + LOTE);
      for (; cursor < hasta; cursor++) {
        const g = grupos[cursor];
        const anio = g.ini.slice(0, 4);
        if (anio !== anioActual) {
          anioActual = anio;
          seccionAnio = el(`<section class="tl-anio" aria-label="${esc(anio)}"><h2 class="tl-anio-h">${esc(anio)}</h2><div class="tl-items"></div></section>`);
          const antes = cuerpo.querySelector('.tl-aa');
          if (antes) cuerpo.insertBefore(seccionAnio, antes); else cuerpo.append(seccionAnio);
        }
        seccionAnio.querySelector('.tl-items').append(bloqueComp(g));
      }
      if (cursor < grupos.length) {
        btnMas = el(`<button type="button" class="btn btn-sec ver-mas">Ver más competencias (${grupos.length - cursor})</button>`);
        btnMas.addEventListener('click', lote);
        const antes = cuerpo.querySelector('.tl-aa');
        if (antes) cuerpo.insertBefore(btnMas, antes); else cuerpo.append(btnMas);
      }
    }

    function bloqueComp(g) {
      const piscina = [...g.pools].sort().join(' y ');
      const items = g.items.slice().sort((a, b) => a.ms - b.ms || a._i - b._i);
      return el(`
        <article class="tl-item ${g.rp ? 'tl-rp' : ''}">
          <span class="tl-nodo" aria-hidden="true"></span>
          <p class="label tl-fecha">${esc(rangoFechas(g.ini, g.fin))}</p>
          <h3 class="tl-nombre">${esc(g.nombre)}</h3>
          <p class="tl-lugar">Piscina de ${esc(piscina)} m${g.rp ? ` · ${esc(g.rp)} ${plural(g.rp, 'récord personal', 'récords personales')}` : ''}</p>
          <ul class="tl-pruebas">${items.map((m) => `
            <li class="tl-prueba">
              <div class="tp-main"><p class="tp-n">${esc(m.p)}${g.items.some((x) => x.c !== m.c) ? ` <span class="tp-c">${esc(m.c)} m</span>` : ''}</p>
                <p class="tp-s">${m.pu ? `${esc(ordinal(m.pu))} lugar` : 'Sin puesto'}${m.ed ? ` · ${esc(m.ed)} años` : ''}${m.exh ? ' · <span class="tag">Exhibición</span>' : ''}</p></div>
              <div class="tp-der">${m.esRP ? chipRP(true) : m.primera ? '<span class="tag">Primera vez</span>' : ''}<span class="col-tv"><span class="tp-t num ${m.esRP ? 'acento' : ''}">${esc(m.t)}</span>${m.esRP && m.delta > 0 ? variacion(m.delta) : ''}</span></div>
            </li>`).join('')}</ul>
        </article>`);
    }

    function seccionAA() {
      const s = el(`<section class="tl-aa" aria-labelledby="aa-h"><h2 class="tl-anio-h tl-aa-h" id="aa-h">Aguas abiertas</h2><div class="tl-items"></div></section>`);
      const items = s.querySelector('.tl-items');
      aa.forEach((a) => {
        const fecha = a.f ? fechaCorta(a.f) : a.fa ? `${fechaMes(a.fa)} (fecha aproximada)` : 'Sin fecha';
        items.append(el(`
          <article class="tl-item tl-item-aa">
            <span class="tl-nodo" aria-hidden="true"></span>
            <p class="label tl-fecha">${esc(fecha)}</p>
            <h3 class="tl-nombre">${esc(tituloEvento(a.ev))}</h3>
            <ul class="tl-pruebas"><li class="tl-prueba"><div class="tp-main"><p class="tp-n">${esc(a.p)}</p><p class="tp-s">${a.pu ? `${esc(ordinal(a.pu))} lugar` : 'Sin puesto'}</p></div><div class="tp-der"><span class="tp-t num">${esc(a.t)}</span></div></li></ul>
          </article>`));
      });
      return s;
    }
    function pintarAA() {
      if (!aa.length) { cuerpo.append(vacio({ titulo: 'Sin aguas abiertas', texto: 'Tus travesías aparecerán aquí.' })); return; }
      cuerpo.append(seccionAA());
    }

    reiniciar();
    return {};
  }

  montarTab();
}
