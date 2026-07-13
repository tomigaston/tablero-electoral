import React, { useEffect, useRef, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap } from 'react-leaflet';
import * as topojson from 'topojson-client';
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

const COLOR_OBRA = '#5C6BC0';

// Normaliza nombres de barrio para cruzar obras_largo.json (barrio_normalizado)
// con barrios_geo.json (nombre_barrio): mismo texto pero con diferencias de
// espacios dobles y del carácter ordinal "º" vs "o" (ej. "1º DE MAYO" / "1o DE MAYO").
function normalizarNombreBarrio(s) {
  return (s || '')
    .toUpperCase()
    .replace(/[ºª]/g, 'O')
    .replace(/\s+/g, ' ')
    .trim();
}

// Desplaza obras que comparten el centroide de un mismo barrio en un patrón
// circular, para que cada una quede como marker individual y clickeable.
// Cuando en el futuro cada obra tenga su propia lat/lon, este paso deja de usarse.
function offsetCentroide(index, total, lat, lon) {
  if (total <= 1) return [lat, lon];
  const radioGrados = 0.0012;
  const angulo = (2 * Math.PI * index) / total;
  const correccionLon = Math.cos((lat * Math.PI) / 180) || 1;
  return [lat + radioGrados * Math.sin(angulo), lon + (radioGrados * Math.cos(angulo)) / correccionLon];
}

function MapController({ mapkeySeleccionado, geoJsonData }) {
  const map = useMap();

  useEffect(() => {
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
  }, [mapkeySeleccionado, geoJsonData, map]);

  return null;
}

export default function MapaCircuitos({ datos, geoData, barriosGeoData, obrasData, circuitoSeleccionado, onSelectCircuito, barrioSeleccionado, onSelectBarrio, filtroCategoria, setFiltroCategoria, coloresCategoria }) {
  const geoJsonRef = useRef(null);

  const [capasActivas, setCapasActivas] = useState({ circuitos: true, barrios: false, obras: true });
  const toggleCapa = (capa) => setCapasActivas(prev => ({ ...prev, [capa]: !prev[capa] }));

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

  // Lookup de barrios por nombre normalizado, para estilar la capa y geocodificar obras
  const barriosLookup = useMemo(() => {
    const lookup = {};
    (barriosGeoData?.features || []).forEach(f => {
      const key = normalizarNombreBarrio(f.properties?.nombre_barrio);
      if (key) lookup[key] = f.properties;
    });
    return lookup;
  }, [barriosGeoData]);

  // Obras con match_poligono:true, geocodificadas en el centroide del barrio correspondiente
  const obrasParaMostrar = useMemo(() => {
    const grupos = {};
    (obrasData || []).filter(o => o.match_poligono === true).forEach(o => {
      const key = normalizarNombreBarrio(o.barrio_normalizado);
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(o);
    });
    const resultado = [];
    Object.entries(grupos).forEach(([key, obras]) => {
      const barrio = barriosLookup[key];
      if (!barrio) return;
      obras.forEach((o, i) => {
        const [lat, lon] = offsetCentroide(i, obras.length, barrio.centroid_lat, barrio.centroid_lon);
        resultado.push({ ...o, lat, lon });
      });
    });
    return resultado;
  }, [obrasData, barriosLookup]);

  const getBarrioStyle = (feature) => {
    const nombre = feature.properties?.nombre_barrio;
    const isSelected = barrioSeleccionado && nombre === barrioSeleccionado;
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
    layer.on('click', () => {
      if (onSelectBarrio) onSelectBarrio(nombre);
    });
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

    layer.on('click', () => {
      if (onSelectCircuito && datosCircuito) {
        onSelectCircuito(datosCircuito.CircuitoKey);
      }
    });

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
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.5, cursor: 'not-allowed' }} title="Todavía sin datos">
          <input type="checkbox" disabled />
          Escuelas <span style={{ fontSize: '11px' }}>(próximamente)</span>
        </label>
      </div>

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
        {capasActivas.obras && obrasParaMostrar.map((obra, i) => (
          <CircleMarker
            key={`obra-${i}`}
            center={[obra.lat, obra.lon]}
            radius={6}
            pathOptions={{ color: '#fff', weight: 1, fillColor: COLOR_OBRA, fillOpacity: 0.9 }}
          >
            <Popup offset={[0, -6]}>
              <div style={{ fontFamily: '-apple-system, sans-serif', padding: '2px 4px', maxWidth: '220px' }}>
                <strong style={{ fontSize: '13px' }}>{obra.barrio}</strong>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '3px' }}>{obra.programa || '—'}</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>{obra.descripcion || '—'}</div>
                <div style={{ fontSize: '12px', marginTop: '4px', fontWeight: 600, color: COLOR_OBRA }}>{obra.estado || 'Sin dato'}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
        <MapController mapkeySeleccionado={mapkeySeleccionado} geoJsonData={geoJsonData} />
      </MapContainer>
    </div>
  );
}
