import React from 'react';

// Tarjeta de estadística compacta del panel lateral (antes local de pages/index.js).
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

export default MetricCardMini;
