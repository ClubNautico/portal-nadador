// "Más": accesos a Fuerza, Técnica y Asistencia + tema y cierre de sesión (móvil).
import { icono } from '../iconos.js';
import { esc } from '../formato.js';

const ITEMS = [
  { v: 'fuerza', t: 'Fuerza', d: 'Tus tests de fuerza y 1RM' },
  { v: 'tecnica', t: 'Técnica', d: 'Evaluaciones y puntos a mejorar' },
  { v: 'asistencia', t: 'Asistencia', d: 'Tu asistencia mes a mes' },
];

export function render(cont, _p, ctx) {
  cont.innerHTML = `
    <div class="mas">
      <h1 class="vista-h1">Más</h1>
      <ul class="mas-lista">${ITEMS.map((i) => `
        <li><a class="acceso" href="${ctx.hrefVista(i.v)}">
          <span class="acceso-ico">${icono(i.v, 22)}</span>
          <span class="acceso-txt"><span class="acceso-tit">${esc(i.t)}</span><span class="acceso-sub">${esc(i.d)}</span></span>
          ${icono('chev-der', 18, 'acceso-flecha')}
        </a></li>`).join('')}</ul>
      <div class="mas-sesion">
        <button type="button" class="btn btn-sec" data-tema>${icono(ctx.temaActual() === 'light' ? 'luna' : 'sol', 20)}<span>${ctx.temaActual() === 'light' ? 'Usar tema oscuro' : 'Usar tema claro'}</span></button>
        <button type="button" class="btn btn-sec" data-salir>${icono('salir', 20)}Cerrar sesión</button>
      </div>
    </div>`;
  cont.querySelector('[data-salir]').addEventListener('click', ctx.cerrarSesion);
  cont.querySelector('[data-tema]').addEventListener('click', (e) => {
    ctx.alternarTema();
    const b = e.currentTarget;
    b.innerHTML = `${icono(ctx.temaActual() === 'light' ? 'luna' : 'sol', 20)}<span>${ctx.temaActual() === 'light' ? 'Usar tema oscuro' : 'Usar tema claro'}</span>`;
  });
}
