// Arranque, shell (navegación) y router por hash. Ver CONTRATO_VISTAS.md.
import * as Sesion from './sesion.js';
import { icono } from './iconos.js';
import { el, errorCaja, skeletonVista, aviso } from './ui.js';
import { esc, iniciales, nombreLimpio } from './formato.js';
import { mostrarLogin } from './vistas/login.js';

/* ------------------------------------------------------------------ */
/* Registro de vistas                                                  */
/*   Para añadir una: una entrada aquí + js/vistas/<nombre>.js         */
/* ------------------------------------------------------------------ */
export const VISTAS = {
  inicio: { titulo: 'Inicio', icono: 'inicio', cargar: () => import('./vistas/inicio.js') },
  tiempos: { titulo: 'Tiempos', icono: 'tiempos', cargar: () => import('./vistas/tiempos.js') },
  agua: { titulo: 'Tests de agua', corto: 'Agua', icono: 'agua', cargar: () => import('./vistas/agua.js') },
  fuerza: { titulo: 'Fuerza', icono: 'fuerza', cargar: () => import('./vistas/fuerza.js') },
  mas: { titulo: 'Más', icono: 'mas', cargar: () => import('./vistas/mas.js') },
  cuerpo: { titulo: 'Cuerpo', icono: 'cuerpo', cargar: () => import('./vistas/cuerpo.js') },
  tecnica: { titulo: 'Técnica', icono: 'tecnica', cargar: () => import('./vistas/tecnica.js') },
  asistencia: { titulo: 'Asistencia', icono: 'asistencia', cargar: () => import('./vistas/asistencia.js') },
};
/** Orden de la barra inferior (móvil). */
export const NAV_INFERIOR = ['inicio', 'tiempos', 'agua', 'cuerpo', 'mas'];
/** Destinos agrupados bajo "Más". */
export const NAV_MAS = ['fuerza', 'tecnica', 'asistencia'];
/** Barra lateral (escritorio): todo en una lista. */
const NAV_LATERAL = ['inicio', 'tiempos', 'agua', 'cuerpo', 'fuerza', 'tecnica', 'asistencia'];

const raiz = document.getElementById('app');
let shell = null;           // referencias al DOM del shell
let vistaActual = null;     // { modulo, nombre }
let tokenRuta = 0;
let sesion = null;

/* ------------------------------------------------------------------ */
/* Tema                                                                */
/* ------------------------------------------------------------------ */
export function temaActual() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}
function aplicarTema(t) {
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = t === 'light' ? '#F3F6FC' : '#060A12';
  try { localStorage.setItem('portal.tema', t); } catch {}
  document.querySelectorAll('[data-accion="tema"]').forEach(pintarBotonTema);
}
export function alternarTema() {
  const h = document.documentElement;
  h.classList.add('tema-trans');
  aplicarTema(temaActual() === 'light' ? 'dark' : 'light');
  setTimeout(() => h.classList.remove('tema-trans'), 320);
}
function pintarBotonTema(b) {
  const claro = temaActual() === 'light';
  b.innerHTML = icono(claro ? 'luna' : 'sol', 22);
  b.setAttribute('aria-label', claro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
  b.title = claro ? 'Tema oscuro' : 'Tema claro';
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-accion="tema"]');
  if (b) alternarTema();
});
(() => { const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = temaActual() === 'light' ? '#F3F6FC' : '#060A12'; })();

/* ------------------------------------------------------------------ */
/* Enrutado                                                            */
/* ------------------------------------------------------------------ */
function leerHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [ruta, q] = h.split('?');
  const seg = ruta.split('/').filter(Boolean).map(decodeURIComponent);
  const params = Object.fromEntries(new URLSearchParams(q || ''));
  if (seg[0] === 'n' && seg[1]) return { nad: seg[1], vista: seg[2] || 'inicio', params };
  return { nad: null, vista: seg[0] || '', params };
}

export function navegar(hash) {
  if (location.hash === hash) ruta(); else location.hash = hash;
}
function reemplazar(hash) {
  history.replaceState(null, '', hash);
}

/** href de una vista para el nadador que se está viendo. */
function hrefVista(nombre, nadId) {
  return nadId ? `#/n/${encodeURIComponent(nadId)}/${nombre}` : `#/${nombre}`;
}

