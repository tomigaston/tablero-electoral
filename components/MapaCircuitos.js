import React, { useEffect, useRef, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap, useMapEvent } from 'react-leaflet';
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

export default function MapaCircuitos({ datos, geoData, barriosGeoData, obrasEnriquecidas, escuelasData, circuitoSeleccionado, onMapClick, barrioSeleccionado, filtroCategoria, setFiltroCategoria, coloresCategoria, zoomBarrioSolicitado, onSelectObra }) {
  const geoJsonRef = useRef(null);

  const [capasActivas, setCapasActivas] = useState({ circuitos: true, barrios: false, obras: true, escuelas: false });
  const toggleCapa = (capa) => setCapasActivas(prev => ({ ...prev, [capa]: !prev[capa] }));

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

  const getBarrioStyle = (feature) => {
    const nombre = feature.properties?.nombre_barrio;
    const isSelected = barrioSeleccionado && normalizarNombreBarrio(nombre) === normalizarNombreBarrio(barrioSeleccionado);
    return {
      fillOpacity: isSelected ? 0.2 : 0,
      fillColor: '#5C6BC0',
      color: isSelected ? '#3949AB' : '#455A64',
      weight: isSelected ? 2.5 : 1,
      opacity: isSelected ? 0.9 : 0.5,
      dashArray: isSelected ? null : '3,3',
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
    
    return {
      fillColor: color,
      fillOpacity: isFiltered ? 0.15 : (isSelected ? 0.9 : 0.7),
      color: isSelected ? '#1565C0' : '#ffffff',
      weight: isSelected ? 3 : 1,
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
        e.target.setStyle({ fillOpacity: 0.85, weight: 2 });
      }
    });
    
    layer.on('mouseout', (e) => {
      if (mapkey !== mapkeySeleccionado) {
        const datosC = datosLookup[mapkey];
        const isFiltered = filtroCategoria && datosC?.Categoria_v4 !== filtroCategoria;
        e.target.setStyle({ fillOpacity: isFiltered ? 0.15 : 0.7, weight: 1 });
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
  }, [mapkeySeleccionado, datosLookup, filtroCategoria]);
  
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
        <div style={{ position: 'absolute', bottom: '10px', left: '410px', zIndex: 500, backgroundColor: '#fff', borderRadius: '8px', padding: '8px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', maxWidth: '170px' }}>
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
        {capasActivas.circuitos && (
          <GeoJSON ref={geoJsonRef} key={`${mapkeySeleccionado}-${filtroCategoria}`} data={geoJsonData} style={getStyle} onEachFeature={onEachFeature} />
        )}
        {capasActivas.barrios && barriosGeoData && (
          <GeoJSON key={`barrios-${barrioSeleccionado}`} data={barriosGeoData} style={getBarrioStyle} onEachFeature={onEachBarrio} />
        )}
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
              pathOptions={{ color: '#fff', weight: 1, fillColor: colorEstado, fillOpacity: isFiltered ? 0.15 : 0.9, opacity: isFiltered ? 0.3 : 1 }}
              eventHandlers={{ click: () => onSelectObra && onSelectObra(obra) }}
            />
          );
        })}
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
        <MapController mapkeySeleccionado={mapkeySeleccionado} geoJsonData={geoJsonData} zoomBarrioSolicitado={zoomBarrioSolicitado} barriosGeoData={barriosGeoData} barriosVisible={capasActivas.barrios} />
        <ClickHandler geoJsonData={geoJsonData} barriosGeoData={barriosGeoData} datosLookup={datosLookup} onMapClick={onMapClick} />
      </MapContainer>
    </div>
  );
}
