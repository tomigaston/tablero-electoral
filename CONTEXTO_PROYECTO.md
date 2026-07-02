# CONTEXTO_PROYECTO.md — Tablero Electoral Córdoba Capital

**Pegar/tener este archivo en la raíz del repo. Sirve como punto de partida para cualquier sesión de Claude Code sobre este proyecto.**

---

## 1. Qué es este proyecto

Tablero web (Next.js + Leaflet) de diagnóstico territorial electoral de **Córdoba Capital** (119 circuitos electorales). Es la versión "Vercel" de un tablero que originalmente se construyó en Power BI para el equipo del Gobernador Martín Llaryora.

**Importante — no confundir con otro proyecto:** existe un segundo tablero, separado, llamado `tablero-lla`, enfocado en La Libertad Avanza, con otra lógica de clasificación (usa como eje al peronismo como rival, no a Llaryora como protagonista). **Este documento es exclusivamente sobre `tablero-electoral`**, el primero.

**Repositorio:** https://github.com/tomigaston/tablero-electoral (repo privado o URL a confirmar — verificar acceso al iniciar sesión de Claude Code).

## 2. Propósito del tablero

Identificar la situación electoral del peronismo cordobés (oficialismo provincial) en los 119 circuitos de Córdoba Capital, comparando el desempeño de Llaryora vs. el desempeño histórico del espacio, para priorizar territorios.

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

- **Framework:** Next.js
- **Mapa:** Leaflet + react-leaflet
- **Tiles actuales:** CARTO `light_all` (`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`) — estilo minimalista derivado de OSM, sin nombres de calles/barrios visibles.
- **Datos geográficos:** TopoJSON de los 119 circuitos.
- **Despliegue:** Vercel, conectado a GitHub.

## 6. Estructura de datos (carpeta `public/data/`)

| Archivo | Contenido |
|---------|-----------|
| `circuitos_completo.json` | 119 circuitos × ~54 métricas (shares, turnout, categorías, residuales, etc.) |
| `partidos_por_eleccion.json` | Resultados de los top 5 partidos por circuito, para 9 elecciones |
| `barrios_por_circuito.json` | ~486 barrios mapeados a su circuito correspondiente |
| `circuitos_cordoba.json` | TopoJSON del polígono de los 119 circuitos |

## 7. Componentes clave

- `components/MapaCircuitos.js` — mapa Leaflet con capa de circuitos (GeoJSON), tooltips custom, hover/click handlers, estilos dinámicos según categoría seleccionada y filtros activos.
- `pages/index.js` — página principal, paleta de colores, orquesta filtros y estado.
- `middleware.js` — Basic Auth (variables de entorno `AUTH_USER` / `AUTH_PASS`).

## 8. Estado actual (al cierre de esta etapa)

El tablero está funcional y desplegado, con:
- Capa de circuitos coloreada por categoría (v4 y ML), con filtros.
- Tooltips con datos de shares por elección.
- Búsqueda de circuitos y vista agregada de Capital.
- Autenticación básica.

## 9. Próximas tareas (lo que se viene)

### 9.1 Migración de tile provider
Cambiar el `TileLayer` actual (CARTO `light_all`) por uno con mayor nivel de detalle callejero (nombres de calles, barrios visibles). Primera opción a probar: **CARTO Voyager** (mismo proveedor, cambio mínimo). Si no alcanza el nivel de detalle, evaluar MapTiler o Stadia Maps. Evitar el tile server "standard" de openstreetmap.org en producción por su política de uso restrictiva.

Este cambio es independiente de las capas GeoJSON existentes (circuitos) y futuras (ver 9.2): el tile base es solo el fondo visual.

### 9.2 Nuevas capas de información
Agregar, manteniendo la capa de circuitos como base:
- **Escuelas** (puntos de votación): `Marker`/`CircleMarker` con tooltip.
- **Obras públicas**: mezcla de puntos, líneas y/o polígonos según el tipo de obra (a definir según cómo venga el listado). Requiere geolocalización — si el listado no trae coordenadas, habrá que geocodificar direcciones (pendiente de definir método: Nominatim, Google Geocoding, etc.).
- Cada capa nueva debe poder activarse/desactivarse de forma independiente (layer control o panel de checkboxes).
- Posible capa adicional: radios censales (INDEC) como polígono overlay, mismo patrón que circuitos.

### 9.3 Prioridad de trabajo
1. Migración de tiles (bajo riesgo, cambio acotado, validación visual rápida).
2. Arquitectura de capas nuevas (escuelas primero, por tener geolocalización más simple).
3. Obras (más compleja por la variedad de geometrías y la calidad incierta de los datos de origen).

---

*Documento generado para dar continuidad al proyecto sin pérdida de contexto entre sesiones.*
