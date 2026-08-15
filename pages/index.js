import React, { useState, useEffect, useMemo, useRef } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import * as topojson from 'topojson-client';
import { obrasCercanasABarrio, obrasCercanasACircuito, construirIndiceBarrioCircuito, enriquecerObrasConCircuito, obrasCercanasAObra } from '../lib/obrasCercanas';
import { formatearFecha } from '../lib/formatearFecha';

const MapaCircuitos = dynamic(() => import('../components/MapaCircuitos'), { 
  ssr: false,
  loading: () => <div style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>Cargando mapa...</div>
});

// ============================================
// PALETA DE COLORES
// ============================================
const COLORES_CATEGORIA = {
  'A.1': { bg: '#2E7D32', text: '#1B5E20', label: 'BASTIÓN SÓLIDO' },
  'A.2': { bg: '#FFCA28', text: '#F57F17', label: 'BASTIÓN CON EROSIÓN' },
  'B.1': { bg: '#26A69A', text: '#00695C', label: 'TERRITORIO LEAL' },
  'B.3': { bg: '#FF7043', text: '#BF360C', label: 'PÉRDIDA 2023' },
  'B.2': { bg: '#78909C', text: '#37474F', label: 'EN DISPUTA' },
  'D': { bg: '#78909C', text: '#37474F', label: 'EN DISPUTA' },
  'C': { bg: '#EF5350', text: '#B71C1C', label: 'TERRITORIO HOSTIL' },
};

const COLORES_ML = {
  'ML.1': { bg: '#4CAF50', text: '#1B5E20', label: 'FIEL CRECIENTE' },
  'ML.2': { bg: '#FFCA28', text: '#F57F17', label: 'FIEL ESTANCADO' },
  'ML.3': { bg: '#42A5F5', text: '#1565C0', label: 'CONQUISTA ML' },
  'ML.4': { bg: '#26A69A', text: '#00695C', label: 'AVANCE CON DERROTA' },
  'ML.5': { bg: '#EF5350', text: '#B71C1C', label: 'RETROCESO' },
  'ML.6': { bg: '#78909C', text: '#37474F', label: 'ADVERSO' },
};

// Mismos colores por estado de obra que ya usa la capa Obras en components/MapaCircuitos.js
// (duplicado a propósito, mismo criterio que normalizarNombreBarrio entre archivos).
const COLOR_OBRA_ESTADO = {
  'Por relevar': '#9E9E9E',
  'Relevado': '#26A69A',
  'En ejecución': '#FFA726',
  'Finalizado': '#5C6BC0',
  'Finalizado — Inaugurable': '#2E7D32',
};
const COLOR_OBRA_DEFAULT = '#9E9E9E';

// Descripciones CLARAS para el popup de info
const DESCRIPCIONES_CATEGORIA = {
  'A.1': 'Ganó las 4 elecciones analizadas: Gob. 2019, Gob. 2023, Dip. 2021 y Dip. 2025.',
  'A.2': 'Ganó en Gob. 2019 y Gob. 2023, pero el porcentaje de votos bajó de una elección a la otra.',
  'B.1': 'Vota mayoritariamente al oficialismo de forma consistente, aunque no siempre gana.',
  'B.3': 'Ganó en Gob. 2019 pero perdió en Gob. 2023.',
  'D': 'Circuito reñido donde las elecciones se definen por pocos votos. Sin patrón claro.',
  'C': 'Perdió las 4 elecciones analizadas: Gob. 2019, Gob. 2023, Dip. 2021 y Dip. 2025.',
};

const DESCRIPCIONES_ML = {
  'ML.1': 'Ganó con Llaryora en Int. 2019 y en Gob. 2023, y el porcentaje de votos creció más que el promedio de Capital (+5.6 pp).',
  'ML.2': 'Ganó con Llaryora en Int. 2019 y en Gob. 2023, pero el crecimiento fue igual o menor que el promedio de Capital.',
  'ML.3': 'Perdió en Int. 2019 pero ganó en Gob. 2023. Territorio conquistado por Llaryora.',
  'ML.4': 'Ganó en Int. 2019 pero perdió en Gob. 2023. Sin embargo, el porcentaje de votos de Llaryora subió. Perdió por irrupción de terceros, no por pérdida de votos propios.',
  'ML.5': 'Perdió en Gob. 2023 y además el porcentaje de votos bajó respecto a Int. 2019.',
  'ML.6': 'Perdió ambas elecciones con Llaryora: Int. 2019 y Gob. 2023.',
};

// ============================================
// COMPONENTES REUTILIZABLES
// ============================================
const Badge = ({ categoria, tipo = 'v4' }) => {
  const colores = tipo === 'v4' ? COLORES_CATEGORIA : COLORES_ML;
  const config = colores[categoria] || { bg: '#9E9E9E', text: '#424242', label: categoria || '—' };
  return (
    <span style={{ display: 'inline-block', padding: '4px 11px', borderRadius: '6px', backgroundColor: `${config.bg}22`, color: config.text, fontSize: '11px', fontWeight: 600, letterSpacing: '0.3px' }}>
      {config.label}
    </span>
  );
};

// Ícono de tendencia (círculo relleno + glifo blanco) que reemplaza los símbolos
// Unicode ✓/○/✗ del insight de "Tendencias del circuito" — esos caracteres no
// renderizan bien en todas las fuentes/plataformas. 3 variantes según nivel:
// 'positivo' (check), 'neutro' (guion), 'negativo' (cruz). Mismo criterio de "SVG a
// mano, sin librería de íconos" que crearIconoPautaEstrella en MapaCircuitos.js.
const COLOR_ICONO_TENDENCIA = { positivo: '#2E7D32', neutro: '#F57F17', negativo: '#C62828' };
const IconoTendencia = ({ nivel, size = 16 }) => {
  const color = COLOR_ICONO_TENDENCIA[nivel] || '#9E9E9E';
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="8" fill={color} />
      {nivel === 'positivo' && <path d="M4.5 8.3L6.8 10.8L11.5 5.3" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
      {nivel === 'neutro' && <line x1="4.5" y1="8" x2="11.5" y2="8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />}
      {nivel === 'negativo' && <path d="M5 5L11 11M11 5L5 11" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
};

// Mismo criterio de estado (activa/finalizada/sin_pauta) que calcularCoberturaBarrio —
// usado en la tabla "Barrios del circuito" para que la columna Pauta se lea a simple
// vista sin abrir la ficha del barrio.
const BadgeEstadoPauta = ({ estado }) => {
  if (estado === 'activa') return <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '8px', backgroundColor: '#2E7D3222', color: '#2E7D32', whiteSpace: 'nowrap' }}>● Activa</span>;
  if (estado === 'finalizada') return <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '8px', backgroundColor: '#9E9E9E22', color: '#757575', whiteSpace: 'nowrap' }}>Finalizada</span>;
  return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
};

// Ícono de ayuda con tooltip nativo del navegador (sin estado propio: funciona igual
// en la app como en la ficha exportada, que se abre en una pestaña aparte para
// imprimir). Se usa junto al label de Padrón/Población solo en su primera aparición
// dentro de cada ficha — Padrón (circuito) y Población (barrio) son de fuentes y
// unidades distintas (padrón electoral vs. censo/IDECOR) y se prestan a confundirse
// porque aparecen en pantallas parecidas de la misma ficha.
const InfoTip = ({ texto }) => (
  <span title={texto} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '13px', height: '13px', borderRadius: '50%', border: '1px solid var(--text-tertiary)', color: 'var(--text-tertiary)', fontSize: '9px', lineHeight: 1, cursor: 'help', marginLeft: '5px', flexShrink: 0 }}>
    i
  </span>
);

const MetricCard = ({ label, value, subtitle, trend, trendPositive }) => (
  <div style={{ flex: 1, minWidth: '160px', padding: '14px 16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px' }}>
    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
      {subtitle && <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{subtitle}</span>}
    </div>
    {trend && <div style={{ marginTop: '6px', fontSize: '12px', color: trendPositive ? '#2E7D32' : '#C62828', fontWeight: 500 }}>{trendPositive ? '▲' : '▼'} {trend}</div>}
  </div>
);

const VictoriaIndicator = ({ label, gano }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', minWidth: '75px' }}>{label}</span>
    <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: gano ? '#4CAF50' : '#EF5350', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 600 }}>{gano ? '✓' : '✗'}</div>
  </div>
);

