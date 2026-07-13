# CONTEXTO_PROYECTO.md — Tablero Electoral Córdoba Capital

**Pegar/tener este archivo en la raíz del repo. Sirve como punto de partida para cualquier sesión de Claude Code sobre este proyecto.**

---

## 1. Qué es este proyecto

Tablero web (Next.js + Leaflet) de diagnóstico territorial electoral de **Córdoba Capital** (119 circuitos electorales). Es la versión "Vercel" de un tablero que originalmente se construyó en Power BI para el equipo del Gobernador Martín Llaryora.

**Importante — no confundir con otro proyecto:** existe un segundo tablero, separado, llamado `tablero-lla`, enfocado en La Libertad Avanza, con otra lógica de clasificación (usa como eje al peronismo como rival, no a Llaryora como protagonista). **Este documento es exclusivamente sobre `tablero-electoral`**, el primero.

**Repositorio:** https://github.com/tomigaston/tablero-electoral (repo privado o URL a confirmar — verificar acceso al iniciar sesión de Claude Code).

## 2. Propósito del tablero

Identificar la situación electoral del peronismo cordobés (oficialismo provincial) en los 119 circuitos de Córdoba Capital, comparando el desempeño de Llaryora vs. el desempeño histórico del espacio, para priorizar territorios. Sobre esa base electoral se fue sumando una capa de **cobertura territorial** (encuestas, visitas del Gobernador, y en el futuro pauta publicitaria) para cruzar diagnóstico electoral con actividad de campaña real.

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
- **Autenticación:** Basic Auth vía middleware (`AUTH_USER`/`AUTH_PASS`, o `DISABLE_AUTH=true` en desarrollo).
- **Despliegue:** Vercel, conectado a GitHub.
- **Pendiente de mantenimiento:** `npm audit` marca una vulnerabilidad crítica en `next@14.1.0` con fix disponible (no aplicado todavía porque no se pidió explícitamente).

## 6. Estructura de datos (carpeta `public/data/`)

