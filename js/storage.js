/**
 * storage.js — Persistencia en localStorage + copia de seguridad JSON.
 *
 * Forma de los datos guardados (versión 1):
 * {
 *   version: 1,
 *   tema: 'auto' | 'claro' | 'oscuro',
 *   avisos: boolean,                       // notificaciones del navegador
 *   anios: {                               // un bloque por campaña, así cada año empieza limpio
 *     "2027": {
 *       ajustes: { fraccionada, domiciliada },
 *       hitos:   { [idHito]: { hecho, nota, importe } }
 *     }
 *   }
 * }
 */

const CLAVE = 'calendarioRenta:v1';
const VERSION = 1;
const TEMAS = ['auto', 'claro', 'oscuro'];
const ID_PROHIBIDOS = new Set(['__proto__', 'constructor', 'prototype']);

export const HITO_VACIO = Object.freeze({ hecho: false, nota: '', importe: '' });

export function estadoVacio() {
  return { version: VERSION, tema: 'auto', avisos: false, anios: {} };
}

/**
 * Sanea cualquier objeto (de localStorage o de un archivo importado) y devuelve
 * un estado válido. Descarta campos desconocidos y limita tamaños.
 */
export function normalizar(bruto) {
  const estado = estadoVacio();
  if (!bruto || typeof bruto !== 'object') return estado;

  if (TEMAS.includes(bruto.tema)) estado.tema = bruto.tema;
  estado.avisos = bruto.avisos === true;

  for (const [anio, datos] of Object.entries(bruto.anios ?? {})) {
    if (!/^\d{4}$/.test(anio) || !datos || typeof datos !== 'object') continue;
    const limpio = {
      ajustes: {
        fraccionada: datos.ajustes?.fraccionada === true,
        domiciliada: datos.ajustes?.domiciliada === true,
      },
      hitos: {},
    };
    for (const [id, h] of Object.entries(datos.hitos ?? {})) {
      if (!/^[\w-]{1,64}$/.test(id) || ID_PROHIBIDOS.has(id) || !h || typeof h !== 'object') continue;
      limpio.hitos[id] = {
        hecho: h.hecho === true,
        nota: typeof h.nota === 'string' ? h.nota.slice(0, 2000) : '',
        importe: typeof h.importe === 'string' ? h.importe.slice(0, 20) : '',
      };
    }
    estado.anios[anio] = limpio;
  }
  return estado;
}

/** Lee el estado guardado. Si no hay nada o está corrupto, devuelve uno vacío. */
export function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    return crudo ? normalizar(JSON.parse(crudo)) : estadoVacio();
  } catch {
    return estadoVacio(); // localStorage bloqueado o JSON roto
  }
}

/** Guarda el estado. Devuelve false si el navegador no lo permite. */
export function guardar(estado) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado));
    return true;
  } catch {
    return false;
  }
}

/** Bloque de datos de una campaña (lo crea si no existe). */
export function datosAnio(estado, campana) {
  return (estado.anios[String(campana)] ??= {
    ajustes: { fraccionada: false, domiciliada: false },
    hitos: {},
  });
}

/** Progreso de un hito para escribir (lo crea si no existe). */
export function datosHito(anio, id) {
  return (anio.hitos[id] ??= { ...HITO_VACIO });
}

/** Serializa el estado para la copia de seguridad. */
export function aJSON(estado, ahora = new Date()) {
  return JSON.stringify({ ...estado, exportadoEl: ahora.toISOString() }, null, 2);
}

/**
 * Interpreta el texto de un archivo de copia de seguridad.
 * Lanza un Error con mensaje en español si no es válido.
 */
export function desdeJSON(texto) {
  let obj;
  try {
    obj = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  if (!obj || typeof obj !== 'object' || obj.version !== VERSION || typeof obj.anios !== 'object') {
    throw new Error('El archivo no parece una copia de seguridad de Calendario de la Renta.');
  }
  return normalizar(obj);
}
