import React, { useEffect, useRef, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Marker, Popup, Pane, useMap, useMapEvent } from 'react-leaflet';
import * as topojson from 'topojson-client';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import 'leaflet/dist/leaflet.css';

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

// Color por estado de obra (obras_capital.json) — "Finalizado — Inaugurable" se
// destaca en verde porque es el estado más accionable para el tablero (obra lista
// para un acto de inauguración), en línea con el resto del proyecto (cobertura,
// recorridos, pauta), que ya prioriza actividad de campaña real.
const COLOR_OBRA_ESTADO = {
  'Por relevar': '#9E9E9E',
  'Relevado': '#26A69A',
  'En ejecución': '#FFA726',
  'Finalizado': '#5C6BC0',
  'Finalizado — Inaugurable': '#2E7D32',
};
const COLOR_OBRA_DEFAULT = '#9E9E9E'; // estado no reconocido / ausente
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
// encima. tooltipPane (650) y popupPane (700) de Leaflet, sin tocar, ya quedan por
// encima de ambos.
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

// pautas_barrios.json (esquema Meta Ads actual) trae la vigencia como fecha_creacion /
// fecha_finalizacion en formato "YYYY-MM-DD" — NO fecha_salida/fecha_cierre (esquema
// viejo, ya no existe). Se compara a nivel de día contra "hoy" del cliente. Fecha
// ausente o no parseable -> null, tratado por el llamador como finalizada (no activa).
function parsearFechaISO(fechaStr) {
  if (!fechaStr || typeof fechaStr !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaStr);
  if (!match) return null;
  const [, y, m, d] = match;
  const fecha = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
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

export default function MapaCircuitos({ datos, geoData, barriosGeoData, obrasEnriquecidas, escuelasData, pautasBarriosData, circuitoSeleccionado, onMapClick, barrioSeleccionado, filtroCategoria, setFiltroCategoria, coloresCategoria, zoomBarrioSolicitado, onSelectObra }) {
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
  // sigue teniendo sentido con un circuito/barrio enfocado (ej. ver solo obras
  // "Finalizado — Inaugurable" mientras se está parado en una ficha) — por eso vive local
  // y no se resetea en navegación.
  const [filtroEstadoObra, setFiltroEstadoObra] = useState(null);

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

  // obras_capital.json: cada obra ya trae su propia lat/lon (a diferencia del viejo
  // obras_largo.json, que se geocodificaba por centroide de barrio) — las 38 sin
  // lat/lon (17 "manual" + 21 "descartado") no se grafican, tal como se espera.
  const obrasParaMostrar = useMemo(() => {
    return (obrasEnriquecidas || []).filter(o => o.lat != null && o.lon != null);
  }, [obrasEnriquecidas]);

  const escuelasParaMostrar = useMemo(() => escuelasData?.escuelas || [], [escuelasData]);

  // pautas_barrios.json viene indexado por nombre de barrio (nivel barrio, no por
  // anuncio individual) — un marker por barrio con pauta, ubicado en el centroide de su
  // polígono en barrios_geo.json (mismo cruce normalizado que ya usa este archivo para
  // Barrios/Territorio). barrios_geo.json tiene 16 nombres de barrio duplicados
  // (fragmentos no contiguos, ver comentario de resolverCircuitoPrincipalDeBarrio en
  // pages/index.js) — para el marker se toma el primer fragmento que matchea, sin
  // intentar elegir "el principal" (no hay campo que lo indique). Los barrios de pauta
  // sin ningún fragmento que matchee ni con normalización quedan afuera del mapa (no se
  // inventa ubicación) y se listan en consola para poder avisarlos.
  // Cada pauta se anota con _activa (fecha_finalizacion >= hoy) al vuelo acá — una sola
  // vez por render de esta capa, no en el render de cada marker — y un barrio "tiene
  // pauta activa" si alguna de sus pautas lo está. Fechas ausentes/no parseables se
  // tratan como finalizadas (no rompen el cálculo) y se cuentan para avisar en consola.
  const pautaBarrioMarkers = useMemo(() => {
    if (!pautasBarriosData || !barriosGeoData) return [];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const sinMatch = [];
    let sinFechaValidaCount = 0;

    const anotarPautas = (pautasRaw) => (pautasRaw || []).map(p => {
      const fechaFin = parsearFechaISO(p.fecha_finalizacion);
      if (!fechaFin) sinFechaValidaCount += 1;
      return { ...p, _activa: fechaFin ? fechaFin >= hoy : false };
    });

    const markers = Object.keys(pautasBarriosData).map(nombreBarrio => {
      const normalizado = normalizarNombreBarrio(nombreBarrio);
      const feature = barriosGeoData.features.find(f => normalizarNombreBarrio(f.properties?.nombre_barrio) === normalizado);
      const lat = feature?.properties?.centroid_lat;
      const lon = feature?.properties?.centroid_lon;
      const pautas = anotarPautas(pautasBarriosData[nombreBarrio].pautas);
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
      console.warn(`Pauta: ${sinFechaValidaCount} registro(s) sin fecha_finalizacion parseable, tratados como finalizados.`);
    }
    return markers;
  }, [pautasBarriosData, barriosGeoData]);

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

      {capasActivas.escuelas && (
        <div style={{ position: 'absolute', bottom: '10px', left: '210px', zIndex: 500, backgroundColor: '#fff', borderRadius: '8px', padding: '8px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', maxWidth: '190px' }}>
          <div style={{ fontSize: '11px', color: '#37474F', marginBottom: '5px' }}>Escuelas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: COLOR_ESCUELA_CENTRO_VOTACION, border: '1px solid #fff', boxShadow: '0 0 0 1px ' + COLOR_ESCUELA_CENTRO_VOTACION, flexShrink: 0 }} />
              <span style={{ fontSize: '9px', color: '#546E7A' }}>Centro de votación</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: COLOR_ESCUELA_CENTRO_VOTACION, border: `1.5px dashed ${COLOR_BORDE_PENDIENTE_REVISION}`, flexShrink: 0 }} />
              <span style={{ fontSize: '9px', color: '#546E7A' }}>Match pendiente de revisión</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: COLOR_ESCUELA_SIN_VOTACION, border: '1px solid #fff', boxShadow: '0 0 0 1px ' + COLOR_ESCUELA_SIN_VOTACION, flexShrink: 0 }} />
              <span style={{ fontSize: '9px', color: '#546E7A' }}>Escuela sin centro de votación</span>
            </div>
          </div>
        </div>
      )}

      {capasActivas.obras && (
        <div style={{ position: 'absolute', bottom: '10px', right: '10px', zIndex: 500, backgroundColor: '#fff', borderRadius: '8px', padding: '8px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', maxWidth: '170px' }}>
          <div style={{ fontSize: '11px', color: '#37474F', marginBottom: '5px' }}>Obras (click para filtrar)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {Object.entries(COLOR_OBRA_ESTADO).map(([estado, color]) => (
              <div
                key={estado}
                onClick={() => setFiltroEstadoObra(filtroEstadoObra === estado ? null : estado)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 5px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s', backgroundColor: filtroEstadoObra === estado ? `${color}20` : 'transparent', border: filtroEstadoObra === estado ? `1px solid ${color}` : '1px solid transparent' }}
              >
                <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: color, border: '1px solid #fff', boxShadow: `0 0 0 1px ${color}`, flexShrink: 0 }} />
                <span style={{ fontSize: '9px', color: '#546E7A' }}>{estado}</span>
              </div>
            ))}
          </div>
          {filtroEstadoObra && <button onClick={() => setFiltroEstadoObra(null)} style={{ marginTop: '6px', padding: '3px 6px', fontSize: '10px', border: '1px solid #e0e0e0', borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer', color: '#666', width: '100%' }}>✕ Limpiar filtro</button>}
        </div>
      )}

      {coloresCategoria && (
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
            const colorEstado = COLOR_OBRA_ESTADO[obra.estado] || COLOR_OBRA_DEFAULT;
            // Mismo criterio de aislar/restaurar que getStyle() usa para los polígonos de
            // circuito con filtroCategoria (fillOpacity 0.15 / opacity 0.3 para lo que no
            // matchea el filtro activo).
            const isFiltered = filtroEstadoObra && obra.estado !== filtroEstadoObra;
            return (
              <CircleMarker
                key={`obra-${obra.id}-${i}`}
                center={[obra.lat, obra.lon]}
                radius={6}
                pathOptions={{ color: '#fff', weight: 2, fillColor: colorEstado, fillOpacity: isFiltered ? 0.15 : 0.9, opacity: isFiltered ? 0.3 : 1 }}
                eventHandlers={{ click: () => onSelectObra && onSelectObra(obra) }}
              />
            );
          })}
          {capasActivas.pauta && pautaBarrioMarkers.map((m) => (
            <Marker key={`pauta-${m.nombreBarrio}`} position={[m.lat, m.lon]} icon={m.tieneActiva ? iconoPautaActiva : iconoPautaFinalizada}>
              <Popup offset={[0, -8]}>
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
                    {m.pautas.map((p, i) => (
                      <div key={p.fila_origen ?? i} style={{ borderTop: i > 0 ? '1px solid #eee' : 'none', paddingTop: i > 0 ? '6px' : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#333' }}>{p.codigo_anuncio || '—'}</div>
                          <span style={{ flexShrink: 0, fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '8px', whiteSpace: 'nowrap', backgroundColor: p._activa ? '#2E7D3222' : '#9E9E9E22', color: p._activa ? '#2E7D32' : '#757575' }}>
                            {p._activa ? 'Activa' : 'Finalizada'}
                          </span>
                        </div>
                        <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>Vigencia: {p.fecha_creacion || '—'} → {p.fecha_finalizacion || '—'}</div>
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                          Alcance: {p.alcance?.toLocaleString() ?? '—'} · Gasto: {p.importe_gastado != null ? `$${p.importe_gastado.toLocaleString()}` : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
          {capasActivas.escuelas && escuelasParaMostrar.map((esc) => {
            const pendienteRevision = esc.es_centro_votacion && esc.confianza === 'pendiente_revision';
            const colorRelleno = esc.es_centro_votacion ? COLOR_ESCUELA_CENTRO_VOTACION : COLOR_ESCUELA_SIN_VOTACION;
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
                  fillOpacity: 0.9,
                }}
              >
                <Popup offset={[0, -6]}>
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
