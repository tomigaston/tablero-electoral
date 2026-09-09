import React, { useEffect, useRef, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Marker, Popup, Pane, useMap, useMapEvent } from 'react-leaflet';
import * as topojson from 'topojson-client';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import 'leaflet/dist/leaflet.css';
import { formatearFecha } from '../lib/formatearFecha';
import { parsearFechaISOPauta, pautaEstaVigente } from '../lib/estadoPauta';

// Colores por categoría v4 - INCLUYE "D" para EN DISPUTA
const COLORES_CATEGORIA = {
  'A.1': '#2E7D32',  // Bastión sólido - VERDE MÁS INTENSO
  'A.2': '#FFCA28',  // Bastión con erosión
  'B.1': '#26A69A',  // Territorio leal
  'B.3': '#FF7043',  // Pérdida 2023
  'B.2': '#78909C',  // En disputa (por si existe)
  'D': '#78909C',    // En disputa (como viene en los datos)
  'C': '#EF5350',    // Territorio hostil
};

// Color por rango de avance de obra (obras_capital.json) — obras_capital.json ya no
// trae un campo `estado` de texto (esquema viejo: Por relevar/Relevado/En
// ejecución/Finalizado/Finalizado — Inaugurable); el dato vivo es porcentaje_avance
// (0–1), así que el color se deriva de rangos fijos sobre ese valor, mismo criterio que
// ya usa Vista Obras en pages/index.js (colorAvanceObra/COLOR_AVANCE_OBRA, duplicado
// acá a propósito — mismo motivo que el resto de los helpers de color de este archivo).
const COLOR_AVANCE_OBRA = { bajo: '#EF5350', medio: '#FFA726', alto: '#66BB6A' };
const RANGOS_AVANCE_OBRA = [
  { key: '0-30', label: '0% – 30%', color: COLOR_AVANCE_OBRA.bajo, test: (pct) => pct >= 0 && pct < 30 },
  { key: '30-70', label: '30% – 70%', color: COLOR_AVANCE_OBRA.medio, test: (pct) => pct >= 30 && pct < 70 },
  { key: '70-100', label: '70% – 100%', color: COLOR_AVANCE_OBRA.alto, test: (pct) => pct >= 70 && pct <= 100 },
];
// null cuenta como 0% (mismo criterio que "Sin iniciar" en Vista Obras) — no un dato
// ausente a tratar aparte, así que cae en el rango 0–30 (rojo) igual que un 0% explícito.
// >1 se acota a 1 (mismo caso de error de carga que ya documenta Vista Obras: OBRA-0280).
function colorAvanceObra(porcentajeAvance) {
  const avance = porcentajeAvance == null ? 0 : Math.min(porcentajeAvance, 1);
  const pct = avance * 100;
  return (RANGOS_AVANCE_OBRA.find(r => r.test(pct)) || RANGOS_AVANCE_OBRA[0]).color;
}
const COLOR_ESCUELA_CENTRO_VOTACION = '#1976D2';
const COLOR_ESCUELA_SIN_VOTACION = '#9E9E9E';
const COLOR_BORDE_PENDIENTE_REVISION = '#F57F17';
const COLOR_PAUTA = '#D500F9'; // violeta/fucsia, no choca con la paleta de estados de Obras ni Circuitos
const COLOR_PAUTA_FINALIZADA = '#9E9E9E'; // apagado — mismo gris que "sin dato" en Obras/Escuelas

// Opacidad de relleno de Circuitos cuando hay alguna capa de puntos activa (Obras,
// Pauta o Escuelas): los rellenos categóricos fuertes (0.7/0.9) matan el contraste de
// los puntos, así que se atenúan a este valor tenue para que los puntos dominen
// visualmente y el color de categoría se siga percibiendo de fondo.
const FILL_OPACITY_CIRCUITO_ATENUADO = 0.25;

// Panes propios con z-index fijo (en vez de dejar que Circuitos/Barrios/Obras/Pauta/
// Escuelas caigan todos en el mismo overlayPane por defecto): así el z-order queda
// determinado por el pane, no por el orden de montaje/activación de cada capa —
// Circuitos y Barrios comparten "panePoligonos" (mismo comportamiento entre sí que
// antes, dentro del mismo pane) y Obras/Pauta/Escuelas comparten "panePuntos", por
// encima. tooltipPane (650) y popupPane (700) de Leaflet quedan por encima de ambos
// SIEMPRE QUE los <Popup> no hereden el pane del <Pane> que los contiene: react-leaflet
// propaga el nombre del Pane ambiente a cualquier <Popup>/<Tooltip> hijo que no fije su
// propio prop "pane" (ver @react-leaflet/core withPane), así que cada <Popup> dentro de
// PANE_PUNTOS necesita pane="popupPane" explícito o termina renderizando a z-index 450.
const PANE_POLIGONOS = 'panePoligonos';
const PANE_PUNTOS = 'panePuntos';

// Star de 24x24 (path estándar de 5 puntas), con halo blanco (stroke) — mismo criterio
// de "halo blanco" que los CircleMarker de Obras, pero como DivIcon a mano (SVG inline,
// sin librerías de íconos) porque CircleMarker no puede dibujar una forma de estrella.
// activa=true: relleno pleno del color de Pauta; activa=false (solo pautas finalizadas
// en ese barrio): mismo dibujo pero apagado en gris, para que se lea a simple vista sin
// abrir el popup.
function crearIconoPautaEstrella(activa) {
  const L = require('leaflet');
  const color = activa ? COLOR_PAUTA : COLOR_PAUTA_FINALIZADA;
  const svg = `
    <svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
        fill="${color}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round" />
    </svg>
  `;
  return L.divIcon({
    html: svg,
    className: 'pauta-star-icon',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -10],
  });
}

// pautas_barrios.json (esquema campañas 2026) trae la vigencia como inicio / fin en
// formato "YYYY-MM-DD" — NO fecha_creacion/fecha_finalizacion (esquema Meta Ads viejo,
// ya no existe). El parseo de fecha y el cálculo de vigencia (fin >= hoy) viven ahora en
// lib/estadoPauta.js (parsearFechaISOPauta / pautaEstaVigente) — antes duplicados acá,
// centralizado para poder aplicar ahí el override temporal de la reunión (ver comentario
// al tope de ese archivo).

