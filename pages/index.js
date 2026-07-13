import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';

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
const getNumeroBase = (circuitoKey) => {
  if (!circuitoKey) return '';
  return String(circuitoKey).replace(/[A-Za-z]/g, '');
};
// Mismo criterio de normalización usado en components/MapaCircuitos.js para cruzar
// barrios_por_circuito.json / obras_largo.json con barrios_geo.json
const normalizarNombreBarrio = (s) => (s || '')
  .toUpperCase()
  .replace(/[ºª]/g, 'O')
  .replace(/\s+/g, ' ')
  .trim();

// ============================================
// SOLAPAS
// ============================================
const SolapaResumen = ({ circuito, datos, padronTotal }) => {
  if (!datos) return null;
  const pctPadron = padronTotal > 0 ? ((datos.Padron_G23 / padronTotal) * 100).toFixed(2) : 0;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <MetricCard label="Padrón 2023" value={datos.Padron_G23?.toLocaleString() || '—'} subtitle={`(${pctPadron}% de Capital)`} />
        <MetricCard label="Participación Gob. 2023" value={formatPct(datos.Turnout_G23)} trend={`${formatPP(datos.Turnout_G23 - 0.67)} vs Capital`} trendPositive={(datos.Turnout_G23 - 0.67) > 0} />
        <MetricCard label="Δ Gob. 2023 vs Int. 2019" value={formatPP(datos.Efecto_ML / 100)} trend={datos.Crecio_vs_Capital ? 'mejor que Capital' : 'peor que Capital'} trendPositive={datos.Crecio_vs_Capital === 1} />
      </div>
      
      <div>
        <h4 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Tendencias electorales</h4>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '280px', padding: '18px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Tendencia Gobernador</div>
              <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Gob. 2019 → Gob. 2023</div>
            </div>
            <div style={{ display: 'inline-block', padding: '8px 16px', borderRadius: '8px', backgroundColor: datos.Residual_Gov >= 0 ? '#4CAF5022' : '#EF535022', color: datos.Residual_Gov >= 0 ? '#2E7D32' : '#C62828', fontSize: '14px', fontWeight: 600 }}>
              {formatPP(datos.Residual_Gov)} {datos.Residual_Gov >= 0 ? '▲' : '▼'}
            </div>
            <div style={{ marginTop: '20px', marginBottom: '16px' }}>
              <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Tendencia Legislativa</div>
              <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Dip. 2021 → Dip. 2025</div>
            </div>
            <div style={{ display: 'inline-block', padding: '8px 16px', borderRadius: '8px', backgroundColor: datos.Residual_Leg >= 0 ? '#4CAF5022' : '#EF535022', color: datos.Residual_Leg >= 0 ? '#2E7D32' : '#C62828', fontSize: '14px', fontWeight: 600 }}>
              {formatPP(datos.Residual_Leg)} {datos.Residual_Leg >= 0 ? '▲' : '▼'}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: '280px', padding: '18px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
            <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '16px' }}>Victorias (de 4 elecciones)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <VictoriaIndicator label="Gob. 2019" gano={datos.Gano_G19 === 1} />
              <VictoriaIndicator label="Gob. 2023" gano={datos.Gano_G23 === 1} />
              <VictoriaIndicator label="Dip. 2021" gano={datos.Gano_L21 === 1} />
              <VictoriaIndicator label="Dip. 2025" gano={datos.Gano_L25 === 1} />
            </div>
            <div style={{ marginTop: '18px', fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>{datos.Victorias_Total}/4</div>
          </div>
        </div>
      </div>
      
      <div style={{ padding: '18px 22px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '14px' }}>Última elección: Dip. 2025</div>
        <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div><span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>% Votos peronismo: </span><span style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>{formatPct(datos.Share_L25)}</span></div>
          <div><span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Posición: </span><span style={{ fontSize: '18px', fontWeight: 600, color: datos.Posicion_L25 === 1 ? '#2E7D32' : '#FF8F00' }}>{datos.Posicion_L25}°</span></div>
          <div><span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>vs Capital: </span><span style={{ fontSize: '14px', fontWeight: 500, color: (datos.Share_L25 - datos.ShareCap_L25) >= 0 ? '#2E7D32' : '#C62828' }}>{formatPP(datos.Share_L25 - datos.ShareCap_L25)}</span></div>
        </div>
      </div>
      
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '10px 18px', backgroundColor: datos.Volatilidad_Cat === 'Estable' ? '#4CAF5015' : datos.Volatilidad_Cat === 'Moderado' ? '#FF980015' : '#EF535015', borderRadius: '10px', alignSelf: 'flex-start' }}>
        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Estabilidad histórica:</span>
        <span style={{ fontSize: '14px', fontWeight: 600, color: datos.Volatilidad_Cat === 'Estable' ? '#2E7D32' : datos.Volatilidad_Cat === 'Moderado' ? '#E65100' : '#C62828' }}>{datos.Volatilidad_Cat}</span>
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
        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Evolución histórica del % de votos peronismo</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={mostrarCapital} onChange={(e) => setMostrarCapital(e.target.checked)} style={{ accentColor: '#1976D2', width: '18px', height: '18px' }} />
          Mostrar Capital
        </label>
      </div>
      
      <div style={{ padding: '20px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '28px', height: '3px', backgroundColor: '#1976D2', borderRadius: '2px' }} /><span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Circuito {circuito}</span></div>
          {mostrarCapital && <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '28px', height: '0', borderTop: '2px dashed #78909C' }} /><span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Capital</span></div>}
        </div>
      </div>
      
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>Resumen</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead><tr style={{ backgroundColor: 'var(--bg-secondary)' }}><th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Elección</th><th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Circuito</th><th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Capital</th><th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Diferencia</th><th style={{ padding: '12px 18px', textAlign: 'center', fontWeight: 500, color: 'var(--text-tertiary)' }}>Resultado</th></tr></thead>
            <tbody>
              {todasElecciones.map((row, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 18px', fontWeight: 500 }}>{row.label}</td>
                  <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 600 }}>{formatPct(row.share)}</td>
                  <td style={{ padding: '12px 18px', textAlign: 'right', color: 'var(--text-secondary)' }}>{formatPct(row.cap)}</td>
                  <td style={{ padding: '12px 18px', textAlign: 'right', color: row.share != null && row.cap != null ? ((row.share - row.cap) >= 0 ? '#2E7D32' : '#C62828') : 'var(--text-tertiary)', fontWeight: 500 }}>{row.share != null && row.cap != null ? formatPP(row.share - row.cap) : '—'}</td>
                  <td style={{ padding: '12px 18px', textAlign: 'center' }}>{row.gano != null ? <span style={{ display: 'inline-block', padding: '5px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: row.gano ? '#4CAF5022' : '#EF535022', color: row.gano ? '#2E7D32' : '#C62828' }}>{row.gano ? 'GANÓ' : 'PERDIÓ'}</span> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
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
        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Composición del voto por elección</span>
        <select value={eleccionSeleccionada} onChange={(e) => setEleccionSeleccionada(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer' }}>
          {elecciones.map(e => <option key={e} value={e}>{nombresEleccion[e]}</option>)}
        </select>
      </div>
      <div style={{ padding: '20px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        {elecciones.slice(0, 4).map(elec => {
          const parts = partidosCircuito[elec] || [];
          return (
            <div key={elec} style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '13px', color: elec === eleccionSeleccionada ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: elec === eleccionSeleccionada ? 600 : 400, minWidth: '80px' }}>{nombresEleccion[elec]}</span>
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
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '14px', height: '14px', borderRadius: '3px', backgroundColor: l.color }} /><span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{l.label}</span></div>
          ))}
        </div>
      </div>
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>Ranking {nombresEleccion[eleccionSeleccionada]}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead><tr style={{ backgroundColor: 'var(--bg-secondary)' }}><th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)', width: '50px' }}>#</th><th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Partido</th><th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Votos</th><th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>% Votos</th></tr></thead>
          <tbody>
            {partidosEleccion.map((p, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 18px' }}><div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: getColorPartido(p.partido, p.es_peronismo), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 600 }}>{i + 1}</div></td>
                <td style={{ padding: '12px 18px', fontWeight: p.es_peronismo ? 600 : 400, color: p.es_peronismo ? '#1565C0' : 'var(--text-primary)' }}>{p.partido.length > 40 ? p.partido.substring(0, 40) + '...' : p.partido}</td>
                <td style={{ padding: '12px 18px', textAlign: 'right' }}>{p.votos?.toLocaleString()}</td>
                <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 600 }}>{(p.share * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SolapaTerritorio = ({ circuito, datos, barrios, todosLosDatos, onSelectCircuito }) => {
  const mapkey = datos?.Mapkey;
  const barriosCircuito = barrios?.[mapkey] || [];
  const numeroBase = getNumeroBase(circuito);
  const vecinos = todosLosDatos?.filter(d => {
    if (d.CircuitoKey === circuito) return false;
    const numOtro = getNumeroBase(d.CircuitoKey);
    return numeroBase && numOtro && numeroBase === numOtro;
  }) || [];
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h4 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Barrios del circuito</h4>
        <div style={{ padding: '20px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          {barriosCircuito.length > 0 ? (
            <>
              <div style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-secondary)' }}>
                    <tr><th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Barrio</th><th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Población</th><th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>% en circuito</th></tr>
                  </thead>
                  <tbody>
                    {barriosCircuito.map((barrio, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)', backgroundColor: i === 0 ? '#1976D208' : 'transparent' }}>
                        <td style={{ padding: '10px 14px', fontWeight: i === 0 ? 600 : 400 }}>{barrio.nombre || barrio}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>{barrio.poblacion != null ? barrio.poblacion.toLocaleString() : '—'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>{barrio.porcentaje != null ? `${barrio.porcentaje.toFixed(1)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '12px 16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                Total barrios: <strong style={{ color: 'var(--text-primary)' }}>{barriosCircuito.length}</strong>
                <span style={{ margin: '0 14px' }}>│</span>
                Padrón: <strong style={{ color: 'var(--text-primary)' }}>{datos?.Padron_G23?.toLocaleString() || '—'}</strong>
              </div>
            </>
          ) : <div style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>No hay información de barrios disponible</div>}
        </div>
      </div>
      <div>
        <h4 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Circuitos de la zona ({vecinos.length} relacionados)</h4>
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead><tr style={{ backgroundColor: 'var(--bg-secondary)' }}><th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Circuito</th><th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Diagnóstico</th><th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>% Votos G23</th><th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Tendencia</th></tr></thead>
            <tbody>
              {vecinos.length > 0 ? vecinos.map((v, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => onSelectCircuito(v.CircuitoKey)} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <td style={{ padding: '12px 18px', fontWeight: 500 }}>{v.CircuitoKey} - {v.cirn_nom}</td>
                  <td style={{ padding: '12px 18px' }}><Badge categoria={v.Categoria_v4} tipo="v4" /></td>
                  <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 600 }}>{formatPct(v.Share_G23)}</td>
                  <td style={{ padding: '12px 18px', textAlign: 'right', color: v.Residual_Gov >= 0 ? '#2E7D32' : '#C62828', fontWeight: 500 }}>{v.Residual_Gov >= 0 ? '▲' : '▼'} {Math.abs(v.Residual_Gov * 100).toFixed(1)} pp</td>
                </tr>
              )) : <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>Este circuito no tiene variantes (A, B, C, etc.)</td></tr>}
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
        <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '14px', fontWeight: 600 }}>Comparativa Gobernador: 2019 vs 2023</h4>
        <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 160px', padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Gob. 2019</div><div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_G19)}</div><div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_G19}°</div></div>
            <div style={{ fontSize: '28px', color: '#1976D2' }}>→</div>
            <div style={{ flex: '1 1 160px', padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Gob. 2023</div><div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_G23)}</div><div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_G23}°</div></div>
            <div style={{ flex: '1 1 160px', padding: '20px', backgroundColor: (datos.Share_G23 - datos.Share_G19) >= 0 ? '#4CAF5018' : '#EF535018', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Variación</div><div style={{ fontSize: '32px', fontWeight: 700, color: (datos.Share_G23 - datos.Share_G19) >= 0 ? '#2E7D32' : '#C62828' }}>{formatPP(datos.Share_G23 - datos.Share_G19)}</div><div style={{ fontSize: '13px', color: datos.Residual_Gov >= 0 ? '#2E7D32' : '#C62828', marginTop: '6px' }}>vs Capital: {formatPP(datos.Residual_Gov)}</div></div>
          </div>
        </div>
      </div>
      
      <div>
        <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '14px', fontWeight: 600 }}>Evolución Llaryora: Int. 2019 → Gob. 2023</h4>
        <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 160px', padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Int. 2019</div><div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_Int19)}</div><div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_Int19}°</div></div>
            <div style={{ fontSize: '28px', color: '#1976D2' }}>→</div>
            <div style={{ flex: '1 1 160px', padding: '20px', backgroundColor: '#1976D218', border: '1px solid #1976D240', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '13px', color: '#1976D2', marginBottom: '10px' }}>Gob. 2023</div><div style={{ fontSize: '32px', fontWeight: 700, color: '#1565C0' }}>{formatPct(datos.Share_G23)}</div><div style={{ fontSize: '13px', color: '#1976D2', marginTop: '6px' }}>Posición: {datos.Posicion_G23}°</div></div>
            <div style={{ flex: '1 1 160px', padding: '20px', backgroundColor: datos.Crecio_vs_Capital ? '#4CAF5018' : '#EF535018', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Δ Circuito</div><div style={{ fontSize: '32px', fontWeight: 700, color: datos.Efecto_ML >= 0 ? '#2E7D32' : '#C62828' }}>{formatPP(datos.Efecto_ML / 100)}</div><div style={{ fontSize: '13px', color: datos.Crecio_vs_Capital ? '#2E7D32' : '#C62828', marginTop: '6px' }}>vs Capital: {formatPP(datos.Efecto_ML_vs_Capital / 100)}</div></div>
          </div>
          <div style={{ marginTop: '18px' }}><Badge categoria={datos.Categoria_ML} tipo="ml" /></div>
          {datos.Categoria_ML === 'ML.4' && <div style={{ marginTop: '12px', padding: '10px 14px', backgroundColor: '#26A69A15', borderRadius: '8px', fontSize: '13px', color: '#00695C' }}>ℹ️ ML subió su % de votos ({formatPP(datos.Efecto_ML / 100)}), pero perdió la elección por irrupción de terceros.</div>}
        </div>
      </div>
      
      <div>
        <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '14px', fontWeight: 600 }}>Efecto Schiaretti: Dip. 2021 → Dip. 2025</h4>
        <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 160px', padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Dip. 2021</div><div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_L21)}</div><div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_L21}°</div></div>
            <div style={{ fontSize: '28px', color: '#1976D2' }}>→</div>
            <div style={{ flex: '1 1 160px', padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Dip. 2025</div><div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_L25)}</div><div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_L25}°</div></div>
            <div style={{ flex: '1 1 160px', padding: '20px', backgroundColor: datos.Sch_Mejoro ? '#4CAF5018' : '#EF535018', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Δ Circuito</div><div style={{ fontSize: '32px', fontWeight: 700, color: datos.Sch_Efecto >= 0 ? '#2E7D32' : '#C62828' }}>{formatPP(datos.Sch_Efecto)}</div><div style={{ fontSize: '13px', color: datos.Sch_Efecto_vs_Capital >= 0 ? '#2E7D32' : '#C62828', marginTop: '6px' }}>vs Capital: {formatPP(datos.Sch_Efecto_vs_Capital)}</div></div>
          </div>
          <div style={{ marginTop: '18px' }}><span style={{ display: 'inline-block', padding: '7px 16px', borderRadius: '8px', backgroundColor: datos.Sch_Mejoro ? '#4CAF5022' : '#EF535022', color: datos.Sch_Mejoro ? '#2E7D32' : '#C62828', fontSize: '13px', fontWeight: 600 }}>{datos.Sch_Mejoro ? 'MEJORÓ' : 'EMPEORÓ'}</span></div>
        </div>
      </div>
      
      <div style={{ padding: '24px', backgroundColor: datos.Victorias_Total >= 2 ? '#4CAF5012' : '#EF535012', border: `1px solid ${datos.Victorias_Total >= 2 ? '#4CAF5040' : '#EF535040'}`, borderRadius: '12px' }}>
        <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '18px', fontWeight: 600 }}>Tendencias del circuito</h4>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '18px' }}>
          <div style={{ padding: '14px 18px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px' }}><div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Diagnóstico</div><Badge categoria={datos.Categoria_v4} tipo="v4" /></div>
          <div style={{ padding: '14px 18px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px' }}><div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Evolución Llaryora</div><Badge categoria={datos.Categoria_ML} tipo="ml" /></div>
          <div style={{ padding: '14px 18px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px' }}><div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Efecto legislativo</div><span style={{ fontSize: '14px', fontWeight: 600, color: datos.Sch_Mejoro ? '#2E7D32' : '#C62828' }}>{datos.Sch_Mejoro ? 'MEJORÓ' : 'EMPEORÓ'} ({formatPP(datos.Sch_Efecto)})</span></div>
        </div>
        <div style={{ fontSize: '15px', color: 'var(--text-primary)', fontWeight: 500 }}>{datos.Victorias_Total >= 3 ? '✓' : datos.Victorias_Total >= 2 ? '○' : '✗'} {datos.Victorias_Total >= 3 ? 'Circuito sólido para el oficialismo' : datos.Victorias_Total >= 2 ? 'Circuito con potencial de recuperación' : 'Circuito difícil, requiere estrategia específica'}</div>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '10px' }}>Ganó {datos.Victorias_Total}/4 elecciones. {datos.Crecio_vs_Capital ? 'Creció más que Capital con Llaryora.' : 'Creció menos que Capital con Llaryora.'} {datos.Sch_Mejoro ? 'Mejoró en legislativas.' : 'Empeoró en legislativas.'}</div>
      </div>
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
      <div style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)', borderRadius: '14px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>CÓRDOBA CAPITAL</h2>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '10px' }}>119 circuitos │ {totalPadron.toLocaleString()} electores</div>
      </div>
      
      <div style={{ padding: '20px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Resultados Capital - % Votos Peronismo</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[{ label: 'Gob. 2023', value: 0.458 }, { label: 'Gob. 2019', value: 0.515 }, { label: 'Dip. 2025', value: 0.255 }, { label: 'Dip. 2021', value: 0.222 }, { label: 'Int. 2019', value: 0.402 }].map(e => (
            <div key={e.label} style={{ flex: '1 1 140px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>{e.label}</div>
              <div style={{ fontSize: '22px', fontWeight: 600, color: e.value >= 0.45 ? '#2E7D32' : e.value >= 0.25 ? '#FF8F00' : '#C62828' }}>{formatPct(e.value)}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px' }}>
          <div><span style={{ color: 'var(--text-secondary)' }}>Tendencia Gob (19→23): </span><span style={{ color: '#C62828', fontWeight: 500 }}>-5.7 pp</span></div>
          <div><span style={{ color: 'var(--text-secondary)' }}>Tendencia Dip (21→25): </span><span style={{ color: '#2E7D32', fontWeight: 500 }}>+3.3 pp</span></div>
          <div><span style={{ color: 'var(--text-secondary)' }}>Efecto ML (Int19→G23): </span><span style={{ color: '#2E7D32', fontWeight: 500 }}>+5.6 pp</span></div>
        </div>
      </div>
      
      <div style={{ padding: '20px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          Filtrar por diagnóstico
          {filtroCategoria && <button onClick={() => setFiltroCategoria(null)} style={{ marginLeft: '12px', padding: '4px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕ Limpiar filtro</button>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {categoriasUnicas.map(([cat, config]) => (
            <div key={cat} onClick={() => setFiltroCategoria(filtroCategoria === cat ? null : cat)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '8px', backgroundColor: filtroCategoria === cat ? `${config.bg}30` : 'var(--bg-secondary)', border: filtroCategoria === cat ? `2px solid ${config.bg}` : '2px solid transparent', cursor: 'pointer', transition: 'all 0.2s' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '4px', backgroundColor: config.bg }} />
              <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: filtroCategoria === cat ? 600 : 400 }}>{config.label} ({conteoCategoria[cat] || 0})</span>
            </div>
          ))}
        </div>
      </div>
      
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{filtroCategoria ? `Mostrando ${datosFiltrados.length} circuitos` : 'Todos los circuitos (119)'}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Click en columna para ordenar</span>
        </div>
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
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
        <span style={{ fontSize: '15px', color: '#1565C0' }}>Hacé click en el mapa o en una fila para ver el detalle del circuito</span>
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

const ResumenCircuitoMini = ({ datos, padronTotal }) => {
  if (!datos) {
    return <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin circuito asociado.</div>;
  }
  const pctPadron = padronTotal > 0 ? ((datos.Padron_G23 / padronTotal) * 100).toFixed(1) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Circuito {datos.CircuitoKey}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{datos.cirn_nom}</div>
      </div>
      <Badge categoria={datos.Categoria_v4} tipo="v4" />
      <MetricCardMini label="Padrón 2023" value={datos.Padron_G23?.toLocaleString() || '—'} subtitle={`${pctPadron}% Capital`} />
      <MetricCardMini label="Participación G23" value={formatPct(datos.Turnout_G23)} trend={`${formatPP(datos.Turnout_G23 - 0.67)} vs Capital`} trendPositive={(datos.Turnout_G23 - 0.67) > 0} />
      <MetricCardMini label="Tendencia Gob. 19→23" value={formatPP(datos.Residual_Gov)} trendPositive={datos.Residual_Gov >= 0} />
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

const PanelMiniCircuito = ({ datos, padronTotal, onVerFicha, cruceData, barriosGeoLookup, barrioSeleccionado, onSelectBarrio }) => {
  if (!datos) {
    return <div style={{ padding: '16px 4px', fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>Hacé click en un circuito del mapa para ver su resumen.</div>;
  }
  const clave = `${datos.Mapkey} - ${datos.cirn_nom}`;
  const claveSel = barrioSeleccionado ? normalizarNombreBarrio(barrioSeleccionado) : null;
  const otrosBarrios = (cruceData?.circuito_to_barrios?.[clave] || [])
    .filter(b => normalizarNombreBarrio(b.barrio_normalizado) !== claveSel)
    .sort((a, b) => a.orden_importancia - b.orden_importancia);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <ResumenCircuitoMini datos={datos} padronTotal={padronTotal} />
      <button onClick={onVerFicha} style={{ padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#1976D2', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Ver ficha completa →</button>
      <ListaCruceColapsable
        titulo="Otros barrios en este circuito"
        items={otrosBarrios.map((b, i) => (
          <FilaCruce
            key={i}
            label={b.barrio}
            sublabel={`${b.pct_poblacion_en_circuito?.toFixed(1)}% del circuito`}
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

const PanelMiniBarrio = ({ nombreBarrio, barriosGeoLookup, todosLosDatos, padronTotal, datosCircuito, cruceData, onSelectCircuito }) => {
  if (!nombreBarrio) {
    return <div style={{ padding: '16px 4px', fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>Hacé click en un barrio del mapa para ver su info.</div>;
  }
  const key = normalizarNombreBarrio(nombreBarrio);
  const props = barriosGeoLookup[key];
  if (!props) {
    return <div style={{ padding: '16px 4px', fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>Sin datos para "{nombreBarrio}".</div>;
  }
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
      <MetricCardMini label="Población" value={props.poblacion != null ? props.poblacion.toLocaleString() : '—'} subtitle={props.pct_poblacion_en_circuito != null ? `${props.pct_poblacion_en_circuito.toFixed(1)}% del circuito` : undefined} />

      <div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>Circuito</div>
        {datosCircuito ? (
          <ResumenCircuitoMini datos={datosCircuito} padronTotal={padronTotal} />
        ) : props.circuito_principal ? (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{props.circuito_principal}</div>
        ) : (
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin circuito asociado.</div>
        )}
      </div>

      <ListaCruceColapsable
        titulo="Otros circuitos en este barrio"
        items={otrosCircuitos.map((c, i) => (
          <FilaCruce
            key={i}
            label={c.circuito.split(' - ').slice(1).join(' - ')}
            sublabel={`≈${c.pct_poblacion_en_circuito?.toFixed(1)}% de la población del barrio`}
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

const PanelLateral = ({ panelTab, setPanelTab, datosCircuito, padronTotal, onVerFicha, barrioSeleccionado, barriosGeoLookup, todosLosDatos, cruceData, onSelectBarrio, onSelectCircuito }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
      <button onClick={() => setPanelTab('circuito')} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', backgroundColor: panelTab === 'circuito' ? '#1976D2' : 'var(--bg-secondary)', color: panelTab === 'circuito' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Circuito</button>
      <button onClick={() => setPanelTab('barrio')} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', backgroundColor: panelTab === 'barrio' ? '#1976D2' : 'var(--bg-secondary)', color: panelTab === 'barrio' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Barrio</button>
    </div>
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {panelTab === 'circuito'
        ? <PanelMiniCircuito datos={datosCircuito} padronTotal={padronTotal} onVerFicha={onVerFicha} cruceData={cruceData} barriosGeoLookup={barriosGeoLookup} barrioSeleccionado={barrioSeleccionado} onSelectBarrio={onSelectBarrio} />
        : <PanelMiniBarrio nombreBarrio={barrioSeleccionado} barriosGeoLookup={barriosGeoLookup} todosLosDatos={todosLosDatos} padronTotal={padronTotal} datosCircuito={datosCircuito} cruceData={cruceData} onSelectCircuito={onSelectCircuito} />}
    </div>
  </div>
);

// ============================================
// FUNCIÓN EXPORTAR FICHA PDF MEJORADA
// ============================================
const generarFichaPDF = (datos, barrios, partidos, padronTotal) => {
  const mapkey = datos.Mapkey;
  const barriosCircuito = barrios?.[mapkey] || [];
  const pctPadron = padronTotal > 0 ? ((datos.Padron_G23 / padronTotal) * 100).toFixed(2) : 0;
  const partidosG23 = partidos?.[datos.CircuitoKey]?.['G23'] || [];
  const partidosL25 = partidos?.[datos.CircuitoKey]?.['L25'] || [];
  
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
<style>
*{margin:0;padding:0;box-sizing:border-box}
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
.footer{margin-top:30px;padding-top:16px;border-top:1px solid #e0e0e0;font-size:10px;color:#999;text-align:center}
@media print{body{padding:15px}}
</style></head><body>

<div class="header">
  <h1>CIRCUITO ${datos.CircuitoKey}</h1>
  <h2>${datos.cirn_nom}</h2>
  <div class="badges">
    <span class="badge" style="background:${COLORES_CATEGORIA[datos.Categoria_v4]?.bg}22;color:${COLORES_CATEGORIA[datos.Categoria_v4]?.text}">${COLORES_CATEGORIA[datos.Categoria_v4]?.label || datos.Categoria_v4}</span>
    <span class="badge" style="background:${COLORES_ML[datos.Categoria_ML]?.bg}22;color:${COLORES_ML[datos.Categoria_ML]?.text}">${COLORES_ML[datos.Categoria_ML]?.label || datos.Categoria_ML}</span>
  </div>
</div>

<div class="metrics">
  <div class="metric"><div class="metric-label">Padrón 2023</div><div class="metric-value">${datos.Padron_G23?.toLocaleString() || '—'}</div><div class="metric-sub">${pctPadron}% de Capital</div></div>
  <div class="metric"><div class="metric-label">Victorias</div><div class="metric-value">${datos.Victorias_Total}/4</div></div>
  <div class="metric"><div class="metric-label">Gob. 2023</div><div class="metric-value ${datos.Share_G23 >= 0.5 ? 'green' : 'red'}">${(datos.Share_G23 * 100).toFixed(1)}%</div></div>
  <div class="metric"><div class="metric-label">Dip. 2025</div><div class="metric-value ${datos.Share_L25 >= 0.3 ? 'green' : 'red'}">${(datos.Share_L25 * 100).toFixed(1)}%</div></div>
</div>

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
  <div style="display:flex;flex-wrap:wrap;gap:6px">
    ${barriosCircuito.slice(0, 12).map(b => `<span style="padding:4px 10px;background:#f5f5f5;border-radius:4px;font-size:11px">${b.nombre || b}</span>`).join('')}
    ${barriosCircuito.length > 12 ? `<span style="padding:4px 10px;font-size:11px;color:#666">+${barriosCircuito.length - 12} más</span>` : ''}
  </div>
</div>
` : ''}

<div class="footer">Diagnóstico Territorial - Córdoba Capital │ Generado el ${new Date().toLocaleDateString('es-AR')}</div>
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
  const [cargando, setCargando] = useState(true);
  const [filtroCategoria, setFiltroCategoria] = useState(null);
  const [mostrarInfo, setMostrarInfo] = useState(false);
  const [vistaExpandida, setVistaExpandida] = useState(false);
  const [barrioSeleccionado, setBarrioSeleccionado] = useState(null);
  const [panelTab, setPanelTab] = useState('circuito');

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const [datosRes, partidosRes, barriosRes, geoRes, barriosGeoRes, obrasRes, cruceRes] = await Promise.all([
          fetch('/data/circuitos_completo.json'), fetch('/data/partidos_por_eleccion.json'),
          fetch('/data/barrios_por_circuito.json'), fetch('/data/circuitos_cordoba.json'),
          fetch('/data/barrios_geo.json'), fetch('/data/obras_largo.json'),
          fetch('/data/circuito_barrios_cruce.json'),
        ]);
        setDatos(await datosRes.json()); setPartidos(await partidosRes.json());
        setBarrios(await barriosRes.json()); setGeoData(await geoRes.json());
        setBarriosGeoData(await barriosGeoRes.json()); setObrasData(await obrasRes.json());
        setCruceData(await cruceRes.json());
      } catch (e) { console.error('Error cargando datos:', e); }
      setCargando(false);
    };
    cargarDatos();
  }, []);

  const datosCircuito = useMemo(() => datos.find(d => d.CircuitoKey === circuitoSeleccionado), [datos, circuitoSeleccionado]);
  const circuitosFiltrados = useMemo(() => {
    if (!busqueda) return [];
    const lower = busqueda.toLowerCase();
    return datos.filter(d => d.CircuitoKey?.toString().toLowerCase().includes(lower) || d.cirn_nom?.toLowerCase().includes(lower)).slice(0, 10);
  }, [datos, busqueda]);
  const padronTotal = useMemo(() => datos.reduce((sum, d) => sum + (d.Padron_G23 || 0), 0), [datos]);

  const barriosGeoLookup = useMemo(() => {
    const lookup = {};
    (barriosGeoData?.features || []).forEach(f => {
      const key = normalizarNombreBarrio(f.properties?.nombre_barrio);
      if (key) lookup[key] = f.properties;
    });
    return lookup;
  }, [barriosGeoData]);

  // Selección de circuito por vías no geográficas (buscador, tabla, "zona", links del panel):
  // no hay un punto clickeado, así que el barrio se deriva del principal según el cruce (orden_importancia: 1).
  const handleSelectCircuito = (c) => {
    setCircuitoSeleccionado(c);
    setFiltroCategoria(null);
    setPanelTab('circuito');
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
  const handleSelectBarrio = (nombre) => { setBarrioSeleccionado(nombre); setPanelTab('barrio'); };

  const solapas = [{ key: 'resumen', label: 'Resumen' }, { key: 'evolucion', label: 'Evolución' }, { key: 'partidos', label: 'Partidos' }, { key: 'territorio', label: 'Territorio' }, { key: 'comparativas', label: 'Comparativas' }];

  const exportarPDF = () => {
    if (!datosCircuito) return;
    const html = generarFichaPDF(datosCircuito, barrios, partidos, padronTotal);
    const ventana = window.open('', '_blank');
    ventana.document.write(html);
    ventana.document.close();
    setTimeout(() => ventana.print(), 500);
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

      <div style={{ minHeight: '100vh' }}>
        <header style={{ padding: '14px 24px', backgroundColor: '#fff', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 1000 }}>
          <div>
            <h1 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)' }}>Diagnóstico Territorial</h1>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px' }}>Córdoba Capital — 119 circuitos</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button onClick={() => setMostrarInfo(true)} style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>ℹ️ Info</button>
            {!(vistaExpandida && !circuitoSeleccionado) && <button onClick={() => { setVistaExpandida(true); setCircuitoSeleccionado(null); }} style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>📊 Estadísticas de Capital</button>}
            {circuitoSeleccionado && <button onClick={exportarPDF} style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>📄 Exportar ficha</button>}
            <div style={{ position: 'relative' }}>
              <input type="text" placeholder="Buscar circuito..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ padding: '12px 18px', paddingLeft: '44px', width: '300px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '15px', backgroundColor: 'var(--bg-secondary)' }} />
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: '16px' }}>🔍</span>
              {busqueda && circuitosFiltrados.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid var(--border)', borderRadius: '10px', marginTop: '6px', maxHeight: '350px', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 9999 }}>
                  {circuitosFiltrados.map(d => (
                    <div key={d.CircuitoKey} onClick={() => { handleSelectCircuito(d.CircuitoKey); setBusqueda(''); }} style={{ padding: '14px 18px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '15px' }}><strong>{d.CircuitoKey}</strong> - {d.cirn_nom}</span>
                      <Badge categoria={d.Categoria_v4} tipo="v4" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        <div style={{ display: 'flex', height: 'calc(100vh - 76px)' }}>
          {vistaExpandida ? (
            <>
              <div style={{ flex: '1', padding: '18px', overflowY: 'auto' }}>
                {circuitoSeleccionado && datosCircuito ? (
                  <>
                    <div style={{ padding: '16px 20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>CIRCUITO {circuitoSeleccionado}</h2>
                          <button onClick={() => { setCircuitoSeleccionado(null); setFiltroCategoria(null); setVistaExpandida(false); }} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕ Cerrar</button>
                          <button onClick={() => setVistaExpandida(false)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Volver al mapa</button>
                        </div>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '6px' }}>{datosCircuito.cirn_nom}</p>
                      </div>
                      <Badge categoria={datosCircuito.Categoria_v4} tipo="v4" />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                      {solapas.map(s => <button key={s.key} onClick={() => setSolapaActiva(s.key)} style={{ padding: '10px 18px', borderRadius: '8px', border: 'none', backgroundColor: solapaActiva === s.key ? '#1976D2' : 'transparent', color: solapaActiva === s.key ? '#fff' : 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}>{s.label}</button>)}
                    </div>
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', minHeight: '400px' }}>
                      {solapaActiva === 'resumen' && <SolapaResumen circuito={circuitoSeleccionado} datos={datosCircuito} padronTotal={padronTotal} />}
                      {solapaActiva === 'evolucion' && <SolapaEvolucion circuito={circuitoSeleccionado} datos={datosCircuito} />}
                      {solapaActiva === 'partidos' && <SolapaPartidos circuito={circuitoSeleccionado} datos={datosCircuito} partidos={partidos} />}
                      {solapaActiva === 'territorio' && <SolapaTerritorio circuito={circuitoSeleccionado} datos={datosCircuito} barrios={barrios} todosLosDatos={datos} onSelectCircuito={handleSelectCircuito} />}
                      {solapaActiva === 'comparativas' && <SolapaComparativas circuito={circuitoSeleccionado} datos={datosCircuito} />}
                    </div>
                  </>
                ) : (
                  <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px' }}>
                    <div style={{ marginBottom: '16px' }}>
                      <button onClick={() => setVistaExpandida(false)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Volver al mapa</button>
                    </div>
                    <VistaCapital datos={datos} onSelectCircuito={handleSelectCircuito} filtroCategoria={filtroCategoria} setFiltroCategoria={setFiltroCategoria} />
                  </div>
                )}
              </div>

              <div style={{ width: '320px', flexShrink: 0, padding: '18px', paddingLeft: '0', position: 'relative', zIndex: 1 }}>
                <div style={{ height: '100%', backgroundColor: '#fff', borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                  <MapaCircuitos datos={datos} geoData={geoData} barriosGeoData={barriosGeoData} obrasData={obrasData} circuitoSeleccionado={circuitoSeleccionado} onSelectCircuito={handleSelectCircuito} barrioSeleccionado={barrioSeleccionado} onSelectBarrio={handleSelectBarrio} filtroCategoria={filtroCategoria} setFiltroCategoria={setFiltroCategoria} coloresCategoria={COLORES_CATEGORIA} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ flex: '1', padding: '18px' }}>
                <div style={{ height: '100%', backgroundColor: '#fff', borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                  <MapaCircuitos datos={datos} geoData={geoData} barriosGeoData={barriosGeoData} obrasData={obrasData} circuitoSeleccionado={circuitoSeleccionado} onSelectCircuito={handleSelectCircuito} barrioSeleccionado={barrioSeleccionado} onSelectBarrio={handleSelectBarrio} filtroCategoria={filtroCategoria} setFiltroCategoria={setFiltroCategoria} coloresCategoria={COLORES_CATEGORIA} />
                </div>
              </div>

              <div style={{ width: '300px', flexShrink: 0, padding: '18px', paddingLeft: '0' }}>
                <div style={{ height: '100%', backgroundColor: '#fff', borderRadius: '12px', padding: '16px', overflowY: 'auto' }}>
                  <PanelLateral
                    panelTab={panelTab}
                    setPanelTab={setPanelTab}
                    datosCircuito={datosCircuito}
                    padronTotal={padronTotal}
                    onVerFicha={() => setVistaExpandida(true)}
                    barrioSeleccionado={barrioSeleccionado}
                    barriosGeoLookup={barriosGeoLookup}
                    todosLosDatos={datos}
                    cruceData={cruceData}
                    onSelectBarrio={handleSelectBarrio}
                    onSelectCircuito={handleSelectCircuito}
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
