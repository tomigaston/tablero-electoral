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
    alimenta: ['SolapaTerritorio', 'generarFichaPDF'],
    claveCruce: 'Mapkey.',
    fuenteOriginal: '', // TODO: no documentado.
    estado: 'legacy',
    notas: 'CONTEXTO_PROYECTO.md §6 lo describe explícitamente como "el dataset viejo"; para la mayoría de los usos nuevos se prefiere barrios_geo.json. Sigue en uso activo por SolapaTerritorio, no está deprecado, pero es el patrón antiguo. También se usó como puente circuito→seccional→barrios en el matching de escuelas (CONTINUIDAD_ESCUELAS_v2.md §2), como insumo de un pipeline offline, no como fetch en runtime del tablero.',
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
    descripcion: 'GeoJSON (no TopoJSON) de 485 barrios: geometría (Polygon/MultiPolygon) + nombre_barrio, tipo_barrio (BarrioOficial/BarrioNoOficial), antecedentes_legales, centroid_lat/lon, poblacion, pct_poblacion_en_circuito, circuito_principal, cantidad_obras, obras[] embebidas.',
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
      'lib/obrasCercanas.js (obrasCercanasAPunto / obrasCercanasABarrio, utilidad reservada para la futura ficha de barrio, todavía sin componente que la consuma)',
    ],
    claveCruce: 'Ninguna para la capa del mapa (cada obra trae su propia lat/lon, cuando existe). obra.barrio es texto directo, ya resuelto — no requiere normalizarNombreBarrio() para mostrarse en el popup.',
    fuenteOriginal: '', // TODO: no documentado — pendiente de un CONTINUIDAD_OBRAS.md o similar si se agrega.
    estado: 'activo',
    notas: '526/564 con lat/lon (526 = 511 fuente_barrio:"geometrico" + 15 "cercano_aproximado"); 543/564 con barrio asignado (526 con coords + 17 "manual", resueltas offline vía obras_barrio_manual.json — ver esa entrada). Las 38 sin lat/lon (17 "manual" + 21 "descartado") no se grafican en el mapa por diseño. fuente_barrio tiene un 4to valor no anticipado originalmente, "descartado" (21 registros, sin lat/lon y sin barrio) — se trata igual que ausente/null, sin lógica especial, porque ya queda invisible tanto en el mapa como en cualquier listado por barrio. Color de marker por estado (no por tipo_obra): tipo_obra está muy concentrado en 2 valores (Plaza 305 + Alumbrado 220 = 93% de 564), mientras que estado (Por relevar/Relevado/En ejecución/Finalizado/Finalizado — Inaugurable) es más balanceado y más accionable para el uso de campaña del tablero — "Finalizado — Inaugurable" se destaca en verde por ser el estado con mayor valor de PR (obra lista para acto de inauguración).',
    campos: [
      { campo: 'id', alimenta: 'Key de React de cada marker (junto al índice, porque id puede repetirse si dos obras comparten nombre).' },
      { campo: 'nombre', alimenta: 'Título del popup de cada obra.' },
      { campo: 'reparticion', alimenta: 'Subtítulo del popup (junto a tipo_obra).' },
      { campo: 'tipo_obra', alimenta: 'Subtítulo del popup (junto a reparticion). No determina el color del marker (ver notas).' },
      { campo: 'estado', alimenta: 'Color de relleno del marker (COLOR_OBRA_ESTADO) + texto destacado en el popup + leyenda "Obras" del mapa.' },
      { campo: 'fecha_inicio / fecha_finalizacion / fecha_disponibilidad_inaugurar', alimenta: 'Bloque de fechas en el popup (se omite cada línea si el campo es null).' },
      { campo: 'prioridad', alimenta: 'Línea "Prioridad: X" en el popup, si está presente.' },
      { campo: 'observaciones', alimenta: 'Texto en cursiva al final del popup, si está presente.' },
      { campo: 'lat / lon', alimenta: 'Posición del CircleMarker. Si cualquiera de los dos es null, la obra no se grafica (pero puede seguir apareciendo en listados por barrio vía el campo barrio).' },
      { campo: 'barrio', alimenta: 'Línea de barrio en el popup; futuro filtro por barrio en lib/obrasCercanas.js / ficha de barrio.' },
      { campo: 'fuente_barrio', alimenta: 'Si es "cercano_aproximado", agrega la aclaración "(barrio aproximado, a X km)" en el popup, en color de advertencia, usando distancia_barrio_km.' },
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
      { campo: 'rondas[].preguntas', alimenta: 'Contenido completo de ResumenEncuesta (vista Resumen de SolapaEncuestas) y de ComparativoEncuesta (KPIs de aprobación/reelección/gestión + grilla de evolución de "Principales problemas", vista Comparativo).' },
    ],
  },
  {
    archivo: 'encuestas_metadata.json',
    descripcion: 'Configuración global de encuestas (ej. umbral_variacion_pp), no son datos por circuito.',
    alimenta: ['SolapaEncuestas (prop metadata) → ComparativoEncuesta'],
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
    descripcion: 'Pauta publicitaria (Meta/otras plataformas) por barrio: por barrio, total_pautas y detalle de cada pauta (campaña, tema, ministerio, plataforma, objetivo, formato, vigencia, universo, cobertura/alcance planificado vs. real).',
    alimenta: [
      'construirEventosPorCircuito (evento tipo "pauta", vía buscarPautaCircuito — tercera fuente de eventos junto a mediciones y visitas)',
      'CeldaEvento / TablaEventosCobertura (detalle del evento "pauta" en el tooltip)',
      '(a futuro) ficha completa de barrio: ya está en el formato correcto para leerse directo por nombre de barrio, sin transformación adicional',
    ],
    claveCruce: 'Nombre de barrio (clave del objeto raíz), normalizado con normalizarNombreBarrio(). Para atribuir pautas a un CIRCUITO no se usa este archivo solo: se cruza contra circuito_principal de barrios_geo.json (formato "Mapkey - nombre") vía buscarPautaCircuito(), resolviendo el Mapkey real del circuito buscado a través de circuitos_completo.json en vez de asumir un padding de ceros.',
    fuenteOriginal: 'Solo_Capital_a_Junio_2026.xlsx',
    estado: 'activo',
    notas: 'No existe pautas_circuitos.json — la cobertura por circuito se deriva en runtime con buscarPautaCircuito(), mismo criterio que se usó para retirar cobertura_circuitos.json (evitar un snapshot que se desincronice). Caveat encontrado al verificar (2026-07): barrios_geo.json tiene 16 nombres de barrio duplicados en fragmentos no contiguos (CONTEXTO_PROYECTO.md §14); "VILLA EL LIBERTADOR" es uno de ellos y tiene circuito_principal distinto en cada fragmento (010C y 010L) — sus 6 pautas se cuentan en AMBOS circuitos (dedupe solo dentro de un mismo circuito, no global), inflando el total sumado de 36 a 42 pautas repartidas. Es la misma ambigüedad de fondo ya documentada para poblacion de barrios duplicados: no hay forma de saber a qué fragmento geográfico apuntó la pauta sin inventar el dato, así que se cuenta en ambos en vez de elegir arbitrariamente uno. Verificado también: los 21 barrios con pauta matchean sin excepción contra barrios_geo.json (0 sin match).',
    // Impacto por campo — a qué elemento visible del tablero alimenta cada uno.
    // Documentación de código, no necesariamente reflejada todavía en /admin/data-status.
    campos: [
      { campo: '(clave del objeto raíz = nombre de barrio)', alimenta: 'Clave de cruce (normalizada con normalizarNombreBarrio()) usada por buscarPautaCircuito() para encontrar las pautas de los barrios cuyo circuito_principal apunta al circuito consultado.' },
      { campo: 'total_pautas', alimenta: 'No consumido todavía en el código (buscarPautaCircuito usa la longitud real de pautas[], no este campo precalculado).' },
      { campo: 'pautas[].fila_origen', alimenta: 'No consumido en el código — referencia interna a la fila del Excel fuente, solo útil para auditar el dato en Solo_Capital_a_Junio_2026.xlsx.' },
      { campo: 'pautas[].campania', alimenta: 'Tooltip del evento "pauta" en CeldaEvento (TablaEventosCobertura).' },
      { campo: 'pautas[].tema', alimenta: 'Título mostrado en el tooltip del evento "pauta" en CeldaEvento.' },
      { campo: 'pautas[].ministerio', alimenta: 'Tooltip del evento "pauta" en CeldaEvento.' },
      { campo: 'pautas[].plataforma', alimenta: 'Tooltip del evento "pauta" en CeldaEvento.' },
      { campo: 'pautas[].objetivo', alimenta: 'No consumido todavía en el código (no se muestra en el tooltip actual).' },
      { campo: 'pautas[].formato', alimenta: 'Tooltip del evento "pauta" en CeldaEvento.' },
      { campo: 'pautas[].fecha_salida', alimenta: 'Fecha del evento tipo "pauta" en TablaEventosCobertura/BarraCobertura (columna de evento, orden cronológico) y arranque de vigencia mostrado en el tooltip.' },
      { campo: 'pautas[].fecha_cierre', alimenta: 'Fin de vigencia mostrado en el tooltip del evento "pauta"; no participa del ordenamiento cronológico (solo fecha_salida).' },
      { campo: 'pautas[].universo', alimenta: 'No consumido todavía en el código.' },
      { campo: 'pautas[].cobertura_planificada', alimenta: 'No consumido todavía en el código.' },
      { campo: 'pautas[].cobertura_real', alimenta: 'Porcentaje de cobertura real mostrado en el tooltip del evento "pauta".' },
      { campo: 'pautas[].alcance_planificado', alimenta: 'Mostrado en el tooltip del evento "pauta", comparado contra alcance_real.' },
      { campo: 'pautas[].alcance_real', alimenta: 'Mostrado en el tooltip del evento "pauta".' },
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
