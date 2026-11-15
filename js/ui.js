// Utilidades de interfaz reutilizables: elementos, chips, pestañas, estados vacíos/error/carga.
import { icono, rombo } from './iconos.js';
import { esc, fmtTiempo } from './formato.js';

export const reducirMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Crea un elemento a partir de HTML. */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function chipRP(corto = false) {
  return `<span class="chip-rp" ${corto ? 'title="Récord personal" aria-label="Récord personal"' : ''}>${rombo(8)}${corto ? 'RP' : 'RÉCORD PERSONAL'}</span>`;
}

/** Variación respecto a una marca anterior. delta > 0 = más rápido. */
export function variacion(delta, { largo = false } = {}) {
  if (delta == null) return '';
  if (Math.abs(delta) < 0.005) return `<span class="var var-igual">= igual</span>`;
  const d = Math.abs(delta);
  const txt = d >= 60 ? fmtTiempo(d) : d.toFixed(2);
  if (delta > 0) return `<span class="var var-ok">▲ ${txt}${largo ? ' s más rápido' : ''}</span>`;
  return `<span class="var var-mal">▼ ${txt}${largo ? ' s más lento' : ''}</span>`;
}

/** Cuenta de 0 al valor (solo la primera vez por sesión y clave). El texto final ya está en el HTML. */
export function animarTiempo(nodo, segundos, clave) {
  if (reducirMovimiento()) return;
  try {
    if (sessionStorage.getItem('portal.cuenta.' + clave)) return;
    sessionStorage.setItem('portal.cuenta.' + clave, '1');
  } catch {}
  const final = nodo.textContent;
  const t0 = performance.now(), dur = 900;
  const paso = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 4);
    nodo.textContent = k < 1 ? fmtTiempo(segundos * e) : final;
    if (k < 1 && nodo.isConnected) requestAnimationFrame(paso);
    else nodo.textContent = final;
  };
  requestAnimationFrame(paso);
}

/* ---------- Estados ---------- */
export function vacio({ titulo, texto = '', accion = null, icon = 'boya' }) {
  const n = el(`<div class="vacio">${icono(icon, 64, 'vacio-ico')}<h3>${esc(titulo)}</h3>${texto ? `<p>${esc(texto)}</p>` : ''}${accion ? `<button type="button" class="btn btn-sec">${esc(accion.texto)}</button>` : ''}</div>`);
  if (accion) n.querySelector('button').addEventListener('click', accion.onClick);
  return n;
}

export function errorCaja(mensaje, onRetry) {
  const n = el(`<div class="error-caja" role="alert">${icono('alerta', 24)}<div><p>${esc(mensaje)}</p>${onRetry ? '<button type="button" class="btn btn-sec">Reintentar</button>' : ''}</div></div>`);
  if (onRetry) n.querySelector('button').addEventListener('click', onRetry);
  return n;
}

export function skeletonVista(tipo = 'general') {
  const filas = Array.from({ length: 4 }, () => '<div class="sk sk-fila"></div>').join('');
  if (tipo === 'grafico') return el(`<div class="sk-wrap" aria-hidden="true"><div class="sk sk-titulo"></div><div class="sk sk-grafico"></div>${filas}</div>`);
  return el(`<div class="sk-wrap" aria-busy="true"><span class="sr-only" role="status">Cargando tus datos…</span><div class="sk sk-titulo"></div><div class="sk sk-tarjeta"></div><div class="sk sk-tarjeta"></div>${filas}<p class="sk-texto" aria-hidden="true">Cargando tus datos…</p></div>`);
}

/* ---------- Pista de desplazamiento horizontal ---------- */
/**
 * Fila que se desliza en horizontal: desvanece el borde hacia donde hay más contenido
 * (clases pista-izq / pista-der según la posición; el CSS está en componentes.css).
 * Devuelve { actualizar(), mostrarActivo(suave) }.
 */
