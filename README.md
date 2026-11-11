# Calendario de la Renta

Web personal (sin cuentas ni servidor) para no olvidar las fechas clave de la declaración de la renta en España.
HTML + CSS + JavaScript puro; los datos se guardan en `localStorage` de tu navegador.

> Información general, no es asesoramiento fiscal. Verifica siempre las fechas en la web de la Agencia Tributaria.

## Ejecutar en local

Necesita un servidor estático (abrir `index.html` con doble clic no funciona porque el navegador bloquea la lectura de `fechas.json`):

```bash
python3 -m http.server 8000     # o: npx serve
# abre http://localhost:8000
```

Pruebas de la lógica (sin dependencias, Node 18+): `node --test`

Para usarla en el móvil, publica la carpeta en cualquier hosting estático (p. ej. GitHub Pages).

## Actualizar las fechas cada año

1. Abre `fechas.json`.
2. Cambia `campana` (año de la campaña, p. ej. `2028`) y `ejercicio` (año que declaras).
3. Actualiza cada `fecha` (formato `AAAA-MM-DD`) según la web de la AEAT.
4. Quita `"estimada": true` de las fechas ya confirmadas (mientras esté, se muestra la etiqueta «estimada»).
5. No cambies los `id`. Para el fraccionamiento: `soloFraccionada` oculta un hito si no fraccionas y `sinFraccionar` da otro nombre/descripción en ese caso.
6. Vuelve a exportar el `.ics` e impórtalo en tu calendario.

Tu progreso se guarda por campaña, así que al cambiar `campana` empiezas el año en limpio sin perder el anterior.

## Avisos

- **Principal:** botón «Exportar a mi calendario» → `.ics` con alarmas 14, 7 y 1 día antes (a las 09:00). Ábrelo en el móvil para importarlo.
- **Opcional:** notificaciones del navegador al abrir la web (Ajustes). Si se deniega el permiso, todo sigue funcionando.

## Copia de seguridad

«Exportar datos (JSON)» descarga tus ajustes, notas e importes; «Importar datos» los restaura (reemplaza los actuales).

## Estructura

```
index.html          página
fechas.json         fechas editables
css/styles.css      estilos (claro/oscuro, móvil primero)
js/app.js           interfaz y eventos
js/logic.js         días, semáforo, cuenta atrás (lógica pura)
js/storage.js       localStorage, importar/exportar JSON
js/ics.js           generador .ics
js/notifications.js notificaciones del navegador
tests/              pruebas con node:test
```

Nota: las fechas de `fechas.json` que traen `"estimada": true` son una previsión basada en años anteriores, no fechas oficiales.