| Archivo | Contenido | Notas de cruce/matching |
|---------|-----------|--------------------------|
| `circuitos_completo.json` | 119 circuitos × ~54 métricas (shares, turnout, categorías, residuales, etc.) | Clave primaria: `CircuitoKey` (ej. `"13A"`, sin cero a la izquierda) y `Mapkey` (ej. `"013A"`, 4 caracteres, con cero a la izquierda — es el ID que se muestra en la tabla de cobertura y el que matchea contra `circuitos_cordoba.json` y `cobertura_circuitos.json`). |
| `partidos_por_eleccion.json` | Resultados de los top 5 partidos por circuito, para 9 elecciones | Clave: `CircuitoKey`. |
| `barrios_por_circuito.json` | ~486 barrios mapeados a su circuito correspondiente (nombre, población, % del circuito) | Clave: `Mapkey`. Es el dataset "viejo"; para la mayoría de los usos nuevos se prefiere `barrios_geo.json`. |
| `circuitos_cordoba.json` | TopoJSON del polígono de los 119 circuitos | `properties.circuito` = `Mapkey`. |
| `barrios_geo.json` | GeoJSON (no TopoJSON) de 485 barrios: geometría (Polygon/MultiPolygon) + `nombre_barrio`, `tipo_barrio` (BarrioOficial/BarrioNoOficial), `antecedentes_legales`, `centroid_lat/lon`, `poblacion`, `pct_poblacion_en_circuito`, `circuito_principal` (string `"Mapkey - nombre"`), `cantidad_obras`, `obras[]` (programa/descripción/estado embebidos). | Nombres normalizados con `normalizarNombreBarrio` (ver sección 10) para cruzar contra el resto de los datasets de barrio. Hay 16 nombres duplicados exactos dentro del propio archivo (barrios partidos en polígonos no contiguos) — preexistente, no resuelto. |
| `obras_largo.json` | 237 registros de obras públicas; se usan las 118 con `match_poligono: true` | `barrio_normalizado` cruza contra `nombre_barrio` de `barrios_geo.json`. El campo `estado` viene sucio en la fuente (algunos valores son fracciones tipo `"0.18"` en vez de texto de estado) — se muestra tal cual, sin reinterpretar. |
| `circuito_barrios_cruce.json` | Dos mapas: `circuito_to_barrios` (por circuito, lista de barrios con `orden_importancia`, 1 = barrio principal de ese circuito) y `barrio_to_circuitos` (por barrio, lista de circuitos con `orden_importancia`, 1 = circuito principal de ese barrio) | Claves de circuito: `"Mapkey - cirn_nom"` (ej. `"005G - SAN VICENTE"`). Clave de barrio: nombre tal cual (sin normalizar). Cobertura al 100% contra `circuitos_completo.json`; ~35 nombres de barrio no tienen entrada en `barrio_to_circuitos` (mayoría "SD"/placeholders o variantes con abreviaturas). |
| `recorridos_barrios.json` | Visitas del Gobernador por barrio: 61 barrios, 142 visitas en total. Cada visita: `fecha`, `tipo_visita` (`TERRITORIAL` / `INSTITUCIONAL` / `"NO HAY DATOS certeros"`), `contacto_vecinos` (`SI`/`NO`), `link`, `info`. | Clave = nombre de barrio (no siempre coincide exacto con `barrios_geo.json`: mayúsculas/tildes/espacios se resuelven con `normalizarNombreBarrio`). **Dato corrupto conocido:** una visita a "Chateau Carreras" tiene `fecha: "08/10/0205"` (no es ISO) — se excluye en silencio de cualquier cómputo de fechas, no se intenta adivinar la fecha real. |
| `cobertura_circuitos.json` | Cobertura de encuestas: 121 claves, 50 circuitos con `encuestado: true` | Clave = `Mapkey`. 2 claves (`012J`, `005L`) no corresponden a ningún circuito de `circuitos_completo.json` — se ignoran sin problema porque siempre se itera desde los 119 circuitos reales, nunca al revés. Estructura: `{ nombre, encuestado, cantidad_rondas, fechas_rondas[] }`. |
| *(reservado, sin archivo aún)* `pauta_*.json` | Pauta publicitaria por circuito — tercer tipo de evento de cobertura, todavía sin datos. La arquitectura de `construirEventosPorCircuito` (ver sección 9) ya contempla este tipo: sumarlo el día que exista el dato es agregar 1 fetch + unas líneas, sin refactor. |

## 7. Estructura del código

- **`pages/index.js`** — archivo único con casi todo el frontend (por convención del proyecto: no se separaron los componentes en archivos propios). Contiene, en este orden aproximado:
  - Paletas de color y descripciones de categorías (v4 / ML).
  - Componentes reutilizables chicos: `Badge`, `MetricCard`/`MetricCardMini`, `VictoriaIndicator`, `InfoModal`.
  - Helpers: `formatPct`, `formatPP`, `getNumeroBase`, `normalizarNombreBarrio`, `compararMapkey`, `esFechaValida`, `construirEventosPorCircuito`.
  - Las 5 solapas de la ficha completa de circuito: `SolapaResumen`, `SolapaEvolucion`, `SolapaPartidos`, `SolapaTerritorio`, `SolapaComparativas`.
  - `VistaCapital` — tabla agregada de los 119 circuitos, filtrable por categoría.
  - Componentes del panel lateral chico: `ResumenCircuitoMini`, `PanelMiniCircuito`, `PanelMiniBarrio`, `PanelLateral`, `FilaCruce`, `ListaCruceColapsable`.
  - Componentes de cobertura territorial: `BadgeCobertura`, `PillFiltro`, `CeldaEvento`, `TablaEventosCobertura`, `BarraCobertura`.
  - `generarFichaPDF` — genera el HTML de la ficha imprimible.
  - `Home` (export default) — estado global, carga de datos, layout y navegación.
