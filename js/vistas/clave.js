// Cambiar mi clave (también la pantalla obligatoria tras entrar con un código temporal) y "Dar acceso nuevo" del entrenador.
// Solo funciona dentro de la nube del club (Sesion.bajoPuerta()); en la versión pública estos botones no se muestran.
// Las claves nuevas NO se escriben: se generan aquí (los profesores, solo al azar; los nadadores, al azar o 5 palabras) y la persona las anota.
import * as Sesion from '../sesion.js';
import * as L from '../llavero.js';
import { icono } from '../iconos.js';
import { el } from '../ui.js';

let abierto = null;     // un solo cuadro a la vez

function cuadro(html, { forzado = false, onCerrar } = {}) {
  cerrarCuadro();
  const fondo = el(`<div class="clave-fondo" role="presentation"><div class="clave-caja" role="dialog" aria-modal="true" tabindex="-1">${html}</div></div>`);
  const caja = fondo.firstElementChild;
  document.body.append(fondo);
  document.body.style.overflow = 'hidden';
  const previo = document.activeElement;
  abierto = { fondo, previo, onCerrar };
  if (!forzado) {
    fondo.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarCuadro(); });
    fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrarCuadro(); });
  }
  setTimeout(() => (caja.querySelector('[data-foco]') || caja).focus({ preventScroll: true }), 30);
  return caja;
}

export function cerrarCuadro() {
  if (!abierto) return;
  const { fondo, previo, onCerrar } = abierto;
  abierto = null;
  fondo.remove();
  document.body.style.overflow = '';
  try { previo && previo.focus && previo.focus({ preventScroll: true }); } catch {}
  if (onCerrar) onCerrar();
}

async function copiar(texto, boton) {
  const t0 = boton.textContent;
  try { await navigator.clipboard.writeText(texto); boton.textContent = 'Copiado'; }
  catch { boton.textContent = 'Selecciónalo y cópialo'; }
  setTimeout(() => { boton.textContent = t0; }, 2200);
}

