# Planificador estratégico territorial (piloto)

Vista nueva en `/planificador` (rama `feature/planificador`). No modifica `pages/index.js` ni ninguna ruta existente.
Cruza, por cada uno de los 119 circuitos, resultados electorales, encuestas e intervenciones (pauta / visita / obra) y
propone qué hacer a continuación.

## Correrlo local

```bash
DISABLE_AUTH=true npm run dev      # http://localhost:3000/planificador
```

Sin `DISABLE_AUTH` rige el Basic Auth del `middleware.js` (la ruta nueva queda protegida sin código propio).
Una ficha se abre con `#<circuito>` (ej. `/planificador#14M`), útil para compartir o volver con "atrás".

## Qué datos usa (los mismos JSON de `public/data/`)

| Dimensión | Archivo | Campos |
|---|---|---|
| Electoral | `circuitos_completo.json` | `Share_Int19`, `Share_G23` (META), `Padron_G23`, `Categoria_v4_Nombre` |
| Encuesta | `encuestas_circuitos.json` + `encuestas_metadata.json` | `Aprobación Gobernador` (tendencia, umbral `umbral_variacion_pp`), `Problemas principales` |
| Pauta | `pautas_barrios.json` | vía `derivarPautaPorCircuito` (`lib/pautaPorCircuito.js`) |
| Visitas | `recorridos_barrios.json` + `circuito_barrios_cruce.json` | barrio principal del circuito (orden 1) |
| Obras | `obras_capital.json` | agrupadas por circuito con `enriquecerObrasConCircuito` |
| Parte de Obras | texto diario (opcional) | `lib/parteObras.js` |

## Mapa de archivos

- `lib/planificador/config.js` — tiers, paleta (copia de la del tablero), umbrales y **mapeo problema→palanca** (editable).
- `lib/planificador/tendencia.js`, `eventos.js`, `obras.js`, `cobertura.js` — señales por circuito.
- `lib/planificador/recomendacion.js` — motor de reglas (§5 de la spec). `prioridad.js` — semáforo (§6).
- `lib/planificador/index.js` — `construirPlanificador()` arma las 119 filas; `calcularKpis()`.
- `lib/parteObras.js` (+ `parteObrasBarrios.js`) — port del parser del artefacto del Parte de Obras.
- `components/planificador/` — `VistaPlanificador` (tabla), `FichaEstrategica` (drill-down imprimible), `DetalleEvento`.

## Decisiones que conviene conocer

1. **Helpers duplicados, no importados.** `buscarEncuestaCircuito`, `normalizarNombreBarrio`, `esFechaValida`, `formatPct`,
   la paleta y las descripciones de categoría viven privados en `pages/index.js` (no exportados). Como el piloto no puede tocar
   ese archivo, se copiaron a `lib/planificador/base.js` / `config.js` con su origen anotado. **Al validar el piloto, extraerlos
   de `index.js` a un `lib/` común y borrar las copias.**
2. **Pauta deduplicada.** Se usa `derivarPautaPorCircuito` en lugar de `buscarPautaCircuito`: este último repite la misma pieza
   una vez por barrio (~1.955 repeticiones en el JSON actual) e inflaba el "N pautas".
3. **Impresión por CSS, no por `generarFichaPDF`.** `generarFichaPDF` y `abrirVentanaImpresion` son privadas de `index.js`.
   La ficha usa `window.print()` con un `@media print` propio (A4, sin fondos ni colores). Desde el diálogo se guarda como PDF.
4. **Obra "lista" ≠ intervención.** Las obras inaugurables aparecen en la secuencia (ícono O) pero no cuentan como
   intervención para el ciclo medir → intervenir → medir: "lista" no es "inaugurada".
5. **Semáforo vs. prioridad de la tabla de reglas.** El punto de color sigue el criterio aprobado de §6. La columna `Prioridad`
   de la tabla de §5 se guarda como `prioridadSugerida` pero no se muestra (en las reglas 4, 9 y 12 diverge del semáforo).
