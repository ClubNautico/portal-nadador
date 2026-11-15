// Inicio: resumen del nadador.
import { icono } from '../iconos.js';
import { el, chipRP, variacion, animarTiempo, vacio, guardado } from '../ui.js';
import { avatar } from '../ui.js';
import { sparkline } from '../graficos.js';
import { esc, iniciales, fechaCorta, fechaMes, mesLargo, ordinal, nombreLimpio, plural, tituloEvento, fmtTiempo, fmtDelta, nombreCorto } from '../formato.js';
import { ultimosRP, pruebaMasNadada, ultimoPor } from '../datos.js';

const ANIO = new Date().getFullYear();

function resumenTests(p, ctx) {
  const out = [];
  // Tiempos
  const nPruebas = p._pruebas.size;
  out.push({ v: 'tiempos', ico: 'tiempos', titulo: 'Tiempos', dato: nPruebas ? `${nPruebas} ${plural(nPruebas, 'prueba', 'pruebas')} con marca` : 'Aún sin marcas', sub: p._t.length ? `Última: ${fechaCorta(p._t[p._t.length - 1].f)}` : '' });
  // Agua
  const ta = ultimoPor(p.testsAgua);
  out.push({ v: 'agua', ico: 'agua', titulo: 'Tests de agua', dato: ta ? `${ta.dist} m ${String(ta.est).toLowerCase()} · ${ta.t}` : 'Aún sin tests', sub: ta ? `Último test: ${ta.f ? fechaCorta(ta.f) : 'sin fecha'}` : 'Se mostrarán aquí' });
  // Fuerza
  const rm = ultimoPor(p.rm);
  const tf = ultimoPor(p.testsFisicos);
  let fz = { dato: 'Aún sin tests', sub: 'Se mostrarán aquí' };
  if (rm && (!tf || (rm.f || '') >= (tf.f || ''))) fz = { dato: `${tituloEvento(rm.ej)} · ${rm.v} ${String(rm.u || '').toLowerCase()}`, sub: `1RM del ${rm.f ? fechaCorta(rm.f) : 'registro'}` };
  else if (tf) fz = { dato: `${tf.b}: ${tf.t}`, sub: `Último test: ${tf.f ? fechaCorta(tf.f) : 'sin fecha'}` };
  out.push({ v: 'fuerza', ico: 'fuerza', titulo: 'Fuerza', ...fz });
  // Cuerpo
  const an = ultimoPor(p.antropometria);
  out.push({ v: 'cuerpo', ico: 'cuerpo', titulo: 'Cuerpo', dato: an ? [an.peso != null ? `${an.peso} kg` : null, an.talla != null ? `${an.talla} cm` : null].filter(Boolean).join(' · ') || 'Medición registrada' : 'Aún sin mediciones', sub: an ? `Medido el ${fechaCorta(an.f)}` : '' });
  // Técnica
  const ev = ultimoPor(p.tecnica?.evals);
  out.push({ v: 'tecnica', ico: 'tecnica', titulo: 'Técnica', dato: ev ? `Evaluación de ${String(ev.est).toLowerCase()}` : 'Aún sin evaluaciones', sub: ev ? fechaCorta(ev.f) : '' });
  // Asistencia
  const as = (p.asistencia || []).filter((a) => a.pct != null);
  let ultMes = as.length ? as.reduce((m, a) => (a.mes > m ? a.mes : m), '') : null;
  const delMes = as.filter((a) => a.mes === ultMes);
  const ag = delMes.find((a) => a.tipo === 'agua');
  out.push({ v: 'asistencia', ico: 'asistencia', titulo: 'Asistencia', dato: ag ? `Agua ${Math.round(ag.pct * 100)} %` : delMes[0] ? `${delMes[0].tipo === 'fisico' ? 'Físico' : delMes[0].tipo} ${Math.round(delMes[0].pct * 100)} %` : 'Aún sin registros', sub: ultMes ? mesLargo(ultMes) : '' });
  return out;
}