- **`components/MapaCircuitos.js`** — todo lo relacionado al mapa Leaflet: capas (Circuitos, Barrios, Obras), detección de click vía turf (`ClickHandler`), centrado/zoom (`MapController`), panel de Capas y leyenda como overlays flotantes. Tiene su propia copia de `normalizarNombreBarrio` (duplicada a propósito, mismo criterio que en `pages/index.js`, para no importar ese archivo estáticamente y arriesgar SSR con Leaflet).
- **`middleware.js`** — Basic Auth.
- **`App.jsx`** (raíz del repo) — prototipo previo a la migración a Next.js, **huérfano, no se importa desde ningún lado**. No forma parte del build. No tocar salvo que se pida limpiarlo explícitamente.

## 8. Layout y navegación

La página tiene dos estados, controlados por `vistaExpandida`:

- **Estado 1 (default, mapa grande):** el mapa ocupa la columna principal; a la derecha, un panel angosto (`PanelLateral`, ~300px) con tabs **Circuito** / **Barrio** que muestran un resumen chico (`PanelMiniCircuito` / `PanelMiniBarrio`) del circuito/barrio actualmente seleccionado, con botón "Ver ficha completa →".
- **Estado 2 (ficha expandida):** el mapa se achica a una columna angosta (~320px) a la derecha; a la izquierda se muestra, según haya o no un circuito seleccionado, la ficha completa (las 5 solapas) o `VistaCapital` (vista agregada de los 119 circuitos). Se entra clickeando "Ver ficha completa" o el botón de header "📊 Estadísticas de Capital"; se sale con "← Volver al mapa" o "✕ Cerrar".

La leyenda de categorías y el panel de Capas (Circuitos/Barrios/Obras/Escuelas) viven **dentro** de `MapaCircuitos.js` como overlays flotantes sobre el mapa (no como bloques fijos que restan ancho al layout).

## 9. Mecanismo de click en el mapa (circuito ↔ barrio)

Hay dos formas de que se seleccione un circuito y/o un barrio, con lógicas distintas a propósito:

1. **Click directo en el mapa** (`ClickHandler` en `MapaCircuitos.js`, con `@turf/boolean-point-in-polygon`): en un único evento de click, turf determina **de forma independiente y puramente geométrica** qué circuito y qué barrio contienen ese punto exacto, sin importar cuál capa esté visualmente arriba ni cuál esté tildada en el panel de Capas (las capas ya no tienen `onClick` propio). Si el punto no cae dentro de un polígono de alguna de las dos capas, esa selección queda en `null` — no se mantiene la selección anterior. Esto llama a `handleMapClick(circuitoKey, nombreBarrio)` en `pages/index.js`.
2. **Selección no geográfica** (buscador, fila de `VistaCapital`, "circuitos de la zona" en Territorio, links "Otros circuitos/barrios" del panel): acá no hay un punto clickeado, así que `handleSelectCircuito` deriva el **barrio principal** del circuito elegido vía `circuito_barrios_cruce.json` (`orden_importancia: 1`), y `handleSelectBarrio` (usado por los links "Otros barrios en este circuito") solo cambia el barrio sin tocar el circuito activo.

Ambos casos conviven porque resuelven problemas distintos: el click en el mapa quiere la verdad geométrica exacta; las otras vías de selección no tienen un punto y necesitan una heurística razonable (el barrio/circuito "más representativo").

## 10. Capas del mapa

Panel de Capas (checkboxes, overlay flotante arriba a la derecha del mapa). Estado por defecto: `{ circuitos: true, barrios: false, obras: true }`.

- **Circuitos** — capa base, coloreada por categoría v4 (o ML según el modo), con tooltip y resaltado del seleccionado.
- **Barrios** — polígonos con **borde punteado, sin relleno** (para no competir visualmente con el color de circuitos cuando ambas capas están activas). Resaltado del barrio seleccionado con relleno tenue.
- **Obras** — 118 puntos (`CircleMarker`, color índigo `#5C6BC0`), geocodificados en el **centroide del barrio** correspondiente (no tienen lat/lon propia todavía). Cuando varias obras comparten barrio, se separan con un offset circular determinístico alrededor del centroide para que cada una sea un marker clickeable independiente. Click abre un `Popup` (no tooltip) con barrio, programa, descripción y estado.
- **Escuelas** — reservada en el panel de Capas (checkbox deshabilitado, "próximamente"), sin datos ni capa implementada todavía.

