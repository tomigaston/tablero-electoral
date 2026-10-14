# Bloque Encuestas — reglas y decisiones

Un solo componente (`components/EncuestasBlock.js`) y una sola fuente de reglas (`lib/encuestasBloque.js`) para
**pantalla** (`SolapaEncuestas`), **Generar reporte** (`reporte/encuestasHtml.js` → `registro.js`) y **Exportar ficha**
(`htmlEncuestasFichaPDF`). Render a HTML estático con `renderToStaticMarkup`; no hay `@react-pdf` ni Puppeteer.

## Familias (formato según el TIPO de dato)
- **A · escalar** (un % por ronda): fila-timeline, número grande + fecha debajo, flecha con Δ en pp encima.
- **B · composición 100%**: una barra apilada por ronda, orden de segmentos fijo, leyenda con swatch + nombre, Δ por segmento.
- **C · lista** (no suma 100): barras horizontales grises, mayor→menor, % a la derecha.

Sumar un indicador = una entrada en `GRUPOS` (no se toca el componente). Los indicadores sin ningún dato en las
rondas mostradas se omiten.

## Reglas transversales
- Máximo 3 rondas: las más recientes, de la más vieja a la más nueva (`seleccionarRondas`). No existe "todas".
- S/D ≠ 0. A: "No se preguntó" (con la fecha de la ronda debajo, en gris); B y C: la ronda sin dato se omite, sin barras vacías.
- Sin atenuado, sin badges, sin párrafos. El tamaño de muestra (n) no se muestra en el bloque: solo la fecha de la ronda.
- 1 decimal. Δ calculado sobre los valores ya redondeados, con signo (+/−) y ▲/▼ en color neutro.
- B: ancho del segmento = valor / suma de la fila (llena el 100%), la etiqueta muestra el número reportado.
  Ns/Nc va al final, gris claro, sin Δ. Segmentos de menos de 7% del total no llevan texto adentro: su etiqueta (nombre + %)
  va debajo de la barra con una línea guía (`UMBRAL_ETIQUETA_EXTERNA`). Valores 0.0 reales: no se dibuja segmento pero se listan debajo de la barra.
- C: **un ítem entra si es > 0 en AL MENOS una de las rondas mostradas; donde valga 0 se muestra 0.0%. Un ítem que es 0 en TODAS
  las rondas mostradas no aparece.** Orden por la ronda más reciente con dato; empates por orden de aparición en el dato;
  "Otro/Otra" siempre al final. Con 2–3 rondas: una barra por ronda dentro de cada ítem (tonos de gris, leyenda de fechas).
- Colores B: una sola paleta (verde #66BB6A / ámbar #FBC02D / rojo #C62828 / gris #E0E0E0) con luminancias distintas + orden
  fijo + etiqueta, legible en B&N. Gestión: positiva/regular/negativa. Privatizar: totalmente/parcialmente/no. Sí/No/No sé: verde/rojo/gris.
  Mejoras: mucho/algo/no = verde/ámbar/rojo. Rankings (C): grises.
- Títulos: la sección va centrada y en mayúsculas con línea divisoria; el subtítulo de cada indicador, a la izquierda. En B la
  leyenda y la línea "Cambio … → …" van centradas bajo la barra.

## Print A4
`break-inside: avoid` por indicador; títulos de grupo con `break-after: avoid`; fuentes ≥ 11px; la fila-timeline se apila
(contenedor < 520px) en lugar de romperse. La ficha agrega `@page { size: A4 }`.

## Fuera del bloque (no tocado a propósito)
Intención de voto, Resumen de la ronda actual (`ResumenRondaActual`), panel de barrio y tabla de Capital. Siguen usando
`lib/lecturaRondas.js` y `ChipRonda` (con su marca "actual"); retirarlos de ahí es un cambio aparte.
