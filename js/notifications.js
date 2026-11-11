/**
 * notifications.js — Notificaciones del navegador (opcional).
 *
 * Todo está envuelto en try/catch: si el navegador no las soporta o el
 * permiso se deniega, la web sigue funcionando igual (el .ics es la vía
 * principal para recibir avisos).
 */

import { cuentaAtras } from './logic.js';

const CLAVE_ULTIMO_AVISO = 'calendarioRenta:ultimoAviso';

export const soportadas = () => typeof Notification !== 'undefined';

/** Pide permiso. Devuelve 'granted' | 'denied' | 'default' | 'unsupported'. */
export async function pedirPermiso() {
  if (!soportadas()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Muestra una única notificación al día resumiendo los hitos cercanos.
 * @param {object[]} pendientes Estados pendientes cercanos (ver logic.cercanos)
 * @param {string} hoyISO       Fecha de hoy "AAAA-MM-DD" (para no repetir en el mismo día)
 * @returns {boolean} true si se mostró
 */
export function avisarCercanos(pendientes, hoyISO) {
  if (!soportadas() || Notification.permission !== 'granted' || pendientes.length === 0) return false;
  try {
    if (localStorage.getItem(CLAVE_ULTIMO_AVISO) === hoyISO) return false;
    const cuerpo = pendientes
      .map((e) => `${e.hito.nombre}: ${cuentaAtras(e.dias).largo.toLowerCase()}`)
      .join('\n');
    new Notification('Calendario de la Renta', { body: cuerpo });
    localStorage.setItem(CLAVE_ULTIMO_AVISO, hoyISO);
    return true;
  } catch {
    return false; // p. ej. Chrome móvil exige Service Worker; no es crítico
  }
}