export function render(cont, p, ctx) {
  const t = p._t;
  const comps = p._comps;
  const nombre = nombreLimpio(p.etiqueta);
  const rpAnio = t.filter((m) => m.esRP && m.f.startsWith(String(ANIO))).length;
  const desde = t.length ? t[0].f.slice(0, 4) : '–';
  const principal = pruebaMasNadada(p);
  const rps = ultimosRP(p, 5);
  const ult = comps[comps.length - 1];

  const cab = `
    <header class="perfil-cab">
      ${avatar(iniciales(p.etiqueta), 64)}
      <div class="perfil-txt">
        <h1 class="perfil-nombre">${esc(nombre)}</h1>
        <p class="perfil-meta">${p.categoria ? `Categoría ${esc(p.categoria)}${/^\d/.test(p.categoria) ? ' años' : ''}` : ''}${p.grupo ? `<span class="chip-neutro">${esc(p.grupo)}</span>` : ''}</p>
      </div>
    </header>`;

  const cifras = `
    <dl class="cifras" aria-label="Resumen de tu carrera">
      <div class="cifra"><dt class="label">${plural(comps.length, 'Competencia', 'Competencias')}</dt><dd class="num">${comps.length}</dd></div>
      <div class="cifra"><dt class="label">Marcas registradas</dt><dd class="num">${t.length}</dd></div>
      <div class="cifra"><dt class="label">Récords en ${ANIO}</dt><dd class="num ${rpAnio ? 'cifra-acento' : ''}">${rpAnio}</dd></div>
      <div class="cifra"><dt class="label">Compitiendo desde</dt><dd class="num">${desde}</dd></div>
    </dl>`;

  // Tarjeta de la prueba más nadada
  let heroHTML = '';
  if (principal) {
    const m = principal.mejor;
    const valores = principal.marcas.slice(-10).map((x) => x.s);
    heroHTML = `
      <section class="card hero-card" aria-labelledby="h-prueba">
        <p class="label" id="h-prueba">Tu prueba más nadada · ${esc(principal.dist)}<span class="u-m">m</span> ${esc(principal.est)} · piscina ${principal.c}<span class="u-m">m</span></p>
        <p class="hero-tiempo num" data-s="${m.s}">${esc(m.t)}</p>
        <div class="hero-linea">
          ${m.esRP ? chipRP() : ''}
          ${m.delta != null && m.delta > 0 ? variacion(m.delta, { largo: true }).replace('más rápido', 'más rápido que tu anterior') : ''}
        </div>
        <p class="hero-sub">${esc(fechaCorta(m.f))} · ${esc(tituloEvento(m.ev))}</p>
        <div class="hero-spark">${sparkline(valores, { fluido: true, alto: 64, ancho: 320, clase: 'spark-grande', etiqueta: `Últimas ${valores.length} marcas de ${principal.dist} m ${principal.est}` })}<p class="hero-spark-cap">Últimas ${valores.length} ${plural(valores.length, 'marca', 'marcas')} · ${principal.marcas.length} en total</p></div>
        <button type="button" class="btn btn-sec hero-ver" data-ver>Ver progresión ${icono('chev-der', 18)}</button>
      </section>`;
  }

  const listaRP = rps.length
    ? `<ul class="lista-filas">${rps.map((m) => `
        <li class="fila-rp">
          <div class="fr-main"><p class="fr-t">${esc(m.dist)} m ${esc(m.est)} · ${m.c} m</p><p class="fr-s">${esc(fechaCorta(m.f))} · ${esc(tituloEvento(m.ev))}</p></div>
          <div class="fr-der"><span class="fr-tiempo num acento">${esc(m.t)}</span>${variacion(m.delta)}</div>
        </li>`).join('')}</ul>`
    : '';

  let ultimaHTML = '';
  if (ult) {
    const orden = ult.items;
    ultimaHTML = `
      <section class="card" aria-labelledby="h-ult">
        <div class="card-cab"><h2 id="h-ult" class="h3">Tu última competencia</h2></div>
        <p class="ult-ev">${esc(ult.nombre)}</p>
        <p class="ult-sub">${esc(fechaCorta(ult.ini))}${ult.fin !== ult.ini ? ` – ${esc(fechaCorta(ult.fin))}` : ''} · piscina ${[...ult.pools].join(' / ')} m${ult.rp ? ` · ${ult.rp} ${plural(ult.rp, 'récord personal', 'récords personales')}` : ''}</p>
        <ul class="lista-filas lista-comp">${orden.map((m) => `
          <li class="fila-rp">
            <div class="fr-main"><p class="fr-t">${esc(m.p)}</p><p class="fr-s">${m.pu ? `${ordinal(m.pu)} lugar` : 'Sin puesto'}${m.exh ? ' · exhibición' : ''}</p></div>
            <div class="fr-der">${m.esRP ? chipRP(true) : m.primera ? '<span class="tag">Primera vez</span>' : ''}<span class="fr-tiempo num ${m.esRP ? 'acento' : ''}">${esc(m.t)}</span></div>
          </li>`).join('')}</ul>
      </section>`;
  }

  const accesos = resumenTests(p, ctx).map((a) => `
    <a class="acceso" href="${ctx.hrefVista(a.v)}">
      <span class="acceso-ico">${icono(a.ico, 22)}</span>
      <span class="acceso-txt"><span class="acceso-tit">${esc(a.titulo)}</span><span class="acceso-dato">${esc(a.dato)}</span>${a.sub ? `<span class="acceso-sub">${esc(a.sub)}</span>` : ''}</span>
      ${icono('chev-der', 18, 'acceso-flecha')}
    </a>`).join('');

  cont.innerHTML = `
    <div class="inicio">
      ${cab}
      ${t.length ? cifras : ''}
      <div class="inicio-rejilla">
        <div class="col-a">
          ${heroHTML}
          ${rps.length ? `<section class="card" aria-labelledby="h-rp"><div class="card-cab"><h2 id="h-rp" class="h3">Últimos récords personales</h2></div>${listaRP}</section>` : ''}
        </div>
        <div class="col-b">
          ${ultimaHTML}
        </div>
      </div>
      ${!t.length ? '<div class="slot-vacio"></div>' : ''}
      <section aria-labelledby="h-expl" class="expl">
        <h2 id="h-expl" class="h2">Explora tu progreso</h2>
        <div class="accesos">${accesos}</div>
      </section>
    </div>`;

  if (!t.length) cont.querySelector('.slot-vacio').replaceWith(vacio({ titulo: 'Aún no hay marcas de competencia', texto: 'Cuando nades tu primera competencia oficial, tus tiempos aparecerán aquí.' }));
  if (!rps.length && t.length) {
    cont.querySelector('.col-a').append(vacio({ titulo: 'Tu primer récord personal está por llegar', texto: 'Cada vez que mejores una marca anterior, la verás aquí con cuánto bajaste.' }));
  }
  const hero = cont.querySelector('.hero-tiempo');
  if (hero) animarTiempo(hero, Number(hero.dataset.s), 'inicio-hero');
  cont.querySelector('[data-ver]')?.addEventListener('click', () => {
    guardado.poner('portal.tiempos.prueba', { est: principal.est, dist: principal.dist, pool: principal.c });
    ctx.navegar(ctx.hrefVista('tiempos'));
  });
}
