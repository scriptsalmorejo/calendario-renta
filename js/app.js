/**
 * app.js — Interfaz: carga datos, pinta la página y gestiona los eventos.
 * La lógica de fechas está en logic.js; la persistencia en storage.js.
 */

import {
  construirEstados, proximoHito, vencidos, cercanos, cuentaAtras,
  diaDeHoy, isoDeDia, formatearFecha, validarFechas,
} from './logic.js';
import {
  cargar, guardar, datosAnio, datosHito, aJSON, desdeJSON, HITO_VACIO,
} from './storage.js';
import { generarICS } from './ics.js';
import { pedirPermiso, avisarCercanos, soportadas } from './notifications.js';

const $ = (selector) => document.querySelector(selector);
const TEMAS = ['auto', 'claro', 'oscuro'];
const ETIQUETA_TEMA = { auto: '🌓 Tema: auto', claro: '☀️ Tema: claro', oscuro: '🌙 Tema: oscuro' };

let fechas;                  // contenido de fechas.json
let estado;                  // datos del usuario (localStorage)
let estados = [];            // hitos visibles con su estado calculado
const abiertos = new Set();  // ids de tarjetas con «Notas» desplegadas (sobreviven a re-render)

/** Escapa HTML: las notas del usuario y los textos del JSON nunca se insertan en crudo. */
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// ---------------------------------------------------------------- arranque

