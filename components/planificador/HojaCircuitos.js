// Hoja Circuitos: lista a la izquierda + ficha a la derecha (master-detail).
import React, { useMemo } from 'react';
import { TIERS } from '../../lib/planificador/config';
import { aplicarFiltro, FILTRO_VACIO, hayFiltroActivo } from '../../lib/planificador/filtros';
import { esAccionPendiente } from '../../lib/planificador/agregados';
import { fmtDeltaPP } from '../../lib/planificador/base';
import { PuntoPrioridad, Boton } from './ui';
import FichaCircuito from './FichaCircuito';

const COLOR_TEND = { mejora: '#2E7D32', estable: '#F57F17', empeora: '#C62828' };

const IndicadorTendencia = ({ t }) => {
  if (t.estado === 'sin_medir') return <span style={{ color: '#C62828', fontStyle: 'italic' }}>sin medir</span>;
  if (t.estado === 'sin_tendencia') return <span style={{ color: 'var(--text-tertiary)' }}>1 ronda</span>;
  const flecha = t.estado === 'mejora' ? '↑' : t.estado === 'empeora' ? '↓' : '→';
  return <span style={{ color: COLOR_TEND[t.estado], fontWeight: 600 }}>{flecha} {t.estado === 'estable' ? 'estable' : fmtDeltaPP(t.delta)}</span>;
};

const Select = ({ valor, onChange, opciones, titulo }) => (
  <select value={valor} onChange={(e) => onChange(e.target.value)} aria-label={titulo} style={{ padding: '6px 6px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12.5, background: 'var(--bg-primary)', maxWidth: '100%' }}>
    {opciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
);

function FilaLista({ f, activa, ficha, onSelect }) {
  const acciones = ficha?.acciones || [];
  const pend = acciones.filter(esAccionPendiente).length;
  return (
    <button onClick={() => onSelect(f.key)} aria-current={activa} className="plan-fila"
      style={{ all: 'unset', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: activa ? '#1976D218' : 'transparent', borderLeft: activa ? '3px solid #1976D2' : '3px solid transparent' }}>
      <PuntoPrioridad nivel={f.prioridad.nivel} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.key} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>· {f.nombre}</span></div>
        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}><IndicadorTendencia t={f.tendencia} /> · padrón {f.padron != null ? f.padron.toLocaleString('es-AR') : '—'}</div>
      </div>
      {pend > 0 && <span title={`${pend} acción(es) pendiente(s) o en curso`} style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: '#F57F1722', color: '#E65100' }}>{pend}</span>}
      {pend === 0 && acciones.length > 0 && <span title="Decisión tomada" style={{ fontSize: 13, color: '#2E7D32' }}>✓</span>}
    </button>
  );
}

export default function HojaCircuitos({ filas, fichas, filtro, setFiltro, seleccion, onSelect, persistencia, onOperacion, hayParte }) {
  const lista = useMemo(() => aplicarFiltro(filas, filtro, fichas), [filas, filtro, fichas]);
  const fila = filas.find((f) => f.key.toLowerCase() === String(seleccion || '').toLowerCase());
  const set = (campo) => (v) => setFiltro({ ...filtro, [campo]: v });

  return (
    <div className="plan-circuitos" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 14, alignItems: 'start' }}>
      <aside className={`plan-no-print plan-lista ${fila ? 'plan-lista-con-ficha' : ''}`} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', position: 'sticky', top: 8 }}>
        <div style={{ padding: 10, display: 'grid', gap: 6, borderBottom: '1px solid var(--border)' }}>
          <input value={filtro.q} onChange={(e) => set('q')(e.target.value)} placeholder="Buscar circuito (ID o nombre)" aria-label="Buscar circuito" style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Select titulo="Clima" valor={filtro.tier} onChange={set('tier')} opciones={[['todos', 'Clima: todos'], ...Object.entries(TIERS).map(([k, v]) => [k, v.label])]} />
            <Select titulo="Tendencia" valor={filtro.tend} onChange={set('tend')} opciones={[['todas', 'Tendencia: todas'], ['empeora', '↓ empeora'], ['estable', '→ estable'], ['mejora', '↑ mejora'], ['sin_tendencia', '1 ronda'], ['sin_medir', 'sin medir']]} />
            <Select titulo="Acciones" valor={filtro.acciones} onChange={set('acciones')} opciones={[['todas', 'Acciones: todas'], ['pendientes', 'Con pendientes'], ['sin_decision', 'Sin decisión'], ['con_decision', 'Con decisión']]} />
            <Select titulo="Orden" valor={filtro.orden} onChange={set('orden')} opciones={[['prioridad', 'Orden: prioridad'], ['padron', 'Orden: padrón'], ['alfa', 'Orden: alfabético']]} />
          </div>
          {filtro.etiqueta && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 8px', borderRadius: 6, background: '#1976D218', color: '#1565C0' }}>
              <span style={{ flex: 1 }}>Desde el resumen: <strong>{filtro.etiqueta}</strong></span>
              <button onClick={() => setFiltro({ ...filtro, claves: null, etiqueta: null })} aria-label="Quitar filtro del resumen" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
            <span>{lista.length} de {filas.length} circuitos</span>
            {hayFiltroActivo(filtro) && <Boton onClick={() => setFiltro(FILTRO_VACIO)} style={{ padding: '2px 8px', fontSize: 11.5 }}>Limpiar</Boton>}
          </div>
        </div>
        <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
          {lista.map((f) => <FilaLista key={f.key} f={f} activa={fila?.key === f.key} ficha={fichas?.[f.key]} onSelect={onSelect} />)}
          {!lista.length && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Ningún circuito coincide.</div>}
        </div>
      </aside>

      <main className="plan-detalle" style={{ minWidth: 0 }}>
        {fila ? (
          <FichaCircuito f={fila} ficha={fichas?.[fila.key]} persistencia={persistencia} onOperacion={onOperacion} hayParte={hayParte} onVolver={() => onSelect(null)} />
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border)', borderRadius: 8, background: 'var(--bg-primary)' }}>
            Elegí un circuito de la lista para ver su ficha.
          </div>
        )}
      </main>
    </div>
  );
}
