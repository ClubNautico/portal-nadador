// Panel de administrador: selector de nadadores.
import { icono } from '../iconos.js';
import { el, vacio, avatar, guardado } from '../ui.js';
import { esc, iniciales, normalizar } from '../formato.js';

export function render(cont, _perfil, ctx) {
  const lista = ctx.sesion.perfiles.slice();
  const nombre = (p) => p.etiqueta;
  const numCat = (c) => parseInt(String(c).match(/\d+/)?.[0] ?? '99', 10);
  let agrupar = guardado.leer('portal.admin.agrupar', true);
  let q = '';

  cont.innerHTML = `
    <div class="admin">
      <header class="admin-cab">
        <div>
          <h1 class="vista-h1 admin-h1">Nadadores</h1>
          <p class="admin-sub">${lista.length} ${lista.length === 1 ? 'nadador' : 'nadadores'} · elige uno para ver su portal tal como lo ve él.</p>
        </div>
        <button type="button" class="btn btn-sec admin-salir" data-salir>${icono('salir', 18)}Cerrar sesión</button>
      </header>
      <div class="admin-barra">
        <label class="busca">
          <span class="sr-only">Buscar nadador por nombre</span>
          ${icono('buscar', 20)}
          <input type="search" id="ad-q" placeholder="Buscar por nombre" autocomplete="off" autocapitalize="none" spellcheck="false">
        </label>
        <button type="button" class="chip chip-toggle" id="ad-agr" aria-pressed="${agrupar}">${icono('usuarios', 18)}Agrupar por categoría</button>
      </div>
      <p class="sr-only" id="ad-estado" role="status" aria-live="polite"></p>
      <div id="ad-lista"></div>
    </div>`;

  const host = cont.querySelector('#ad-lista');
  const estado = cont.querySelector('#ad-estado');

  const tarjeta = (p) => `
    <a class="nad-card" href="#/n/${encodeURIComponent(p.id)}/inicio">
      ${avatar(iniciales(p.etiqueta), 48)}
      <span class="nad-txt"><span class="nad-n">${esc(nombre(p))}</span><span class="nad-c">${esc(p.categoria)}${/^\d/.test(p.categoria) ? ' años' : ''}</span></span>
      ${icono('chev-der', 18, 'acceso-flecha')}
    </a>`;

  function pintar() {
    const nq = normalizar(q);
    const f = lista.filter((p) => !nq || normalizar(p.etiqueta + ' ' + p.nombre).includes(nq));
    estado.textContent = `${f.length} ${f.length === 1 ? 'resultado' : 'resultados'}`;
    if (!f.length) {
      host.replaceChildren(vacio({ titulo: `Nadie coincide con “${q}”`, texto: 'Revisa la ortografía o busca solo por el apellido.', accion: { texto: 'Borrar búsqueda', onClick: () => { inp.value = ''; q = ''; pintar(); inp.focus(); } } }));
      return;
    }
    if (!agrupar) {
      f.sort((a, b) => normalizar(a.etiqueta).localeCompare(normalizar(b.etiqueta)));
      host.innerHTML = `<div class="nad-rejilla">${f.map(tarjeta).join('')}</div>`;
      return;
    }
    const grupos = new Map();
    f.forEach((p) => { if (!grupos.has(p.categoria)) grupos.set(p.categoria, []); grupos.get(p.categoria).push(p); });
    const cats = [...grupos.keys()].sort((a, b) => numCat(a) - numCat(b) || a.localeCompare(b));
    host.innerHTML = cats.map((c) => {
      const l = grupos.get(c).sort((a, b) => normalizar(a.etiqueta).localeCompare(normalizar(b.etiqueta)));
      return `<section class="nad-grupo" aria-label="Categoría ${esc(c)}"><h2 class="label nad-cat">${esc(c)}${/^\d/.test(c) ? ' años' : ''} <span class="nad-cuenta">${l.length}</span></h2><div class="nad-rejilla">${l.map(tarjeta).join('')}</div></section>`;
    }).join('');
  }

  const inp = cont.querySelector('#ad-q');
  inp.addEventListener('input', () => { q = inp.value; pintar(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const a = host.querySelector('.nad-card'); if (a) { location.hash = a.getAttribute('href'); } }
    if (e.key === 'ArrowDown') { host.querySelector('.nad-card')?.focus(); e.preventDefault(); }
  });
  host.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const cards = [...host.querySelectorAll('.nad-card')];
    const i = cards.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && i === 0) inp.focus(); else cards[Math.max(0, Math.min(cards.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
  });
  const bAgr = cont.querySelector('#ad-agr');
  bAgr.addEventListener('click', () => { agrupar = !agrupar; bAgr.setAttribute('aria-pressed', agrupar); guardado.poner('portal.admin.agrupar', agrupar); pintar(); });
  cont.querySelector('[data-salir]').addEventListener('click', ctx.cerrarSesion);
  pintar();
}