export function pistaScroll(host) {
  if (!host) return null;
  if (host._pista) return host._pista;
  host.classList.add('pista-x');
  const actualizar = () => {
    const max = host.scrollWidth - host.clientWidth;
    host.classList.toggle('pista-izq', max > 2 && host.scrollLeft > 2);
    host.classList.toggle('pista-der', max > 2 && host.scrollLeft < max - 2);
  };
  /** Lleva el elemento activo a la vista. suave=true: scrollIntoView (al cambiar); false: sin tocar la página (al pintar). */
  const mostrarActivo = (suave = true) => {
    const a = host.querySelector('[aria-checked="true"], [aria-selected="true"], [aria-current="true"]');
    if (!a || host.scrollWidth <= host.clientWidth) { actualizar(); return; }
    if (suave) a.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reducirMovimiento() ? 'auto' : 'smooth' });
    else {
      const x0 = a.getBoundingClientRect().left - host.getBoundingClientRect().left + host.scrollLeft, x1 = x0 + a.offsetWidth;
      if (x1 > host.scrollLeft + host.clientWidth - 24) host.scrollLeft = x1 - host.clientWidth + 24;
      else if (x0 < host.scrollLeft + 24) host.scrollLeft = Math.max(0, x0 - 24);
    }
    actualizar();
  };
  host.addEventListener('scroll', actualizar, { passive: true });
  new ResizeObserver(actualizar).observe(host);
  new MutationObserver(actualizar).observe(host, { childList: true });
  document.fonts?.ready.then(actualizar);
  requestAnimationFrame(actualizar);
  return (host._pista = { actualizar, mostrarActivo });
}

/* ---------- Aviso breve (toast) ---------- */
/** Aviso accesible (role=status) que se cierra solo o con el botón. Se pausa con el puntero o el foco. */
export function aviso(texto, { duracion = 7000 } = {}) {
  let zona = document.getElementById('avisos');
  const nueva = !zona;
  zona?.querySelectorAll('.aviso').forEach((x) => { if (x.querySelector('p').textContent === texto) x.remove(); }); // sin avisos repetidos
  if (nueva) {
    zona = el('<div id="avisos" class="avisos" role="status" aria-live="polite"></div>');
    document.body.append(zona);
  }
  const n = el(`<div class="aviso">${icono('alerta', 20, 'aviso-ico')}<p>${esc(texto)}</p><button type="button" class="icon-btn aviso-x" aria-label="Cerrar aviso">${icono('cerrar', 18)}</button></div>`);
  let t = null;
  const cerrar = () => {
    clearTimeout(t);
    if (!n.isConnected) return;
    if (reducirMovimiento()) { n.remove(); return; }
    n.classList.add('saliendo');
    setTimeout(() => n.remove(), 220);
  };
  const armar = () => { clearTimeout(t); t = setTimeout(cerrar, duracion); };
  n.querySelector('button').addEventListener('click', cerrar);
  n.addEventListener('pointerenter', () => clearTimeout(t));
  n.addEventListener('pointerleave', armar);
  n.addEventListener('focusin', () => clearTimeout(t));
  n.addEventListener('focusout', armar);
  // la región en vivo recién creada necesita un instante para que se anuncie el contenido
  setTimeout(() => { zona.append(n); armar(); }, nueva ? 80 : 0);
  return cerrar;
}

/* ---------- Grupo de opciones (chips / segmentado) con flechas ---------- */
/**
 * items: [{valor, etiqueta, deshabilitado?, titulo?}]
 * Devuelve { set(valor), setItems(items), el }
 */
