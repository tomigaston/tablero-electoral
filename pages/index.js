import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';

// Importar mapa dinámicamente
const MapaCircuitos = dynamic(() => import('../components/MapaCircuitos'), { 
  ssr: false,
  loading: () => (
    <div style={{
      flex: 1,
      backgroundColor: 'var(--bg-secondary)',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-tertiary)',
    }}>
      Cargando mapa...
    </div>
  )
});

// ============================================
// PALETA DE COLORES
// ============================================
const COLORES_CATEGORIA = {
  'A.1': { bg: '#4CAF50', text: '#1B5E20', label: 'BASTIÓN SÓLIDO' },
  'A.2': { bg: '#FFCA28', text: '#F57F17', label: 'BASTIÓN CON EROSIÓN' },
  'B.1': { bg: '#26A69A', text: '#00695C', label: 'TERRITORIO LEAL' },
  'B.3': { bg: '#FF7043', text: '#BF360C', label: 'PÉRDIDA 2023' },
  'B.2': { bg: '#78909C', text: '#37474F', label: 'EN DISPUTA' },
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

// Datos de Capital (promedios)
const DATOS_CAPITAL = {
  Share_G07: 0.253, Share_G11: 0.336, Share_G15: 0.312, Share_G19: 0.515, Share_G23: 0.458,
  Share_L21: 0.222, Share_L23: 0.307, Share_L25: 0.255, Share_Int19: 0.402,
};

// ============================================
// COMPONENTES REUTILIZABLES
// ============================================
const Badge = ({ categoria, tipo = 'v4', onClick, clickable = false }) => {
  const colores = tipo === 'v4' ? COLORES_CATEGORIA : COLORES_ML;
  const config = colores[categoria] || { bg: '#9E9E9E', text: '#424242', label: categoria };
  
  return (
    <span 
      onClick={clickable ? onClick : undefined}
      style={{
        display: 'inline-block',
        padding: '5px 14px',
        borderRadius: '6px',
        backgroundColor: `${config.bg}22`,
        color: config.text,
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.3px',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'all 0.2s',
        border: clickable ? `1px solid ${config.bg}40` : 'none',
      }}
    >
      {config.label}
    </span>
  );
};

const MetricCard = ({ label, value, subtitle, trend, trendPositive }) => (
  <div style={{
    flex: 1,
    minWidth: '180px',
    padding: '18px 22px',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: '12px',
  }}>
    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
      {label}
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '28px', fontWeight: 600, color: 'var(--text-primary)' }}>
        {value}
      </span>
      {subtitle && (
        <span style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>{subtitle}</span>
      )}
    </div>
    {trend && (
      <div style={{ 
        marginTop: '8px', 
        fontSize: '13px', 
        color: trendPositive ? '#2E7D32' : '#C62828',
        fontWeight: 500,
      }}>
        {trendPositive ? '▲' : '▼'} {trend}
      </div>
    )}
  </div>
);

const VictoriaIndicator = ({ label, gano }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
    <span style={{ fontSize: '14px', color: 'var(--text-secondary)', minWidth: '75px' }}>{label}</span>
    <div style={{
      width: '24px',
      height: '24px',
      borderRadius: '50%',
      backgroundColor: gano ? '#4CAF50' : '#EF5350',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: '13px',
      fontWeight: 600,
    }}>
      {gano ? '✓' : '✗'}
    </div>
  </div>
);

// Helper para formatear
const formatPct = (val) => val != null ? `${(val * 100).toFixed(1)}%` : '—';
const formatPP = (val) => val != null ? `${val > 0 ? '+' : ''}${(val * 100).toFixed(1)} pp` : '—';

