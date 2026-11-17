// Asistencia: sesiones, cumplimiento y notas por mes (agua y físico).
import { vacio } from '../ui.js';
import { crearGraficoColumnas, crearGraficoLineas } from '../graficos.js';
import { esc, mesLargo, MESES, plural } from '../formato.js';

const TIPOS = [
  { id: 'agua', nombre: 'Agua', clase: 'a' },
  { id: 'fisico', nombre: 'Físico', clase: 'b' },
];

const entero = (v) => Math.round(v);
const pct = (f) => `${entero(f * 100)} %`;
const nota1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const suma = (a) => a.reduce((s, x) => s + x, 0);

/** Junta las filas de un tipo en un mes. Septiembre puede traer sistema anterior y nuevo. */
function combinar(filas) {
  if (!filas.length) return null;
  const ant = filas.find((r) => r.sis === 'anterior') || null;
  const nue = filas.find((r) => r.sis === 'nuevo') || null;
  const conAsis = filas.filter((r) => r.asis != null);
  const conNota = filas.filter((r) => r.nota != null);
  const pesoNota = (r) => (r.nNotas > 0 ? r.nNotas : 1);
  const nNotas = suma(conNota.map(pesoNota));
  return {
    asis: conAsis.length ? suma(conAsis.map((r) => r.asis)) : null,
    asisAnt: ant && ant.asis != null ? ant.asis : null,
    asisNue: nue && nue.asis != null ? nue.asis : null,
    exig: nue && nue.exig != null ? nue.exig : null,
    pct: nue && nue.pct != null ? nue.pct : null,
    nota: nNotas ? suma(conNota.map((r) => r.nota * pesoNota(r))) / nNotas : null,
    nNotas,
    mixto: !!(ant && nue && ant.asis != null),
  };
}

