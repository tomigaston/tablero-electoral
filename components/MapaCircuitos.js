import React, { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import * as topojson from 'topojson-client';
import 'leaflet/dist/leaflet.css';

// Colores por categoría v4
const COLORES_CATEGORIA = {
  'A.1': '#4CAF50',
  'A.2': '#FFCA28',
  'B.1': '#26A69A',
  'B.3': '#FF7043',
  'B.2': '#78909C',
  'C': '#EF5350',
};

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

export default function MapaCircuitos({ datos, geoData, circuitoSeleccionado, onSelectCircuito, filtroCategoria }) {
  const geoJsonRef = useRef(null);
  
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
      fillOpacity: isFiltered ? 0.15 : (isSelected ? 0.9 : 0.65),
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
        e.target.setStyle({ fillOpacity: isFiltered ? 0.15 : 0.65, weight: 1 });
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
    <div style={{ flex: 1, borderRadius: '8px', overflow: 'hidden' }}>
      <style>{`
        .custom-tooltip { background: white; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); padding: 0; }
        .custom-tooltip .leaflet-tooltip-content { margin: 0; }
        .leaflet-container { background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      `}</style>
      
      <MapContainer center={[-31.42, -64.18]} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={true} scrollWheelZoom={true}>
        <TileLayer attribution='&copy; <a href="https://carto.com/">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
        <GeoJSON ref={geoJsonRef} key={`${mapkeySeleccionado}-${filtroCategoria}`} data={geoJsonData} style={getStyle} onEachFeature={onEachFeature} />
        <MapController mapkeySeleccionado={mapkeySeleccionado} geoJsonData={geoJsonData} />
      </MapContainer>
    </div>
  );
}