export function grupoRadio(host, { items, valor, onChange, aria, variante = 'chips' }) {
  host.classList.add(variante === 'seg' ? 'seg' : 'chips');
  host.setAttribute('role', 'radiogroup');
  host.setAttribute('aria-label', aria);
  let actual = valor;
  let lista = items;
  const scroller = variante === 'seg' ? host.closest('.seg-wrap') : host;
  const pista = scroller ? pistaScroll(scroller) : null;

  function pintar() {
    host.innerHTML = lista.map((it) => {
      const sel = it.valor === actual;
      return `<button type="button" role="radio" class="${variante === 'seg' ? 'seg-op' : 'chip'}" data-v="${esc(it.valor)}" aria-checked="${sel}" ${it.deshabilitado ? 'aria-disabled="true"' : ''} tabindex="${sel ? 0 : -1}" ${it.titulo ? `title="${esc(it.titulo)}"` : ''}>${esc(it.etiqueta)}</button>`;
    }).join('');
    if (!lista.some((i) => i.valor === actual)) { const f = host.querySelector('button'); if (f) f.tabIndex = 0; }
  }
  pintar();
  requestAnimationFrame(() => pista?.mostrarActivo(false));

  function elegir(v, enfocar) {
    const it = lista.find((i) => i.valor === v);
    if (!it || it.deshabilitado) return;
    if (v !== actual) { actual = v; pintar(); pista?.mostrarActivo(true); onChange(v); }
    if (enfocar) host.querySelector(`[data-v="${CSS.escape(v)}"]`)?.focus();
  }
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (b) elegir(b.dataset.v, false);
  });
  host.addEventListener('keydown', (e) => {
    const habil = lista.filter((i) => !i.deshabilitado);
    const idx = habil.findIndex((i) => i.valor === actual);
    let n = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (idx + 1) % habil.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (idx - 1 + habil.length) % habil.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = habil.length - 1;
    if (n >= 0 && habil.length) { e.preventDefault(); elegir(habil[n].valor, true); }
  });
  return {
    el: host,
    set(v) { if (v !== actual) { actual = v; pintar(); pista?.mostrarActivo(true); } },
    setItems(its, v = actual) { lista = its; actual = v; pintar(); pista?.mostrarActivo(true); },
  };
}

/* ---------- Pestañas con subrayado deslizante ---------- */
export function pestanas(host, { items, valor, onChange, aria, idPanel }) {
  host.classList.add('tabs');
  host.setAttribute('role', 'tablist');
  host.setAttribute('aria-label', aria);
  let actual = valor;
  host.innerHTML = items.map((it) => `<button type="button" role="tab" class="tab" id="tab-${it.valor}" data-v="${it.valor}" aria-selected="${it.valor === actual}" aria-controls="${idPanel}" tabindex="${it.valor === actual ? 0 : -1}">${esc(it.etiqueta)}</button>`).join('') + '<span class="tab-linea" aria-hidden="true"></span>';
  const linea = host.querySelector('.tab-linea');
  const pista = pistaScroll(host);

  function mover(animar) {
    const b = host.querySelector(`[data-v="${actual}"]`);
    if (!b) return;
    linea.style.transition = animar && !reducirMovimiento() ? '' : 'none';
    linea.style.transform = `translateX(${b.offsetLeft}px) scaleX(${b.offsetWidth})`;
  }
  function elegir(v, enfocar) {
    if (v !== actual) {
      actual = v;
      host.querySelectorAll('.tab').forEach((t) => { const s = t.dataset.v === v; t.setAttribute('aria-selected', s); t.tabIndex = s ? 0 : -1; });
      mover(true);
      pista.mostrarActivo(true);
      onChange(v);
    }
    if (enfocar) host.querySelector(`[data-v="${v}"]`).focus();
  }
  host.addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) elegir(b.dataset.v, false); });
  host.addEventListener('keydown', (e) => {
    const i = items.findIndex((x) => x.valor === actual);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = items.length - 1;
    if (n >= 0) { e.preventDefault(); elegir(items[n].valor, true); }
  });
  requestAnimationFrame(() => { mover(false); pista.mostrarActivo(false); });
  const ro = new ResizeObserver(() => mover(false));
  ro.observe(host);
  document.fonts?.ready.then(() => mover(false));
  return { set(v) { actual = v; host.querySelectorAll('.tab').forEach((t) => { const s = t.dataset.v === v; t.setAttribute('aria-selected', s); t.tabIndex = s ? 0 : -1; }); mover(false); pista.mostrarActivo(true); }, destroy() { ro.disconnect(); } };
}

/** Avatar con iniciales. */
export function avatar(iniciales, tam = 64) {
  return `<span class="avatar" style="--av:${tam}px" aria-hidden="true">${esc(iniciales)}</span>`;
}

/** Almacén local seguro. */
export const guardado = {
  leer(k, def = null) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  poner(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/** Entra al viewport una vez: añade clase .reveal-in (escalonado). */
export function entrada(nodos) {
  if (reducirMovimiento()) return;
  nodos.forEach((n, i) => {
    if (i > 3) return;
    n.style.animation = `entra var(--dur-slow) var(--ease-out) ${i * 40}ms both`;
  });
}