async function ruta() {
  const mi = ++tokenRuta;
  if (!sesion) { montarLogin(); return; }
  const esAdmin = sesion.rol === 'admin';
  let { nad, vista, params } = leerHash();

  // --- decide perfil y vista
  let perfilRef = null;
  let avisarNoEncontrado = false;
  if (!esAdmin) {
    perfilRef = sesion.perfiles[0];
    if (!perfilRef) { montarShell(); mostrarError('Tu cuenta no tiene un perfil asociado. Habla con tu entrenador.'); return; }
    if (nad || !vista || vista === 'login' || vista === 'nadadores' || !VISTAS[vista]) { reemplazar('#/inicio'); vista = 'inicio'; }
  } else {
    if (vista === 'nadadores' || (!nad && !vista)) { vista = 'nadadores'; }
    else if (!VISTAS[vista]) { navegar('#/nadadores'); return; }
    else if (!nad) {
      let ultimo = null;
      try { ultimo = sessionStorage.getItem('portal.nadador'); } catch {}
      if (ultimo && sesion.perfiles.some((p) => p.id === ultimo)) { reemplazar(hrefVista(vista, ultimo)); nad = ultimo; }
      else { navegar('#/nadadores'); return; }
    }
    if (nad) {
      perfilRef = sesion.perfiles.find((p) => p.id === nad);
      if (!perfilRef) {
        // ID inexistente: va al panel y lo avisa, en lugar de redirigir en silencio.
        reemplazar('#/nadadores');
        vista = 'nadadores'; nad = null; params = {};
        avisarNoEncontrado = true;
      } else {
        try { sessionStorage.setItem('portal.nadador', nad); } catch {}
      }
    }
  }

  montarShell();
  if (avisarNoEncontrado) aviso('No encontramos ese nadador. Elige uno de la lista.');
  const nombreVista = vista;
  const def = nombreVista === 'nadadores' ? { titulo: 'Nadadores' } : VISTAS[nombreVista];
  document.title = `${def.titulo} · Club Náutico`;
  actualizarNav(nombreVista, perfilRef, esAdmin);

  // destruir vista anterior
  if (vistaActual?.modulo?.destroy) { try { vistaActual.modulo.destroy(); } catch (e) { console.error(e); } }
  vistaActual = null;
  const main = shell.main;
  main.replaceChildren(skeletonVista());
  window.scrollTo(0, 0);

  const ctx = {
    sesion, esAdmin, params,
    perfilRef,
    nombreVista,
    navegar,
    hrefVista: (n) => hrefVista(n, esAdmin ? perfilRef?.id : null),
    setParams(obj) {
      const sp = new URLSearchParams(Object.entries({ ...ctx.params, ...obj }).filter(([, v]) => v != null && v !== ''));
      ctx.params = Object.fromEntries(sp);
      const base = nombreVista === 'nadadores' ? '#/nadadores' : hrefVista(nombreVista, esAdmin ? perfilRef.id : null);
      reemplazar(sp.toString() ? `${base}?${sp}` : base);
    },
    cerrarSesion,
    alternarTema,
    temaActual,
  };

  try {
    let modulo, perfil = null;
    if (nombreVista === 'nadadores') {
      modulo = await import('./vistas/admin.js');
    } else {
      [modulo, perfil] = await Promise.all([def.cargar(), Sesion.cargarPerfil(perfilRef)]);
    }
    if (mi !== tokenRuta) return;
    const cont = el('<div class="vista"></div>');
    main.replaceChildren(cont);
    vistaActual = { modulo, nombre: nombreVista };
    await modulo.render(cont, perfil, ctx);
    if (mi !== tokenRuta) return;
    main.focus({ preventScroll: true });
  } catch (e) {
    if (mi !== tokenRuta) return;
    console.error(e);
    const sinRed = e instanceof Sesion.ErrorRed;
    main.replaceChildren(el('<div class="vista"></div>'));
    main.firstChild.append(errorCaja(sinRed ? 'No pudimos cargar tus datos. Revisa tu conexión e intenta de nuevo.' : 'Algo salió mal al mostrar esta pantalla.', ruta));
  }
}

