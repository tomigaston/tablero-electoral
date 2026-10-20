// Inventario de public/data/. Fuente de verdad para /admin/data-status.
//
// Convención de commits para archivos de public/data/:
//   data(nombre_archivo): qué cambió — fuente: X.xlsx
//   ej: data(encuestas_circuitos.json): sumar ronda julio — fuente: ENCUESTA CIRCUITOS CÓRDOBA CAPITAL 19-07-26.xlsx
//
// Si un cambio altera el esquema (campos nuevos/renombrados) o el estado de un archivo
// (activo/deprecado/en_desarrollo/legacy), actualizar también la entrada correspondiente
// acá abajo en el mismo commit (o uno inmediatamente siguiente) — este archivo no se
// regenera solo, es documentación viva mantenida a mano.
//
// Campos completados a partir de CONTEXTO_PROYECTO.md y CONTINUIDAD_ESCUELAS_v2.md
// (CONTINUIDAD_CHAT_v2.md no existe en el repo ni se encontró con ese nombre exacto;
// CONTINUIDAD_ESCUELAS_v2.md es el documento de continuidad más reciente disponible y
// cubre en detalle el origen/esquema de escuelas_capital.json y los votos_escuelas_por_*.json).
// Donde ninguno de los dos documenta un dato, el campo queda vacío con un TODO explícito
// en vez de inventarlo.

