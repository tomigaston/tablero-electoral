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
    descripcion: '237 registros de obras públicas; se usan las 118 con match_poligono: true.',
    alimenta: ['MapaCircuitos (capa Obras, geocodificada en el centroide del barrio)'],
    claveCruce: 'barrio_normalizado (normalizado con normalizarNombreBarrio()) contra barriosLookup.',
    fuenteOriginal: '', // TODO: no documentado.
    estado: 'activo',
    notas: 'El campo estado viene sucio en la fuente (algunos valores son fracciones tipo "0.18" en vez de texto de estado) — se muestra tal cual, sin reinterpretar. Importante: la lista de obras que se ve en PanelMiniBarrio NO lee este archivo — lee el array obras[] ya embebido en barrios_geo.json. Este archivo solo alimenta los markers del mapa. Ver CONTEXTO_PROYECTO.md §6/§12.',
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