function rangoMeses(a, b) {
  const out = [];
  let [y, m] = a.split('-').map(Number);
  const [yf, mf] = b.split('-').map(Number);
  while (y < yf || (y === yf && m <= mf)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

function anillo({ frac, clase, etiqueta, detalle, tam = 132 }) {
  const trazo = 11, r = (tam - trazo) / 2, c = 2 * Math.PI * r, k = tam / 2;
  const desc = `${etiqueta}: ${pct(frac)}${detalle ? `, ${detalle}` : ''}`;
  return `
    <figure class="as-anillo-f">
      <svg class="as-anillo" viewBox="0 0 ${tam} ${tam}" width="${tam}" height="${tam}" role="img" aria-label="${esc(desc)}">
        <circle class="as-a-pista" cx="${k}" cy="${k}" r="${r}" fill="none" stroke-width="${trazo}"/>
        <circle class="as-a-arco as-${clase}" cx="${k}" cy="${k}" r="${r}" fill="none" stroke-width="${trazo}" stroke-linecap="round" transform="rotate(-90 ${k} ${k})" stroke-dasharray="${c.toFixed(2)} ${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - Math.min(1, Math.max(0, frac)))).toFixed(2)}" style="--c:${c.toFixed(2)}"/>
        <text class="as-a-num num" x="${k}" y="${k}" text-anchor="middle" dominant-baseline="central">${entero(frac * 100)}<tspan class="as-a-pc" dx="2">%</tspan></text>
      </svg>
      <figcaption><span class="as-a-et">${esc(etiqueta)}</span>${detalle ? `<span class="as-a-det num">${esc(detalle)}</span>` : ''}</figcaption>
    </figure>`;
}

let graficos = [];

export function destroy() {
  graficos.forEach((g) => g.destroy());
  graficos = [];
}

export function render(cont, p) {
  destroy();
  const filas = (p.asistencia || []).filter((r) => r && r.mes && (r.tipo === 'agua' || r.tipo === 'fisico'));

  if (!filas.length) {
    cont.innerHTML = '<div class="asistencia"><h1 class="vista-h1">Asistencia</h1><div id="as-vacio"></div></div>';
    cont.querySelector('#as-vacio').replaceWith(vacio({
      icon: 'asistencia',
      titulo: 'Aún no hay asistencia registrada',
      texto: 'Cuando tu entrenador registre tus sesiones de agua y físico, verás aquí tu cumplimiento mes a mes y tus notas.',
    }));
    return;
  }

  const listaMeses = [...new Set(filas.map((r) => r.mes))].sort();
  const meses = rangoMeses(listaMeses[0], listaMeses.at(-1));
  const M = new Map(meses.map((mes) => [mes, Object.fromEntries(TIPOS.map((t) => [t.id, combinar(filas.filter((r) => r.mes === mes && r.tipo === t.id))]))]));
  const ultimoMes = listaMeses.at(-1);
  const anio = ultimoMes.slice(0, 4);

  /* ---- Cifras ---- */
  const delAnio = filas.filter((r) => r.mes.startsWith(anio));
  const sesAgua = suma(delAnio.filter((r) => r.tipo === 'agua' && r.asis != null).map((r) => r.asis));
  const sesFis = suma(delAnio.filter((r) => r.tipo === 'fisico' && r.asis != null).map((r) => r.asis));
  const notaProm = (lista) => {
    const l = lista.filter((r) => r.nota != null);
    const n = suma(l.map((r) => (r.nNotas > 0 ? r.nNotas : 1)));
    return n ? suma(l.map((r) => r.nota * (r.nNotas > 0 ? r.nNotas : 1))) / n : null;
  };
  const nAnio = notaProm(delAnio);
  const nAgua = notaProm(delAnio.filter((r) => r.tipo === 'agua'));
  const nFis = notaProm(delAnio.filter((r) => r.tipo === 'fisico'));
  const exigSem = Number(p.exigAgua);
  const hayExig = Number.isFinite(exigSem) && exigSem > 0;
  const cifras = `
    <dl class="as-cifras" style="--n:${hayExig ? 3 : 2}" aria-label="Resumen del año ${esc(anio)}">
      <div class="as-cifra"><dt class="label">Sesiones en ${esc(anio)}</dt><dd class="num">${sesAgua + sesFis}</dd><dd class="as-cifra-s">${sesFis ? `Agua ${sesAgua} · Físico ${sesFis}` : `De agua`}</dd></div>
      <div class="as-cifra"><dt class="label">Nota promedio</dt><dd class="num">${nAnio != null ? nota1(nAnio) : '–'}</dd><dd class="as-cifra-s">${nAgua != null ? `Agua ${nota1(nAgua)}` : ''}${nAgua != null && nFis != null ? ' · ' : ''}${nFis != null ? `Físico ${nota1(nFis)}` : ''}${nAnio == null ? 'Aún sin notas' : ''}</dd></div>
      ${hayExig ? `<div class="as-cifra"><dt class="label">Agua por semana</dt><dd class="num">${exigSem}</dd><dd class="as-cifra-s">${plural(exigSem, 'sesión exigida', 'sesiones exigidas')}</dd></div>` : ''}
    </dl>`;

  /* ---- Héroe: cumplimiento del último mes con dato ---- */
  const ultimoConPct = (tipo) => [...meses].reverse().find((mes) => M.get(mes)[tipo]?.pct != null) || null;
  const mAgua = ultimoConPct('agua'), mFis = ultimoConPct('fisico');
  const anillos = [];
  if (mAgua) { const d = M.get(mAgua).agua; anillos.push({ tipo: TIPOS[0], mes: mAgua, d }); }
  if (mFis) { const d = M.get(mFis).fisico; anillos.push({ tipo: TIPOS[1], mes: mFis, d }); }
  let hero;
  if (anillos.length) {
    const mismo = anillos.every((a) => a.mes === anillos[0].mes);
    hero = `
      <section class="card hero-card as-hero" aria-labelledby="as-hero-l">
        <p class="label" id="as-hero-l">Cumplimiento · ${esc(mismo ? mesLargo(anillos[0].mes) : 'último mes con dato')}</p>
        <div class="as-anillos">
          ${anillos.map((a) => {
            const nue = a.d.asisNue ?? a.d.asis;
            return anillo({ frac: a.d.pct, clase: a.tipo.clase, etiqueta: mismo ? a.tipo.nombre : `${a.tipo.nombre} · ${mesLargo(a.mes)}`, detalle: a.d.exig != null ? `${nue} de ${a.d.exig} sesiones` : '' });
          }).join('')}
        </div>
        <p class="hero-sub">Sesiones a las que fuiste, sobre las que te correspondían.</p>
      </section>`;
  } else {
    const a = M.get(ultimoMes).agua;
    hero = `
      <section class="card hero-card as-hero" aria-labelledby="as-hero-l">
        <p class="label" id="as-hero-l">Sesiones de agua · ${esc(mesLargo(ultimoMes))}</p>
        <p class="hero-tiempo num as-hero-n">${a && a.asis != null ? a.asis : '–'}</p>
        <p class="hero-sub">Tu porcentaje de cumplimiento aparecerá cuando haya sesiones exigidas registradas en el sistema nuevo.</p>
      </section>`;
  }

  /* ---- Gráfico de sesiones por mes ---- */
  const etMes = (mes) => MESES[Number(mes.slice(5)) - 1];
  const mixtoNota = (d, nombre) => `${nombre}: ${d.asis} ${plural(d.asis, 'sesión', 'sesiones')} (${d.asisAnt ?? 0} con el sistema anterior y ${d.asisNue ?? 0} con el nuevo${d.exig != null ? `, de ${d.exig} exigidas` : ''})`;
  const lineaTipo = (d, nombre) => {
    if (!d) return `${nombre}: sin registro este mes`;
    if (d.mixto) return mixtoNota(d, nombre);
    if (d.exig != null) return `${nombre}: ${d.asis} de ${d.exig} sesiones${d.pct != null ? ` · ${pct(d.pct)}` : ''}`;
    if (d.asis != null) return `${nombre}: ${d.asis} ${plural(d.asis, 'sesión', 'sesiones')}`;
    return `${nombre}: sin conteo de sesiones (solo nota)`;
  };
  const categorias = meses.map((mes) => {
    const m = M.get(mes);
    const marca = (d) => (d && !d.mixto && d.exig != null ? d.exig : null);
    return {
      id: mes, etiqueta: etMes(mes), mes,
      valores: { agua: m.agua?.asis ?? null, fisico: m.fisico?.asis ?? null },
      marcas: { agua: marca(m.agua), fisico: marca(m.fisico) },
    };
  });
  const lecturaMes = (c) => {
    const m = M.get(c.mes);
    return `<div class="as-lec"><p class="as-lec-t">${esc(mesLargo(c.mes))}</p>${TIPOS.map((t) => `<p class="as-lec-l"><i class="as-sw as-${t.clase}"></i>${esc(lineaTipo(m[t.id], t.nombre))}</p>`).join('')}</div>`;
  };

  /* ---- Cumplimiento por mes (sistema nuevo) ---- */
  const mesesNuevos = meses.filter((mes) => TIPOS.some((t) => M.get(mes)[t.id]?.pct != null));
  const barraMes = (mes) => {
    const m = M.get(mes);
    return `
      <li class="as-mes">
        <p class="as-mes-n">${esc(mesLargo(mes))}${TIPOS.some((t) => m[t.id]?.mixto) ? '<span class="tag as-mes-tag">Nuevo sistema desde el 7</span>' : ''}</p>
        ${TIPOS.map((t) => {
          const d = m[t.id];
          if (!d || d.pct == null) return `<div class="as-prog"><span class="as-prog-l">${t.nombre}</span><div class="as-pista"></div><span class="as-prog-v num">Sin dato</span></div>`;
          const hechas = d.asisNue ?? d.asis;
          return `<div class="as-prog"><span class="as-prog-l">${t.nombre}</span><div class="as-pista" role="img" aria-label="${esc(`${t.nombre}: ${hechas} de ${d.exig} sesiones, ${pct(d.pct)}`)}"><span class="as-rell as-${t.clase}" style="--v:${Math.min(1, d.pct)}"></span></div><span class="as-prog-v num">${hechas}/${d.exig} · ${pct(d.pct)}</span></div>`;
        }).join('')}
      </li>`;
  };

  const hayMixto = meses.some((mes) => TIPOS.some((t) => M.get(mes)[t.id]?.mixto));
  const hayAnterior = filas.some((r) => r.sis === 'anterior');

  cont.innerHTML = `
    <div class="asistencia">
      <h1 class="vista-h1">Asistencia</h1>

      <div class="as-top">
        ${hero}
        ${cifras}
      </div>

      <section class="card" aria-labelledby="as-ses-h">
        <div class="card-cab"><h2 class="h3" id="as-ses-h">Sesiones por mes</h2></div>
        <div id="as-g-ses"></div>
      </section>

      <div class="as-dos">
        <section class="card" aria-labelledby="as-not-h">
          <div class="card-cab"><h2 class="h3" id="as-not-h">Nota promedio por mes</h2><span class="as-escala">de 0 a 10</span></div>
          <div id="as-g-not"></div>
        </section>
        <section class="card" aria-labelledby="as-cum-h">
          <div class="card-cab"><h2 class="h3" id="as-cum-h">Cumplimiento mes a mes</h2></div>
          ${mesesNuevos.length
            ? `<ul class="as-meses">${mesesNuevos.map(barraMes).join('')}</ul>`
            : '<div class="as-sin"><p class="as-sin-t">Aún no hay meses con sesiones exigidas</p><p class="as-sin-s">Desde el sistema nuevo se compara lo que asististe con lo que te correspondía. Aquí aparecerá ese cumplimiento.</p></div>'}
        </section>
      </div>

      <aside class="as-sistema" aria-labelledby="as-sis-h">
        <h2 class="label" id="as-sis-h">Sobre el cambio de sistema</h2>
        <p>Hasta el 6 de septiembre de 2026 solo se registraban las sesiones de agua a las que asistías y tus notas. Desde el 7 de septiembre también se registran las sesiones exigidas y el porcentaje de cumplimiento, en agua y en físico${hayAnterior || hayMixto ? '; por eso septiembre reúne los dos sistemas' : ''}.</p>
      </aside>
    </div>`;

  /* ---- Gráficos ---- */
  const $ = (s) => cont.querySelector(s);
  const resumenSes = categorias.filter((c) => c.valores.agua != null).map((c) => `${mesLargo(c.mes)}: ${c.valores.agua}`).join('; ');
  graficos.push(crearGraficoColumnas($('#as-g-ses'), {
    ariaLabel: `Sesiones asistidas por mes en agua y físico. Agua: ${resumenSes}.`,
    series: TIPOS.map((t) => ({ id: t.id, etiqueta: t.nombre, clase: t.clase })),
    categorias,
    marcaEtiqueta: 'Sesiones exigidas',
    lectura: lecturaMes,
  }));

  const puntosNota = (tipo) => meses.map((mes, i) => ({ x: i, y: M.get(mes)[tipo]?.nota ?? null, mes })).filter((q) => q.y != null);
  const hayNotas = TIPOS.some((t) => puntosNota(t.id).length);
  if (hayNotas) {
    graficos.push(crearGraficoLineas($('#as-g-not'), {
      ariaLabel: `Nota promedio mensual de 0 a 10, agua y físico. Promedio del año: ${nAnio != null ? nota1(nAnio) : 'sin notas'}.`,
      modo: 'categoria',
      etiquetasX: meses.map(etMes),
      series: TIPOS.map((t) => ({ id: t.id, etiqueta: t.nombre, clase: t.clase, puntos: puntosNota(t.id) })).filter((s) => s.puntos.length),
      ejeY: { min: 0, max: 10, objetivo: 5 },
      formatoValor: nota1,
      tituloX: (i) => mesLargo(meses[i]),
    }));
  } else {
    $('#as-g-not').replaceWith(vacio({ icon: 'asistencia', titulo: 'Aún no hay notas registradas', texto: 'Tus notas de cada sesión se promedian por mes y se dibujan aquí.' }));
  }
}
