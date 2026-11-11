/**
 * logic.js — Lógica pura (sin DOM ni localStorage) para poder probarla con Node.
 *
 * Las fechas se tratan como "número de día" (días desde 1970-01-01 en UTC).
 * Así la diferencia entre dos fechas es un entero exacto y no depende de
 * horarios de verano ni de la zona horaria.
 */

const MS_DIA = 86_400_000;

/** Umbrales del semáforo, en días. */
export const UMBRAL_ROJO = 7;   // < 7 días (o vencido) → rojo
export const UMBRAL_AMBAR = 15; // 7..15 días → ámbar; > 15 → verde

/** Convierte "AAAA-MM-DD" en número de día. Lanza error si no es una fecha real. */
export function diaDeISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) throw new Error(`Fecha no válida: "${iso}" (usa AAAA-MM-DD)`);
  const [a, mes, d] = m.slice(1).map(Number);
  const ms = Date.UTC(a, mes - 1, d);
  const f = new Date(ms);
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) {
    throw new Error(`Fecha inexistente: "${iso}"`);
  }
  return ms / MS_DIA;
}

/** Número de día de "hoy" según el calendario local del usuario. */
export function diaDeHoy(fecha = new Date()) {
  return Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()) / MS_DIA;
}

/** Número de día → "AAAA-MM-DD". */
export function isoDeDia(dia) {
  return new Date(dia * MS_DIA).toISOString().slice(0, 10);
}

/** "2027-06-30" → "miércoles, 30 de junio de 2027". */
export function formatearFecha(iso) {
  const fecha = new Date(diaDeISO(iso) * MS_DIA);
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(fecha);
}

/** Valida la estructura de fechas.json. Lanza un Error con un mensaje útil. */
export function validarFechas(datos) {
  if (!datos || typeof datos !== 'object') throw new Error('fechas.json no es un objeto');
  if (!Number.isInteger(datos.campana)) throw new Error('Falta "campana" (año, p. ej. 2027)');
  if (!Array.isArray(datos.hitos) || datos.hitos.length === 0) throw new Error('Falta la lista "hitos"');
  const ids = new Set();
  for (const h of datos.hitos) {
    if (!h || typeof h.id !== 'string' || !h.id) throw new Error('Un hito no tiene "id"');
    if (ids.has(h.id)) throw new Error(`Id de hito repetido: ${h.id}`);
    ids.add(h.id);
    if (typeof h.nombre !== 'string') throw new Error(`El hito ${h.id} no tiene "nombre"`);
    diaDeISO(h.fecha); // lanza si la fecha no es válida
  }
  return datos;
}

/**
 * Semáforo de un hito pendiente a partir de los días que faltan.
 * Verde > 15 · Ámbar 7–15 · Rojo < 7 (incluye vencidos).
 */
export function nivelPorDias(dias) {
  if (dias < UMBRAL_ROJO) return 'rojo';
  if (dias <= UMBRAL_AMBAR) return 'ambar';
  return 'verde';
}

/** Textos de la cuenta atrás: `corto` para el número grande, `largo` para frases. */
export function cuentaAtras(dias) {
  if (dias > 1) return { corto: `${dias} días`, largo: `Faltan ${dias} días` };
  if (dias === 1) return { corto: 'Mañana', largo: 'Es mañana' };
  if (dias === 0) return { corto: 'Hoy', largo: 'Es hoy' };
  if (dias === -1) return { corto: 'Ayer', largo: 'Venció ayer' };
  return { corto: `Hace ${-dias} días`, largo: `Venció hace ${-dias} días` };
}

/**
 * Calcula el estado de un hito.
 * @param {object} hito       Hito ya resuelto (ver construirEstados)
 * @param {object} [progreso] {hecho, nota, importe} guardado por el usuario
 * @param {object} ajustes    {fraccionada, domiciliada}
 * @param {number} hoy        Número de día de hoy
 */
export function estadoHito(hito, progreso, ajustes, hoy) {
  const dias = diaDeISO(hito.fecha) - hoy;
  // Si ya domicilié, el "fin de domiciliación" no requiere ninguna acción mía.
  const automatico = Boolean(hito.autoHechoSiDomiciliada && ajustes.domiciliada);
  const hecho = Boolean(progreso?.hecho) || automatico;
  return {
    hito,
    dias,
    hecho,
    automatico,
    cargoAutomatico: Boolean(hito.pago && ajustes.domiciliada),
    vencido: !hecho && dias < 0,
    nivel: hecho ? 'hecho' : nivelPorDias(dias),
  };
}

/**
 * Lista de estados en orden cronológico, respetando los ajustes:
 *  - sin fraccionar se oculta lo marcado "soloFraccionada" (2.º plazo)
 *  - sin fraccionar el 1.er plazo pasa a ser "pago del 100 %" (campo "sinFraccionar")
 */
export function construirEstados(fechas, anio, hoy) {
  const ajustes = anio.ajustes;
  return fechas.hitos
    .filter((h) => ajustes.fraccionada || !h.soloFraccionada)
    .map((h) => (!ajustes.fraccionada && h.sinFraccionar ? { ...h, ...h.sinFraccionar } : h))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)) // estable
    .map((h) => estadoHito(h, anio.hitos[h.id], ajustes, hoy));
}

/** Primer hito pendiente que aún no ha vencido. */
export function proximoHito(estados) {
  return estados.find((e) => !e.hecho && e.dias >= 0) ?? null;
}

/** Hitos vencidos y sin marcar como hechos. */
export function vencidos(estados) {
  return estados.filter((e) => e.vencido);
}

/** Pendientes que vencen en `umbral` días o menos (incluye vencidos). */
export function cercanos(estados, umbral = UMBRAL_ROJO) {
  return estados.filter((e) => !e.hecho && e.dias <= umbral);
}