// Modal de información
const InfoModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={onClose}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', maxWidth: '700px', maxHeight: '80vh', overflowY: 'auto', margin: '20px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 600, margin: 0 }}>Guía de categorías</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '19px', cursor: 'pointer', color: '#666' }}>×</button>
        </div>
        
        <div style={{ marginBottom: '28px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: '#1976D2' }}>Diagnóstico Territorial</h3>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>Basado en resultados de: Gob. 2019, Gob. 2023, Dip. 2021 y Dip. 2025.</p>
          {Object.entries(COLORES_CATEGORIA).filter(([k]) => k !== 'B.2').map(([cat, config]) => (
            <div key={cat} style={{ display: 'flex', gap: '12px', marginBottom: '12px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: config.bg, flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: config.text }}>{config.label}</div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{DESCRIPCIONES_CATEGORIA[cat]}</div>
              </div>
            </div>
          ))}
        </div>
        
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: '#1976D2' }}>Evolución Llaryora</h3>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>Compara el desempeño de Llaryora entre Int. 2019 (como candidato a intendente) y Gob. 2023 (como candidato a gobernador).</p>
          {Object.entries(COLORES_ML).map(([cat, config]) => (
            <div key={cat} style={{ display: 'flex', gap: '12px', marginBottom: '12px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: config.bg, flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: config.text }}>{config.label}</div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{DESCRIPCIONES_ML[cat]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const formatPct = (val) => val != null ? `${(val * 100).toFixed(1)}%` : '—';
const formatPP = (val) => val != null ? `${val > 0 ? '+' : ''}${(val * 100).toFixed(1)} pp` : '—';
// Fecha de una ronda de encuesta + su cantidad de encuestados cuando está
// disponible — casos es number | null; null (o el campo ausente en rondas viejas)
// se trata como dato ausente, nunca como 0, así que se omite "Respuestas" en ese caso.
const formatearFechaRonda = (fecha, casos) => `${formatearFecha(fecha)}${casos != null ? ` · Respuestas: ${casos}` : ''}`;
const getNumeroBase = (circuitoKey) => {
  if (!circuitoKey) return '';
  return String(circuitoKey).replace(/[A-Za-z]/g, '');
};
// Mismo criterio de normalización usado en components/MapaCircuitos.js para cruzar
// barrios_por_circuito_completo.json / recorridos_barrios.json con barrios_geo.json
const normalizarNombreBarrio = (s) => (s || '')
  .toUpperCase()
  .replace(/[ºª]/g, 'O')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Radio por defecto para considerar dos barrios "cercanos" entre sí, en km.
// Ajustable con uso real sin tocar la lógica de distanciaHaversineKm/barriosCercanos.
const RADIO_BARRIOS_CERCANOS_KM = 1.5;

// Barrios con menos de esta cantidad de habitantes DENTRO de un circuito dado se ocultan
// de la tabla "Barrios del circuito" (fragmentos catastrales ínfimos, sin valor de
// lectura) — el título y la fila Total siguen contando el conjunto completo.
const UMBRAL_POBLACION_BARRIO = 50;

// Distancia entre dos puntos lat/lon sobre la superficie terrestre (fórmula
// haversine) — a diferencia de la distancia euclidiana simple, no acumula error
// por la curvatura de la Tierra, relevante incluso a esta escala urbana.
function distanciaHaversineKm(lat1, lon1, lat2, lon2) {
  const R_TIERRA_KM = 6371;
  const aRad = (deg) => (deg * Math.PI) / 180;
  const dLat = aRad(lat2 - lat1);
  const dLon = aRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(aRad(lat1)) * Math.cos(aRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R_TIERRA_KM * c;
}

// Barrios cuyo centroide cae dentro de `radioKm` del centroide de `nombreBarrio`,
// ordenados de más cercano a más lejano. Usa barrios_geo.json como fuente.
function barriosCercanos(nombreBarrio, barriosGeoData, radioKm = RADIO_BARRIOS_CERCANOS_KM) {
  const features = barriosGeoData?.features || [];
  const origen = features.find(f => f.properties?.nombre_barrio === nombreBarrio);
  if (!origen) return [];
  const { centroid_lat: lat1, centroid_lon: lon1 } = origen.properties;
  if (lat1 == null || lon1 == null) return [];

  return features
    .filter(f => f.properties?.nombre_barrio && f.properties.nombre_barrio !== nombreBarrio)
    .map(f => {
      const { centroid_lat: lat2, centroid_lon: lon2 } = f.properties;
      if (lat2 == null || lon2 == null) return null;
      return { nombre: f.properties.nombre_barrio, distanciaKm: distanciaHaversineKm(lat1, lon1, lat2, lon2), poblacion: f.properties.poblacion };
    })
    .filter((b) => b && b.distanciaKm <= radioKm)
    .sort((a, b) => a.distanciaKm - b.distanciaKm);
}

// pautas_barrios.json trae la vigencia como fecha_creacion/fecha_finalizacion en
// "YYYY-MM-DD" (esquema Meta Ads actual). Mismo criterio de vigencia que ya implementa
// components/MapaCircuitos.js para los markers de la capa Pauta — duplicado acá a
// propósito, mismo patrón ya aceptado en el proyecto para normalizarNombreBarrio entre
// archivos (evita acoplar el mapa a este archivo por una función mínima).
function parsearFechaISOPauta(fechaStr) {
  if (!fechaStr || typeof fechaStr !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaStr);
  if (!match) return null;
  const [, y, m, d] = match;
  const fecha = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}
// 'activa' si tiene al menos una pauta con fecha_finalizacion >= hoy, 'finalizada' si
// tiene pautas pero todas vencidas, 'sin_pauta' si no hay ninguna registrada.
function estadoPautaBarrio(nombreBarrio, pautasBarriosData) {
  if (!pautasBarriosData) return 'sin_pauta';
  const key = normalizarNombreBarrio(nombreBarrio);
  const claveOriginal = Object.keys(pautasBarriosData).find(k => normalizarNombreBarrio(k) === key);
  if (!claveOriginal) return 'sin_pauta';
  const pautas = pautasBarriosData[claveOriginal].pautas || [];
  if (pautas.length === 0) return 'sin_pauta';
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const tieneActiva = pautas.some(p => {
    const f = parsearFechaISOPauta(p.fecha_finalizacion);
    return f ? f >= hoy : false;
  });
  return tieneActiva ? 'activa' : 'finalizada';
}

// Cobertura territorial de un barrio (Visitas/Pauta/Obras/Escuelas) — mismos lookups
// por nombre normalizado que ya usan las solapas de la ficha de barrio (recorridosLookup,
// pautasBarriosData, obrasEnriquecidas, votosEscuelasBarrioLookup), reutilizado por la
// tabla "Barrios del circuito" (pantalla y PDF) para no reinventar el match.
function calcularCoberturaBarrio(nombreBarrio, { recorridosLookup, pautasBarriosData, obrasEnriquecidas, votosEscuelasBarrioLookup }) {
  const key = normalizarNombreBarrio(nombreBarrio);
  const visitas = recorridosLookup?.[key]?.total_visitas || 0;
  const pauta = estadoPautaBarrio(nombreBarrio, pautasBarriosData);
  const obras = (obrasEnriquecidas || []).filter(o => normalizarNombreBarrio(o.barrio) === key).length;
  const escuelasInfo = votosEscuelasBarrioLookup?.[key];
  const escuelas = escuelasInfo?.escuelas?.length ?? escuelasInfo?.n_escuelas ?? 0;
  return { visitas, pauta, obras, escuelas };
}

// Población de un circuito = suma directa de "poblacion" de sus barrios en
// barrios_por_circuito_completo.json. Ese campo YA es la porción de cada barrio que cae
// dentro de ESTE circuito (no el total del barrio) — pct_en_circuito es simplemente esa
// porción sobre el total del barrio, así que sumar poblacion×pct_en_circuito (como se
// hacía antes) descontaba dos veces. Nada de "estimado": es la suma tal cual viene.
// No necesariamente igual al padrón electoral (personas habilitadas a votar).
function poblacionCircuito(barriosCircuito) {
  return (barriosCircuito || []).reduce((sum, b) => sum + (b.poblacion || 0), 0);
}

// Población total real de un barrio = suma de "poblacion" a través de TODOS los
// circuitos donde aparece en barrios_por_circuito_completo.json (un barrio puede estar
// repartido en varios circuitos, cada fila trae solo la porción de ese circuito).
// Verificado con LICEO GENERAL PAZ: 20 (007A) + 38 (007F) + 782 (013G) + 78 (013L) = 918
// habitantes totales, de los cuales 782 (85.2%) caen en el circuito 013G — eso es
// pct_en_circuito, no una fracción a aplicar de nuevo sobre 918.
function construirPoblacionTotalPorBarrio(barriosPorCircuito) {
  const totales = {};
  Object.values(barriosPorCircuito || {}).forEach(info => {
    (info.barrios || []).forEach(b => {
      const key = normalizarNombreBarrio(b.nombre);
      if (!key) return;
      totales[key] = (totales[key] || 0) + (b.poblacion || 0);
    });
  });
  return totales;
}

// Compara IDs de circuito (Mapkey) en orden natural: primero el numero base,
// despues la letra como desempate (evita que "0014" quede antes que "004A").
const compararMapkey = (a, b) => {
  const numA = parseInt(a, 10);
  const numB = parseInt(b, 10);
  if (numA !== numB) return numA - numB;
  return String(a).localeCompare(String(b));
};

const esFechaValida = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(new Date(f).getTime());

const TIPOS_EVENTO_COBERTURA = {
  medicion: { label: 'Medicion', color: '#2E7D32', bg: '#4CAF5022' },
  visita: { label: 'Visita Gob.', color: '#1565C0', bg: '#1976D222' },
  pauta: { label: 'Pauta', color: '#E65100', bg: '#FF980022' },
};

// Arma, para cada circuito (por Mapkey), la lista de eventos de cobertura ya
// ordenada cronologicamente.
function construirEventosPorCircuito(datos, encuestasData, recorridosLookup, cruceData, pautasBarriosData, barriosGeoData) {
  const eventosPorMapkey = {};
  datos.forEach(d => { eventosPorMapkey[d.Mapkey] = []; });

  // Medicion: fechas_rondas derivadas en vivo de encuestas_circuitos.json (ver coberturaDesdeEncuesta).
  datos.forEach(d => {
    const c = coberturaDesdeEncuesta(encuestasData, d.CircuitoKey);
    (c.fechas_rondas || []).forEach((f, i) => {
      if (esFechaValida(f)) {
        eventosPorMapkey[d.Mapkey].push({ tipo: 'medicion', fecha: f, detalle: { ronda: i + 1, totalRondas: c.cantidad_rondas } });
      }
    });
  });

  // Visita Gob.: solo el/los barrio(s) donde ESTE circuito es su barrio principal
  // (orden_importancia: 1 en circuito_to_barrios) - evita inflar circuitos que
  // solo rozan el borde de un barrio grande y populoso.
  datos.forEach(d => {
    const clave = `${d.Mapkey} - ${d.cirn_nom}`;
    const barriosPrincipales = (cruceData?.circuito_to_barrios?.[clave] || []).filter(b => b.orden_importancia === 1);
    barriosPrincipales.forEach(b => {
      const key = normalizarNombreBarrio(b.barrio_normalizado);
      const info = recorridosLookup?.[key];
      (info?.visitas || []).forEach(v => {
        if (esFechaValida(v.fecha)) {
          eventosPorMapkey[d.Mapkey].push({ tipo: 'visita', fecha: v.fecha, detalle: v });
        }
      });
    });
  });

  // Pauta: derivada en runtime desde pautas_barrios.json (sin pautas_circuitos.json,
  // mismo criterio que se usó para retirar cobertura_circuitos.json). fecha_creacion
  // es la fecha del evento (cuando arranca el anuncio en Meta Ads).
  datos.forEach(d => {
    buscarPautaCircuito(pautasBarriosData, barriosGeoData, datos, d.CircuitoKey).forEach(p => {
      if (esFechaValida(p.fecha_creacion)) eventosPorMapkey[d.Mapkey].push({ tipo: 'pauta', fecha: p.fecha_creacion, detalle: p });
    });
  });

  Object.values(eventosPorMapkey).forEach(lista => lista.sort((a, b) => a.fecha.localeCompare(b.fecha)));
  return eventosPorMapkey;
}

// ============================================
// SOLAPAS
// ============================================
const SolapaResumen = ({ circuito, datos, padronTotal, encuestasData }) => {
  if (!datos) return null;
  const pctPadron = padronTotal > 0 ? ((datos.Padron_G23 / padronTotal) * 100).toFixed(2) : 0;
  const cobertura = coberturaDesdeEncuesta(encuestasData, datos.CircuitoKey);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <MetricCard label={<>Padrón electoral (circuito) <InfoTip texto="Personas habilitadas para votar en este circuito según el padrón electoral 2023." /></>} value={datos.Padron_G23?.toLocaleString() || '—'} subtitle={`(${pctPadron}% de Capital)`} />
        <MetricCard label="Participación Gob. 2023" value={formatPct(datos.Turnout_G23)} trend={`${formatPP(datos.Turnout_G23 - 0.67)} vs Capital`} trendPositive={(datos.Turnout_G23 - 0.67) > 0} />
        <MetricCard label="Δ Gob. 2023 vs Int. 2019" value={formatPP(datos.Efecto_ML / 100)} trend={datos.Crecio_vs_Capital ? 'mejor que Capital' : 'peor que Capital'} trendPositive={datos.Crecio_vs_Capital === 1} />
      </div>
      
      <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Tendencias electorales</h4>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '280px', padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Tendencia Gobernador</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Gob. 2019 → Gob. 2023</div>
            </div>
            <div style={{ display: 'inline-block', padding: '8px 16px', borderRadius: '8px', backgroundColor: datos.Residual_Gov >= 0 ? '#4CAF5022' : '#EF535022', color: datos.Residual_Gov >= 0 ? '#2E7D32' : '#C62828', fontSize: '13px', fontWeight: 600 }}>
              {formatPP(datos.Residual_Gov)} {datos.Residual_Gov >= 0 ? '▲' : '▼'}
            </div>
            <div style={{ marginTop: '20px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Tendencia Legislativa</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Dip. 2021 → Dip. 2025</div>
            </div>
            <div style={{ display: 'inline-block', padding: '8px 16px', borderRadius: '8px', backgroundColor: datos.Residual_Leg >= 0 ? '#4CAF5022' : '#EF535022', color: datos.Residual_Leg >= 0 ? '#2E7D32' : '#C62828', fontSize: '13px', fontWeight: 600 }}>
              {formatPP(datos.Residual_Leg)} {datos.Residual_Leg >= 0 ? '▲' : '▼'}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: '280px', padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '16px' }}>Victorias (de 4 elecciones)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <VictoriaIndicator label="Gob. 2019" gano={datos.Gano_G19 === 1} />
              <VictoriaIndicator label="Gob. 2023" gano={datos.Gano_G23 === 1} />
              <VictoriaIndicator label="Dip. 2021" gano={datos.Gano_L21 === 1} />
              <VictoriaIndicator label="Dip. 2025" gano={datos.Gano_L25 === 1} />
            </div>
            <div style={{ marginTop: '18px', fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>{datos.Victorias_Total}/4</div>
          </div>
        </div>
      </div>
      
      {encuestasData && (
        <div>
          <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Cobertura de encuesta</h4>
          <div style={{ padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <BadgeCobertura encuestado={!!cobertura?.encuestado} />
            {cobertura?.encuestado && (
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{cobertura.cantidad_rondas} ronda{cobertura.cantidad_rondas !== 1 ? 's' : ''}</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(cobertura.fechas_rondas || []).map((f, i) => (
                    <span key={i} style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '6px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 500 }}>{f}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: '18px 22px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>Última elección: Dip. 2025</div>
        <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div><span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>% Votos peronismo: </span><span style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)' }}>{formatPct(datos.Share_L25)}</span></div>
          <div><span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Posición: </span><span style={{ fontSize: '15px', fontWeight: 600, color: datos.Posicion_L25 === 1 ? '#2E7D32' : '#FF8F00' }}>{datos.Posicion_L25}°</span></div>
          <div><span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>vs Capital: </span><span style={{ fontSize: '13px', fontWeight: 500, color: (datos.Share_L25 - datos.ShareCap_L25) >= 0 ? '#2E7D32' : '#C62828' }}>{formatPP(datos.Share_L25 - datos.ShareCap_L25)}</span></div>
        </div>
      </div>
      
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '10px 18px', backgroundColor: datos.Volatilidad_Cat === 'Estable' ? '#4CAF5015' : datos.Volatilidad_Cat === 'Moderado' ? '#FF980015' : '#EF535015', borderRadius: '10px', alignSelf: 'flex-start' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Estabilidad histórica:</span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: datos.Volatilidad_Cat === 'Estable' ? '#2E7D32' : datos.Volatilidad_Cat === 'Moderado' ? '#E65100' : '#C62828' }}>{datos.Volatilidad_Cat}</span>
      </div>
    </div>
  );
};

const SolapaEvolucion = ({ circuito, datos }) => {
  const [mostrarCapital, setMostrarCapital] = useState(true);
  if (!datos) return null;
  
  const elecciones = [
    { key: 'G07', label: 'Gob. 2007', share: datos.Share_G07, shareCap: datos.ShareCap_G07 },
    { key: 'G11', label: 'Gob. 2011', share: datos.Share_G11, shareCap: datos.ShareCap_G11 },
    { key: 'G15', label: 'Gob. 2015', share: datos.Share_G15, shareCap: datos.ShareCap_G15 },
    { key: 'G19', label: 'Gob. 2019', share: datos.Share_G19, shareCap: datos.ShareCap_G19, highlight: true },
    { key: 'G23', label: 'Gob. 2023', share: datos.Share_G23, shareCap: datos.ShareCap_G23, highlight: true },
    { key: 'L21', label: 'Dip. 2021', share: datos.Share_L21, shareCap: datos.ShareCap_L21 },
    { key: 'L23', label: 'Dip. 2023', share: datos.Share_L23, shareCap: datos.ShareCap_L23 },
    { key: 'L25', label: 'Dip. 2025', share: datos.Share_L25, shareCap: datos.ShareCap_L25 },
  ];
  
  const validShares = elecciones.filter(e => e.share != null).map(e => e.share);
  const validCapShares = elecciones.filter(e => e.shareCap != null).map(e => e.shareCap);
  const maxShare = Math.max(...validShares, ...validCapShares, 0.5);
  const chartHeight = 200, chartWidth = 600;
  const padding = { left: 50, right: 25, top: 25, bottom: 50 };
  const getY = (val) => val == null ? null : padding.top + (1 - val / Math.min(maxShare * 1.15, 1)) * chartHeight;
  const getX = (idx) => padding.left + (idx / (elecciones.length - 1)) * (chartWidth - padding.left - padding.right);
  
  const todasElecciones = [
    { label: 'Gob. 2023', share: datos.Share_G23, cap: datos.ShareCap_G23, gano: datos.Gano_G23 },
    { label: 'Gob. 2019', share: datos.Share_G19, cap: datos.ShareCap_G19, gano: datos.Gano_G19 },
    { label: 'Gob. 2015', share: datos.Share_G15, cap: datos.ShareCap_G15, gano: null },
    { label: 'Gob. 2011', share: datos.Share_G11, cap: datos.ShareCap_G11, gano: null },
    { label: 'Gob. 2007', share: datos.Share_G07, cap: datos.ShareCap_G07, gano: null },
    { label: 'Dip. 2025', share: datos.Share_L25, cap: datos.ShareCap_L25, gano: datos.Gano_L25 },
    { label: 'Dip. 2023', share: datos.Share_L23, cap: datos.ShareCap_L23, gano: null },
    { label: 'Dip. 2021', share: datos.Share_L21, cap: datos.ShareCap_L21, gano: datos.Gano_L21 },
    { label: 'Int. 2019', share: datos.Share_Int19, cap: datos.ShareCap_Int19, gano: datos.Gano_Int19 },
  ];
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Evolución histórica del % de votos peronismo</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={mostrarCapital} onChange={(e) => setMostrarCapital(e.target.checked)} style={{ accentColor: '#1976D2', width: '18px', height: '18px' }} />
          Mostrar Capital
        </label>
      </div>
      
      <div style={{ padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <svg width="100%" viewBox={`0 0 ${chartWidth} ${chartHeight + padding.top + padding.bottom}`} style={{ overflow: 'visible' }}>
          {[0.2, 0.4, 0.6].map(val => (
            <g key={val}>
              <line x1={padding.left} y1={getY(val)} x2={chartWidth - padding.right} y2={getY(val)} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
              <text x={padding.left - 10} y={getY(val) + 5} textAnchor="end" fontSize="12" fill="var(--text-tertiary)">{(val * 100).toFixed(0)}%</text>
            </g>
          ))}
          {mostrarCapital && <polyline points={elecciones.filter(e => e.shareCap != null).map((e) => `${getX(elecciones.indexOf(e))},${getY(e.shareCap)}`).join(' ')} fill="none" stroke="#78909C" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" />}
          <polyline points={elecciones.filter(e => e.share != null).map((e) => `${getX(elecciones.indexOf(e))},${getY(e.share)}`).join(' ')} fill="none" stroke="#1976D2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {elecciones.map((e, i) => e.share != null && <circle key={e.key} cx={getX(i)} cy={getY(e.share)} r="6" fill="#1976D2" stroke="#fff" strokeWidth="2" />)}
          {elecciones.map((e, i) => (
            <g key={e.key}>
              <text x={getX(i)} y={chartHeight + padding.top + 22} textAnchor="middle" fontSize="12" fill={e.highlight ? 'var(--text-primary)' : 'var(--text-tertiary)'} fontWeight={e.highlight ? 600 : 400}>{e.label.split(' ')[0]}</text>
              <text x={getX(i)} y={chartHeight + padding.top + 38} textAnchor="middle" fontSize="11" fill={e.highlight ? 'var(--text-primary)' : 'var(--text-tertiary)'}>{e.label.split(' ')[1]}</text>
            </g>
          ))}
        </svg>
        <div style={{ display: 'flex', gap: '28px', marginTop: '16px', paddingLeft: '50px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '28px', height: '3px', backgroundColor: '#1976D2', borderRadius: '2px' }} /><span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>Circuito {circuito}</span></div>
          {mostrarCapital && <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '28px', height: '0', borderTop: '2px dashed #78909C' }} /><span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Capital</span></div>}
        </div>
      </div>
      
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>Resumen</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ backgroundColor: 'var(--bg-secondary)' }}><th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Elección</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Circuito</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Capital</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Diferencia</th><th style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 500, color: 'var(--text-tertiary)' }}>Resultado</th></tr></thead>
            <tbody>
              {todasElecciones.map((row, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 14px', fontWeight: 500 }}>{row.label}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600 }}>{formatPct(row.share)}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: 'var(--text-secondary)' }}>{formatPct(row.cap)}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: row.share != null && row.cap != null ? ((row.share - row.cap) >= 0 ? '#2E7D32' : '#C62828') : 'var(--text-tertiary)', fontWeight: 500 }}>{row.share != null && row.cap != null ? formatPP(row.share - row.cap) : '—'}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'center' }}>{row.gano != null ? <span style={{ display: 'inline-block', padding: '5px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, backgroundColor: row.gano ? '#4CAF5022' : '#EF535022', color: row.gano ? '#2E7D32' : '#C62828' }}>{row.gano ? 'GANÓ' : 'PERDIÓ'}</span> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const SolapaPartidos = ({ circuito, datos, partidos }) => {
  const [eleccionSeleccionada, setEleccionSeleccionada] = useState('G23');
  const elecciones = ['G23', 'G19', 'L25', 'L21', 'Int19'];
  const nombresEleccion = { 'G23': 'Gob. 2023', 'G19': 'Gob. 2019', 'L25': 'Dip. 2025', 'L21': 'Dip. 2021', 'Int19': 'Int. 2019' };
  const getColorPartido = (nombre, esPeronismo) => {
    if (esPeronismo) return '#1565C0';
    const lower = nombre.toLowerCase();
    if (lower.includes('juntos') || lower.includes('cambia')) return '#FFC107';
    if (lower.includes('libertad')) return '#7B1FA2';
    if (lower.includes('todos') || lower.includes('patria')) return '#E53935';
    return '#78909C';
  };
  const partidosCircuito = partidos?.[circuito] || {};
  const partidosEleccion = partidosCircuito[eleccionSeleccionada] || [];
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Composición del voto por elección</span>
        <select value={eleccionSeleccionada} onChange={(e) => setEleccionSeleccionada(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer' }}>
          {elecciones.map(e => <option key={e} value={e}>{nombresEleccion[e]}</option>)}
        </select>
      </div>
      <div style={{ padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        {elecciones.slice(0, 4).map(elec => {
          const parts = partidosCircuito[elec] || [];
          return (
            <div key={elec} style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '12px', color: elec === eleccionSeleccionada ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: elec === eleccionSeleccionada ? 600 : 400, minWidth: '80px' }}>{nombresEleccion[elec]}</span>
                <div style={{ flex: 1, height: '30px', display: 'flex', borderRadius: '6px', overflow: 'hidden' }}>
                  {parts.map((p, i) => (
                    <div key={i} style={{ width: `${p.share * 100}%`, backgroundColor: getColorPartido(p.partido, p.es_peronismo), display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }} title={`${p.partido}: ${(p.share * 100).toFixed(1)}%`}>
                      {p.share > 0.08 && <span style={{ fontSize: '11px', color: '#fff', fontWeight: 500 }}>{(p.share * 100).toFixed(0)}%</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
          {[{ label: 'Peronismo', color: '#1565C0' }, { label: 'JxC/Cambiemos', color: '#FFC107' }, { label: 'LLA', color: '#7B1FA2' }, { label: 'FdT/UP', color: '#E53935' }, { label: 'Otros', color: '#78909C' }].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '14px', height: '14px', borderRadius: '3px', backgroundColor: l.color }} /><span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{l.label}</span></div>
          ))}
        </div>
      </div>
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>Ranking {nombresEleccion[eleccionSeleccionada]}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead><tr style={{ backgroundColor: 'var(--bg-secondary)' }}><th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)', width: '50px' }}>#</th><th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Partido</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Votos</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>% Votos</th></tr></thead>
          <tbody>
            {partidosEleccion.map((p, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 14px' }}><div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: getColorPartido(p.partido, p.es_peronismo), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 600 }}>{i + 1}</div></td>
                <td style={{ padding: '8px 14px', fontWeight: p.es_peronismo ? 600 : 400, color: p.es_peronismo ? '#1565C0' : 'var(--text-primary)' }}>{p.partido.length > 40 ? p.partido.substring(0, 40) + '...' : p.partido}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right' }}>{p.votos?.toLocaleString()}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600 }}>{(p.share * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SolapaTerritorio = ({
  circuito, datos, barrios, todosLosDatos, onSelectCircuito,
  barriosGeoLookup, recorridosLookup, pautasBarriosData, obrasEnriquecidas, votosEscuelasBarrioLookup,
  onSelectBarrioFicha,
  circuitosGeoJsonData, obrasFoco, onSelectObra, votosEscuelasCircuitoData,
}) => {
  const mapkey = datos?.Mapkey;
  const barriosCircuito = barrios?.[mapkey]?.barrios || [];
  const barriosVisibles = barriosCircuito.filter(b => (b.poblacion || 0) >= UMBRAL_POBLACION_BARRIO);
  const barriosOcultos = barriosCircuito.length - barriosVisibles.length;
  const poblacionCircuitoTotal = poblacionCircuito(barriosCircuito);
  const pctPadronDePoblacion = poblacionCircuitoTotal > 0 && datos?.Padron_G23 != null ? (datos.Padron_G23 / poblacionCircuitoTotal) * 100 : null;
  const numeroBase = getNumeroBase(circuito);
  const vecinos = todosLosDatos?.filter(d => {
    if (d.CircuitoKey === circuito) return false;
    const numOtro = getNumeroBase(d.CircuitoKey);
    return numeroBase && numOtro && numeroBase === numOtro;
  }) || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Barrios del circuito ({barriosCircuito.length})</h4>
        <div style={{ padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          {barriosCircuito.length > 0 ? (
            <>
              <div style={{ maxHeight: '320px', overflowY: 'auto', marginBottom: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-secondary)' }}>
                    <tr>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Barrio</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Población en el circuito</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>% del total del barrio <InfoTip texto="Qué porcentaje de la población total de ese barrio cae dentro de este circuito (un barrio puede estar dividido entre varios circuitos)." /></th>
                      <th style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)', fontSize: '11px' }}>Visitas</th>
                      <th style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 500, color: 'var(--text-tertiary)', fontSize: '11px' }}>Pauta</th>
                      <th style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)', fontSize: '11px' }}>Obras</th>
                      <th style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)', fontSize: '11px' }}>Escuelas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {barriosVisibles.map((barrio, i) => {
                      const nombreBarrio = barrio.nombre || barrio;
                      const cobertura = calcularCoberturaBarrio(nombreBarrio, { recorridosLookup, pautasBarriosData, obrasEnriquecidas, votosEscuelasBarrioLookup });
                      return (
                        <tr
                          key={i}
                          style={{ borderTop: '1px solid var(--border)', backgroundColor: i === 0 ? '#1976D208' : 'transparent', cursor: 'pointer' }}
                          onClick={() => {
                            const key = normalizarNombreBarrio(nombreBarrio);
                            const feature = barriosGeoLookup[key];
                            onSelectBarrioFicha(feature ? feature.nombre_barrio : nombreBarrio);
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = i === 0 ? '#1976D208' : 'transparent'}
                        >
                          <td style={{ padding: '10px 14px', fontWeight: i === 0 ? 600 : 400 }}>{nombreBarrio}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>{barrio.poblacion != null ? barrio.poblacion.toLocaleString() : '—'}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>{barrio.pct_en_circuito != null ? `${barrio.pct_en_circuito.toFixed(1)}%` : '—'}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: '11px', color: cobertura.visitas > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{cobertura.visitas > 0 ? cobertura.visitas : '—'}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'center' }}><BadgeEstadoPauta estado={cobertura.pauta} /></td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: '11px', color: cobertura.obras > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{cobertura.obras > 0 ? cobertura.obras : '—'}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: '11px', color: cobertura.escuelas > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{cobertura.escuelas > 0 ? cobertura.escuelas : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>Total</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{Math.round(poblacionCircuitoTotal).toLocaleString()}</td>
                      <td style={{ padding: '10px 14px' }}></td>
                      <td style={{ padding: '10px 10px' }}></td>
                      <td style={{ padding: '10px 10px' }}></td>
                      <td style={{ padding: '10px 10px' }}></td>
                      <td style={{ padding: '10px 10px' }}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {barriosOcultos > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '10px' }}>
                  Se omiten {barriosOcultos} barrio{barriosOcultos !== 1 ? 's' : ''} con menos de {UMBRAL_POBLACION_BARRIO} habitantes en este circuito.
                </div>
              )}
              <div style={{ padding: '12px 16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                {poblacionCircuitoTotal > 0 && (
                  <div>
                    En los barrios de este circuito viven <strong style={{ color: 'var(--text-primary)' }}>{Math.round(poblacionCircuitoTotal).toLocaleString()}</strong> personas
                    {datos?.Padron_G23 != null && (
                      <>; el padrón habilitado es <strong style={{ color: 'var(--text-primary)' }}>{datos.Padron_G23.toLocaleString()}</strong>{pctPadronDePoblacion != null && ` (${pctPadronDePoblacion.toFixed(0)}%)`}</>
                    )}.
                  </div>
                )}
              </div>
            </>
          ) : <div style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>No hay información de barrios disponible</div>}
        </div>
      </div>

      <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 500 }}>Obras</h4>
        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>Obras públicas en este circuito y en circuitos cercanos.</p>
        <ObrasPanel
          tipo="circuito"
          datosCircuito={datos}
          obrasEnriquecidas={obrasEnriquecidas}
          circuitosGeoJsonData={circuitosGeoJsonData}
          focoInicial={obrasFoco}
          onSelectObra={onSelectObra}
        />
      </div>

      <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 500 }}>Escuelas</h4>
        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>% de votos a Peronismo sobre votos válidos, por escuela con centro de votación en este circuito.</p>
        {votosEscuelasCircuitoData?.circuitos?.[mapkey] ? (
          <ListaVotosEscuelas escuelas={votosEscuelasCircuitoData.circuitos[mapkey].escuelas} promedioCapitalPct={votosEscuelasCircuitoData?.promedio_capital_pct} />
        ) : (
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin centros de votación identificados en este circuito.</div>
        )}
      </div>

      <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Circuitos de la zona ({vecinos.length} relacionados)</h4>
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ backgroundColor: 'var(--bg-secondary)' }}><th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Circuito</th><th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Diagnóstico</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>% Votos G23</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Tendencia</th></tr></thead>
            <tbody>
              {vecinos.length > 0 ? vecinos.map((v, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => onSelectCircuito(v.CircuitoKey)} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <td style={{ padding: '8px 14px', fontWeight: 500 }}>{v.CircuitoKey} - {v.cirn_nom}</td>
                  <td style={{ padding: '8px 14px' }}><Badge categoria={v.Categoria_v4} tipo="v4" /></td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600 }}>{formatPct(v.Share_G23)}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: v.Residual_Gov >= 0 ? '#2E7D32' : '#C62828', fontWeight: 500 }}>{v.Residual_Gov >= 0 ? '▲' : '▼'} {Math.abs(v.Residual_Gov * 100).toFixed(1)} pp</td>
                </tr>
              )) : <tr><td colSpan={4} style={{ padding: '16px', textAlign: 'center', color: 'var(--text-tertiary)' }}>Este circuito no tiene variantes (A, B, C, etc.)</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const SolapaComparativas = ({ circuito, datos }) => {
  if (!datos) return null;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '14px', fontWeight: 600 }}>Comparativa Gobernador: 2019 vs 2023</h4>
        <div style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Gob. 2019</div><div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_G19)}</div><div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_G19}°</div></div>
            <div style={{ fontSize: '22px', color: '#1976D2' }}>→</div>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Gob. 2023</div><div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_G23)}</div><div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_G23}°</div></div>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: (datos.Share_G23 - datos.Share_G19) >= 0 ? '#4CAF5018' : '#EF535018', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Variación</div><div style={{ fontSize: '24px', fontWeight: 700, color: (datos.Share_G23 - datos.Share_G19) >= 0 ? '#2E7D32' : '#C62828' }}>{formatPP(datos.Share_G23 - datos.Share_G19)}</div><div style={{ fontSize: '12px', color: datos.Residual_Gov >= 0 ? '#2E7D32' : '#C62828', marginTop: '6px' }}>vs Capital: {formatPP(datos.Residual_Gov)}</div></div>
          </div>
        </div>
      </div>
      
      <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '14px', fontWeight: 600 }}>Evolución Llaryora: Int. 2019 → Gob. 2023</h4>
        <div style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Int. 2019</div><div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_Int19)}</div><div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_Int19}°</div></div>
            <div style={{ fontSize: '22px', color: '#1976D2' }}>→</div>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: '#1976D218', border: '1px solid #1976D240', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: '#1976D2', marginBottom: '10px' }}>Gob. 2023</div><div style={{ fontSize: '24px', fontWeight: 700, color: '#1565C0' }}>{formatPct(datos.Share_G23)}</div><div style={{ fontSize: '12px', color: '#1976D2', marginTop: '6px' }}>Posición: {datos.Posicion_G23}°</div></div>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: datos.Crecio_vs_Capital ? '#4CAF5018' : '#EF535018', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Δ Circuito</div><div style={{ fontSize: '24px', fontWeight: 700, color: datos.Efecto_ML >= 0 ? '#2E7D32' : '#C62828' }}>{formatPP(datos.Efecto_ML / 100)}</div><div style={{ fontSize: '12px', color: datos.Crecio_vs_Capital ? '#2E7D32' : '#C62828', marginTop: '6px' }}>vs Capital: {formatPP(datos.Efecto_ML_vs_Capital / 100)}</div></div>
          </div>
          <div style={{ marginTop: '18px' }}><Badge categoria={datos.Categoria_ML} tipo="ml" /></div>
          {datos.Categoria_ML === 'ML.4' && <div style={{ marginTop: '12px', padding: '10px 14px', backgroundColor: '#26A69A15', borderRadius: '8px', fontSize: '12px', color: '#00695C' }}>ℹ️ ML subió su % de votos ({formatPP(datos.Efecto_ML / 100)}), pero perdió la elección por irrupción de terceros.</div>}
        </div>
      </div>
      
      <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '14px', fontWeight: 600 }}>Efecto Schiaretti: Dip. 2021 → Dip. 2025</h4>
        <div style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Dip. 2021</div><div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_L21)}</div><div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_L21}°</div></div>
            <div style={{ fontSize: '22px', color: '#1976D2' }}>→</div>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Dip. 2025</div><div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_L25)}</div><div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_L25}°</div></div>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: datos.Sch_Mejoro ? '#4CAF5018' : '#EF535018', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Δ Circuito</div><div style={{ fontSize: '24px', fontWeight: 700, color: datos.Sch_Efecto >= 0 ? '#2E7D32' : '#C62828' }}>{formatPP(datos.Sch_Efecto)}</div><div style={{ fontSize: '12px', color: datos.Sch_Efecto_vs_Capital >= 0 ? '#2E7D32' : '#C62828', marginTop: '6px' }}>vs Capital: {formatPP(datos.Sch_Efecto_vs_Capital)}</div></div>
          </div>
          <div style={{ marginTop: '18px' }}><span style={{ display: 'inline-block', padding: '7px 16px', borderRadius: '8px', backgroundColor: datos.Sch_Mejoro ? '#4CAF5022' : '#EF535022', color: datos.Sch_Mejoro ? '#2E7D32' : '#C62828', fontSize: '12px', fontWeight: 600 }}>{datos.Sch_Mejoro ? 'MEJORÓ' : 'EMPEORÓ'}</span></div>
        </div>
      </div>
      
      <div style={{ padding: '16px', backgroundColor: datos.Victorias_Total >= 2 ? '#4CAF5012' : '#EF535012', border: `1px solid ${datos.Victorias_Total >= 2 ? '#4CAF5040' : '#EF535040'}`, borderRadius: '12px' }}>
        <h4 style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '18px', fontWeight: 600 }}>Tendencias del circuito</h4>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '18px' }}>
          <div style={{ padding: '10px 14px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Diagnóstico</div><Badge categoria={datos.Categoria_v4} tipo="v4" /></div>
          <div style={{ padding: '10px 14px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Evolución Llaryora</div><Badge categoria={datos.Categoria_ML} tipo="ml" /></div>
          <div style={{ padding: '10px 14px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Efecto legislativo</div><span style={{ fontSize: '13px', fontWeight: 600, color: datos.Sch_Mejoro ? '#2E7D32' : '#C62828' }}>{datos.Sch_Mejoro ? 'MEJORÓ' : 'EMPEORÓ'} ({formatPP(datos.Sch_Efecto)})</span></div>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <IconoTendencia nivel={datos.Victorias_Total >= 3 ? 'positivo' : datos.Victorias_Total >= 2 ? 'neutro' : 'negativo'} />
          <span>{datos.Victorias_Total >= 3 ? 'Circuito sólido para el oficialismo' : datos.Victorias_Total >= 2 ? 'Circuito con potencial de recuperación' : 'Circuito difícil, requiere estrategia específica'}</span>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '10px' }}>Ganó {datos.Victorias_Total}/4 elecciones. {datos.Crecio_vs_Capital ? 'Creció más que Capital con Llaryora.' : 'Creció menos que Capital con Llaryora.'} {datos.Sch_Mejoro ? 'Mejoró en legislativas.' : 'Empeoró en legislativas.'}</div>
      </div>
    </div>
  );
};

// SolapaEscuelas y SolapaObras (circuito) se retiraron: su contenido ahora vive
// dentro de SolapaTerritorio (fusión de solapas, ver comentario en el array `solapas`).

// ============================================
// FICHA DE BARRIO
// ============================================

const SolapaResumenBarrio = ({
  nombreBarrio, props, cruceData, barriosGeoLookup, todosLosDatos, encuestasData,
  recorridosLookup, pautasBarriosData, votosEscuelasBarrioLookup, obrasEnriquecidas,
  poblacionTotalPorBarrio, onIrACircuito, onCambiarSolapa,
}) => {
  const poblacionTotalBarrio = poblacionTotalPorBarrio?.[normalizarNombreBarrio(nombreBarrio)];
  // Circuito principal resuelto de forma independiente de circuitoSeleccionado (Etapa 1).
  const circuito = resolverCircuitoPrincipalDeBarrio(nombreBarrio, cruceData, barriosGeoLookup, todosLosDatos);
  const encuesta = circuito ? buscarEncuestaCircuito(encuestasData, circuito.CircuitoKey) : null;

  // Top 3 "Problemas principales" de la ÚLTIMA ronda (valor absoluto, no la variación
  // entre rondas que calcula ResumenAutomaticoProblemas) — para el bloque "Contexto
  // político". Son datos del CIRCUITO, no del barrio (una encuesta no se releva por barrio).
  let topProblemas = [];
  if (encuesta?.rondas?.length > 0) {
    const ultima = encuesta.rondas[encuesta.rondas.length - 1];
    const problemas = ultima.preguntas?.['Problemas principales'];
    if (problemas) topProblemas = Object.entries(problemas).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }

  const key = normalizarNombreBarrio(nombreBarrio);
  const totalVisitas = recorridosLookup?.[key]?.total_visitas || 0;
  // pautas_barrios.json no viene normalizado (mismo cruce que ya usa buscarPautaCircuito).
  const claveOriginalPauta = pautasBarriosData ? Object.keys(pautasBarriosData).find(k => normalizarNombreBarrio(k) === key) : null;
  const totalPautas = claveOriginalPauta ? (pautasBarriosData[claveOriginalPauta].pautas || []).length : 0;
  const totalObras = (obrasEnriquecidas || []).filter(o => normalizarNombreBarrio(o.barrio) === key).length;
  const escuelasBarrio = votosEscuelasBarrioLookup?.[key];
  const totalEscuelas = escuelasBarrio?.escuelas?.length ?? escuelasBarrio?.n_escuelas ?? 0;

  const contadores = [
    { key: 'visitas', label: 'Visitas', cantidad: totalVisitas },
    { key: 'pauta', label: 'Pauta', cantidad: totalPautas },
    { key: 'obras', label: 'Obras', cantidad: totalObras },
    { key: 'escuelas', label: 'Escuelas', cantidad: totalEscuelas },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <MetricCard label={<>Población total (barrio) <InfoTip texto="Población total censada de este barrio (fuente: IDECOR/censo), no vinculada al padrón electoral." /></>} value={poblacionTotalBarrio != null ? poblacionTotalBarrio.toLocaleString() : '—'} subtitle={props.pct_poblacion_en_circuito != null ? `${props.pct_poblacion_en_circuito.toFixed(1)}% de este barrio está en este circuito` : undefined} />
        <MetricCard label="Tipo" value={props.tipo_barrio === 'BarrioOficial' ? 'Oficial' : 'No oficial'} />
      </div>

      <div style={{ padding: '16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '2px' }}>Contexto político{circuito ? ` — Circuito ${circuito.CircuitoKey} ${circuito.cirn_nom}` : ''}</div>
        {circuito ? (
          <>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '10px' }}>Datos del circuito, no del barrio.</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <Badge categoria={circuito.Categoria_v4} tipo="v4" />
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Gob. 2023: <strong style={{ color: 'var(--text-primary)' }}>{formatPct(circuito.Share_G23)}</strong>
                {circuito.ShareCap_G23 != null && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}> (vs Capital {formatPct(circuito.ShareCap_G23)})</span>}
              </div>
            </div>
            {topProblemas.length > 0 ? (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Principales problemas (última ronda de encuesta)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {topProblemas.map(([nombre, pct]) => (
                    <div key={nombre} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span>{nombre}</span><strong style={{ color: 'var(--text-primary)', flexShrink: 0 }}>{pct.toFixed(1)}%</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>Sin encuestas registradas para este circuito.</div>
            )}
            <button onClick={() => onIrACircuito(circuito)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: '#1976D2', cursor: 'pointer', fontWeight: 500 }}>Ver ficha completa del circuito →</button>
          </>
        ) : (
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin circuito asociado.</div>
        )}
      </div>

      <div>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '10px' }}>En este barrio</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {contadores.map(c => (
            <div
              key={c.key}
              onClick={() => onCambiarSolapa(c.key)}
              style={{ padding: '12px 16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', cursor: 'pointer', minWidth: '90px', textAlign: 'center' }}
            >
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{c.cantidad}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{c.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const SolapaTerritorioBarrio = ({ nombreBarrio, barriosGeoData, onSelectBarrioFicha }) => {
  const cercanos = barriosCercanos(nombreBarrio, barriosGeoData);
  return (
    <div>
      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Barrios cercanos (≤1,5 km)</h4>
      {cercanos.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin barrios cercanos dentro de 1,5 km.</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ backgroundColor: 'var(--bg-secondary)' }}><th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Barrio</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Población</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Distancia</th></tr></thead>
            <tbody>
              {cercanos.map((b, i) => (
                <tr
                  key={i}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => onSelectBarrioFicha(b.nombre)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '8px 14px' }}>{b.nombre}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>{b.poblacion != null ? b.poblacion.toLocaleString() : '—'}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>{b.distanciaKm.toFixed(2)} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Reconstruye el bloque que antes vivía inline en PanelMiniBarrio (retirado en la Etapa 1),
// mismos campos: fecha, tipo de visita coloreado, contacto con vecinos, link a la nota.
const SolapaVisitasBarrio = ({ nombreBarrio, recorridosLookup }) => {
  const key = normalizarNombreBarrio(nombreBarrio);
  const recorridos = recorridosLookup?.[key];
  return (
    <div>
      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Recorridos del Gobernador</h4>
      {recorridos && recorridos.total_visitas > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>{recorridos.total_visitas} visita{recorridos.total_visitas !== 1 ? 's' : ''}</div>
          {(recorridos.visitas || []).map((v, i) => {
            const colorTipo = TIPO_VISITA_COLOR[v.tipo_visita] || TIPO_VISITA_COLOR['NO HAY DATOS certeros'];
            return (
              <div key={i} style={{ padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{formatearFecha(v.fecha)}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '5px', backgroundColor: colorTipo.bg, color: colorTipo.text }}>{v.tipo_visita}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Contacto con vecinos: <strong>{v.contacto_vecinos || 'NO'}</strong></div>
                {v.link && (
                  <a href={v.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#1976D2', marginTop: '4px', display: 'inline-block' }}>Ver nota →</a>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin visitas registradas.</div>
      )}
    </div>
  );
};

// Mismos campos que ya muestra CeldaEvento para el tipo "pauta", salvo la línea de
// barrio (redundante acá — ya estamos parados en la ficha de ese barrio).
// Esquema Meta Ads (fila_origen/codigo_anuncio pueden repetirse entre registros —
// son ad-sets o snapshots distintos del mismo anuncio, no duplicados a filtrar).
// Card compacta: alcance/impresiones/gasto/CTR. Frecuencia, visualizaciones, CPM,
// presupuesto y tipo_presupuesto quedan solo para el detalle del PDF (htmlPautaPDF).
const FilaPauta = ({ pauta }) => (
  <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{pauta.nombre_anuncio || '—'}</div>
      {pauta.requiere_auditoria && (
        <span style={{ flexShrink: 0, fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '5px', backgroundColor: '#FBBF2422', color: '#B45309', whiteSpace: 'nowrap' }}>
          ⚠ Pendiente de revisión
        </span>
      )}
    </div>
    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Vigencia: {formatearFecha(pauta.fecha_creacion)} → {formatearFecha(pauta.fecha_finalizacion)}</div>
    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
      Alcance: {pauta.alcance?.toLocaleString() ?? '—'} · Impresiones: {pauta.impresiones?.toLocaleString() ?? '—'}
    </div>
    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
      Gasto: {pauta.importe_gastado != null ? `$${pauta.importe_gastado.toLocaleString()}` : '—'}
      {typeof pauta.ctr === 'number' && ` · CTR: ${pauta.ctr.toFixed(2)}%`}
    </div>
    {pauta.observaciones && (
      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{pauta.observaciones}</div>
    )}
  </div>
);

// Nueva (no existía ni siquiera inline en el panel mini): mismo cruce normalizado que ya
// usa buscarPautaCircuito, pero directo por barrio (sin pasar por circuito_principal).
const SolapaPautaBarrio = ({ nombreBarrio, pautasBarriosData }) => {
  const key = normalizarNombreBarrio(nombreBarrio);
  const claveOriginal = pautasBarriosData ? Object.keys(pautasBarriosData).find(k => normalizarNombreBarrio(k) === key) : null;
  const pautas = claveOriginal ? (pautasBarriosData[claveOriginal].pautas || []) : [];
  return (
    <div>
      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Pauta publicitaria</h4>
      {pautas.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin pauta registrada para este barrio.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pautas.map((p, i) => <FilaPauta key={p.fila_origen ?? i} pauta={p} />)}
        </div>
      )}
    </div>
  );
};

// Reconstruye el bloque que antes vivía inline en PanelMiniBarrio (retirado en la Etapa 1).
const SolapaEscuelasBarrio = ({ nombreBarrio, votosEscuelasBarrioLookup, promedioCapitalPct }) => {
  const key = normalizarNombreBarrio(nombreBarrio);
  const votosEscuelas = votosEscuelasBarrioLookup?.[key];
  return (
    <div>
      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 500 }}>Votos por escuela</h4>
      <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>% de votos a Peronismo sobre votos válidos, por escuela con centro de votación en este barrio.</p>
      {votosEscuelas ? (
        <ListaVotosEscuelas escuelas={votosEscuelas.escuelas} promedioCapitalPct={promedioCapitalPct} />
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin centros de votación identificados para este barrio.</div>
      )}
    </div>
  );
};

// Wrapper fino, mismo patrón que SolapaObras (circuito) — ObrasPanel ya soporta tipo="barrio".
const SolapaObrasBarrio = ({ nombreBarrio, obrasEnriquecidas, barriosGeoData, onSelectObra }) => (
  <div>
    <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Obras</h4>
    <ObrasPanel
      tipo="barrio"
      nombreBarrio={nombreBarrio}
      obrasEnriquecidas={obrasEnriquecidas}
      barriosGeoData={barriosGeoData}
      onSelectObra={onSelectObra}
    />
  </div>
);

// ============================================
// ENCUESTAS DE CIRCUITO
// ============================================

// encuestas_circuitos.json a veces tiene la clave con letra y número invertidos
// respecto a CircuitoKey (ej. "A14" en vez de "14A") — se prueba directo y,
// si falla, con el swap. Las claves que ni así matchean (circuitos que no
// existen en este tablero) quedan descartadas sin intentar adivinar a cuál corresponden.
function buscarEncuestaCircuito(encuestasData, circuitoKey) {
  if (!encuestasData || !circuitoKey) return null;
  const key = String(circuitoKey);
  if (encuestasData[key]) return encuestasData[key];
  const m = /^(\d+)([A-Za-z]+)$/.exec(key);
  if (m) {
    const swapped = `${m[2]}${m[1]}`;
    if (encuestasData[swapped]) return encuestasData[swapped];
  }
  return null;
}

// Reemplaza a cobertura_circuitos.json (snapshot fijo que quedaba desactualizado apenas
// se agregaba una encuesta nueva): deriva encuestado/cantidad_rondas/fechas_rondas en
// runtime directamente de encuestas_circuitos.json, reusando buscarEncuestaCircuito
// (sin duplicar su lógica de cruce de claves). Si el circuito no tiene encuesta, devuelve
// la misma forma "vacía" que antes daba el snapshot (encuestado: false, 0 rondas).
function coberturaDesdeEncuesta(encuestasData, circuitoKey) {
  const e = buscarEncuestaCircuito(encuestasData, circuitoKey);
  const cantidadRondas = e?.cantidad_rondas || 0;
  return {
    encuestado: cantidadRondas > 0,
    cantidad_rondas: cantidadRondas,
    fechas_rondas: (e?.rondas || []).map(r => r.fecha),
  };
}

// Deriva en runtime todas las pautas publicitarias de un circuito, sin pautas_circuitos.json
// (mismo criterio ya aplicado para retirar cobertura_circuitos.json: nada de snapshots que
// se desincronicen). pautas_barrios.json viene indexado por nombre de barrio, no por
// circuito — así que se recorren los features de barrios_geo.json buscando cuáles tienen
// circuito_principal apuntando al circuito pedido, y se suman sus pautas.
//
// circuito_principal viene como "Mapkey - nombre" (mismo patrón que ya usa
// handleSelectBarrioDesdeBusqueda): se resuelve el Mapkey real del circuito buscado a
// través de `datos` (no se asume que alcance con rellenar/sacar ceros del circuitoKey).
//
// barrios_geo.json tiene 16 nombres de barrio duplicados (fragmentos no contiguos, ver
// sección 14 de CONTEXTO_PROYECTO.md) que pueden tener circuito_principal distinto entre
// sí — por eso se itera .features (no el lookup ya colapsado por nombre) y se deduplica
// por nombre normalizado SOLO dentro del resultado de este circuito, para no sumar dos
// veces el mismo barrio si aparece en más de un fragmento con el mismo circuito_principal.
// Resuelve el circuito "principal" de un barrio, de forma independiente de cuál sea
// el circuito actualmente seleccionado (no asume que circuitoSeleccionado ya es el
// principal de este barrio — puede no serlo, ej. si se llegó acá vía "Otros barrios en
// este circuito", que a propósito no re-deriva circuito). Dos pasos, en este orden:
// 1) circuito_principal de barrios_geo.json (vía barriosGeoLookup); 2) si falta, cae a
// circuito_barrios_cruce.json → barrio_to_circuitos, orden_importancia: 1. Mismo criterio
// que ya usaba handleSelectBarrioDesdeBusqueda, extraído acá para reusarlo también desde
// la ficha de barrio.
function resolverCircuitoPrincipalDeBarrio(nombreBarrio, cruceData, barriosGeoLookup, todosLosDatos) {
  const key = normalizarNombreBarrio(nombreBarrio);
  const props = barriosGeoLookup[key];
  let circuitoRecord = null;
  const mapkeyPrincipal = props?.circuito_principal?.split(' - ')[0]?.trim();
  if (mapkeyPrincipal) circuitoRecord = todosLosDatos.find(d => d.Mapkey === mapkeyPrincipal);
  if (!circuitoRecord) {
    const lista = cruceData?.barrio_to_circuitos?.[nombreBarrio];
    const principal = lista?.find(c => c.orden_importancia === 1);
    const mapkeyCruce = principal?.circuito?.split(' - ')[0]?.trim();
    if (mapkeyCruce) circuitoRecord = todosLosDatos.find(d => d.Mapkey === mapkeyCruce);
  }
  return circuitoRecord || null;
}

// Dirección inversa de resolverCircuitoPrincipalDeBarrio: el barrio "principal" DE un
// circuito (orden_importancia: 1 en circuito_to_barrios) — mismo mecanismo que ya usa
// handleSelectCircuito, extraído acá para reusarlo desde generarFichaPDF.
function resolverBarrioPrincipalDeCircuito(datosCircuito, cruceData, barriosGeoLookup) {
  const clave = `${datosCircuito.Mapkey} - ${datosCircuito.cirn_nom}`;
  const lista = cruceData?.circuito_to_barrios?.[clave];
  const principal = lista?.find(b => b.orden_importancia === 1);
  if (!principal) return null;
  const key = normalizarNombreBarrio(principal.barrio_normalizado);
  const props = barriosGeoLookup[key];
  const nombreBarrio = props ? props.nombre_barrio : principal.barrio_normalizado;
  return { nombreBarrio, props: props || null };
}

function buscarPautaCircuito(pautasBarriosData, barriosGeoData, datos, circuitoKey) {
  if (!pautasBarriosData || !barriosGeoData || !datos || !circuitoKey) return [];
  const circuitoRecord = datos.find(d => String(d.CircuitoKey) === String(circuitoKey));
  if (!circuitoRecord) return [];
  const mapkeyBuscado = circuitoRecord.Mapkey;

  const barriosVistos = new Set();
  const pautas = [];
  (barriosGeoData.features || []).forEach(feature => {
    const props = feature.properties || {};
    const nombreBarrio = props.nombre_barrio;
    if (!nombreBarrio) return;
    const mapkeyPrincipal = props.circuito_principal?.split(' - ')[0]?.trim();
    if (!mapkeyPrincipal || mapkeyPrincipal !== mapkeyBuscado) return;

    const claveNormalizada = normalizarNombreBarrio(nombreBarrio);
    if (barriosVistos.has(claveNormalizada)) return;
    barriosVistos.add(claveNormalizada);

    const claveOriginal = Object.keys(pautasBarriosData).find(k => normalizarNombreBarrio(k) === claveNormalizada);
    if (!claveOriginal) return;
    (pautasBarriosData[claveOriginal].pautas || []).forEach(p => {
      pautas.push({ ...p, barrio: nombreBarrio });
    });
  });
  return pautas;
}

const COLOR_GESTION = { 'Positiva': '#22C55E', 'Regular': '#FBBF24', 'Negativa': '#EF4444', 'Ns/Nc': '#CBD5E1' };

const BarraProblemas = ({ problemas }) => {
  if (!problemas) return null;
  const entradas = Object.entries(problemas).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 500 }}>Principales problemas</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {entradas.map(([nombre, pct]) => (
          <div key={nombre} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '190px', flexShrink: 0, fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'right' }}>{nombre}</div>
            <div style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', borderRadius: '5px', height: '20px', position: 'relative' }}>
              <div style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: '#1976D2', height: '100%', borderRadius: '5px' }} />
              {(() => {
                const anchoPct = Math.min(pct, 100);
                const cabeAdentro = anchoPct >= 15; // suficiente lugar para el texto dentro del relleno
                return (
                  <span style={{
                    position: 'absolute', top: '2px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap',
                    ...(cabeAdentro
                      ? { left: '8px', color: '#fff' }
                      : { left: `calc(${anchoPct}% + 6px)`, color: 'var(--text-primary)' }),
                  }}>{pct}%</span>
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const BarraGestion = ({ label, data }) => {
  if (!data) return <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{label}: sin dato</div>;
  const categorias = ['Positiva', 'Regular', 'Negativa', 'Ns/Nc'];
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '5px' }}>{label}</div>
      <div style={{ display: 'flex', height: '26px', borderRadius: '6px', overflow: 'hidden' }}>
        {categorias.map(cat => {
          const v = data[cat];
          if (!v || v <= 0) return null;
          const esNsNc = cat === 'Ns/Nc';
          return (
            <div
              key={cat}
              title={esNsNc ? `${cat}: ${v}%` : undefined}
              style={{ width: `${v}%`, backgroundColor: COLOR_GESTION[cat], display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {!esNsNc && v > 8 && <span style={{ fontSize: '11px', color: '#fff', fontWeight: 600 }}>{v}%</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SeccionGestionFuncionarios = ({ gestiones }) => (
  <div>
    <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 500 }}>Calificación de gestión</h4>
    {Object.entries(gestiones).map(([label, data]) => <BarraGestion key={label} label={`Calificación de gestión: ${label}`} data={data} />)}
    <div style={{ display: 'flex', gap: '14px', marginTop: '6px' }}>
      {['Positiva', 'Regular', 'Negativa'].map(cat => (
        <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: COLOR_GESTION[cat] }} />
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{cat}</span>
        </div>
      ))}
    </div>
  </div>
);

const GaugeAprobacion = ({ label, data }) => {
  if (!data || data.Apruebo == null) {
    return <div style={{ flex: '1 1 140px', padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-tertiary)' }}>Aprobación {label}: sin dato</div>;
  }
  const pct = data.Apruebo;
  const color = pct >= 40 ? '#0DCE1D' : pct >= 25 ? '#D9B300' : '#D64550';
  const r = 40, mediaCircunferencia = Math.PI * r;
  const progreso = (Math.min(pct, 100) / 100) * mediaCircunferencia;
  return (
    <div style={{ flex: '1 1 140px', textAlign: 'center', padding: '12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px' }}>
      <svg viewBox="0 0 100 60" style={{ width: '100%', maxWidth: '160px' }}>
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="var(--border)" strokeWidth="10" strokeLinecap="round" />
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${mediaCircunferencia} ${mediaCircunferencia}`}
          strokeDashoffset={mediaCircunferencia - progreso}
        />
        <text x="50" y="45" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--text-primary)">{pct}%</text>
      </svg>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Aprobación {label}</div>
    </div>
  );
};

const DonutReeleccion = ({ label, data }) => {
  if (!data || data.Si == null) {
    return <div style={{ flex: '1 1 140px', padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-tertiary)' }}>{label}: sin dato</div>;
  }
  const si = data.Si;
  const r = 35, cx = 50, cy = 50, circunferencia = 2 * Math.PI * r;
  const siLen = (Math.min(si, 100) / 100) * circunferencia;
  return (
    <div style={{ flex: '1 1 140px', textAlign: 'center', padding: '12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px' }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', maxWidth: '140px' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EF4444" strokeWidth="16" />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke="#22C55E" strokeWidth="16"
          strokeDasharray={`${siLen} ${circunferencia}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <text x="50" y="55" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--text-primary)">{si}%</text>
      </svg>
      <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '4px' }}>{label}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Sí</div>
    </div>
  );
};

const ResumenEncuesta = ({ preguntas }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
    <BarraProblemas problemas={preguntas['Problemas principales']} />
    <SeccionGestionFuncionarios gestiones={{
      Intendente: preguntas['Gestión del Intendente'],
      Gobernador: preguntas['Gestión del Gobernador'],
      Presidente: preguntas['Gestión del Presidente'],
    }} />
    <div>
      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 500 }}>Aprobación de gestión</h4>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <GaugeAprobacion label="Intendente" data={preguntas['Aprobación Intendente']} />
        <GaugeAprobacion label="Gobernador" data={preguntas['Aprobación Gobernador']} />
        <GaugeAprobacion label="Presidente" data={preguntas['Aprobación Presidente']} />
      </div>
    </div>
    <div>
      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 500 }}>Reelección</h4>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <DonutReeleccion label="Llaryora (Gobernador)" data={preguntas['Reelección Llaryora']} />
        <DonutReeleccion label="Milei (Presidente)" data={preguntas['Reelección Milei']} />
      </div>
    </div>
  </div>
);

// ============================================
// VISTA "COMPARATIVO" (solapa Encuestas) — lógica de datos compartida entre pantalla
// (ComparativoEncuesta, JSX) y PDF (htmlComparativoEncuestaBody, HTML-string), definida
// más abajo junto a esta última. Ya no hay sparkline (eliminado a favor de lectura
// directa en texto plano, ver calcularVariacionIndicador/textoVariacionIndicador) ni
// una única función de HTML compartida: cada lado renderiza con su propia técnica
// (JSX vs. HTML-string) sobre la MISMA lógica de cálculo, para no desincronizarse.
// Convención de deltas sin cambios: siempre última ronda vs. primera ronda.
// ============================================

// Solo la barra apilada Positiva/Regular/Negativa/Ns-Nc (sin label), para poder
// componerla tanto en una fila de mini-pendiente (fecha a la izquierda) como en
// htmlBarraCategoriasPDF (label arriba). Mismos colores/umbral de texto que BarraGestion.
// deltas (opcional): {categoria: delta} para pintar, arriba de CADA segmento presente,
// su variación en pp — se usa solo en la barra de la última ronda mostrada (ver
// htmlMiniPendienteGestion). Cada label ocupa el mismo ancho % que su segmento para
// quedar centrado justo arriba de él.
function htmlBarraSegmentosPDF(data, { height = 18, deltas = null } = {}) {
  if (!data) return `<div style="height:${height}px;border-radius:5px;background:#eee"></div>`;
  const categorias = ['Positiva', 'Regular', 'Negativa', 'Ns/Nc'];
  const presentes = categorias.filter(cat => data[cat] > 0);
  const segmentos = presentes.map(cat => {
    const v = data[cat];
    const texto = cat !== 'Ns/Nc' && v > 8 ? `<span style="font-size:9px;color:#fff;font-weight:600">${v}%</span>` : '';
    return `<div style="width:${v}%;background:${COLOR_GESTION[cat]};display:flex;align-items:center;justify-content:center">${texto}</div>`;
  }).join('');
  const barra = `<div style="display:flex;height:${height}px;border-radius:5px;overflow:hidden;background:#eee">${segmentos}</div>`;
  if (!deltas) return barra;
  const labels = presentes.map(cat => `<div style="width:${data[cat]}%;display:flex;justify-content:center;white-space:nowrap">${deltas[cat] != null ? htmlDeltaSegmentoBadge(deltas[cat]) : ''}</div>`).join('');
  return `<div style="display:flex;margin-bottom:3px">${labels}</div>${barra}`;
}

// Arma {actual, fechaActual, primera, delta, estado} para un indicador a partir de
// [{fecha, valor}] ya sin nulls, en orden cronológico. Compartida por pantalla
// (ComparativoEncuesta, JSX) y PDF (htmlComparativoEncuestaBody, HTML-string) — es
// pura lógica de datos, sin JSX ni HTML, así que no hay nada que duplicar entre las
// dos. estado: 'sube' | 'baja' | 'estable' (|delta| < umbral) según primera vs.
// última, o null con < 2 rondas con dato (nada que comparar todavía).
function calcularVariacionIndicador(datos, umbral) {
  if (!datos || datos.length === 0) return null;
  const actual = datos[datos.length - 1];
  const primera = datos[0];
  if (datos.length < 2) return { actual: actual.valor, fechaActual: actual.fecha, primera: null, delta: null, estado: null };
  const delta = actual.valor - primera.valor;
  const estado = Math.abs(delta) < umbral ? 'estable' : (delta > 0 ? 'sube' : 'baja');
  return { actual: actual.valor, fechaActual: actual.fecha, primera: primera.valor, delta, estado };
}

// positivoEsSubir: polaridad del indicador, no del delta — true para Aprobación/
// Reelección/Cordobeses en Alerta (subir es buena noticia en las 6 cards, ver
// ITEMS_INDICADORES_COMPARATIVO), false para "Principales problemas" (subir es
// siempre mala noticia, constante para esa tabla). colorNeutro es configurable porque
// pantalla usa var(--text-tertiary) y el PDF necesita un hex fijo (no hereda custom
// properties).
function colorVariacionIndicador(estado, positivoEsSubir, colorNeutro = 'var(--text-tertiary)') {
  if (!estado || estado === 'estable') return colorNeutro;
  const esBueno = positivoEsSubir ? estado === 'sube' : estado === 'baja';
  return esBueno ? '#2E7D32' : '#C62828';
}

function textoVariacionIndicador(v) {
  if (!v || v.estado == null) return null;
  if (v.estado === 'estable') return `≈ estable (${v.primera.toFixed(1)}%)`;
  const flecha = v.estado === 'sube' ? '▲' : '▼';
  const verbo = v.estado === 'sube' ? 'subió' : 'bajó';
  return `${flecha} ${verbo} desde ${v.primera.toFixed(1)}%`;
}

// 6 cards: Aprobación x3 + Reelección x2 + Cordobeses en Alerta. Esta última pregunta
// en encuestas_metadata.json es tipo "Servicio" ("¿Tu barrio tiene el servicio de
// CORDOBESES EN ALERTA?", categorías Si/No) — pregunta por COBERTURA del programa en
// el barrio, no por percepción de inseguridad/alerta, así que subir (más barrios con
// el servicio) es buena noticia igual que las otras 5 — NO es el caso "problema/alerta"
// que ameritaría invertir. 4º elemento de cada tupla = positivoEsSubir (default true
// si se omite, ninguna de las 6 lo necesita en false).
// "Calificación de gestión" NO es una card de este grid — sigue siendo la sección
// aparte de barras apiladas de siempre (htmlMiniPendientesGestion/ComparativoEncuesta
// más abajo), sin ningún cambio de diseño.
const ITEMS_INDICADORES_COMPARATIVO = [
  ['Aprobación Intendente', 'Aprobación Intendente', 'Apruebo'],
  ['Aprobación Gobernador', 'Aprobación Gobernador', 'Apruebo'],
  ['Aprobación Presidente', 'Aprobación Presidente', 'Apruebo'],
  ['Reelección Llaryora', 'Reelección Llaryora', 'Si'],
  ['Reelección Milei', 'Reelección Milei', 'Si'],
  ['Cordobeses en Alerta', 'Cordobeses en Alerta (existencia)', 'Si'],
];

// Mismo filtro de siempre (se omiten problemas en 0% en TODAS las rondas). Orden por
// valor actual descendente — el problema más relevante hoy va primero (ya no
// alfabético ni por orden fijo de categoría).
function calcularFilasProblemasComparativo(rondas, umbral) {
  const categorias = Array.from(new Set(rondas.flatMap(r => Object.keys(r.preguntas?.['Problemas principales'] || {}))));
  return categorias
    .map(cat => {
      const datos = rondas.map(r => ({ fecha: r.fecha, valor: r.preguntas?.['Problemas principales']?.[cat] })).filter(d => d.valor != null);
      return { cat, datos, v: calcularVariacionIndicador(datos, umbral) };
    })
    .filter(f => f.datos.length > 0 && f.datos.some(d => d.valor > 0))
    .sort((a, b) => b.v.actual - a.v.actual);
}

// Resumen "🔺 Subió / 🔻 Bajó" — misma lógica sin cambios (umbral, primera vs. última
// ronda de "Problemas principales").
function calcularResumenVariacionesProblemas(rondas, umbral) {
  const primera = rondas[0], ultima = rondas[rondas.length - 1];
  const probActual = ultima.preguntas?.['Problemas principales'];
  const probPrimera = primera.preguntas?.['Problemas principales'];
  if (!probActual || !probPrimera) return { suben: [], bajan: [] };
  const categorias = new Set([...Object.keys(probActual), ...Object.keys(probPrimera)]);
  const variaciones = [];
  categorias.forEach(cat => {
    const vA = probActual[cat], vB = probPrimera[cat];
    if (vA == null || vB == null) return;
    const delta = vA - vB;
    if (Math.abs(delta) >= umbral) variaciones.push({ cat, delta });
  });
  return {
    suben: variaciones.filter(v => v.delta > 0).sort((a, b) => b.delta - a.delta),
    bajan: variaciones.filter(v => v.delta < 0).sort((a, b) => a.delta - b.delta),
  };
}

// --- Render PDF (HTML-string, colores hardcodeados porque el documento no hereda
// var(--...)) del resumen/cards/tabla que arma ComparativoEncuesta en pantalla, sobre
// la MISMA lógica de cálculo de arriba — ver htmlComparativoEncuestaBody más abajo.
// "Calificación de gestión" (barras apiladas) no pasa por acá, ver más abajo. ---
function htmlIndicadorCardPlano(label, rondas, pregunta, categoria, umbral, positivoEsSubir) {
  const datos = rondas.map(r => ({ fecha: r.fecha, valor: r.preguntas?.[pregunta]?.[categoria] })).filter(d => d.valor != null);
  const v = calcularVariacionIndicador(datos, umbral);
  const frase = textoVariacionIndicador(v);
  const color = colorVariacionIndicador(v?.estado, positivoEsSubir, '#999');
  return `<div style="padding:14px;background:#f5f5f5;border-radius:10px;display:flex;flex-direction:column;gap:4px;min-height:96px">
    <div style="font-size:11px;color:#666">${label}</div>
    <div style="font-size:20px;font-weight:700;color:#1a1a1a">${v?.actual != null ? v.actual.toFixed(1) + '%' : '—'}</div>
    ${frase ? `<div style="font-size:11px;font-weight:600;color:${color}">${frase}</div>` : ''}
    ${v?.fechaActual ? `<div style="font-size:9px;color:#999;margin-top:2px">${formatearFecha(v.fechaActual)}</div>` : ''}
  </div>`;
}

function htmlGridIndicadoresPlano(rondas, umbral) {
  const cards = ITEMS_INDICADORES_COMPARATIVO
    .map(([label, pregunta, categoria, positivoEsSubir = true]) => htmlIndicadorCardPlano(label, rondas, pregunta, categoria, umbral, positivoEsSubir))
    .join('');
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));gap:10px">${cards}</div>`;
}

function htmlTablaProblemasPlano(rondas, umbral) {
  const filas = calcularFilasProblemasComparativo(rondas, umbral);
  if (filas.length === 0) return `<p style="font-size:12px;color:#999">Sin datos de problemas.</p>`;
  const filasHtml = filas.map(f => `<tr>
      <td style="padding:8px;border-top:1px solid #e0e0e0">${f.cat}</td>
      <td style="padding:8px;border-top:1px solid #e0e0e0;text-align:right"><strong>${f.v.actual.toFixed(1)}%</strong></td>
      <td style="padding:8px;border-top:1px solid #e0e0e0;text-align:right;font-weight:600;color:${colorVariacionIndicador(f.v.estado, false, '#999')}">${textoVariacionIndicador(f.v) || '—'}</td>
    </tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr>
      <th style="padding:8px;text-align:left;background:#f5f5f5;font-weight:500">Problema</th>
      <th style="padding:8px;text-align:right;background:#f5f5f5;font-weight:500">% actual</th>
      <th style="padding:8px;text-align:right;background:#f5f5f5;font-weight:500">Variación</th>
    </tr></thead>
    <tbody>${filasHtml}</tbody>
  </table>`;
}

function htmlResumenVariacionesPlano(rondas, umbral) {
  const { suben, bajan } = calcularResumenVariacionesProblemas(rondas, umbral);
  if (suben.length === 0 && bajan.length === 0) {
    return `<div style="font-size:12px;color:#999;margin-bottom:16px">Sin variaciones significativas (≥${umbral}pp) entre rondas.</div>`;
  }
  const partes = [];
  if (suben.length > 0) partes.push(`<div>🔺 Subió: ${suben.map(v => `${v.cat} (+${v.delta.toFixed(1)}pp)`).join(' · ')}</div>`);
  if (bajan.length > 0) partes.push(`<div>🔻 Bajó: ${bajan.map(v => `${v.cat} (${v.delta.toFixed(1)}pp)`).join(' · ')}</div>`);
  return `<div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:18px;display:flex;flex-direction:column;gap:6px">${partes.join('')}</div>`;
}

// --- "Calificación de gestión" (barras apiladas). Una fila por ronda (fecha a la
// izquierda + barra apilada Positiva/Regular/Negativa/Ns-Nc, reutilizando
// htmlBarraSegmentosPDF), apiladas verticalmente. Ya no hay un badge único arriba del
// título (ambiguo: solo mostraba el delta de "Positiva") — en su lugar, cada segmento
// de la ÚLTIMA barra lleva su propio delta arriba, ver htmlDeltaSegmentoBadge/
// calcularDeltasCategoriasGestion. ---
function htmlDeltaSegmentoBadge(delta) {
  const redondeado = Math.round(delta * 10) / 10;
  if (redondeado === 0) return `<span style="font-size:10px;font-weight:600;color:#999">— 0.0 pp</span>`;
  const sube = redondeado > 0;
  const color = sube ? '#2E7D32' : '#C62828';
  const arrow = sube ? '▲' : '▼';
  const signo = sube ? '+' : '';
  return `<span style="font-size:10px;font-weight:600;color:${color}">${arrow} ${signo}${redondeado.toFixed(1)} pp</span>`;
}

// Delta por categoría (Positiva/Regular/Negativa/Ns-Nc) entre la primera y la última
// fila con dato para este funcionario — reemplaza el viejo badge único de "Positiva".
// Variación cruda por signo (sube=verde, baja=rojo), sin lógica de "bueno/malo" según
// qué representa cada categoría, igual para las 4. Si una categoría existe en la
// última ronda pero no en la primera (ej. Ns/Nc recién aparece), se toma 0% como valor
// de esa primera ronda. null si hay menos de 2 filas (nada que comparar todavía).
function calcularDeltasCategoriasGestion(filas) {
  if (filas.length < 2) return null;
  const primera = filas[0].data, ultima = filas[filas.length - 1].data;
  const categorias = ['Positiva', 'Regular', 'Negativa', 'Ns/Nc'];
  const deltas = {};
  categorias.forEach(cat => {
    const vUltima = ultima[cat];
    if (!vUltima || vUltima <= 0) return; // sin segmento en la última barra => sin badge
    deltas[cat] = vUltima - (primera[cat] || 0);
  });
  return deltas;
}

function htmlMiniPendienteGestion(funcionario, rondas) {
  const pregunta = `Gestión del ${funcionario}`;
  const filas = rondas.map(r => ({ fecha: r.fecha, casos: r.casos, data: r.preguntas?.[pregunta] })).filter(f => f.data);
  if (filas.length === 0) {
    return `<div style="margin-bottom:16px"><div style="font-size:13px;color:#666;font-weight:500;margin-bottom:8px">Calificación de gestión: ${funcionario}</div><p style="font-size:12px;color:#999">Sin dato.</p></div>`;
  }
  const deltas = calcularDeltasCategoriasGestion(filas);
  const filasHtml = filas.map((f, i) => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <span style="width:175px;flex-shrink:0;font-size:11px;color:#999">${formatearFechaRonda(f.fecha, f.casos)}</span>
      <div style="flex:1">${htmlBarraSegmentosPDF(f.data, { height: 22, deltas: i === filas.length - 1 ? deltas : null })}</div>
    </div>`).join('');
  return `<div style="margin-bottom:16px">
    <div style="font-size:13px;color:#666;font-weight:500;margin-bottom:8px">Calificación de gestión: ${funcionario}</div>
    ${filasHtml}
  </div>`;
}

function htmlMiniPendientesGestion(rondas) {
  return ['Intendente', 'Gobernador', 'Presidente'].map(f => htmlMiniPendienteGestion(f, rondas)).join('');
}

function htmlLegendGestion() {
  const items = ['Positiva', 'Regular', 'Negativa'].map(cat =>
    `<div style="display:flex;align-items:center;gap:5px"><div style="width:10px;height:10px;border-radius:2px;background:${COLOR_GESTION[cat]}"></div><span style="font-size:11px;color:#666">${cat}</span></div>`
  ).join('');
  return `<div style="display:flex;gap:14px;margin-top:6px">${items}</div>`;
}

// Cuerpo completo de la vista Comparativo para el PDF — mismo criterio que
// ComparativoEncuesta en pantalla: cards sin sparkline + tabla ordenada con frase en
// texto plano para Indicadores/Principales problemas, "Calificación de gestión" sin
// tocar (barras apiladas de siempre, ver bloque de arriba).
function htmlComparativoEncuestaBody(encuesta, umbral) {
  const rondas = encuesta.rondas;
  return `
    ${htmlResumenVariacionesPlano(rondas, umbral)}
    <div style="margin-bottom:20px">
      <h4 style="font-size:13px;color:#666;margin-bottom:10px;font-weight:500">Indicadores</h4>
      ${htmlGridIndicadoresPlano(rondas, umbral)}
    </div>
    <div style="margin-bottom:20px">
      <h4 style="font-size:13px;color:#666;margin-bottom:10px;font-weight:500">Calificación de gestión</h4>
      ${htmlMiniPendientesGestion(rondas)}
      ${htmlLegendGestion()}
    </div>
    <div>
      <h4 style="font-size:13px;color:#666;margin-bottom:10px;font-weight:500">Principales problemas — evolución</h4>
      ${htmlTablaProblemasPlano(rondas, umbral)}
    </div>
  `;
}

// ============================================
// VISTA "COMPARATIVO" EN PANTALLA — JSX puro sobre la lógica de cálculo de arriba
// (calcularVariacionIndicador/textoVariacionIndicador/etc.), independiente del
// renderer del PDF (htmlComparativoEncuestaBody, HTML-string) aunque comparten esa
// misma lógica — ver comentario de la sección de arriba.
// ============================================

const CardIndicadorComparativo = ({ label, rondas, pregunta, categoria, umbral, positivoEsSubir = true }) => {
  const datos = rondas.map(r => ({ fecha: r.fecha, valor: r.preguntas?.[pregunta]?.[categoria] })).filter(d => d.valor != null);
  const v = calcularVariacionIndicador(datos, umbral);
  const frase = textoVariacionIndicador(v);
  return (
    <div style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '4px', minHeight: '110px' }}>
      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: '26px', fontWeight: 500, color: 'var(--text-primary)' }}>{v?.actual != null ? `${v.actual.toFixed(1)}%` : '—'}</div>
      {frase && <div style={{ fontSize: '12px', fontWeight: 600, color: colorVariacionIndicador(v.estado, positivoEsSubir) }}>{frase}</div>}
      {v?.fechaActual && <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{formatearFecha(v.fechaActual)}</div>}
    </div>
  );
};

const GridIndicadoresComparativo = ({ rondas, umbral }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
    {ITEMS_INDICADORES_COMPARATIVO.map(([label, pregunta, categoria, positivoEsSubir = true]) => (
      <CardIndicadorComparativo key={label} label={label} rondas={rondas} pregunta={pregunta} categoria={categoria} umbral={umbral} positivoEsSubir={positivoEsSubir} />
    ))}
  </div>
);

// "Principales problemas": subir SIEMPRE es rojo (más gente lo percibe como problema)
// y bajar SIEMPRE es verde — polaridad constante, no depende del tipo de pregunta como
// en las cards de arriba (por eso positivoEsSubir=false fijo acá).
const TablaProblemasComparativo = ({ rondas, umbral }) => {
  const filas = calcularFilasProblemasComparativo(rondas, umbral);
  if (filas.length === 0) return <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin datos de problemas.</p>;
  return (
    <div>
      {filas.map((f, i) => (
        <div key={f.cat} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 4px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)' }}>{f.cat}</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', minWidth: '52px', textAlign: 'right' }}>{f.v.actual.toFixed(1)}%</div>
          <div style={{ fontSize: '12px', fontWeight: 600, minWidth: '160px', textAlign: 'right', color: colorVariacionIndicador(f.v.estado, false) }}>
            {textoVariacionIndicador(f.v) || '—'}
          </div>
        </div>
      ))}
    </div>
  );
};

// Resumen automático "🔺 Subió / 🔻 Bajó" — misma lógica sin cambios (umbral 2.5pp,
// primera vs. última ronda), solo con más jerarquía visual (antes 12px sin destacar):
// va primero, más grande y en negrita, para que sea lo primero que se lee.
const ResumenVariacionesComparativo = ({ rondas, umbral }) => {
  const { suben, bajan } = calcularResumenVariacionesProblemas(rondas, umbral);
  if (suben.length === 0 && bajan.length === 0) {
    return <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '22px' }}>Sin variaciones significativas (≥{umbral}pp) entre rondas.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '24px' }}>
      {suben.length > 0 && <div>🔺 Subió: {suben.map(v => `${v.cat} (+${v.delta.toFixed(1)}pp)`).join(' · ')}</div>}
      {bajan.length > 0 && <div>🔻 Bajó: {bajan.map(v => `${v.cat} (${v.delta.toFixed(1)}pp)`).join(' · ')}</div>}
    </div>
  );
};

const ComparativoEncuesta = ({ encuesta, umbral }) => {
  const rondas = encuesta.rondas;
  return (
    <div>
      <ResumenVariacionesComparativo rondas={rondas} umbral={umbral} />
      <div style={{ marginBottom: '28px' }}>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 500 }}>Indicadores</h4>
        <GridIndicadoresComparativo rondas={rondas} umbral={umbral} />
      </div>
      {/* Sin cambios de diseño: mismo HTML de siempre (barras apiladas Positiva/Regular/
          Negativa/Ns-Nc por ronda + delta al lado del título), vía dangerouslySetInnerHTML
          para garantizar que quede pixel-a-pixel igual a como funcionaba antes — no es
          una card del grid de Indicadores de arriba. */}
      <div style={{ marginBottom: '28px' }}>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 500 }}>Calificación de gestión</h4>
        <div dangerouslySetInnerHTML={{ __html: htmlMiniPendientesGestion(rondas) + htmlLegendGestion() }} />
      </div>
      <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px', fontWeight: 500 }}>Principales problemas — evolución</h4>
        <TablaProblemasComparativo rondas={rondas} umbral={umbral} />
      </div>
    </div>
  );
};

// fechaRondaInicial (opcional): pedido puntual de qué ronda mostrar al montar (ver
// click en evento de Medición de TablaEventosCobertura, irACircuitoDesdeGrillaMedicion).
// Sin ese pedido, o si la fecha no matchea ninguna ronda de ESTE circuito, se cae al
// comportamiento de siempre (última ronda) — no rompe ningún otro caller.
const SolapaEncuestas = ({ encuesta, metadata, fechaRondaInicial }) => {
  const [rondaIdx, setRondaIdx] = useState(() => {
    if (!fechaRondaInicial) return encuesta.rondas.length - 1;
    const idx = encuesta.rondas.findIndex(r => r.fecha === fechaRondaInicial);
    return idx >= 0 ? idx : encuesta.rondas.length - 1;
  });
  const [vista, setVista] = useState('resumen');
  const ronda = encuesta.rondas[rondaIdx];
  const umbral = metadata?.umbral_variacion_pp ?? 2.5;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
          {vista === 'resumen' ? `Encuesta · ${formatearFechaRonda(ronda.fecha, ronda.casos)}` : 'Comparativo entre rondas'}
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {vista === 'resumen' && encuesta.rondas.length > 1 && (
            <select value={rondaIdx} onChange={(e) => setRondaIdx(Number(e.target.value))} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', backgroundColor: '#fff' }}>
              {encuesta.rondas.map((r, i) => <option key={i} value={i}>{formatearFechaRonda(r.fecha, r.casos)}</option>)}
            </select>
          )}
          {encuesta.tiene_comparativo && (
            <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', padding: '3px' }}>
              <button onClick={() => setVista('resumen')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: vista === 'resumen' ? '#1976D2' : 'transparent', color: vista === 'resumen' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Resumen</button>
              <button onClick={() => setVista('comparativo')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: vista === 'comparativo' ? '#1976D2' : 'transparent', color: vista === 'comparativo' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Comparativo</button>
            </div>
          )}
        </div>
      </div>

      {vista === 'resumen'
        ? <ResumenEncuesta preguntas={ronda.preguntas} />
        : <ComparativoEncuesta encuesta={encuesta} umbral={umbral} />}
    </div>
  );
};

const ListadoEncuestasCircuitos = ({ datos, encuestasData, onSelectCircuito }) => {
  const filas = useMemo(() => {
    return datos
      .map(d => ({ circuito: d, encuesta: buscarEncuestaCircuito(encuestasData, d.CircuitoKey) }))
      .filter(f => f.encuesta)
      .map(f => ({ ...f, fechaReciente: f.encuesta.rondas[f.encuesta.rondas.length - 1].fecha }))
      .sort((a, b) => compararMapkey(a.circuito.CircuitoKey, b.circuito.CircuitoKey));
  }, [datos, encuestasData]);

  return (
    <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '8px' }}>
      {filas.map(({ circuito, encuesta, fechaReciente }) => (
        <div
          key={circuito.CircuitoKey}
          onClick={() => onSelectCircuito(circuito.CircuitoKey)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{circuito.CircuitoKey} · {circuito.cirn_nom}</span>
          <span style={{ display: 'flex', gap: '18px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <span>{encuesta.cantidad_rondas} ronda{encuesta.cantidad_rondas !== 1 ? 's' : ''}</span>
            <span>{formatearFecha(fechaReciente)}</span>
          </span>
        </div>
      ))}
    </div>
  );
};

// ============================================
// VISTA CAPITAL
// ============================================
const VistaCapital = ({ datos, onSelectCircuito, filtroCategoria, setFiltroCategoria }) => {
  const [ordenColumna, setOrdenColumna] = useState('Share_G23');
  const [ordenAsc, setOrdenAsc] = useState(false);
  
  const conteoCategoria = datos.reduce((acc, d) => { 
    const cat = d.Categoria_v4;
    const catNorm = cat === 'B.2' ? 'D' : cat;
    acc[catNorm] = (acc[catNorm] || 0) + 1; 
    return acc; 
  }, {});
  
  const datosFiltrados = filtroCategoria 
    ? datos.filter(d => d.Categoria_v4 === filtroCategoria || (filtroCategoria === 'D' && d.Categoria_v4 === 'B.2'))
    : datos;
  const datosOrdenados = [...datosFiltrados].sort((a, b) => { const valA = a[ordenColumna] || 0; const valB = b[ordenColumna] || 0; return ordenAsc ? valA - valB : valB - valA; });
  const totalPadron = datos.reduce((sum, d) => sum + (d.Padron_G23 || 0), 0);
  
  const handleOrdenar = (col) => { if (ordenColumna === col) { setOrdenAsc(!ordenAsc); } else { setOrdenColumna(col); setOrdenAsc(false); } };
  
  const categoriasUnicas = Object.entries(COLORES_CATEGORIA).filter(([k]) => k !== 'B.2');
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ padding: '16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '14px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>CÓRDOBA CAPITAL</h2>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '10px' }}>119 circuitos │ {totalPadron.toLocaleString()} electores</div>
      </div>
      
      <div style={{ padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Resultados Capital - % Votos Peronismo</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[{ label: 'Gob. 2023', value: 0.458 }, { label: 'Gob. 2019', value: 0.515 }, { label: 'Dip. 2025', value: 0.255 }, { label: 'Dip. 2021', value: 0.222 }, { label: 'Int. 2019', value: 0.402 }].map(e => (
            <div key={e.label} style={{ flex: '1 1 140px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>{e.label}</div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: e.value >= 0.45 ? '#2E7D32' : e.value >= 0.25 ? '#FF8F00' : '#C62828' }}>{formatPct(e.value)}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px' }}>
          <div><span style={{ color: 'var(--text-secondary)' }}>Tendencia Gob (19→23): </span><span style={{ color: '#C62828', fontWeight: 500 }}>-5.7 pp</span></div>
          <div><span style={{ color: 'var(--text-secondary)' }}>Tendencia Dip (21→25): </span><span style={{ color: '#2E7D32', fontWeight: 500 }}>+3.3 pp</span></div>
          <div><span style={{ color: 'var(--text-secondary)' }}>Efecto ML (Int19→G23): </span><span style={{ color: '#2E7D32', fontWeight: 500 }}>+5.6 pp</span></div>
        </div>
      </div>
      
      <div style={{ padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          Filtrar por diagnóstico
          {filtroCategoria && <button onClick={() => setFiltroCategoria(null)} style={{ marginLeft: '12px', padding: '4px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕ Limpiar filtro</button>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {categoriasUnicas.map(([cat, config]) => (
            <div key={cat} onClick={() => setFiltroCategoria(filtroCategoria === cat ? null : cat)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '8px', backgroundColor: filtroCategoria === cat ? `${config.bg}30` : 'var(--bg-secondary)', border: filtroCategoria === cat ? `2px solid ${config.bg}` : '2px solid transparent', cursor: 'pointer', transition: 'all 0.2s' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '4px', backgroundColor: config.bg }} />
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: filtroCategoria === cat ? 600 : 400 }}>{config.label} ({conteoCategoria[cat] || 0})</span>
            </div>
          ))}
        </div>
      </div>
      
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{filtroCategoria ? `Mostrando ${datosFiltrados.length} circuitos` : 'Todos los circuitos (119)'}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Click en columna para ordenar</span>
        </div>
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-secondary)' }}>
              <tr>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)', cursor: 'pointer' }} onClick={() => handleOrdenar('CircuitoKey')}>Circuito</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Diagnóstico</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)', cursor: 'pointer' }} onClick={() => handleOrdenar('Share_G23')}>G23 {ordenColumna === 'Share_G23' && (ordenAsc ? '↑' : '↓')}</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)', cursor: 'pointer' }} onClick={() => handleOrdenar('Share_L25')}>D25 {ordenColumna === 'Share_L25' && (ordenAsc ? '↑' : '↓')}</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)', cursor: 'pointer' }} onClick={() => handleOrdenar('Victorias_Total')}>Vict. {ordenColumna === 'Victorias_Total' && (ordenAsc ? '↑' : '↓')}</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)', cursor: 'pointer' }} onClick={() => handleOrdenar('Padron_G23')}>Padrón {ordenColumna === 'Padron_G23' && (ordenAsc ? '↑' : '↓')}</th>
              </tr>
            </thead>
            <tbody>
              {datosOrdenados.map((d) => (
                <tr key={d.CircuitoKey} onClick={() => onSelectCircuito(d.CircuitoKey)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <td style={{ padding: '10px 14px' }}><strong>{d.CircuitoKey}</strong> - {d.cirn_nom?.substring(0, 20)}{d.cirn_nom?.length > 20 ? '...' : ''}</td>
                  <td style={{ padding: '10px 14px' }}><Badge categoria={d.Categoria_v4} tipo="v4" /></td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: d.Share_G23 >= 0.5 ? '#2E7D32' : d.Share_G23 >= 0.4 ? '#FF8F00' : '#C62828' }}>{formatPct(d.Share_G23)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-secondary)' }}>{formatPct(d.Share_L25)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500 }}>{d.Victorias_Total}/4</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-secondary)' }}>{d.Padron_G23?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div style={{ padding: '18px 24px', backgroundColor: '#1976D218', borderRadius: '12px', textAlign: 'center' }}>
        <span style={{ fontSize: '13px', color: '#1565C0' }}>Hacé click en el mapa o en una fila para ver el detalle del circuito</span>
      </div>
    </div>
  );
};

// ============================================
// PANEL LATERAL (VISTA MAPA)
// ============================================
const MetricCardMini = ({ label, value, subtitle, trend, trendPositive }) => (
  <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
      {subtitle && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{subtitle}</span>}
    </div>
    {trend && <div style={{ marginTop: '3px', fontSize: '11px', color: trendPositive ? '#2E7D32' : '#C62828', fontWeight: 500 }}>{trendPositive ? '▲' : '▼'} {trend}</div>}
  </div>
);

const BadgeCobertura = ({ encuestado }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '6px', backgroundColor: encuestado ? '#4CAF5022' : 'var(--bg-secondary)', color: encuestado ? '#2E7D32' : 'var(--text-tertiary)', fontSize: '11px', fontWeight: 600 }}>
    {encuestado ? '✓ Encuestado' : '○ Sin encuestar'}
  </span>
);

const ResumenCircuitoMini = ({ datos, padronTotal, encuestasData }) => {
  if (!datos) {
    return <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin circuito asociado.</div>;
  }
  const pctPadron = padronTotal > 0 ? ((datos.Padron_G23 / padronTotal) * 100).toFixed(1) : 0;
  const cobertura = coberturaDesdeEncuesta(encuestasData, datos.CircuitoKey);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Circuito {datos.CircuitoKey}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{datos.cirn_nom}</div>
      </div>
      <Badge categoria={datos.Categoria_v4} tipo="v4" />
      <MetricCardMini label={<>Padrón electoral (circuito) <InfoTip texto="Personas habilitadas para votar en este circuito según el padrón electoral 2023." /></>} value={datos.Padron_G23?.toLocaleString() || '—'} subtitle={`${pctPadron}% Capital`} />
      <MetricCardMini label="Participación G23" value={formatPct(datos.Turnout_G23)} trend={`${formatPP(datos.Turnout_G23 - 0.67)} vs Capital`} trendPositive={(datos.Turnout_G23 - 0.67) > 0} />
      <MetricCardMini label="Tendencia Gob. 19→23" value={formatPP(datos.Residual_Gov)} trendPositive={datos.Residual_Gov >= 0} />
      {encuestasData && (
        <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Cobertura de encuesta</div>
          <BadgeCobertura encuestado={!!cobertura?.encuestado} />
          {cobertura?.encuestado && (
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>
              {cobertura.cantidad_rondas} ronda{cobertura.cantidad_rondas !== 1 ? 's' : ''}: {(cobertura.fechas_rondas || []).map(formatearFecha).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const FilaCruce = ({ label, sublabel, onClick }) => (
  <div onClick={onClick} style={{ padding: '6px 8px', borderRadius: '6px', backgroundColor: 'var(--bg-secondary)', cursor: 'pointer', fontSize: '11px' }}>
    <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
    {sublabel && <div style={{ color: 'var(--text-tertiary)', marginTop: '1px' }}>{sublabel}</div>}
  </div>
);

const ListaCruceColapsable = ({ titulo, items }) => {
  if (!items || items.length === 0) return null;
  return (
    <details>
      <summary style={{ cursor: 'pointer', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500, padding: '4px 0' }}>{titulo} ({items.length})</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
        {items}
      </div>
    </details>
  );
};

// Gradiente secuencial de un solo tono (no diverging): a más % de peronismo, más intensidad
// del mismo rojo que ya usa COLORES_CATEGORIA.C ("Territorio hostil"), para mantener un único
// vocabulario de color en todo el tablero. El promedio de Capital se marca aparte (línea
// vertical), así que este color codifica solo la magnitud, no la comparación contra el promedio.
function colorPeronismo(pct) {
  const t = Math.max(0, Math.min(100, pct ?? 0)) / 100;
  const desde = { r: 255, g: 235, b: 238 }; // rojo muy pálido
  const hasta = { r: 183, g: 28, b: 28 };   // mismo rojo "text" de Categoria_v4 'C'
  const r = Math.round(desde.r + (hasta.r - desde.r) * t);
  const g = Math.round(desde.g + (hasta.g - desde.g) * t);
  const b = Math.round(desde.b + (hasta.b - desde.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

// Layout apilado (nombre+pct arriba, barra, detalle abajo) en vez de columnas de ancho
// fijo: este mismo componente se usa tanto en la solapa de ficha completa (ancha) como
// en PanelMiniBarrio (sidebar angosto, ~260px), y columnas fijas desbordarían ahí.
const FilaVotoEscuela = ({ escuela, promedioCapitalPct }) => {
  const pct = escuela.pct_peronismo;
  const anchoPct = Math.max(0, Math.min(100, pct ?? 0));
  const pendienteRevision = escuela.confianza === 'pendiente_revision';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
        <div title={escuela.nombre} style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pendienteRevision && <span title="Match pendiente de revisión, dato aproximado" style={{ color: '#F57F17' }}>⚠ </span>}
          {escuela.nombre}
        </div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>{pct != null ? `${pct.toFixed(1)}%` : '—'}</div>
      </div>
      <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '5px', height: '10px', position: 'relative', border: pendienteRevision ? '1px dashed #F57F17' : 'none' }}>
        <div style={{ width: `${anchoPct}%`, backgroundColor: colorPeronismo(pct), height: '100%', borderRadius: '4px' }} />
        {promedioCapitalPct != null && (
          <div
            title={`Promedio Capital: ${promedioCapitalPct}%`}
            style={{ position: 'absolute', left: `${Math.max(0, Math.min(100, promedioCapitalPct))}%`, top: '-2px', bottom: '-2px', width: '2px', backgroundColor: '#37474F' }}
          />
        )}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '3px' }}>
        {escuela.votos_validos?.toLocaleString() ?? '—'} votos · {escuela.n_mesas ?? '—'} mesas
      </div>
    </div>
  );
};

const ListaVotosEscuelas = ({ escuelas, promedioCapitalPct }) => {
  if (!escuelas || escuelas.length === 0) {
    return <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin centros de votación identificados.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      {promedioCapitalPct != null && (
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '2px', height: '11px', backgroundColor: '#37474F' }} /> Promedio Capital: {promedioCapitalPct}%
        </div>
      )}
      {escuelas.map(e => <FilaVotoEscuela key={e.cue} escuela={e} promedioCapitalPct={promedioCapitalPct} />)}
    </div>
  );
};

// ============================================
// OBRAS (obras_capital.json) — panel reusable, ver lib/obrasCercanas.js
// ============================================

const ESTADOS_OBRA_ORDEN = ['Finalizado — Inaugurable', 'En ejecución', 'Relevado', 'Finalizado', 'Por relevar'];

const FilaObra = ({ obra, onSelectObra }) => {
  const colorEstado = COLOR_OBRA_ESTADO[obra.estado] || COLOR_OBRA_DEFAULT;
  const aproximado = obra.fuente_barrio === 'cercano_aproximado';
  return (
    <div
      onClick={onSelectObra ? () => onSelectObra(obra) : undefined}
      style={{ padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px', cursor: onSelectObra ? 'pointer' : 'default' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{obra.nombre}</div>
        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '5px', backgroundColor: `${colorEstado}22`, color: colorEstado, whiteSpace: 'nowrap', flexShrink: 0 }}>{obra.estado || 'Sin dato'}</span>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{obra.tipo_obra || '—'}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
        {obra.barrio || 'Sin barrio asignado'}{obra._circuitoNombre ? ` · ${obra._circuitoNombre}` : ' · Sin circuito derivado'}
      </div>
      {aproximado && (
        <div style={{ fontSize: '11px', color: '#F57F17', fontWeight: 600 }}>
          barrio aproximado (a {obra.distancia_barrio_km != null ? obra.distancia_barrio_km.toFixed(1) : '?'} km)
        </div>
      )}
      {obra.prioridad && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Prioridad: {obra.prioridad}</div>}
      {(obra.fecha_inicio || obra.fecha_finalizacion || obra.fecha_disponibilidad_inaugurar) && (
        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
          {obra.fecha_inicio && <div>Inicio: {formatearFecha(obra.fecha_inicio)}</div>}
          {obra.fecha_finalizacion && <div>Finalización: {formatearFecha(obra.fecha_finalizacion)}</div>}
          {obra.fecha_disponibilidad_inaugurar && <div>Disponible para inaugurar: {formatearFecha(obra.fecha_disponibilidad_inaugurar)}</div>}
        </div>
      )}
      {obra.observaciones && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{obra.observaciones}</div>}
    </div>
  );
};

const ListaObras = ({ obras, vacio, onSelectObra }) => {
  const [filtroEstado, setFiltroEstado] = useState('');
  const estadosPresentes = ESTADOS_OBRA_ORDEN.filter(e => obras.some(o => o.estado === e));
  const filtradas = filtroEstado ? obras.filter(o => o.estado === filtroEstado) : obras;

  if (!obras || obras.length === 0) {
    return <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{vacio}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {estadosPresentes.length > 1 && (
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
          <option value="">Todos los estados ({obras.length})</option>
          {estadosPresentes.map(e => <option key={e} value={e}>{e} ({obras.filter(o => o.estado === e).length})</option>)}
        </select>
      )}
      {filtradas.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Ninguna obra con ese estado.</div>
      ) : filtradas.map((o, i) => <FilaObra key={`${o.id}-${i}`} obra={o} onSelectObra={onSelectObra} />)}
    </div>
  );
};

// Componente reusable (no atado a la solapa de circuito): recibe un barrio o un
// circuito y muestra dos secciones — obras propias (match directo por barrio/circuito
// derivado) y obras cercanas (radio 1.5km, lib/obrasCercanas.js). Pensado para
// reusarse tal cual dentro de la futura solapa unificada de barrio.
const ObrasPanel = ({ tipo, datosCircuito, nombreBarrio, obrasEnriquecidas, barriosGeoData, circuitosGeoJsonData, focoInicial = 'propio', onSelectObra }) => {
  const obrasPropias = useMemo(() => {
    if (tipo === 'circuito') {
      if (!datosCircuito) return [];
      return (obrasEnriquecidas || []).filter(o => o._circuitoMapkey === datosCircuito.Mapkey);
    }
    if (!nombreBarrio) return [];
    const key = normalizarNombreBarrio(nombreBarrio);
    return (obrasEnriquecidas || []).filter(o => normalizarNombreBarrio(o.barrio) === key);
  }, [tipo, datosCircuito, nombreBarrio, obrasEnriquecidas]);

  const obrasCercanas = useMemo(() => {
    const idsPropias = new Set(obrasPropias.map(o => o.id));
    let resultado = [];
    if (tipo === 'circuito' && datosCircuito) resultado = obrasCercanasACircuito(datosCircuito.Mapkey, circuitosGeoJsonData, obrasEnriquecidas);
    else if (tipo === 'barrio' && nombreBarrio) resultado = obrasCercanasABarrio(nombreBarrio, barriosGeoData, obrasEnriquecidas);
    return resultado.filter(o => !idsPropias.has(o.id));
  }, [tipo, datosCircuito, nombreBarrio, obrasEnriquecidas, circuitosGeoJsonData, barriosGeoData, obrasPropias]);

  const tituloPropio = tipo === 'circuito' ? 'Obras en este circuito' : 'Obras en este barrio';
  const vacioPropio = tipo === 'circuito' ? 'Sin obras identificadas en este circuito.' : 'Sin obras identificadas en este barrio.';
  const tituloCercanas = `Obras cercanas, de otro ${tipo === 'circuito' ? 'circuito' : 'barrio'}`;

  const secciones = [
    { key: 'propio', titulo: tituloPropio, obras: obrasPropias, vacio: vacioPropio },
    { key: 'cercanas', titulo: tituloCercanas, obras: obrasCercanas, vacio: 'Sin obras cercanas dentro de 1,5 km.' },
  ];
  if (focoInicial === 'cercanas') secciones.reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {secciones.map(s => (
        <div key={s.key}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>{s.titulo} ({s.obras.length})</div>
          <ListaObras obras={s.obras} vacio={s.vacio} onSelectObra={onSelectObra} />
        </div>
      ))}
    </div>
  );
};

const BadgeObrasCercanas = ({ cantidad, onClick }) => (
  <span onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', backgroundColor: '#5C6BC018', color: '#3949AB', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
    🏗️ Obras cercanas ({cantidad})
  </span>
);

// Vista de obra individual, disparada desde cualquier FilaObra o desde el marker del
// mapa (ver onSelectObra en MapaCircuitos.js) — mismo patrón visual que InfoModal
// (overlay + card flotante). Las filas de "Obras cercanas a esta obra" son clickeables
// y vuelven a llamar a onSelectObra, para poder navegar de obra en obra sin cerrar.
const ModalObra = ({ obra, onClose, onSelectObra, obrasEnriquecidas }) => {
  if (!obra) return null;
  const colorEstado = COLOR_OBRA_ESTADO[obra.estado] || COLOR_OBRA_DEFAULT;
  const aproximado = obra.fuente_barrio === 'cercano_aproximado';
  const tieneCoordenadas = obra.lat != null && obra.lon != null;
  const cercanas = tieneCoordenadas ? obrasCercanasAObra(obra, obrasEnriquecidas, 1.5) : [];

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={onClose}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '28px', maxWidth: '480px', width: '100%', maxHeight: '80vh', overflowY: 'auto', margin: '20px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '18px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>{obra.nombre}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '19px', cursor: 'pointer', color: '#666', flexShrink: 0 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{obra.reparticion || '—'} · {obra.tipo_obra || '—'}</div>
          <span style={{ display: 'inline-flex', alignSelf: 'flex-start', fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', backgroundColor: `${colorEstado}22`, color: colorEstado }}>{obra.estado || 'Sin dato'}</span>
          <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            {obra.barrio || 'Sin barrio asignado'}{obra._circuitoNombre ? ` · ${obra._circuitoNombre}` : ' · Sin circuito derivado'}
          </div>
          {aproximado && (
            <div style={{ fontSize: '12px', color: '#F57F17', fontWeight: 600 }}>
              barrio aproximado (a {obra.distancia_barrio_km != null ? obra.distancia_barrio_km.toFixed(1) : '?'} km)
            </div>
          )}
          {obra.prioridad && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Prioridad: {obra.prioridad}</div>}
          {(obra.fecha_inicio || obra.fecha_finalizacion || obra.fecha_disponibilidad_inaugurar) && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {obra.fecha_inicio && <div>Inicio: {formatearFecha(obra.fecha_inicio)}</div>}
              {obra.fecha_finalizacion && <div>Finalización: {formatearFecha(obra.fecha_finalizacion)}</div>}
              {obra.fecha_disponibilidad_inaugurar && <div>Disponible para inaugurar: {formatearFecha(obra.fecha_disponibilidad_inaugurar)}</div>}
            </div>
          )}
          {obra.observaciones && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{obra.observaciones}</div>}
        </div>

        <div>
          <h4 style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', fontWeight: 500 }}>Obras cercanas a esta obra</h4>
          {!tieneCoordenadas ? (
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin coordenada propia — no se puede calcular cercanía.</div>
          ) : cercanas.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin obras cercanas dentro de 1,5 km.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {cercanas.map((o, i) => {
                const colorOtra = COLOR_OBRA_ESTADO[o.estado] || COLOR_OBRA_DEFAULT;
                return (
                  <div
                    key={`${o.id}-${i}`}
                    onClick={() => onSelectObra(o)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{o.nombre}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '5px', backgroundColor: `${colorOtra}22`, color: colorOtra }}>{o.estado || 'Sin dato'}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{o.distanciaKm.toFixed(2)} km</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Diálogo unificado "Opciones de exportación" previo a exportar la ficha de un
// circuito: sección "Barrios" (qué barrios llevan su propia sección en el PDF,
// además del circuito que siempre se incluye) + sección "Encuestas" (qué rondas/vista
// de encuesta incluir — solo visible con 2+ rondas). Datos de barrios: mismos que la
// tabla "Barrios del circuito" de la solapa Territorio, ordenados por población (no
// por orden_importancia) y con el principal premarcado.
const DialogExportFicha = ({ datosCircuito, dialog, encuestaCircuito, onToggleBarrio, onSetModoEncuestas, onToggleRonda, onExportar, onCancelar }) => {
  if (!dialog) return null;
  const { barrios, seleccionados, principalNorm, modoEncuestas, rondasSeleccionadas } = dialog;
  const cantidadBarrios = seleccionados.size;
  const textoBoton = cantidadBarrios === 0
    ? 'Exportar circuito'
    : `Exportar circuito + ${cantidadBarrios} barrio${cantidadBarrios !== 1 ? 's' : ''}`;
  const rondas = encuestaCircuito?.rondas || [];
  const mostrarSeccionEncuestas = rondas.length >= 2;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={onCancelar}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', maxWidth: '480px', width: '100%', maxHeight: '84vh', overflowY: 'auto', margin: '20px', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>Opciones de exportación — Circuito {datosCircuito.CircuitoKey}</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '18px' }}>El circuito se incluye siempre en el PDF. Además, podés sumar la ficha completa de barrios específicos.</p>

        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Barrios</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Elegí qué barrios querés incluir con todo su detalle.</p>
          <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
            {barrios.length === 0 ? (
              <div style={{ padding: '14px', fontSize: '13px', color: 'var(--text-tertiary)' }}>Sin barrios registrados para este circuito.</div>
            ) : barrios.map((b, i) => {
              const esPrincipal = principalNorm != null && normalizarNombreBarrio(b.nombre) === principalNorm;
              return (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', fontSize: '13px', cursor: 'pointer', backgroundColor: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}>
                  <input type="checkbox" checked={seleccionados.has(b.nombre)} onChange={() => onToggleBarrio(b.nombre)} />
                  <span style={{ flex: 1, color: 'var(--text-primary)' }}>
                    {b.nombre}
                    {esPrincipal && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> (barrio principal)</span>}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{b.poblacion != null ? b.poblacion.toLocaleString() : '—'}</span>
                </label>
              );
            })}
          </div>
        </div>

        {mostrarSeccionEncuestas && (
          <div style={{ marginBottom: '8px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Encuestas</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>El circuito tiene {rondas.length} rondas. Elegí qué incluir en el PDF.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input type="radio" name="modoEncuestasExport" checked={modoEncuestas === 'ultima'} onChange={() => onSetModoEncuestas('ultima')} />
                Última ronda
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input type="radio" name="modoEncuestasExport" checked={modoEncuestas === 'elegir'} onChange={() => onSetModoEncuestas('elegir')} />
                Elegir rondas
              </label>
              {modoEncuestas === 'elegir' && (
                <div style={{ marginLeft: '24px', display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 0' }}>
                  {rondas.map((r, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={rondasSeleccionadas.has(i)} onChange={() => onToggleRonda(i)} />
                      {formatearFecha(r.fecha)}
                    </label>
                  ))}
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input type="radio" name="modoEncuestasExport" checked={modoEncuestas === 'comparativo'} onChange={() => onSetModoEncuestas('comparativo')} />
                Comparativo
              </label>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button onClick={onCancelar} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '13px', cursor: 'pointer', color: 'var(--text-secondary)' }}>Cancelar</button>
          <button onClick={onExportar} style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#1976D2', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>📄 {textoBoton}</button>
        </div>
      </div>
    </div>
  );
};

const PanelMiniCircuito = ({ datos, padronTotal, onVerFicha, cruceData, barriosGeoLookup, barrioSeleccionado, onSelectBarrio, encuestasData, obrasEnriquecidas, circuitosGeoJsonData }) => {
  if (!datos) {
    return <div style={{ padding: '16px 4px', fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>Hacé click en un circuito del mapa para ver su resumen.</div>;
  }
  const clave = `${datos.Mapkey} - ${datos.cirn_nom}`;
  const claveSel = barrioSeleccionado ? normalizarNombreBarrio(barrioSeleccionado) : null;
  const otrosBarrios = (cruceData?.circuito_to_barrios?.[clave] || [])
    .filter(b => normalizarNombreBarrio(b.barrio_normalizado) !== claveSel)
    .sort((a, b) => a.orden_importancia - b.orden_importancia);
  const obrasCercanasCount = obrasEnriquecidas ? obrasCercanasACircuito(datos.Mapkey, circuitosGeoJsonData, obrasEnriquecidas).length : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <ResumenCircuitoMini datos={datos} padronTotal={padronTotal} encuestasData={encuestasData} />
      <button onClick={() => onVerFicha()} style={{ padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#1976D2', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Ver ficha completa →</button>
      {obrasEnriquecidas && <BadgeObrasCercanas cantidad={obrasCercanasCount} onClick={() => onVerFicha('territorio', 'cercanas')} />}
      <ListaCruceColapsable
        titulo="Otros barrios en este circuito"
        items={otrosBarrios.map((b, i) => (
          <FilaCruce
            key={i}
            label={b.barrio}
            sublabel={`${b.pct_poblacion_en_circuito?.toFixed(1)}% de ese barrio, en este circuito`}
            onClick={() => {
              const key = normalizarNombreBarrio(b.barrio_normalizado);
              const feature = barriosGeoLookup[key];
              onSelectBarrio(feature ? feature.nombre_barrio : b.barrio_normalizado);
            }}
          />
        ))}
      />
    </div>
  );
};

const TIPO_VISITA_COLOR = {
  'TERRITORIAL': { bg: '#4CAF5022', text: '#2E7D32' },
  'INSTITUCIONAL': { bg: '#42A5F522', text: '#1565C0' },
  'NO HAY DATOS certeros': { bg: 'var(--bg-secondary)', text: 'var(--text-tertiary)' },
};

const PanelMiniBarrio = ({ nombreBarrio, barriosGeoLookup, todosLosDatos, datosCircuito, cruceData, onSelectCircuito, onVerFichaBarrio, onVerFichaCircuito, poblacionTotalPorBarrio }) => {
  if (!nombreBarrio) {
    return <div style={{ padding: '16px 4px', fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>Hacé click en un barrio del mapa para ver su info.</div>;
  }
  const key = normalizarNombreBarrio(nombreBarrio);
  const props = barriosGeoLookup[key];
  if (!props) {
    return <div style={{ padding: '16px 4px', fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>Sin datos para "{nombreBarrio}".</div>;
  }
  const poblacionTotalBarrio = poblacionTotalPorBarrio?.[key];
  const listaCircuitos = cruceData?.barrio_to_circuitos?.[nombreBarrio];
  const claveSel = datosCircuito ? `${datosCircuito.Mapkey} - ${datosCircuito.cirn_nom}` : null;
  const otrosCircuitos = (listaCircuitos || [])
    .filter(c => c.circuito !== claveSel)
    .sort((a, b) => a.orden_importancia - b.orden_importancia);
  const obras = props.obras || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{nombreBarrio}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{props.tipo_barrio === 'BarrioOficial' ? 'Barrio oficial' : 'Barrio no oficial'}</div>
      </div>
      <MetricCardMini label={<>Población total (barrio) <InfoTip texto="Población total censada de este barrio (fuente: IDECOR/censo), no vinculada al padrón electoral." /></>} value={poblacionTotalBarrio != null ? poblacionTotalBarrio.toLocaleString() : '—'} subtitle={props.pct_poblacion_en_circuito != null ? `${props.pct_poblacion_en_circuito.toFixed(1)}% de este barrio está en este circuito` : undefined} />

      {/* Línea compacta, no la card completa del circuito (padrón/participación/
          tendencia/cobertura de encuesta vivían acá antes) — este panel es del barrio;
          los datos completos del circuito quedan a un click en "Ver ficha completa". */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px' }}>
        {datosCircuito ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>Circuito {datosCircuito.CircuitoKey} {datosCircuito.cirn_nom}</span>
              <Badge categoria={datosCircuito.Categoria_v4} tipo="v4" />
            </div>
            <button onClick={() => onVerFichaCircuito(datosCircuito)} style={{ alignSelf: 'flex-start', padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '11px', color: '#1976D2', cursor: 'pointer', fontWeight: 500 }}>Ver ficha completa →</button>
          </>
        ) : props.circuito_principal ? (
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{props.circuito_principal}</span>
        ) : (
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin circuito asociado.</span>
        )}
      </div>

      <button onClick={onVerFichaBarrio} style={{ padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#1976D2', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Ver ficha completa →</button>

      <ListaCruceColapsable
        titulo="Otros circuitos en este barrio"
        items={otrosCircuitos.map((c, i) => (
          <FilaCruce
            key={i}
            label={c.circuito.split(' - ').slice(1).join(' - ')}
            sublabel={`≈${c.pct_poblacion_en_circuito?.toFixed(1)}% de este barrio, en este circuito`}
            onClick={() => {
              const mapkeyClicked = c.circuito.split(' - ')[0].trim();
              const circuitoRecord = todosLosDatos.find(d => d.Mapkey === mapkeyClicked);
              if (circuitoRecord) onSelectCircuito(circuitoRecord.CircuitoKey);
            }}
          />
        ))}
      />

      {props.cantidad_obras > 0 && (
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>Obras ({props.cantidad_obras})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {obras.map((o, i) => (
              <div key={i} style={{ padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{o.programa || '—'}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{o.descripcion || '—'}</div>
                <div style={{ fontSize: '11px', color: '#5C6BC0', fontWeight: 600, marginTop: '3px' }}>{o.estado || 'Sin dato'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const PanelLateral = ({ panelTab, setPanelTab, datosCircuito, padronTotal, onVerFicha, onVerFichaBarrio, onVerFichaCircuito, barrioSeleccionado, barriosGeoLookup, todosLosDatos, cruceData, onSelectBarrio, onSelectCircuito, encuestasData, obrasEnriquecidas, circuitosGeoJsonData, poblacionTotalPorBarrio }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
      <button onClick={() => setPanelTab('circuito')} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', backgroundColor: panelTab === 'circuito' ? '#1976D2' : 'var(--bg-secondary)', color: panelTab === 'circuito' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Circuito</button>
      <button onClick={() => setPanelTab('barrio')} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', backgroundColor: panelTab === 'barrio' ? '#1976D2' : 'var(--bg-secondary)', color: panelTab === 'barrio' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Barrio</button>
    </div>
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {panelTab === 'circuito'
        ? <PanelMiniCircuito datos={datosCircuito} padronTotal={padronTotal} onVerFicha={onVerFicha} cruceData={cruceData} barriosGeoLookup={barriosGeoLookup} barrioSeleccionado={barrioSeleccionado} onSelectBarrio={onSelectBarrio} encuestasData={encuestasData} obrasEnriquecidas={obrasEnriquecidas} circuitosGeoJsonData={circuitosGeoJsonData} />
        : <PanelMiniBarrio nombreBarrio={barrioSeleccionado} barriosGeoLookup={barriosGeoLookup} todosLosDatos={todosLosDatos} datosCircuito={datosCircuito} cruceData={cruceData} onSelectCircuito={onSelectCircuito} onVerFichaBarrio={onVerFichaBarrio} onVerFichaCircuito={onVerFichaCircuito} poblacionTotalPorBarrio={poblacionTotalPorBarrio} />}
    </div>
  </div>
);

// ============================================
// BARRA DE COBERTURA DE ENCUESTA
// ============================================
const PillFiltro = ({ activo, color, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      padding: '5px 11px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
      border: `1px solid ${activo ? color : 'var(--border)'}`,
      backgroundColor: activo ? `${color}18` : 'transparent',
      color: activo ? color : 'var(--text-tertiary)',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </button>
);

// Agrupa eventos consecutivos del mismo circuito por tipo+fecha exacta (comparación de
// string directa, ya alcanza porque esFechaValida ya validó "YYYY-MM-DD" al construirlos)
// en un solo registro representativo (el primero del grupo, por orden cronológico) con
// _grupo = [todos los eventos agrupados, incluido el representante]. El orden de
// aparición sigue siendo el de "eventos" (ya viene ordenado por fecha desde
// construirEventosPorCircuito) — Map preserva el orden de primera aparición de cada
// clave tipo+fecha.
function agruparEventosPorFechaYTipo(eventos) {
  const indice = new Map();
  const grupos = [];
  eventos.forEach(e => {
    const clave = `${e.tipo}|${e.fecha}`;
    if (indice.has(clave)) {
      grupos[indice.get(clave)]._grupo.push(e);
    } else {
      indice.set(clave, grupos.length);
      grupos.push({ ...e, _grupo: [e] });
    }
  });
  return grupos;
}

// Detalle de UN evento individual (usado tanto para una celda sin agrupar como para
// cada entrada del tooltip de una celda agrupada) — mismo markup que ya mostraba
// CeldaEvento antes de agrupar, solo extraído para no duplicarlo por cada item del grupo.
const DetalleEventoCobertura = ({ evento }) => {
  if (evento.tipo === 'medicion') {
    return <div style={{ color: 'var(--text-secondary)' }}>Ronda {evento.detalle.ronda} de {evento.detalle.totalRondas}</div>;
  }
  if (evento.tipo === 'visita') {
    return (
      <>
        <div style={{ color: 'var(--text-secondary)', marginBottom: '2px' }}>Tipo: {evento.detalle.tipo_visita}</div>
        <div style={{ color: 'var(--text-secondary)', marginBottom: '6px' }}>Contacto con vecinos: {evento.detalle.contacto_vecinos}</div>
        {evento.detalle.info && <div style={{ color: 'var(--text-primary)', marginBottom: '6px' }}>{evento.detalle.info}</div>}
        {evento.detalle.link && <a href={evento.detalle.link} target="_blank" rel="noopener noreferrer" style={{ color: '#1976D2' }}>Ver nota →</a>}
      </>
    );
  }
  return (
    <>
      <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginBottom: '2px' }}>
        {evento.detalle.nombre_anuncio}
        {evento.detalle.requiere_auditoria && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '5px', backgroundColor: '#FBBF2422', color: '#B45309' }}>⚠ Pendiente de revisión</span>}
      </div>
      <div style={{ color: 'var(--text-secondary)', marginBottom: '2px' }}>Barrio: {evento.detalle.barrio}</div>
      <div style={{ color: 'var(--text-secondary)', marginBottom: '2px' }}>Vigencia: {formatearFecha(evento.detalle.fecha_creacion)} → {formatearFecha(evento.detalle.fecha_finalizacion)}</div>
      <div style={{ color: 'var(--text-secondary)' }}>
        Alcance: {evento.detalle.alcance?.toLocaleString() ?? '—'} · Impresiones: {evento.detalle.impresiones?.toLocaleString() ?? '—'}
      </div>
      <div style={{ color: 'var(--text-secondary)' }}>
        Gasto: {evento.detalle.importe_gastado != null ? `$${evento.detalle.importe_gastado.toLocaleString()}` : '—'}
        {typeof evento.detalle.ctr === 'number' && ` · CTR: ${evento.detalle.ctr.toFixed(2)}%`}
      </div>
      {evento.detalle.observaciones && (
        <div style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', marginTop: '2px' }}>{evento.detalle.observaciones}</div>
      )}
    </>
  );
};

// evento acá es siempre el representante de un grupo (_grupo con 1+ eventos, ver
// agruparEventosPorFechaYTipo) — onClick usa ese representante (el primero del grupo)
// como referencia de navegación, según lo pedido para celdas agrupadas.
const CeldaEvento = ({ evento, onClick }) => {
  const [hover, setHover] = useState(false);
  if (!evento) return <td style={{ padding: '4px', borderBottom: '1px solid var(--border)' }} />;
  const tipo = TIPOS_EVENTO_COBERTURA[evento.tipo];
  const grupo = evento._grupo || [evento];
  const esGrupo = grupo.length > 1;
  // Solo relevante para pauta: un circuito puede tocar varios barrios, así que una celda
  // agrupada de pauta puede mezclar eventos de barrios distintos — se avisa en el tooltip
  // porque el click sigue navegando a uno solo (el del evento representante).
  const barriosDistintos = evento.tipo === 'pauta' ? new Set(grupo.map(e => e.detalle.barrio)) : null;
  const etiqueta = `${tipo.label} · ${formatearFecha(evento.fecha)}${esGrupo ? ` (${grupo.length})` : ''}`;
  return (
    <td
      style={{ padding: '4px', borderBottom: '1px solid var(--border)', position: 'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        onClick={onClick}
        style={{ backgroundColor: tipo.bg, color: tipo.color, borderRadius: '6px', padding: '5px 8px', fontSize: '11px', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : 'default' }}
      >
        {etiqueta}
      </div>
      {hover && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 30, backgroundColor: '#fff', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.18)', minWidth: '220px', maxWidth: '280px', fontSize: '12px', marginTop: '4px' }}>
          <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>{etiqueta}</div>
          {grupo.map((e, i) => (
            <div key={i} style={i > 0 ? { borderTop: '1px solid #eee', marginTop: '6px', paddingTop: '6px' } : undefined}>
              <DetalleEventoCobertura evento={e} />
            </div>
          ))}
          {barriosDistintos && barriosDistintos.size > 1 && (
            <div style={{ marginTop: '6px', fontSize: '10px', fontWeight: 600, color: '#B45309' }}>⚠ Incluye pautas de distintos barrios — el click abre "{evento.detalle.barrio}"</div>
          )}
        </div>
      )}
    </td>
  );
};

const TablaEventosCobertura = ({ datos, eventosPorCircuito, onClickVisita, onClickMedicion, onClickPauta }) => {
  const [tiposActivos, setTiposActivos] = useState({ medicion: true, visita: true, pauta: true });
  const [rangoSeleccionado, setRangoSeleccionado] = useState(null);
  const [orden, setOrden] = useState('id');
  const [busquedaCircuito, setBusquedaCircuito] = useState('');

  const toggleTipo = (tipo) => setTiposActivos(prev => ({ ...prev, [tipo]: !prev[tipo] }));

  const aniosDisponibles = useMemo(() => {
    const set = new Set();
    Object.values(eventosPorCircuito).forEach(lista => lista.forEach(e => set.add(e.fecha.slice(0, 4))));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [eventosPorCircuito]);

  const rangoEfectivo = rangoSeleccionado || aniosDisponibles[0] || 'todo';

  // Mismo criterio de normalización que normalizarNombreBarrio (mayúsculas + sin
  // tildes) ya usa en todo el proyecto para cruzar/comparar texto — se reaprovecha acá
  // para el buscador aunque el nombre del helper diga "Barrio", es genérico.
  const busquedaNormalizada = useMemo(() => normalizarNombreBarrio(busquedaCircuito), [busquedaCircuito]);

  const filas = useMemo(() => {
    return datos
      .filter(d => {
        if (!busquedaNormalizada) return true;
        return normalizarNombreBarrio(d.Mapkey).includes(busquedaNormalizada)
          || normalizarNombreBarrio(String(d.CircuitoKey ?? '')).includes(busquedaNormalizada)
          || normalizarNombreBarrio(d.cirn_nom).includes(busquedaNormalizada);
      })
      .map(d => {
        const eventosFiltrados = (eventosPorCircuito[d.Mapkey] || [])
          .filter(e => tiposActivos[e.tipo])
          .filter(e => rangoEfectivo === 'todo' || e.fecha.startsWith(rangoEfectivo));
        return { circuito: d, eventos: agruparEventosPorFechaYTipo(eventosFiltrados) };
      });
  }, [datos, eventosPorCircuito, tiposActivos, rangoEfectivo, busquedaNormalizada]);

  const filasOrdenadas = useMemo(() => {
    const copia = [...filas];
    if (orden === 'reciente') {
      copia.sort((a, b) => {
        const fa = a.eventos.length ? a.eventos[a.eventos.length - 1].fecha : '';
        const fb = b.eventos.length ? b.eventos[b.eventos.length - 1].fecha : '';
        return fb.localeCompare(fa);
      });
    } else {
      copia.sort((a, b) => compararMapkey(a.circuito.Mapkey, b.circuito.Mapkey));
    }
    return copia;
  }, [filas, orden]);

  // maxColumnas ya considera los eventos agrupados (eventos acá es el resultado de
  // agruparEventosPorFechaYTipo) — menos columnas que antes cuando hay agrupamientos.
  const maxColumnas = Math.max(1, ...filas.map(f => f.eventos.length));

  const manejarClickEvento = (evento, circuito) => {
    if (evento.tipo === 'visita') onClickVisita(circuito.CircuitoKey);
    else if (evento.tipo === 'medicion') onClickMedicion(circuito.CircuitoKey, evento.fecha);
    else if (evento.tipo === 'pauta') onClickPauta(evento.detalle.barrio);
  };

  return (
    <div style={{ padding: '14px' }}>
      <style>{`
        .fila-tabla-cobertura td { background-color: #fff; }
        .fila-tabla-cobertura:hover td { background-color: var(--bg-secondary); }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            value={busquedaCircuito}
            onChange={(e) => setBusquedaCircuito(e.target.value)}
            placeholder="Buscar circuito..."
            style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-primary)', backgroundColor: '#fff', width: '150px' }}
          />
          {Object.entries(TIPOS_EVENTO_COBERTURA).map(([key, tipo]) => (
            <PillFiltro key={key} activo={tiposActivos[key]} color={tipo.color} onClick={() => toggleTipo(key)}>
              {tiposActivos[key] ? '✓ ' : ''}{tipo.label}
            </PillFiltro>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          {aniosDisponibles.map(anio => (
            <PillFiltro key={anio} activo={rangoEfectivo === anio} color="#1976D2" onClick={() => setRangoSeleccionado(anio)}>
              {anio}
            </PillFiltro>
          ))}
          <PillFiltro activo={rangoEfectivo === 'todo'} color="#1976D2" onClick={() => setRangoSeleccionado('todo')}>
            Todo
          </PillFiltro>
          <select value={orden} onChange={(e) => setOrden(e.target.value)} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-secondary)', backgroundColor: '#fff' }}>
            <option value="id">Orden: ID circuito</option>
            <option value="reciente">Orden: más reciente</option>
          </select>
        </div>
      </div>

      {filasOrdenadas.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', fontSize: '13px', color: 'var(--text-tertiary)', border: '1px solid var(--border)', borderRadius: '10px' }}>
          Sin resultados
        </div>
      ) : (
        <div style={{ overflow: 'auto', maxHeight: '420px', border: '1px solid var(--border)', borderRadius: '10px' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '12px', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 3, backgroundColor: '#fff', borderBottom: '1px solid var(--border)', padding: '8px 10px', textAlign: 'left', minWidth: '190px' }}>Circuito</th>
                {Array.from({ length: maxColumnas }).map((_, i) => (
                  <th key={i} style={{ position: 'sticky', top: 0, zIndex: 2, backgroundColor: '#fff', borderBottom: '1px solid var(--border)', padding: '8px 10px', fontWeight: 500, color: 'var(--text-tertiary)', minWidth: '120px' }}>
                    Evento {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filasOrdenadas.map(({ circuito, eventos }) => (
                <tr key={circuito.Mapkey} className="fila-tabla-cobertura">
                  <td style={{ position: 'sticky', left: 0, zIndex: 1, borderBottom: '1px solid var(--border)', padding: '8px 10px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {circuito.Mapkey} · {circuito.cirn_nom}
                  </td>
                  {Array.from({ length: maxColumnas }).map((_, i) => (
                    <CeldaEvento key={i} evento={eventos[i]} onClick={eventos[i] ? () => manejarClickEvento(eventos[i], circuito) : undefined} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const BarraCobertura = ({ resumen, datos, eventosPorCircuito, onClickVisita, onClickMedicion, onClickPauta }) => {
  const [expandida, setExpandida] = useState(false);
  const contenedorRef = useRef(null);

  // Cierra el panel "Ver detalle" con click afuera o Escape. El ref envuelve TODO el
  // componente (barra + panel), así que clicks en el botón toggle, filtros, buscador,
  // celdas o el scroll interno de la tabla quedan "adentro" y no disparan el cierre —
  // solo un click fuera de este contenedor cuenta como "afuera". Los listeners se
  // agregan/quitan según `expandida` (no quedan colgados cuando el panel está cerrado).
  useEffect(() => {
    if (!expandida) return;
    const handleClickAfuera = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setExpandida(false);
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setExpandida(false);
    };
    document.addEventListener('mousedown', handleClickAfuera);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickAfuera);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [expandida]);

  if (!resumen) return null;
  const pct = resumen.total > 0 ? Math.round((resumen.encuestados / resumen.total) * 100) : 0;

  return (
    <div ref={contenedorRef} style={{ position: 'relative', backgroundColor: '#fff', borderBottom: '1px solid var(--border)' }}>
      <div style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Cobertura de encuesta</span>
        <div style={{ flex: '0 1 220px', minWidth: '140px', height: '8px', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#4CAF50', borderRadius: '4px' }} />
        </div>
        <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>{resumen.encuestados} / {resumen.total} circuitos encuestados ({pct}%)</span>
        {resumen.fechaMasReciente && (
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Última ronda: {formatearFecha(resumen.fechaMasReciente)}</span>
        )}
        <button onClick={() => setExpandida(!expandida)} style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          Ver detalle {expandida ? '▲' : '▼'}
        </button>
      </div>
      {expandida && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid var(--border)', borderTop: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 900 }}>
          <TablaEventosCobertura
            datos={datos}
            eventosPorCircuito={eventosPorCircuito}
            onClickVisita={(c) => { onClickVisita(c); setExpandida(false); }}
            onClickMedicion={(c, f) => { onClickMedicion(c, f); setExpandida(false); }}
            onClickPauta={(b) => { onClickPauta(b); setExpandida(false); }}
          />
        </div>
      )}
    </div>
  );
};

// ============================================
// FUNCIÓN EXPORTAR FICHA PDF MEJORADA
// ============================================
// Escuelas queda afuera del PDF hasta que subamos la capa corregida — el código de
// las 2 secciones (circuito y barrio) ya está escrito y funcionando más abajo, envuelto
// en este flag. Reactivar = cambiar esto a true, no hace falta tocar nada más.
const INCLUIR_ESCUELAS_PDF = false;

// Filas de tabla compartidas entre la parte de circuito y la de barrio (mismos datos,
// mismo formato en los dos lugares).
function filaVotoEscuelaPDF(e) {
  return `<tr><td>${e.nombre}</td><td class="text-right">${e.pct_peronismo != null ? e.pct_peronismo.toFixed(1) + '%' : '—'}</td><td class="text-right">${e.votos_validos != null ? e.votos_validos.toLocaleString() : '—'}</td></tr>`;
}
function htmlEscuelasPDF(escuelas, promedioCapitalPct) {
  if (!escuelas || escuelas.length === 0) return `<p style="color:#999;font-size:12px">Sin centros de votación identificados.</p>`;
  return `<table><thead><tr><th>Escuela</th><th class="text-right">% Peronismo</th><th class="text-right">Votos válidos</th></tr></thead><tbody>${escuelas.map(filaVotoEscuelaPDF).join('')}</tbody></table>${promedioCapitalPct != null ? `<p style="font-size:11px;color:#666;margin-top:6px">Promedio Capital: ${promedioCapitalPct}%</p>` : ''}`;
}
function htmlVisitasPDF(visitas) {
  if (!visitas || visitas.length === 0) return `<p style="color:#999;font-size:12px">Sin visitas registradas.</p>`;
  return `<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Contacto vecinos</th><th>Detalle</th></tr></thead><tbody>${visitas.map(v => `<tr><td>${formatearFecha(v.fecha)}</td><td>${v.tipo_visita || '—'}</td><td>${v.contacto_vecinos || 'NO'}</td><td>${v.info || '—'}</td></tr>`).join('')}</tbody></table>`;
}
// Barrio principal hereda del circuito solo los eventos que le faltan (el circuito
// suma TODOS los barrios con orden_importancia:1, no solo este). Dedup por fecha+info.
function unificarVisitasPDF(visitasBarrio, visitasCircuito) {
  // Dedup sobre el conjunto combinado (no solo barrio-vs-extra): el circuito puede
  // traer el mismo evento repetido si dos barrios con orden_importancia:1 lo cargaron
  // cada uno por su cuenta (pasa con visitas que abarcan varios barrios a la vez).
  const claves = new Set();
  const resultado = [];
  [...(visitasBarrio || []), ...(visitasCircuito || [])].forEach(v => {
    const clave = `${v.fecha}|${v.info || ''}`;
    if (!claves.has(clave)) {
      claves.add(clave);
      resultado.push(v);
    }
  });
  return resultado.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
function htmlPautaPDF(pautas) {
  if (!pautas || pautas.length === 0) return `<p style="color:#999;font-size:12px">Sin pauta registrada.</p>`;
  return `<table><thead><tr><th>Anuncio</th><th>Vigencia</th><th class="text-right">Alcance</th><th class="text-right">Impresiones</th><th class="text-right">Gasto</th><th class="text-right">CTR</th><th class="text-right">Frecuencia</th><th class="text-right">CPM</th></tr></thead><tbody>${pautas.map(p => `<tr><td>${p.nombre_anuncio || '—'}${p.observaciones ? `<br><span style="font-size:10px;color:#999;font-style:italic">${p.observaciones}</span>` : ''}</td><td style="white-space:nowrap">${formatearFecha(p.fecha_creacion)} → ${formatearFecha(p.fecha_finalizacion)}</td><td class="text-right">${p.alcance != null ? p.alcance.toLocaleString() : '—'}</td><td class="text-right">${p.impresiones != null ? p.impresiones.toLocaleString() : '—'}</td><td class="text-right">${p.importe_gastado != null ? '$' + p.importe_gastado.toLocaleString() : '—'}</td><td class="text-right">${typeof p.ctr === 'number' ? p.ctr.toFixed(2) + '%' : '—'}</td><td class="text-right">${typeof p.frecuencia === 'number' ? p.frecuencia.toFixed(2) : '—'}</td><td class="text-right">${typeof p.cpm === 'number' ? p.cpm.toFixed(2) : '—'}</td></tr>`).join('')}</tbody></table>`;
}
function htmlObrasPDF(obras) {
  if (!obras || obras.length === 0) return `<p style="color:#999;font-size:12px">Sin obras identificadas.</p>`;
  return `<table><thead><tr><th>Nombre</th><th>Tipo</th><th>Estado</th><th>Barrio / Circuito</th></tr></thead><tbody>${obras.map(o => {
    const color = COLOR_OBRA_ESTADO[o.estado] || COLOR_OBRA_DEFAULT;
    return `<tr><td>${o.nombre}</td><td>${o.tipo_obra || '—'}</td><td><span class="badge" style="background:${color}22;color:${color}">${o.estado || 'Sin dato'}</span></td><td>${o.barrio || 'Sin barrio asignado'}${o._circuitoNombre ? ' · ' + o._circuitoNombre : ''}</td></tr>`;
  }).join('')}</tbody></table>`;
}

// Mismo bloque "Contexto político" que se ve en la ficha de barrio (pantalla): categoría
// + %G23 vs Capital + top 3 problemas de la última ronda si el circuito tiene encuesta.
// Deja explícito que son datos del circuito, no del barrio.
function htmlContextoPoliticoPDF(circuito, encuestasData) {
  if (!circuito) {
    return `<div class="section"><h3>Contexto político</h3><p style="color:#999;font-size:12px">Sin circuito asociado.</p></div>`;
  }
  const encuesta = buscarEncuestaCircuito(encuestasData, circuito.CircuitoKey);
  let topProblemas = [];
  if (encuesta?.rondas?.length > 0) {
    const ultima = encuesta.rondas[encuesta.rondas.length - 1];
    const problemas = ultima.preguntas?.['Problemas principales'] || {};
    topProblemas = Object.entries(problemas).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }
  const topProblemasHtml = topProblemas.length > 0
    ? `<div style="margin-top:10px"><div style="font-size:11px;color:#666;margin-bottom:4px">Principales problemas (última ronda)</div><table><tbody>${topProblemas.map(([nombre, pct]) => `<tr><td>${nombre}</td><td class="text-right"><strong>${pct.toFixed(1)}%</strong></td></tr>`).join('')}</tbody></table></div>`
    : `<p style="color:#999;font-size:12px;margin-top:6px">Sin encuestas registradas para este circuito.</p>`;
  return `
<div class="section">
  <h3>Contexto político — Circuito ${circuito.CircuitoKey} ${circuito.cirn_nom}</h3>
  <p style="font-size:10px;color:#999;margin-bottom:8px">Datos del circuito, no del barrio.</p>
  <div style="display:flex;align-items:center;gap:10px">
    <span class="badge" style="background:${COLORES_CATEGORIA[circuito.Categoria_v4]?.bg}22;color:${COLORES_CATEGORIA[circuito.Categoria_v4]?.text}">${COLORES_CATEGORIA[circuito.Categoria_v4]?.label || circuito.Categoria_v4}</span>
    <span style="font-size:12px">Gob. 2023: <strong class="${circuito.Share_G23 >= 0.5 ? 'green' : 'red'}">${(circuito.Share_G23 * 100).toFixed(1)}%</strong>${circuito.ShareCap_G23 != null ? ` <span style="font-size:10px;color:#999">(vs Capital ${(circuito.ShareCap_G23 * 100).toFixed(1)}%)</span>` : ''}</span>
  </div>
  ${topProblemasHtml}
</div>`;
}

// Mismo criterio "valores cero atenuados" que el resto de la tabla "Barrios del
// circuito" — y mismo badge de estado de Pauta que BadgeEstadoPauta en pantalla.
function pdfCeldaCantidad(n) {
  return n > 0 ? `<strong>${n}</strong>` : `<span style="color:#ccc">—</span>`;
}
function pdfBadgeEstadoPauta(estado) {
  if (estado === 'activa') return `<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:6px;background:#2E7D3222;color:#2E7D32;white-space:nowrap">Activa</span>`;
  if (estado === 'finalizada') return `<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:6px;background:#9E9E9E22;color:#757575;white-space:nowrap">Finalizada</span>`;
  return `<span style="color:#ccc">—</span>`;
}

// --- Encuestas en el PDF: mismo criterio de agrupación que ResumenEncuesta en pantalla
// (Aprobación / Calificación de gestión / Reelección), extendido con las preguntas de
// ronda que la ficha todavía no mostraba. Sin librerías de charts: barras y donuts son
// divs/SVG propios, igual que el resto de la ficha. ---
function deltaEncuestaPDF(rondas, pregunta, categoria) {
  const serie = rondas.map(r => r.preguntas?.[pregunta]?.[categoria]).filter(v => v != null);
  if (serie.length < 2) return null;
  return serie[serie.length - 1] - serie[0];
}
// "Mejoras en X" no tiene Positiva/Negativa sino Si,mucho/Si,algo/No — el delta se toma
// sobre el total que percibe mejora (mucho + algo).
function deltaMejoraPDF(rondas, pregunta) {
  const serie = rondas
    .map(r => r.preguntas?.[pregunta])
    .filter(d => d != null)
    .map(d => (d['Si, mucho'] || 0) + (d['Si, algo'] || 0));
  if (serie.length < 2) return null;
  return serie[serie.length - 1] - serie[0];
}
function badgeDeltaPDF(delta) {
  if (delta == null) return '';
  const cls = delta > 0 ? 'green' : delta < 0 ? 'red' : '';
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
  const signo = delta > 0 ? '+' : '';
  return `<div class="metric-sub ${cls}" style="font-weight:600">${arrow} ${signo}${delta.toFixed(1)} pp vs. 1ª ronda</div>`;
}
function htmlMetricPDF(label, valor, delta) {
  return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value" style="font-size:18px">${valor}</div>${badgeDeltaPDF(delta)}</div>`;
}
// Mismo ícono (círculo relleno + glifo blanco) y mismo criterio de color por nivel
// que IconoTendencia en pantalla (solapa Comparativas) — no es una versión distinta,
// es el mismo dibujo, solo con colores fijos en vez de variables CSS.
function htmlIconoTendenciaPDF(nivel) {
  const color = { positivo: '#2E7D32', neutro: '#F57F17', negativo: '#C62828' }[nivel] || '#9E9E9E';
  const glifo = nivel === 'positivo'
    ? '<path d="M4.5 8.3L6.8 10.8L11.5 5.3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />'
    : nivel === 'negativo'
    ? '<path d="M5 5L11 11M11 5L5 11" stroke="#fff" stroke-width="1.6" stroke-linecap="round" />'
    : '<line x1="4.5" y1="8" x2="11.5" y2="8" stroke="#fff" stroke-width="1.8" stroke-linecap="round" />';
  return `<svg width="16" height="16" viewBox="0 0 16 16" style="flex-shrink:0"><circle cx="8" cy="8" r="8" fill="${color}" />${glifo}</svg>`;
}
// Bloque "Tendencias del circuito" de la solapa Comparativas — mismo layout que en
// pantalla (SolapaComparativas): 3 badges (Diagnóstico / Evolución Llaryora / Efecto
// legislativo) + renglón de insight con ícono debajo. Antes no se exportaba al PDF.
function htmlTendenciasCircuitoPDF(datos) {
  const nivel = datos.Victorias_Total >= 3 ? 'positivo' : datos.Victorias_Total >= 2 ? 'neutro' : 'negativo';
  const textoInsight = datos.Victorias_Total >= 3 ? 'Circuito sólido para el oficialismo' : datos.Victorias_Total >= 2 ? 'Circuito con potencial de recuperación' : 'Circuito difícil, requiere estrategia específica';
  const catV4 = COLORES_CATEGORIA[datos.Categoria_v4] || { bg: '#9E9E9E', text: '#424242', label: datos.Categoria_v4 || '—' };
  const catML = COLORES_ML[datos.Categoria_ML] || { bg: '#9E9E9E', text: '#424242', label: datos.Categoria_ML || '—' };
  return `
<div class="section" style="background:${datos.Victorias_Total >= 2 ? '#4CAF5012' : '#EF535012'};border:1px solid ${datos.Victorias_Total >= 2 ? '#4CAF5040' : '#EF535040'};border-radius:12px;padding:16px">
  <h3>Tendencias del circuito</h3>
  <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">
    <div style="padding:10px 14px;background:#fff;border-radius:10px"><div style="font-size:12px;color:#666;margin-bottom:6px">Diagnóstico</div><span class="badge" style="background:${catV4.bg}22;color:${catV4.text}">${catV4.label}</span></div>
    <div style="padding:10px 14px;background:#fff;border-radius:10px"><div style="font-size:12px;color:#666;margin-bottom:6px">Evolución Llaryora</div><span class="badge" style="background:${catML.bg}22;color:${catML.text}">${catML.label}</span></div>
    <div style="padding:10px 14px;background:#fff;border-radius:10px"><div style="font-size:12px;color:#666;margin-bottom:6px">Efecto legislativo</div><span style="font-size:13px;font-weight:600" class="${datos.Sch_Mejoro ? 'green' : 'red'}">${datos.Sch_Mejoro ? 'MEJORÓ' : 'EMPEORÓ'} (${formatPP(datos.Sch_Efecto)})</span></div>
  </div>
  <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#1a1a1a;font-weight:500">${htmlIconoTendenciaPDF(nivel)}<span>${textoInsight}</span></div>
  <div style="font-size:13px;color:#666;margin-top:10px">Ganó ${datos.Victorias_Total}/4 elecciones. ${datos.Crecio_vs_Capital ? 'Creció más que Capital con Llaryora.' : 'Creció menos que Capital con Llaryora.'} ${datos.Sch_Mejoro ? 'Mejoró en legislativas.' : 'Empeoró en legislativas.'}</div>
</div>`;
}
// Mismo gauge semáforo (SVG a mano) y mismo criterio de color por valor que
// GaugeAprobacion en pantalla (solapa Encuestas) — no es una versión distinta, es el
// mismo dibujo, solo con colores fijos en vez de variables CSS (el HTML del PDF no
// hereda las custom properties del tablero).
function htmlGaugeAprobacionPDF(label, data, delta) {
  if (!data || data.Apruebo == null) {
    return `<div class="metric"><div class="metric-label">Aprobación ${label}</div><div class="metric-value" style="font-size:12px;color:#999">Sin dato</div></div>`;
  }
  const pct = data.Apruebo;
  const color = pct >= 40 ? '#0DCE1D' : pct >= 25 ? '#D9B300' : '#D64550';
  const r = 40, mediaCircunferencia = Math.PI * r;
  const progreso = (Math.min(pct, 100) / 100) * mediaCircunferencia;
  return `<div class="metric">
    <svg viewBox="0 0 100 60" style="width:100%;max-width:140px">
      <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#e0e0e0" stroke-width="10" stroke-linecap="round" />
      <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"
        stroke-dasharray="${mediaCircunferencia} ${mediaCircunferencia}" stroke-dashoffset="${mediaCircunferencia - progreso}" />
      <text x="50" y="45" text-anchor="middle" font-size="18" font-weight="700" fill="#1a1a1a">${pct}%</text>
    </svg>
    <div style="font-size:11px;color:#666;margin-top:2px">Aprobación ${label}</div>
    ${badgeDeltaPDF(delta)}
  </div>`;
}
function htmlBarraCategoriasPDF(label, data, delta) {
  if (!data) return `<div style="margin-bottom:10px"><div style="font-size:11px;color:#1a1a1a;margin-bottom:4px">${label}</div><p style="font-size:11px;color:#999">Sin dato.</p></div>`;
  const deltaHtml = delta != null ? `<span class="${delta > 0 ? 'green' : delta < 0 ? 'red' : ''}" style="font-weight:600">${delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} ${delta > 0 ? '+' : ''}${delta.toFixed(1)} pp</span>` : '';
  return `<div style="margin-bottom:10px">
    <div style="font-size:11px;color:#1a1a1a;margin-bottom:4px;display:flex;justify-content:space-between"><span>${label}</span>${deltaHtml}</div>
    ${htmlBarraSegmentosPDF(data, { height: 18 })}
  </div>`;
}
function htmlMejoraPDF(label, data, delta) {
  if (!data) return `<div style="margin-bottom:10px"><div style="font-size:11px;color:#1a1a1a;margin-bottom:4px">${label}</div><p style="font-size:11px;color:#999">Sin dato.</p></div>`;
  const segmentos = [
    ['Si, mucho', '#22C55E'], ['Si, algo', '#86EFAC'], ['No', '#EF4444'],
  ].map(([cat, color]) => {
    const v = data[cat];
    if (!v || v <= 0) return '';
    const texto = v > 10 ? `<span style="font-size:9px;color:#fff;font-weight:600">${v}%</span>` : '';
    return `<div style="width:${v}%;background:${color};display:flex;align-items:center;justify-content:center">${texto}</div>`;
  }).join('');
  const deltaHtml = delta != null ? `<span class="${delta > 0 ? 'green' : delta < 0 ? 'red' : ''}" style="font-weight:600">${delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} ${delta > 0 ? '+' : ''}${delta.toFixed(1)} pp</span>` : '';
  return `<div style="margin-bottom:10px">
    <div style="font-size:11px;color:#1a1a1a;margin-bottom:4px;display:flex;justify-content:space-between"><span>${label}</span>${deltaHtml}</div>
    <div style="display:flex;height:18px;border-radius:5px;overflow:hidden;background:#eee">${segmentos}</div>
  </div>`;
}
// Cuerpo de UNA ronda (Aprobación/Gestión/Reelección/Funcionamiento/Alerta/Mejoras),
// extraído de lo que antes era el cuerpo fijo de htmlEncuestasPDF, para poder
// reusarlo tanto con delta (modo "Última ronda", comparando contra la 1ª) como sin
// delta (modo "Elegir rondas", cada ronda mostrada de forma independiente).
function htmlResumenRondaPDF(preguntas, delta, deltaMejora) {
  const aprobacion = ['Intendente', 'Gobernador', 'Presidente'].map(f => {
    const d = preguntas[`Aprobación ${f}`];
    return htmlGaugeAprobacionPDF(f, d, delta(`Aprobación ${f}`, 'Apruebo'));
  }).join('');

  const gestion = ['Intendente', 'Gobernador', 'Presidente'].map(f =>
    htmlBarraCategoriasPDF(`Calificación de gestión: ${f}`, preguntas[`Gestión del ${f}`], delta(`Gestión del ${f}`, 'Positiva'))
  ).join('');

  const reeleccion = [['Llaryora (Gobernador)', 'Reelección Llaryora'], ['Milei (Presidente)', 'Reelección Milei']].map(([nom, key]) => {
    const d = preguntas[key];
    return htmlMetricPDF(`Reelección ${nom}`, d?.Si != null ? d.Si.toFixed(1) + '%' : '—', delta(key, 'Si'));
  }).join('');

  const funcionamiento = [['Centro Vecinal', 'Funcionamiento Centro Vecinal'], ['CPC', 'Funcionamiento CPC']].map(([nom, key]) =>
    htmlBarraCategoriasPDF(`Funcionamiento ${nom}`, preguntas[key], delta(key, 'Positiva'))
  ).join('');

  const alertaExistencia = preguntas['Cordobeses en Alerta (existencia)'];
  const alertaCalif = preguntas['Calificación Cordobeses en Alerta'];
  const cordobesesAlerta = `
    <div class="metrics" style="grid-template-columns:1fr;margin-bottom:10px">${htmlMetricPDF('Cordobeses en Alerta (conoce el programa)', alertaExistencia?.Si != null ? alertaExistencia.Si.toFixed(1) + '%' : '—', delta('Cordobeses en Alerta (existencia)', 'Si'))}</div>
    ${htmlBarraCategoriasPDF('Calificación Cordobeses en Alerta', alertaCalif, delta('Calificación Cordobeses en Alerta', 'Positiva'))}`;

  const mejoras = [
    ['Bacheos', 'Mejoras en bacheos'],
    ['Alumbrado público', 'Mejoras en alumbrado público'],
    ['Espacios públicos', 'Mejoras en espacios públicos'],
    ['Ordenamiento naranjitas y limpiavidrios', 'Mejoras en ordenamiento naranjitas y limpiavidrios'],
  ].map(([nom, key]) => htmlMejoraPDF(nom, preguntas[key], deltaMejora(key))).join('');

  const problemas = preguntas['Problemas principales'] || {};
  const topProblemas = Object.entries(problemas).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return `
  ${topProblemas.length > 0 ? `<div style="margin-bottom:16px"><table><thead><tr><th>Principales problemas</th><th class="text-right">%</th></tr></thead><tbody>${topProblemas.map(([nombre, pct]) => `<tr><td>${nombre}</td><td class="text-right"><strong>${pct.toFixed(1)}%</strong></td></tr>`).join('')}</tbody></table></div>` : ''}

  <div class="mini-title">Aprobación de gestión</div>
  <div class="metrics" style="grid-template-columns:repeat(3,1fr);margin-bottom:10px">${aprobacion}</div>

  <div class="mini-title">Calificación de gestión</div>
  ${gestion}

  <div class="mini-title">Reelección</div>
  <div class="metrics" style="grid-template-columns:repeat(2,1fr);margin-bottom:10px">${reeleccion}</div>

  <div class="mini-title">Funcionamiento de instituciones locales</div>
  ${funcionamiento}

  <div class="mini-title">Cordobeses en Alerta</div>
  ${cordobesesAlerta}

  <div class="mini-title">Mejoras percibidas (ronda actual)</div>
  ${mejoras}`;
}

// Modo "Última ronda" del diálogo de export — comportamiento sin cambios respecto
// al que existía antes de las 3 opciones de export: última ronda, con delta vs. la
// 1ª si el circuito tiene comparativo.
function htmlEncuestasPDF(encuestaCircuito) {
  if (!encuestaCircuito || !(encuestaCircuito.cantidad_rondas > 0)) {
    return `<div class="section"><h3>Encuestas</h3><p style="color:#999;font-size:12px">Sin encuestas registradas para este circuito.</p></div>`;
  }
  const rondas = encuestaCircuito.rondas;
  const ultima = rondas[rondas.length - 1];
  const preguntas = ultima.preguntas || {};
  const comparativo = !!encuestaCircuito.tiene_comparativo && rondas.length >= 2;
  const delta = (pregunta, categoria) => comparativo ? deltaEncuestaPDF(rondas, pregunta, categoria) : null;
  const deltaMejora = (pregunta) => comparativo ? deltaMejoraPDF(rondas, pregunta) : null;

  return `
<div class="section">
  <h3>Encuestas</h3>
  <div class="metrics" style="grid-template-columns:repeat(2,1fr)">
    <div class="metric"><div class="metric-label">Rondas</div><div class="metric-value">${encuestaCircuito.cantidad_rondas}</div><div class="metric-sub">última: ${formatearFechaRonda(ultima.fecha, ultima.casos)}</div></div>
    <div class="metric"><div class="metric-label">Cobertura</div><div class="metric-value" style="font-size:14px">${comparativo ? 'Con comparativo' : 'Ronda única'}</div></div>
  </div>
  ${htmlResumenRondaPDF(preguntas, delta, deltaMejora)}
</div>`;
}

// Modo "Elegir rondas" — una sección de encuesta completa por cada ronda elegida
// (en el orden en que vienen los índices, ya ordenados cronológicamente por el
// diálogo), cada una con su fecha como subtítulo y sin deltas (cada ronda se
// muestra de forma independiente, no hay "ronda base" con la que compararlas).
function htmlEncuestasElegirRondasPDF(encuestaCircuito, indicesRondas) {
  const rondas = encuestaCircuito.rondas;
  const seleccion = (indicesRondas || []).filter(i => rondas[i]);
  if (seleccion.length === 0) {
    return `<div class="section"><h3>Encuestas</h3><p style="color:#999;font-size:12px">Sin rondas seleccionadas.</p></div>`;
  }
  const sinDelta = () => null;
  return seleccion.map(i => {
    const ronda = rondas[i];
    return `
<div class="section">
  <h3>Encuestas</h3>
  <div class="mini-title" style="margin-top:0">${formatearFechaRonda(ronda.fecha, ronda.casos)}</div>
  ${htmlResumenRondaPDF(ronda.preguntas || {}, sinDelta, sinDelta)}
</div>`;
  }).join('');
}

// Modo "Comparativo" — misma vista (resumen + cards + barras apiladas + tabla) que
// el bloque A en pantalla, generada por la misma función htmlComparativoEncuestaBody.
function htmlEncuestasComparativoPDF(encuestaCircuito, umbral) {
  if (!encuestaCircuito || encuestaCircuito.rondas.length < 2) {
    return `<div class="section"><h3>Encuestas — Comparativo</h3><p style="color:#999;font-size:12px">Sin datos suficientes para comparar.</p></div>`;
  }
  return `<div class="section"><h3>Encuestas — Comparativo</h3>${htmlComparativoEncuestaBody(encuestaCircuito, umbral)}</div>`;
}

// Sección "barrio" del PDF (población, contexto político, barrios cercanos, visitas,
// pauta, obras, escuelas) — compartida entre el PDF de circuito (embebida como "BARRIO
// PRINCIPAL") y la exportación standalone de un barrio cualquiera (generarFichaBarrioPDF).
// circuitoContexto: si se pasa ya resuelto (caso circuito: el barrio principal
// pertenece por definición a ESE circuito, no hace falta re-derivarlo), se usa tal
// cual; si no (caso standalone, puede ser cualquier barrio), se resuelve acá con
// resolverCircuitoPrincipalDeBarrio (necesita cruceData/barriosGeoLookup/todosLosDatos).
function generarSeccionBarrioPDF({
  nombreBarrio, props, tituloParte, incluirEncabezadoParte = true, circuitoContexto,
  cruceData, barriosGeoLookup, todosLosDatos, encuestasData,
  recorridosLookup, pautasBarriosData, obrasEnriquecidas, barriosGeoData,
  votosEscuelasBarrioLookup, votosEscuelasBarrioData, poblacionTotalPorBarrio, eventosPorCircuito,
}) {
  if (!nombreBarrio || !props) {
    return incluirEncabezadoParte ? `
<div class="part-header page-break">
  <h1>${tituloParte}</h1>
  <h2 style="color:#999">Sin barrio principal identificado para este circuito.</h2>
</div>` : '';
  }

  const key = normalizarNombreBarrio(nombreBarrio);
  const poblacionTotalBarrio = poblacionTotalPorBarrio?.[key];
  const circuito = circuitoContexto || resolverCircuitoPrincipalDeBarrio(nombreBarrio, cruceData, barriosGeoLookup, todosLosDatos);
  const eventosCircuito = circuito ? (eventosPorCircuito?.[circuito.Mapkey] || []) : [];
  const visitasCircuito = eventosCircuito.filter(e => e.tipo === 'visita').map(e => e.detalle);

  // Visitas: partimos de las del barrio (fuente más precisa) y sumamos las del circuito
  // (que incluye TODOS los barrios con orden_importancia:1, no solo este) que no estén
  // ya cubiertas, dedupeando por fecha+detalle.
  const visitasBarrio = unificarVisitasPDF(recorridosLookup?.[key]?.visitas || [], visitasCircuito);
  const claveOriginalPauta = pautasBarriosData ? Object.keys(pautasBarriosData).find(k => normalizarNombreBarrio(k) === key) : null;
  const pautaBarrio = claveOriginalPauta ? (pautasBarriosData[claveOriginalPauta].pautas || []) : [];
  const obrasBarrio = (obrasEnriquecidas || []).filter(o => normalizarNombreBarrio(o.barrio) === key);
  const cercanosBarrio = barriosCercanos(nombreBarrio, barriosGeoData);
  const votosEscuelasBarrio = votosEscuelasBarrioLookup?.[key] || null;

  const encabezadoHtml = incluirEncabezadoParte ? `
<div class="part-header page-break">
  <h1>${tituloParte}</h1>
  <h2>${nombreBarrio}</h2>
</div>` : '';

  return `
${encabezadoHtml}
<div class="metrics">
  <div class="metric"><div class="metric-label">Población total (barrio) <span title="Población total censada de este barrio (fuente: IDECOR/censo), no vinculada al padrón electoral." style="display:inline-flex;align-items:center;justify-content:center;width:12px;height:12px;border-radius:50%;border:1px solid #999;color:#999;font-size:9px;cursor:help;">i</span></div><div class="metric-value">${poblacionTotalBarrio != null ? poblacionTotalBarrio.toLocaleString() : '—'}</div></div>
  <div class="metric"><div class="metric-label">Tipo</div><div class="metric-value" style="font-size:16px">${props?.tipo_barrio === 'BarrioOficial' ? 'Oficial' : 'No oficial'}</div></div>
</div>
${htmlContextoPoliticoPDF(circuito, encuestasData)}
<div class="section">
  <h3>Barrios cercanos (≤1,5 km)</h3>
  ${cercanosBarrio.length === 0 ? `<p style="color:#999;font-size:12px">Sin barrios cercanos dentro de 1,5 km.</p>` : `<table><thead><tr><th>Barrio</th><th class="text-right">Población</th><th class="text-right">Distancia</th></tr></thead><tbody>${cercanosBarrio.map(b => `<tr><td>${b.nombre}</td><td class="text-right">${b.poblacion != null ? b.poblacion.toLocaleString() : '—'}</td><td class="text-right">${b.distanciaKm.toFixed(2)} km</td></tr>`).join('')}</tbody></table>`}
</div>
<div class="subheader">Cobertura territorial del barrio</div>
<div class="section"><h3>Visitas del Gobernador</h3>${htmlVisitasPDF(visitasBarrio)}</div>
<div class="section"><h3>Pauta publicitaria</h3>${htmlPautaPDF(pautaBarrio)}</div>
<div class="section"><h3>Obras (en el barrio)</h3>${htmlObrasPDF(obrasBarrio)}</div>
${INCLUIR_ESCUELAS_PDF ? `<div class="section"><h3>Votos por escuela</h3>${htmlEscuelasPDF(votosEscuelasBarrio?.escuelas, votosEscuelasBarrioData?.promedio_capital_pct)}</div>` : ''}
`;
}

// CSS compartido entre generarFichaPDF (circuito) y generarFichaBarrioPDF (barrio
// standalone) — mismo documento, mismas clases, para que ambos exports se vean
// consistentes con el resto de la ficha.
function estilosFichaPDF() {
  return `
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:30px;max-width:850px;margin:0 auto;color:#1a1a1a;font-size:13px}
.header{border-bottom:3px solid #1976D2;padding-bottom:16px;margin-bottom:24px}
.header h1{font-size:24px;font-weight:700}
.header h2{font-size:16px;font-weight:400;color:#666;margin-top:6px}
.badges{margin-top:12px;display:flex;gap:10px}
.badge{display:inline-block;padding:4px 12px;border-radius:5px;font-size:11px;font-weight:600}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.metric{padding:14px;background:#f5f5f5;border-radius:6px;text-align:center}
.metric-label{font-size:11px;color:#666;margin-bottom:4px}
.metric-value{font-size:22px;font-weight:700}
.metric-sub{font-size:10px;color:#999;margin-top:2px}
.section{margin-bottom:24px}
.section h3{font-size:14px;font-weight:600;margin-bottom:10px;color:#1976D2}
table{width:100%;border-collapse:collapse;font-size:12px}
th{padding:8px;text-align:left;background:#f5f5f5;font-weight:500}
td{padding:8px;border-top:1px solid #e0e0e0}
.text-right{text-align:right}
.text-center{text-align:center}
.green{color:#2E7D32}
.red{color:#C62828}
.chart-container{background:#f9f9f9;padding:16px;border-radius:8px;margin-bottom:20px}
.comparativas{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px}
.comp-box{padding:14px;border:1px solid #e0e0e0;border-radius:6px;text-align:center}
.comp-box h4{font-size:11px;color:#666;margin-bottom:8px}
.comp-value{font-size:20px;font-weight:700}
.partidos-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.partido-section{background:#f5f5f5;padding:12px;border-radius:6px}
.partido-section h4{font-size:12px;font-weight:600;margin-bottom:8px}
.partido-item{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #e0e0e0}
.partido-item:last-child{border:none}
.part-header{background:#1a1a1a;color:#fff;padding:20px 24px;border-radius:8px;margin-bottom:20px}
.part-header h1{font-size:20px;font-weight:700;letter-spacing:0.5px}
.part-header h2{font-size:15px;font-weight:400;color:#ccc;margin-top:4px}
.subheader{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#999;margin:28px 0 12px;border-bottom:1px solid #e0e0e0;padding-bottom:6px}
.mini-title{font-size:12px;font-weight:600;color:#444;margin:14px 0 8px}
.page-break{page-break-before:always}
.footer{margin-top:30px;padding-top:16px;border-top:1px solid #e0e0e0;font-size:10px;color:#999;text-align:center}
@media print{body{padding:15px} .page-break{page-break-before:always}}
`;
}

// Abre la ventana de impresión con el HTML de la ficha ya armado — mismo mecanismo
// (window.open + print) para el export de circuito y el de barrio individual.
function abrirVentanaImpresion(html) {
  const ventana = window.open('', '_blank');
  ventana.document.write(html);
  ventana.document.close();
  setTimeout(() => ventana.print(), 500);
}

// Ficha standalone de UN barrio (cualquiera, no solo el principal de un circuito) —
// mismas secciones de barrio que ya usa generarFichaPDF embebidas, reutilizadas vía
// generarSeccionBarrioPDF, sin la parte de circuito completa.
const generarFichaBarrioPDF = ({
  nombreBarrio, props, cruceData, barriosGeoLookup, todosLosDatos, encuestasData,
  recorridosLookup, pautasBarriosData, obrasEnriquecidas, barriosGeoData,
  votosEscuelasBarrioLookup, votosEscuelasBarrioData, poblacionTotalPorBarrio, eventosPorCircuito,
}) => {
  const seccionBarrio = generarSeccionBarrioPDF({
    nombreBarrio, props, incluirEncabezadoParte: false,
    cruceData, barriosGeoLookup, todosLosDatos, encuestasData,
    recorridosLookup, pautasBarriosData, obrasEnriquecidas, barriosGeoData,
    votosEscuelasBarrioLookup, votosEscuelasBarrioData, poblacionTotalPorBarrio, eventosPorCircuito,
  });

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ficha ${nombreBarrio}</title>
<style>${estilosFichaPDF()}</style></head><body>

<div class="header">
  <h1>BARRIO ${nombreBarrio}</h1>
  <h2>${props?.tipo_barrio === 'BarrioOficial' ? 'Barrio oficial' : 'Barrio no oficial'}</h2>
</div>

${seccionBarrio}

<div class="footer">Diagnóstico Territorial - Córdoba Capital │ Generado el ${formatearFecha(new Date())}</div>
</body></html>`;
};

const generarFichaPDF = ({
  datos, barrios, partidos, padronTotal,
  eventosPorCircuito, encuestaCircuito, encuestasData, encuestasMetadata,
  cruceData, barriosGeoLookup, barriosGeoData, poblacionTotalPorBarrio,
  recorridosLookup, pautasBarriosData, obrasEnriquecidas,
  votosEscuelasCircuitoData, votosEscuelasBarrioLookup, votosEscuelasBarrioData,
  // Nombres de barrio (tal como vienen en barrios_por_circuito_completo.json) a incluir
  // como sección propia — selección explícita del usuario en el diálogo de export
  // (puede ser [], uno, o varios). Sin este parámetro (llamador legado), se cae al
  // comportamiento de siempre: solo el barrio principal.
  nombresBarriosParaExportar,
  // Sección "Encuestas" del diálogo de export: 'ultima' (default, comportamiento de
  // siempre) | 'elegir' (una sección completa por ronda, ver rondasSeleccionadas) |
  // 'comparativo' (vista comparativa del bloque A, en versión print).
  modoEncuestas,
  rondasSeleccionadas,
}) => {
  const mapkey = datos.Mapkey;
  const barriosCircuito = barrios?.[mapkey]?.barrios || [];
  const barriosVisibles = barriosCircuito.filter(b => (b.poblacion || 0) >= UMBRAL_POBLACION_BARRIO);
  const barriosOcultos = barriosCircuito.length - barriosVisibles.length;
  const poblacionCircuitoTotal = poblacionCircuito(barriosCircuito);
  const pctPadronDePoblacion = poblacionCircuitoTotal > 0 && datos.Padron_G23 != null ? (datos.Padron_G23 / poblacionCircuitoTotal) * 100 : null;
  const pctPadron = padronTotal > 0 ? ((datos.Padron_G23 / padronTotal) * 100).toFixed(2) : 0;
  const partidosG23 = partidos?.[datos.CircuitoKey]?.['G23'] || [];
  const partidosL25 = partidos?.[datos.CircuitoKey]?.['L25'] || [];

  // --- Cobertura territorial del circuito: reusa eventosPorCircuito (ya calculado en
  // Home, misma atribución por barrio principal que usa el resto del tablero) ---
  const obrasCircuito = (obrasEnriquecidas || []).filter(o => o._circuitoMapkey === mapkey);

  // --- Barrio principal del circuito (dirección inversa de resolverCircuitoPrincipalDeBarrio) ---
  const barrioPrincipal = resolverBarrioPrincipalDeCircuito(datos, cruceData, barriosGeoLookup);

  // --- Encuestas del circuito: mismo criterio de agrupación que ResumenEncuesta en pantalla.
  // modoEncuestas viene del diálogo de export; sin dato (llamador legado) se cae al
  // comportamiento de siempre (última ronda). ---
  const umbralComparativo = encuestasMetadata?.umbral_variacion_pp ?? 2.5;
  const encuestaHtml = (() => {
    if (!encuestaCircuito || !(encuestaCircuito.cantidad_rondas > 0)) return htmlEncuestasPDF(encuestaCircuito);
    if (modoEncuestas === 'comparativo') return htmlEncuestasComparativoPDF(encuestaCircuito, umbralComparativo);
    if (modoEncuestas === 'elegir') return htmlEncuestasElegirRondasPDF(encuestaCircuito, rondasSeleccionadas || []);
    return htmlEncuestasPDF(encuestaCircuito);
  })();

  const escuelasCircuitoHtml = INCLUIR_ESCUELAS_PDF ? `
<div class="section">
  <h3>Votos por escuela</h3>
  ${htmlEscuelasPDF(votosEscuelasCircuitoData?.circuitos?.[mapkey]?.escuelas, votosEscuelasCircuitoData?.promedio_capital_pct)}
</div>` : '';

  // Selección de barrios a exportar como sección propia: por defecto (sin diálogo, ej.
  // llamadas legadas) solo el barrio principal; con el diálogo de export, la selección
  // explícita del usuario — puede ser ninguno, uno o varios. Cada uno pertenece por
  // definición a ESTE circuito (datos), así que se pasa como circuitoContexto para que
  // el bloque de Contexto político no tenga que re-derivarlo.
  const nombrePrincipalNorm = barrioPrincipal ? normalizarNombreBarrio(barrioPrincipal.nombreBarrio) : null;
  const nombresBarrios = nombresBarriosParaExportar ?? (barrioPrincipal ? [barrioPrincipal.nombreBarrio] : []);
  const barrioPartHtml = nombresBarrios.map(nombreBarrioRaw => {
    const key = normalizarNombreBarrio(nombreBarrioRaw);
    const feature = barriosGeoLookup[key];
    const nombreBarrio = feature ? feature.nombre_barrio : nombreBarrioRaw;
    const esPrincipal = nombrePrincipalNorm != null && key === nombrePrincipalNorm;
    return generarSeccionBarrioPDF({
      nombreBarrio,
      props: feature,
      tituloParte: esPrincipal ? 'BARRIO PRINCIPAL' : 'BARRIO',
      circuitoContexto: datos,
      cruceData, barriosGeoLookup, encuestasData,
      recorridosLookup, pautasBarriosData, obrasEnriquecidas, barriosGeoData,
      votosEscuelasBarrioLookup, votosEscuelasBarrioData, poblacionTotalPorBarrio, eventosPorCircuito,
    });
  }).join('');

  const elecciones = [
    { key: 'G07', label: '2007', share: datos.Share_G07, shareCap: datos.ShareCap_G07 },
    { key: 'G11', label: '2011', share: datos.Share_G11, shareCap: datos.ShareCap_G11 },
    { key: 'G15', label: '2015', share: datos.Share_G15, shareCap: datos.ShareCap_G15 },
    { key: 'G19', label: '2019', share: datos.Share_G19, shareCap: datos.ShareCap_G19 },
    { key: 'G23', label: '2023', share: datos.Share_G23, shareCap: datos.ShareCap_G23 },
  ];
  
  const maxShare = Math.max(...elecciones.map(e => e.share || 0), ...elecciones.map(e => e.shareCap || 0), 0.6);
  const chartW = 500, chartH = 150, padL = 40, padR = 20, padT = 20, padB = 30;
  const getY = (v) => padT + (1 - v / maxShare) * (chartH - padT - padB);
  const getX = (i) => padL + (i / (elecciones.length - 1)) * (chartW - padL - padR);
  
  const circuitoPoints = elecciones.filter(e => e.share != null).map((e, i) => `${getX(elecciones.indexOf(e))},${getY(e.share)}`).join(' ');
  const capitalPoints = elecciones.filter(e => e.shareCap != null).map((e, i) => `${getX(elecciones.indexOf(e))},${getY(e.shareCap)}`).join(' ');
  
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ficha ${datos.CircuitoKey}</title>
<style>${estilosFichaPDF()}</style></head><body>

<div class="header">
  <h1>CIRCUITO ${datos.CircuitoKey}</h1>
  <h2>${datos.cirn_nom}</h2>
  <div class="badges">
    <span class="badge" style="background:${COLORES_CATEGORIA[datos.Categoria_v4]?.bg}22;color:${COLORES_CATEGORIA[datos.Categoria_v4]?.text}">${COLORES_CATEGORIA[datos.Categoria_v4]?.label || datos.Categoria_v4}</span>
    <span class="badge" style="background:${COLORES_ML[datos.Categoria_ML]?.bg}22;color:${COLORES_ML[datos.Categoria_ML]?.text}">${COLORES_ML[datos.Categoria_ML]?.label || datos.Categoria_ML}</span>
  </div>
</div>

<div class="metrics">
  <div class="metric"><div class="metric-label">Padrón electoral (circuito) <span title="Personas habilitadas para votar en este circuito según el padrón electoral 2023." style="display:inline-flex;align-items:center;justify-content:center;width:12px;height:12px;border-radius:50%;border:1px solid #999;color:#999;font-size:9px;cursor:help;">i</span></div><div class="metric-value">${datos.Padron_G23?.toLocaleString() || '—'}</div><div class="metric-sub">${pctPadron}% de Capital</div></div>
  <div class="metric"><div class="metric-label">Victorias</div><div class="metric-value">${datos.Victorias_Total}/4</div></div>
  <div class="metric"><div class="metric-label">Gob. 2023</div><div class="metric-value ${datos.Share_G23 >= 0.5 ? 'green' : 'red'}">${(datos.Share_G23 * 100).toFixed(1)}%</div></div>
  <div class="metric"><div class="metric-label">Dip. 2025</div><div class="metric-value ${datos.Share_L25 >= 0.3 ? 'green' : 'red'}">${(datos.Share_L25 * 100).toFixed(1)}%</div></div>
</div>
${poblacionCircuitoTotal > 0 ? `<p style="font-size:11px;color:#666;margin:-10px 0 20px">En los barrios de este circuito viven ${Math.round(poblacionCircuitoTotal).toLocaleString()} personas; el padrón habilitado es ${datos.Padron_G23?.toLocaleString() || '—'}${pctPadronDePoblacion != null ? ` (${pctPadronDePoblacion.toFixed(0)}%)` : ''}.</p>` : ''}

<div class="section">
  <h3>Evolución histórica - Gobernador</h3>
  <div class="chart-container">
    <svg width="100%" viewBox="0 0 ${chartW} ${chartH}">
      ${[0.2, 0.4, 0.6].filter(v => v <= maxShare).map(v => `<line x1="${padL}" y1="${getY(v)}" x2="${chartW - padR}" y2="${getY(v)}" stroke="#ddd" stroke-dasharray="3 3"/><text x="${padL - 5}" y="${getY(v) + 4}" text-anchor="end" font-size="10" fill="#999">${(v * 100).toFixed(0)}%</text>`).join('')}
      <polyline points="${capitalPoints}" fill="none" stroke="#999" stroke-width="2" stroke-dasharray="4 3"/>
      <polyline points="${circuitoPoints}" fill="none" stroke="#1976D2" stroke-width="2.5"/>
      ${elecciones.map((e, i) => e.share != null ? `<circle cx="${getX(i)}" cy="${getY(e.share)}" r="4" fill="#1976D2"/>` : '').join('')}
      ${elecciones.map((e, i) => `<text x="${getX(i)}" y="${chartH - 5}" text-anchor="middle" font-size="10" fill="#666">${e.label}</text>`).join('')}
    </svg>
    <div style="display:flex;gap:20px;margin-top:8px;font-size:11px">
      <div style="display:flex;align-items:center;gap:5px"><div style="width:20px;height:2px;background:#1976D2"></div>Circuito</div>
      <div style="display:flex;align-items:center;gap:5px"><div style="width:20px;height:0;border-top:2px dashed #999"></div>Capital</div>
    </div>
  </div>
</div>

<div class="section">
  <h3>Resultados históricos</h3>
  <table>
    <thead><tr><th>Elección</th><th class="text-right">% Votos</th><th class="text-right">vs Capital</th><th class="text-center">Resultado</th></tr></thead>
    <tbody>
      ${[
        { l: 'Gob. 2023', s: datos.Share_G23, c: datos.ShareCap_G23, g: datos.Gano_G23 },
        { l: 'Gob. 2019', s: datos.Share_G19, c: datos.ShareCap_G19, g: datos.Gano_G19 },
        { l: 'Dip. 2025', s: datos.Share_L25, c: datos.ShareCap_L25, g: datos.Gano_L25 },
        { l: 'Dip. 2021', s: datos.Share_L21, c: datos.ShareCap_L21, g: datos.Gano_L21 },
        { l: 'Int. 2019', s: datos.Share_Int19, c: datos.ShareCap_Int19, g: datos.Gano_Int19 },
      ].map(r => `<tr><td>${r.l}</td><td class="text-right"><strong>${(r.s * 100).toFixed(1)}%</strong></td><td class="text-right ${(r.s - r.c) >= 0 ? 'green' : 'red'}">${((r.s - r.c) * 100).toFixed(1)} pp</td><td class="text-center">${r.g != null ? (r.g ? '✓ GANÓ' : '✗ PERDIÓ') : '—'}</td></tr>`).join('')}
    </tbody>
  </table>
</div>

<div class="section">
  <h3>Comparativas</h3>
  <div class="comparativas">
    <div class="comp-box"><h4>Gob. 2019 → Gob. 2023</h4><div class="comp-value ${(datos.Share_G23 - datos.Share_G19) >= 0 ? 'green' : 'red'}">${(datos.Share_G23 - datos.Share_G19) >= 0 ? '+' : ''}${((datos.Share_G23 - datos.Share_G19) * 100).toFixed(1)} pp</div><div style="font-size:11px;color:#666;margin-top:4px">vs Capital: ${datos.Residual_Gov >= 0 ? '+' : ''}${(datos.Residual_Gov * 100).toFixed(1)} pp</div></div>
    <div class="comp-box"><h4>Efecto Llaryora (Int.19→G.23)</h4><div class="comp-value ${datos.Efecto_ML >= 0 ? 'green' : 'red'}">${datos.Efecto_ML >= 0 ? '+' : ''}${datos.Efecto_ML.toFixed(1)} pp</div></div>
    <div class="comp-box"><h4>Efecto Legislativo (D.21→D.25)</h4><div class="comp-value ${datos.Sch_Efecto >= 0 ? 'green' : 'red'}">${datos.Sch_Efecto >= 0 ? '+' : ''}${(datos.Sch_Efecto * 100).toFixed(1)} pp</div></div>
  </div>
  ${htmlTendenciasCircuitoPDF(datos)}
</div>

<div class="section">
  <h3>Composición del voto</h3>
  <div class="partidos-grid">
    <div class="partido-section">
      <h4>Gob. 2023</h4>
      ${partidosG23.slice(0, 5).map((p, i) => `<div class="partido-item"><span>${i + 1}. ${p.partido.substring(0, 25)}${p.partido.length > 25 ? '...' : ''}</span><strong>${(p.share * 100).toFixed(1)}%</strong></div>`).join('')}
    </div>
    <div class="partido-section">
      <h4>Dip. 2025</h4>
      ${partidosL25.slice(0, 5).map((p, i) => `<div class="partido-item"><span>${i + 1}. ${p.partido.substring(0, 25)}${p.partido.length > 25 ? '...' : ''}</span><strong>${(p.share * 100).toFixed(1)}%</strong></div>`).join('')}
    </div>
  </div>
</div>

${barriosCircuito.length > 0 ? `
<div class="section">
  <h3>Barrios del circuito (${barriosCircuito.length})</h3>
  <table><thead><tr><th>Barrio</th><th class="text-right">Población en el circuito</th><th class="text-right">% del total del barrio</th><th class="text-right" style="font-size:10px">Visitas</th><th class="text-center" style="font-size:10px">Pauta</th><th class="text-right" style="font-size:10px">Obras</th><th class="text-right" style="font-size:10px">Escuelas</th></tr></thead><tbody>${barriosVisibles.map(b => {
    const cobertura = calcularCoberturaBarrio(b.nombre, { recorridosLookup, pautasBarriosData, obrasEnriquecidas, votosEscuelasBarrioLookup });
    return `<tr><td>${b.nombre}</td><td class="text-right">${b.poblacion != null ? b.poblacion.toLocaleString() : '—'}</td><td class="text-right">${b.pct_en_circuito != null ? b.pct_en_circuito.toFixed(1) + '%' : '—'}</td><td class="text-right" style="font-size:10px">${pdfCeldaCantidad(cobertura.visitas)}</td><td class="text-center">${pdfBadgeEstadoPauta(cobertura.pauta)}</td><td class="text-right" style="font-size:10px">${pdfCeldaCantidad(cobertura.obras)}</td><td class="text-right" style="font-size:10px">${pdfCeldaCantidad(cobertura.escuelas)}</td></tr>`;
  }).join('')}</tbody><tfoot><tr style="font-weight:600;border-top:2px solid #ccc"><td>Total</td><td class="text-right">${Math.round(poblacionCircuitoTotal).toLocaleString()}</td><td></td><td></td><td></td><td></td><td></td></tr></tfoot></table>
  ${barriosOcultos > 0 ? `<p style="font-size:10px;color:#999;margin-top:6px">Se omiten ${barriosOcultos} barrio${barriosOcultos !== 1 ? 's' : ''} con menos de ${UMBRAL_POBLACION_BARRIO} habitantes en este circuito.</p>` : ''}
</div>
` : ''}

${encuestaHtml}

<div class="subheader">Cobertura territorial del circuito</div>
<div class="section"><h3>Obras (en el circuito)</h3>${htmlObrasPDF(obrasCircuito)}</div>
${escuelasCircuitoHtml}

${barrioPartHtml}

<div class="footer">Diagnóstico Territorial - Córdoba Capital │ Generado el ${formatearFecha(new Date())}</div>
</body></html>`;
  
  return html;
};

// ============================================
// PÁGINA PRINCIPAL
// ============================================
export default function Home() {
  const [circuitoSeleccionado, setCircuitoSeleccionado] = useState(null);
  const [solapaActiva, setSolapaActiva] = useState('resumen');
  const [busqueda, setBusqueda] = useState('');
  const [datos, setDatos] = useState([]);
  const [partidos, setPartidos] = useState({});
  const [barrios, setBarrios] = useState({});
  const [geoData, setGeoData] = useState(null);
  const [barriosGeoData, setBarriosGeoData] = useState(null);
  const [obrasData, setObrasData] = useState([]);
  const [cruceData, setCruceData] = useState(null);
  const [recorridosData, setRecorridosData] = useState(null);
  const [pautasBarriosData, setPautasBarriosData] = useState(null);
  const [encuestasData, setEncuestasData] = useState(null);
  const [encuestasMetadata, setEncuestasMetadata] = useState(null);
  const [escuelasData, setEscuelasData] = useState(null);
  const [votosEscuelasCircuitoData, setVotosEscuelasCircuitoData] = useState(null);
  const [votosEscuelasBarrioData, setVotosEscuelasBarrioData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtroCategoria, setFiltroCategoria] = useState(null);
  const [mostrarInfo, setMostrarInfo] = useState(false);
  const [mostrarMenu, setMostrarMenu] = useState(false);
  const [mostrarListadoEncuestas, setMostrarListadoEncuestas] = useState(false);
  const [vistaFicha, setVistaFicha] = useState(null); // null | 'circuito' | 'barrio' | 'capital'
  const [barrioSeleccionado, setBarrioSeleccionado] = useState(null);
  const [zoomBarrioSolicitado, setZoomBarrioSolicitado] = useState(null); // { nombre, ts } | null — pedido puntual de zoom a barrio (buscador)
  const [rondaFechaSolicitada, setRondaFechaSolicitada] = useState(null); // fecha (YYYY-MM-DD) de ronda pedida al hacer click en un evento de Medición (tabla de cobertura), o null = última ronda (default de SolapaEncuestas)
  const [panelTab, setPanelTab] = useState('circuito');
  const [obrasFoco, setObrasFoco] = useState('propio'); // 'propio' | 'cercanas' — qué sección de ObrasPanel viene destacada en la solapa Obras
  const [obraSeleccionada, setObraSeleccionada] = useState(null); // obra (enriquecida) para ModalObra, o null
  const [dialogExportCircuito, setDialogExportCircuito] = useState(null); // { barrios, seleccionados: Set<nombre>, principalNorm, modoEncuestas, rondasSeleccionadas: Set<idx> } | null — diálogo de opciones de exportación de la ficha de un circuito
  const [solapaActivaBarrio, setSolapaActivaBarrio] = useState('resumen'); // estado de tabs separado del de circuito (evita choques de clave, ej. 'resumen'/'escuelas'/'obras' existen en los dos)

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const [datosRes, partidosRes, barriosRes, geoRes, barriosGeoRes, obrasRes, cruceRes, recorridosRes, pautasBarriosRes, encuestasRes, encuestasMetaRes, escuelasRes, votosEscuelasCircuitoRes, votosEscuelasBarrioRes] = await Promise.all([
          fetch('/data/circuitos_completo.json'), fetch('/data/partidos_por_eleccion.json'),
          fetch('/data/barrios_por_circuito_completo.json'), fetch('/data/circuitos_cordoba.json'),
          fetch('/data/barrios_geo.json'), fetch('/data/obras_capital.json'),
          fetch('/data/circuito_barrios_cruce.json'),
          fetch('/data/recorridos_barrios.json'),
          fetch('/data/pautas_barrios.json'),
          fetch('/data/encuestas_circuitos.json'), fetch('/data/encuestas_metadata.json'),
          fetch('/data/escuelas_capital.json'), fetch('/data/votos_escuelas_por_circuito.json'),
          fetch('/data/votos_escuelas_por_barrio.json'),
        ]);
        setDatos(await datosRes.json()); setPartidos(await partidosRes.json());
        setBarrios(await barriosRes.json()); setGeoData(await geoRes.json());
        setBarriosGeoData(await barriosGeoRes.json()); setObrasData(await obrasRes.json());
        setCruceData(await cruceRes.json());
        setRecorridosData(await recorridosRes.json());
        setPautasBarriosData(await pautasBarriosRes.json());
        setEncuestasData(await encuestasRes.json()); setEncuestasMetadata(await encuestasMetaRes.json());
        setEscuelasData(await escuelasRes.json());
        setVotosEscuelasCircuitoData(await votosEscuelasCircuitoRes.json());
        setVotosEscuelasBarrioData(await votosEscuelasBarrioRes.json());
      } catch (e) { console.error('Error cargando datos:', e); }
      setCargando(false);
    };
    cargarDatos();
  }, []);
  
  const datosCircuito = useMemo(() => datos.find(d => d.CircuitoKey === circuitoSeleccionado), [datos, circuitoSeleccionado]);
  const encuestaCircuito = useMemo(() => buscarEncuestaCircuito(encuestasData, circuitoSeleccionado), [encuestasData, circuitoSeleccionado]);

  // GeoJSON de circuitos (mismo topojson.feature() que ya hace MapaCircuitos.js
  // internamente) — se recalcula acá aparte porque ObrasPanel/badge de obras cercanas
  // necesitan el centroide del polígono del circuito, algo que el mapa no expone hacia
  // afuera. Duplicar este parseo es aceptable (no vale la pena refactorizar cómo
  // MapaCircuitos expone su geoJsonData por esta única llamada extra).
  const circuitosGeoJsonData = useMemo(() => {
    if (!geoData) return null;
    try {
      const objectKey = Object.keys(geoData.objects)[0];
      if (!objectKey) return null;
      return topojson.feature(geoData, geoData.objects[objectKey]);
    } catch (e) {
      console.error('Error convirtiendo TopoJSON de circuitos:', e);
      return null;
    }
  }, [geoData]);

  // Índice barrio -> circuitos (circuito_barrios_cruce.json), precalculado una sola
  // vez para derivar el circuito de cada obra sin lat/lon propia (ver lib/obrasCercanas.js).
  const indiceBarrioCircuito = useMemo(() => construirIndiceBarrioCircuito(cruceData), [cruceData]);

  // Única fuente de obras que debería circular de acá en más (mapa, paneles, modal):
  // cada obra ya trae _circuitoMapkey/_circuitoNombre resuelto, para que "toda obra en
  // cualquier lista muestra su circuito" quede garantizado acá, no repetido en cada
  // componente. Todavía no conectada a ningún componente (eso es la próxima etapa).
  const obrasEnriquecidas = useMemo(() => enriquecerObrasConCircuito(obrasData, indiceBarrioCircuito), [obrasData, indiceBarrioCircuito]);

  // Si cambiamos de circuito estando en la solapa Encuestas y el nuevo no tiene datos, volvemos a Resumen.
  useEffect(() => {
    if (solapaActiva === 'encuestas' && !encuestaCircuito) setSolapaActiva('resumen');
  }, [circuitoSeleccionado, encuestaCircuito, solapaActiva]);

  const resultadosBusqueda = useMemo(() => {
    if (!busqueda) return [];
    const lower = busqueda.toLowerCase();
    const circuitos = datos
      .filter(d => d.CircuitoKey?.toString().toLowerCase().includes(lower) || d.cirn_nom?.toLowerCase().includes(lower))
      .slice(0, 8)
      .map(d => ({ tipo: 'circuito', key: `c-${d.CircuitoKey}`, circuito: d }));
    const barrios = (barriosGeoData?.features || [])
      .filter(f => f.properties?.nombre_barrio?.toLowerCase().includes(lower))
      .slice(0, 8)
      .map(f => ({ tipo: 'barrio', key: `b-${f.properties.nombre_barrio}`, nombreBarrio: f.properties.nombre_barrio }));
    return [...circuitos, ...barrios];
  }, [datos, barriosGeoData, busqueda]);
  const padronTotal = useMemo(() => datos.reduce((sum, d) => sum + (d.Padron_G23 || 0), 0), [datos]);

  const barriosGeoLookup = useMemo(() => {
    const lookup = {};
    (barriosGeoData?.features || []).forEach(f => {
      const key = normalizarNombreBarrio(f.properties?.nombre_barrio);
      if (key) lookup[key] = f.properties;
    });
    return lookup;
  }, [barriosGeoData]);

  // Población total real de cada barrio = suma de "poblacion" a través de TODOS los
  // circuitos donde aparece en barrios_por_circuito_completo.json — no la fila del
  // circuito_principal (eso es solo la porción de ese barrio que cae en ese circuito).
  // Ver poblacionCircuito/construirPoblacionTotalPorBarrio para el detalle de por qué.
  const poblacionTotalPorBarrio = useMemo(() => construirPoblacionTotalPorBarrio(barrios), [barrios]);

  const recorridosLookup = useMemo(() => {
    const lookup = {};
    Object.entries(recorridosData || {}).forEach(([nombre, info]) => {
      const key = normalizarNombreBarrio(nombre);
      if (key) lookup[key] = info;
    });
    return lookup;
  }, [recorridosData]);

  // Los nombres de barrio de votos_escuelas_por_barrio.json vienen del catastro IDECOR,
  // sin pasar por normalizarNombreBarrio (mismo motivo que recorridosLookup) — se normalizan
  // acá para cruzar contra barriosGeoLookup.
  const votosEscuelasBarrioLookup = useMemo(() => {
    const lookup = {};
    Object.entries(votosEscuelasBarrioData?.barrios || {}).forEach(([nombre, info]) => {
      const key = normalizarNombreBarrio(nombre);
      if (key) lookup[key] = info;
    });
    return lookup;
  }, [votosEscuelasBarrioData]);

  const eventosPorCircuito = useMemo(
    () => construirEventosPorCircuito(datos, encuestasData, recorridosLookup, cruceData, pautasBarriosData, barriosGeoData),
    [datos, encuestasData, recorridosLookup, cruceData, pautasBarriosData, barriosGeoData]
  );

  const coberturaResumen = useMemo(() => {
    if (!encuestasData) return null;
    let encuestados = 0;
    let fechaMasReciente = null;
    datos.forEach(d => {
      const c = coberturaDesdeEncuesta(encuestasData, d.CircuitoKey);
      if (c.encuestado) {
        encuestados++;
        (c.fechas_rondas || []).forEach(f => {
          if (!fechaMasReciente || f > fechaMasReciente) fechaMasReciente = f;
        });
      }
    });
    return { encuestados, total: datos.length, fechaMasReciente };
  }, [encuestasData, datos]);

  // Selección de circuito por vías no geográficas (buscador, tabla, "zona", links del panel):
  // no hay un punto clickeado, así que el barrio se deriva del principal según el cruce (orden_importancia: 1).
  const handleSelectCircuito = (c) => {
    setCircuitoSeleccionado(c);
    setFiltroCategoria(null);
    setPanelTab('circuito');
    // Cambiar de circuito resetea siempre la solapa activa a Resumen — evita aterrizar
    // en una solapa que quedó activa desde el circuito/barrio anterior (ver también
    // handleSelectBarrio/handleSelectBarrioDesdeBusqueda/handleMapClick, mismos motivos).
    // Los dos flujos que deliberadamente saltan a "encuestas" (irACircuitoDesdeListadoEncuestas,
    // irACircuitoDesdeResumenBarrio) llaman a este handler y LUEGO pisan solapaActiva con su
    // propio setSolapaActiva('encuestas') — el orden dentro del mismo handler hace que ese
    // valor explícito gane.
    setSolapaActiva('resumen');
    setSolapaActivaBarrio('resumen');
    setRondaFechaSolicitada(null); // idem: solo irACircuitoDesdeGrillaMedicion pide una ronda puntual, y la pisa después de llamar acá
    const d = datos.find(x => x.CircuitoKey === c);
    const clave = d ? `${d.Mapkey} - ${d.cirn_nom}` : null;
    const lista = clave ? cruceData?.circuito_to_barrios?.[clave] : null;
    const principal = lista?.find(b => b.orden_importancia === 1);
    if (principal) {
      const key = normalizarNombreBarrio(principal.barrio_normalizado);
      const feature = barriosGeoLookup[key];
      setBarrioSeleccionado(feature ? feature.nombre_barrio : principal.barrio_normalizado);
    } else {
      setBarrioSeleccionado(null);
    }
  };
  // Usado por los links "Otros barrios en este circuito": solo cambia el barrio, el circuito
  // actual no se toca (seguimos en el mismo circuito, solo mostrando otro barrio suyo).
  // "solapa" es opcional (default 'resumen', mismo criterio que onVerFicha para circuito
  // en la línea de abajo) — permite pedir que la ficha de barrio aterrice en una solapa
  // puntual (ver irABarrioDesdeMapaPauta) sin romper los callers existentes.
  const handleSelectBarrio = (nombre, solapa) => { setBarrioSeleccionado(nombre); setPanelTab('barrio'); setSolapaActivaBarrio(solapa || 'resumen'); };

  // Selección de barrio desde el buscador: a diferencia de "Otros barrios en este circuito"
  // (que mantiene el circuito activo sin tocarlo), acá no hay circuito activo relevante que
  // preservar — se deriva el circuito correspondiente al barrio (circuito_principal, con
  // circuito_barrios_cruce.json como respaldo si falta) y se pide zoom sobre el barrio en el
  // mapa (MapaCircuitos decide si puede, según si la capa Barrios está visible).
  const handleSelectBarrioDesdeBusqueda = (nombreBarrio) => {
    setBarrioSeleccionado(nombreBarrio);
    setPanelTab('barrio');
    setFiltroCategoria(null);
    setSolapaActivaBarrio('resumen');

    const circuitoRecord = resolverCircuitoPrincipalDeBarrio(nombreBarrio, cruceData, barriosGeoLookup, datos);
    setCircuitoSeleccionado(circuitoRecord ? circuitoRecord.CircuitoKey : null);
    setZoomBarrioSolicitado({ nombre: nombreBarrio, ts: Date.now() });
  };

  // Click en el mapa: turf ya determinó geométricamente ambas selecciones de forma
  // independiente (ver ClickHandler en MapaCircuitos.js) — se aplican tal cual, sin cruce.
  const handleMapClick = (circuitoKey, nombreBarrio) => {
    setCircuitoSeleccionado(circuitoKey);
    setBarrioSeleccionado(nombreBarrio);
    setFiltroCategoria(null);
    setSolapaActiva('resumen');
    setSolapaActivaBarrio('resumen');
    setRondaFechaSolicitada(null); // no pasa por handleSelectCircuito — mismo reset, evita arrastrar una ronda pedida para el circuito anterior
  };

  // Click en una celda de la grilla de cobertura: selecciona el circuito y vuelve
  // a la vista de mapa (Estado 1) para verlo resaltado ahí.
  const irACircuitoDesdeGrilla = (circuitoKey) => {
    handleSelectCircuito(circuitoKey);
    setVistaFicha(null);
  };

  // Click en una fila del listado de "Circuitos con encuesta": va directo a la
  // ficha del circuito, solapa Encuestas.
  const irACircuitoDesdeListadoEncuestas = (circuitoKey) => {
    handleSelectCircuito(circuitoKey);
    setVistaFicha('circuito');
    setSolapaActiva('encuestas');
  };

  // Click en "Ver ficha completa del circuito" desde el Resumen de la ficha de barrio:
  // va directo a la ficha de ese circuito, solapa Encuestas (mismo patrón que arriba).
  const irACircuitoDesdeResumenBarrio = (circuito) => {
    handleSelectCircuito(circuito.CircuitoKey);
    setVistaFicha('circuito');
    setSolapaActiva('encuestas');
  };

  // Click en una fila de "Barrios del circuito" o "Barrios cercanos" (solapa Territorio,
  // de la ficha de circuito o de la de barrio): misma selección de barrio que ya usan
  // los links "Otros barrios en este circuito" (handleSelectBarrio, no un camino nuevo),
  // sumando el cambio de vistaFicha para abrir directamente la ficha completa de ese
  // barrio (acá sí, a diferencia del panel mini, ya estamos parados en una ficha
  // completa y el click debe llevar a otra).
  const irABarrioDesdeTerritorio = (nombreBarrio) => {
    handleSelectBarrio(nombreBarrio);
    setVistaFicha('barrio');
  };

  // Click en "Ver en solapa Pauta" del popup de estrella de pauta (MapaCircuitos):
  // mismo patrón que irABarrioDesdeTerritorio (selección no geográfica de barrio +
  // apertura de ficha completa), pidiendo la solapa 'pauta' en vez del default 'resumen'.
  const irABarrioDesdeMapaPauta = (nombreBarrio) => {
    handleSelectBarrio(nombreBarrio, 'pauta');
    setVistaFicha('barrio');
  };

  // Click en un evento de tipo Medición (tabla de cobertura, BarraCobertura): mismo
  // patrón que irACircuitoDesdeListadoEncuestas (ficha completa, solapa Encuestas),
  // sumando la fecha de la ronda pedida — handleSelectCircuito ya resetea
  // rondaFechaSolicitada a null, así que fijarlo acá DESPUÉS es lo que hace que la
  // ronda pedida gane (mismo orden que ya usa el archivo para solapaActiva).
  const irACircuitoDesdeGrillaMedicion = (circuitoKey, fecha) => {
    handleSelectCircuito(circuitoKey);
    setVistaFicha('circuito');
    setSolapaActiva('encuestas');
    setRondaFechaSolicitada(fecha);
  };

  // Escuelas y Obras se fusionaron dentro de Territorio (población/padrón, Obras,
  // Escuelas y Circuitos de la zona, en ese orden) — ya no son solapas propias.
  const solapas = [
    { key: 'resumen', label: 'Resumen' }, { key: 'evolucion', label: 'Evolución' }, { key: 'partidos', label: 'Partidos' },
    { key: 'territorio', label: 'Territorio' }, { key: 'comparativas', label: 'Comparativas' },
    ...(encuestaCircuito ? [{ key: 'encuestas', label: 'Encuestas' }] : []),
  ];

  const solapasBarrio = [
    { key: 'resumen', label: 'Resumen' }, { key: 'territorio', label: 'Territorio' }, { key: 'visitas', label: 'Visitas' },
    { key: 'pauta', label: 'Pauta' }, { key: 'escuelas', label: 'Escuelas' }, { key: 'obras', label: 'Obras' },
  ];
  
  // En la ficha de un barrio (vistaFicha === 'barrio') exporta SOLO ese barrio —
  // cualquiera, no solo el principal de algún circuito — reutilizando generarFichaBarrioPDF,
  // sin diálogo (comportamiento sin cambios). En la ficha de circuito, en cambio, abre el
  // selector de barrios antes de generar el PDF (ver abrirSelectorExportCircuito).
  const exportarPDF = () => {
    if (vistaFicha === 'barrio' && barrioSeleccionado) {
      const props = barriosGeoLookup[normalizarNombreBarrio(barrioSeleccionado)];
      if (!props) return;
      const html = generarFichaBarrioPDF({
        nombreBarrio: barrioSeleccionado, props,
        cruceData, barriosGeoLookup, todosLosDatos: datos, encuestasData,
        recorridosLookup, pautasBarriosData, obrasEnriquecidas, barriosGeoData,
        votosEscuelasBarrioLookup, votosEscuelasBarrioData, poblacionTotalPorBarrio, eventosPorCircuito,
      });
      abrirVentanaImpresion(html);
      return;
    }
    abrirSelectorExportCircuito();
  };

  // Arma la lista del diálogo con los mismos datos que la tabla "Barrios del circuito"
  // de Territorio, pero ordenados por población (no por orden_importancia) — el
  // barrio principal viene premarcado. Si el circuito tiene encuesta con 2+ rondas,
  // arranca con todas las rondas tildadas (para "Elegir rondas") y modo "Última ronda"
  // por defecto (mismo comportamiento que antes de existir estas 3 opciones).
  const abrirSelectorExportCircuito = () => {
    if (!datosCircuito) return;
    const mapkey = datosCircuito.Mapkey;
    const barriosCircuitoOrdenados = [...(barrios?.[mapkey]?.barrios || [])].sort((a, b) => (b.poblacion || 0) - (a.poblacion || 0));
    const principal = resolverBarrioPrincipalDeCircuito(datosCircuito, cruceData, barriosGeoLookup);
    const principalNorm = principal ? normalizarNombreBarrio(principal.nombreBarrio) : null;
    const seleccionados = new Set(
      barriosCircuitoOrdenados.filter(b => principalNorm && normalizarNombreBarrio(b.nombre) === principalNorm).map(b => b.nombre)
    );
    const cantidadRondas = encuestaCircuito?.cantidad_rondas || 0;
    setDialogExportCircuito({
      barrios: barriosCircuitoOrdenados,
      seleccionados,
      principalNorm,
      modoEncuestas: 'ultima',
      rondasSeleccionadas: new Set(Array.from({ length: cantidadRondas }, (_, i) => i)),
    });
  };

  const toggleBarrioExportCircuito = (nombre) => {
    setDialogExportCircuito(prev => {
      if (!prev) return prev;
      const seleccionados = new Set(prev.seleccionados);
      if (seleccionados.has(nombre)) seleccionados.delete(nombre); else seleccionados.add(nombre);
      return { ...prev, seleccionados };
    });
  };

  const setModoEncuestasExportCircuito = (modo) => {
    setDialogExportCircuito(prev => prev ? { ...prev, modoEncuestas: modo } : prev);
  };

  const toggleRondaExportCircuito = (idx) => {
    setDialogExportCircuito(prev => {
      if (!prev) return prev;
      const rondasSeleccionadas = new Set(prev.rondasSeleccionadas);
      if (rondasSeleccionadas.has(idx)) rondasSeleccionadas.delete(idx); else rondasSeleccionadas.add(idx);
      return { ...prev, rondasSeleccionadas };
    });
  };

  // Cero barrios marcados = solo la parte de circuito (generarFichaPDF no agrega
  // ninguna sección de barrio); varios marcados = una sección por cada uno, en orden.
  const confirmarExportCircuito = () => {
    if (!datosCircuito || !dialogExportCircuito) return;
    const html = generarFichaPDF({
      datos: datosCircuito, barrios, partidos, padronTotal,
      eventosPorCircuito, encuestaCircuito, encuestasData, encuestasMetadata,
      cruceData, barriosGeoLookup, barriosGeoData, poblacionTotalPorBarrio,
      recorridosLookup, pautasBarriosData, obrasEnriquecidas,
      votosEscuelasCircuitoData, votosEscuelasBarrioLookup, votosEscuelasBarrioData,
      nombresBarriosParaExportar: Array.from(dialogExportCircuito.seleccionados),
      modoEncuestas: dialogExportCircuito.modoEncuestas,
      rondasSeleccionadas: Array.from(dialogExportCircuito.rondasSeleccionadas).sort((a, b) => a - b),
    });
    abrirVentanaImpresion(html);
    setDialogExportCircuito(null);
  };
  
  if (cargando) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', fontFamily: '-apple-system, sans-serif' }}><div style={{ textAlign: 'center' }}><div style={{ fontSize: '18px', color: '#666', marginBottom: '10px' }}>Cargando datos...</div><div style={{ fontSize: '14px', color: '#999' }}>119 circuitos electorales</div></div></div>;
  }
  
  return (
    <>
      <Head><title>Diagnóstico Territorial - Córdoba Capital</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <style jsx global>{`
        :root { --bg-primary: #ffffff; --bg-secondary: #f5f5f5; --text-primary: #1a1a1a; --text-secondary: #666666; --text-tertiary: #999999; --border: #e0e0e0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f0f0f0; }
        .leaflet-container { z-index: 1 !important; }
      `}</style>
      
      <InfoModal isOpen={mostrarInfo} onClose={() => setMostrarInfo(false)} />
      <ModalObra obra={obraSeleccionada} onClose={() => setObraSeleccionada(null)} onSelectObra={setObraSeleccionada} obrasEnriquecidas={obrasEnriquecidas} />
      {datosCircuito && (
        <DialogExportFicha
          datosCircuito={datosCircuito}
          dialog={dialogExportCircuito}
          encuestaCircuito={encuestaCircuito}
          onToggleBarrio={toggleBarrioExportCircuito}
          onSetModoEncuestas={setModoEncuestasExportCircuito}
          onToggleRonda={toggleRondaExportCircuito}
          onExportar={confirmarExportCircuito}
          onCancelar={() => setDialogExportCircuito(null)}
        />
      )}
      
      <div style={{ minHeight: '100vh' }}>
        <header style={{ padding: '14px 24px', backgroundColor: '#fff', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 1000 }}>
          <div>
            <h1 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)' }}>Diagnóstico Territorial</h1>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px' }}>Córdoba Capital — 119 circuitos</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setMostrarMenu(!mostrarMenu)} style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>☰ Menú</button>
              {mostrarMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 1998 }} onClick={() => setMostrarMenu(false)} />
                  <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '6px', backgroundColor: '#fff', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 1999, minWidth: '210px', overflow: 'hidden' }}>
                    <button onClick={() => { setMostrarInfo(true); setMostrarMenu(false); }} style={{ width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', backgroundColor: 'transparent', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>ℹ️ Info</button>
                    <button onClick={() => { setVistaFicha('capital'); setCircuitoSeleccionado(null); setMostrarMenu(false); }} style={{ width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', backgroundColor: 'transparent', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>📊 Estadísticas de Capital</button>
                    <button
                      onClick={() => { setMostrarListadoEncuestas(true); setMostrarMenu(false); }}
                      style={{ width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', backgroundColor: 'transparent', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}
                    >
                      📋 Encuestas
                    </button>
                  </div>
                </>
              )}
            </div>
            {(circuitoSeleccionado || (vistaFicha === 'barrio' && barrioSeleccionado)) && <button onClick={exportarPDF} style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>📄 Exportar ficha</button>}
            <div style={{ position: 'relative' }}>
              <input type="text" placeholder="Buscar circuito o barrio..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ padding: '12px 18px', paddingLeft: '44px', width: '300px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '15px', backgroundColor: 'var(--bg-secondary)' }} />
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: '16px' }}>🔍</span>
              {busqueda && resultadosBusqueda.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid var(--border)', borderRadius: '10px', marginTop: '6px', maxHeight: '350px', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 9999 }}>
                  {resultadosBusqueda.map(r => (
                    <div
                      key={r.key}
                      onClick={() => {
                        if (r.tipo === 'circuito') handleSelectCircuito(r.circuito.CircuitoKey);
                        else handleSelectBarrioDesdeBusqueda(r.nombreBarrio);
                        setBusqueda('');
                      }}
                      style={{ padding: '14px 18px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}
                    >
                      <span style={{ fontSize: '15px' }}>
                        {r.tipo === 'circuito' ? <><strong>{r.circuito.CircuitoKey}</strong> - {r.circuito.cirn_nom}</> : r.nombreBarrio}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span style={{
                          fontSize: '10px', fontWeight: 600, padding: '3px 9px', borderRadius: '999px',
                          backgroundColor: r.tipo === 'circuito' ? '#1976D218' : '#5C6BC018',
                          color: r.tipo === 'circuito' ? '#1565C0' : '#3949AB',
                        }}>
                          {r.tipo === 'circuito' ? 'Circuito' : 'Barrio'}
                        </span>
                        {r.tipo === 'circuito' && <Badge categoria={r.circuito.Categoria_v4} tipo="v4" />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {mostrarListadoEncuestas && (
          <div style={{ backgroundColor: '#fff', borderBottom: '1px solid var(--border)' }}>
            <div style={{ padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Circuitos con encuesta</span>
              <button onClick={() => setMostrarListadoEncuestas(false)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕ Cerrar</button>
            </div>
            <ListadoEncuestasCircuitos datos={datos} encuestasData={encuestasData} onSelectCircuito={(c) => { irACircuitoDesdeListadoEncuestas(c); setMostrarListadoEncuestas(false); }} />
          </div>
        )}

        <BarraCobertura resumen={coberturaResumen} datos={datos} eventosPorCircuito={eventosPorCircuito} onClickVisita={irACircuitoDesdeGrilla} onClickMedicion={irACircuitoDesdeGrillaMedicion} onClickPauta={irABarrioDesdeMapaPauta} />

        <div style={{ display: 'flex', height: 'calc(100vh - 118px)' }}>
          {(vistaFicha === 'circuito' || vistaFicha === 'capital' || vistaFicha === 'barrio') ? (
            <>
              <div style={{ flex: '1', padding: '18px', overflowY: 'auto' }}>
                {vistaFicha === 'barrio' ? (
                  barrioSeleccionado && barriosGeoLookup[normalizarNombreBarrio(barrioSeleccionado)] ? (
                    <>
                      <div style={{ padding: '16px 20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>{barrioSeleccionado}</h2>
                            <button onClick={() => { setBarrioSeleccionado(null); setVistaFicha(null); }} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕ Cerrar</button>
                            <button onClick={() => setVistaFicha(null)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Volver al mapa</button>
                          </div>
                          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                            {barriosGeoLookup[normalizarNombreBarrio(barrioSeleccionado)].tipo_barrio === 'BarrioOficial' ? 'Barrio oficial' : 'Barrio no oficial'}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                        {solapasBarrio.map(s => <button key={s.key} onClick={() => setSolapaActivaBarrio(s.key)} style={{ padding: '10px 18px', borderRadius: '8px', border: 'none', backgroundColor: solapaActivaBarrio === s.key ? '#1976D2' : 'transparent', color: solapaActivaBarrio === s.key ? '#fff' : 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}>{s.label}</button>)}
                      </div>
                      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', minHeight: '400px' }}>
                        {solapaActivaBarrio === 'resumen' && (
                          <SolapaResumenBarrio
                            nombreBarrio={barrioSeleccionado}
                            props={barriosGeoLookup[normalizarNombreBarrio(barrioSeleccionado)]}
                            cruceData={cruceData}
                            barriosGeoLookup={barriosGeoLookup}
                            todosLosDatos={datos}
                            encuestasData={encuestasData}
                            recorridosLookup={recorridosLookup}
                            pautasBarriosData={pautasBarriosData}
                            votosEscuelasBarrioLookup={votosEscuelasBarrioLookup}
                            obrasEnriquecidas={obrasEnriquecidas}
                            poblacionTotalPorBarrio={poblacionTotalPorBarrio}
                            onIrACircuito={irACircuitoDesdeResumenBarrio}
                            onCambiarSolapa={setSolapaActivaBarrio}
                          />
                        )}
                        {solapaActivaBarrio === 'territorio' && <SolapaTerritorioBarrio nombreBarrio={barrioSeleccionado} barriosGeoData={barriosGeoData} onSelectBarrioFicha={irABarrioDesdeTerritorio} />}
                        {solapaActivaBarrio === 'visitas' && <SolapaVisitasBarrio nombreBarrio={barrioSeleccionado} recorridosLookup={recorridosLookup} />}
                        {solapaActivaBarrio === 'pauta' && <SolapaPautaBarrio nombreBarrio={barrioSeleccionado} pautasBarriosData={pautasBarriosData} />}
                        {solapaActivaBarrio === 'escuelas' && <SolapaEscuelasBarrio nombreBarrio={barrioSeleccionado} votosEscuelasBarrioLookup={votosEscuelasBarrioLookup} promedioCapitalPct={votosEscuelasBarrioData?.promedio_capital_pct} />}
                        {solapaActivaBarrio === 'obras' && <SolapaObrasBarrio nombreBarrio={barrioSeleccionado} obrasEnriquecidas={obrasEnriquecidas} barriosGeoData={barriosGeoData} onSelectObra={setObraSeleccionada} />}
                      </div>
                    </>
                  ) : (
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px' }}>
                      <div style={{ marginBottom: '16px' }}>
                        <button onClick={() => setVistaFicha(null)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Volver al mapa</button>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>Seleccioná un barrio para ver su ficha.</div>
                    </div>
                  )
                ) : circuitoSeleccionado && datosCircuito ? (
                  <>
                    <div style={{ padding: '16px 20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>CIRCUITO {circuitoSeleccionado}</h2>
                          <button onClick={() => { setCircuitoSeleccionado(null); setFiltroCategoria(null); setVistaFicha(null); }} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕ Cerrar</button>
                          <button onClick={() => setVistaFicha(null)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Volver al mapa</button>
                        </div>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '6px' }}>{datosCircuito.cirn_nom}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Badge categoria={datosCircuito.Categoria_v4} tipo="v4" />
                        {encuestaCircuito && (
                          <span onClick={() => setSolapaActiva('encuestas')} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', backgroundColor: '#1976D218', color: '#1565C0', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                            📊 Tiene encuesta
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                      {solapas.map(s => <button key={s.key} onClick={() => { setSolapaActiva(s.key); if (s.key === 'territorio') setObrasFoco('propio'); }} style={{ padding: '10px 18px', borderRadius: '8px', border: 'none', backgroundColor: solapaActiva === s.key ? '#1976D2' : 'transparent', color: solapaActiva === s.key ? '#fff' : 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}>{s.label}</button>)}
                    </div>
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', minHeight: '400px' }}>
                      {solapaActiva === 'resumen' && <SolapaResumen circuito={circuitoSeleccionado} datos={datosCircuito} padronTotal={padronTotal} encuestasData={encuestasData} />}
                      {solapaActiva === 'evolucion' && <SolapaEvolucion circuito={circuitoSeleccionado} datos={datosCircuito} />}
                      {solapaActiva === 'partidos' && <SolapaPartidos circuito={circuitoSeleccionado} datos={datosCircuito} partidos={partidos} />}
                      {solapaActiva === 'territorio' && (
                        <SolapaTerritorio
                          circuito={circuitoSeleccionado}
                          datos={datosCircuito}
                          barrios={barrios}
                          todosLosDatos={datos}
                          onSelectCircuito={handleSelectCircuito}
                          barriosGeoLookup={barriosGeoLookup}
                          recorridosLookup={recorridosLookup}
                          pautasBarriosData={pautasBarriosData}
                          obrasEnriquecidas={obrasEnriquecidas}
                          votosEscuelasBarrioLookup={votosEscuelasBarrioLookup}
                          onSelectBarrioFicha={irABarrioDesdeTerritorio}
                          circuitosGeoJsonData={circuitosGeoJsonData}
                          obrasFoco={obrasFoco}
                          onSelectObra={setObraSeleccionada}
                          votosEscuelasCircuitoData={votosEscuelasCircuitoData}
                        />
                      )}
                      {solapaActiva === 'comparativas' && <SolapaComparativas circuito={circuitoSeleccionado} datos={datosCircuito} />}
                      {solapaActiva === 'encuestas' && encuestaCircuito && (
                        <SolapaEncuestas
                          key={`${circuitoSeleccionado}-${rondaFechaSolicitada || 'ultima'}`}
                          encuesta={encuestaCircuito}
                          metadata={encuestasMetadata}
                          fechaRondaInicial={rondaFechaSolicitada}
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px' }}>
                    <div style={{ marginBottom: '16px' }}>
                      <button onClick={() => setVistaFicha(null)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Volver al mapa</button>
                    </div>
                    <VistaCapital datos={datos} onSelectCircuito={handleSelectCircuito} filtroCategoria={filtroCategoria} setFiltroCategoria={setFiltroCategoria} />
                  </div>
                )}
              </div>

              <div style={{ width: '320px', flexShrink: 0, padding: '18px', paddingLeft: '0', position: 'relative', zIndex: 1 }}>
                <div style={{ height: '100%', backgroundColor: '#fff', borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                  <MapaCircuitos datos={datos} geoData={geoData} barriosGeoData={barriosGeoData} obrasEnriquecidas={obrasEnriquecidas} escuelasData={escuelasData} pautasBarriosData={pautasBarriosData} circuitoSeleccionado={circuitoSeleccionado} onMapClick={handleMapClick} barrioSeleccionado={barrioSeleccionado} filtroCategoria={filtroCategoria} setFiltroCategoria={setFiltroCategoria} coloresCategoria={COLORES_CATEGORIA} zoomBarrioSolicitado={zoomBarrioSolicitado} onSelectObra={setObraSeleccionada} onVerBarrioEnPauta={irABarrioDesdeMapaPauta} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ flex: '1', padding: '18px' }}>
                <div style={{ height: '100%', backgroundColor: '#fff', borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                  <MapaCircuitos datos={datos} geoData={geoData} barriosGeoData={barriosGeoData} obrasEnriquecidas={obrasEnriquecidas} escuelasData={escuelasData} pautasBarriosData={pautasBarriosData} circuitoSeleccionado={circuitoSeleccionado} onMapClick={handleMapClick} barrioSeleccionado={barrioSeleccionado} filtroCategoria={filtroCategoria} setFiltroCategoria={setFiltroCategoria} coloresCategoria={COLORES_CATEGORIA} zoomBarrioSolicitado={zoomBarrioSolicitado} onSelectObra={setObraSeleccionada} onVerBarrioEnPauta={irABarrioDesdeMapaPauta} />
                </div>
              </div>

              <div style={{ width: '300px', flexShrink: 0, padding: '18px', paddingLeft: '0' }}>
                <div style={{ height: '100%', backgroundColor: '#fff', borderRadius: '12px', padding: '16px', overflowY: 'auto' }}>
                  <PanelLateral
                    panelTab={panelTab}
                    setPanelTab={setPanelTab}
                    datosCircuito={datosCircuito}
                    padronTotal={padronTotal}
                    onVerFicha={(solapa, foco) => { setVistaFicha('circuito'); setSolapaActiva(solapa || 'resumen'); setObrasFoco(foco || 'propio'); }}
                    onVerFichaBarrio={() => { setVistaFicha('barrio'); setSolapaActivaBarrio('resumen'); if (barrioSeleccionado) setZoomBarrioSolicitado({ nombre: barrioSeleccionado, ts: Date.now() }); }}
                    onVerFichaCircuito={irACircuitoDesdeResumenBarrio}
                    barrioSeleccionado={barrioSeleccionado}
                    barriosGeoLookup={barriosGeoLookup}
                    todosLosDatos={datos}
                    cruceData={cruceData}
                    onSelectBarrio={handleSelectBarrio}
                    onSelectCircuito={handleSelectCircuito}
                    encuestasData={encuestasData}
                    obrasEnriquecidas={obrasEnriquecidas}
                    circuitosGeoJsonData={circuitosGeoJsonData}
                    poblacionTotalPorBarrio={poblacionTotalPorBarrio}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