// ============================================
// SOLAPA RESUMEN
// ============================================
const SolapaResumen = ({ circuito, datos }) => {
  if (!datos) return null;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <MetricCard 
          label="Padrón 2023"
          value={datos.Padron_G23?.toLocaleString() || '—'}
          subtitle="electores"
        />
        <MetricCard 
          label="Participación Gob. 2023"
          value={formatPct(datos.Turnout_G23)}
          trend={`${formatPP(datos.Turnout_G23 - 0.67)} vs Capital`}
          trendPositive={(datos.Turnout_G23 - 0.67) > 0}
        />
        <MetricCard 
          label="Δ Gob. 2023 vs Int. 2019"
          value={formatPP(datos.Efecto_ML / 100)}
          trend={datos.Crecio_vs_Capital ? 'mejor que Capital' : 'peor que Capital'}
          trendPositive={datos.Crecio_vs_Capital === 1}
        />
      </div>
      
      <div>
        <h4 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>
          Tendencias electorales
        </h4>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{
            flex: 1,
            minWidth: '280px',
            padding: '18px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
          }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Tendencia Gobernador</div>
              <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Gob. 2019 → Gob. 2023</div>
            </div>
            <div style={{
              display: 'inline-block',
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: datos.Residual_Gov >= 0 ? '#4CAF5022' : '#EF535022',
              color: datos.Residual_Gov >= 0 ? '#2E7D32' : '#C62828',
              fontSize: '14px',
              fontWeight: 600,
            }}>
              {formatPP(datos.Residual_Gov)} {datos.Residual_Gov >= 0 ? '▲' : '▼'}
            </div>
            
            <div style={{ marginTop: '20px', marginBottom: '16px' }}>
              <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Tendencia Legislativa</div>
              <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Dip. 2021 → Dip. 2025</div>
            </div>
            <div style={{
              display: 'inline-block',
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: datos.Residual_Leg >= 0 ? '#4CAF5022' : '#EF535022',
              color: datos.Residual_Leg >= 0 ? '#2E7D32' : '#C62828',
              fontSize: '14px',
              fontWeight: 600,
            }}>
              {formatPP(datos.Residual_Leg)} {datos.Residual_Leg >= 0 ? '▲' : '▼'}
            </div>
          </div>
          
          <div style={{
            flex: 1,
            minWidth: '280px',
            padding: '18px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
          }}>
            <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '16px' }}>
              Victorias (de 4 elecciones)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <VictoriaIndicator label="Gob. 2019" gano={datos.Gano_G19 === 1} />
              <VictoriaIndicator label="Gob. 2023" gano={datos.Gano_G23 === 1} />
              <VictoriaIndicator label="Dip. 2021" gano={datos.Gano_L21 === 1} />
              <VictoriaIndicator label="Dip. 2025" gano={datos.Gano_L25 === 1} />
            </div>
            <div style={{ marginTop: '18px', fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>
              {datos.Victorias_Total}/4
            </div>
          </div>
        </div>
      </div>
      
      <div style={{
        padding: '18px 22px',
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
      }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '14px' }}>Última elección: Dip. 2025</div>
        <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Share peronismo: </span>
            <span style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>{formatPct(datos.Share_L25)}</span>
          </div>
          <div>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Posición: </span>
            <span style={{ fontSize: '18px', fontWeight: 600, color: datos.Posicion_L25 === 1 ? '#2E7D32' : '#FF8F00' }}>{datos.Posicion_L25}°</span>
          </div>
          <div>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>vs Capital: </span>
            <span style={{ fontSize: '14px', fontWeight: 500, color: (datos.Share_L25 - datos.ShareCap_L25) >= 0 ? '#2E7D32' : '#C62828' }}>
              {formatPP(datos.Share_L25 - datos.ShareCap_L25)}
            </span>
          </div>
        </div>
      </div>
      
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 18px',
        backgroundColor: datos.Volatilidad_Cat === 'Estable' ? '#4CAF5015' : datos.Volatilidad_Cat === 'Moderado' ? '#FF980015' : '#EF535015',
        borderRadius: '10px',
        alignSelf: 'flex-start',
      }}>
        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Estabilidad histórica:</span>
        <span style={{ fontSize: '14px', fontWeight: 600, color: datos.Volatilidad_Cat === 'Estable' ? '#2E7D32' : datos.Volatilidad_Cat === 'Moderado' ? '#E65100' : '#C62828' }}>
          {datos.Volatilidad_Cat}
        </span>
      </div>
    </div>
  );
};

