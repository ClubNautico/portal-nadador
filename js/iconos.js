// Iconos SVG en línea, un solo estilo (trazo 1.75, esquinas redondeadas, sin relleno).
const P = {
  inicio: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  tiempos: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 3h5M12 3v3M18.5 7l1.2-1.2"/>',
  agua: '<path d="M3 8c1.5 0 1.5-1.5 3-1.5S7.5 8 9 8s1.5-1.5 3-1.5S13.5 8 15 8s1.5-1.5 3-1.5S19.5 8 21 8"/><path d="M3 13c1.5 0 1.5-1.5 3-1.5S7.5 13 9 13s1.5-1.5 3-1.5S13.5 13 15 13s1.5-1.5 3-1.5S19.5 13 21 13"/><path d="M3 18c1.5 0 1.5-1.5 3-1.5S7.5 18 9 18s1.5-1.5 3-1.5S13.5 18 15 18s1.5-1.5 3-1.5S19.5 18 21 18"/>',
  fuerza: '<path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11"/>',
  mas: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  cuerpo: '<circle cx="12" cy="5" r="2.5"/><path d="M12 8v7M6.5 10.5 12 8l5.5 2.5M9.5 21.5 12 15l2.5 6.5"/>',
  tecnica: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  asistencia: '<rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M9 15l2 2 4-4"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  luna: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  salir: '<path d="M15 12H4.5M8 8.5 4.5 12 8 15.5"/><path d="M11 4h6.5A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5H11"/>',
  buscar: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  ojo: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  'ojo-off': '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/><path d="m4 4 16 16"/>',
  alerta: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
  'chev-abajo': '<path d="m6 9 6 6 6-6"/>',
  'chev-der': '<path d="m9 6 6 6-6 6"/>',
  'chev-izq': '<path d="m15 6-6 6 6 6"/>',
  cerrar: '<path d="m6 6 12 12M18 6 6 18"/>',
  usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3-5.5 6.5-5.5s6 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .6 3.2 2.4 3.5 5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  refrescar: '<path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v4h-4"/>',
  boya: '<path d="M3 17c1.5 0 1.5-1.5 3-1.5S7.5 17 9 17s1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/><circle cx="12" cy="9" r="3.5"/><path d="M12 5.5V3M12 12.5v3"/>',
  obra: '<path d="m14.5 6.5 3 3-9.5 9.5H5v-3z"/><path d="m13 8 3 3M16.5 4.5l3 3"/>',
  carril: '<path d="M3 7h18M3 12h18M3 17h18"/>',
  linea: '<path d="M7 3.5v17"/><circle cx="7" cy="7" r="2"/><circle cx="7" cy="17" r="2"/><path d="M12.5 7H20M12.5 17H18"/>',
  comparar: '<path d="M7 20V9M12 20V4M17 20v-8"/><path d="M4 20h16"/>',
  postas: '<circle cx="5.5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="18.5" cy="12" r="2.2"/><path d="M7.7 12h2.1M14.2 12h2.1"/>',
  medalla: '<circle cx="12" cy="14.5" r="5.5"/><path d="M8.5 3.5 10.5 9.5M15.5 3.5 13.5 9.5M12 12v5"/>',
};

/** Devuelve el <svg> como cadena. */
export function icono(nombre, tam = 24, extra = '') {
  const d = P[nombre] || '';
  return `<svg class="ico ${extra}" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
}

/** Rombo relleno (marca de récord personal). */
export function rombo(tam = 8) {
  return `<svg class="ico" width="${tam}" height="${tam}" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M5 0.5 9.5 5 5 9.5 0.5 5z" fill="currentColor"/></svg>`;
}

export const hayIcono = (n) => n in P;
