// Ejecutar con: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  diaDeISO, nivelPorDias, cuentaAtras, construirEstados, proximoHito, vencidos, validarFechas,
} from '../js/logic.js';
import { generarICS, plegar } from '../js/ics.js';
import { normalizar, desdeJSON } from '../js/storage.js';

const fechas = validarFechas(JSON.parse(readFileSync(new URL('../fechas.json', import.meta.url))));
const anio = (ajustes = {}, hitos = {}) => ({ ajustes: { fraccionada: false, domiciliada: false, ...ajustes }, hitos });

test('semáforo: >15 verde, 7-15 ámbar, <7 rojo', () => {
  assert.equal(nivelPorDias(16), 'verde');
  assert.equal(nivelPorDias(15), 'ambar');
  assert.equal(nivelPorDias(7), 'ambar');
  assert.equal(nivelPorDias(6), 'rojo');
  assert.equal(nivelPorDias(-3), 'rojo');
});

test('cuenta atrás', () => {
  assert.equal(cuentaAtras(0).corto, 'Hoy');
  assert.equal(cuentaAtras(1).corto, 'Mañana');
  assert.equal(cuentaAtras(10).largo, 'Faltan 10 días');
  assert.equal(cuentaAtras(-2).largo, 'Venció hace 2 días');
});

test('fechas inválidas se rechazan', () => {
  assert.throws(() => diaDeISO('2027-02-30'));
  assert.throws(() => diaDeISO('30/06/2027'));
});

test('sin fraccionar se oculta el 2.º plazo y el 1.º pasa a 100 %', () => {
  const e = construirEstados(fechas, anio(), diaDeISO('2027-01-01'));
  assert.ok(!e.some((x) => x.hito.id === 'plazo2'));
  assert.match(e.find((x) => x.hito.id === 'plazo1').hito.nombre, /100/);
  const f = construirEstados(fechas, anio({ fraccionada: true }), diaDeISO('2027-01-01'));
  assert.ok(f.some((x) => x.hito.id === 'plazo2'));
});

test('orden cronológico, próximo hito y vencidos', () => {
  const hoy = diaDeISO('2027-05-10');
  const e = construirEstados(fechas, anio({ fraccionada: true }), hoy);
  const fs = e.map((x) => x.hito.fecha);
  assert.deepEqual(fs, [...fs].sort());
  assert.equal(proximoHito(e).hito.id, 'finDomiciliacion');
  assert.deepEqual(vencidos(e).map((x) => x.hito.id), ['inicio', 'telefono']);
  const marcados = construirEstados(fechas, anio({ fraccionada: true }, { inicio: { hecho: true }, telefono: { hecho: true } }), hoy);
  assert.equal(vencidos(marcados).length, 0);
});

test('domiciliada: fin de domiciliación cuenta como hecho y los pagos son cargo automático', () => {
  const e = construirEstados(fechas, anio({ fraccionada: true, domiciliada: true }), diaDeISO('2027-07-15'));
  assert.ok(e.find((x) => x.hito.id === 'finDomiciliacion').hecho);
  assert.ok(e.find((x) => x.hito.id === 'plazo2').cargoAutomatico);
});

test('ICS: 3 alarmas por evento, CRLF y líneas ≤ 75 octetos', () => {
  const e = construirEstados(fechas, anio({ fraccionada: true }), diaDeISO('2027-01-01'));
  const ics = generarICS(fechas, e, new Date('2026-11-11T20:00:00Z'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, e.length);
  assert.equal((ics.match(/BEGIN:VALARM/g) ?? []).length, e.length * 3);
  assert.ok(ics.includes('TRIGGER:-P13DT15H') && ics.includes('TRIGGER:-P6DT15H') && ics.includes('TRIGGER:-PT15H'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20270630') && ics.includes('DTEND;VALUE=DATE:20270701'));
  for (const l of ics.split('\r\n')) assert.ok(new TextEncoder().encode(l).length <= 75, l);
  assert.ok(!/[^\r]\n/.test(ics));
});

test('plegado no parte caracteres multibyte', () => {
  const largo = 'á'.repeat(100);
  assert.equal(plegar(largo).replaceAll('\r\n ', ''), largo);
});

test('storage: normalizar descarta basura; desdeJSON valida', () => {
  const n = normalizar({ tema: 'rosa', anios: { '2027': { ajustes: { fraccionada: 1 }, hitos: { '__proto__': {}, ok: { hecho: true, nota: 5 } } }, x: {} } });
  assert.equal(n.tema, 'auto');
  assert.deepEqual(Object.keys(n.anios), ['2027']);
  assert.equal(n.anios['2027'].ajustes.fraccionada, false);
  assert.deepEqual(Object.keys(n.anios['2027'].hitos), ['ok']);
  assert.equal(n.anios['2027'].hitos.ok.nota, '');
  assert.throws(() => desdeJSON('no json'));
  assert.throws(() => desdeJSON('{"a":1}'));
});
