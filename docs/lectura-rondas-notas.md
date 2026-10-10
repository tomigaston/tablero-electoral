# Lectura de rondas de encuesta — notas de exploración y modelo

Rama `feat/lectura-rondas`. Objetivo: que el comparativo de encuestas (web) y el reporte PDF se
lean en 10 segundos cuando hay varias rondas o cuando una pregunta no se midió en la ronda más
reciente. No cambia datos ni cálculos.

## Cómo está armado hoy

- **Reporte**: `components/reporte/registro.js` es el registro único de secciones (cada una declara
  `render`, `disponible`, `ultimoDato`, `paginas`). `generar.js` arma el HTML con
  `renderToStaticMarkup`, `estilos.js` aporta el CSS de impresión (A4 vertical, pie "Página N de M"),
  `imprimir.js` lo monta en la propia página y llama a `window.print()`. `ModalReporte.js` lee el
  registro para dibujar las secciones y arma las opciones (ronda única / comparativo A vs B /
  evolución 3+).
- **Componentes reales reutilizados**: `ResumenEncuesta` (una ronda) y `ComparativoEncuesta`
  (varias rondas) viven en `pages/index.js`; el reporte los renderiza a HTML estático. La
  Calificación de gestión se arma con *HTML-strings* (`htmlMiniPendientesGestion`) que la web inserta
  con `dangerouslySetInnerHTML`, así que web y PDF comparten el mismo render. La intención de voto
  es `components/IntencionVotoGobernador.js` + `lib/intencionVoto.js`.
- **Datos**: `encuestas_circuitos.json` → por circuito, `rondas[]` con `fecha`, `casos` y `preguntas`
  (cada pregunta es un objeto categoría → %). Un escenario de voto es una pregunta
  `Intención voto Gobernador - <lista>`. `encuestas_metadata.json` trae `umbral_variacion_pp` (2.5),
  el orden de categorías y el registro de escenarios/candidatos.

## Qué es "dato actual" y qué es "arrastre" HOY

No se distingue. `calcularVariacionIndicador` filtra las rondas que no tienen la pregunta y toma
"la última con dato" como valor actual; la tarjeta solo agrega la fecha de esa medición en gris.
Resultado: en 10I y 11G la ronda 01-10-2026 no relevó Aprobación Intendente, Reelección,
Problemas ni Gestión del Intendente, y esas tarjetas se ven igual que las de Gobernador y Presidente.

## Causas de los problemas puntuales

- **"Datos al 01-10-2026" sobre valores de julio**: `generar.js` estampa `ultimoDato()` al pie de la
  sección; en Encuestas es la fecha máxima de *cualquier* ronda del circuito, no la de cada bloque.
- **Nota del 10I contradictoria**: `renderEncuestas` arma "La ronda del … no incluyó: …" con una lista
  fija de 4 preguntas, y el pie de la sección sigue diciendo 01-10 aunque los problemas son de julio.
  Verificado en los datos: la ronda 01-10-2026 de 10I y 11G **no** trae `Problemas principales`
  (5 de 97 circuitos están en esa situación en su última ronda).
- **Dos bloques de problemas**: `ResumenVariacionesComparativo` (narrativo, "que más cambiaron")
  y `FilasProblemasComparativo` (lista con barras) calculan sus parejas por separado.
- **Segmentos sin etiqueta**: `htmlBarraSegmentosPDF` solo rotula si `v > 8`; "Regular 2.9%"
  (10I Presidente, octubre) queda sin %. Los deltas viven arriba de cada segmento y los angostos
  se cortan ("▲ +2.").
- **Unidad**: conviven "p.p", "p.p." y "pp".

## Modelo adoptado

- **Ronda actual** = la más reciente de las rondas incluidas en el reporte (en el caso normal, la
  última del circuito). Un valor es **ACTUAL** si viene de esa ronda y **ARRASTRE** si la ronda actual
  no midió la pregunta y se muestra el último valor disponible (más viejo).
- Lógica pura en `lib/lecturaRondas.js`; el render sigue en JSX / HTML-string con SVG propio, sin
  dependencias nuevas.
- Chip de ronda neutro (gris; la ronda actual con el azul de marca), idéntico en todo el reporte.

## Ajustes de la segunda ronda

- **"actual"** solo cuando la ronda más reciente mostrada es la última real del circuito (`crearRefRonda`). Si la
  ventana la excluye (ej. abril vs julio con octubre existente), esa ronda va con su fecha neutra y los textos dicen
  "la ronda del 11-07-2026". El Resumen de ronda actual siempre habla de la última del circuito y lo aclara cuando el
  detalle de abajo llega solo hasta otra fecha.
- **Tarjeta de indicador única**: título / número + chip de fecha + n / trayectoria con delta "vs <mes>". El arrastre
  usa el mismo layout, en gris punteado y con el chip "<fecha> · sin dato nuevo".
- **Muestra reducida**: eliminada (banner, etiquetas y umbral n<30). El n se sigue mostrando.
- **Exportar ficha**: la sección Encuestas usa el mismo cuerpo que el reporte (`components/reporte/encuestasHtml.js`).
