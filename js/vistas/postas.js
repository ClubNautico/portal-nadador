// Armador de postas (SOLO administradores): 4 nadadores, tiempo total = suma simple de sus mejores marcas.
import { icono } from '../iconos.js';
import { el, vacio, errorCaja, avatar, guardado, grupoRadio, aviso } from '../ui.js';
import { esc, iniciales, normalizar, fmtTiempo, variacionTiempo, plural } from '../formato.js';
import { cargarTodos, mejorMarca, MODOS, ESTILOS_POSTA, navAdminHtml, textoDif, CATS, catEtiqueta, enCategoria, textoCategoria } from '../marcas.js';

const PREFS = 'portal.postas.prefs';
const VARS = 'portal.postas.variantes';
const MAX_VAR = 3;
const LETRAS = ['A', 'B', 'C'];
const DISTS = { libre: [50, 100, 200], combinado: [50, 100] };
const RAMAS = { F: 'Mujeres', M: 'Hombres', X: 'Mixta' };
const SEXO_TXT = { F: 'Mujer', M: 'Hombre' };
const redondear = (x) => Math.round(x * 100) / 100;

let limpiar = null;

export async function render(cont, _perfil, ctx) {
  if (!ctx.esAdmin) throw new Error('Pantalla solo para administradores');
  cont.innerHTML = `<div class="herr"><h1 class="vista-h1">Armar postas</h1>${navAdminHtml('postas', icono, esc)}
    <div class="herr-carga card" role="status"><p class="herr-carga-t" id="po-prog">Abriendo los datos de los nadadores…</p><div class="herr-barra"><span id="po-barra"></span></div></div></div>`;
  const prog = cont.querySelector('#po-prog'), barra = cont.querySelector('#po-barra');
  let lista;
  try {
    lista = await cargarTodos(ctx.sesion, (h, t) => {
      if (!prog.isConnected) return;
      prog.textContent = `Abriendo los datos de los nadadores… ${h} de ${t}`;
      barra.style.transform = `scaleX(${t ? h / t : 1})`;
    });
  } catch (e) {
    console.error(e);
    cont.querySelector('.herr-carga')?.remove();
    cont.querySelector('.herr').append(errorCaja('No pudimos abrir los datos de los nadadores. Revisa tu conexión e intenta de nuevo.', () => ctx.navegar('#/postas')));
    return;
  }
  if (!cont.isConnected) return;
  if (!lista.length) {
    cont.innerHTML = `<div class="herr"><h1 class="vista-h1">Armar postas</h1>${navAdminHtml('postas', icono, esc)}</div>`;
    cont.firstChild.append(vacio({ titulo: 'No hay nadadores para armar postas', texto: 'Los datos todavía no se cargaron.' }));
    return;
  }
  const porId = new Map(lista.map((n) => [n.id, n]));
  const grupos = [...new Set(lista.map((n) => n.grupo))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const hayRamaX = lista.some((n) => n.sexo);

  const pref = guardado.leer(PREFS, {}) || {};
  const S = {
    rama: ['F', 'M', 'X'].includes(pref.rama) ? pref.rama : 'F',
    tipo: pref.tipo === 'combinado' ? 'combinado' : 'libre',
    dist: Number(pref.dist) || 100,
    pool: pref.pool === '50' ? '50' : '25',
    modo: pref.modo === 'anio' ? 'anio' : 'historica',
    cat: CATS.some((c) => c.valor === pref.cat) ? pref.cat : 'todas',
    chicos: pref.chicos === true,
    slots: Array.isArray(pref.slots) && pref.slots.length === 4 ? pref.slots.map((id) => (porId.has(id) ? id : null)) : [null, null, null, null],
  };
  if (!DISTS[S.tipo].includes(S.dist)) S.dist = 100;
  let variantes = cargarVariantes();
  const guardarPref = () => guardado.poner(PREFS, { rama: S.rama, tipo: S.tipo, dist: S.dist, pool: S.pool, modo: S.modo, cat: S.cat, chicos: S.chicos, slots: S.slots });

  /* ---------- cálculo ---------- */
  const estLeg = (i) => (S.tipo === 'combinado' ? ESTILOS_POSTA[i] : 'Libre');
  const textoLeg = (i, cfg = S) => `${cfg.dist} m ${(cfg.tipo === 'combinado' ? ESTILOS_POSTA[i] : 'Libre').toLowerCase()}`;
  const marcaDe = (id, i, cfg = S) => {
    const n = porId.get(id);
    return n ? mejorMarca(n.perfil, cfg.tipo === 'combinado' ? ESTILOS_POSTA[i] : 'Libre', cfg.dist, cfg.pool, cfg.modo) : null;
  };
  const ramaOk = (sexo, rama = S.rama) => rama === 'X' || (rama === 'F' ? sexo !== 'M' : sexo !== 'F');
  const firma = (c) => `${c.rama}|${c.tipo}|${c.dist}|${c.pool}|${c.modo}|${c.cat || 'todas'}`;

  function resumenEquipo(slots, cfg) {
    const filas = slots.map((id, i) => {
      const n = id ? porId.get(id) : null;
      const m = n ? marcaDe(id, i, cfg) : null;
      return { i, id, n, m };
    });
    const conTiempo = filas.filter((f) => f.m);
    const completo = conTiempo.length === 4;
    const suma = redondear(conTiempo.reduce((a, f) => a + f.m.s, 0));
    return { filas, completo, suma, conTiempo: conTiempo.length };
  }

  /** Avisos de la rama: lista de { tipo: 'mal'|'info', texto }. */
  function avisosRama(slots, rama) {
    const res = [];
    const elegidos = slots.map((id) => porId.get(id)).filter(Boolean);
    const sinDato = elegidos.filter((n) => !n.sexo);
    if (rama === 'F' || rama === 'M') {
      const ajenos = elegidos.filter((n) => n.sexo && !ramaOk(n.sexo, rama));
      for (const n of ajenos) res.push({ tipo: 'mal', texto: `${n.nombre} es ${n.sexo === 'M' ? 'hombre' : 'mujer'}: no corresponde en una posta de ${rama === 'F' ? 'mujeres' : 'hombres'}.` });
    } else {
      const nF = elegidos.filter((n) => n.sexo === 'F').length, nM = elegidos.filter((n) => n.sexo === 'M').length;
      if (nF > 2 || nM > 2) res.push({ tipo: 'mal', texto: `Una posta mixta debe tener 2 mujeres y 2 hombres. Ahora hay ${nF} ${plural(nF, 'mujer', 'mujeres')} y ${nM} ${plural(nM, 'hombre', 'hombres')}.` });
    }
    if (sinDato.length) {
      res.push({ tipo: 'info', texto: `Falta anotar si ${sinDato.map((n) => n.nombre).join(', ')} ${plural(sinDato.length, 'es mujer u hombre', 'son mujeres u hombres')}; por eso no se pudo comprobar la rama ${RAMAS[rama].toLowerCase()}.` });
    }
    return res;
  }

  /** Avisos de la categoría de edad (no bloquean). */
  function avisosCat(slots, cat, chicos) {
    const res = [];
    if (!cat || cat === 'todas') return res;
    const elegidos = slots.map((id) => porId.get(id)).filter(Boolean);
    const nombreCat = catEtiqueta(cat);
    for (const n of elegidos) {
      if (enCategoria(n, cat, chicos)) continue;
      if (!n.cat && n.edad1 == null && !n.menor) res.push({ tipo: 'info', texto: `No hay fecha de nacimiento ni categoría de ${n.nombre}; no se pudo comprobar la categoría ${nombreCat}.` });
      else if (!n.cat) res.push({ tipo: 'mal', texto: `${n.nombre} es menor de 9 años${n.edad1 != null ? ` (${n.edad1} al 1 de enero)` : ''}: no corresponde en la categoría ${nombreCat}.` });
      else res.push({ tipo: 'mal', texto: `${n.nombre} es de la categoría ${catEtiqueta(n.cat)}${n.edad1 != null ? ` (${n.edad1} años al 1 de enero)` : ''}: no corresponde en la categoría ${nombreCat}${chicos ? ' (ni como nadador más chico)' : ''}.` });
    }
    return res;
  }
  const avisosTodos = (slots, cfg) => [...avisosRama(slots, cfg.rama), ...avisosCat(slots, cfg.cat, cfg.chicos)];

  /* ---------- pantalla ---------- */
  cont.innerHTML = `
    <div class="herr">
      <h1 class="vista-h1">Armar postas</h1>
      ${navAdminHtml('postas', icono, esc)}
      <p class="herr-sub">Elige 4 nadadores para cada posta y mira el tiempo total, que es la suma simple de sus mejores marcas (sin descuento por salida lanzada). Toca un casillero para cambiar al nadador.</p>

      <section class="card herr-bloque" aria-labelledby="po-t1">
        <h3 class="herr-paso" id="po-t1"><span class="herr-num">1</span>Tipo de posta</h3>
        <div class="herr-ctl herr-tres">
          <div><span class="label">Rama</span><div class="seg-wrap"><div id="po-rama"></div></div></div>
          <div><span class="label">Estilo</span><div class="seg-wrap"><div id="po-tipo"></div></div></div>
          <div><span class="label">Distancia de cada nadador</span><div class="seg-wrap"><div id="po-dist"></div></div></div>
          <div><span class="label">Piscina</span><div class="seg-wrap"><div id="po-pool"></div></div></div>
          <div><span class="label">Qué marca usar</span><div class="seg-wrap"><div id="po-modo"></div></div></div>
          <div class="herr-ancho"><span class="label">Categoría de edad (edad al 1 de enero de ${new Date().getFullYear()})</span><div class="herr-fila-chips" id="po-cat"></div>
            <label class="herr-casilla"><input type="checkbox" id="po-chicos"><span>Incluir nadadores más chicos <span class="herr-ayuda">(pueden nadar hacia arriba)</span></span></label></div>
        </div>
        ${hayRamaX ? '' : '<p class="herr-aviso">Todavía no está anotado si cada nadador es mujer u hombre. Puedes armar postas igual, pero no se podrá comprobar la rama ni sugerir una posta mixta.</p>'}
      </section>

      <section class="card herr-bloque" aria-labelledby="po-t2">
        <h3 class="herr-paso" id="po-t2"><span class="herr-num">2</span>Equipo</h3>
        <ol class="po-slots" id="po-slots"></ol>
        <div class="po-total" id="po-total" aria-live="polite"></div>
        <div id="po-avisos"></div>
        <div class="po-acciones">
          <button type="button" class="btn btn-primario" id="po-sugerir">${icono('medalla', 20)}Sugerir la más rápida</button>
          <button type="button" class="btn btn-sec" id="po-guardar">${icono('check', 20)}Guardar esta variante</button>
          <button type="button" class="btn btn-sec" id="po-vaciar">Vaciar</button>
        </div>
        <p class="herr-ayuda" id="po-msg" role="status" aria-live="polite"></p>
      </section>

      <section class="card herr-bloque" aria-labelledby="po-t3" id="po-vars"></section>
    </div>`;
  const $ = (s) => cont.querySelector(s);
  const hSlots = $('#po-slots'), hTotal = $('#po-total'), hAvisos = $('#po-avisos'), hVars = $('#po-vars');
  const RC = {};   // los grupos de opciones, para poder ponerles el valor cuando se carga una variante
  const itemsDist = () => DISTS[S.tipo].map((d) => ({ valor: String(d), etiqueta: `4 × ${d} m` }));
  const cambio = (fn) => (v) => { fn(v); guardarPref(); decir(''); pintar(); };
  RC.rama = grupoRadio($('#po-rama'), { variante: 'seg', items: Object.entries(RAMAS).map(([v, t]) => ({ valor: v, etiqueta: t })), valor: S.rama, aria: 'Rama', onChange: cambio((v) => { S.rama = v; }) });
  RC.tipo = grupoRadio($('#po-tipo'), { variante: 'seg', items: [{ valor: 'libre', etiqueta: 'Libre' }, { valor: 'combinado', etiqueta: 'Combinado' }], valor: S.tipo, aria: 'Estilo de la posta',
    onChange: cambio((v) => { S.tipo = v; if (!DISTS[v].includes(S.dist)) S.dist = 100; RC.dist.setItems(itemsDist(), String(S.dist)); }) });
  RC.dist = grupoRadio($('#po-dist'), { variante: 'seg', items: itemsDist(), valor: String(S.dist), aria: 'Distancia', onChange: cambio((v) => { S.dist = Number(v); }) });
  RC.pool = grupoRadio($('#po-pool'), { variante: 'seg', items: [{ valor: '25', etiqueta: '25 m' }, { valor: '50', etiqueta: '50 m' }], valor: S.pool, aria: 'Piscina', onChange: cambio((v) => { S.pool = v; }) });
  RC.modo = grupoRadio($('#po-modo'), { variante: 'seg', items: MODOS, valor: S.modo, aria: 'Qué marca usar', onChange: cambio((v) => { S.modo = v; }) });
  RC.cat = grupoRadio($('#po-cat'), { items: CATS, valor: S.cat, aria: 'Categoría de edad', onChange: cambio((v) => { S.cat = v; }) });
  const chkChicos = $('#po-chicos');
  chkChicos.checked = S.chicos;
  chkChicos.addEventListener('change', () => { S.chicos = chkChicos.checked; guardarPref(); decir(''); pintar(); });
  function sincronizarControles() {
    RC.cat.set(S.cat); chkChicos.checked = S.chicos;
    RC.rama.set(S.rama); RC.tipo.set(S.tipo); RC.dist.setItems(itemsDist(), String(S.dist)); RC.pool.set(S.pool); RC.modo.set(S.modo);
  }

  function decir(t) { $('#po-msg').textContent = t; }

  function pintar() {
    const R = resumenEquipo(S.slots, S);
    const nomPosta = `4 × ${S.dist} m ${S.tipo}`;
    hSlots.innerHTML = R.filas.map((f) => {
      const etq = S.tipo === 'combinado' ? `Posta ${f.i + 1} · ${ESTILOS_POSTA[f.i]}` : `Posta ${f.i + 1}`;
      const sub = f.n ? `${f.n.sexo ? SEXO_TXT[f.n.sexo] + ' · ' : ''}${f.n.grupo} · ${textoCategoria(f.n)}` : '';
      const tiempo = !f.n ? '' : f.m ? `<span class="po-slot-t">${fmtTiempo(f.m.s)}</span>` : '<span class="po-slot-t po-sin">Sin marca</span>';
      return `<li class="po-li"><button type="button" class="po-slot ${f.n ? '' : 'po-vacio'}" data-i="${f.i}" aria-haspopup="dialog" aria-label="${esc(etq)}: ${f.n ? esc(f.n.nombre) + (f.m ? ', ' + fmtTiempo(f.m.s) : ', sin marca') + '. Toca para cambiar' : 'sin nadador. Toca para elegir'}">
        <span class="po-slot-n" aria-hidden="true">${f.i + 1}</span>
        <span class="po-slot-txt"><span class="label po-slot-et">${esc(etq)}</span>
          <span class="po-slot-nom">${f.n ? esc(f.n.nombre) : 'Elegir nadador'}</span>
          ${sub ? `<span class="po-slot-sub">${esc(sub)}</span>` : ''}</span>
        ${tiempo}${icono('chev-der', 18, 'acceso-flecha')}</button>
        ${f.n ? `<button type="button" class="icon-btn po-quitar" data-quitar="${f.i}" aria-label="Quitar a ${esc(f.n.nombre)} de la posta ${f.i + 1}">${icono('cerrar', 18)}</button>` : ''}</li>`;
    }).join('');

    // total
    const iguales = variantes.filter((v) => firma(v) === firma(S));
    const mismaEq = iguales.find((v) => v.slots.join() === S.slots.join());
    const comp = iguales.filter((v) => v !== mismaEq).map((v) => ({ v, suma: resumenEquipo(v.slots, v) })).filter((x) => x.suma.completo);
    const mejorV = comp.sort((x, y) => x.suma.suma - y.suma.suma)[0];
    if (R.completo) {
      let frente = '';
      if (mejorV) {
        const d = R.suma - mejorV.suma.suma;
        frente = Math.abs(d) < 0.005 ? `Igual que la variante ${mejorV.v.letra}.` : d < 0 ? `Es ${textoDif(-d, fmtTiempo).replace('+', '')} más rápida que la mejor variante guardada de esta misma prueba (${mejorV.v.letra}).` : `Es ${textoDif(d, fmtTiempo).replace('+', '')} más lenta que la mejor variante guardada de esta misma prueba (${mejorV.v.letra}).`;
      } else if (mismaEq) frente = `Es la misma combinación de la variante ${mismaEq.letra}.`;
      else if (variantes.length) frente = 'No se compara con las variantes guardadas porque son de otra rama o prueba.';
      hTotal.innerHTML = `<p class="label">Tiempo total · ${esc(nomPosta)}</p><p class="po-total-n">${fmtTiempo(R.suma)}</p>${frente ? `<p class="po-total-s">${esc(frente)}</p>` : ''}`;
    } else {
      const faltan = R.filas.filter((f) => !f.n);
      const sinM = R.filas.filter((f) => f.n && !f.m);
      const partes = [];
      if (faltan.length) partes.push(`falta elegir ${faltan.length} ${plural(faltan.length, 'nadador', 'nadadores')}`);
      if (sinM.length) partes.push(`${sinM.map((f) => `${f.n.nombre} (posta ${f.i + 1}, ${textoLeg(f.i)})`).join(', ')} ${plural(sinM.length, 'no tiene', 'no tienen')} marca en esta prueba`);
      hTotal.innerHTML = `<p class="label">Tiempo total · ${esc(nomPosta)}</p><p class="po-total-n po-total-inc"><span class="po-guion">—</span></p>
        <p class="po-total-s"><b>Total incompleto:</b> ${esc(partes.join('; ') || 'elige a los 4 nadadores')}.${R.conTiempo ? ` Suma de los que sí tienen marca: <b>${fmtTiempo(R.suma)}</b> (no es el tiempo de la posta).` : ''}</p>`;
    }
    // avisos de rama
    const av = avisosTodos(S.slots, S);
    hAvisos.innerHTML = av.length ? `<ul class="po-avisos">${av.map((a) => `<li class="${a.tipo === 'mal' ? 'herr-aviso' : 'herr-nota'}">${a.tipo === 'mal' ? icono('alerta', 18) : ''}<span>${esc(a.texto)}</span></li>`).join('')}</ul>` : '';

    const yaEsta = variantes.some((v) => firma(v) === firma(S) && v.slots.join() === S.slots.join());
    const g = $('#po-guardar');
    g.disabled = !S.slots.some(Boolean);
    g.setAttribute('aria-disabled', g.disabled);
    g.title = yaEsta ? 'Esta combinación ya está guardada' : '';
    $('#po-vaciar').disabled = !S.slots.some(Boolean);
    guardarPref();
    pintarVariantes();
  }

  hSlots.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quitar]');
    if (q) { S.slots[Number(q.dataset.quitar)] = null; decir(''); pintar(); hSlots.querySelector(`.po-slot[data-i="${q.dataset.quitar}"]`)?.focus(); return; }
    const b = e.target.closest('.po-slot'); if (b) abrirSelector(Number(b.dataset.i), b);
  });
  $('#po-vaciar').addEventListener('click', () => { S.slots = [null, null, null, null]; decir('Equipo vaciado.'); pintar(); });

  /* ---------- variantes ---------- */
  function cargarVariantes() {
    const v = guardado.leer(VARS, []);
    return Array.isArray(v) ? v.filter((x) => x && Array.isArray(x.slots) && x.slots.length === 4 && DISTS[x.tipo]).slice(0, MAX_VAR)
      .map((x) => ({ ...x, cat: CATS.some((c) => c.valor === x.cat) ? x.cat : 'todas', chicos: x.chicos === true })) : [];
  }
  function guardarVariantes() { guardado.poner(VARS, variantes); }
  $('#po-guardar').addEventListener('click', () => {
    if (!S.slots.some(Boolean)) return;
    if (variantes.some((v) => firma(v) === firma(S) && v.slots.join() === S.slots.join())) { decir('Esa combinación ya está guardada.'); return; }
    if (variantes.length >= MAX_VAR) { decir(`Ya tienes ${MAX_VAR} variantes guardadas. Quita una para guardar otra.`); aviso(`Ya tienes ${MAX_VAR} variantes guardadas. Quita una para guardar otra.`); return; }
    const letra = LETRAS.find((l) => !variantes.some((v) => v.letra === l));
    variantes.push({ letra, rama: S.rama, tipo: S.tipo, dist: S.dist, pool: S.pool, modo: S.modo, cat: S.cat, chicos: S.chicos, slots: S.slots.slice() });
    variantes.sort((a, b) => a.letra.localeCompare(b.letra));
    guardarVariantes();
    decir(`Variante ${letra} guardada.`);
    pintar();
  });

  function pintarVariantes() {
    const cab = `<h3 class="herr-paso" id="po-t3"><span class="herr-num">3</span>Variantes guardadas <span class="herr-cuenta">(${variantes.length} de ${MAX_VAR})</span></h3>`;
    if (!variantes.length) {
      hVars.innerHTML = cab + '<p class="herr-ayuda">Aquí puedes guardar hasta 3 combinaciones para verlas lado a lado y comparar sus totales. Arma un equipo arriba y toca “Guardar esta variante”.</p>';
      return;
    }
    const res = variantes.map((v) => ({ v, R: resumenEquipo(v.slots, v) }));
    const mejorPorFirma = new Map();
    for (const { v, R } of res) if (R.completo) { const k = firma(v); mejorPorFirma.set(k, Math.min(mejorPorFirma.get(k) ?? Infinity, R.suma)); }
    const tarjetas = res.map(({ v, R }) => {
      const k = firma(v);
      const mejor = mejorPorFirma.get(k);
      const comparables = res.filter((x) => firma(x.v) === k && x.R.completo).length;
      let pie;
      if (!R.completo) pie = '<span class="tag po-inc">Total incompleto</span>';
      else if (comparables < 2) pie = '<span class="po-dif-t">No hay otra variante igual para comparar</span>';
      else if (R.suma - mejor < 0.005) pie = '<span class="tag cmp-lider">La más rápida</span>';
      else pie = `<span class="cmp-dif">${textoDif(R.suma - mejor, fmtTiempo)}</span> <span class="po-dif-t">más lenta que la mejor</span>`;
      const cfgTxt = `${RAMAS[v.rama]} · 4 × ${v.dist} m ${v.tipo} · ${v.pool} m · ${v.modo === 'anio' ? 'último año' : 'mejor marca'}${v.cat && v.cat !== 'todas' ? ` · categoría ${catEtiqueta(v.cat)}${v.chicos ? ' y más chicos' : ''}` : ''}`;
      const cuerpo = R.filas.map((f) => `<li><span class="po-v-n">${f.i + 1}</span><span class="po-v-nom">${f.n ? esc(f.n.nombre) : '<span class="herr-ayuda">Sin elegir</span>'}${v.tipo === 'combinado' ? ` <span class="po-v-est">${esc(ESTILOS_POSTA[f.i])}</span>` : ''}</span><span class="po-v-t ${f.n && !f.m ? 'po-sin' : ''}">${f.n ? (f.m ? fmtTiempo(f.m.s) : 'Sin marca') : '–'}</span></li>`).join('');
      const avs = avisosTodos(v.slots, v).filter((a) => a.tipo === 'mal');
      return `<article class="po-var ${R.completo && comparables > 1 && R.suma - mejor < 0.005 ? 'po-var-mejor' : ''}" aria-label="Variante ${esc(v.letra)}">
        <header><h4 class="po-var-h">Variante ${esc(v.letra)}</h4><p class="po-var-cfg">${esc(cfgTxt)}</p></header>
        <ul class="po-var-lista">${cuerpo}</ul>
        <p class="po-var-total"><span class="label">Total</span><span class="po-var-tn">${R.completo ? fmtTiempo(R.suma) : '—'}</span></p>
        <p class="po-var-pie">${pie}</p>
        ${avs.length ? `<p class="herr-aviso po-var-av">${icono('alerta', 18)}<span>${esc(avs[0].texto)}${avs.length > 1 ? ` (y ${avs.length - 1} ${plural(avs.length - 1, 'aviso más', 'avisos más')})` : ''}</span></p>` : ''}
        <div class="po-var-botones"><button type="button" class="btn btn-sec" data-usar="${esc(v.letra)}">Usar esta</button><button type="button" class="btn btn-sec" data-borrar="${esc(v.letra)}">Quitar</button></div>
      </article>`;
    }).join('');
    hVars.innerHTML = `${cab}<div class="po-vars">${tarjetas}</div><p class="herr-nota">La diferencia solo se calcula entre variantes de la misma rama, prueba, piscina, categoría y tipo de marca. Se guardan en este navegador (solo los nadadores elegidos, no sus datos).</p>`;
  }
  hVars.addEventListener('click', (e) => {
    const u = e.target.closest('[data-usar]'), d = e.target.closest('[data-borrar]');
    if (u) {
      const v = variantes.find((x) => x.letra === u.dataset.usar); if (!v) return;
      Object.assign(S, { rama: v.rama, tipo: v.tipo, dist: v.dist, pool: v.pool, modo: v.modo, cat: v.cat || 'todas', chicos: v.chicos === true, slots: v.slots.map((id) => (porId.has(id) ? id : null)) });
      guardarPref();
      decir(`Variante ${v.letra} cargada en el equipo. Los controles de arriba se actualizaron.`);
      sincronizarControles(); pintar();
      $('#po-t2').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (d) {
      variantes = variantes.filter((x) => x.letra !== d.dataset.borrar); guardarVariantes(); decir(`Variante ${d.dataset.borrar} quitada.`); pintar();
    }
  });
  /* ---------- sugerir la más rápida ---------- */
  $('#po-sugerir').addEventListener('click', () => {
    const elegible = (n) => (S.rama === 'X' ? !!n.sexo : ramaOk(n.sexo)) && enCategoria(n, S.cat, S.chicos);
    const pool = lista.filter(elegible);
    if (S.cat !== 'todas' && !pool.length) { decir(`Nadie entra en la categoría ${catEtiqueta(S.cat)} con estos filtros. Cambia la categoría o marca “Incluir nadadores más chicos”.`); aviso('Nadie entra en esta categoría con estos filtros.'); return; }
    if (S.rama === 'X' && !pool.length) { decir('No se puede sugerir una posta mixta: todavía no está anotado si los nadadores son mujeres u hombres.'); aviso('Falta anotar si los nadadores son mujeres u hombres para sugerir una posta mixta.'); return; }
    // candidatos por tramo: los 8 más rápidos de cada sexo (con 4 casilleros, con 8 basta para hallar el óptimo exacto)
    const cand = [0, 1, 2, 3].map((i) => {
      const con = pool.map((n) => ({ id: n.id, sexo: n.sexo || 'N', t: marcaDe(n.id, i)?.s })).filter((x) => x.t != null).sort((a, b) => a.t - b.t);
      const cuenta = {};
      return con.filter((x) => (cuenta[x.sexo] = (cuenta[x.sexo] || 0) + 1) <= 8);
    });
    const SIN = 1e6;
    let mejor = { costo: Infinity, ids: null };
    const usados = new Set(), elegidos = [null, null, null, null], n = { F: 0, M: 0 };
    (function bt(i, costo) {
      if (costo >= mejor.costo) return;
      if (i === 4) { mejor = { costo, ids: elegidos.slice() }; return; }
      for (const c of cand[i]) {
        if (usados.has(c.id)) continue;
        if (S.rama === 'X' && c.sexo !== 'N' && n[c.sexo] >= 2) continue;
        usados.add(c.id); elegidos[i] = c.id; if (c.sexo !== 'N') n[c.sexo]++;
        bt(i + 1, costo + c.t);
        usados.delete(c.id); elegidos[i] = null; if (c.sexo !== 'N') n[c.sexo]--;
      }
      elegidos[i] = null;
      bt(i + 1, costo + SIN);   // dejar el casillero vacío solo si no alcanza la gente con marca
    })(0, 0);
    if (!mejor.ids || mejor.ids.every((x) => !x)) { decir('Nadie tiene marca en esta prueba con los filtros elegidos. Prueba con otra piscina, otro tipo de marca, otra distancia u otra categoría.'); aviso('Nadie tiene marca en esta prueba con estos filtros.'); return; }
    let ids = mejor.ids;
    if (S.tipo === 'libre') {
      const t = (id) => (id ? marcaDe(id, 0).s : Infinity);
      ids = ids.slice().sort((a, b) => t(a) - t(b));
    }
    S.slots = ids;
    pintar();
    const R = resumenEquipo(S.slots, S);
    const vacios = S.slots.filter((x) => !x).length;
    decir(vacios ? `Sugerencia armada, pero solo ${4 - vacios} nadadores tienen marca en esta prueba; el total queda incompleto.`
      : `Sugerencia armada con la combinación más rápida: ${fmtTiempo(R.suma)}. Puedes cambiar a cualquiera tocando su casillero.`);
    if (S.rama === 'F' || S.rama === 'M') {
      const sd = S.slots.map((id) => porId.get(id)).filter((x) => x && !x.sexo);
      if (sd.length) decir(`${$('#po-msg').textContent} Incluye a ${sd.map((x) => x.nombre).join(', ')}, de quien falta anotar si es mujer u hombre.`);
    }
  });

  /* ---------- selector de nadador (hoja inferior en celular, ventana en pantallas grandes) ---------- */
  let abierto = null;
  function cerrarSelector(devolverFoco = true) {
    if (!abierto) return;
    const { nodo, disparador, onKey } = abierto;
    abierto = null;
    document.removeEventListener('keydown', onKey, true);
    document.body.classList.remove('po-abierto');
    nodo.remove();
    if (devolverFoco && disparador?.isConnected) disparador.focus({ preventScroll: true });
  }
  function abrirSelector(i, disparador) {
    cerrarSelector(false);
    const ST = { q: '', grupo: 'todos', todas: false, todasCat: false };
    const actual = S.slots[i];
    const mActualTxt = !!(actual && marcaDe(actual, i));
    const nodo = el(`
      <div class="po-overlay">
        <div class="po-hoja" role="dialog" aria-modal="true" aria-labelledby="po-h-t" tabindex="-1">
          <header class="po-hoja-cab">
            <div><h2 class="h3" id="po-h-t">Posta ${i + 1}: ${esc(textoLeg(i))}</h2><p class="po-hoja-sub">Del más rápido al más lento · ${S.pool} m · ${S.modo === 'anio' ? 'mejor del último año' : 'mejor marca'}${actual && mActualTxt ? '. La flecha muestra cómo cambiaría el total de la posta.' : ''}</p></div>
            <button type="button" class="icon-btn" data-cerrar aria-label="Cerrar sin cambiar">${icono('cerrar', 22)}</button>
          </header>
          <div class="po-hoja-ctl">
            <label class="busca"><span class="sr-only">Buscar nadador por nombre</span>${icono('buscar', 20)}<input type="search" data-q placeholder="Buscar por nombre" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
            <div class="herr-fila-chips" data-grupos></div>
            <div class="herr-fila-chips" data-ramas></div>
          </div>
          <ul class="po-hoja-lista" data-lista></ul>
        </div>
      </div>`);
    const hoja = nodo.querySelector('.po-hoja'), hL = nodo.querySelector('[data-lista]');
    const enSlot = new Map(S.slots.map((id, k) => [id, k]).filter(([id]) => id));
    const otros = S.slots.map((id, k) => (k !== i && id ? marcaDe(id, k) : null));
    const otrosCompletos = S.slots.every((id, k) => k === i || (id && otros[k]));
    const sumaOtros = redondear(otros.reduce((a, m) => a + (m ? m.s : 0), 0));
    const mActual = actual ? marcaDe(actual, i) : null;

    function pintarChips() {
      nodo.querySelector('[data-grupos]').innerHTML = [['todos', 'Todos los grupos'], ...grupos.map((g) => [g, g])].map(([v, t]) => `<button type="button" class="chip" data-g="${esc(v)}" aria-pressed="${ST.grupo === v}">${esc(t)}</button>`).join('');
      const r = nodo.querySelector('[data-ramas]');
      r.innerHTML = (S.rama === 'X' ? '' : `<button type="button" class="chip chip-toggle" data-todas aria-pressed="${!ST.todas}">Solo ${RAMAS[S.rama].toLowerCase()}</button>`)
        + (S.cat === 'todas' ? '' : `<button type="button" class="chip chip-toggle" data-todascat aria-pressed="${!ST.todasCat}">Solo categoría ${esc(catEtiqueta(S.cat))}${S.chicos ? ' y más chicos' : ''}</button>`);
    }
    function pintarLista() {
      const nq = normalizar(ST.q);
      let f = lista.filter((n) => (ST.grupo === 'todos' || n.grupo === ST.grupo) && (!nq || normalizar(n.nombre + ' ' + (n.perfil.nombre || '')).includes(nq)) && (ST.todas || ramaOk(n.sexo)) && (ST.todasCat || enCategoria(n, S.cat, S.chicos)));
      const dato = f.map((n) => ({ n, m: marcaDe(n.id, i) }));
      dato.sort((a, b) => (!a.n.sexo - !b.n.sexo) || (a.m && b.m ? a.m.s - b.m.s : a.m ? -1 : b.m ? 1 : a.n.nombre.localeCompare(b.n.nombre, 'es')));
      let html = actual ? `<li><button type="button" class="po-fila po-fila-quitar" data-quitar>${icono('cerrar', 20)}<span>Dejar el casillero vacío</span></button></li>` : '';
      if (!dato.length) html += `<li class="herr-ayuda herr-pad">Nadie coincide. Cambia la búsqueda o el grupo${S.rama !== 'X' && !ST.todas ? ', o muestra todas las ramas' : ''}${S.cat !== 'todas' && !ST.todasCat ? ', o muestra todas las categorías' : ''}.</li>`;
      let sinMarcaPuesto = false, sinSexoPuesto = false;
      html += dato.map(({ n, m }) => {
        const usadoEn = enSlot.get(n.id);
        const bloq = usadoEn != null && usadoEn !== i;
        const esActual = n.id === actual;
        const malRama = !ramaOk(n.sexo);
        const malCat = !enCategoria(n, S.cat, S.chicos);
        let der = '';
        if (m) {
          der = `<span class="po-fila-t">${fmtTiempo(m.s)}</span>`;
          if (!esActual && mActual) der += `<span class="po-fila-d">${variacionTiempo(mActual.s - m.s)}</span>`;
          else if (!esActual && otrosCompletos) der += `<span class="po-fila-d po-fila-tot">Total ${fmtTiempo(redondear(sumaOtros + m.s))}</span>`;
        } else der = '<span class="po-fila-t po-sin">Sin marca</span>';
        let sep = '';
        if (!n.sexo && !sinSexoPuesto) { sinSexoPuesto = true; sinMarcaPuesto = false; sep += '<li class="po-sep label">Falta anotar si es mujer u hombre</li>'; }
        if (!m && !sinMarcaPuesto) { sinMarcaPuesto = true; sep += '<li class="po-sep label">Sin marca en esta prueba</li>'; }
        return `${sep}<li><button type="button" class="po-fila" data-id="${esc(n.id)}" ${esActual ? 'aria-current="true"' : ''} ${bloq ? 'aria-disabled="true"' : ''}>
          ${avatar(iniciales(n.nombre), 36)}
          <span class="po-fila-txt"><span class="po-fila-n">${esc(n.nombre)}</span>
            <span class="po-fila-s">${esc(n.grupo)} · ${esc(textoCategoria(n))} · ${n.sexo ? SEXO_TXT[n.sexo] : 'falta anotar si es mujer u hombre'}${bloq ? ` · ya está en la posta ${usadoEn + 1}` : ''}${esActual ? ' · está aquí ahora' : ''}${malRama ? ' · otra rama' : ''}${malCat ? ' · otra categoría' : ''}</span></span>
          <span class="po-fila-der">${der}</span></button></li>`;
      }).join('');
      hL.innerHTML = html;
    }
    pintarChips(); pintarLista();

    nodo.addEventListener('click', (e) => {
      if (e.target === nodo || e.target.closest('[data-cerrar]')) { cerrarSelector(); return; }
      const g = e.target.closest('[data-g]');
      if (g) { ST.grupo = g.dataset.g; pintarChips(); pintarLista(); return; }
      if (e.target.closest('[data-todas]')) { ST.todas = !ST.todas; pintarChips(); pintarLista(); return; }
      if (e.target.closest('[data-todascat]')) { ST.todasCat = !ST.todasCat; pintarChips(); pintarLista(); return; }
      if (e.target.closest('[data-quitar]')) { S.slots[i] = null; cerrarSelector(); decir(''); pintar(); return; }
      const b = e.target.closest('.po-fila[data-id]');
      if (!b) return;
      if (b.getAttribute('aria-disabled') === 'true') { aviso(`${porId.get(b.dataset.id).nombre} ya está en la posta ${enSlot.get(b.dataset.id) + 1}. Un nadador no puede repetirse.`); return; }
      S.slots[i] = b.dataset.id;
      cerrarSelector(); decir(''); pintar();
    });
    nodo.querySelector('[data-q]').addEventListener('input', (e) => { ST.q = e.target.value; pintarLista(); });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarSelector(); return; }
      if (e.key !== 'Tab') return;
      const f = [...hoja.querySelectorAll('button:not([disabled]), input')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const p = f[0], u = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === p || document.activeElement === hoja)) { e.preventDefault(); u.focus(); }
      else if (!e.shiftKey && document.activeElement === u) { e.preventDefault(); p.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.classList.add('po-abierto');
    document.body.append(nodo);
    abierto = { nodo, disparador, onKey };
    hoja.focus({ preventScroll: true });
    // lleva el nadador actual a la vista
    nodo.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  limpiar = () => cerrarSelector(false);

  pintar();
}

export function destroy() { if (limpiar) { limpiar(); limpiar = null; } }