/* ------------------------------------------------------------------ */
/* Cambiar mi clave                                                    */
/* ------------------------------------------------------------------ */
/** forzado: no se puede cerrar hasta guardar (entró con un código temporal). onListo se llama al guardar. */
export async function abrirClave({ forzado = false, onListo = null } = {}) {
  const s = Sesion.sesionActual();
  const esProfe = !!s && s.rol === 'admin';
  const caja = cuadro(`
    <h2 id="cv-tit">${forzado ? 'Elige tu clave nueva' : 'Cambiar mi clave'}</h2>
    <p>${forzado ? 'Entraste con un código temporal. Para seguir, elige una clave nueva.' : 'Elige una clave nueva. La de ahora dejará de servir.'}${esProfe ? ' Para entrenadores la clave es siempre una generada al azar.' : ''}</p>
    ${esProfe ? `<div class="campo"><label for="cv-actual">Tu clave actual</label>
      <input id="cv-actual" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" data-foco></div>` : ''}
    <div class="clave-opciones" role="group" aria-label="Cómo quieres tu clave nueva">
      <button type="button" class="chip" data-modo="azar" aria-pressed="false">Generar una al azar</button>
      ${esProfe ? '' : '<button type="button" class="chip" data-modo="palabras" aria-pressed="false">5 palabras</button>'}
    </div>
    <div data-nueva hidden>
      <strong class="clave-grande" data-clave aria-live="polite"></strong>
      <p class="clave-nota" style="margin-top:8px">Anótala o guarda una captura: no se puede recuperar.</p>
      <div class="clave-acciones fila" style="margin-top:8px"><button type="button" class="btn btn-sec" data-otra>Otra distinta</button><button type="button" class="btn btn-sec" data-copiar>Copiar</button></div>
      <label class="check" style="margin-top:12px"><input type="checkbox" data-anote><span class="check-caja" aria-hidden="true">${icono('check', 16)}</span><span>Ya la anoté</span></label>
    </div>
    <p class="clave-error" role="alert" data-error hidden></p>
    <div class="clave-acciones">
      <button type="button" class="btn btn-primario" data-guardar disabled>Guardar mi clave nueva</button>
      ${forzado ? '' : '<button type="button" class="btn btn-sec" data-cancelar>Cancelar</button>'}
    </div>`, { forzado });
  caja.setAttribute('aria-labelledby', 'cv-tit');
  const q = (s2) => caja.querySelector(s2);
  const bloque = q('[data-nueva]'), grande = q('[data-clave]'), anote = q('[data-anote]'), guardar = q('[data-guardar]'), err = q('[data-error]');
  let modo = '', clave = '', ocupado = false;

  const error = (m) => { err.textContent = m; err.hidden = !m; };
  const revisa = () => { guardar.disabled = ocupado || !clave || !anote.checked || (esProfe && !q('#cv-actual').value.trim()); };
  async function genera(m) {
    modo = m; error('');
    q('[data-modo="azar"]').setAttribute('aria-pressed', m === 'azar');
    q('[data-modo="palabras"]')?.setAttribute('aria-pressed', m === 'palabras');
    if (m === 'azar') clave = L.claveAzar();
    else { const { PALABRAS } = await import('../palabras.js'); clave = L.clavePalabras(PALABRAS); }
    grande.textContent = clave;
    grande.classList.toggle('palabras', m === 'palabras');
    bloque.hidden = false;
    anote.checked = false;
    revisa();
  }
  q('[data-modo="azar"]').addEventListener('click', () => genera('azar'));
  q('[data-modo="palabras"]')?.addEventListener('click', () => genera('palabras'));
  q('[data-otra]').addEventListener('click', () => genera(modo));
  q('[data-copiar]').addEventListener('click', (e) => copiar(clave, e.currentTarget));
  anote.addEventListener('change', revisa);
  q('#cv-actual')?.addEventListener('input', revisa);
  q('[data-cancelar]')?.addEventListener('click', cerrarCuadro);
  guardar.addEventListener('click', async () => {
    if (ocupado || !clave) return;
    ocupado = true; revisa(); error('');
    const t0 = guardar.textContent;
    guardar.textContent = 'Guardando…';
    let res = {};
    try {
      res = await Sesion.cambiarClave(clave, { actual: esProfe ? q('#cv-actual').value : '' });
    } catch (ex) {
      ocupado = false; guardar.textContent = t0; revisa();
      error(ex instanceof Sesion.ErrorCambio ? ex.message : 'No se pudo guardar. Intenta de nuevo.');
      return;
    }
    // Listo: el cuadro cambia a un mensaje de confirmación (la clave se queda a la vista hasta que la persona cierre).
    const fin = cuadro(`
      <h2>Listo, tu clave ya cambió</h2>
      <p>Desde ahora entra con esta clave. Si no la anotaste, anótala ahora.</p>
      <strong class="clave-grande${modo === 'palabras' ? ' palabras' : ''}" data-clave></strong>
      ${res && res.huellasPerdidas ? '<p class="clave-nota">Por seguridad, la huella se desactivó en tus celulares; puedes activarla de nuevo.</p>' : ''}
      <div class="clave-acciones"><button type="button" class="btn btn-primario" data-ok data-foco>Entendido</button></div>`, { forzado: true });
    fin.querySelector('[data-clave]').textContent = clave;
    fin.querySelector('[data-ok]').addEventListener('click', () => { clave = ''; cerrarCuadro(); if (onListo) onListo(); });
  });
  revisa();
  if (esProfe) genera('azar');                       // los entrenadores no eligen: solo la clave al azar
}

/* ------------------------------------------------------------------ */
/* Dar acceso nuevo (entrenador)                                       */
/* ------------------------------------------------------------------ */
export function abrirAcceso(perfil) {
  const caja = cuadro(`
    <h2 id="ac-tit">Dar acceso nuevo</h2>
    <p data-texto></p>
    <p class="clave-error" role="alert" data-error hidden></p>
    <div class="clave-acciones">
      <button type="button" class="btn btn-primario" data-crear data-foco>Crear código</button>
      <button type="button" class="btn btn-sec" data-cancelar>Cancelar</button>
    </div>`);
  caja.setAttribute('aria-labelledby', 'ac-tit');
  const nombre = perfil.etiqueta || perfil.nombre || '';
  caja.querySelector('[data-texto]').textContent = `Vas a crear un código temporal para ${nombre}. Su clave de ahora dejará de servir y sus huellas guardadas se borran. El código vale 48 horas. Esto no cambia las llaves de los datos: si alguien se llevó una copia, hay que correr cifrar.py --nuevas-claves.`;
  caja.querySelector('[data-cancelar]').addEventListener('click', cerrarCuadro);
  const crear = caja.querySelector('[data-crear]'), err = caja.querySelector('[data-error]');
  crear.addEventListener('click', async () => {
    crear.disabled = true; crear.textContent = 'Creando…'; err.hidden = true;
    let r;
    try { r = await Sesion.darAccesoNuevo(perfil); }
    catch (ex) {
      crear.disabled = false; crear.textContent = 'Crear código';
      err.textContent = ex instanceof Sesion.ErrorCambio ? ex.message : 'No se pudo crear el código. Intenta de nuevo.';
      err.hidden = false;
      return;
    }
    const fin = cuadro(`
      <h2>Código para <span data-nombre></span></h2>
      <strong class="clave-grande" data-codigo></strong>
      <p>Vale 48 horas · dalo en privado, nunca en un grupo.</p>
      <p class="clave-nota">Con este código y su usuario (<b data-usuario></b>) entra al portal y elige su clave nueva. Este código no se vuelve a mostrar.</p>
      <div class="clave-acciones fila"><button type="button" class="btn btn-sec" data-copiar>Copiar</button><button type="button" class="btn btn-primario" data-ok data-foco>Listo</button></div>`);
    fin.querySelector('[data-nombre]').textContent = nombre;
    fin.querySelector('[data-codigo]').textContent = r.codigo;
    fin.querySelector('[data-usuario]').textContent = perfil.usuario;
    fin.querySelector('[data-copiar]').addEventListener('click', (e) => copiar(r.codigo, e.currentTarget));
    fin.querySelector('[data-ok]').addEventListener('click', () => { r.codigo = ''; fin.querySelector('[data-codigo]').textContent = ''; cerrarCuadro(); });
  });
}

/* ------------------------------------------------------------------ */
/* Entrar con huella o cara + "Mis celulares con huella"               */
/* ------------------------------------------------------------------ */
const fechaCorta = (ms) => { try { return new Date(ms).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };

/** Cuadro para activar la huella o cara en este celular y ver o quitar los celulares que ya la tienen. Solo se llega aquí si Sesion.huellaDisponible(). */
export async function abrirHuella() {
  const caja = cuadro(`
    <h2 id="hu-tit">Entrar con huella o cara</h2>
    <p>Con esto entras sin escribir tu clave. <b>Tu huella no sale de este celular.</b></p>
    <p class="clave-nota">Actívala solo en tu propio celular, no en uno prestado ni compartido.</p>
    <div class="campo"><label for="hu-clave">Tu clave actual</label>
      <input id="hu-clave" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" data-foco>
      <p class="clave-nota" style="margin-top:6px">Se pide para activar o quitar una huella.</p></div>
    <div class="campo"><label for="hu-nombre">Nombre de este celular</label>
      <input id="hu-nombre" type="text" maxlength="40" autocomplete="off" spellcheck="false"></div>
    <p class="clave-error" role="alert" data-error hidden></p>
    <p class="clave-ok" role="status" data-listo hidden></p>
    <div class="clave-acciones"><button type="button" class="btn btn-primario" data-activar>Activar en este celular</button></div>
    <h3 class="huella-sub">Mis celulares con huella</h3>
    <p class="clave-nota" data-aviso hidden>Por seguridad, quitar un celular desactiva la huella en todos tus celulares: tendrás que activarla otra vez en los que sigas usando.</p>
    <ul class="huella-lista" data-lista aria-live="polite"></ul>
    <div class="clave-acciones"><button type="button" class="btn btn-sec" data-cerrar>Cerrar</button></div>`);
  caja.setAttribute('aria-labelledby', 'hu-tit');
  const q = (s) => caja.querySelector(s);
  const err = q('[data-error]'), listo = q('[data-listo]'), lista = q('[data-lista]'), activar = q('[data-activar]'), aviso = q('[data-aviso]');
  q('#hu-nombre').value = Sesion.nombreCelularSugerido();
  q('[data-cerrar]').addEventListener('click', cerrarCuadro);
  const error = (m) => { err.textContent = m; err.hidden = !m; };

  async function pintaLista() {
    let items = [];
    try { items = await Sesion.huellasGuardadas(); } catch (ex) { error(ex instanceof Sesion.ErrorCambio ? ex.message : 'No se pudo leer la lista.'); }
    lista.replaceChildren();
    if (!items.length) { const li = document.createElement('li'); li.className = 'huella-vacia'; li.textContent = 'Todavía no hay celulares con huella.'; lista.append(li); return; }
    for (const it of items) {
      const li = document.createElement('li');
      const txt = document.createElement('span'); txt.className = 'huella-txt';
      const n = document.createElement('b'); n.textContent = it.nombre;
      const f = document.createElement('small'); f.textContent = it.creado ? 'Activada el ' + fechaCorta(it.creado) : '';
      txt.append(n, f);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = 'Quitar'; b.setAttribute('aria-label', 'Quitar ' + it.nombre);
      let seguro = false;
      b.addEventListener('click', async () => {
        if (!q('#hu-clave').value.trim()) { error('Escribe tu clave actual para quitar un celular.'); q('#hu-clave').focus(); return; }
        if (!seguro) { seguro = true; error(''); b.textContent = '¿Seguro? Toca otra vez'; aviso.hidden = false; setTimeout(() => { if (b.isConnected && !b.disabled) { seguro = false; b.textContent = 'Quitar'; aviso.hidden = true; } }, 6000); return; }
        b.disabled = true; b.textContent = 'Quitando…'; error(''); listo.hidden = true;
        try {
          const r = await Sesion.quitarHuella(it.cred, q('#hu-clave').value);
          listo.textContent = r && r.otros ? 'Listo. Por seguridad, la huella se desactivó en TODOS tus celulares; actívala otra vez en los que sigas usando.' : 'Listo: ese celular ya no entra con huella.';
          listo.hidden = false;
        } catch (ex) { error(ex instanceof Sesion.ErrorCambio ? ex.message : 'No se pudo quitar. Intenta de nuevo.'); }
        aviso.hidden = true;
        pintaLista();
      });
      li.append(txt, b); lista.append(li);
    }
  }
  activar.addEventListener('click', async () => {
    if (!q('#hu-clave').value.trim()) { error('Escribe tu clave actual para activar la huella.'); q('#hu-clave').focus(); return; }
    activar.disabled = true; error(''); listo.hidden = true;
    const t0 = activar.textContent; activar.textContent = 'Esperando tu huella…';
    try {
      await Sesion.activarHuella(q('#hu-nombre').value, q('#hu-clave').value);
      listo.textContent = 'Listo. La próxima vez toca «Entrar con huella o cara» en la pantalla de entrada.'; listo.hidden = false;
    } catch (ex) { error(ex instanceof Sesion.ErrorCambio ? ex.message : 'No se pudo activar. Intenta de nuevo.'); }
    activar.disabled = false; activar.textContent = t0;
    pintaLista();
  });
  pintaLista();
}

/** Agrega a `cont` el botón "Entrar con huella o cara" (oculto hasta comprobar que este celular puede). */
export function botonHuella(cont, { clase = 'btn btn-sec', antes = null } = {}) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = clase; b.hidden = true; b.dataset.huella = '1'; b.textContent = 'Entrar con huella o cara';
  b.addEventListener('click', () => abrirHuella());
  if (antes) cont.insertBefore(b, antes); else cont.append(b);
  Sesion.huellaDisponible().then((ok) => { if (ok) b.hidden = false; });
  return b;
}
