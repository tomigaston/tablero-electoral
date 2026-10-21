// Mapa de circuitos del Resumen. Reutiliza lo que ya usa el tablero (react-leaflet, topojson-client y
// /data/circuitos_cordoba.json, unido por Mapkey = properties.circuito) sin tocar components/MapaCircuitos.js:
// acá cada circuito se pinta por prioridad y, si hay un filtro activo, solo se pintan los que cumplen.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import * as topojson from 'topojson-client';
import 'leaflet/dist/leaflet.css';
import { COLOR_PRIORIDAD, LABEL_PRIORIDAD } from '../../lib/planificador/config';
import { fmtDeltaPP, num1 } from '../../lib/planificador/base';

const COLOR_APAGADO = '#BDBDBD';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function textoTendencia(t) {
  if (t.estado === 'sin_medir') return 'sin medir';
  if (t.estado === 'sin_tendencia') return '1 ronda';
  if (t.estado === 'estable') return '→ estable';
  return `${t.estado === 'mejora' ? '↑' : '↓'} ${fmtDeltaPP(t.delta)}`;
}

function tooltipDe(f) {
  const aprob = f.tendencia.aprobacion != null ? `${num1(f.tendencia.aprobacion)}%` : 'sin dato';
  return `<div style="font-family: -apple-system, sans-serif; padding: 4px 6px;">
    <strong style="font-size: 13px;">${esc(f.key)} · ${esc(f.nombre)}</strong>
    <div style="font-size: 12px; margin-top: 3px;"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${COLOR_PRIORIDAD[f.prioridad.nivel]};margin-right:5px;"></span>${esc(LABEL_PRIORIDAD[f.prioridad.nivel])}</div>
    <div style="font-size: 12px; color: #555; margin-top: 2px;">Aprobación ${aprob} · ${esc(textoTendencia(f.tendencia))}</div>
  </div>`;
}

function estiloDe(feature, porMapkey, set) {
  const f = porMapkey.get(String(feature.properties.circuito));
  if (!f) return { fillColor: COLOR_APAGADO, fillOpacity: 0.1, color: '#ffffff', weight: 1 };
  const activo = !set || set.has(f.key);
  return activo
    ? { fillColor: COLOR_PRIORIDAD[f.prioridad.nivel] || COLOR_APAGADO, fillOpacity: 0.75, color: '#ffffff', weight: 1 }
    : { fillColor: COLOR_APAGADO, fillOpacity: 0.25, color: '#ffffff', weight: 1 };
}

/**
 * @param {object[]} filas filas del planificador (una por circuito)
 * @param {string[]|null} claves circuitos que cumplen el filtro activo (null = sin filtro)
 * @param {(key: string) => void} onAbrir clic en un circuito -> abrir su ficha
 */