// Anota cada pauta con _activa (fin >= hoy, según `hoy`) y ordena por inicio (arranque
// de vigencia) descendente — la más reciente primero. Sin inicio parseable, se manda al
// final (no rompe el orden del resto). Extraído a nivel de módulo (antes vivía inline en
// el useMemo de pautaBarrioMarkers) para reusarlo también en pautaCapitalMarkers — mismo
// criterio de anotado/orden para ambas capas de estrellas de Pauta.
function anotarPautas(pautasRaw, hoy) {
  return (pautasRaw || []).map(p => ({ ...p, _activa: pautaEstaVigente(p, hoy) })).sort((a, b) => {
    const fa = parsearFechaISOPauta(a.inicio);
    const fb = parsearFechaISOPauta(b.inicio);
    if (!fa && !fb) return 0;
    if (!fa) return 1;
    if (!fb) return -1;
    return fb - fa;
  });
}

// Normaliza nombres de barrio para cruzar recorridos_barrios.json con barrios_geo.json
// (nombre_barrio): mismo texto pero con diferencias de espacios dobles, tildes y el
// carácter ordinal "º" vs "o" (ej. "1º DE MAYO" / "1o DE MAYO").
function normalizarNombreBarrio(s) {
  return (s || '')
    .toUpperCase()
    .replace(/[ºª]/g, 'O')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// El campo "nivel" de escuelas_capital.json viene como string con forma de array
// JSON (ej. '["1. Común - Primario"]') en vez de array real — se parsea acá para
// mostrarlo legible en el popup, con fallback al texto crudo si no parsea.
function formatNivelEscuela(nivelRaw) {
  if (!nivelRaw) return '—';
  try {
    const arr = JSON.parse(nivelRaw);
    if (Array.isArray(arr)) return arr.join(', ');
  } catch (e) { /* no era JSON parseable, se muestra tal cual */ }
  return nivelRaw;
}

// Mismas 3 categorías que la leyenda de Escuelas: sirve tanto para elegir color/estilo
// del marker como para el filtro por click (setFiltroTipoEscuela).
function tipoEscuela(esc) {
  if (!esc.es_centro_votacion) return 'sin_votacion';
  return esc.confianza === 'pendiente_revision' ? 'pendiente_revision' : 'centro_votacion';
}

function MapController({ mapkeySeleccionado, geoJsonData, zoomBarrioSolicitado, barriosGeoData, barriosVisible }) {
  const map = useMap();
  const ultimoZoomBarrioRef = useRef(null);

  useEffect(() => {
    // Prioridad: si hay un pedido de zoom a barrio nuevo (no aplicado todavía) y la
    // capa Barrios está visible, centrar en el barrio y no seguir con la lógica de
    // circuito. Si la capa no está visible (o no se encuentra el polígono), el pedido
    // se da por consumido igual y se cae al comportamiento de zoom sobre circuito de
    // siempre (que ya apunta al circuito correspondiente, calculado en pages/index.js).
    if (
      zoomBarrioSolicitado?.ts &&
      zoomBarrioSolicitado.ts !== ultimoZoomBarrioRef.current &&
      barriosVisible &&
      barriosGeoData
    ) {
      const feature = barriosGeoData.features.find(f => f.properties?.nombre_barrio === zoomBarrioSolicitado.nombre);
      if (feature && feature.geometry) {
        try {
          const L = require('leaflet');
          const layer = L.geoJSON(feature);
          const bounds = layer.getBounds();
          if (bounds.isValid()) {
            ultimoZoomBarrioRef.current = zoomBarrioSolicitado.ts;
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
            return;
          }
        } catch (e) {
          console.log('Error ajustando bounds de barrio');
        }
      }
    }
    if (zoomBarrioSolicitado?.ts) ultimoZoomBarrioRef.current = zoomBarrioSolicitado.ts;

    if (mapkeySeleccionado && geoJsonData) {
      const feature = geoJsonData.features.find(f => f.properties.circuito === mapkeySeleccionado);
      if (feature && feature.geometry) {
        try {
          const L = require('leaflet');
          const layer = L.geoJSON(feature);
          const bounds = layer.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
          }
        } catch (e) {
          console.log('Error ajustando bounds');
        }
      }
    } else {
      map.setView([-31.42, -64.18], 12);
    }
  }, [mapkeySeleccionado, geoJsonData, zoomBarrioSolicitado, barriosVisible, barriosGeoData, map]);

  return null;
}

// Botón "Ver en solapa Pauta" del popup de estrella de pauta: usa useMap() (mismo hook
// que MapController) para cerrar el popup del mapa antes de disparar la navegación a la
// ficha completa — funciona porque el contenido de <Popup> sigue dentro del mismo árbol
// de React que <MapContainer> (Leaflet lo porta al DOM, pero el context no se pierde).
function BotonVerBarrioEnPauta({ nombreBarrio, onVerBarrioEnPauta }) {
  const map = useMap();
  if (!onVerBarrioEnPauta) return null;
  return (
    <button
      onClick={() => {
        map.closePopup();
        onVerBarrioEnPauta(nombreBarrio);
      }}
      style={{
        marginTop: '10px', width: '100%', padding: '6px 10px', borderRadius: '6px',
        border: 'none', backgroundColor: COLOR_PAUTA, color: '#fff',
        fontSize: '11px', fontWeight: 600, cursor: 'pointer',
      }}
    >
      Ver en solapa Pauta
    </button>
  );
}

// Botón "Ver en solapa Territorio" del popup de estrella de Alcance Capital: mismo
// patrón que BotonVerBarrioEnPauta (cierra el popup antes de navegar), pero apunta a la
// ficha de CIRCUITO — a diferencia del marker de pauta por barrio, acá no hay solapa
// Pauta propia de circuito (vive fusionada dentro de Territorio, ver BloqueAlcanceCapital
// en pages/index.js), así que el label dice "Territorio" en vez de "Pauta" para no
// prometer una solapa que no existe.
function BotonVerCircuitoEnPauta({ circuitoKey, onVerCircuitoEnPauta }) {
  const map = useMap();
  if (!onVerCircuitoEnPauta) return null;
  return (
    <button
      onClick={() => {
        map.closePopup();
        onVerCircuitoEnPauta(circuitoKey);
      }}
      style={{
        marginTop: '10px', width: '100%', padding: '6px 10px', borderRadius: '6px',
        border: 'none', backgroundColor: COLOR_PAUTA, color: '#fff',
        fontSize: '11px', fontWeight: 600, cursor: 'pointer',
      }}
    >
      Ver en solapa Territorio
    </button>
  );
}