6. **Regla 5 antes que 3/4.** Si el circuito tiene 1 ronda y ya intervino después de medir, se recomienda re-medir primero,
   aunque el nivel esté bajo la referencia.
7. **Reglas 8 y 15 son modificadores**, no ramas: 8 agrega "no cantar victoria" a 6/7; 15 agrega la alerta de problema #1 sin cubrir.
8. **"Otro" no es problema.** Se excluye del top-3 de problemas (se pide el top-4 a `problemasDeCircuito` y se descarta "Otro").
9. **Cobertura con tres niveles:** cubierto (obra finalizada / en ejecución / inaugurable, o pauta del eje), *solo planificado*
   (obras sin iniciar) y descubierto / sin palanca. Solo "cubierto" cuenta como atendido.
10. **Agenda del piloto:** ★ marca el circuito y se guarda en el navegador (localStorage). La agenda real la define el equipo.

## Parte de Obras diario

No se lee desde el link del artefacto (devuelve la app vacía). `lib/parteObras.js` parsea el **texto** del parte.
Hay dos formas de cargarlo, sin tocar la UI:

- pegarlo en el panel "Parte de Obras del día" de la tabla (se recuerda en el navegador), o
- dejarlo en `public/data/parte_obras.txt` (se lee al abrir; el panel de pegado tiene prioridad si hay algo guardado).

Con parte cargado, `obrasInaugurablesDeCircuito` usa las filas **"Finalizadas"** del parte para ese circuito; si el parte no trae
ninguna, cae a `obras_capital.json`. El parte de ejemplo del 16/10 solo trae obras "En ejecución", así que no cambia nada
hasta que aparezcan finalizadas. El parser se probó contra ese texto real (50 ítems, 0 sin circuito).

## Contraste con el censo de la spec (§10), datos al 17/10/2026

| Dato | Spec | Resultado |
|---|---|---|
| Tiers F/I/D/A | 14 · 60 · 39 · 6 | 14 · 60 · 39 · 6 ✓ |
| Sin encuesta / 1 ronda / con tendencia | 23 · 73 · 23 | 23 · 73 · 23 ✓ |
| Mejoran / empeoran / estables | 11 · 9 · 3 | 11 · 9 · 3 ✓ |
| Con obra inaugurable | 92 | 92 ✓ |
| Lista de fuego (empeoran y Desfav./Adverso) | 4A, 4B, 10H, 14M | 4A, 4B, 10H, 14M ✓ (quedan primeras al ordenar por Recomendación) |
| Pauta sin medición posterior | 71 | **83** (94 circuitos con pauta) — ver abajo |

Sobre el 71 vs. 83: se define "sin medición posterior" como *ninguna ronda con fecha posterior al inicio de la última pauta*.
Probé variantes (vs. primera pauta: 66; vs. fin de la última pauta: 93) y ninguna da 71, así que la diferencia parece venir de
que el dato fue actualizado (rondas del 13–14/10 y pauta regenerada el 8/10) o de otro criterio de "significativa" en el cálculo
original. Es un punto a confirmar.

## Puntos abiertos

- **Integración del Parte de Obras:** automatizar la carga diaria (hoy es manual) y confirmar qué estados cuentan como "listas".
- **Criterio de prioridad:** confirmar el semáforo con uso real; afinar cuando entren segundas rondas.
- **Mapeo problema↔intervención:** se respetó el confirmado (§4). Quedan fuera obras que parecen atender calles/pavimento:
  `Repavimentacion con asfalto` (11), `Repavimentacion y bacheo con hormigon` (13), `Cordón Cuneta` (10). Se suman en
  `PALANCAS_POR_PROBLEMA` si el equipo lo aprueba.
- **"Pauta/visita significativa"** (§4, `medicionPosteriorEvaluable`): hoy cuenta toda pauta y toda visita.
- **Agenda de Gobernador/Siciliano:** sin dato estructurado; no se implementó (gancho previsto en las acciones "visita de jerarquía").
