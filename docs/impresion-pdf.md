# Impresión y exportables a PDF del Planificador

Los PDF se generan con la impresión del navegador (`Imprimir / PDF` → "Guardar como PDF"). Reglas en el bloque `@media print` de
`pages/planificador.js`; los exportables de listados (recomendaciones) están en `lib/planificador/exportar.js`.

## Criterios
- **Mismo diseño que el tablero:** se conservan colores, barras, chips y tarjetas (`print-color-adjust: exact`). Se fuerzan los
  colores del tema claro dentro de `.plan-raiz`, así sale igual aunque se imprima desde modo oscuro.
- **Mapa del Resumen:** al imprimir, el mapa interactivo (Leaflet) se oculta y se dibuja un SVG con los mismos circuitos y colores
  (`MapaResumen.js`, `mapaImpresion`), respetando el filtro activo. El mapa de Leaflet no se reajusta al ancho de la hoja y salía con mal zoom.
- **Ficha:** título de hoja arriba, línea de tiempo y tarjetas de encuesta con su diseño (se acomodan en varias filas, `.plan-linea-tiempo`
  y `.plan-encuesta-fila`), detalle de eventos y etapas de cada recomendación.
- **Elementos solo de pantalla** (`.plan-no-print`): botones, filtros, formularios y el mapa interactivo. **Solo de impresión** (`.plan-solo-print`):
  títulos de hoja, filtro aplicado y el mapa SVG.
- En el diálogo de impresión conviene tildar **Gráficos de fondo** (Chrome lo recuerda).
