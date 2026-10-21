// Hoja Circuitos: lista a la izquierda + ficha a la derecha (master-detail).
import React, { useMemo } from 'react';
import { TIERS } from '../../lib/planificador/config';
import { aplicarFiltro, FILTRO_VACIO, hayFiltroActivo } from '../../lib/planificador/filtros';
import { esAccionPendiente } from '../../lib/planificador/agregados';
import { fmtDeltaPP } from '../../lib/planificador/base';
import { PuntoPrioridad } from './ui';
import { FRANJA_MARCA } from '../../lib/planificador/marca';
import FichaCircuito from './FichaCircuito';

const COLOR_TEND = { mejora: '#2E7D32', estable: '#F57F17', empeora: '#BC1734' };

const IndicadorTendencia = ({ t }) => {
  if (t.estado === 'sin_medir') return <span style={{ color: '#BC1734', fontStyle: 'italic' }}>sin medir</span>;
  if (t.estado === 'sin_tendencia') return <span style={{ color: 'var(--text-tertiary)' }}>1 ronda</span>;
  const flecha = t.estado === 'mejora' ? '↑' : t.estado === 'empeora' ? '↓' : '→';
  return <span style={{ color: COLOR_TEND[t.estado], fontWeight: 600 }}>{flecha} {t.estado === 'estable' ? 'estable' : fmtDeltaPP(t.delta)}</span>;
};

const Select = ({ valor, onChange, opciones, titulo }) => (
  <label style={{ display: 'grid', gap: 3, minWidth: 0 }}>
    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{titulo}</span>
    <select value={valor} onChange={(e) => onChange(e.target.value)} aria-label={titulo} className="plan-campo"
      style={{ width: '100%', padding: '8px 10px', borderRadius: 12, border: '1px solid transparent', fontSize: 12.5, fontWeight: 600, background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}>
      {opciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  </label>
);

function FilaLista({ f, activa, ficha, onSelect }) {
  const acciones = ficha?.acciones || [];
  const pend = acciones.filter(esAccionPendiente).length;
  return (
    <button onClick={() => onSelect(f.key)} aria-current={activa} className="plan-fila"
      style={{ all: 'unset', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: activa ? '#3478B516' : 'transparent', borderLeft: activa ? '4px solid #BC1734' : '4px solid transparent' }}>
      <PuntoPrioridad nivel={f.prioridad.nivel} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.key} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>· {f.nombre}</span></div>
        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}><IndicadorTendencia t={f.tendencia} /> · padrón {f.padron != null ? f.padron.toLocaleString('es-AR') : '—'}</div>
      </div>
      {pend > 0 && <span title={`${pend} acción(es) pendiente(s) o en curso`} style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: '#F57F1722', color: '#B07F2A' }}>{pend}</span>}
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
      <aside className={`plan-no-print plan-lista ${fila ? 'plan-lista-con-ficha' : ''}`} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', position: 'sticky', top: 8, boxShadow: '0 2px 14px rgba(16,24,40,0.06)' }}>
        <div style={{ height: 4, background: FRANJA_MARCA }} />
        <div style={{ padding: '14px 14px 12px', display: 'grid', gap: 10, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 9 }}>
              <span aria-hidden="true" style={{ width: 5, height: 18, borderRadius: 3, background: 'linear-gradient(180deg,#6CAEE5,#3478B5)' }} />
              Circuitos
            </h2>
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 12, background: '#3478B518', color: '#2A6296' }}>{lista.length} de {filas.length}</span>
          </div>
          <div style={{ position: 'relative' }}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A94A0" strokeWidth="2.2" strokeLinecap="round" style={{ position: 'absolute', left: 12, top: 11 }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input value={filtro.q} onChange={(e) => set('q')(e.target.value)} placeholder="Buscar circuito (ID o nombre)" aria-label="Buscar circuito" className="plan-campo"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 36px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Select titulo="Clima" valor={filtro.tier} onChange={set('tier')} opciones={[['todos', 'Clima: todos'], ...Object.entries(TIERS).map(([k, v]) => [k, v.label])]} />
            <Select titulo="Tendencia" valor={filtro.tend} onChange={set('tend')} opciones={[['todas', 'Tendencia: todas'], ['empeora', '↓ empeora'], ['estable', '→ estable'], ['mejora', '↑ mejora'], ['sin_tendencia', '1 ronda'], ['sin_medir', 'sin medir']]} />
            <Select titulo="Acciones" valor={filtro.acciones} onChange={set('acciones')} opciones={[['todas', 'Acciones: todas'], ['pendientes', 'Con pendientes'], ['sin_decision', 'Sin decisión'], ['con_decision', 'Con decisión']]} />
            <Select titulo="Orden" valor={filtro.orden} onChange={set('orden')} opciones={[['prioridad', 'Orden: prioridad'], ['padron', 'Orden: padrón'], ['alfa', 'Orden: alfabético']]} />
          </div>
          {filtro.etiqueta && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '7px 10px 7px 12px', borderRadius: 12, background: '#3478B514', color: '#2A6296', border: '1px solid #3478B533' }}>
              <span style={{ flex: 1 }}>Desde el resumen: <strong>{filtro.etiqueta}</strong></span>
              <button onClick={() => setFiltro({ ...filtro, claves: null, etiqueta: null })} aria-label="Quitar filtro del resumen" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14 }}>✕</button>
            </div>
          )}
          {hayFiltroActivo(filtro) && (
            <button onClick={() => setFiltro(FILTRO_VACIO)} style={{ justifySelf: 'start', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#BC1734', padding: 0 }}>✕ Limpiar filtros</button>
          )}
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
