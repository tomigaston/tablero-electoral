# Pauta por circuito — notas de exploración (Paso 0)

> **Nota (19/10/2026):** esta es una nota de exploración del 10/10, anterior a la migración de la pauta de Capital al generador `scripts/generar_pauta_capital.py`. Los números y varias reglas quedaron desactualizados: "activa" ahora tiene una sola definición (estado Vigente e INICIO ≤ hoy ≤ FIN), los estados son Vigente/Finalizada/Observada/Programada/S/D y el JSON se genera desde el crudo. Vigente: `docs/pauta-capital-carga-semanal.md` y el manual metodológico.

Hallazgos verificados contra los archivos reales (no contra notas), 2026-10-10.

## Navegación y sistema visual
- No hay "pestañas" de primer nivel: la navegación de nivel dashboard es `vistaFicha`
  (`null | 'circuito' | 'barrio' | 'capital' | 'obras'`) en `Home` (`pages/index.js`), con
  entrada desde el dropdown "☰ Menú". La vista nueva es `vistaFicha === 'pautaCircuito'`.
- Tokens: `--bg-primary/secondary`, `--text-primary/secondary/tertiary`, `--border`
  (`styles/globals.css`). Estilos inline, azul `#1976D2` como acento. Sin librerías de charts.
- Patrón de vista lifted: `VistaObras` guarda filtros en `Home` porque navegar a una ficha la
  desmonta. Se replica para no perder filtros al ir a la Ficha de un barrio y volver.

## Navegación a la Ficha de barrio (se reutiliza tal cual)
`irABarrioDesdeMapaPauta(nombre)` = `handleSelectBarrio(nombre, 'pauta')` + `setVistaFicha('barrio')`
→ abre la ficha del barrio directo en la solapa Pauta.

## Vigencia
`pautaEstaVigente(pauta, hoy)` de `lib/estadoPauta.js` (fin >= hoy; sin `fin` parseable = no
vigente). `estadoMostradoPauta(pauta)` devuelve el `estado` crudo. Hoy: 378 de 5.404 entradas
vigentes; 96 contradicen su `estado`; 296 sin fechas.

## Esquema de `pautas_barrios.json`
- `barrios` (223 barrios, 4.612 entradas), `circuitos_sin_barrio` (66 circuitos, 446),
  `toda_capital` (346). Total 5.404 entradas, 5.200 `fila_origen` únicas, sin solapamiento
  entre buckets.
- `circuito`/`circuito_nombre` en el bucket `barrios`: poblado en SOLO 1.180 de 4.612
  entradas (null en el resto). Cuando viene poblado: 932 coinciden con el circuito
  principal del barrio, 49 están en el cruce pero no son principal y **191 no están en el
  cruce del barrio** → es el circuito declarado por la fuente (targeting), no derivable del
  barrio. Se respeta tal cual.
- Las 9 piezas multi-barrio (fila_origen repetida: 4–46 barrios) tienen todas `circuito`
  poblado y un único circuito; contenido idéntico entre repeticiones (métricas idénticas →
  no se suman, se toma una).
- No hay id de pieza en el JSON. `cod_contenido` viaja solo como dato informativo: no se usa para identificar ni deduplicar piezas.
- **`fila_origen` NO sirve como clave de dedup** (corrección tras verificar en pantalla): solo
  repite en 9 piezas con `circuito` explícito. La mayoría de las piezas multi-barrio llegan con
  una fila distinta POR BARRIO, y además con una fila "gemela" en `circuitos_sin_barrio`
  (filas consecutivas, ej. 6561 barrio + 6562 circuito), mismo título/campaña/fechas/métricas.
  Dentro de un circuito: 808 grupos / 1.955 repeticiones (~40%). Clave usada: título +
  campaña + plataforma + inicio + fin + objetivo + tipo_pauta + estado + link + métricas
  (JSON). Dos filas con mismo título pero métricas distintas (33 grupos) quedan separadas
  (ad-sets distintos). Invariante: cada una de las 5.404 entradas cae en exactamente una
  pieza (3.256 piezas: 2.932 en circuitos, 324 Alcance Capital, 0 sin resolver).
- `material.link`: URL (1.758), null (3.637) o **texto libre que no es URL (9)**, ej.
  "Hockey Adaptado" → se trata como sin link usable. `redes_publicadas.ig/fb/yt`: URL o null
  (algunas `ig` apuntan a carpetas de Drive).
- `metricas_ejecutadas`: `frecuencia` puede ser string ("1 - 7 dias", "Trafico"); null en
  GOOGLE. `'-'` / `#DIV/0!` no aparecen en el JSON actual pero se tratan como null igual.

## Resolución barrio → circuito (decisión del usuario)
Un barrio toca en promedio 2–3 circuitos (`barrio_to_circuitos`). Se eligió **circuito
principal** (mismo criterio que Ficha/mapa: `circuito_principal` de `barrios_geo.json`,
fallback cruce `orden_importancia: 1`), salvo que la entrada traiga `circuito` explícito.
Resultado: cada entrada cae en un solo circuito y la suma es auditable (entradas asignadas = 5.404).

## Gap de siglas con punto
`circuito_barrios_cruce.json` sigue SIN corregir: `A.T. E`, `V.I.C.O.R`, `CO.VI.CO`, `S.E.P`,
`O.S.N`, `U.O.C.R.A` sin punto final (en `barrios_geo.json` sí lo tienen). En
`pautas_barrios.json` hay 5 barrios con puntos (`A.T. E.`, `V.I.C.O.R.`, …); `A.T. E.` y
`V.I.C.O.R.` no matchean en el cruce por nombre. Como el camino primario es
`circuito_principal` de `barrios_geo` (donde sí matchean), no se pierden; además el fallback
por cruce normaliza quitando puntos. Lo que no resuelva por ninguna vía va a "Sin circuito
resuelto".