const dataManifest = [
  {
    archivo: 'circuitos_completo.json',
    descripcion: '119 circuitos × ~54 métricas electorales (shares, turnout, categorías v4/ML, residuales, victorias, posiciones, etc.), 9 elecciones (G07–L25).',
    alimenta: [
      'Home (estado raíz, datosCircuito)',
      'VistaCapital',
      'MapaCircuitos (datosLookup, capa Circuitos)',
      'SolapaTerritorio',
      'PanelMiniBarrio / PanelMiniCircuito',
      'BarraCobertura / TablaEventosCobertura',
      'ListadoEncuestasCircuitos',
      'generarFichaPDF',
      'buscador de circuitos',
    ],
    claveCruce: 'CircuitoKey (sin cero a la izquierda, ej. "13A") y Mapkey (4 caracteres con cero a la izquierda, ej. "013A") — ambas claves conviven en el mismo registro.',
    fuenteOriginal: '', // TODO: no documentado. CONTEXTO_PROYECTO.md §1 solo dice que el tablero "originalmente se construyó en Power BI", sin precisar el archivo/export fuente de este JSON puntual.
    estado: 'activo',
    notas: 'Dataset primario del tablero, todo lo demás cruza contra él. Ver CONTEXTO_PROYECTO.md §6.',
  },
  {
    archivo: 'partidos_por_eleccion.json',
    descripcion: 'Resultados de los top 5 partidos por circuito, para 9 elecciones.',
    alimenta: ['SolapaPartidos', 'generarFichaPDF'],
    claveCruce: 'CircuitoKey, anidado por código de elección (G23, G19, L25, L21, Int19, etc.).',
    fuenteOriginal: '', // TODO: no documentado.
    estado: 'activo',
    notas: 'Ver CONTEXTO_PROYECTO.md §6.',
  },
  {
    archivo: 'barrios_por_circuito.json',
    descripcion: '~486 barrios mapeados a su circuito correspondiente (nombre, población, % del circuito).',
    alimenta: [],
    claveCruce: 'Mapkey.',
    fuenteOriginal: '', // TODO: no documentado.
    estado: 'eliminado',
    notas: 'ELIMINADO del repo (2026-07-30): reemplazado por barrios_por_circuito_completo.json en SolapaTerritorio y generarFichaPDF. Auditado antes de borrar — mismo universo de barrios en los 119 circuitos (ningún barrio nuevo, ninguno menos), solo 12 circuitos con correcciones puntuales de población/% (11 en la fila catch-all "Sin Barrio - Circuito X", 1 en un barrio real: ITUZAINGO II). Este archivo también se usó como puente circuito→seccional→barrios en el matching de escuelas (CONTINUIDAD_ESCUELAS_v2.md §2), como insumo de un pipeline offline, no como fetch en runtime del tablero.',
  },
  {
    archivo: 'barrios_por_circuito_completo.json',
    descripcion: '119 circuitos → { nombre_circuito, barrios: [{ nombre, tipo, poblacion, pct_en_circuito, orden_importancia }] }, ~486 barrios en total. Reemplaza a barrios_por_circuito.json (mismo universo de barrios, valores corregidos en 12 circuitos, más el campo tipo y nombre_circuito).',
    alimenta: ['SolapaTerritorio', 'generarFichaPDF (tabla "Barrios del circuito" y comparación población estimada vs. padrón)'],
    claveCruce: 'Mapkey.',
    fuenteOriginal: '', // TODO: no documentado. Generado desde la hoja completa del padrón poblacional (mencionado por el usuario al subir el archivo, sin nombre de archivo fuente puntual).
    estado: 'activo',
    notas: 'IMPORTANTE: pese al nombre, orden_importancia acá NO es un ranking interno del circuito (no es "1..N por población dentro de este circuito", puede repetirse el mismo valor varias veces en un mismo circuito). Es el mismo dato y mismos valores que circuito_barrios_cruce.json → circuito_to_barrios[...].orden_importancia: el ranking del BARRIO sobre sus propios circuitos (dirección barrio→circuito), simplemente copiado acá. No usar este campo para lógica de "barrio principal de un circuito" ni para atribución/herencia (esa lógica sigue viviendo en circuito_barrios_cruce.json, ver esa entrada) — acá solo se usa poblacion × pct_en_circuito para la estimación de población, nunca orden_importancia.',
  },
  {
    archivo: 'circuitos_cordoba.json',
    descripcion: 'TopoJSON del polígono de los 119 circuitos.',
    alimenta: ['MapaCircuitos (capa Circuitos, MapController, ClickHandler)'],
    claveCruce: 'properties.circuito (= Mapkey), matcheado contra datosLookup en MapaCircuitos.',
    fuenteOriginal: '', // TODO: no documentado.
    estado: 'activo',
    notas: 'Ver CONTEXTO_PROYECTO.md §5/§6.',
  },
  {
    archivo: 'barrios_geo.json',
    descripcion: 'GeoJSON (no TopoJSON) de 485 barrios: geometría (Polygon/MultiPolygon) + nombre_barrio, tipo_barrio (BarrioOficial/BarrioNoOficial), antecedentes_legales, centroid_lat/lon, poblacion, pct_poblacion_en_circuito, circuito_principal. Ya NO trae cantidad_obras/obras[] embebidas (era una copia estática de obras_capital.json que se desincronizaba en silencio del pipeline nuevo — mismo problema que cobertura_circuitos.json; se eliminó y PanelMiniBarrio en pages/index.js ahora deriva las obras de un barrio filtrando obrasEnriquecidas por `barrio` en runtime, igual que ObrasPanel).',
    alimenta: [
      'MapaCircuitos (capa Barrios, MapController, ClickHandler)',
      'barriosGeoLookup → PanelMiniCircuito / PanelMiniBarrio',
      'buscador de barrios',
    ],
    claveCruce: 'nombre_barrio — match exacto para las capas del mapa; normalizado con normalizarNombreBarrio() para los lookups (barriosGeoLookup, recorridosLookup, votosEscuelasBarrioLookup).',
    fuenteOriginal: '', // TODO: no documentado en CONTEXTO_PROYECTO.md ni CONTINUIDAD_ESCUELAS_v2.md.
    estado: 'activo',
    notas: '16 nombres duplicados exactos dentro del propio archivo (barrios partidos en polígonos no contiguos), preexistente y no resuelto; el lookup por nombre se queda con la última ocurrencia. 7 de esos fragmentos tenían circuito_principal incorrecto (join por nombre en vez de geometría), recalculado con booleanPointInPolygon. poblacion de fragmentos duplicados es un agregado por nombre, no por polígono individual (sin fuente para desagregar). Ver CONTEXTO_PROYECTO.md §6/§12.',
  },
  {
    archivo: 'obras_largo.json',
    descripcion: '237 registros de obras públicas; se usaban las 118 con match_poligono: true. Geocodificadas por centroide de barrio (no traía lat/lon propia).',
    alimenta: [],
    claveCruce: 'barrio_normalizado (normalizado con normalizarNombreBarrio()) contra barriosLookup.',
    fuenteOriginal: '', // TODO: no documentado.
    estado: 'eliminado',
    notas: 'ELIMINADO del repo (2026-07-29): reemplazado por obras_capital.json, que trae lat/lon propia por obra (ya no hace falta geocodificar por centroide) y un esquema más rico (reparticion, tipo_obra, prioridad, fechas, fuente_barrio). El código que lo geocodificaba (offsetCentroide, barriosLookup en MapaCircuitos.js) se retiró en el mismo cambio. La lista de obras de PanelMiniBarrio sigue sin verse afectada: lee el array obras[] embebido en barrios_geo.json, no este archivo. Ver CONTEXTO_PROYECTO.md §6/§12 (desactualizado, pendiente de corregir esas líneas).',
  },
  {
    archivo: 'obras_capital.json',
    descripcion: '564 obras públicas de Capital: id, nombre, reparticion, tipo_obra, estado, fecha_inicio, fecha_finalizacion, fecha_disponibilidad_inaugurar, prioridad, observaciones, lat/lon propia, barrio, fuente_barrio, distancia_barrio_km. Reemplaza a obras_largo.json.',
    alimenta: [
      'MapaCircuitos (capa Obras — mismo toggle/layer/popup que ya existía, apuntando a esta fuente)',
      'SolapaObras (7ma+ solapa de la ficha completa de circuito) → ObrasPanel',
      'PanelMiniCircuito / PanelMiniBarrio (badge "Obras cercanas (N)" — en barrio expande ObrasPanel inline y colapsable, mismo criterio que Escuelas mientras no exista ficha de barrio)',
      'lib/obrasCercanas.js (obrasCercanasAPunto / obrasCercanasABarrio / obrasCercanasACircuito / circuitoMapkeyDeObra)',
      'pages/admin/data-status.js (tabla "Obras pendientes de geolocalizar")',
    ],
    claveCruce: 'Ninguna para la capa del mapa (cada obra trae su propia lat/lon, cuando existe). obra.barrio es texto directo, ya resuelto — no requiere normalizarNombreBarrio() para mostrarse en el popup, pero sí se normaliza para cruzarlo contra circuito_barrios_cruce.json (circuitoMapkeyDeObra) y contra barrios_geo.json (obrasCercanasABarrio).',
    fuenteOriginal: '', // TODO: no documentado — pendiente de un CONTINUIDAD_OBRAS.md o similar si se agrega.
    estado: 'activo',
    notas: '526/564 con lat/lon (526 = 511 fuente_barrio:"geometrico" + 15 "cercano_aproximado"); 543/564 con barrio asignado (526 con coords + 17 "manual", resueltas offline vía obras_barrio_manual.json — ver esa entrada). Las 38 sin lat/lon (17 "manual" + 21 "descartado") no se grafican en el mapa por diseño; las 21 "descartado" (sin lat/lon Y sin barrio) tampoco pueden aparecer en ningún listado por barrio/circuito — quedan en la tabla "Obras pendientes de geolocalizar" de /admin/data-status. fuente_barrio tiene un 4to valor no anticipado originalmente, "descartado" — se trata igual que ausente/null, sin lógica especial. Color de marker por estado (no por tipo_obra): tipo_obra está muy concentrado en 2 valores (Plaza 305 + Alumbrado 220 = 93% de 564), mientras que estado (Por relevar/Relevado/En ejecución/Finalizado/Finalizado — Inaugurable) es más balanceado y más accionable para el uso de campaña del tablero — "Finalizado — Inaugurable" se destaca en verde por ser el estado con mayor valor de PR (obra lista para acto de inauguración). Circuito de cada obra: se deriva del barrio (circuitoMapkeyDeObra en lib/obrasCercanas.js), NO geométricamente aparte — mismo criterio ya establecido en circuito_barrios_cruce.json → barrio_to_circuitos → orden_importancia: 1, así las 17 obras "manual" (sin lat/lon) también consiguen circuito. Verificado (2026-07-29): 514/543 obras con barrio consiguen circuito así; 29 sin match son siglas/abreviaturas que no son nombres de barrio reales (ej. "A.T. E.", "CO.VI.CO.", "S.E.P.", "SD"), no forzadas. obrasCercanasACircuito usa @turf/centroid (dependencia nueva) sobre circuitos_cordoba.json reparseado a GeoJSON en pages/index.js (duplica el topojson.feature() que ya hace MapaCircuitos.js internamente — aceptado a propósito, ver comentario en el código).',
    campos: [
      { campo: 'id', alimenta: 'Key de React de cada marker (junto al índice, porque id puede repetirse si dos obras comparten nombre).' },
      { campo: 'nombre', alimenta: 'Título del popup de cada obra y de cada fila en ObrasPanel.' },
      { campo: 'reparticion', alimenta: 'Subtítulo del popup (junto a tipo_obra).' },
      { campo: 'tipo_obra', alimenta: 'Subtítulo del popup y de cada fila en ObrasPanel. No determina el color del marker/badge (ver notas).' },
      { campo: 'estado', alimenta: 'Color de relleno del marker (COLOR_OBRA_ESTADO) + texto destacado en el popup + leyenda "Obras" del mapa + color/filtro <select> por estado en ObrasPanel.' },
      { campo: 'fecha_inicio / fecha_finalizacion / fecha_disponibilidad_inaugurar', alimenta: 'Bloque de fechas en el popup y en cada fila de ObrasPanel (se omite cada línea si el campo es null).' },
      { campo: 'prioridad', alimenta: 'Línea "Prioridad: X" en el popup y en ObrasPanel, si está presente.' },
      { campo: 'observaciones', alimenta: 'Texto en cursiva al final del popup y de cada fila en ObrasPanel, si está presente.' },
      { campo: 'lat / lon', alimenta: 'Posición del CircleMarker y único criterio de obrasCercanasAPunto/ACircuito/ABarrio (distancia geométrica real). Si cualquiera de los dos es null, la obra no se grafica ni entra en "Obras cercanas", pero puede seguir apareciendo en "Obras en este barrio/circuito" vía el campo barrio.' },
      { campo: 'barrio', alimenta: 'Línea de barrio en el popup; sección "Obras en este barrio" de ObrasPanel (match normalizado); circuitoMapkeyDeObra (deriva el circuito vía circuito_barrios_cruce.json) para la sección "Obras en este circuito".' },
      { campo: 'fuente_barrio', alimenta: 'Si es "cercano_aproximado", agrega la aclaración "(barrio aproximado, a X km)" en el popup del mapa y en la fila de ObrasPanel, en color de advertencia, usando distancia_barrio_km.' },
      { campo: 'distancia_barrio_km', alimenta: 'Solo se muestra cuando fuente_barrio es "cercano_aproximado" (ver campo anterior); en el resto de los casos es null y no se usa.' },
    ],
  },
  {
    archivo: 'obras_barrio_manual.json',
    descripcion: 'Mapeo nombre de obra → barrio (17 claves), usado como insumo offline para resolver el barrio de las obras sin lat/lon propia (las 17 con fuente_barrio: "manual" en obras_capital.json).',
    alimenta: [],
    claveCruce: 'Nombre de obra (texto directo, sin normalizar).',
    fuenteOriginal: '',
    estado: 'activo',
    notas: 'Documentación/trazabilidad, no un fetch en runtime: el resultado de este cruce ya está mergeado dentro de obras_capital.json (campo barrio de las 17 obras "manual"). El código del tablero no lee este archivo directamente — solo se documenta acá para dejar registro de cómo se resolvió ese fallback, igual que fuenteOriginal en otras entradas. Verificado (2026-07-29): las 17 claves matchean 1 a 1 contra las 17 obras fuente_barrio:"manual" de obras_capital.json, sin discrepancias de barrio ni claves huérfanas. Si en el futuro se necesita releer/regenerar ese cruce en vivo, sería un cambio de alcance distinto al de esta entrada.',
  },
  {
    archivo: 'circuito_barrios_cruce.json',
    descripcion: 'Dos mapas: circuito_to_barrios (por circuito, lista de barrios con orden_importancia, 1 = principal) y barrio_to_circuitos (por barrio, lista de circuitos con orden_importancia, 1 = principal).',
    alimenta: [
      'construirEventosPorCircuito (atribución de visitas tipo "visita")',
      'PanelMiniCircuito ("Otros barrios en este circuito")',
      'PanelMiniBarrio ("Otros circuitos en este barrio")',
      'Home: handleSelectCircuito / handleSelectBarrioDesdeBusqueda',
    ],
    claveCruce: 'circuito_to_barrios usa "Mapkey - cirn_nom" (ej. "005G - SAN VICENTE"); barrio_to_circuitos usa el nombre de barrio tal cual (sin normalizar). Cada entrada trae también barrio_normalizado (pasado por normalizarNombreBarrio()) para cruzar contra barriosGeoLookup/recorridosLookup.',
    fuenteOriginal: '', // TODO: no documentado.
    estado: 'activo',
    notas: 'Cobertura 100% contra circuitos_completo.json; ~35 nombres de barrio no tienen entrada en barrio_to_circuitos (mayoría "SD"/placeholders o variantes con abreviaturas). Ver CONTEXTO_PROYECTO.md §6.',
  },
  {
    archivo: 'encuestas_circuitos.json',
    descripcion: 'Encuestas de circuitos electorales por ronda: por circuito, cantidad_rondas y detalle de cada ronda (fecha, preguntas/resultados). Fuente viva de cobertura de encuestas del tablero.',
    alimenta: [
      'SolapaResumen (badge de cobertura, vía coberturaDesdeEncuesta)',
      'ResumenCircuitoMini (dentro de PanelMiniCircuito y PanelMiniBarrio)',
      'ListadoEncuestasCircuitos',
      'SolapaEncuestas (recibe el registro ya resuelto)',
      'SeccionIntencionVoto (components/IntencionVotoGobernador.js): escenarios de intención de voto para Gobernador, en la solapa Encuestas del circuito y en el Resumen del barrio (vía el circuito principal)',
      'Reporte PDF (components/reporte): secciones Encuestas e Intención de voto — Gobernador',
      'Home: coberturaResumen / eventosPorCircuito (evento tipo "medicion") / BarraCobertura / TablaEventosCobertura',
    ],
    claveCruce: 'CircuitoKey, resuelto por buscarEncuestaCircuito(): intenta match directo por CircuitoKey y, si falla, prueba invirtiendo el orden número/letra (ej. "14A" ↔ "A14") — claves sin match se descartan en silencio.',
    fuenteOriginal: '', // TODO: no documentado en CONTEXTO_PROYECTO.md ni CONTINUIDAD_ESCUELAS_v2.md (no hay ningún archivo de continuidad sobre encuestas en el repo). Se sabe por otras sesiones que el insumo crudo son planillas tipo "ENCUESTA CIRCUITOS CÓRDOBA CAPITAL dd-mm-aa.xlsx" procesadas con una skill dedicada, pero no está documentado dentro del repo — dejar como TODO hasta que se agregue un CONTINUIDAD_ENCUESTAS.md o similar.
    estado: 'activo',
    notas: 'Reemplazó a cobertura_circuitos.json como fuente de cobertura (ver ese archivo abajo, deprecado). Verificado en esta sesión: 77/119 circuitos con cantidad_rondas > 0; 2 claves del archivo sin match contra ningún CircuitoKey ("5L", "12J").',
    // Impacto por campo — a qué elemento visible del tablero alimenta cada uno.
    // Documentación de código, no necesariamente reflejada todavía en /admin/data-status.
    campos: [
      { campo: '(clave del objeto raíz, ej. "A14", "5D")', alimenta: 'Código de circuito (CircuitoKey). Resuelto por buscarEncuestaCircuito() en TODOS los puntos de consumo de esta sección: badge de cobertura, ListadoEncuestasCircuitos, SolapaEncuestas, coberturaResumen/BarraCobertura/TablaEventosCobertura.' },
      { campo: 'nombre_circuito', alimenta: 'No consumido en el código actual (campo presente en el JSON pero sin lectura en pages/index.js) — el nombre que se muestra en la UI viene siempre de circuitos_completo.json (cirn_nom), no de acá.' },
      { campo: 'cantidad_rondas', alimenta: 'Badge de encuesta (BadgeCobertura en ResumenCircuitoMini/SolapaResumen, vía coberturaDesdeEncuesta) + contador de rondas en el listado "Circuitos con encuesta" (ListadoEncuestasCircuitos) + numerador de la barra global "X/119 circuitos encuestados" (BarraCobertura, vía coberturaResumen).' },
      { campo: 'tiene_comparativo', alimenta: 'Controla si SolapaEncuestas muestra el toggle Resumen/Comparativo (si es false, solo se ve el Resumen de la última ronda).' },
      { campo: 'rondas[].fecha', alimenta: 'fechas_rondas mostradas en ResumenCircuitoMini y SolapaResumen; opciones del <select> de ronda en SolapaEncuestas; fecha de cada evento tipo "medicion" en TablaEventosCobertura (y la fecha más reciente que muestra BarraCobertura).' },
      { campo: 'rondas[].preguntas["Intención voto Gobernador - <escenario>"]', alimenta: 'SeccionIntencionVoto y la sección "Intención de voto — Gobernador" del reporte PDF. Cada escenario es una pregunta cuyo nombre es el prefijo + el nombre del escenario, con una categoría por candidato (lista de candidatos distinta según el escenario). Se leen vía lib/intencionVoto.js y se muestran tal cual vienen, sin normalizar porcentajes. Escenarios cargados al 2026-10-10: 3 rondas (2026-09-01: 5 escenarios en 5 circuitos; 2026-09-02: 5 en 6 circuitos; 2026-10-01: 6 en 5 circuitos), ningún circuito con escenarios en dos rondas todavía (el comparativo entre rondas aparecerá cuando haya una segunda ronda en el mismo circuito). Validación: scripts/validar_escenarios_gobernador.py.' },
      { campo: 'rondas[].preguntas', alimenta: 'Contenido del bloque Encuestas (components/EncuestasBlock.js + lib/encuestasBloque.js: pantalla, Generar reporte y Exportar ficha). Cada indicador se declara en GRUPOS de lib/encuestasBloque.js con su familia (A escalar / B composición / C ranking).' },
    ],
  },
  {
    archivo: 'encuestas_metadata.json',
    descripcion: 'Configuración global de encuestas (umbral_variacion_pp) y registro de la intención de voto para Gobernador (escenarios_gobernador: prefijo de la pregunta, candidatos con su nombre para mostrar, alias de nombres y notas/numeración por escenario). No son datos por circuito.',
    alimenta: ['SolapaEncuestas (prop metadata, umbral del Resumen de ronda)', 'SeccionIntencionVoto y lib/intencionVoto.js (escenarios_gobernador)', 'Reporte PDF (components/reporte): sección Intención de voto — Gobernador', 'scripts/validar_escenarios_gobernador.py (valida contra este registro)'],
    claveCruce: '', // No aplica: es config global, no cruza por circuito/barrio.
    fuenteOriginal: '', // TODO: no documentado.
    estado: 'activo',
    notas: 'TODO: no documentado en CONTEXTO_PROYECTO.md ni CONTINUIDAD_ESCUELAS_v2.md — no hay doc de continuidad sobre la sección Encuestas en el repo.',
  },
  {
    archivo: 'cobertura_circuitos.json',
    descripcion: 'Snapshot fijo (histórico) de cobertura de encuestas: 121 claves, 50 circuitos con encuestado: true. Estructura { nombre, encuestado, cantidad_rondas, fechas_rondas[] }.',
    alimenta: [],
    claveCruce: 'Mapkey.',
    fuenteOriginal: '',
    estado: 'deprecado',
    notas: 'DEPRECADO: la fuente viva de cobertura de encuestas es encuestas_circuitos.json (ver esa entrada arriba) — la cobertura se deriva ahora en runtime con coberturaDesdeEncuesta()/buscarEncuestaCircuito() en pages/index.js, sin leer este archivo. Se conserva el archivo en el repo sin borrarlo (pendiente de decidir si se elimina definitivamente). 2 claves ("012J", "005L") no correspondían a ningún circuito real de circuitos_completo.json. Ver CONTEXTO_PROYECTO.md §6 (documentación desactualizada: todavía lo describe como fuente viva en §6/§115/§125, hay que corregir esas líneas si se termina de retirar el archivo).',
  },
  {
    archivo: 'recorridos_barrios.json',
    descripcion: 'Visitas del Gobernador por barrio: 61 barrios, 142 visitas en total. Cada visita: fecha, tipo_visita (TERRITORIAL/INSTITUCIONAL/"NO HAY DATOS certeros"), contacto_vecinos (SI/NO), link, info.',
    alimenta: [
      'PanelMiniBarrio ("Recorridos del Gobernador")',
      'construirEventosPorCircuito (evento tipo "visita", solo para barrios con orden_importancia: 1)',
    ],
    claveCruce: 'Nombre de barrio normalizado con normalizarNombreBarrio() (no siempre coincide exacto con barrios_geo.json sin normalizar).',
    fuenteOriginal: '', // TODO: no documentado.
    estado: 'activo',
    notas: 'Dato corrupto conocido: una visita a "Chateau Carreras" tiene fecha: "08/10/0205" (no ISO) — se excluye en silencio de cualquier cómputo de fechas (falla esFechaValida), no se intenta adivinar la fecha real. Ver CONTEXTO_PROYECTO.md §6/§12.',
    // Impacto por campo — a qué elemento visible del tablero alimenta cada uno.
    // Documentación de código, no necesariamente reflejada todavía en /admin/data-status.
    campos: [
      { campo: '(clave del objeto raíz = nombre de barrio)', alimenta: 'Clave de cruce (normalizada con normalizarNombreBarrio()) para el lookup que usa PanelMiniBarrio, y para construirEventosPorCircuito vía barrio_normalizado de circuito_barrios_cruce.json.' },
      { campo: 'total_visitas', alimenta: 'Cantidad total mostrada en el encabezado de "Recorridos del Gobernador" en PanelMiniBarrio.' },
      { campo: 'visitas[].fecha', alimenta: 'Fecha de cada visita listada en PanelMiniBarrio; fecha del evento tipo "visita" en TablaEventosCobertura (solo para barrios con orden_importancia: 1 en circuito_to_barrios).' },
      { campo: 'visitas[].tipo_visita', alimenta: 'Etiqueta TERRITORIAL/INSTITUCIONAL/"NO HAY DATOS certeros" en cada visita de PanelMiniBarrio, y en el detalle del evento "visita" en CeldaEvento (TablaEventosCobertura).' },
      { campo: 'visitas[].contacto_vecinos', alimenta: 'Indicador SI/NO en cada visita listada en PanelMiniBarrio.' },
      { campo: 'visitas[].link', alimenta: 'Link clickeable a la nota de prensa en PanelMiniBarrio y en el tooltip custom de CeldaEvento (TablaEventosCobertura).' },
      { campo: 'visitas[].info', alimenta: 'Texto descriptivo de la visita mostrado en PanelMiniBarrio.' },
    ],
  },
  {
    archivo: 'pautas_barrios.json',
    descripcion: 'Pauta digital de Córdoba Capital (Meta y Google) generada por scripts/generar_pauta_capital.py directo desde el crudo Contexto/Pauta RRSS_GLOBAL.xlsx (hoja GLOBAL_ImportRange, acumulado: cada carga trae lo viejo y lo nuevo y se pisa todo). Tres buckets: `barrios` (clave = nombre oficial del barrio), `circuitos_sin_barrio` (clave = CircuitoKey, ej. "10A") y `toda_capital` (pauta de toda la ciudad, aplica a todos). Cada entrada es una pieza para un destino: una fila del crudo que nombra N barrios genera N entradas con las métricas completas (no se prorratean; `fila_origen` es el número de fila del crudo y se repite). Las filas que no entran (otro departamento, alcance ambiguo, barrios sin reconocer) NO están en el archivo; el motivo está en el archivo de verificación que genera scripts/verificacion_pauta_capital.py.',
    alimenta: [
      'derivarPautaPorCircuito (lib/pautaPorCircuito.js): piezas únicas por circuito; de ahí salen las tarjetas (lib/pautaResumen.js), la capa Pauta del mapa (lib/pautaMapa.js) y la pestaña "Pauta por circuito" (components/VistaPautaCircuito.js)',
      'construirEventosPorCircuito (evento tipo "pauta", vía buscarPautaCircuito — tercera fuente de eventos junto a mediciones y visitas)',
      'SolapaPautaBarrio / FilaPauta (solapa "Pauta" de la ficha de barrio) y BloqueAlcanceCapital (toda_capital activa)',
      'htmlPautaPDF / htmlPautaCircuitoPDF (sección "Pauta publicitaria" del PDF de ficha y del reporte)',
    ],
    claveCruce: 'Nombre oficial de barrio (clave del bucket `barrios`, normalizado con normalizarNombreBarrio()); para atribuir pautas a un CIRCUITO se usa `pauta.circuito` si viene (código de LOCALIDAD o número de la audiencia) y, si no, el circuito principal del barrio (circuito_principal de barrios_geo.json; fallback circuito_barrios_cruce.json con orden_importancia 1).',
    fuenteOriginal: 'Pauta RRSS_GLOBAL.xlsx, hoja GLOBAL_ImportRange (carga semanal; se versiona en Contexto/). Proceso: docs/pauta-capital-carga-semanal.md. Reglas: manual metodológico "Pauta Digital, Córdoba Capital".',
    estado: 'activo',
    notas: 'No existe pautas_circuitos.json: la vista por circuito se deriva en runtime. Estados Vigente/Finalizada/Observada/Programada/S/D (el JSON anterior a la migración traía ACTIVO/INACTIVO; lib/estadoPauta.js acepta los dos). "Activa" tiene una sola definición en todo el tablero (pautaEstaVigente): estado Vigente e INICIO <= hoy <= FIN. La pauta de toda_capital puede estar activa pero no cuenta como cobertura de ningún barrio ni circuito. Solo se aplica lo confirmado por el área: alias de barrios en scripts/config_pauta/alias_barrios.json; lo que no se entiende queda afuera.',
    // Impacto por campo — a qué elemento visible del tablero alimenta cada uno.
    campos: [
      { campo: '(clave del bucket barrios = nombre oficial de barrio)', alimenta: 'Clave de cruce para obtenerPautasDeBarrio y para asignar la pieza a su circuito principal.' },
      { campo: 'pautas[].fila_origen', alimenta: 'Número de fila del crudo. Key de React; en la vista por circuito se usa para contar las repeticiones de una misma pieza.' },
      { campo: 'pautas[].cod_contenido', alimenta: 'No mostrado en UI. Es la clave de duplicados del generador (junto con campaña, título y destino).' },
      { campo: 'pautas[].campania / titulo_pieza', alimenta: 'Título y campaña de la card (ficha de barrio, vista por circuito, PDF, mapa) y búsqueda por pieza.' },
      { campo: 'pautas[].eje / ministerio / solicitado_por / duracion_dias / material.utms', alimenta: 'Se leen del crudo pero no se muestran en ninguna pantalla.' },
      { campo: 'pautas[].plataforma / plataforma_origen', alimenta: 'plataforma (META o GOOGLE: todo lo que no es "Meta" va a GOOGLE) define las etiquetas de métricas y el filtro; plataforma_origen conserva el valor del crudo.' },
      { campo: 'pautas[].objetivo_campana / tipo_pauta / material.tipo', alimenta: 'Línea de detalle de la card y del PDF.' },
      { campo: 'pautas[].material.link / redes_publicadas.ig,fb,yt', alimenta: 'Botón "Ver material" (solo si es URL con http) y enlaces por red; Excel de eventos.' },
      { campo: 'pautas[].inicio / fin', alimenta: 'Vigencia mostrada y predicado único de activa (pautaEstaVigente); `inicio` es la fecha del evento "pauta" del cronograma. Fechas que no son fechas reales del crudo vienen como null.' },
      { campo: 'pautas[].estado', alimenta: 'Etiqueta de estado (Vigente/Finalizada/Observada/Programada/S/D) y, junto con inicio/fin, la definición de activa.' },
      { campo: 'pautas[].fecha_envio', alimenta: 'No mostrado. Desempate entre duplicados en el generador.' },
      { campo: 'pautas[].metricas_ejecutadas', alimenta: 'Alcance/visualizaciones, frecuencia, CPM/CPV e inversión ejecutados, en la card, el detalle de la vista por circuito, el tooltip del cronograma y el PDF. Nunca se suman entre entradas.' },
      { campo: 'pautas[].circuito / circuito_nombre', alimenta: 'circuito (CircuitoKey) manda sobre el circuito principal del barrio al asignar la pieza; circuito_nombre no se muestra.' },
      { campo: 'pautas[].destino_tablero', alimenta: 'barrio / circuito_sin_barrio / toda_capital: define la cobertura dirigida (esPautaDirigida) y el bloque "Alcance Capital".' },
      { campo: 'pautas[].observaciones', alimenta: 'No se muestra. Avisos de la carga (ítems de audiencia que no se reconocieron).' },
    ],
  },
  {
    archivo: 'escuelas_capital.json',
    descripcion: 'Catálogo de 1.438 escuelas de Capital (de 1.441 originales IDECOR, 3 filtradas por coordenadas inválidas), con lat/lon, circuito_mapkey/circuito_nombre, y — si es_centro_votacion: true — n_mesas, votos_validos, votos_peronismo, pct_peronismo, confianza (verificado/pendiente_revision). Incluye promedio_capital_pct: 45.8 a nivel raíz.',
    alimenta: ['MapaCircuitos (capa Escuelas, ploteada por lat/lon propia de cada escuela)'],
    claveCruce: 'Ninguna para la capa del mapa (cada escuela trae su propia lat/lon); esc.cue se usa como id/key de React.',
    fuenteOriginal: 'Catálogo IDECOR (WFS) filtrado a Capital + Carta Marina "LUGARES_DE_VOTACION_-_ELECCIONES_NACIONALES_2023.xlsx" (hoja CAPITAL) + resultados por mesa "GOB_2023.xlsx" (hoja Gob_2023), matcheados por fuzzy matching + curación manual. Ver CONTINUIDAD_ESCUELAS_v2.md §2/§3/§5.1.',
    estado: 'activo',
    notas: '438 escuelas físicas vinculadas a CUE (431 nombres originales de Carta Marina + 5 desdoblados en 12 escuelas físicas distintas), 417 verificadas + 21 con confianza: pendiente_revision (documentadas, no forzadas). % de peronismo calculado sobre votos válidos (excluye blancos/nulos) — promedio_capital_pct: 45.8 es el valor correcto y vigente. Ver CONTINUIDAD_ESCUELAS_v2.md §3/§4.',
  },
  {
    archivo: 'votos_escuelas_por_circuito.json',
    descripcion: 'Datos de escuelas-centro-de-votación pre-agrupados por circuito, pre-ordenados de mayor a menor pct_peronismo. 84 de 119 circuitos tienen al menos una escuela-centro-de-votación.',
    alimenta: ['SolapaEscuelas ("Votos por escuela", 7ma solapa) → ListaVotosEscuelas'],
    claveCruce: 'Mapkey (4 caracteres con cero a la izquierda, ej. "011A") — NO el CircuitoKey sin cero de circuitos_completo.json.',
    fuenteOriginal: 'Mismo pipeline que escuelas_capital.json (ver esa entrada), agregado por circuito. Ver CONTINUIDAD_ESCUELAS_v2.md §5.2.',
    estado: 'activo',
    notas: 'Circuito "principal" de un barrio corregido para usar el de mayor pct_en_circuito (equivalente a orden_importancia: 1), no el primero por orden de archivo — afectaba a 4 de 20 barrios repartidos entre circuitos (bajó de 85 a 84 circuitos con escuelas). Ver CONTINUIDAD_ESCUELAS_v2.md §5.4.',
  },
  {
    archivo: 'votos_escuelas_por_barrio.json',
    descripcion: 'Mismos datos de escuelas-centro-de-votación, agrupados por barrio. 236 barrios con al menos una escuela.',
    alimenta: ['PanelMiniBarrio ("Votos por escuela") → ListaVotosEscuelas'],
    claveCruce: 'Nombre de barrio tal cual lo escribe IDECOR, normalizado con normalizarNombreBarrio() para cruzar contra barriosGeoLookup (votosEscuelasBarrioLookup).',
    fuenteOriginal: 'Mismo pipeline que escuelas_capital.json (ver esa entrada), agregado por barrio. Ver CONTINUIDAD_ESCUELAS_v2.md §5.3.',
    estado: 'activo',
    notas: '68 de 236 barrios no matchean contra barrios_geo.json ni con normalización (nombres de catastro IDECOR genuinamente distintos, ej. "AMPLIACION CABILDO", "S.M.A.T.A.") — no forzados por similitud de texto, muestran "Sin centros de votación identificados". Ver CONTINUIDAD_ESCUELAS_v2.md §5.3/§8.',
  },
];

export default dataManifest;