// ============================================
// SOLAPA EVOLUCIÓN
// ============================================
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
  const chartHeight = 200;
  const chartWidth = 600;
  const padding = { left: 50, right: 25, top: 25, bottom: 50 };
  
  const getY = (val) => val == null ? null : padding.top + (1 - val / Math.min(maxShare * 1.15, 1)) * chartHeight;
  const getX = (idx) => padding.left + (idx / (elecciones.length - 1)) * (chartWidth - padding.left - padding.right);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Evolución histórica del share peronismo</span>
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
          
          {mostrarCapital && (
            <polyline points={elecciones.filter(e => e.shareCap != null).map((e) => `${getX(elecciones.indexOf(e))},${getY(e.shareCap)}`).join(' ')} fill="none" stroke="#78909C" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" />
          )}
          
          <polyline points={elecciones.filter(e => e.share != null).map((e) => `${getX(elecciones.indexOf(e))},${getY(e.share)}`).join(' ')} fill="none" stroke="#1976D2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          
          {elecciones.map((e, i) => e.share != null && (
            <circle key={e.key} cx={getX(i)} cy={getY(e.share)} r="6" fill="#1976D2" stroke="#fff" strokeWidth="2" />
          ))}
          
          {elecciones.map((e, i) => (
            <g key={e.key}>
              <text x={getX(i)} y={chartHeight + padding.top + 22} textAnchor="middle" fontSize="12" fill={e.highlight ? 'var(--text-primary)' : 'var(--text-tertiary)'} fontWeight={e.highlight ? 600 : 400}>{e.label.split(' ')[0]}</text>
              <text x={getX(i)} y={chartHeight + padding.top + 38} textAnchor="middle" fontSize="11" fill={e.highlight ? 'var(--text-primary)' : 'var(--text-tertiary)'}>{e.label.split(' ')[1]}</text>
            </g>
          ))}
        </svg>
        
        <div style={{ display: 'flex', gap: '28px', marginTop: '16px', paddingLeft: '50px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '28px', height: '3px', backgroundColor: '#1976D2', borderRadius: '2px' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Circuito {circuito}</span>
          </div>
          {mostrarCapital && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '28px', height: '0', borderTop: '2px dashed #78909C' }} />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Capital</span>
            </div>
          )}
        </div>
      </div>
      
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>Resumen numérico</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Elección</th>
                <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Circuito</th>
                <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Capital</th>
                <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Diferencia</th>
                <th style={{ padding: '12px 18px', textAlign: 'center', fontWeight: 500, color: 'var(--text-tertiary)' }}>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Gob. 2023', share: datos.Share_G23, cap: datos.ShareCap_G23, gano: datos.Gano_G23 },
                { label: 'Gob. 2019', share: datos.Share_G19, cap: datos.ShareCap_G19, gano: datos.Gano_G19 },
                { label: 'Dip. 2025', share: datos.Share_L25, cap: datos.ShareCap_L25, gano: datos.Gano_L25 },
                { label: 'Dip. 2021', share: datos.Share_L21, cap: datos.ShareCap_L21, gano: datos.Gano_L21 },
              ].map((row, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 18px', fontWeight: 500 }}>{row.label}</td>
                  <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 600 }}>{formatPct(row.share)}</td>
                  <td style={{ padding: '12px 18px', textAlign: 'right', color: 'var(--text-secondary)' }}>{formatPct(row.cap)}</td>
                  <td style={{ padding: '12px 18px', textAlign: 'right', color: (row.share - row.cap) >= 0 ? '#2E7D32' : '#C62828', fontWeight: 500 }}>
                    {row.share != null && row.cap != null ? `${(row.share - row.cap) >= 0 ? '+' : ''}${((row.share - row.cap) * 100).toFixed(1)} pp` : '—'}
                  </td>
                  <td style={{ padding: '12px 18px', textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', padding: '5px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: row.gano ? '#4CAF5022' : '#EF535022', color: row.gano ? '#2E7D32' : '#C62828' }}>
                      {row.gano ? 'GANÓ' : 'PERDIÓ'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================
// SOLAPA PARTIDOS
// ============================================
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
          {elecciones.map(e => (<option key={e} value={e}>{nombresEleccion[e]}</option>))}
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
                      {p.share > 0.08 && (<span style={{ fontSize: '11px', color: '#fff', fontWeight: 500 }}>{(p.share * 100).toFixed(0)}%</span>)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
          {[{ label: 'Peronismo', color: '#1565C0' }, { label: 'JxC/Cambiemos', color: '#FFC107' }, { label: 'LLA', color: '#7B1FA2' }, { label: 'FdT/UP', color: '#E53935' }, { label: 'Otros', color: '#78909C' }].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '3px', backgroundColor: l.color }} />
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>Ranking {nombresEleccion[eleccionSeleccionada]}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)', width: '50px' }}>#</th>
              <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Partido</th>
              <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Votos</th>
              <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {partidosEleccion.map((p, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 18px' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: getColorPartido(p.partido, p.es_peronismo), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 600 }}>{i + 1}</div>
                </td>
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

// ============================================
// SOLAPA TERRITORIO (con estadísticas de barrios)
// ============================================
const SolapaTerritorio = ({ circuito, datos, barrios, todosLosDatos }) => {
  const mapkey = datos?.Mapkey;
  const barriosCircuito = barrios?.[mapkey] || [];
  
  const vecinos = todosLosDatos?.filter(d => {
    if (d.CircuitoKey === circuito) return false;
    const baseActual = datos?.Mapkey?.substring(0, 2);
    const baseOtro = d.Mapkey?.substring(0, 2);
    return baseActual && baseOtro && baseActual === baseOtro;
  }).slice(0, 5) || [];
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h4 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Barrios del circuito</h4>
        <div style={{ padding: '20px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          {barriosCircuito.length > 0 ? (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', marginBottom: '16px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Barrio</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Población</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>% en circuito</th>
                  </tr>
                </thead>
                <tbody>
                  {barriosCircuito.map((barrio, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)', backgroundColor: i === 0 ? '#1976D208' : 'transparent' }}>
                      <td style={{ padding: '10px 14px', fontWeight: i === 0 ? 600 : 400 }}>{barrio.nombre}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>{barrio.poblacion?.toLocaleString()}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>{barrio.porcentaje?.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '12px 16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                Total barrios: <strong style={{ color: 'var(--text-primary)' }}>{barriosCircuito.length}</strong>
                <span style={{ margin: '0 14px' }}>│</span>
                Padrón: <strong style={{ color: 'var(--text-primary)' }}>{datos?.Padron_G23?.toLocaleString() || '—'}</strong>
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>No hay información de barrios disponible</div>
          )}
        </div>
      </div>
      
      <div>
        <h4 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Circuitos de la zona</h4>
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Circuito</th>
                <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Diagnóstico</th>
                <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Share G23</th>
                <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Tendencia</th>
              </tr>
            </thead>
            <tbody>
              {vecinos.length > 0 ? vecinos.map((v, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 18px', fontWeight: 500 }}>{v.CircuitoKey} - {v.cirn_nom}</td>
                  <td style={{ padding: '12px 18px' }}><Badge categoria={v.Categoria_v4} tipo="v4" /></td>
                  <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 600 }}>{formatPct(v.Share_G23)}</td>
                  <td style={{ padding: '12px 18px', textAlign: 'right', color: v.Residual_Gov >= 0 ? '#2E7D32' : '#C62828', fontWeight: 500 }}>
                    {v.Residual_Gov >= 0 ? '▲' : '▼'} {Math.abs(v.Residual_Gov * 100).toFixed(1)} pp
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>No hay circuitos vecinos disponibles</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================
// SOLAPA COMPARATIVAS
// ============================================
const SolapaComparativas = ({ circuito, datos }) => {
  if (!datos) return null;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Bloque Llaryora */}
      <div>
        <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '14px', fontWeight: 600 }}>Evolución Llaryora: Int. 2019 → Gob. 2023</h4>
        <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 160px', padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Int. 2019</div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_Int19)}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_Int19}°</div>
            </div>
            <div style={{ fontSize: '28px', color: '#1976D2' }}>→</div>
            <div style={{ flex: '1 1 160px', padding: '20px', backgroundColor: '#1976D218', border: '1px solid #1976D240', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: '#1976D2', marginBottom: '10px' }}>Gob. 2023</div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#1565C0' }}>{formatPct(datos.Share_G23)}</div>
              <div style={{ fontSize: '13px', color: '#1976D2', marginTop: '6px' }}>Posición: {datos.Posicion_G23}°</div>
            </div>
            <div style={{ flex: '1 1 160px', padding: '20px', backgroundColor: datos.Crecio_vs_Capital ? '#4CAF5018' : '#EF535018', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Δ Circuito</div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: datos.Efecto_ML >= 0 ? '#2E7D32' : '#C62828' }}>{formatPP(datos.Efecto_ML / 100)}</div>
              <div style={{ fontSize: '13px', color: datos.Crecio_vs_Capital ? '#2E7D32' : '#C62828', marginTop: '6px' }}>vs Capital: {formatPP(datos.Efecto_ML_vs_Capital / 100)}</div>
            </div>
          </div>
          <div style={{ marginTop: '18px' }}><Badge categoria={datos.Categoria_ML} tipo="ml" /></div>
          {/* Nota especial para AVANCE CON DERROTA */}
          {datos.Categoria_ML === 'ML.4' && (
            <div style={{ marginTop: '12px', padding: '10px 14px', backgroundColor: '#26A69A15', borderRadius: '8px', fontSize: '13px', color: '#00695C' }}>
              ℹ️ ML subió su share ({formatPP(datos.Efecto_ML / 100)}), pero perdió la elección por irrupción de terceros.
            </div>
          )}
        </div>
      </div>
      
      {/* Bloque Schiaretti */}
      <div>
        <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '14px', fontWeight: 600 }}>Efecto Schiaretti: Dip. 2021 → Dip. 2025</h4>
        <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 160px', padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Dip. 2021</div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_L21)}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_L21}°</div>
            </div>
            <div style={{ fontSize: '28px', color: '#1976D2' }}>→</div>
            <div style={{ flex: '1 1 160px', padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Dip. 2025</div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_L25)}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_L25}°</div>
            </div>
            <div style={{ flex: '1 1 160px', padding: '20px', backgroundColor: datos.Sch_Mejoro ? '#4CAF5018' : '#EF535018', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Δ Circuito</div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: datos.Sch_Efecto >= 0 ? '#2E7D32' : '#C62828' }}>{formatPP(datos.Sch_Efecto)}</div>
              <div style={{ fontSize: '13px', color: datos.Sch_Efecto_vs_Capital >= 0 ? '#2E7D32' : '#C62828', marginTop: '6px' }}>vs Capital: {formatPP(datos.Sch_Efecto_vs_Capital)}</div>
            </div>
          </div>
          <div style={{ marginTop: '18px' }}>
            <span style={{ display: 'inline-block', padding: '7px 16px', borderRadius: '8px', backgroundColor: datos.Sch_Mejoro ? '#4CAF5022' : '#EF535022', color: datos.Sch_Mejoro ? '#2E7D32' : '#C62828', fontSize: '13px', fontWeight: 600 }}>
              {datos.Sch_Mejoro ? 'MEJORÓ' : 'EMPEORÓ'}
            </span>
          </div>
        </div>
      </div>
      
      {/* Veredicto */}
      <div style={{ padding: '24px', backgroundColor: datos.Victorias_Total >= 2 ? '#4CAF5012' : '#EF535012', border: `1px solid ${datos.Victorias_Total >= 2 ? '#4CAF5040' : '#EF535040'}`, borderRadius: '12px' }}>
        <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '18px', fontWeight: 600 }}>Veredicto</h4>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '18px' }}>
          <div style={{ padding: '14px 18px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Diagnóstico</div>
            <Badge categoria={datos.Categoria_v4} tipo="v4" />
          </div>
          <div style={{ padding: '14px 18px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Evolución Llaryora</div>
            <Badge categoria={datos.Categoria_ML} tipo="ml" />
          </div>
          <div style={{ padding: '14px 18px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Efecto legislativo</div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: datos.Sch_Mejoro ? '#2E7D32' : '#C62828' }}>{datos.Sch_Mejoro ? 'MEJORÓ' : 'EMPEORÓ'} ({formatPP(datos.Sch_Efecto)})</span>
          </div>
        </div>
        <div style={{ fontSize: '15px', color: 'var(--text-primary)', fontWeight: 500 }}>
          {datos.Victorias_Total >= 3 ? '✓' : datos.Victorias_Total >= 2 ? '○' : '✗'} {datos.Victorias_Total >= 3 ? 'Circuito sólido para el oficialismo' : datos.Victorias_Total >= 2 ? 'Circuito con potencial de recuperación' : 'Circuito difícil, requiere estrategia específica'}
        </div>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '10px' }}>
          Ganó {datos.Victorias_Total}/4 elecciones.
          {datos.Crecio_vs_Capital ? ' Creció más que Capital con Llaryora.' : ' Creció menos que Capital con Llaryora.'}
          {datos.Sch_Mejoro ? ' Mejoró en legislativas.' : ' Empeoró en legislativas.'}
        </div>
      </div>
    </div>
  );
};

// ============================================
// VISTA CAPITAL (MEJORADA)
// ============================================
const VistaCapital = ({ datos, onSelectCircuito }) => {
  const [filtroCategoria, setFiltroCategoria] = useState(null);
  const [ordenColumna, setOrdenColumna] = useState('Share_G23');
  const [ordenAsc, setOrdenAsc] = useState(false);
  
  // Conteo por categoría
  const conteoCategoria = datos.reduce((acc, d) => {
    acc[d.Categoria_v4] = (acc[d.Categoria_v4] || 0) + 1;
    return acc;
  }, {});
  
  // Datos filtrados
  const datosFiltrados = filtroCategoria 
    ? datos.filter(d => d.Categoria_v4 === filtroCategoria)
    : datos;
  
  // Datos ordenados
  const datosOrdenados = [...datosFiltrados].sort((a, b) => {
    const valA = a[ordenColumna] || 0;
    const valB = b[ordenColumna] || 0;
    return ordenAsc ? valA - valB : valB - valA;
  });
  
  // Métricas de Capital
  const totalPadron = datos.reduce((sum, d) => sum + (d.Padron_G23 || 0), 0);
  const totalVictorias = datos.reduce((sum, d) => sum + (d.Victorias_Total || 0), 0);
  
  const handleOrdenar = (col) => {
    if (ordenColumna === col) {
      setOrdenAsc(!ordenAsc);
    } else {
      setOrdenColumna(col);
      setOrdenAsc(false);
    }
  };
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Cabecera */}
      <div style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)', borderRadius: '14px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>CÓRDOBA CAPITAL</h2>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '10px' }}>
          119 circuitos │ {totalPadron.toLocaleString()} electores │ {totalVictorias} victorias totales
        </div>
      </div>
      
      {/* Resultados de todas las elecciones */}
      <div style={{ padding: '20px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Resultados Capital - Share Peronismo</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[
            { label: 'Gob. 2023', value: 0.458, key: 'G23' },
            { label: 'Gob. 2019', value: 0.515, key: 'G19' },
            { label: 'Dip. 2025', value: 0.255, key: 'L25' },
            { label: 'Dip. 2021', value: 0.222, key: 'L21' },
            { label: 'Int. 2019', value: 0.402, key: 'Int19' },
          ].map(e => (
            <div key={e.key} style={{ flex: '1 1 140px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>{e.label}</div>
              <div style={{ fontSize: '22px', fontWeight: 600, color: e.value >= 0.45 ? '#2E7D32' : e.value >= 0.25 ? '#FF8F00' : '#C62828' }}>{formatPct(e.value)}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px' }}>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Tendencia Gob (19→23): </span>
            <span style={{ color: '#C62828', fontWeight: 500 }}>-5.7 pp</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Tendencia Dip (21→25): </span>
            <span style={{ color: '#2E7D32', fontWeight: 500 }}>+3.3 pp</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Efecto ML (Int19→G23): </span>
            <span style={{ color: '#2E7D32', fontWeight: 500 }}>+5.6 pp</span>
          </div>
        </div>
      </div>
      
      {/* Filtros por categoría */}
      <div style={{ padding: '20px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          Filtrar por diagnóstico 
          {filtroCategoria && (
            <button onClick={() => setFiltroCategoria(null)} style={{ marginLeft: '12px', padding: '4px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              ✕ Limpiar filtro
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {Object.entries(COLORES_CATEGORIA).map(([cat, config]) => (
            <div 
              key={cat} 
              onClick={() => setFiltroCategoria(filtroCategoria === cat ? null : cat)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: filtroCategoria === cat ? `${config.bg}30` : 'var(--bg-secondary)',
                border: filtroCategoria === cat ? `2px solid ${config.bg}` : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ width: '14px', height: '14px', borderRadius: '4px', backgroundColor: config.bg }} />
              <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: filtroCategoria === cat ? 600 : 400 }}>
                {config.label} ({conteoCategoria[cat] || 0})
              </span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Tabla completa de circuitos */}
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {filtroCategoria ? `Mostrando ${datosFiltrados.length} circuitos` : 'Todos los circuitos (119)'}
          </span>
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
              {datosOrdenados.map((d, i) => (
                <tr 
                  key={d.CircuitoKey} 
                  onClick={() => onSelectCircuito(d.CircuitoKey)}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <strong>{d.CircuitoKey}</strong> - {d.cirn_nom?.substring(0, 20)}{d.cirn_nom?.length > 20 ? '...' : ''}
                  </td>
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
      
      {/* Instrucción */}
      <div style={{ padding: '18px 24px', backgroundColor: '#1976D218', borderRadius: '12px', textAlign: 'center' }}>
        <span style={{ fontSize: '15px', color: '#1565C0' }}>Hacé click en el mapa o en una fila para ver el detalle del circuito</span>
      </div>
    </div>
  );
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
  const [cargando, setCargando] = useState(true);
  
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const [datosRes, partidosRes, barriosRes, geoRes] = await Promise.all([
          fetch('/data/circuitos_completo.json'),
          fetch('/data/partidos_por_eleccion.json'),
          fetch('/data/barrios_por_circuito.json'),
          fetch('/data/circuitos_cordoba.json'),
        ]);
        setDatos(await datosRes.json());
        setPartidos(await partidosRes.json());
        setBarrios(await barriosRes.json());
        setGeoData(await geoRes.json());
      } catch (e) {
        console.error('Error cargando datos:', e);
      }
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
  
  const solapas = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'evolucion', label: 'Evolución' },
    { key: 'partidos', label: 'Partidos' },
    { key: 'territorio', label: 'Territorio' },
    { key: 'comparativas', label: 'Comparativas' },
  ];
  
  // Función para exportar PDF
  const exportarPDF = () => {
    window.print();
  };
  
  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', color: '#666', marginBottom: '10px' }}>Cargando datos...</div>
          <div style={{ fontSize: '14px', color: '#999' }}>119 circuitos electorales</div>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <Head>
        <title>Diagnóstico Territorial - Córdoba Capital</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      
      <style jsx global>{`
        :root { --bg-primary: #ffffff; --bg-secondary: #f5f5f5; --text-primary: #1a1a1a; --text-secondary: #666666; --text-tertiary: #999999; --border: #e0e0e0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f0f0f0; }
        @media print { header, .no-print { display: none !important; } }
      `}</style>
      
      <div style={{ minHeight: '100vh' }}>
        {/* Header */}
        <header className="no-print" style={{ padding: '18px 28px', backgroundColor: '#fff', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>Diagnóstico Territorial</h1>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>Córdoba Capital — 119 circuitos</p>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {/* Botón exportar */}
            {circuitoSeleccionado && (
              <button onClick={exportarPDF} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📄 Exportar
              </button>
            )}
            
            {/* Buscador */}
            <div style={{ position: 'relative' }}>
              <input type="text" placeholder="Buscar circuito..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ padding: '12px 18px', paddingLeft: '44px', width: '300px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '15px', backgroundColor: 'var(--bg-secondary)' }} />
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: '16px' }}>🔍</span>
              
              {busqueda && circuitosFiltrados.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid var(--border)', borderRadius: '10px', marginTop: '6px', maxHeight: '350px', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                  {circuitosFiltrados.map(d => (
                    <div key={d.CircuitoKey} onClick={() => { setCircuitoSeleccionado(d.CircuitoKey); setBusqueda(''); }} style={{ padding: '14px 18px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '15px' }}><strong>{d.CircuitoKey}</strong> - {d.cirn_nom}</span>
                      <Badge categoria={d.Categoria_v4} tipo="v4" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>
        
        {/* Layout principal */}
        <div style={{ display: 'flex', height: 'calc(100vh - 76px)' }}>
          {/* Panel de datos (2/3) */}
          <div style={{ flex: '2', padding: '24px', overflowY: 'auto' }}>
            {circuitoSeleccionado && datosCircuito ? (
              <>
                <div style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)', borderRadius: '14px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <h2 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>CIRCUITO {circuitoSeleccionado}</h2>
                      <button onClick={() => setCircuitoSeleccionado(null)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕ Cerrar</button>
                    </div>
                    <p style={{ fontSize: '16px', color: 'var(--text-secondary)', marginTop: '8px' }}>{datosCircuito.cirn_nom}</p>
                  </div>
                  <Badge categoria={datosCircuito.Categoria_v4} tipo="v4" />
                </div>
                
                <div className="no-print" style={{ display: 'flex', gap: '10px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
                  {solapas.map(s => (
                    <button key={s.key} onClick={() => setSolapaActiva(s.key)} style={{ padding: '12px 22px', borderRadius: '10px', border: 'none', backgroundColor: solapaActiva === s.key ? '#1976D2' : 'transparent', color: solapaActiva === s.key ? '#fff' : 'var(--text-secondary)', fontSize: '15px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}>
                      {s.label}
                    </button>
                  ))}
                </div>
                
                <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '28px', minHeight: '450px' }}>
                  {solapaActiva === 'resumen' && <SolapaResumen circuito={circuitoSeleccionado} datos={datosCircuito} />}
                  {solapaActiva === 'evolucion' && <SolapaEvolucion circuito={circuitoSeleccionado} datos={datosCircuito} />}
                  {solapaActiva === 'partidos' && <SolapaPartidos circuito={circuitoSeleccionado} datos={datosCircuito} partidos={partidos} />}
                  {solapaActiva === 'territorio' && <SolapaTerritorio circuito={circuitoSeleccionado} datos={datosCircuito} barrios={barrios} todosLosDatos={datos} />}
                  {solapaActiva === 'comparativas' && <SolapaComparativas circuito={circuitoSeleccionado} datos={datosCircuito} />}
                </div>
              </>
            ) : (
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '28px' }}>
                <VistaCapital datos={datos} onSelectCircuito={setCircuitoSeleccionado} />
              </div>
            )}
          </div>
          
          {/* Panel mapa (1/3) */}
          <div className="no-print" style={{ flex: '1', padding: '24px', paddingLeft: '0' }}>
            <div style={{ height: '100%', backgroundColor: '#fff', borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '14px' }}>Mapa de circuitos</div>
              
              <MapaCircuitos datos={datos} geoData={geoData} circuitoSeleccionado={circuitoSeleccionado} onSelectCircuito={setCircuitoSeleccionado} />
              
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Leyenda</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {Object.entries(COLORES_CATEGORIA).map(([cat, config]) => (
                    <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: config.bg, flexShrink: 0 }} />
                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.2 }}>{config.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
