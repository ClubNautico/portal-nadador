// Estado "en construcción" compartido por las vistas que otro agente completará.
import { icono } from '../iconos.js';
import { esc } from '../formato.js';

export function enConstruccion(cont, { titulo, icon, texto, dato = '' }) {
  cont.innerHTML = `
    <div class="obra">
      <h1 class="vista-h1">${esc(titulo)}</h1>
      <div class="vacio vacio-grande">
        ${icono(icon, 64, 'vacio-ico')}
        <h2 class="h3">${esc(titulo)} está en camino</h2>
        <p>${esc(texto)}</p>
        ${dato ? `<p class="obra-dato">${esc(dato)}</p>` : ''}
      </div>
    </div>`;
}
