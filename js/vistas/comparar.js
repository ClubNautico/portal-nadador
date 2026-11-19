// Comparador de nadadores (SOLO administradores): mejor marca de 2 a 4 nadadores en una prueba.
import { icono } from '../iconos.js';
import { el, vacio, errorCaja, avatar, guardado, grupoRadio } from '../ui.js';
import { esc, iniciales, normalizar, fmtTiempo, fechaCorta, tituloEvento, ordinal } from '../formato.js';
import { cargarTodos, mejorMarca, pruebasDisponibles, inicioUltimoAnio, MODOS, navAdminHtml, textoDif } from '../marcas.js';

const MAX = 4;
const ORDEN_ESTILOS = ['Libre', 'Espalda', 'Pecho', 'Mariposa', 'Combinado'];
const CLAVE = 'portal.comparar.prefs';

export async function render(cont, _perfil, ctx) {
  if (!ctx.esAdmin) throw new Error('Pantalla solo para administradores');
  cont.innerHTML = `<div class="herr"><h1 class="vista-h1">Comparar nadadores</h1>${navAdminHtml('comparar', icono, esc)}
    <div class="herr-carga card" role="status"><p class="herr-carga-t" id="cm-prog">Abriendo los datos de los nadadores…</p><div class="herr-barra"><span id="cm-barra"></span></div></div></div>`;
  const prog = cont.querySelector('#cm-prog'), barra = cont.querySelector('#cm-barra');
  let lista;
  try {
    lista = await cargarTodos(ctx.sesion, (h, t) => {
      if (!prog.isConnected) return;
      prog.textContent = `Abriendo los datos de los nadadores… ${h} de ${t}`;
      barra.style.transform = `scaleX(${t ? h / t : 1})`;
    });
  } catch (e) {
    console.error(e);
    cont.querySelector('.herr').append(errorCaja('No pudimos abrir los datos de los nadadores. Revisa tu conexión e intenta de nuevo.', () => ctx.navegar('#/comparar')));
    cont.querySelector('.herr-carga')?.remove();
    return;
  }
  if (!cont.isConnected) return;
  if (!lista.length) {
    cont.innerHTML = `<div class="herr"><h1 class="vista-h1">Comparar nadadores</h1>${navAdminHtml('comparar', icono, esc)}</div>`;
    cont.firstChild.append(vacio({ titulo: 'No hay nadadores para comparar', texto: 'Los datos todavía no se cargaron.' }));
    return;
  }
  const porId = new Map(lista.map((n) => [n.id, n]));
  const disp = pruebasDisponibles(lista);
  const grupos = [...new Set(lista.map((n) => n.grupo))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

  const pref = guardado.leer(CLAVE, {}) || {};
  const S = {
    sel: [], grupo: 'todos', q: '',
    est: pref.est || 'Libre', dist: Number(pref.dist) || 50,
    pool: pref.pool === '50' ? '50' : '25',
    modo: pref.modo === 'anio' ? 'anio' : 'historica',
  };
  const guardarPref = () => guardado.poner(CLAVE, { est: S.est, dist: S.dist, pool: S.pool, modo: S.modo });

  function estilosDe(pool) {
    const m = disp.get(pool) || new Map();
    return ORDEN_ESTILOS.filter((e) => m.has(e));
  }
  function distsDe(pool, est) { return disp.get(pool)?.get(est) || []; }
  function ajustarPrueba() {
    const es = estilosDe(S.pool);
    if (es.length && !es.includes(S.est)) S.est = es[0];
    const ds = distsDe(S.pool, S.est);
    if (ds.length && !ds.includes(S.dist)) S.dist = ds[0];
  }
  ajustarPrueba();

  cont.innerHTML = `
    <div class="herr">
      <h1 class="vista-h1">Comparar nadadores</h1>
      ${navAdminHtml('comparar', icono, esc)}
      <p class="herr-sub">Elige de 2 a ${MAX} nadadores y una prueba. Verás la mejor marca de cada uno, de la más rápida a la más lenta.</p>

      <section class="card herr-bloque" aria-labelledby="cm-t1">
        <h3 class="herr-paso" id="cm-t1"><span class="herr-num">1</span>Elige los nadadores <span class="herr-cuenta" id="cm-cuenta"></span></h3>
        <div class="herr-elegidos" id="cm-elegidos" aria-live="polite"></div>
        <label class="busca"><span class="sr-only">Buscar nadador por nombre</span>${icono('buscar', 20)}<input type="search" id="cm-q" placeholder="Buscar por nombre" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
        <div class="herr-fila-chips" id="cm-grupos"></div>
        <ul class="cmp-lista" id="cm-lista" aria-label="Nadadores"></ul>
      </section>

      <section class="card herr-bloque" aria-labelledby="cm-t2">
        <h3 class="herr-paso" id="cm-t2"><span class="herr-num">2</span>Elige la prueba</h3>
        <div class="herr-ctl"><span class="label">Estilo</span><div class="herr-fila-chips" id="cm-est"></div></div>
        <div class="herr-ctl"><span class="label">Distancia</span><div class="herr-fila-chips" id="cm-dist"></div></div>
        <div class="herr-ctl herr-dos">
          <div><span class="label">Piscina</span><div class="seg-wrap"><div id="cm-pool"></div></div></div>
          <div><span class="label">Qué marca usar</span><div class="seg-wrap"><div id="cm-modo"></div></div></div>
        </div>
      </section>

      <section class="card herr-bloque" aria-labelledby="cm-t3" id="cm-res"></section>
    </div>`;

  const $ = (s) => cont.querySelector(s);
  const hElegidos = $('#cm-elegidos'), hLista = $('#cm-lista'), hRes = $('#cm-res');
  let rEst, rDist;

  /* ---- 1. nadadores ---- */
  function pintarElegidos() {
    $('#cm-cuenta').textContent = `(${S.sel.length} de ${MAX})`;
    hElegidos.innerHTML = S.sel.length
      ? S.sel.map((id) => `<button type="button" class="chip herr-quitar" data-quitar="${esc(id)}" aria-label="Quitar a ${esc(porId.get(id).nombre)}"><span>${esc(porId.get(id).nombre)}</span>${icono('cerrar', 16)}</button>`).join('')
      : '<p class="herr-ayuda">Todavía no elegiste a nadie. Toca un nombre de la lista.</p>';
  }
  function pintarGrupos() {
    $('#cm-grupos').innerHTML = [['todos', 'Todos los grupos'], ...grupos.map((g) => [g, g])]
      .map(([v, t]) => `<button type="button" class="chip" data-grupo="${esc(v)}" aria-pressed="${S.grupo === v}">${esc(t)}</button>`).join('');
  }
  function pintarLista() {
    const nq = normalizar(S.q);
    const f = lista.filter((n) => (S.grupo === 'todos' || n.grupo === S.grupo) && (!nq || normalizar(n.nombre + ' ' + (n.perfil.nombre || '')).includes(nq)));
    if (!f.length) { hLista.innerHTML = `<li class="herr-ayuda herr-pad">Nadie coincide${S.q ? ` con “${esc(S.q)}”` : ''}. Prueba con otro nombre o cambia el grupo.</li>`; return; }
    const lleno = S.sel.length >= MAX;
    hLista.innerHTML = f.map((n) => {
      const on = S.sel.includes(n.id);
      const bloq = lleno && !on;
      return `<li><button type="button" class="cmp-nad" data-id="${esc(n.id)}" aria-pressed="${on}" ${bloq ? 'aria-disabled="true"' : ''}>
        ${avatar(iniciales(n.nombre), 36)}
        <span class="cmp-nad-txt"><span class="cmp-nad-n">${esc(n.nombre)}</span><span class="cmp-nad-g">${esc(n.grupo)}</span></span>
        <span class="cmp-nad-marca" aria-hidden="true">${on ? icono('check', 20) : ''}</span>
        <span class="sr-only">${on ? 'Elegido' : bloq ? `Ya elegiste ${MAX}` : 'Sin elegir'}</span></button></li>`;
    }).join('');
  }
  hLista.addEventListener('click', (e) => {
    const b = e.target.closest('.cmp-nad'); if (!b) return;
    const id = b.dataset.id;
    if (S.sel.includes(id)) S.sel = S.sel.filter((x) => x !== id);
    else if (S.sel.length < MAX) S.sel.push(id);
    else { avisoMax(); return; }
    const y = hLista.scrollTop;
    pintarElegidos(); pintarLista(); hLista.scrollTop = y; pintarRes();
    hLista.querySelector(`[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  });
  function avisoMax() { $('#cm-cuenta').textContent = `(máximo ${MAX}: quita a uno para elegir otro)`; }
  hElegidos.addEventListener('click', (e) => {
    const b = e.target.closest('[data-quitar]'); if (!b) return;
    S.sel = S.sel.filter((x) => x !== b.dataset.quitar);
    pintarElegidos(); pintarLista(); pintarRes();
  });
  $('#cm-grupos').addEventListener('click', (e) => {
    const b = e.target.closest('[data-grupo]'); if (!b) return;
    S.grupo = b.dataset.grupo; pintarGrupos(); pintarLista();
  });
  $('#cm-q').addEventListener('input', (e) => { S.q = e.target.value; pintarLista(); });

  /* ---- 2. prueba ---- */
  function itemsEst() { return estilosDe(S.pool).map((e) => ({ valor: e, etiqueta: e })); }
  function itemsDist() { return distsDe(S.pool, S.est).map((d) => ({ valor: String(d), etiqueta: `${d} m` })); }
  rEst = grupoRadio($('#cm-est'), { items: itemsEst(), valor: S.est, aria: 'Estilo', onChange(v) { S.est = v; ajustarPrueba(); rDist.setItems(itemsDist(), String(S.dist)); guardarPref(); pintarRes(); } });
  rDist = grupoRadio($('#cm-dist'), { items: itemsDist(), valor: String(S.dist), aria: 'Distancia', onChange(v) { S.dist = Number(v); guardarPref(); pintarRes(); } });
  grupoRadio($('#cm-pool'), { variante: 'seg', items: [{ valor: '25', etiqueta: '25 m' }, { valor: '50', etiqueta: '50 m' }], valor: S.pool, aria: 'Piscina',
    onChange(v) { S.pool = v; ajustarPrueba(); rEst.setItems(itemsEst(), S.est); rDist.setItems(itemsDist(), String(S.dist)); guardarPref(); pintarRes(); } });
  grupoRadio($('#cm-modo'), { variante: 'seg', items: MODOS, valor: S.modo, aria: 'Qué marca usar', onChange(v) { S.modo = v; guardarPref(); pintarRes(); } });

  /* ---- 3. resultado ---- */
  function pintarRes() {
    const nombrePrueba = `${S.dist} m ${S.est.toLowerCase()}`;
    const resumen = `${nombrePrueba} · piscina de ${S.pool} m · ${S.modo === 'anio' ? `mejor del último año (desde el ${fechaCorta(new Date(inicioUltimoAnio()).toISOString().slice(0, 10))})` : 'mejor marca de siempre'}`;
    const cab = `<h3 class="herr-paso" id="cm-t3"><span class="herr-num">3</span>Resultado</h3><p class="herr-resumen">${esc(resumen)}</p>`;
    if (!S.sel.length) { hRes.innerHTML = cab; hRes.append(vacio({ titulo: 'Elige nadadores para comparar', texto: 'Toca los nombres en el paso 1. Con 2 ya se puede comparar.' })); return; }
    const filas = S.sel.map((id) => {
      const n = porId.get(id);
      return { n, m: mejorMarca(n.perfil, S.est, S.dist, S.pool, S.modo) };
    });
    filas.sort((a, b) => (a.m && b.m ? a.m.s - b.m.s : a.m ? -1 : b.m ? 1 : a.n.nombre.localeCompare(b.n.nombre, 'es')));
    const base = filas.find((f) => f.m)?.m.s;
    const conMarca = filas.filter((f) => f.m).length;
    let pos = 0;
    const trs = filas.map((f) => {
      if (!f.m) {
        return `<tr class="cmp-sin"><th scope="row"><span class="cmp-pos">–</span><span class="cmp-nom">${esc(f.n.nombre)}</span></th><td class="num cmp-c-marca"><span class="cmp-nomarca">Sin marca</span></td><td class="num cmp-c-dif" data-label="Diferencia">–</td><td class="cmp-cuando"><span class="herr-ayuda">${S.modo === 'anio' ? 'No nadó esta prueba en los últimos 12 meses.' : 'Nunca nadó esta prueba en esta piscina.'}</span></td></tr>`;
      }
      pos++;
      const dif = f.m.s - base;
      const difHtml = dif < 0.005 ? '<span class="tag cmp-lider">Más rápido</span>' : `<span class="cmp-dif">${textoDif(dif, fmtTiempo)}</span>`;
      return `<tr class="${pos === 1 ? 'cmp-primero' : ''}"><th scope="row"><span class="cmp-pos">${esc(ordinal(pos))}</span><span class="cmp-nom">${esc(f.n.nombre)}</span></th>
        <td class="num cmp-c-marca"><span class="cmp-t">${fmtTiempo(f.m.s)}</span></td><td class="num cmp-c-dif" data-label="${dif < 0.005 ? '' : 'Diferencia con el más rápido'}">${difHtml}</td>
        <td class="cmp-cuando"><span class="cmp-fecha">${esc(fechaCorta(f.m.f))}</span>${f.m.exh ? ' <span class="tag">exhibición</span>' : ''}<span class="cmp-ev">${esc(tituloEvento(f.m.ev || ''))}</span></td></tr>`;
    }).join('');
    hRes.innerHTML = `${cab}
      ${S.sel.length < 2 ? '<p class="herr-aviso">Elige al menos un nadador más para poder comparar.</p>' : ''}
      <div class="tabla-wrap"><table class="tabla cmp-tabla"><caption class="sr-only">${esc(resumen)}</caption>
        <thead><tr><th scope="col">Nadador</th><th scope="col" class="num">Marca</th><th scope="col" class="num">Diferencia con el más rápido</th><th scope="col">Cuándo y dónde</th></tr></thead>
        <tbody>${trs}</tbody></table></div>
      ${conMarca === 0 ? '<p class="herr-aviso">Ninguno de los elegidos tiene marca en esta prueba. Cambia la prueba, la piscina o “Qué marca usar”.</p>' : ''}
      <p class="herr-nota">La diferencia se mide contra el nadador más rápido de la lista. Incluye marcas de exhibición (fuera de concurso).</p>`;
  }

  pintarElegidos(); pintarGrupos(); pintarLista(); pintarRes();
  if (lista.fallos) cont.querySelector('.herr').append(el(`<p class="herr-aviso">No se pudieron abrir ${lista.fallos} ${lista.fallos === 1 ? 'nadador' : 'nadadores'}; no aparecen en la lista.</p>`));
}

export function destroy() {}
