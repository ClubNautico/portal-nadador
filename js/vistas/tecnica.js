// Técnica: evaluaciones del entrenador por estilo (Dominado / En progreso / Por mejorar).
import { icono } from '../iconos.js';
import { vacio } from '../ui.js';
import { barras, barrasApiladas } from '../graficos.js';
import { esc, fechaCorta, plural } from '../formato.js';

// Nombres en pantalla de las notas del entrenador (en los datos: Bueno / Regular / Malo).
const NOTAS = { b: 'Dominado', r: 'En progreso', m: 'Por mejorar' };
const ORDEN = ['Mariposa', 'Espalda', 'Pecho', 'Libre'];

const aPct = (v) => Math.round(v * 100);

/** Títulos de sección que vienen en MAYÚSCULAS sostenidas pasan a tipo oración. Lo demás se respeta. */
function oracion(s) {
  const t = String(s || '').replace(/\s+/g, ' ').replace(/\s+\)/g, ')').replace(/\(\s+/g, '(').trim();
  const letras = t.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  if (!letras) return t;
  const may = letras.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length;
  if (may / letras.length < 0.6) return t;
  const bajo = t.toLowerCase();
  return bajo.charAt(0).toUpperCase() + bajo.slice(1);
}

/** Cambio en puntos porcentuales. Subir es positivo; bajar se muestra neutral (sin juicio). */
function cambio(pts) {
  if (pts == null) return '';
  if (pts === 0) return '<span class="var var-igual">= igual</span>';
  return pts > 0
    ? `<span class="var var-ok">▲ +${pts} ${plural(pts, 'punto', 'puntos')}</span>`
    : `<span class="var var-neu">▼ −${Math.abs(pts)} ${plural(Math.abs(pts), 'punto', 'puntos')}</span>`;
}

const nivel = (pun) => (pun == null ? 0 : pun < 0.4 ? 1 : pun < 0.55 ? 2 : pun < 0.7 ? 3 : pun < 0.85 ? 4 : 5);
const fechaDosLineas = (f) => { const c = fechaCorta(f).split(' '); return `<span>${esc(c[0])} ${esc(c[1])}</span><span>${esc(c[2])}</span>`; };

/** Une las evaluaciones de un mismo día y estilo (quita duplicados exactos y suma las distintas). */
function unirEvaluaciones(evals) {
  const visto = new Set();
  const mapa = new Map();
  for (const e of evals || []) {
    if (!e || !e.f || !e.est) continue;
    const exacta = `${e.f}|${e.est}|${e.m}|${e.r}|${e.b}`;
    if (visto.has(exacta)) continue;
    visto.add(exacta);
    const k = `${e.f}|${e.est}`;
    const a = mapa.get(k) || { f: e.f, est: e.est, m: 0, r: 0, b: 0 };
    a.m += e.m || 0; a.r += e.r || 0; a.b += e.b || 0;
    mapa.set(k, a);
  }
  return [...mapa.values()].map((a) => {
    const total = a.m + a.r + a.b;
    return { ...a, total, pun: total ? (a.r * 0.5 + a.b) / total : null };
  }).filter((a) => a.total > 0).sort((a, b) => (a.f < b.f ? -1 : a.f > b.f ? 1 : ORDEN.indexOf(a.est) - ORDEN.indexOf(b.est)));
}

const globalDe = (lista) => {
  const total = lista.reduce((s, e) => s + e.total, 0);
  return total ? lista.reduce((s, e) => s + e.r * 0.5 + e.b, 0) / total : null;
};