## 11. Cobertura territorial (implementado en esta sesión)

Sistema para cruzar el diagnóstico electoral con actividad de campaña real: encuestas y visitas del Gobernador (y a futuro, pauta publicitaria).

### 11.1 Por circuito (badge + rondas)
En `ResumenCircuitoMini` (panel chico, y reutilizado dentro del tab Barrio) y en `SolapaResumen` (ficha completa): badge **"✓ Encuestado"** (verde) / **"○ Sin encuestar"** (gris), y si fue encuestado, cantidad de rondas + lista de fechas, leído directo de `cobertura_circuitos.json` por `Mapkey`.

### 11.2 Por barrio (Recorridos del Gobernador)
En `PanelMiniBarrio` (tab Barrio): si el barrio tiene visitas registradas en `recorridos_barrios.json`, se lista cantidad total + cada visita (fecha, tipo, contacto con vecinos, link clickeable a la nota si existe). No hay ficha completa de barrio todavía (es trabajo futuro).

### 11.3 Barra de cobertura + tabla de eventos (`BarraCobertura` / `TablaEventosCobertura`)
Barra siempre visible debajo del header: "`X / 119 circuitos encuestados (Y%)`" + barra de progreso + fecha de la ronda más reciente + botón "Ver detalle" que despliega la tabla.

**Diseño deliberadamente NO es un Gantt con eje temporal compartido.** Es una tabla donde cada fila es un circuito y cada celda es el N-ésimo evento cronológico de esa fila (columnas "Evento 1", "Evento 2"... hasta el máximo de eventos entre todas las filas visibles). Se descartó el diseño de Gantt (eje de fechas compartido entre filas) porque no aporta valor con este dato y complica mucho la implementación (sincronización de scroll, cálculo de escala temporal).

- **Tipos de evento:** `medicion` (verde, de `cobertura_circuitos.json`), `visita` (azul, de `recorridos_barrios.json` cruzado por circuito), `pauta` (naranja, reservado — sin datos, ver sección 6).
- **Atribución de visitas a circuito — decisión de diseño importante:** un circuito **solo** hereda las visitas del/los barrio(s) donde ese circuito tiene `orden_importancia: 1` en `circuito_to_barrios` (o sea, barrios donde ese circuito es el que concentra más población de ese barrio). Se probó primero un criterio amplio (heredar de *cualquier* barrio que tocara el circuito) y generaba conteos inflados y poco representativos (circuitos como Observatorio o Nueva Córdoba llegaban a 37 eventos por rozar apenas el borde de barrios centrales grandes). Con el criterio actual, el máximo real es **25 eventos** (circuito `0001 · Seccional Primera`), promedio ~1.7, y 48 de 119 circuitos quedan en 0 eventos — es el comportamiento esperado, no un bug.
- **Filtros, en este orden de aplicación:** (1) tipo de evento (pills toggle, los 3 activos por defecto), (2) rango temporal por año (pills generadas dinámicamente a partir de los años presentes en los datos + "Todo"; default = año más reciente con datos, nunca hardcodeado). El N de columnas se recalcula siempre sobre los eventos que sobreviven ambos filtros — filtrar no deja huecos, los eventos restantes se compactan.
- **Orden de filas:** por defecto, ID de circuito ascendente usando `compararMapkey` (comparador natural que separa número base y letra — necesario porque un sort de texto plano ordena mal "0014" antes que "004A"). Alternativa: por fecha del evento más reciente visible (descendente, filas sin eventos al final).
- **Columna de circuito fija** (`position: sticky; left: 0`) para que no se pierda al hacer scroll horizontal con muchas columnas de evento.
- **Tooltip de celda:** custom (no `title` nativo) para que el link de una visita sea clickeable de verdad.
- **Click en fila** → mismo handler que ya existía para navegación desde tablas (`irACircuitoDesdeGrilla`): selecciona el circuito, vuelve a Estado 1 (mapa), dispara el zoom/resaltado normal. No abre ninguna solapa nueva.
- **Sin virtualización** — 119 filas y unos pocos cientos de celdas es manejable con scroll nativo; si el volumen crece mucho más, ahí sí evaluar `react-window`.