export default function MapaResumen({ filas, claves, onAbrir, alto = 'clamp(380px, 58vh, 560px)' }) {
  const [topo, setTopo] = useState(null);
  const [error, setError] = useState(null);
  const geoRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    fetch('/data/circuitos_cordoba.json')
      .then((r) => { if (!r.ok) throw new Error(`No se pudo cargar circuitos_cordoba.json (${r.status})`); return r.json(); })
      .then((j) => { if (vivo) setTopo(j); })
      .catch((e) => { if (vivo) setError(e.message || String(e)); });
    return () => { vivo = false; };
  }, []);

  const geoJsonData = useMemo(() => {
    if (!topo) return null;
    try {
      const objectKey = Object.keys(topo.objects)[0];
      return objectKey ? topojson.feature(topo, topo.objects[objectKey]) : null;
    } catch (e) {
      console.error('Error convirtiendo TopoJSON:', e);
      return null;
    }
  }, [topo]);

  // Encuadre inicial: que entren todos los circuitos en el primer zoom ([[sur, oeste], [norte, este]]).
  const limites = useMemo(() => {
    if (!geoJsonData) return null;
    let sur = 90; let oeste = 180; let norte = -90; let este = -180;
    const recorrer = (c) => {
      if (typeof c[0] === 'number') {
        if (c[1] < sur) sur = c[1];
        if (c[1] > norte) norte = c[1];
        if (c[0] < oeste) oeste = c[0];
        if (c[0] > este) este = c[0];
      } else c.forEach(recorrer);
    };
    geoJsonData.features.forEach((ft) => { if (ft.geometry) recorrer(ft.geometry.coordinates); });
    return norte > sur ? [[sur, oeste], [norte, este]] : null;
  }, [geoJsonData]);

  const porMapkey = useMemo(() => new Map(filas.map((f) => [String(f.mapkey), f])), [filas]);
  const set = useMemo(() => (claves ? new Set(claves) : null), [claves]);

  // Los handlers de Leaflet quedan atados al closure del montaje: leen el estado vigente por ref.
  const actual = useRef({});
  actual.current = { porMapkey, set, onAbrir };

  useEffect(() => {
    if (!geoRef.current) return;
    geoRef.current.eachLayer((layer) => { if (layer.feature) layer.setStyle(estiloDe(layer.feature, porMapkey, set)); });
  }, [porMapkey, set, geoJsonData]);

  const onEachFeature = (feature, layer) => {
    const f = actual.current.porMapkey.get(String(feature.properties.circuito));
    if (!f) return;
    layer.bindTooltip(tooltipDe(f), { sticky: true, direction: 'top', offset: [0, -10] });
    layer.on('mouseover', (e) => { e.target.setStyle({ weight: 3, color: '#37474F' }); });
    layer.on('mouseout', (e) => { e.target.setStyle(estiloDe(feature, actual.current.porMapkey, actual.current.set)); });
    layer.on('click', () => actual.current.onAbrir && actual.current.onAbrir(f.key));
  };

  // Lo que no matchea se informa, no se inventa.
  const sinPintar = useMemo(() => {
    if (!geoJsonData) return null;
    const enMapa = new Set(geoJsonData.features.map((ft) => String(ft.properties.circuito)));
    return {
      sinGeometria: filas.filter((f) => !enMapa.has(String(f.mapkey))).map((f) => f.key),
      geometriaSinDatos: geoJsonData.features.filter((ft) => !porMapkey.has(String(ft.properties.circuito))).map((ft) => ft.properties.circuito),
    };
  }, [geoJsonData, filas, porMapkey]);

  // Mapa para imprimir / exportar a PDF: los mismos circuitos y colores dibujados como SVG (el mapa interactivo de Leaflet
  // no se reajusta al ancho de la hoja y con él el zoom salía mal). Proyección plana con el coseno de la latitud.
  const mapaImpresion = useMemo(() => {
    if (!geoJsonData || !limites) return null;
    const [[sur, oeste], [norte, este]] = limites;
    const k = Math.cos((((sur + norte) / 2) * Math.PI) / 180);
    const X = (lon) => ((lon - oeste) * k).toFixed(5);
    const Y = (lat) => (norte - lat).toFixed(5);
    const anillo = (r) => `${r.map((p, i) => `${i ? 'L' : 'M'}${X(p[0])} ${Y(p[1])}`).join('')}Z`;
    const trazo = (g) => {
      if (!g) return '';
      if (g.type === 'Polygon') return g.coordinates.map(anillo).join('');
      if (g.type === 'MultiPolygon') return g.coordinates.map((p) => p.map(anillo).join('')).join('');
      return '';
    };
    return { ancho: (este - oeste) * k, alto: norte - sur, trazos: geoJsonData.features.map((ft) => ({ ft, d: trazo(ft.geometry) })) };
  }, [geoJsonData, limites]);

  if (error) return <div style={{ height: alto, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B71C1C', border: '1px solid #BC1734', borderRadius: 8, padding: 16 }}>No se pudo cargar el mapa: {error}</div>;
  if (!geoJsonData) return <div style={{ height: alto, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', borderRadius: 8, color: 'var(--text-tertiary)' }}>Cargando mapa…</div>;

  return (
    <div>
      {mapaImpresion && (
        <div className="plan-solo-print" style={{ display: 'none' }}>
          <svg viewBox={`0 0 ${mapaImpresion.ancho} ${mapaImpresion.alto}`} width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa de circuitos de Córdoba Capital"
            style={{ display: 'block', maxHeight: '100mm', background: '#EEF2F6', borderRadius: 10 }}>
            {mapaImpresion.trazos.map(({ ft, d }) => {
              const st = estiloDe(ft, porMapkey, set);
              return <path key={ft.properties.circuito} d={d} fill={st.fillColor} fillOpacity={st.fillOpacity} stroke="#FFFFFF" strokeWidth={mapaImpresion.ancho / 1400} strokeLinejoin="round" fillRule="evenodd" />;
            })}
          </svg>
        </div>
      )}
      <div className="plan-no-print" style={{ height: alto, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <MapContainer center={[-31.42, -64.18]} zoom={11} bounds={limites || undefined} boundsOptions={{ padding: [6, 6] }} zoomSnap={0.25} style={{ height: '100%', width: '100%' }} zoomControl scrollWheelZoom>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <GeoJSON ref={geoRef} data={geoJsonData} style={(feature) => estiloDe(feature, actual.current.porMapkey, actual.current.set)} onEachFeature={onEachFeature} />
        </MapContainer>
      </div>
      {sinPintar && (sinPintar.sinGeometria.length > 0 || sinPintar.geometriaSinDatos.length > 0) && (
        <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 6 }}>
          {sinPintar.sinGeometria.length > 0 && <>Sin geometría en el mapa (no se pintan): {sinPintar.sinGeometria.join(', ')}. </>}
          {sinPintar.geometriaSinDatos.length > 0 && <>Geometrías sin datos de circuito: {sinPintar.geometriaSinDatos.join(', ')}.</>}
        </p>
      )}
    </div>
  );
}