export function render(cont, p) {
  const T = p.tecnica || {};
  const evals = unirEvaluaciones(T.evals);

  if (!evals.length) {
    cont.innerHTML = '<div class="tecnica"><h1 class="vista-h1">Técnica</h1><div id="te-vacio"></div></div>';
    cont.querySelector('#te-vacio').replaceWith(vacio({
      icon: 'tecnica',
      titulo: 'Aún no tienes evaluaciones de técnica',
      texto: 'Cuando tu entrenador evalúe tu técnica en mariposa, espalda, pecho y libre, verás aquí tu puntaje por estilo y en qué trabajar.',
    }));
    return;
  }

  const fechas = [...new Set(evals.map((e) => e.f))];
  const F1 = fechas[fechas.length - 1];
  const F0 = fechas.length > 1 ? fechas[fechas.length - 2] : null;
  const estilos = ORDEN.filter((s) => evals.some((e) => e.est === s)).concat([...new Set(evals.map((e) => e.est))].filter((s) => !ORDEN.includes(s)));
  const de = (est) => evals.filter((e) => e.est === est);
  const ult = (est) => de(est).at(-1);
  const ant = (est) => de(est).at(-2) || null;

  /* ---- Héroe: puntaje global ---- */
  const g1 = globalDe(evals.filter((e) => e.f === F1));
  const g0 = F0 ? globalDe(evals.filter((e) => e.f === F0)) : null;
  const nAsp = evals.filter((e) => e.f === F1).reduce((s, e) => s + e.total, 0);
  const nEst = evals.filter((e) => e.f === F1).length;
  const puntos = g0 != null ? aPct(g1) - aPct(g0) : null;
  const hero = `
    <article class="card hero-card te-hero" aria-labelledby="te-hero-l">
      <p class="label" id="te-hero-l">Tu puntaje técnico</p>
      <p class="hero-tiempo num te-hero-n">${aPct(g1)}<span class="te-hero-u">%</span></p>
      <div class="hero-linea">${puntos != null ? `${cambio(puntos)}<span class="te-vs">frente a la evaluación del ${esc(fechaCorta(F0))}</span>` : '<span class="te-vs">Es tu primera evaluación: será tu punto de partida.</span>'}</div>
      <p class="hero-sub">Evaluación del ${esc(fechaCorta(F1))} · ${nAsp} ${plural(nAsp, 'aspecto revisado', 'aspectos revisados')} en ${nEst} ${plural(nEst, 'estilo', 'estilos')}</p>
    </article>`;

  /* ---- Puntaje por estilo (barras con la evaluación anterior como marca) ---- */
  const items = estilos.map((s) => ({ etiqueta: s, valor: ult(s).pun, previo: ant(s)?.pun ?? null }));
  const hayPrev = items.some((i) => i.previo != null);
  const barrasHTML = barras(items, { max: 1, formato: (v) => `${aPct(v)} %` });

  /* ---- Barras apiladas Dominado / En progreso / Por mejorar ---- */
  const apiladas = barrasApiladas(estilos.map((s) => {
    const u = ult(s);
    return { etiqueta: s, nota: `${u.total} ${plural(u.total, 'aspecto', 'aspectos')}`, segmentos: [{ clave: 'b', etiqueta: NOTAS.b, valor: u.b }, { clave: 'r', etiqueta: NOTAS.r, valor: u.r }, { clave: 'm', etiqueta: NOTAS.m, valor: u.m }] };
  }));

  /* ---- Mapa de calor: evolución por estilo ---- */
  const celdaCalor = (pun) => (pun == null ? '<td class="te-c te-c0 num">–</td>' : `<td class="te-c te-c${nivel(pun)} num">${aPct(pun)}<span class="te-pc">%</span></td>`);
  const filasCalor = estilos.map((s) => `<tr><th scope="row">${esc(s)}</th>${fechas.map((f) => celdaCalor(evals.find((e) => e.f === f && e.est === s)?.pun ?? null)).join('')}</tr>`).join('');
  const filaGlobal = `<tr class="te-fila-g"><th scope="row">Global</th>${fechas.map((f) => celdaCalor(globalDe(evals.filter((e) => e.f === f)))).join('')}</tr>`;
  const calor = `
    <div class="tabla-wrap te-calor-wrap" tabindex="0" role="region" aria-label="Puntaje por estilo en cada evaluación">
      <table class="tabla te-calor">
        <thead><tr><th scope="col">Estilo</th>${fechas.map((f) => `<th scope="col" class="num te-th-f"><time datetime="${esc(f)}">${fechaDosLineas(f)}</time></th>`).join('')}</tr></thead>
        <tbody>${filasCalor}${filaGlobal}</tbody>
      </table>
    </div>`;

  /* ---- En qué trabajar (última evaluación de cada estilo) ---- */
  const mejorar = [];
  const vistos = new Set();
  for (const x of T.mejorar || []) {
    if (!x || !x.f || !x.est || !x.asp) continue;
    const k = `${x.f}|${x.est}|${oracion(x.sec)}|${x.asp}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    mejorar.push({ f: x.f, est: x.est, sec: oracion(x.sec) || 'Otros aspectos', asp: String(x.asp).replace(/\s+/g, ' ').trim() });
  }
  const aspKey = (x) => `${x.est}|${x.sec}|${x.asp.toLowerCase()}`;
  let superados = 0, pendientes = 0, actuales = 0, hayAnterior = false;
  const porEstilo = estilos.map((s) => {
    const u = ult(s), a = ant(s);
    const act = mejorar.filter((x) => x.est === s && x.f === u.f);
    const claves = new Set(act.map(aspKey));
    let prevClaves = new Set();
    if (a) {
      hayAnterior = true;
      const prev = mejorar.filter((x) => x.est === s && x.f === a.f);
      prevClaves = new Set(prev.map(aspKey));
      superados += prev.filter((x) => !claves.has(aspKey(x))).length;
    }
    const secciones = new Map();
    for (const x of act) {
      if (!secciones.has(x.sec)) secciones.set(x.sec, []);
      const pend = prevClaves.has(aspKey(x));
      if (pend) pendientes += 1;
      secciones.get(x.sec).push({ asp: x.asp, pend });
    }
    actuales += act.length;
    return { est: s, fecha: u.f, n: act.length, secciones: [...secciones.entries()] };
  });
  const conItems = porEstilo.filter((e) => e.n);
  const sinItems = porEstilo.filter((e) => !e.n).map((e) => e.est);

  const resumenTrabajo = [];
  if (hayAnterior && superados > 0) resumenTrabajo.push(`<p class="te-logro"><span class="te-logro-n num">${superados}</span><span>Superaste ${superados === 1 ? 'un aspecto' : `${superados} aspectos`} que tenías por mejorar en la evaluación anterior.</span></p>`);
  const detallesTrabajo = conItems.map((e, i) => `
    <details class="te-est"${i === 0 ? ' open' : ''}>
      <summary><span class="te-est-n">${esc(e.est)}</span><span class="te-est-c num">${e.n} ${plural(e.n, 'aspecto', 'aspectos')}</span>${icono('chev-abajo', 20, 'te-est-ico')}</summary>
      <div class="te-est-cuerpo">
        <p class="te-est-f">Evaluación del ${esc(fechaCorta(e.fecha))}</p>
        ${e.secciones.map(([sec, lista]) => `
          <h3 class="te-sec">${esc(sec)}</h3>
          <ul class="te-asp">${lista.map((a) => `<li><span class="te-asp-t">${esc(a.asp)}</span>${a.pend ? '<span class="tag te-pend">Sigue pendiente</span>' : ''}</li>`).join('')}</ul>`).join('')}
      </div>
    </details>`).join('');
  const bloqueTrabajo = actuales
    ? `${resumenTrabajo.join('')}${hayAnterior && pendientes ? `<p class="te-nota-p">${pendientes} ${plural(pendientes, 'aspecto sigue', 'aspectos siguen')} pendiente${pendientes === 1 ? '' : 's'} desde la evaluación anterior.</p>` : ''}<div class="te-ests">${detallesTrabajo}</div>${sinItems.length ? `<p class="te-nota-p">Sin aspectos por mejorar en ${esc(sinItems.join(', ').replace(/, ([^,]*)$/, ' y $1'))}.</p>` : ''}`
    : `${resumenTrabajo.join('')}<p class="te-nada">En tu última evaluación no quedó ningún aspecto marcado como "${esc(NOTAS.m)}". Sigue consolidando lo que ya dominas.</p>`;

  /* ---- Brazadas ---- */
  const braz = [];
  const porBraz = new Map();
  for (const b of T.brazadas || []) {
    if (!b || !b.f || !b.est || (b.sin == null && b.con == null)) continue;
    if (!porBraz.has(b.est)) porBraz.set(b.est, []);
    porBraz.get(b.est).push(b);
  }
  for (const s of ORDEN.concat([...porBraz.keys()].filter((k) => !ORDEN.includes(k)))) {
    const l = porBraz.get(s);
    if (l) { l.sort((a, b) => (a.f < b.f ? -1 : 1)); braz.push({ est: s, u: l.at(-1), a: l.at(-2) || null }); }
  }
  const dBraz = (u, a, campo) => {
    if (!a || u[campo] == null || a[campo] == null) return '';
    const d = u[campo] - a[campo];
    return d === 0 ? '' : `<span class="var var-neu te-dbraz">${d > 0 ? '▲ +' : '▼ −'}${Math.abs(d)}</span>`;
  };
  const filasBraz = braz.map(({ est, u, a }) => `
    <tr><th scope="row">${esc(est)}</th>
      <td class="num">${u.sin != null ? u.sin : '–'}${dBraz(u, a, 'sin')}</td>
      <td class="num">${u.con != null ? u.con : '–'}${dBraz(u, a, 'con')}</td>
      <td class="num te-fecha-b">${esc(fechaCorta(u.f))}</td></tr>`).join('');

  cont.innerHTML = `
    <div class="tecnica">
      <h1 class="vista-h1">Técnica</h1>

      <div class="te-top">
        ${hero}
        <section class="card" aria-labelledby="te-est-h">
          <div class="card-cab"><h2 class="h3" id="te-est-h">Puntaje por estilo</h2></div>
          ${barrasHTML}
          <p class="te-pie">${hayPrev ? 'La marca vertical fina indica tu evaluación anterior. ' : ''}El puntaje cuenta los aspectos dominados completos y los que están en progreso a la mitad.</p>
        </section>
      </div>

      <div class="te-dos">
        <section class="card" aria-labelledby="te-apil-h">
          <div class="card-cab"><h2 class="h3" id="te-apil-h">Cómo van tus aspectos</h2></div>
          ${apiladas}
          <ul class="te-ley" aria-label="Significado de los colores">
            <li><i class="te-sw te-sw-b"></i>${NOTAS.b}</li>
            <li><i class="te-sw te-sw-r"></i>${NOTAS.r}</li>
            <li><i class="te-sw te-sw-m"></i>${NOTAS.m}</li>
          </ul>
        </section>
        <section class="card" aria-labelledby="te-calor-h">
          <div class="card-cab"><h2 class="h3" id="te-calor-h">Tu evolución por estilo</h2></div>
          ${fechas.length > 1 ? calor : `${calor}<p class="te-pie">Con tu próxima evaluación verás aquí cómo cambia cada estilo.</p>`}
          <div class="te-escala" aria-hidden="true"><span>Menor</span><i class="te-c1"></i><i class="te-c2"></i><i class="te-c3"></i><i class="te-c4"></i><i class="te-c5"></i><span>Mayor</span></div>
        </section>
      </div>

      <section class="card" aria-labelledby="te-trab-h">
        <div class="card-cab"><h2 class="h3" id="te-trab-h">En qué trabajar</h2></div>
        ${bloqueTrabajo}
      </section>

      ${braz.length ? `
      <section aria-labelledby="te-braz-h" class="te-braz">
        <h2 class="h3" id="te-braz-h">Brazadas por estilo</h2>
        <div class="tabla-wrap">
          <table class="tabla te-tabla-b">
            <thead><tr><th scope="col">Estilo</th><th scope="col" class="num">Sin empuje</th><th scope="col" class="num">Con empuje</th><th scope="col" class="num">Medido</th></tr></thead>
            <tbody>${filasBraz}</tbody>
          </table>
        </div>
        <p class="te-pie">Cantidad de brazadas que registró tu entrenador, sin empuje y con empuje.</p>
      </section>` : ''}
    </div>`;
}
