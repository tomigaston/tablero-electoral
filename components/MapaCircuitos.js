import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import * as topojson from 'topojson-client';
import 'leaflet/dist/leaflet.css';

// Colores por categoría
const COLORES_CATEGORIA = {
  'A.1': '#4CAF50',
  'A.2': '#FFCA28', 
  'B.1': '#26A69A',
  'B.3': '#FF7043',
  'B.2': '#78909C',
  'C': '#EF5350',
};

// Componente para ajustar vista cuando cambia selección
function MapController({ circuitoSeleccionado, geoJsonData }) {
  const map = useMap();
  
  useEffect(() => {
    if (circuitoSeleccionado && geoJsonData) {
      const feature = geoJsonData.features.find(
        f => f.properties.CircuitoKey === circuitoSeleccionado
      );
      if (feature && feature.geometry) {
        try {
          const L = require('leaflet');
          const layer = L.geoJSON(feature);
          const bounds = layer.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
          }
        } catch (e) {
          console.log('Error ajustando bounds');
        }
      }
    } else {
      // Vista general de Córdoba Capital
      map.setView([-31.42, -64.18], 12);
    }
  }, [circuitoSeleccionado, geoJsonData, map]);
  
  return null;
}

export default function MapaCircuitos({ datos, geoData, circuitoSeleccionado, onSelectCircuito }) {
  const geoJsonRef = useRef(null);
  
  // Convertir TopoJSON a GeoJSON
  const geoJsonData = React.useMemo(() => {
    if (!geoData) return null;
    
    try {
      // Buscar el objeto correcto en el TopoJSON
      const objectKey = Object.keys(geoData.objects)[0];
      if (!objectKey) return null;
      
      const converted = topojson.feature(geoData, geoData.objects[objectKey]);
      return converted;
    } catch (e) {
      console.error('Error convirtiendo TopoJSON:', e);
      return null;
    }
  }, [geoData]);
  
  // Crear lookup de datos por circuito
  const datosLookup = React.useMemo(() => {
    const lookup = {};
    datos.forEach(d => {
      lookup[d.CircuitoKey] = d;
    });
    return lookup;
  }, [datos]);
  
  // Estilo para cada feature
  const getStyle = (feature) => {
    const circuitoKey = feature.properties.CircuitoKey || feature.properties.cirn_id;
    const datosCircuito = datosLookup[circuitoKey];
    const categoria = datosCircuito?.Categoria_v4 || 'B.2';
    const color = COLORES_CATEGORIA[categoria] || '#78909C';
    const isSelected = circuitoKey === circuitoSeleccionado;
    
    return {
      fillColor: color,
      fillOpacity: isSelected ? 0.85 : 0.6,
      color: isSelected ? '#1565C0' : '#ffffff',
      weight: isSelected ? 3 : 1,
      opacity: 1,
    };
  };
  
  // Handlers para cada feature
  const onEachFeature = (feature, layer) => {
    const circuitoKey = feature.properties.CircuitoKey || feature.properties.cirn_id;
    const datosCircuito = datosLookup[circuitoKey];
    
    // Tooltip
    const tooltipContent = `
      <div style="font-family: -apple-system, sans-serif; padding: 4px;">
        <strong style="font-size: 13px;">${circuitoKey}</strong>
        ${datosCircuito ? `
          <div style="font-size: 12px; color: #666; margin-top: 2px;">
            ${datosCircuito.cirn_nom || ''}
          </div>
          <div style="font-size: 12px; margin-top: 4px;">
            Gob. 2023: <strong>${(datosCircuito.Share_G23 * 100).toFixed(1)}%</strong>
          </div>
        ` : ''}
      </div>
    `;
    
    layer.bindTooltip(tooltipContent, {
      sticky: true,
      direction: 'top',
      offset: [0, -10],
      className: 'custom-tooltip',
    });
    
    // Click handler
    layer.on('click', () => {
      if (onSelectCircuito) {
        onSelectCircuito(circuitoKey);
      }
    });
    
    // Hover effects
    layer.on('mouseover', (e) => {
      if (circuitoKey !== circuitoSeleccionado) {
        e.target.setStyle({
          fillOpacity: 0.8,
          weight: 2,
        });
      }
    });
    
    layer.on('mouseout', (e) => {
      if (circuitoKey !== circuitoSeleccionado) {
        e.target.setStyle({
          fillOpacity: 0.6,
          weight: 1,
        });
      }
    });
  };
  
  // Actualizar estilos cuando cambia la selección
  useEffect(() => {
    if (geoJsonRef.current) {
      geoJsonRef.current.eachLayer(layer => {
        const feature = layer.feature;
        if (feature) {
          layer.setStyle(getStyle(feature));
        }
      });
    }
  }, [circuitoSeleccionado, datosLookup]);
  
  if (!geoJsonData) {
    return (
      <div style={{
        flex: 1,
        backgroundColor: '#f5f5f5',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#999',
        fontSize: '14px',
      }}>
        Cargando mapa...
      </div>
    );
  }
  
  return (
    <div style={{ flex: 1, borderRadius: '8px', overflow: 'hidden' }}>
      <style>{`
        .custom-tooltip {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          padding: 0;
        }
        .custom-tooltip .leaflet-tooltip-content {
          margin: 0;
        }
        .leaflet-container {
          background: #f5f5f5;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
      `}</style>
      
      <MapContainer
        center={[-31.42, -64.18]}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        
        <GeoJSON
          ref={geoJsonRef}
          data={geoJsonData}
          style={getStyle}
          onEachFeature={onEachFeature}
        />
        
        <MapController 
          circuitoSeleccionado={circuitoSeleccionado}
          geoJsonData={geoJsonData}
        />
      </MapContainer>
    </div>
  );
}