async function iniciar() {
  estado = cargar();
  aplicarTema();
  $('#btn-tema').addEventListener('click', cambiarTema);

  try {
    const resp = await fetch('fechas.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    fechas = validarFechas(await resp.json());
  } catch (error) {
    mostrarErrorDeCarga(error);
    return;
  }

  enlazarEventos();
  render();

  // Notificaciones opcionales al abrir
  if (estado.avisos) {
    avisarCercanos(cercanos(estados), isoDeDia(diaDeHoy()));
  }
  // Si la pestaña queda abierta de un día para otro, se recalcula al volver
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
}

function mostrarErrorDeCarga(error) {
  $('#subtitulo').textContent = 'No se pudieron cargar las fechas';
  $('#proximo').innerHTML = `
    <p><strong>Error al leer fechas.json:</strong> ${esc(error.message)}</p>
    <p class="ayuda">Si abriste index.html con doble clic, el navegador bloquea la lectura del archivo.
    Ejecútalo con un servidor local (mira el README), por ejemplo: <code>python3 -m http.server</code></p>`;
  $('#btn-ics').disabled = true;
}

// ----------------------------------------------------------------- render

function render() {
  const anio = datosAnio(estado, fechas.campana);
  estados = construirEstados(fechas, anio, diaDeHoy());

  $('#subtitulo').textContent =
    `Campaña ${fechas.campana}` + (fechas.ejercicio ? ` · ejercicio ${fechas.ejercicio}` : '');
  $('#aviso-estimadas').hidden = !estados.some((e) => e.hito.estimada);

  renderAvisoVencidos();
  renderProximo();
  $('#lista').innerHTML = estados.map(tarjeta).join('');

  $('#aj-fraccionada').checked = anio.ajustes.fraccionada;
  $('#aj-domiciliada').checked = anio.ajustes.domiciliada;
  $('#aj-ayuda-domiciliada').hidden = !anio.ajustes.domiciliada;
  $('#aj-avisos').checked = estado.avisos;
}

function renderAvisoVencidos() {
  const caja = $('#aviso-vencido');
  const lista = vencidos(estados);
  caja.hidden = lista.length === 0;
  if (lista.length === 0) return;
  caja.innerHTML = `
    <strong>⚠️ ${lista.length === 1 ? 'Tienes un hito vencido' : `Tienes ${lista.length} hitos vencidos`} sin marcar como hecho</strong>
    <ul>${lista.map((e) => `<li>${esc(e.hito.nombre)} — ${esc(cuentaAtras(e.dias).largo.toLowerCase())}</li>`).join('')}</ul>
    <p>Si ya lo hiciste, márcalo como hecho. Si no, revisa tu situación en la sede de la AEAT.</p>
    <a class="btn" href="${esc(fechas.sedeUrl || 'https://sede.agenciatributaria.gob.es/')}" target="_blank" rel="noopener noreferrer">
      Ir a la sede electrónica de la AEAT</a>`;
}

function renderProximo() {
  const caja = $('#proximo');
  const proximo = proximoHito(estados);
  caja.className = 'proximo' + (proximo ? ` proximo--${proximo.nivel}` : '');
  if (!proximo) {
    const todoHecho = estados.every((e) => e.hecho);
    caja.innerHTML = `<h2 id="t-proximo" class="proximo__nombre">${todoHecho ? '¡Todo al día! 🎉' : 'Sin próximos hitos'}</h2>
      <p class="proximo__fecha">${todoHecho ? 'No te queda ningún hito pendiente en esta campaña.' : 'No quedan fechas futuras; revisa los hitos vencidos.'}</p>`;
    return;
  }
  const { hito, dias } = proximo;
  caja.innerHTML = `
    <h2 id="t-proximo" class="proximo__etq">Próximo hito</h2>
    <p class="proximo__cuenta">${esc(cuentaAtras(dias).corto)}</p>
    <p class="proximo__nombre">${esc(hito.nombre)}</p>
    <p class="proximo__fecha">${esc(formatearFecha(hito.fecha))}</p>
    ${proximo.cargoAutomatico ? '<p class="hito__auto">🏦 Cargo automático: ten saldo en la cuenta ese día.</p>' : ''}`;
}

/** HTML de una tarjeta de hito. */
function tarjeta(e) {
  const { hito, dias, hecho, nivel, automatico, cargoAutomatico } = e;
  const prog = datosAnio(estado, fechas.campana).hitos[hito.id] ?? HITO_VACIO;
  const palabraHecho = hito.pago ? 'Pagado' : 'Hecho';
  const urgencia = { rojo: 'alta', ambar: 'media', verde: 'baja' }[nivel];

  const insignia = automatico ? 'Domiciliada'
    : hecho ? palabraHecho
    : cuentaAtras(dias).corto;

  return `
  <li class="hito hito--${nivel}" data-id="${esc(hito.id)}">
    <div class="hito__cab">
      <div>
        <h3 class="hito__nombre">${esc(hito.nombre)}</h3>
        <p class="hito__fecha"><time datetime="${esc(hito.fecha)}">${esc(formatearFecha(hito.fecha))}</time>
          ${hito.estimada ? '<span class="etiqueta">estimada</span>' : ''}</p>
      </div>
      <span class="insignia insignia--${nivel}">${urgencia && !hecho ? `<span class="sr-only">Urgencia ${urgencia}: </span>` : ''}${esc(insignia)}</span>
    </div>
    <p class="hito__desc">${esc(hito.descripcion)}</p>
    ${automatico ? '<p class="hito__auto">✅ Al estar domiciliada, no tienes que hacer nada aquí.</p>' : ''}
    ${cargoAutomatico && !hecho ? '<p class="hito__auto">🏦 Cargo automático: ten saldo en la cuenta ese día.</p>' : ''}
    <p class="hito__resumen" ${resumen(prog) ? '' : 'hidden'}>${esc(resumen(prog))}</p>
    <details ${abiertos.has(hito.id) ? 'open' : ''} data-id="${esc(hito.id)}">
      <summary>${hito.pago ? 'Notas e importe' : 'Notas'}</summary>
      <div class="campos">
        ${hito.pago ? `<label class="campo">Importe (€, opcional)
          <input type="text" inputmode="decimal" maxlength="20" data-campo="importe" value="${esc(prog.importe)}" placeholder="0,00"></label>` : ''}
        <label class="campo">Nota
          <textarea data-campo="nota" maxlength="2000" placeholder="Ej.: pagado con carta de pago, modelo 102">${esc(prog.nota)}</textarea></label>
      </div>
    </details>
    ${automatico ? '' : `<button type="button" class="btn btn--hecho" data-accion="alternar" data-hecho="${hecho}">
      ${hecho ? `✓ ${palabraHecho} (deshacer)` : `Marcar como ${palabraHecho.toLowerCase()}`}</button>`}
  </li>`;
}

/** Línea que resume importe y nota bajo la descripción. */
function resumen(prog) {
  return [prog.importe && `Importe: ${prog.importe} €`, prog.nota].filter(Boolean).join(' · ');
}

// ----------------------------------------------------------------- eventos

function enlazarEventos() {
  const lista = $('#lista');

  // Marcar/desmarcar hito
  lista.addEventListener('click', (ev) => {
    const boton = ev.target.closest('[data-accion="alternar"]');
    if (!boton) return;
    const h = datosHito(datosAnio(estado, fechas.campana), boton.closest('li').dataset.id);
    h.hecho = !h.hecho;
    persistir();
    render();
  });

  // Notas e importe: se guardan al teclear, sin re-render (no se pierde el foco)
  lista.addEventListener('input', (ev) => {
    const campo = ev.target.dataset.campo;
    if (!campo) return;
    const li = ev.target.closest('li');
    const h = datosHito(datosAnio(estado, fechas.campana), li.dataset.id);
    h[campo] = ev.target.value;
    persistir();
    const caja = li.querySelector('.hito__resumen');
    caja.textContent = resumen(h);
    caja.hidden = !caja.textContent;
  });

  // Recordar qué tarjetas están desplegadas (el evento "toggle" no burbujea → captura)
  lista.addEventListener('toggle', (ev) => {
    const { id } = ev.target.dataset;
    if (ev.target.open) abiertos.add(id); else abiertos.delete(id);
  }, true);

  // Ajustes
  $('#aj-fraccionada').addEventListener('change', (ev) => cambiarAjuste('fraccionada', ev.target.checked));
  $('#aj-domiciliada').addEventListener('change', (ev) => cambiarAjuste('domiciliada', ev.target.checked));
  $('#aj-avisos').addEventListener('change', (ev) => cambiarAvisos(ev.target));

  // Exportaciones / importación
  $('#btn-ics').addEventListener('click', exportarICS);
  $('#btn-exportar').addEventListener('click', exportarJSON);
  $('#btn-importar').addEventListener('click', () => $('#archivo-importar').click());
  $('#archivo-importar').addEventListener('change', importarJSON);
}

function cambiarAjuste(nombre, valor) {
  datosAnio(estado, fechas.campana).ajustes[nombre] = valor;
  persistir();
  render();
  if (nombre === 'domiciliada' && valor) avisoToast('Pagos como cargo automático: ten saldo en la cuenta ese día.');
}

async function cambiarAvisos(casilla) {
  if (!casilla.checked) {
    estado.avisos = false;
    persistir();
    return;
  }
  const permiso = await pedirPermiso();
  if (permiso === 'granted') {
    estado.avisos = true;
    persistir();
    avisoToast('Avisos activados. Para recibirlos con la web cerrada, usa el archivo .ics.');
    avisarCercanos(cercanos(estados), isoDeDia(diaDeHoy()));
  } else {
    casilla.checked = false;
    estado.avisos = false;
    persistir();
    avisoToast(soportadas()
      ? 'Permiso denegado. La web funciona igual; usa el .ics para recibir avisos.'
      : 'Tu navegador no admite notificaciones. Usa el .ics para recibir avisos.');
  }
}

// ----------------------------------------------------------------- tema

function aplicarTema() {
  const raiz = document.documentElement;
  if (estado.tema === 'auto') delete raiz.dataset.tema; else raiz.dataset.tema = estado.tema;
  $('#btn-tema').textContent = ETIQUETA_TEMA[estado.tema];
  $('#btn-tema').setAttribute('aria-label', `${ETIQUETA_TEMA[estado.tema]}. Pulsa para cambiar.`);
}

function cambiarTema() {
  estado.tema = TEMAS[(TEMAS.indexOf(estado.tema) + 1) % TEMAS.length];
  persistir();
  aplicarTema();
}

// ------------------------------------------------------- exportar / importar

/** Descarga un texto como archivo. */
function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportarICS() {
  descargar(`calendario-renta-${fechas.campana}.ics`, generarICS(fechas, estados), 'text/calendar;charset=utf-8');
  avisoToast('Archivo .ics generado. Ábrelo para importarlo en el calendario del móvil.');
}

function exportarJSON() {
  descargar(`calendario-renta-copia-${isoDeDia(diaDeHoy())}.json`, aJSON(estado), 'application/json');
  avisoToast('Copia de seguridad descargada.');
}

async function importarJSON(ev) {
  const archivo = ev.target.files[0];
  ev.target.value = ''; // permite volver a elegir el mismo archivo
  if (!archivo) return;
  try {
    const nuevo = desdeJSON(await archivo.text());
    if (!confirm('Esto reemplazará los datos actuales de este navegador. ¿Continuar?')) return;
    estado = nuevo;
    persistir();
    aplicarTema();
    render();
    avisoToast('Datos importados correctamente.');
  } catch (error) {
    avisoToast(`No se pudo importar: ${error.message}`);
  }
}

// ----------------------------------------------------------------- utilidades

let avisoGuardadoMostrado = false;
function persistir() {
  if (!guardar(estado) && !avisoGuardadoMostrado) {
    avisoGuardadoMostrado = true;
    avisoToast('No se pueden guardar datos en este navegador (¿modo privado?). Los cambios se perderán al cerrar.');
  }
}

let temporizadorToast;
function avisoToast(mensaje) {
  const toast = $('#toast');
  toast.textContent = mensaje;
  toast.classList.add('visible');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => toast.classList.remove('visible'), 5000);
}

iniciar();
