# CONTEXTO_PROYECTO.md — Tablero Electoral Córdoba Capital

**Pegar/tener este archivo en la raíz del repo. Sirve como punto de partida para cualquier sesión de Claude Code sobre este proyecto.**

---

## 1. Qué es este proyecto

Tablero web (Next.js + Leaflet) de diagnóstico territorial electoral de **Córdoba Capital** (119 circuitos electorales). Es la versión "Vercel" de un tablero que originalmente se construyó en Power BI para el equipo del Gobernador Martín Llaryora.

**Importante — no confundir con otro proyecto:** existe un segundo tablero, separado, llamado `tablero-lla`, enfocado en La Libertad Avanza, con otra lógica de clasificación (usa como eje al peronismo como rival, no a Llaryora como protagonista). **Este documento es exclusivamente sobre `tablero-electoral`**, el primero.

**Repositorio:** https://github.com/tomigaston/tablero-electoral (privado). **Ramas:** `main` (producción) y `preview-testing` (trabajo en curso, con su propio deploy de preview en Vercel si está conectado).

## 2. Propósito del tablero

Identificar la situación electoral del peronismo cordobés (oficialismo provincial) en los 119 circuitos de Córdoba Capital, comparando el desempeño de Llaryora vs. el desempeño histórico del espacio, para priorizar territorios. Sobre esa base electoral se fue sumando una capa de **cobertura territorial** (encuestas propias por circuito, visitas del Gobernador, y en el futuro pauta publicitaria) y una capa de **escuelas/centros de votación** (heterogeneidad de voto peronista dentro de cada circuito/barrio), para cruzar diagnóstico electoral con actividad de campaña real.

## 3. Elecciones analizadas

| ID | Elección | Año | Candidato/Referencia |
|----|----------|-----|----------------------|
| Int19 | Intendente Córdoba | 2019 | Martín Llaryora |
| G19 | Gobernador | 2019 | Juan Schiaretti |
| L21 | Diputados Provinciales | 2021 | Vigo |
| G23 | Gobernador | 2023 | Martín Llaryora |
| L25 | Diputados Provinciales | 2025 | Juan Schiaretti |

(También hay datos históricos G07, G11, G15 incluidos en los datasets para series más largas.)

## 4. Categorías de clasificación

**Diagnóstico Electoral (v4)** — 6 categorías: Bastión Sólido, Bastión con Erosión, Territorio Leal, Pérdida 2023, En Disputa, Territorio Hostil.

**Evolución ML** — 6 categorías sobre la trayectoria personal de Llaryora: Fiel Creciente, Fiel Estancado, Conquista ML, Retroceso ML, Oportunidad, Adverso.

Colores de referencia:
- **v4:** Bastión Sólido `#4CAF50`, Bastión Erosión `#FFCA28`, Terr. Leal `#26A69A`, Pérdida 2023 `#FF7043`, En Disputa `#78909C`, Terr. Hostil `#EF5350`
- **ML:** Fiel Creciente `#4CAF50`, Fiel Estancado `#FFCA28`, Conquista `#42A5F5`, Retroceso `#EF5350`, Oportunidad `#7E57C2`, Adverso `#78909C`

## 5. Stack técnico actual