// Detecta con turf, en un único click de mapa, qué circuito y qué barrio contienen
// el punto clickeado (booleanPointInPolygon), sin importar cuál capa esté arriba
// visualmente ni cuál esté tildada en el panel de Capas.
function ClickHandler({ geoJsonData, barriosGeoData, datosLookup, onMapClick }) {
  useMapEvent('click', (e) => {
    const punto = [e.latlng.lng, e.latlng.lat];

    let circuitoKey = null;
    const featureCircuito = (geoJsonData?.features || []).find(f => {
      try { return booleanPointInPolygon(punto, f); } catch (err) { return false; }
    });
    if (featureCircuito) {
      const mapkey = featureCircuito.properties.circuito;
      circuitoKey = datosLookup[mapkey]?.CircuitoKey ?? null;
    }

    let nombreBarrio = null;
    const featureBarrio = (barriosGeoData?.features || []).find(f => {
      try { return booleanPointInPolygon(punto, f); } catch (err) { return false; }
    });
    if (featureBarrio) {
      nombreBarrio = featureBarrio.properties?.nombre_barrio || null;
    }

    if (onMapClick) onMapClick(circuitoKey, nombreBarrio);
  });
  return null;
}

export default function MapaCircuitos({ datos, geoData, barriosGeoData, obrasEnriquecidas, escuelasData, pautasBarriosData, cruceData, circuitoSeleccionado, onMapClick, barrioSeleccionado, filtroCategoria, setFiltroCategoria, coloresCategoria, zoomBarrioSolicitado, onSelectObra, onVerBarrioEnPauta, onVerCircuitoEnPauta }) {
  const geoJsonRef = useRef(null);

  const [capasActivas, setCapasActivas] = useState({ circuitos: true, barrios: false, obras: true, pauta: false, escuelas: false });
  const toggleCapa = (capa) => setCapasActivas(prev => ({ ...prev, [capa]: !prev[capa] }));

  // Cuenta como "capa de puntos" para la atenuación del relleno de Circuitos (punto 1):
  // Obras, Pauta y Escuelas comparten el mismo criterio de necesitar contraste contra
  // el relleno categórico de circuito.
  const hayCapaPuntosActiva = capasActivas.obras || capasActivas.pauta || capasActivas.escuelas;
  // Ref porque los handlers mouseover/mouseout de onEachFeature quedan atados al closure
  // vigente en el momento del mount/remount de <GeoJSON> (que solo remonta por cambios de
  // mapkeySeleccionado/filtroCategoria, no por capasActivas) — sin este ref, activar/
  // desactivar Obras/Pauta/Escuelas no se reflejaría en el hover hasta el próximo remount.
  const hayCapaPuntosActivaRef = useRef(hayCapaPuntosActiva);
  useEffect(() => { hayCapaPuntosActivaRef.current = hayCapaPuntosActiva; }, [hayCapaPuntosActiva]);

  // A diferencia de filtroCategoria (lifted a pages/index.js porque VistaCapital también
  // lo consume, y se limpia al navegar a un circuito/barrio puntual porque es un filtro
  // de panorama de Capital), este filtro no tiene una segunda vista que sincronizar y
  // sigue teniendo sentido con un circuito/barrio enfocado (ej. ver solo obras con poco
  // avance mientras se está parado en una ficha) — por eso vive local y no se resetea
  // en navegación. Valor: key de RANGOS_AVANCE_OBRA ('0-30'/'30-70'/'70-100') o null.
  const [filtroRangoAvanceObra, setFiltroRangoAvanceObra] = useState(null);
  // Mismo criterio que filtroRangoAvanceObra: filtro local (no lifted), sigue teniendo
  // sentido con un circuito/barrio enfocado y no se resetea en navegación.
  const [filtroTipoEscuela, setFiltroTipoEscuela] = useState(null);
  // Mismo criterio que filtroRangoAvanceObra/filtroTipoEscuela: filtro local (no lifted),
  // sigue teniendo sentido con un circuito/barrio enfocado y no se resetea en navegación.
  const [filtroTipoPauta, setFiltroTipoPauta] = useState(null);

  const geoJsonData = useMemo(() => {
    if (!geoData) return null;
    try {
      const objectKey = Object.keys(geoData.objects)[0];
      if (!objectKey) return null;
      return topojson.feature(geoData, geoData.objects[objectKey]);
    } catch (e) {
      console.error('Error convirtiendo TopoJSON:', e);
      return null;
    }
  }, [geoData]);

  // Cada obra con tipo_ubicacion 'exacta'/'centroide_barrio'/'centroide_circuito' trae
  // lat/lon propia. Las 'sin_geometria' (38) y 'geometria_externa' (18, geometría
  // cargada aparte, no hay punto real) vienen con lat/lon null en el archivo — este
  // filtro ya las excluye sin lógica aparte por tipo_ubicacion; no hay que agregar nada
  // para que "no rompan el mapa": simplemente no generan marker.
  const obrasParaMostrar = useMemo(() => {
    return (obrasEnriquecidas || []).filter(o => o.lat != null && o.lon != null);
  }, [obrasEnriquecidas]);

  const escuelasParaMostrar = useMemo(() => escuelasData?.escuelas || [], [escuelasData]);

  // pautas_barrios.json (esquema campañas 2026) viene con dos buckets: `barrios`
  // (indexado por nombre, nivel barrio, no por pieza individual) y `circuitos_sin_barrio`
  // (pautas asignadas directo a un circuito, sin barrio identificado). Este marker por
  // barrio solo recorre el bucket `barrios` — circuitos_sin_barrio queda deliberadamente
  // fuera del mapa por ahora (se evalúa cómo mostrarlo más adelante), un marker por
  // barrio con pauta, ubicado en el centroide de su polígono en barrios_geo.json (mismo
  // cruce normalizado que ya usa este archivo para Barrios/Territorio). barrios_geo.json
  // tiene 16 nombres de barrio duplicados (fragmentos no contiguos, ver comentario de
  // resolverCircuitoPrincipalDeBarrio en pages/index.js) — para el marker se toma el
  // primer fragmento que matchea, sin intentar elegir "el principal" (no hay campo que
  // lo indique). Los barrios de pauta sin ningún fragmento que matchee ni con
  // normalización quedan afuera del mapa (no se inventa ubicación) y se listan en
  // consola para poder avisarlos.
  // Cada pauta se anota con _activa (fin >= hoy) al vuelo acá — una sola vez por render
  // de esta capa, no en el render de cada marker — y un barrio "tiene pauta activa" si
  // alguna de sus pautas lo está. Fechas ausentes/no parseables se tratan como
  // finalizadas (no rompen el cálculo) y se cuentan para avisar en consola.
  const pautaBarrioMarkers = useMemo(() => {
    const bucket = pautasBarriosData?.barrios;
    if (!bucket || !barriosGeoData) return [];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const sinMatch = [];
    let sinFechaValidaCount = 0;
    (Object.values(bucket)).forEach(({ pautas }) => (pautas || []).forEach(p => {
      if (parsearFechaISOPauta(p.fin) == null) sinFechaValidaCount += 1;
    }));

    const markers = Object.keys(bucket).map(nombreBarrio => {
      const normalizado = normalizarNombreBarrio(nombreBarrio);
      const feature = barriosGeoData.features.find(f => normalizarNombreBarrio(f.properties?.nombre_barrio) === normalizado);
      const lat = feature?.properties?.centroid_lat;
      const lon = feature?.properties?.centroid_lon;
      const pautas = anotarPautas(bucket[nombreBarrio].pautas, hoy);
      if (lat == null || lon == null) {
        sinMatch.push(nombreBarrio);
        return null;
      }
      return { nombreBarrio, lat, lon, pautas, tieneActiva: pautas.some(p => p._activa) };
    }).filter(Boolean);

    if (sinMatch.length > 0) {
      console.warn('Pauta: barrios sin match geográfico en barrios_geo.json (excluidos del mapa):', sinMatch);
    }
    if (sinFechaValidaCount > 0) {
      console.warn(`Pauta: ${sinFechaValidaCount} registro(s) sin fin parseable, tratados como finalizados.`);
    }
    return markers;
  }, [pautasBarriosData, barriosGeoData]);

  // Bucket `toda_capital` (esquema campañas 2026): campañas genéricas de alcance
  // Capital-completa, sin barrio ni circuito puntual — las MISMAS piezas aplican por
  // igual a los 119 circuitos, así que no hay un centroide natural (a diferencia de
  // pautaBarrioMarkers, que ubica cada marker en el centroide de SU barrio). Se planta
  // una estrella por circuito en un punto de anclaje = promedio simple de
  // centroid_lat/centroid_lon de los barrios que integran ese circuito
  // (circuito_barrios_cruce.json → circuito_to_barrios, mismo criterio de "primer
  // fragmento que matchea" que ya usa pautaBarrioMarkers para resolver nombre_barrio ->
  // centroide, y mismo descarte de la fila sintética "Sin Barrio - Circuito ..." que
  // resolverBarriosDelCircuito en pages/index.js). Capa ADICIONAL: no reemplaza ni
  // modifica pautaBarrioMarkers, y reusa el mismo ícono (sin distinción visual) — ver
  // crearIconoPautaEstrella. Se recalcula solo cuando cambian sus fuentes (useMemo), no
  // en cada render.
  const pautaCapitalMarkers = useMemo(() => {
    const pautasRaw = pautasBarriosData?.toda_capital?.pautas;
    if (!pautasRaw || pautasRaw.length === 0 || !cruceData || !barriosGeoData || !datos) return [];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const pautas = anotarPautas(pautasRaw, hoy);
    const tieneActiva = pautas.some(p => p._activa);
    const sinAnchor = [];

    const markers = datos.map(d => {
      const clave = `${d.Mapkey} - ${d.cirn_nom}`;
      const barriosDelCircuito = cruceData?.circuito_to_barrios?.[clave] || [];
      const puntos = [];
      barriosDelCircuito.forEach(b => {
        if (!b.barrio || b.barrio.startsWith('Sin Barrio')) return;
        const normalizado = normalizarNombreBarrio(b.barrio_normalizado || b.barrio);
        const feature = barriosGeoData.features.find(f => normalizarNombreBarrio(f.properties?.nombre_barrio) === normalizado);
        const lat = feature?.properties?.centroid_lat;
        const lon = feature?.properties?.centroid_lon;
        if (lat != null && lon != null) puntos.push([lat, lon]);
      });
      if (puntos.length === 0) {
        sinAnchor.push(d.Mapkey);
        return null;
      }
      const lat = puntos.reduce((s, p) => s + p[0], 0) / puntos.length;
      const lon = puntos.reduce((s, p) => s + p[1], 0) / puntos.length;
      return { mapkey: d.Mapkey, circuitoKey: d.CircuitoKey, circuitoNombre: d.cirn_nom, lat, lon, pautas, tieneActiva };
    }).filter(Boolean);

    if (sinAnchor.length > 0) {
      console.warn('Pauta (Alcance Capital): circuitos sin punto de anclaje (sin barrios con centroide en barrios_geo.json):', sinAnchor);
    }
    return markers;
  }, [pautasBarriosData, cruceData, barriosGeoData, datos]);

  const iconoPautaActiva = useMemo(() => crearIconoPautaEstrella(true), []);
  const iconoPautaFinalizada = useMemo(() => crearIconoPautaEstrella(false), []);

  const getBarrioStyle = (feature) => {
    const nombre = feature.properties?.nombre_barrio;
    const isSelected = barrioSeleccionado && normalizarNombreBarrio(nombre) === normalizarNombreBarrio(barrioSeleccionado);
    return {
      fillOpacity: isSelected ? 0.2 : 0,
      fillColor: '#5C6BC0',
      // Barrio = línea punteada oscura vs. circuito = línea blanca sólida, para que se
      // distingan a simple vista (antes competían: ambas finitas y sutiles).
      color: isSelected ? '#3949AB' : '#37474F',
      weight: isSelected ? 2.5 : 2,
      opacity: isSelected ? 0.9 : 0.65,
      dashArray: isSelected ? null : '6,4',
    };
  };

  const onEachBarrio = (feature, layer) => {
    const nombre = feature.properties?.nombre_barrio;
    if (!nombre) return;
    layer.bindTooltip(nombre, { sticky: true, direction: 'top', className: 'custom-tooltip-barrio' });
  };

  const datosLookup = useMemo(() => {
    const lookup = {};
    datos.forEach(d => {
      if (d.Mapkey) lookup[d.Mapkey] = d;
    });
    return lookup;
  }, [datos]);
  
  const mapkeySeleccionado = useMemo(() => {
    if (!circuitoSeleccionado) return null;
    const circuito = datos.find(d => d.CircuitoKey === circuitoSeleccionado);
    return circuito?.Mapkey || null;
  }, [circuitoSeleccionado, datos]);
  
  const getStyle = (feature) => {
    const mapkey = feature.properties.circuito;
    const datosCircuito = datosLookup[mapkey];
    const categoria = datosCircuito?.Categoria_v4 || 'B.2';
    const color = COLORES_CATEGORIA[categoria] || '#78909C';
    const isSelected = mapkey === mapkeySeleccionado;
    
    // Si hay filtro y este circuito no coincide, hacerlo muy tenue
    const isFiltered = filtroCategoria && categoria !== filtroCategoria;

    // Atenuación (punto 1): con alguna capa de puntos activa, el relleno baja a un tenue
    // fijo para que Obras/Pauta/Escuelas dominen visualmente — la selección se sigue
    // marcando por el borde (ver más abajo), no por el relleno.
    let fillOpacity;
    if (isFiltered) fillOpacity = 0.15;
    else if (hayCapaPuntosActiva) fillOpacity = FILL_OPACITY_CIRCUITO_ATENUADO;
    else fillOpacity = isSelected ? 0.9 : 0.7;

    return {
      fillColor: color,
      fillOpacity,
      // Selección (punto 4): borde más grueso y de un azul más contrastante para que el
      // circuito activo salte a la vista incluso con el relleno atenuado.
      color: isSelected ? '#2962FF' : '#ffffff',
      weight: isSelected ? 5 : 1,
      opacity: isFiltered ? 0.3 : 1,
    };
  };
  
  const onEachFeature = (feature, layer) => {
    const mapkey = feature.properties.circuito;
    const datosCircuito = datosLookup[mapkey];
    
    if (!datosCircuito) return;
    
    const shareG23 = datosCircuito.Share_G23;
    const tooltipContent = `
      <div style="font-family: -apple-system, sans-serif; padding: 6px 8px;">
        <strong style="font-size: 14px;">${datosCircuito.CircuitoKey}</strong>
        <div style="font-size: 13px; color: #666; margin-top: 3px;">${datosCircuito.cirn_nom || ''}</div>
        <div style="font-size: 13px; margin-top: 6px;">Gob. 2023: <strong>${shareG23 ? (shareG23 * 100).toFixed(1) + '%' : '—'}</strong></div>
      </div>
    `;
    
    layer.bindTooltip(tooltipContent, { sticky: true, direction: 'top', offset: [0, -10], className: 'custom-tooltip' });

    layer.on('mouseover', (e) => {
      if (mapkey !== mapkeySeleccionado) {
        // hayCapaPuntosActivaRef porque este handler queda atado al closure de cuando se
        // montó la capa (ver comentario junto a su declaración) — sin el ref, el hover
        // ignoraría cambios de capasActivas hechos después del mount.
        const opacidadTenue = hayCapaPuntosActivaRef.current ? 0.35 : 0.85;
        e.target.setStyle({ fillOpacity: opacidadTenue, weight: 2 });
      }
    });

    layer.on('mouseout', (e) => {
      if (mapkey !== mapkeySeleccionado) {
        const datosC = datosLookup[mapkey];
        const isFiltered = filtroCategoria && datosC?.Categoria_v4 !== filtroCategoria;
        const fillOpacityBase = hayCapaPuntosActivaRef.current ? FILL_OPACITY_CIRCUITO_ATENUADO : 0.7;
        e.target.setStyle({ fillOpacity: isFiltered ? 0.15 : fillOpacityBase, weight: 1 });
      }
    });
  };
  
  useEffect(() => {
    if (geoJsonRef.current) {
      geoJsonRef.current.eachLayer(layer => {
        const feature = layer.feature;
        if (feature) layer.setStyle(getStyle(feature));
      });
    }
  }, [mapkeySeleccionado, datosLookup, filtroCategoria, hayCapaPuntosActiva]);
  
  if (!geoJsonData) {
    return (
      <div style={{ flex: 1, backgroundColor: '#f5f5f5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '14px' }}>
        Cargando mapa...
      </div>
    );
  }
  
  return (
    <div style={{ flex: 1, borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
      <style>{`
        .custom-tooltip { background: white; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); padding: 0; }
        .custom-tooltip .leaflet-tooltip-content { margin: 0; }
        .custom-tooltip-barrio { background: #37474F; color: #fff; border: none; font-size: 12px; padding: 3px 8px; }
        .leaflet-container { background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .leaflet-interactive { transition: fill-opacity 0.35s ease, opacity 0.35s ease; }
        .pauta-star-icon { background: transparent; border: none; }
      `}</style>

      <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 500, backgroundColor: '#fff', borderRadius: '8px', padding: '10px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', fontSize: '13px', minWidth: '140px' }}>
        <div style={{ fontWeight: 600, marginBottom: '6px', color: '#37474F' }}>Capas</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', cursor: 'pointer' }}>
          <input type="checkbox" checked={capasActivas.circuitos} onChange={() => toggleCapa('circuitos')} />
          Circuitos
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', cursor: 'pointer' }}>
          <input type="checkbox" checked={capasActivas.barrios} onChange={() => toggleCapa('barrios')} />
          Barrios
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', cursor: 'pointer' }}>
          <input type="checkbox" checked={capasActivas.obras} onChange={() => toggleCapa('obras')} />
          Obras
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', cursor: 'pointer' }}>
          <input type="checkbox" checked={capasActivas.pauta} onChange={() => toggleCapa('pauta')} />
          Pauta
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input type="checkbox" checked={capasActivas.escuelas} onChange={() => toggleCapa('escuelas')} />
          Escuelas
        </label>
      </div>

      {capasActivas.pauta && (
        <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 500, backgroundColor: '#fff', borderRadius: '8px', padding: '8px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', maxWidth: '170px' }}>
          <div style={{ fontSize: '11px', color: '#37474F', marginBottom: '5px' }}>Pauta (click para filtrar)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {[
              { tipo: 'activa', color: COLOR_PAUTA, label: 'Pauta activa' },
              { tipo: 'finalizada', color: COLOR_PAUTA_FINALIZADA, label: 'Pauta expirada' },
            ].map(({ tipo, color, label }) => (
              <div
                key={tipo}
                onClick={() => setFiltroTipoPauta(filtroTipoPauta === tipo ? null : tipo)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 5px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s', backgroundColor: filtroTipoPauta === tipo ? `${color}20` : 'transparent', border: filtroTipoPauta === tipo ? `1px solid ${color}` : '1px solid transparent' }}
              >
                <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: color, border: '1px solid #fff', boxShadow: `0 0 0 1px ${color}`, flexShrink: 0 }} />
                <span style={{ fontSize: '9px', color: '#546E7A' }}>{label}</span>
              </div>
            ))}
          </div>
          {filtroTipoPauta && <button onClick={() => setFiltroTipoPauta(null)} style={{ marginTop: '6px', padding: '3px 6px', fontSize: '10px', border: '1px solid #e0e0e0', borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer', color: '#666', width: '100%' }}>✕ Limpiar filtro</button>}
        </div>
      )}

      {capasActivas.escuelas && (
        <div style={{ position: 'absolute', bottom: '10px', left: '210px', zIndex: 500, backgroundColor: '#fff', borderRadius: '8px', padding: '8px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', maxWidth: '190px' }}>
          <div style={{ fontSize: '11px', color: '#37474F', marginBottom: '5px' }}>Escuelas (click para filtrar)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {[
              { tipo: 'centro_votacion', label: 'Centro de votación', color: COLOR_ESCUELA_CENTRO_VOTACION, dot: { backgroundColor: COLOR_ESCUELA_CENTRO_VOTACION, border: '1px solid #fff', boxShadow: '0 0 0 1px ' + COLOR_ESCUELA_CENTRO_VOTACION } },
              { tipo: 'pendiente_revision', label: 'Match pendiente de revisión', color: COLOR_BORDE_PENDIENTE_REVISION, dot: { backgroundColor: COLOR_ESCUELA_CENTRO_VOTACION, border: `1.5px dashed ${COLOR_BORDE_PENDIENTE_REVISION}` } },
              { tipo: 'sin_votacion', label: 'Escuela sin centro de votación', color: COLOR_ESCUELA_SIN_VOTACION, dot: { backgroundColor: COLOR_ESCUELA_SIN_VOTACION, border: '1px solid #fff', boxShadow: '0 0 0 1px ' + COLOR_ESCUELA_SIN_VOTACION } },
            ].map(({ tipo, label, color, dot }) => (
              <div
                key={tipo}
                onClick={() => setFiltroTipoEscuela(filtroTipoEscuela === tipo ? null : tipo)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 5px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s', backgroundColor: filtroTipoEscuela === tipo ? `${color}20` : 'transparent', border: filtroTipoEscuela === tipo ? `1px solid ${color}` : '1px solid transparent' }}
              >
                <div style={{ width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0, ...dot }} />
                <span style={{ fontSize: '9px', color: '#546E7A' }}>{label}</span>
              </div>
            ))}
          </div>
          {filtroTipoEscuela && <button onClick={() => setFiltroTipoEscuela(null)} style={{ marginTop: '6px', padding: '3px 6px', fontSize: '10px', border: '1px solid #e0e0e0', borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer', color: '#666', width: '100%' }}>✕ Limpiar filtro</button>}
        </div>
      )}

      {capasActivas.obras && (
        <div style={{ position: 'absolute', bottom: '10px', right: '10px', zIndex: 500, backgroundColor: '#fff', borderRadius: '8px', padding: '8px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', maxWidth: '170px' }}>
          <div style={{ fontSize: '11px', color: '#37474F', marginBottom: '5px' }}>Obras · % avance (click para filtrar)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {RANGOS_AVANCE_OBRA.map(({ key, label, color }) => (
              <div
                key={key}
                onClick={() => setFiltroRangoAvanceObra(filtroRangoAvanceObra === key ? null : key)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 5px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s', backgroundColor: filtroRangoAvanceObra === key ? `${color}20` : 'transparent', border: filtroRangoAvanceObra === key ? `1px solid ${color}` : '1px solid transparent' }}
              >
                <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: color, border: '1px solid #fff', boxShadow: `0 0 0 1px ${color}`, flexShrink: 0 }} />
                <span style={{ fontSize: '9px', color: '#546E7A' }}>{label}</span>
              </div>
            ))}
          </div>
          {filtroRangoAvanceObra && <button onClick={() => setFiltroRangoAvanceObra(null)} style={{ marginTop: '6px', padding: '3px 6px', fontSize: '10px', border: '1px solid #e0e0e0', borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer', color: '#666', width: '100%' }}>✕ Limpiar filtro</button>}
        </div>
      )}

      {capasActivas.circuitos && coloresCategoria && (
        <div style={{ position: 'absolute', bottom: '10px', left: '10px', zIndex: 500, backgroundColor: '#fff', borderRadius: '8px', padding: '8px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', maxWidth: '190px' }}>
          <div style={{ fontSize: '11px', color: '#37474F', marginBottom: '5px' }}>Leyenda (click para filtrar)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px' }}>
            {Object.entries(coloresCategoria).filter(([k]) => k !== 'B.2').map(([cat, config]) => (
              <div key={cat} onClick={() => setFiltroCategoria && setFiltroCategoria(filtroCategoria === cat ? null : cat)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 5px', borderRadius: '4px', cursor: 'pointer', backgroundColor: filtroCategoria === cat ? `${config.bg}20` : 'transparent', border: filtroCategoria === cat ? `1px solid ${config.bg}` : '1px solid transparent' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: config.bg, flexShrink: 0 }} />
                <span style={{ fontSize: '9px', color: '#546E7A', lineHeight: 1.2 }}>{config.label}</span>
              </div>
            ))}
          </div>
          {filtroCategoria && <button onClick={() => setFiltroCategoria && setFiltroCategoria(null)} style={{ marginTop: '6px', padding: '3px 6px', fontSize: '10px', border: '1px solid #e0e0e0', borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer', color: '#666', width: '100%' }}>✕ Limpiar filtro</button>}
        </div>
      )}

      <MapContainer center={[-31.42, -64.18]} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={true} scrollWheelZoom={true}>
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        <Pane name={PANE_POLIGONOS} style={{ zIndex: 400 }}>
          {capasActivas.circuitos && (
            <GeoJSON ref={geoJsonRef} key={`${mapkeySeleccionado}-${filtroCategoria}`} data={geoJsonData} style={getStyle} onEachFeature={onEachFeature} />
          )}
          {capasActivas.barrios && barriosGeoData && (
            <GeoJSON key={`barrios-${barrioSeleccionado}`} data={barriosGeoData} style={getBarrioStyle} onEachFeature={onEachBarrio} />
          )}
        </Pane>

        <Pane name={PANE_PUNTOS} style={{ zIndex: 450 }}>
          {capasActivas.obras && obrasParaMostrar.map((obra, i) => {
            // Se agrupa/dibuja por id_registro (no por id_obra): cada barrio de una obra
            // multi-barrio trae su propio registro con su propio lat/lon y eso está bien
            // acá — a diferencia de Vista Obras (pages/index.js), que sí deduplica por
            // id_obra para contar obras únicas, este mapa no deduplica, cada punto real
            // es un marker propio.
            const colorMarker = colorAvanceObra(obra.porcentaje_avance);
            const pctObra = (obra.porcentaje_avance == null ? 0 : Math.min(obra.porcentaje_avance, 1)) * 100;
            // Mismo criterio de aislar/restaurar que getStyle() usa para los polígonos de
            // circuito con filtroCategoria (fillOpacity 0.15 / opacity 0.3 para lo que no
            // matchea el filtro activo).
            const rangoActivo = filtroRangoAvanceObra && RANGOS_AVANCE_OBRA.find(r => r.key === filtroRangoAvanceObra);
            const isFiltered = rangoActivo && !rangoActivo.test(pctObra);
            return (
              <CircleMarker
                key={`obra-${obra.id_registro}-${i}`}
                center={[obra.lat, obra.lon]}
                radius={6}
                pathOptions={{ color: '#fff', weight: 2, fillColor: colorMarker, fillOpacity: isFiltered ? 0.15 : 0.9, opacity: isFiltered ? 0.3 : 1 }}
                eventHandlers={{ click: () => onSelectObra && onSelectObra(obra) }}
              />
            );
          })}
          {capasActivas.pauta && pautaBarrioMarkers.map((m) => {
            // Mismo criterio de aislar/restaurar que filtroRangoAvanceObra/filtroTipoEscuela:
            // se atenúa (no se oculta) lo que no matchea el filtro activo.
            const isFiltered = filtroTipoPauta && (filtroTipoPauta === 'activa') !== m.tieneActiva;
            return (
            <Marker key={`pauta-${m.nombreBarrio}`} position={[m.lat, m.lon]} icon={m.tieneActiva ? iconoPautaActiva : iconoPautaFinalizada} opacity={isFiltered ? 0.25 : 1}>
              <Popup offset={[0, -8]} pane="popupPane">
                <div style={{ fontFamily: '-apple-system, sans-serif', padding: '2px 4px', maxWidth: '250px' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 600,
                    padding: '2px 8px', borderRadius: '10px', marginBottom: '6px',
                    backgroundColor: m.tieneActiva ? '#2E7D3222' : '#9E9E9E22',
                    color: m.tieneActiva ? '#2E7D32' : '#616161',
                  }}>
                    {m.tieneActiva ? '● Pauta activa' : '○ Sin pauta activa'}
                  </div>
                  <div><strong style={{ fontSize: '13px' }}>{m.nombreBarrio}</strong></div>
                  <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{m.pautas.length} anuncio{m.pautas.length !== 1 ? 's' : ''} de pauta</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                    {/* Solo las 2 pautas más recientes (m.pautas ya viene ordenado por
                        inicio desc) — el contador de arriba sigue mostrando el
                        total real (m.pautas.length), no el límite acá aplicado. */}
                    {m.pautas.slice(0, 2).map((p, i) => {
                      const etiqueta = p.plataforma === 'GOOGLE' ? 'Visualizaciones' : 'Impresiones';
                      const inv = p.metricas_ejecutadas?.inversion;
                      const alcance = p.metricas_ejecutadas?.alcance_o_visualizaciones;
                      return (
                      <div key={p.fila_origen ?? i} style={{ borderTop: i > 0 ? '1px solid #eee' : 'none', paddingTop: i > 0 ? '6px' : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#333' }}>{p.titulo_pieza || '—'}</div>
                          <span style={{ flexShrink: 0, fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '8px', whiteSpace: 'nowrap', backgroundColor: p._activa ? '#2E7D3222' : '#9E9E9E22', color: p._activa ? '#2E7D32' : '#757575' }}>
                            {p._activa ? 'Activa' : 'Finalizada'}
                          </span>
                        </div>
                        <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>Vigencia: {formatearFecha(p.inicio)} → {formatearFecha(p.fin)}</div>
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                          {etiqueta}: {alcance != null ? alcance.toLocaleString() : 's/d'} · Inversión: {inv != null ? `$${inv.toLocaleString()}` : 's/d'}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                  <BotonVerBarrioEnPauta nombreBarrio={m.nombreBarrio} onVerBarrioEnPauta={onVerBarrioEnPauta} />
                </div>
              </Popup>
            </Marker>
            );
          })}
          {/* Alcance Capital (toda_capital): capa adicional, una estrella por circuito
              (no por barrio) en su punto de anclaje — ver pautaCapitalMarkers. Mismo
              ícono que pautaBarrioMarkers (sin distinción visual) y mismo toggle/filtro
              de capa Pauta, así que no agrega controles propios. */}
          {capasActivas.pauta && pautaCapitalMarkers.map((m) => {
            const isFiltered = filtroTipoPauta && (filtroTipoPauta === 'activa') !== m.tieneActiva;
            return (
            <Marker key={`pauta-capital-${m.mapkey}`} position={[m.lat, m.lon]} icon={m.tieneActiva ? iconoPautaActiva : iconoPautaFinalizada} opacity={isFiltered ? 0.25 : 1}>
              <Popup offset={[0, -8]} pane="popupPane">
                <div style={{ fontFamily: '-apple-system, sans-serif', padding: '2px 4px', maxWidth: '250px' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 600,
                    padding: '2px 8px', borderRadius: '10px', marginBottom: '6px',
                    backgroundColor: m.tieneActiva ? '#2E7D3222' : '#9E9E9E22',
                    color: m.tieneActiva ? '#2E7D32' : '#616161',
                  }}>
                    {m.tieneActiva ? '● Pauta activa' : '○ Sin pauta activa'}
                  </div>
                  <div><strong style={{ fontSize: '13px' }}>Alcance Capital</strong></div>
                  <div style={{ fontSize: '10px', color: '#999', marginTop: '1px' }}>{m.circuitoKey} - {m.circuitoNombre}</div>
                  <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{m.pautas.length} anuncio{m.pautas.length !== 1 ? 's' : ''} de pauta, aplican a toda Capital</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                    {/* Mismo patrón que pautaBarrioMarkers: solo las 2 pautas más
                        recientes (m.pautas ya viene ordenado por inicio desc), con el
                        resto resumido abajo como "+X más". */}
                    {m.pautas.slice(0, 2).map((p, i) => {
                      const etiqueta = p.plataforma === 'GOOGLE' ? 'Visualizaciones' : 'Impresiones';
                      const inv = p.metricas_ejecutadas?.inversion;
                      const alcance = p.metricas_ejecutadas?.alcance_o_visualizaciones;
                      return (
                      <div key={p.fila_origen ?? i} style={{ borderTop: i > 0 ? '1px solid #eee' : 'none', paddingTop: i > 0 ? '6px' : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#333' }}>{p.titulo_pieza || '—'}</div>
                          <span style={{ flexShrink: 0, fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '8px', whiteSpace: 'nowrap', backgroundColor: p._activa ? '#2E7D3222' : '#9E9E9E22', color: p._activa ? '#2E7D32' : '#757575' }}>
                            {p._activa ? 'Activa' : 'Finalizada'}
                          </span>
                        </div>
                        <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>Vigencia: {formatearFecha(p.inicio)} → {formatearFecha(p.fin)}</div>
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                          {etiqueta}: {alcance != null ? alcance.toLocaleString() : 's/d'} · Inversión: {inv != null ? `$${inv.toLocaleString()}` : 's/d'}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                  {m.pautas.length > 2 && (
                    <div style={{ fontSize: '10px', color: '#999', marginTop: '6px' }}>+{m.pautas.length - 2} más</div>
                  )}
                  <BotonVerCircuitoEnPauta circuitoKey={m.circuitoKey} onVerCircuitoEnPauta={onVerCircuitoEnPauta} />
                </div>
              </Popup>
            </Marker>
            );
          })}
          {capasActivas.escuelas && escuelasParaMostrar.map((esc) => {
            const pendienteRevision = esc.es_centro_votacion && esc.confianza === 'pendiente_revision';
            const colorRelleno = esc.es_centro_votacion ? COLOR_ESCUELA_CENTRO_VOTACION : COLOR_ESCUELA_SIN_VOTACION;
            // Mismo criterio de aislar/restaurar que filtroRangoAvanceObra usa para Obras
            // (fillOpacity 0.15 / opacity 0.3 para lo que no matchea el filtro activo).
            const isFiltered = filtroTipoEscuela && tipoEscuela(esc) !== filtroTipoEscuela;
            return (
              <CircleMarker
                key={`escuela-${esc.cue}`}
                center={[esc.lat, esc.lon]}
                radius={5}
                pathOptions={{
                  color: pendienteRevision ? COLOR_BORDE_PENDIENTE_REVISION : '#fff',
                  weight: pendienteRevision ? 1.5 : 1,
                  dashArray: pendienteRevision ? '2,2' : null,
                  fillColor: colorRelleno,
                  fillOpacity: isFiltered ? 0.15 : 0.9,
                  opacity: isFiltered ? 0.3 : 1,
                }}
              >
                <Popup offset={[0, -6]} pane="popupPane">
                  <div style={{ fontFamily: '-apple-system, sans-serif', padding: '2px 4px', maxWidth: '230px' }}>
                    <strong style={{ fontSize: '13px' }}>{esc.nombre}</strong>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '3px' }}>{esc.barrio}</div>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>{esc.domicilio || '—'}</div>
                    {esc.es_centro_votacion ? (
                      <>
                        <div style={{ fontSize: '12px', marginTop: '6px' }}>Mesas: <strong>{esc.n_mesas}</strong> · Votos válidos: <strong>{esc.votos_validos?.toLocaleString()}</strong></div>
                        <div style={{ fontSize: '12px', marginTop: '2px' }}>% Peronismo: <strong style={{ color: COLOR_ESCUELA_CENTRO_VOTACION }}>{esc.pct_peronismo?.toFixed(1)}%</strong></div>
                        {esc.confianza === 'pendiente_revision' && (
                          <div style={{ fontSize: '11px', color: COLOR_BORDE_PENDIENTE_REVISION, marginTop: '5px' }}>⚠ Match de escuela pendiente de revisión, dato aproximado.</div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: '12px', marginTop: '6px' }}>Nivel: {formatNivelEscuela(esc.nivel)}</div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </Pane>

        <MapController mapkeySeleccionado={mapkeySeleccionado} geoJsonData={geoJsonData} zoomBarrioSolicitado={zoomBarrioSolicitado} barriosGeoData={barriosGeoData} barriosVisible={capasActivas.barrios} />
        <ClickHandler geoJsonData={geoJsonData} barriosGeoData={barriosGeoData} datosLookup={datosLookup} onMapClick={onMapClick} />
      </MapContainer>
    </div>
  );
}