## 12. Decisiones de normalización y calidad de datos conocidas

- **`normalizarNombreBarrio`** (duplicada en `pages/index.js` y `components/MapaCircuitos.js`, mismo criterio en ambas): `toUpperCase()` + reemplazo de `º/ª` por `O` + `.normalize('NFD')` con strip de diacríticos (saca tildes) + colapso de espacios + `trim()`. Se usa para cruzar nombres de barrio entre `barrios_geo.json`, `obras_largo.json` y `recorridos_barrios.json`, que no vienen escritos de forma 100% consistente entre sí.
- **Nombres de barrio que NO matchean ni con la normalización:** ~4 en `recorridos_barrios.json` (ej. "Campo de la Rivera", "El Sauce" vs "Los Sauces" en `barrios_geo.json` — son nombres genuinamente distintos, no un problema de formato) y ~32 en `circuito_barrios_cruce.json` → `barrio_to_circuitos` (mayoría placeholders "SD"). No se resolvieron con heurísticas de similitud de texto a propósito, para no asignar datos al polígono equivocado.
- **Fecha corrupta conocida:** visita a "Chateau Carreras" con `fecha: "08/10/0205"` en `recorridos_barrios.json` — se excluye en silencio de cualquier tabla/cómputo (falla el chequeo de formato ISO `esFechaValida`).
- **`estado` de obras sucio:** algunos registros de `obras_largo.json` tienen valores tipo `"0.18"` en el campo `estado` en vez de texto — se muestra tal cual viene, sin reinterpretar.
- **Barrios duplicados dentro de `barrios_geo.json`:** 16 nombres se repiten exactamente (polígonos no contiguos del mismo barrio) — preexistente al trabajo de esta sesión, no resuelto; el lookup por nombre normalizado se queda con la última ocurrencia.

## 13. Estado actual (al cierre de esta etapa)

El tablero está funcional, con:
- Mapa con 3 capas activas (Circuitos, Barrios, Obras) + Escuelas reservada, panel de Capas y leyenda como overlays.
- Detección de click unificada vía turf (circuito + barrio simultáneos, independiente de capas visibles).
- Layout de dos estados (mapa grande / ficha expandida) con panel lateral Circuito/Barrio.
- Ficha completa de circuito (5 solapas) sin cambios de contenido, solo de contenedor.
- Cruce circuito↔barrio (`circuito_barrios_cruce.json`) con listas "Otros circuitos/barrios" navegables desde el panel.
- Cobertura territorial: badge de encuesta + rondas por circuito, recorridos del Gobernador por barrio, y tabla de eventos cronológicos con filtros de tipo/año/orden.
- Búsqueda de circuitos, vista agregada de Capital, exportación de ficha a PDF, autenticación básica.

## 14. Próximas tareas (lo que se viene)

- **Pauta publicitaria:** cuando exista el dataset, sumarlo como tercer tipo de evento en `construirEventosPorCircuito` (ya reservado, `pautaData` en `null`) — no debería requerir tocar `TablaEventosCobertura`.
- **Escuelas:** capa todavía sin datos ni implementación (solo el checkbox reservado en el panel de Capas).
- **Ficha completa de barrio:** hoy el barrio solo tiene el panel chico (`PanelMiniBarrio`); no existe un equivalente a las 5 solapas de circuito.
- **Radios censales (INDEC):** posible capa adicional mencionada en etapas anteriores, mismo patrón que circuitos/barrios — no iniciada.
- **Mantenimiento:** actualizar `next` por la vulnerabilidad de seguridad conocida (no urgente pero pendiente); revisar si conviene cambiar el tile provider por uno apto para producción real.

---

*Documento generado para dar continuidad al proyecto sin pérdida de contexto entre sesiones. Última actualización: sesión de trabajo sobre cobertura territorial (recorridos del Gobernador + cobertura de encuestas + tabla de eventos cronológicos).*
