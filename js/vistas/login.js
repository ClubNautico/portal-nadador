// Pantalla de inicio de sesión.
import * as Sesion from '../sesion.js';
import { icono } from '../iconos.js';
import { el, reducirMovimiento } from '../ui.js';
import { esc } from '../formato.js';

function carriles(n = 8) {
  // Ocho carriles horizontales: líneas de agua y corcheras (rayas discontinuas).
  let s = '';
  for (let i = 0; i < n; i++) {
    const y = ((i + 0.5) / n) * 100;
    s += `<line x1="0" x2="100%" y1="${y}%" y2="${y}%" class="car-l${i % 2 ? ' car-alt' : ''}"/>`;
  }
  return `<svg class="carriles" width="100%" height="100%" aria-hidden="true" focusable="false">${s}</svg>`;
}

function formatearPassword(v) {
  const limpio = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return limpio.replace(/(.{4})(?=.)/g, '$1-');
}

export function mostrarLogin(raiz, { onExito, mensaje = '' }) {
  const vista = el(`
    <div class="login">
      <section class="login-col">
        ${carriles(8)}
        <div class="login-caja">
          <div class="login-marca">
            <svg class="marca-ico" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z"/><path d="M7.5 12c1.2-1.2 2.3-1.2 3.5 0s2.3 1.2 3.5 0 1.3-1.1 2-.6"/></svg>
            <div><p class="login-club">Club Náutico</p><p class="label">Portal del nadador</p></div>
          </div>
          <h1 class="login-titular">Tu progreso,<br>a la centésima.</h1>
          <p class="login-sub">Ingresa con el usuario y la contraseña que te dio tu entrenador.</p>
          <form class="login-form" novalidate aria-live="polite">
            <div class="campo">
              <label for="lg-usuario">Usuario</label>
              <input id="lg-usuario" name="usuario" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="text" placeholder="nombre.apellido" required>
            </div>
            <div class="campo">
              <label for="lg-pass">Contraseña</label>
              <div class="campo-pass">
                <input id="lg-pass" name="password" type="password" autocomplete="current-password" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX" maxlength="14" required>
                <button type="button" class="ojo" aria-label="Mostrar contraseña" aria-pressed="false">${icono('ojo', 22)}</button>
              </div>
              <p class="campo-error" id="lg-error" role="alert" hidden></p>
            </div>
            <label class="check">
              <input type="checkbox" name="recordar">
              <span class="check-caja" aria-hidden="true">${icono('check', 16)}</span>
              <span>Recordar mi usuario</span>
            </label>
            <button type="submit" class="btn btn-primario btn-login"><span class="btn-txt">Ingresar</span><svg class="spin" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2" stroke-opacity=".3"/><path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
          </form>
          <p class="login-ayuda">¿Olvidaste tu contraseña? Pídela a tu entrenador.</p>
          <p class="login-ayuda"><a href="/">&lsaquo; Volver a la portada del club</a></p>
        </div>
        <button type="button" class="icon-btn login-tema" data-accion="tema"></button>
      </section>
      <aside class="login-panel" aria-hidden="true">
        ${carriles(8)}
        <div class="login-hero">
          <p class="label">100 m libre · 25 m · ejemplo</p>
          <p class="login-tiempo num">1:05.55</p>
          <p class="login-tiempo-sub">▼ Bajaste 0.84 s respecto a tu anterior</p>
        </div>
      </aside>
    </div>`);

  raiz.replaceChildren(vista);
  const form = vista.querySelector('form');
  const uInput = form.usuario, pInput = form.password, err = vista.querySelector('#lg-error');
  const guardadoU = Sesion.usuarioRecordado();
  if (guardadoU) { uInput.value = guardadoU; form.recordar.checked = true; }
  const btn = form.querySelector('.btn-login');
  const txt = btn.querySelector('.btn-txt');
  document.querySelectorAll('[data-accion="tema"]').forEach((b) => {
    const claro = document.documentElement.dataset.theme === 'light';
    b.innerHTML = icono(claro ? 'luna' : 'sol', 22);
    b.setAttribute('aria-label', claro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
  });

  function mostrarError(m) {
    err.innerHTML = `${icono('alerta', 16)}<span>${esc(m)}</span>`;
    err.hidden = false;
    pInput.setAttribute('aria-invalid', 'true');
    uInput.setAttribute('aria-invalid', 'true');
    pInput.setAttribute('aria-describedby', 'lg-error');
  }
  function limpiarError() {
    err.hidden = true;
    pInput.removeAttribute('aria-invalid');
    uInput.removeAttribute('aria-invalid');
  }
  if (mensaje) mostrarError(mensaje);

  // Autoformato XXXX-XXXX-XXXX conservando el cursor
  pInput.addEventListener('input', () => {
    const pos = pInput.selectionStart ?? pInput.value.length;
    const antes = pInput.value.slice(0, pos).replace(/[^A-Za-z0-9]/g, '').length;
    pInput.value = formatearPassword(pInput.value);
    let n = 0, nuevo = pInput.value.length;
    for (let i = 0; i < pInput.value.length; i++) {
      if (n === antes) { nuevo = i; break; }
      if (/[A-Z0-9]/.test(pInput.value[i])) n++;
      if (n === antes && pInput.value[i + 1] === '-') { nuevo = i + 1; break; }
    }
    try { pInput.setSelectionRange(nuevo, nuevo); } catch {}
    limpiarError();
  });
  uInput.addEventListener('input', limpiarError);

  const ojo = vista.querySelector('.ojo');
  ojo.addEventListener('click', () => {
    const ver = pInput.type === 'password';
    pInput.type = ver ? 'text' : 'password';
    ojo.innerHTML = icono(ver ? 'ojo-off' : 'ojo', 22);
    ojo.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
    ojo.setAttribute('aria-pressed', ver);
  });

  let cargando = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (cargando) return;
    limpiarError();
    if (!uInput.value.trim() || !pInput.value.trim()) {
      mostrarError('Escribe tu usuario y tu contraseña.');
      (uInput.value.trim() ? pInput : uInput).focus();
      return;
    }
    cargando = true;
    btn.disabled = true;
    btn.classList.add('cargando');
    txt.textContent = 'Verificando…';
    try {
      const s = await Sesion.iniciar(uInput.value, pInput.value, form.recordar.checked);
      onExito(s);
    } catch (ex) {
      cargando = false;
      btn.disabled = false;
      btn.classList.remove('cargando');
      txt.textContent = 'Ingresar';
      if (ex instanceof Sesion.ErrorProfesor) {
        mostrarError('Los profesores entran desde el Panel del profesor.');
        err.insertAdjacentHTML('beforeend', '<a class="btn-login" style="margin-top:10px;text-decoration:none" href="https://clubnautico.github.io/">Ir al Panel del profesor</a>');
        pInput.value = '';
        return;
      }
      if (ex instanceof Sesion.ErrorRed) mostrarError(ex.message && ex.message.includes('https') ? ex.message : 'No pudimos conectar. Revisa tu conexión e intenta de nuevo.');
      else mostrarError('Usuario o contraseña incorrectos. Revisa e intenta de nuevo.');
      pInput.focus();
      pInput.select();
    }
  });

  // Tiempo héroe de ejemplo: cuenta una sola vez
  const t = vista.querySelector('.login-tiempo');
  if (t && !reducirMovimiento() && innerWidth >= 1024) {
    const final = t.textContent, total = 65.55, t0 = performance.now();
    const paso = (now) => {
      const k = Math.min(1, (now - t0) / 900);
      const e2 = 1 - Math.pow(1 - k, 4);
      const v = total * e2, m = Math.floor(v / 60), s = v - m * 60;
      t.textContent = k < 1 ? `${m}:${s.toFixed(2).padStart(5, '0')}` : final;
      if (k < 1 && t.isConnected) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }
  setTimeout(() => (innerWidth >= 1024 ? uInput.focus({ preventScroll: true }) : null), 50);
}
