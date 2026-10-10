import React from 'react';
import MetricCardMini from './MetricCardMini';

const fmt = (n) => Number(n).toLocaleString('es-AR');

// Tres tarjetas del resumen global de pauta (panel derecho sin selección y cabecera de
// "Pauta por circuito"). Los números salen de resumirPauta(): mismo cálculo que la pestaña.
export default function ResumenPautaGlobal({ resumen, columnas = 1 }) {
  if (!resumen) {
    return <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Cargando pauta…</div>;
  }
  const { activa, circuitos, barrios } = resumen;
  const hay = activa.total > 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`, gap: '8px' }}>
      <MetricCardMini
        label="Pauta activa"
        value={fmt(activa.total)}
        subtitle={hay ? `${fmt(activa.generales)} generales · ${fmt(activa.especificas)} específicas` : 'Sin pauta activa'}
      />
      <MetricCardMini
        label="Circuitos cubiertos"
        value={fmt(circuitos.cubiertos)}
        subtitle={`de ${fmt(circuitos.total)}${hay ? '' : ' · sin pauta activa'}`}
      />
      <MetricCardMini
        label="Barrios cubiertos"
        value={fmt(barrios.cubiertos)}
        subtitle={`de ${fmt(barrios.total)}${hay ? '' : ' · sin pauta activa'}`}
      />
    </div>
  );
}

// Mini-tarjeta del panel de un circuito: piezas activas propias (de circuito + de sus
// barrios, sin las generales de Capital) y acceso a la pestaña "Pauta por circuito".
export function MiniTarjetaPautaCircuito({ cantidad, onVer }) {
  if (cantidad == null) return null;
  return (
    <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Pauta activa en este circuito</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(cantidad)}</span>
          {cantidad === 0 && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Sin pauta activa</span>}
        </span>
        <button
          onClick={onVer}
          title="Ver las piezas en la pestaña Pauta por circuito"
          style={{ padding: '3px 10px', borderRadius: '6px', border: '1px solid #1976D2', backgroundColor: 'transparent', color: '#1976D2', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
        >ver →</button>
      </div>
    </div>
  );
}
