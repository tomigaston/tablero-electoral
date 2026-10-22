// Bloque "Obras del parte" de la ficha: las obras que trae el parte del día para el circuito, en dos columnas
// (en ejecución · finalizadas) y agrupadas por tipo de obra. Los datos salen de lib/planificador/parteDia.js.
import React from 'react';
import { esUrlHttp } from '../../lib/pautaPorCircuito';
import { formatearFecha } from '../../lib/formatearFecha';

const COLOR = { ejecucion: '#B07F2A', finalizada: '#2E7D32' };

function agruparPorTipo(obras) {
  const m = new Map();
  obras.forEach((o) => { const t = o.tipo || 'Otras obras'; if (!m.has(t)) m.set(t, []); m.get(t).push(o); });
  return [...m.entries()];
}

function Columna({ titulo, estado, obras, fecha }) {
  const color = COLOR[estado];
  const cantidad = obras.reduce((n, o) => n + (o.cantidad || 0), 0);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '7px 12px', borderRadius: 10, borderLeft: `4px solid ${color}`, background: `${color}1A`, marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>{titulo}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{obras.length} {obras.length === 1 ? 'obra' : 'obras'}</span>
        {cantidad > 0 && <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>· {cantidad} rampas</span>}
        {fecha && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)' }}>parte del {formatearFecha(fecha)}</span>}
      </div>
      {!obras.length && <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', padding: '2px 4px' }}>Sin obras en el parte.</div>}
      {agruparPorTipo(obras).map(([tipo, lista]) => (
        <div key={tipo} style={{ marginBottom: 10, breakInside: 'avoid' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '0 4px 3px' }}>{tipo} · {lista.length}</div>
          {lista.map((o, i) => (
            <div key={i} style={{ padding: '5px 4px', borderTop: '1px solid var(--border)', fontSize: 12.5, lineHeight: 1.35 }}>
              <span style={{ fontWeight: 600 }}>{o.nombre || 'Obra sin nombre'}</span>
              {o.cantidad != null && <span style={{ color: 'var(--text-secondary)' }}> · {o.cantidad} {o.cantidad === 1 ? 'rampa' : 'rampas'}</span>}
              {o.barrio && <span style={{ color: 'var(--text-secondary)' }}> · {o.barrio}</span>}
              {o.links.filter(esUrlHttp).map((l, j) => (
                <a key={j} className="plan-no-print" href={l} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, fontSize: 11.5, color: '#2A6296' }}>Ver documento</a>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function BloqueObrasParte({ f, parteDia }) {
  const delCircuito = parteDia?.porCircuito?.[String(f.key).toUpperCase()] || { ejecucion: [], finalizadas: [] };
  return (
    <div className="plan-obras-parte" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
      <Columna titulo="En ejecución" estado="ejecucion" obras={delCircuito.ejecucion} fecha={parteDia.ejecucion.fecha} />
      <Columna titulo="Finalizadas" estado="finalizada" obras={delCircuito.finalizadas} fecha={parteDia.finalizadas.fecha} />
    </div>
  );
}