- **Framework:** Next.js 14.1 (Pages Router).
- **Mapa:** Leaflet + react-leaflet.
- **Tile provider actual:** OSM tile server estándar (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`). **Ojo:** este server tiene política de uso restrictiva y no está pensado para producción con tráfico real — si el proyecto escala, migrar a CARTO Voyager, MapTiler o Stadia Maps.
- **Geometría / cruces espaciales:** `@turf/boolean-point-in-polygon` (paquete mínimo, no el bundle completo `@turf/turf`) para detectar en qué circuito y en qué barrio cae un click del mapa.
- **Datos geográficos:** TopoJSON para los 119 circuitos (`circuitos_cordoba.json`); GeoJSON plano para barrios (`barrios_geo.json`).
- **Autenticación:** Basic Auth vía middleware con múltiples usuarios del mismo nivel (`AUTH_USERS="usuario:clave,usuario:clave"` en Vercel; `DISABLE_AUTH=true` solo en desarrollo). Sin credenciales por defecto: sin configuración responde 401. `AUTH_USER`/`AUTH_PASS` siguen aceptados como compatibilidad temporal. El matcher de `middleware.js` protege toda ruta salvo `_next/static`, `_next/image` y `favicon.ico`; **`/data/*` también está protegido** (antes estaba excluido, desde 15/10/2026) — cualquier página nueva (incluida `/admin/*`) queda protegida sin código propio. Alta/baja de usuarios: editar `AUTH_USERS` en Vercel y redeployar.
- **Despliegue:** Vercel, conectado a GitHub.
- **Inventario de datos:** `lib/data-manifest.js` + página `/admin/data-status` (ver sección 15).
- **Pendiente de mantenimiento:** `npm audit` marca una vulnerabilidad crítica en `next@14.1.0` con fix disponible (no aplicado todavía porque no se pidió explícitamente).

## 6. Estructura de datos (carpeta `public/data/`)

El inventario completo y mantenido a mano (qué componente consume cada archivo, clave de cruce, fuente original, estado) vive en **`lib/data-manifest.js`** y se visualiza en **`/admin/data-status`** — ver sección 15. La convención de commit para tocar cualquier archivo de esta carpeta es `data(nombre_archivo): qué cambió — fuente: X.xlsx` (documentada como comentario de cabecera en ese mismo archivo).

Resumen (ver `lib/data-manifest.js` para el detalle completo por archivo):

| Archivo | Contenido | Notas de cruce/matching |
|---------|-----------|--------------------------|
| `circuitos_completo.json` | 119 circuitos × ~54 métricas (shares, turnout, categorías, residuales, etc.) | Clave primaria: `CircuitoKey` (ej. `"13A"`, sin cero a la izquierda) y `Mapkey` (ej. `"013A"`, 4 caracteres, con cero a la izquierda). |
| `partidos_por_eleccion.json` | Resultados de los top 5 partidos por circuito, para 9 elecciones | Clave: `CircuitoKey`. |
| `barrios_por_circuito.json` | ~486 barrios mapeados a su circuito correspondiente (nombre, población, % del circuito) | Clave: `Mapkey`. **Estado: legacy** — dataset "viejo"; para la mayoría de los usos nuevos se prefiere `barrios_geo.json`. También se usó offline como puente circuito→seccional→barrios en el matching de escuelas. |
| `circuitos_cordoba.json` | TopoJSON del polígono de los 119 circuitos | `properties.circuito` = `Mapkey`. |
| `barrios_geo.json` | GeoJSON (no TopoJSON) de 485 barrios: geometría + `nombre_barrio`, `tipo_barrio`, `centroid_lat/lon`, `poblacion`, `circuito_principal`, `obras[]` embebidas, etc. | Nombres normalizados con `normalizarNombreBarrio` para cruzar contra el resto de los datasets de barrio. 16 nombres duplicados exactos (barrios partidos en polígonos no contiguos) — preexistente, no resuelto. |
| `obras_largo.json` | 237 registros de obras públicas; se usan las 118 con `match_poligono: true` | `barrio_normalizado` cruza contra `nombre_barrio` de `barrios_geo.json`. Solo alimenta los markers del mapa — la lista de obras del panel de barrio lee `obras[]` embebido en `barrios_geo.json`, no este archivo. |
| `circuito_barrios_cruce.json` | Dos mapas: `circuito_to_barrios` y `barrio_to_circuitos`, cada uno con `orden_importancia` (1 = principal) | Clave de circuito: `"Mapkey - cirn_nom"`. Clave de barrio: nombre tal cual (sin normalizar), más `barrio_normalizado` embebido. |
| `encuestas_circuitos.json` | Encuestas propias por circuito y ronda: `cantidad_rondas`, y por ronda `fecha` + `preguntas` (problemas, gestión, aprobación, reelección, etc.) | Clave: `CircuitoKey`, resuelta por `buscarEncuestaCircuito()` (match directo o invirtiendo letra/número, ej. `"14A"` ↔ `"A14"`). **Es la fuente viva de cobertura de encuestas** — reemplaza a `cobertura_circuitos.json` (ver abajo). |
| `encuestas_metadata.json` | Config global de encuestas (`umbral_variacion_pp`, usado en el comparativo entre rondas) | No es por circuito/barrio. |
| `cobertura_circuitos.json` | **DEPRECADO.** Snapshot fijo (histórico) de cobertura: 121 claves, 50 circuitos con `encuestado: true` | Ya no se lee en ningún lado del código — la cobertura (`encuestado`/`cantidad_rondas`/`fechas_rondas`) se deriva en runtime desde `encuestas_circuitos.json` vía `coberturaDesdeEncuesta()`. Se conserva el archivo en el repo sin borrar, pendiente de decidir si se elimina. |
| `recorridos_barrios.json` | Visitas del Gobernador por barrio: 61 barrios, 142 visitas | Clave = nombre de barrio normalizado. Dato corrupto conocido: una visita a "Chateau Carreras" con `fecha: "08/10/0205"`, excluida en silencio. |
| `escuelas_capital.json` | Catálogo de 1.438 escuelas de Capital (IDECOR), con lat/lon y, si `es_centro_votacion: true`, votos/pct_peronismo/confianza | Sin clave de cruce para la capa del mapa (cada escuela trae su propia lat/lon). Ver sección 13. |
| `votos_escuelas_por_circuito.json` | Escuelas-centro-de-votación agrupadas por circuito, pre-ordenadas por `pct_peronismo` | Clave: **`Mapkey`** (4 caracteres con cero), no el `CircuitoKey` sin cero. 84 de 119 circuitos con al menos una escuela. |
| `votos_escuelas_por_barrio.json` | Mismo dato, agrupado por barrio | Clave: nombre IDECOR normalizado con `normalizarNombreBarrio()`. 236 de 236 barrios con datos, 68 sin match contra `barrios_geo.json`. |
| *(reservado, sin archivo aún)* `pauta_*.json` | Pauta publicitaria por circuito — tercer tipo de evento de cobertura, todavía sin datos. La arquitectura de `construirEventosPorCircuito` (sección 11) ya contempla este tipo. |

## 7. Estructura del código

- **`pages/index.js`** — archivo único con casi todo el frontend (por convención del proyecto: no se separaron los componentes en archivos propios). Contiene, en este orden aproximado:
  - Paletas de color y descripciones de categorías (v4 / ML).
  - Componentes reutilizables chicos: `Badge`, `MetricCard`/`MetricCardMini`, `VictoriaIndicator`, `InfoModal`.
  - Helpers: `formatPct`, `formatPP`, `getNumeroBase`, `normalizarNombreBarrio`, `compararMapkey`, `esFechaValida`, `construirEventosPorCircuito`, `buscarEncuestaCircuito`, `coberturaDesdeEncuesta`, `colorPeronismo`.
  - Las solapas de la ficha completa de circuito: `SolapaResumen`, `SolapaEvolucion`, `SolapaPartidos`, `SolapaTerritorio`, `SolapaComparativas`, `SolapaEncuestas` (condicional, solo si el circuito tiene encuesta) y `SolapaEscuelas` (siempre visible) — ver secciones 12 y 13.
  - Componentes de encuestas: `ComparativoEncuesta`, `ResumenEncuesta`, `ListadoEncuestasCircuitos` (listado desplegable "Circuitos con encuesta" en el header).
  - Componentes de escuelas: `FilaVotoEscuela`, `ListaVotosEscuelas` (barra SVG-free hecha con divs, reutilizada en `SolapaEscuelas` y en `PanelMiniBarrio`).
  - `VistaCapital` — tabla agregada de los 119 circuitos, filtrable por categoría.
  - Componentes del panel lateral chico: `ResumenCircuitoMini`, `PanelMiniCircuito`, `PanelMiniBarrio`, `PanelLateral`, `FilaCruce`, `ListaCruceColapsable`.
  - Componentes de cobertura territorial: `BadgeCobertura`, `PillFiltro`, `CeldaEvento`, `TablaEventosCobertura`, `BarraCobertura`.
  - `generarFichaPDF` — genera el HTML de la ficha imprimible.
  - `Home` (export default) — estado global, carga de datos, layout y navegación.
- **`components/MapaCircuitos.js`** — todo lo relacionado al mapa Leaflet: capas (Circuitos, Barrios, Obras, Escuelas), detección de click vía turf (`ClickHandler`), centrado/zoom (`MapController`), panel de Capas y leyenda como overlays flotantes. Tiene su propia copia de `normalizarNombreBarrio` (duplicada a propósito, mismo criterio que en `pages/index.js`, para no importar ese archivo estáticamente y arriesgar SSR con Leaflet).
- **`lib/data-manifest.js`** — inventario de `public/data/` (ver sección 15).
- **`pages/admin/data-status.js`** — página de estado de datos, protegida por el Basic Auth global (ver sección 15).
- **`middleware.js`** — Basic Auth.
- **`App.jsx`** (raíz del repo) — prototipo previo a la migración a Next.js, **huérfano, no se importa desde ningún lado**. No forma parte del build. No tocar salvo que se pida limpiarlo explícitamente.

## 8. Layout y navegación

La página tiene dos estados, controlados por `vistaExpandida`:

- **Estado 1 (default, mapa grande):** el mapa ocupa la columna principal; a la derecha, un panel angosto (`PanelLateral`, ~300px) con tabs **Circuito** / **Barrio** que muestran un resumen chico (`PanelMiniCircuito` / `PanelMiniBarrio`) del circuito/barrio actualmente seleccionado, con botón "Ver ficha completa →".
- **Estado 2 (ficha expandida):** el mapa se achica a una columna angosta (~320px) a la derecha; a la izquierda se muestra, según haya o no un circuito seleccionado, la ficha completa (solapas Resumen/Evolución/Partidos/Territorio/Comparativas + Encuestas condicional + Escuelas) o `VistaCapital` (vista agregada de los 119 circuitos). Se entra clickeando "Ver ficha completa" o el botón de header "📊 Estadísticas de Capital"; se sale con "← Volver al mapa" o "✕ Cerrar".
- **Listado "Circuitos con encuesta":** desplegable debajo del header (toggle `mostrarListadoEncuestas`, disparado desde el menú del header), muestra `ListadoEncuestasCircuitos` — todos los circuitos con `cantidad_rondas > 0`, cantidad de rondas y fecha más reciente, clickeables para ir directo a esa ficha.

La leyenda de categorías y el panel de Capas (Circuitos/Barrios/Obras/Escuelas) viven **dentro** de `MapaCircuitos.js` como overlays flotantes sobre el mapa (no como bloques fijos que restan ancho al layout).

## 9. Mecanismo de click en el mapa (circuito ↔ barrio)

Hay dos formas de que se seleccione un circuito y/o un barrio, con lógicas distintas a propósito:

1. **Click directo en el mapa** (`ClickHandler` en `MapaCircuitos.js`, con `@turf/boolean-point-in-polygon`): en un único evento de click, turf determina **de forma independiente y puramente geométrica** qué circuito y qué barrio contienen ese punto exacto, sin importar cuál capa esté visualmente arriba ni cuál esté tildada en el panel de Capas (las capas ya no tienen `onClick` propio). Si el punto no cae dentro de un polígono de alguna de las dos capas, esa selección queda en `null` — no se mantiene la selección anterior. Esto llama a `handleMapClick(circuitoKey, nombreBarrio)` en `pages/index.js`.
2. **Selección no geográfica** (buscador, fila de `VistaCapital`, "circuitos de la zona" en Territorio, links "Otros circuitos/barrios" del panel, listado "Circuitos con encuesta"): acá no hay un punto clickeado, así que `handleSelectCircuito` deriva el **barrio principal** del circuito elegido vía `circuito_barrios_cruce.json` (`orden_importancia: 1`), y `handleSelectBarrio` (usado por los links "Otros barrios en este circuito") solo cambia el barrio sin tocar el circuito activo.

Ambos casos conviven porque resuelven problemas distintos: el click en el mapa quiere la verdad geométrica exacta; las otras vías de selección no tienen un punto y necesitan una heurística razonable (el barrio/circuito "más representativo").

## 10. Capas del mapa

Panel de Capas (checkboxes, overlay flotante arriba a la derecha del mapa). Estado por defecto: `{ circuitos: true, barrios: false, obras: true, escuelas: false }`.

- **Circuitos** — capa base, coloreada por categoría v4 (o ML según el modo), con tooltip y resaltado del seleccionado.
- **Barrios** — polígonos con **borde punteado, sin relleno** (para no competir visualmente con el color de circuitos cuando ambas capas están activas). Resaltado del barrio seleccionado con relleno tenue.
- **Obras** — 118 puntos (`CircleMarker`, color índigo `#5C6BC0`), geocodificados en el **centroide del barrio** correspondiente (no tienen lat/lon propia todavía). Cuando varias obras comparten barrio, se separan con un offset circular determinístico alrededor del centroide. Click abre un `Popup` con barrio, programa, descripción y estado.
- **Escuelas** — 1.438 puntos (`CircleMarker`, radio 5), ploteados por su propia lat/lon (IDECOR). Color azul `#1976D2` si `es_centro_votacion: true`, gris `#9E9E9E` si no; borde punteado naranja `#F57F17` cuando `confianza: pendiente_revision`. Popup con barrio, domicilio, mesas/votos válidos/% peronismo (si es centro de votación) o nivel educativo (si no).

## 11. Cobertura territorial (encuestas + visitas)

Sistema para cruzar el diagnóstico electoral con actividad de campaña real: encuestas propias y visitas del Gobernador (y a futuro, pauta publicitaria).

### 11.1 Por circuito (badge + rondas) — derivado en runtime desde `encuestas_circuitos.json`
En `ResumenCircuitoMini` (panel chico, y reutilizado dentro del tab Barrio) y en `SolapaResumen` (ficha completa): badge **"✓ Encuestado"** (verde) / **"○ Sin encuestar"** (gris), y si fue encuestado, cantidad de rondas + lista de fechas.

Estos tres campos (`encuestado`, `cantidad_rondas`, `fechas_rondas`) **ya no se leen de un archivo estático** — se derivan en runtime con `coberturaDesdeEncuesta(encuestasData, circuitoKey)`, que reusa `buscarEncuestaCircuito()` (mismo cruce de claves que usa toda la sección de Encuestas, sección 12) y exige `cantidad_rondas > 0` para marcar `encuestado: true`. Esto reemplazó al viejo `cobertura_circuitos.json` (ahora deprecado, sección 6), que quedaba desactualizado apenas se cargaba una encuesta nueva.

### 11.2 Por barrio (Recorridos del Gobernador)
En `PanelMiniBarrio` (tab Barrio): si el barrio tiene visitas registradas en `recorridos_barrios.json`, se lista cantidad total + cada visita (fecha, tipo, contacto con vecinos, link clickeable a la nota si existe). No hay ficha completa de barrio todavía (es trabajo futuro).

### 11.3 Barra de cobertura + tabla de eventos (`BarraCobertura` / `TablaEventosCobertura`)
Barra siempre visible debajo del header (y del listado "Circuitos con encuesta" si está abierto): "`X / 119 circuitos encuestados (Y%)`" + barra de progreso + fecha de la ronda más reciente + botón "Ver detalle" que despliega la tabla.

**Diseño deliberadamente NO es un Gantt con eje temporal compartido.** Es una tabla donde cada fila es un circuito y cada celda es el N-ésimo evento cronológico de esa fila (columnas "Evento 1", "Evento 2"... hasta el máximo de eventos entre todas las filas visibles).

- **Tipos de evento:** `medicion` (verde, derivado de `encuestas_circuitos.json` vía `coberturaDesdeEncuesta`), `visita` (azul, de `recorridos_barrios.json` cruzado por circuito), `pauta` (naranja, reservado — sin datos, ver sección 6).
- **Atribución de visitas a circuito:** un circuito **solo** hereda las visitas del/los barrio(s) donde ese circuito tiene `orden_importancia: 1` en `circuito_to_barrios`. Máximo real: **25 eventos** (circuito `0001 · Seccional Primera`), promedio ~1.7, 48 de 119 circuitos en 0 eventos.
- **Filtros, en este orden de aplicación:** (1) tipo de evento (pills toggle, los 3 activos por defecto), (2) rango temporal por año (pills dinámicas + "Todo", default = año más reciente con datos).
- **Orden de filas:** por defecto, ID de circuito ascendente vía `compararMapkey`. Alternativa: por fecha del evento más reciente visible.
- **Columna de circuito fija** (`position: sticky; left: 0`).
- **Tooltip de celda:** custom (no `title` nativo) para que el link de una visita sea clickeable.
- **Click en fila** → `irACircuitoDesdeGrilla`: selecciona el circuito, vuelve a Estado 1 (mapa).
- **Sin virtualización** — 119 filas es manejable con scroll nativo.

## 12. Sistema de Encuestas (badge, listado, resumen, comparativo)

Fuente viva: `encuestas_circuitos.json` (sección 6). Resuelto en todos los puntos de consumo con `buscarEncuestaCircuito(encuestasData, circuitoKey)`: intenta match directo por `CircuitoKey` y, si falla, invierte el orden número/letra (ej. `"14A"` ↔ `"A14"`) antes de descartar en silencio. Verificado: 77 de 119 circuitos con `cantidad_rondas > 0`; 2 claves del archivo sin match contra ningún `CircuitoKey` (`"5L"`, `"12J"`).

- **`SolapaEncuestas`** (solapa condicional — solo aparece en la ficha si `encuestaCircuito` existe para ese circuito): dos vistas alternables, **Resumen** (preguntas/resultados de la ronda seleccionada por un `<select>` si hay más de una) y **Comparativo** (solo si `encuesta.tiene_comparativo`), que muestra KPIs de variación entre la penúltima y la última ronda — Aprobación Intendente/Gobernador/Presidente, Reelección Llaryora/Milei, y gestión (Positiva/Regular/Negativa/Ns-Nc) de los tres funcionarios — más una grilla de evolución de "Principales problemas", resaltando variaciones por encima de `metadata.umbral_variacion_pp` (default 2.5pp si `encuestas_metadata.json` no lo especifica).
- **`ListadoEncuestasCircuitos`**: panel desplegable "Circuitos con encuesta" desde el header (sección 8), todos los circuitos con encuesta ordenados por `compararMapkey`, con cantidad de rondas y fecha más reciente, clickeable para ir a la ficha.
- El badge de cobertura por circuito (sección 11.1) y la barra global `X/119 circuitos encuestados` (sección 11.3) también se alimentan de esta misma fuente.

## 13. Escuelas / Centros de votación

Capa para ver heterogeneidad de voto peronista dentro de cada circuito/barrio, cruzando el catastro de escuelas (IDECOR) con los centros de votación reales (Carta Marina 2023) y los resultados por mesa.

- **Matching:** 438 escuelas físicas vinculadas a CUE (431 nombres de Carta Marina + 5 nombres que en realidad correspondían a 2-3 escuelas físicas distintas, desdoblados en 12 entidades reales), cubriendo 3.249 de 3.291 mesas. 417 (95,2%) verificadas o alta confianza, 21 (4,8%) con `confianza: pendiente_revision` (documentadas, no forzadas).
- **% peronismo:** calculado sobre **votos válidos** (excluye blancos/nulos), no sobre el total emitido. `promedio_capital_pct` vigente: **45,8%**.
- **`escuelas_capital.json`:** catálogo completo, 1.438 escuelas (de 1.441 IDECOR, 3 filtradas por coordenadas inválidas). Alimenta únicamente la capa "Escuelas" del mapa (sección 10) — cada escuela trae su propia lat/lon.
- **`votos_escuelas_por_circuito.json`** (clave `Mapkey`) y **`votos_escuelas_por_barrio.json`** (clave = nombre IDECOR normalizado): pre-agrupados y pre-ordenados por `pct_peronismo`, alimentan respectivamente la solapa **`SolapaEscuelas`** ("Escuelas", siempre visible en la ficha de circuito, con estado vacío propio si el circuito no tiene ninguna) y la sección "Votos por escuela" de `PanelMiniBarrio`, ambos vía `ListaVotosEscuelas`/`FilaVotoEscuela` — barra de progreso hecha con `<div>`s (color `colorPeronismo(pct)`, gradiente de un solo rojo por magnitud) + marca vertical fija en el promedio de Capital. Sin librerías de gráficos, consistente con el resto del proyecto.
- **Huecos de datos conocidos, no resueltos (documentados, no forzados):**
  - **68 de 236 barrios** en `votos_escuelas_por_barrio.json` no matchean contra `barrios_geo.json` ni con `normalizarNombreBarrio()` (nombres de catastro IDECOR genuinamente distintos, ej. "AMPLIACION CABILDO", "S.M.A.T.A.") — muestran "Sin centros de votación identificados".
  - **35 de 119 circuitos sin ninguna escuela-centro-de-votación:** 34 perfectamente explicables (0-3 escuelas IDECOR en su territorio: countries, aeropuerto, zona militar). El caso `007D COFICO` es una rareza real sin explicación de matching (Carta Marina genuinamente no usa ninguna escuela de Cofico como centro de votación).
  - **7 circuitos no existen como clave en `barrios_por_circuito.json`**, el más relevante es `0002 SECCIONAL SEGUNDA` (6.207 electores) — posible cobertura de escuelas sin poder atribuir por este agujero de la fuente puente.

## 14. Decisiones de normalización y calidad de datos conocidas

- **`normalizarNombreBarrio`** (duplicada en `pages/index.js` y `components/MapaCircuitos.js`, mismo criterio en ambas): `toUpperCase()` + reemplazo de `º/ª` por `O` + `.normalize('NFD')` con strip de diacríticos + colapso de espacios + `trim()`.
- **`buscarEncuestaCircuito`** (sección 12): match directo por `CircuitoKey` y, si falla, invierte letra/número (ej. `"14A"` ↔ `"A14"`) antes de descartar en silencio — necesario porque `encuestas_circuitos.json` trae al menos una clave con el orden invertido (`"A14"`).
- **Nombres de barrio que NO matchean ni con la normalización:** ~4 en `recorridos_barrios.json` y ~32 en `circuito_barrios_cruce.json` → `barrio_to_circuitos` (mayoría placeholders "SD"). No se resolvieron con heurísticas de similitud de texto a propósito, para no asignar datos al polígono equivocado. Mismo criterio aplicado a los 68 barrios sin match de `votos_escuelas_por_barrio.json` (sección 13).
- **Fecha corrupta conocida:** visita a "Chateau Carreras" con `fecha: "08/10/0205"` en `recorridos_barrios.json` — se excluye en silencio (falla `esFechaValida`).
- **`estado` de obras sucio:** algunos registros de `obras_largo.json` tienen valores tipo `"0.18"` en el campo `estado` — se muestra tal cual, sin reinterpretar.
- **Barrios duplicados dentro de `barrios_geo.json`:** 16 nombres se repiten exactamente (polígonos no contiguos) — el lookup por nombre normalizado se queda con la última ocurrencia. 7 fragmentos tenían un `circuito_principal` incorrecto (join por nombre en vez de geometría) — recalculados con `booleanPointInPolygon`.
- **`poblacion` de barrios duplicados — limitación conocida, sin resolver:** es un valor agregado por *nombre* de barrio, no por fragmento geométrico individual — no hay fuente para desagregarlo sin inventar el reparto.
- **Circuito "principal" de un barrio, criterio correcto:** el de mayor `pct_en_circuito`/`orden_importancia: 1`, no el primero por orden de archivo — un bug así afectó a 4 de 20 barrios en la generación de `votos_escuelas_por_*.json` (sección 13), ya corregido.

## 15. Gobernanza de datos (`lib/data-manifest.js` + `/admin/data-status`)

- **`lib/data-manifest.js`** — array exportado, un objeto por archivo de `public/data/`, con `archivo`, `descripcion`, `alimenta` (componentes/páginas que lo consumen), `claveCruce`, `fuenteOriginal`, `estado` (`activo`/`deprecado`/`en_desarrollo`/`legacy`) y `notas`. Es documentación viva mantenida a mano, no se regenera sola. Comentario de cabecera con la convención de commit (`data(nombre_archivo): qué cambió — fuente: X.xlsx`) y la obligación de actualizar la entrada si cambia el esquema o el estado de un archivo.
- **`/admin/data-status`** — página protegida por el Basic Auth global (sin lógica propia, cubierta por el matcher de `middleware.js`), tabla con archivo / descripción / a qué alimenta / badge de estado (verde activo, gris deprecado, azul en desarrollo, ámbar legacy) / "última actualización real". Esta última columna consulta en `getServerSideProps`, por archivo, `GET api.github.com/repos/tomigaston/tablero-electoral/commits?path=public/data/{archivo}&page=1&per_page=1` con `Authorization: Bearer ${GITHUB_TOKEN}` (env var ya configurada en Vercel), mostrando `commit.author.date` como fecha relativa (tooltip con fecha completa). Sin token (dev local) o si la consulta falla/da timeout (6s), muestra "sin verificar" sin romper la página.

## 16. Estado actual (al cierre de esta etapa)

El tablero está funcional, con:
- Mapa con 4 capas (Circuitos, Barrios, Obras, Escuelas) activas/implementadas, panel de Capas y leyenda como overlays.
- Detección de click unificada vía turf (circuito + barrio simultáneos, independiente de capas visibles).
- Layout de dos estados (mapa grande / ficha expandida) con panel lateral Circuito/Barrio.
- Ficha completa de circuito: Resumen, Evolución, Partidos, Territorio, Comparativas, Encuestas (condicional) y Escuelas (siempre visible).
- Cruce circuito↔barrio (`circuito_barrios_cruce.json`) con listas "Otros circuitos/barrios" navegables desde el panel.
- Cobertura territorial: badge de encuesta + rondas por circuito (derivado en runtime de `encuestas_circuitos.json`), recorridos del Gobernador por barrio, tabla de eventos cronológicos con filtros de tipo/año/orden.
- Sistema de Encuestas: listado, resumen por ronda, comparativo entre rondas con KPIs y umbral de variación configurable.
- Escuelas/centros de votación: capa en el mapa + solapa "Escuelas" en la ficha + sección "Votos por escuela" en el panel de barrio, con % de voto peronista por escuela y marca de promedio de Capital.
- Inventario de datos (`lib/data-manifest.js`) y página de estado (`/admin/data-status`) con verificación en vivo contra GitHub.
- Búsqueda de circuitos y barrios, vista agregada de Capital, exportación de ficha a PDF, autenticación básica.

## 17. Próximas tareas (lo que se viene)

- **Pauta publicitaria:** cuando exista el dataset, sumarlo como tercer tipo de evento en `construirEventosPorCircuito` (ya reservado, `pautaData` en `null`).
- **Ficha completa de barrio:** hoy el barrio solo tiene el panel chico (`PanelMiniBarrio`); no existe un equivalente a las solapas de circuito.
- **`cobertura_circuitos.json`:** decidir si se elimina definitivamente ahora que no tiene consumidores (ver sección 6/15) — si se borra, corregir también las referencias que queden en este documento.
- **Huecos de datos de Escuelas (sección 13):** decidir si vale la pena investigar más `007D Cofico`, `0002 Seccional Segunda`, o los 68 barrios sin match de `votos_escuelas_por_barrio.json`, o dejarlos como están (documentados, no bloqueantes).
- **Radios censales (INDEC):** posible capa adicional mencionada en etapas anteriores, mismo patrón que circuitos/barrios — no iniciada.
- **Mantenimiento:** actualizar `next` por la vulnerabilidad de seguridad conocida (no urgente pero pendiente); revisar si conviene cambiar el tile provider por uno apto para producción real.

---

*Documento generado para dar continuidad al proyecto sin pérdida de contexto entre sesiones. Última actualización: sesión de trabajo sobre migración de cobertura a runtime (`encuestas_circuitos.json`), inventario de datos (`lib/data-manifest.js` + `/admin/data-status`) y documentación de las secciones de Encuestas y Escuelas que no estaban reflejadas acá.*
