/**
 * ics.js — Genera un calendario iCalendar (.ics) con los hitos.
 *
 * Cada hito es un evento de día completo con 3 alarmas (14, 7 y 1 día antes)
 * que suenan a las 09:00. Para un evento de día completo el origen del
 * disparador es las 00:00, así que "14 días antes a las 09:00" se expresa como
 * -P13DT15H (14 días menos 9 horas).
 *
 * El UID es estable, de modo que reimportar el archivo actualiza los eventos
 * en lugar de duplicarlos (en la mayoría de apps de calendario).
 */

import { diaDeISO, isoDeDia } from './logic.js';

const CRLF = '\r\n';
const encoder = new TextEncoder();

/** Alarmas: [días antes, TRIGGER relativo a las 00:00 del día del evento → 09:00]. */
const ALARMAS = [
  [14, '-P13DT15H'],
  [7, '-P6DT15H'],
  [1, '-PT15H'],
];

/** Escapa texto según RFC 5545. */
export function escapar(texto) {
  return String(texto)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Pliega una línea a un máximo de 75 octetos UTF-8 (sin partir caracteres). */
export function plegar(linea) {
  if (encoder.encode(linea).length <= 75) return linea;
  const partes = [];
  let actual = '';
  let bytes = 0;
  let limite = 75;
  for (const caracter of linea) {
    const n = encoder.encode(caracter).length;
    if (bytes + n > limite) {
      partes.push(actual);
      actual = '';
      bytes = 0;
      limite = 74; // las continuaciones empiezan por un espacio
    }
    actual += caracter;
    bytes += n;
  }
  partes.push(actual);
  return partes.join(CRLF + ' ');
}

/** "2027-06-30" → "20270630". */
const fechaICS = (iso) => iso.replaceAll('-', '');

/** Marca de tiempo UTC "20261111T201500Z". */
const marcaICS = (fecha) => fecha.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * @param {object} fechas   Contenido de fechas.json
 * @param {object[]} estados Estados visibles (resultado de construirEstados)
 * @param {Date} [ahora]
 * @returns {string} Contenido del archivo .ics
 */
export function generarICS(fechas, estados, ahora = new Date()) {
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calendario de la Renta//ES',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapar(`Renta ${fechas.campana}`)}`,
  ];

  for (const { hito, cargoAutomatico } of estados) {
    const partes = [hito.descripcion ?? ''];
    if (cargoAutomatico) partes.push('Cargo automático: ten saldo en la cuenta ese día.');
    if (hito.estimada) partes.push('Fecha estimada: verifícala en la web de la Agencia Tributaria.');
    else partes.push('Verifica la fecha en la web de la Agencia Tributaria.');

    lineas.push(
      'BEGIN:VEVENT',
      `UID:renta-${fechas.campana}-${hito.id}@calendario-renta`,
      `DTSTAMP:${marcaICS(ahora)}`,
      `DTSTART;VALUE=DATE:${fechaICS(hito.fecha)}`,
      `DTEND;VALUE=DATE:${fechaICS(isoDeDia(diaDeISO(hito.fecha) + 1))}`,
      `SUMMARY:${escapar(`Renta: ${hito.nombre}${hito.estimada ? ' (fecha estimada)' : ''}`)}`,
      `DESCRIPTION:${escapar(partes.filter(Boolean).join('\n'))}`,
      'TRANSP:TRANSPARENT',
    );
    for (const [dias, disparador] of ALARMAS) {
      lineas.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapar(`${hito.nombre}: ${dias === 1 ? 'falta 1 día' : `faltan ${dias} días`}`)}`,
        `TRIGGER:${disparador}`,
        'END:VALARM',
      );
    }
    lineas.push('END:VEVENT');
  }

  lineas.push('END:VCALENDAR');
  return lineas.map(plegar).join(CRLF) + CRLF;
}