function mostrarError(msg) {
  shell.main.replaceChildren(el('<div class="vista"></div>'));
  shell.main.firstChild.append(errorCaja(msg));
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */
function logoMarca(tam = 28) {
  return `<svg class="marca-ico" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z"/><path d="M7.5 12c1.2-1.2 2.3-1.2 3.5 0s2.3 1.2 3.5 0 1.3-1.1 2-.6"/></svg>`;
}

function montarShell() {
  if (shell) return;
  raiz.replaceChildren();
  // Pantalla principal: admin -> lista de nadadores; nadador -> su resumen. Nunca toca la sesión.
  const hrefInicio = sesion.rol === 'admin' ? '#/nadadores' : '#/inicio';
  const r = el(`
    <div class="shell">
      <aside class="side" aria-label="Menú lateral">
        <a class="side-marca" data-inicio href="${hrefInicio}" aria-label="Ir al inicio del portal">${logoMarca(30)}<span><b>Club Náutico</b><span class="label">Portal del nadador</span></span></a>
        <div class="side-adm" data-slot="adm"></div>
        <nav class="side-nav" aria-label="Secciones"></nav>
        <div class="side-pie">
          <div class="side-usuario"><span class="avatar avatar-sm" style="--av:32px" aria-hidden="true">${esc(iniciales(sesion.nombre))}</span><span class="side-user-nombre">${esc(nombreLimpio(sesion.nombre))}</span></div>
          <div class="side-botones">
            <button type="button" class="icon-btn" data-accion="tema"></button>
            <button type="button" class="btn-lateral" data-accion="salir">${icono('salir', 20)}<span>Cerrar sesión</span></button>
          </div>
        </div>
      </aside>
      <div class="col">
        <header class="top">
          <div class="top-izq">
            <a class="top-marca" data-inicio href="${hrefInicio}" aria-label="Ir al inicio del portal">${logoMarca(26)}</a>
            <p class="top-titulo" data-slot="titulo"></p>
          </div>
          <button type="button" class="icon-btn" data-accion="tema"></button>
        </header>
        <div class="viewbar" data-slot="viewbar" hidden></div>
        <main id="contenido" tabindex="-1"></main>
      </div>
      <nav class="bottom" aria-label="Secciones"></nav>
    </div>`);
  raiz.append(r);
  shell = {
    r,
    main: r.querySelector('main'),
    side: r.querySelector('.side-nav'),
    adm: r.querySelector('[data-slot="adm"]'),
    bottom: r.querySelector('.bottom'),
    titulo: r.querySelector('[data-slot="titulo"]'),
    viewbar: r.querySelector('[data-slot="viewbar"]'),
  };
  r.querySelectorAll('[data-accion="tema"]').forEach(pintarBotonTema);
  r.querySelector('[data-accion="salir"]').addEventListener('click', cerrarSesion);
  r.querySelectorAll('[data-inicio]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); navegar(a.getAttribute('href')); }));
  r.dataset.rol = sesion.rol;
}

function itemNav(nombre, href, activo, clase) {
  const v = VISTAS[nombre];
  return `<a class="${clase}" href="${href}" ${activo ? 'aria-current="page"' : ''}>${icono(v.icono, 24)}<span>${esc(clase === 'bot-item' && v.corto ? v.corto : v.titulo)}</span></a>`;
}

function actualizarNav(nombre, perfilRef, esAdmin) {
  const nadId = esAdmin ? perfilRef?.id : null;
  const enNad = nombre === 'nadadores';
  shell.r.classList.toggle('sin-perfil', enNad);
  shell.titulo.textContent = enNad ? 'Nadadores' : VISTAS[nombre].titulo;
  const activoMas = NAV_MAS.includes(nombre) ? 'mas' : nombre;

  if (enNad) {
    shell.side.innerHTML = '';
    shell.bottom.innerHTML = '';
  } else {
    shell.side.innerHTML = NAV_LATERAL.map((n) => itemNav(n, hrefVista(n, nadId), n === nombre, 'side-item')).join('');
    shell.bottom.innerHTML = NAV_INFERIOR.map((n) => itemNav(n, hrefVista(n, nadId), n === activoMas, 'bot-item')).join('');
  }
  if (esAdmin) {
    shell.adm.innerHTML = `<a class="side-item side-item-adm" href="#/nadadores" ${enNad ? 'aria-current="page"' : ''}>${icono('usuarios', 24)}<span>Nadadores</span></a>`;
    shell.viewbar.hidden = enNad;
    if (!enNad) {
      shell.viewbar.innerHTML = `<span class="vb-txt"><span class="vb-ojo">${icono('ojo', 16)}</span>Viendo a <b>${esc(nombreLimpio(perfilRef.etiqueta))}</b></span><a class="vb-cambiar" href="#/nadadores">Cambiar nadador</a>`;
    }
  } else {
    shell.adm.innerHTML = '';
    shell.viewbar.hidden = true;
  }
  document.body.classList.toggle('con-viewbar', esAdmin && !enNad);
  shell.r.classList.toggle('con-nav', !enNad);
}

function cerrarSesion() {
  Sesion.cerrar();
  sesion = null;
  shell = null;
  vistaActual = null;
  document.body.classList.remove('con-viewbar');
  document.title = 'Portal del nadador · Club Náutico';
  history.replaceState(null, '', location.pathname + location.search);
  montarLogin();
}

function montarLogin(mensaje = '') {
  shell = null;
  document.body.classList.remove('con-viewbar');
  document.title = 'Ingresar · Club Náutico';
  mostrarLogin(raiz, {
    mensaje,
    async onExito(s) {
      sesion = s;
      const { vista } = leerHash();
      const destino = s.rol === 'admin' ? '#/nadadores' : (VISTAS[vista] ? location.hash : '#/inicio');
      if (location.hash === destino) ruta(); else location.hash = destino;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */
addEventListener('hashchange', () => { if (sesion) ruta(); });

(async function arrancar() {
  raiz.replaceChildren(el('<div class="arranque" role="status" aria-label="Cargando"><div class="arranque-pulso"></div></div>'));
  try {
    sesion = await Sesion.restaurar();
  } catch (e) {
    sesion = null;
    montarLogin('No pudimos reabrir tu sesión. Revisa tu conexión e ingresa de nuevo.');
    return;
  }
  if (sesion) ruta(); else montarLogin();
})();
