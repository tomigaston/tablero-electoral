// Vista A — Planificador: tabla de los 119 circuitos, ordenable y filtrable.
import React, { useMemo, useState } from 'react';
import { TIERS, COLOR_TIPO_EVENTO } from '../../lib/planificador/config';
import { ORDEN_PRIORIDAD } from '../../lib/planificador/prioridad';
import { formatPct, fmtPuntos } from '../../lib/planificador/base';
import { ChipCategoria, PuntoPrioridad, Tendencia, IconoEvento, Boton } from './ui';

const mapkeyNum = (f) => parseInt(f.mapkey, 10);
const cmpTexto = (a, b) => String(a).localeCompare(String(b), 'es');
const SEVERIDAD_TIER = { favorable: 0, intermedio: 1, desfavorable: 2, adverso: 3 };
const ORDEN_TEND = { empeora: 0, sin_medir: 1, sin_tendencia: 2, estable: 3, mejora: 4 };
const NECESITA_MEDICION = new Set(['medir', 'remedir']);

// Valor de orden por columna (asc). `null` va siempre al final sin importar el sentido.
const ORDENES = {
  circuito: (f) => [mapkeyNum(f), f.mapkey],
  electoral: (f) => f.shareG23,
  encuesta: (f) => f.tendencia.aprobacion,
  tendencia: (f) => ORDEN_TEND[f.tendencia.estado],
  secuencia: (f) => f.diasSinMedir,
  obras: (f) => f.inaugurables.length,
  recomendacion: (f) => ORDEN_PRIORIDAD[f.prioridad.nivel] * 100 - (f.tendencia.estado === 'empeora' && (f.tier === 'desfavorable' || f.tier === 'adverso') ? 50 : 0) - SEVERIDAD_TIER[f.tier] * 5,
  padron: (f) => f.padron,
};

function compararPor(col, dir) {
  const get = ORDENES[col] || ORDENES.padron;
  return (a, b) => {
    const va = get(a); const vb = get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    let r;
    if (Array.isArray(va)) r = va[0] !== vb[0] ? va[0] - vb[0] : cmpTexto(va[1], vb[1]);
    else r = va - vb;
    if (r === 0) r = (b.padron || 0) - (a.padron || 0); // desempate estable: padrón desc
    return dir === 'asc' ? r : -r;
  };
}

const Th = ({ col, orden, setOrden, children, ancho, alinear }) => {
  const activo = orden.col === col;
  return (
    <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-secondary)', textAlign: alinear || 'left', padding: '9px 10px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap', width: ancho }}>
      <button onClick={() => setOrden(activo ? { col, dir: orden.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: col === 'circuito' || col === 'recomendacion' ? 'asc' : 'desc' })}
        style={{ border: 'none', background: 'none', font: 'inherit', color: activo ? '#1565C0' : 'inherit', cursor: 'pointer', padding: 0 }} title="Ordenar por esta columna">
        {children} {activo ? (orden.dir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.35 }}>↕</span>}
      </button>
    </th>
  );
};

const Kpi = ({ valor, label, color, activo, onClick }) => (
  <button onClick={onClick} style={{ flex: '1 1 150px', textAlign: 'left', padding: '10px 14px', borderRadius: 8, border: activo ? '2px solid #1976D2' : '1px solid var(--border)', background: 'var(--bg-primary)', cursor: 'pointer' }}>
    <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{valor}</div>
    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
  </button>
);

const Select = ({ valor, onChange, opciones, titulo }) => (
  <select value={valor} onChange={(e) => onChange(e.target.value)} aria-label={titulo} style={{ padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg-primary)' }}>
    {opciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
);

const Secuencia = ({ f }) => {
  if (!f.secuencia.length) return <span style={{ color: 'var(--text-tertiary)' }}>sin eventos</span>;
  const MAX = 9;
  const resto = f.secuencia.length - MAX;
  const visibles = resto > 0 ? f.secuencia.slice(-MAX) : f.secuencia; // lo más reciente
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
        {resto > 0 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginRight: 3 }}>…</span>}
        {visibles.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>→</span>}
            <IconoEvento tipo={s.tipo} n={s.n} tamano={19} />
          </React.Fragment>
        ))}
      </div>
      <div style={{ fontSize: 11, color: f.diasSinMedir == null ? '#C62828' : 'var(--text-secondary)', marginTop: 2 }}>
        {f.diasSinMedir == null ? 'nunca medido' : `hace ${f.diasSinMedir} d sin medir`}
      </div>
    </div>
  );
};

export default function VistaPlanificador({ filas, kpis, onSelect, agenda, onToggleAgenda, parteUI, hoyTexto }) {
  const [orden, setOrden] = useState({ col: 'padron', dir: 'desc' }); // default: padrón G23 desc
  const [fTier, setFTier] = useState('todos');
  const [fTend, setFTend] = useState('todas');
  const [fPrio, setFPrio] = useState('todas');
  const [fMedir, setFMedir] = useState(false);
  const [fObra, setFObra] = useState(false);
  const [fAgenda, setFAgenda] = useState(false);
  const [q, setQ] = useState('');

  const filtradas = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const out = filas.filter((f) => {
      if (fTier !== 'todos' && f.tier !== fTier) return false;
      if (fTend !== 'todas' && f.tendencia.estado !== fTend) return false;
      if (fPrio !== 'todas' && f.prioridad.nivel !== fPrio) return false;
      if (fMedir && !f.recomendacion.acciones.some((a) => NECESITA_MEDICION.has(a.tipo))) return false;
      if (fObra && !f.inaugurables.length) return false;
      if (fAgenda && !agenda.has(f.key)) return false;
      if (qq && !(f.key.toLowerCase().startsWith(qq) || f.nombre.toLowerCase().includes(qq))) return false;
      return true;
    });
    return out.sort(compararPor(orden.col, orden.dir));
  }, [filas, orden, fTier, fTend, fPrio, fMedir, fObra, fAgenda, q, agenda]);

  const hayFiltro = fTier !== 'todos' || fTend !== 'todas' || fPrio !== 'todas' || fMedir || fObra || fAgenda || q;
  const limpiar = () => { setFTier('todos'); setFTend('todas'); setFPrio('todas'); setFMedir(false); setFObra(false); setFAgenda(false); setQ(''); };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Kpi valor={kpis.sinMedir} label="Sin medir" activo={fTend === 'sin_medir'} onClick={() => setFTend(fTend === 'sin_medir' ? 'todas' : 'sin_medir')} />
        <Kpi valor={kpis.empeorando} label="Empeorando" color="#C62828" activo={fTend === 'empeora'} onClick={() => setFTend(fTend === 'empeora' ? 'todas' : 'empeora')} />
        <Kpi valor={kpis.conObraLista} label="Con obra lista para inaugurar" activo={fObra} onClick={() => setFObra(!fObra)} />
        <Kpi valor={kpis.prioritarios} label="Prioritarios (rojos)" color="#C62828" activo={fPrio === 'alta'} onClick={() => setFPrio(fPrio === 'alta' ? 'todas' : 'alta')} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar circuito (ID o nombre)" aria-label="Buscar circuito"
          style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, width: 220 }} />
        <Select titulo="Clima electoral" valor={fTier} onChange={setFTier} opciones={[['todos', 'Clima: todos'], ...Object.entries(TIERS).map(([k, v]) => [k, v.label])]} />
        <Select titulo="Tendencia" valor={fTend} onChange={setFTend} opciones={[['todas', 'Tendencia: todas'], ['mejora', '↑ mejora'], ['estable', '→ estable'], ['empeora', '↓ empeora'], ['sin_tendencia', 'sin tendencia (1 ronda)'], ['sin_medir', 'sin medir']]} />
        <Select titulo="Prioridad" valor={fPrio} onChange={setFPrio} opciones={[['todas', 'Prioridad: todas'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']]} />
        <Boton activo={fMedir} onClick={() => setFMedir(!fMedir)}>Necesita medición</Boton>
        <Boton activo={fObra} onClick={() => setFObra(!fObra)}>Obra para inaugurar</Boton>
        <Boton activo={fAgenda} onClick={() => setFAgenda(!fAgenda)}>★ Agenda ({agenda.size})</Boton>
        {hayFiltro && <Boton onClick={limpiar}>Limpiar filtros</Boton>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>{filtradas.length} de {filas.length} circuitos{hoyTexto ? ` · ${hoyTexto}` : ''}</span>
      </div>

      {parteUI}

      <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 330px)', minHeight: 320, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-primary)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1080 }}>
          <thead>
            <tr>
              <Th col="circuito" orden={orden} setOrden={setOrden}>Circuito</Th>
              <Th col="electoral" orden={orden} setOrden={setOrden}>Electoral<span style={{ fontWeight: 400 }}> 2019 / 2023</span></Th>
              <Th col="encuesta" orden={orden} setOrden={setOrden}>Encuesta (aprobación)</Th>
              <Th col="secuencia" orden={orden} setOrden={setOrden}>Secuencia</Th>
              <Th col="obras" orden={orden} setOrden={setOrden}>Obras</Th>
              <Th col="recomendacion" orden={orden} setOrden={setOrden}>Recomendación</Th>
              <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border)', width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {filtradas.map((f) => (
              <tr key={f.key} onClick={() => onSelect(f.key)} className="plan-fila" style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 700 }}>{f.key} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>· {f.nombre}</span></div>
                  <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ChipCategoria categoria={f.categoria} tamano={10} />
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>padrón {f.padron != null ? f.padron.toLocaleString('es-AR') : '—'}</span>
                  </div>
                </td>
                <td style={{ padding: '8px 10px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{formatPct(f.shareInt19)}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}> / </span>
                  <strong title="Meta: share de Llaryora en Gobernador 2023">{formatPct(f.shareG23)}</strong>
                </td>
                <td style={{ padding: '8px 10px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                  {f.tendencia.aprobacion != null && <div><strong>{fmtPuntos(f.tendencia.aprobacion)} %</strong></div>}
                  <div><Tendencia t={f.tendencia} /></div>
                  {f.vsRef && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{f.vsRef.porEncima ? '≥' : '<'} ref. G23 ({fmtPuntos(Math.abs(f.vsRef.diff) * 100)} pp {f.vsRef.porEncima ? 'sobre' : 'bajo'})</div>}
                </td>
                <td style={{ padding: '8px 10px', verticalAlign: 'top' }}><Secuencia f={f} /></td>
                <td style={{ padding: '8px 10px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                  {f.inaugurables.length > 0
                    ? <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600, backgroundColor: `${COLOR_TIPO_EVENTO.obra.color}22`, color: COLOR_TIPO_EVENTO.obra.color }}>{f.inaugurables.length} inaugurable{f.inaugurables.length === 1 ? '' : 's'}</span>
                    : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                </td>
                <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PuntoPrioridad nivel={f.prioridad.nivel} />
                    <span style={{ fontWeight: 600 }}>{f.recomendacion.etiqueta}</span>
                  </div>
                  {f.inaugurables.length > 0 && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, marginLeft: 20 }}>+ inaugurar</div>}
                </td>
                <td style={{ padding: '8px 6px', verticalAlign: 'top', textAlign: 'center' }}>
                  <button onClick={(e) => { e.stopPropagation(); onToggleAgenda(f.key); }} title={agenda.has(f.key) ? 'Quitar de la agenda' : 'Mandar a la agenda'}
                    style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: agenda.has(f.key) ? '#F57F17' : '#bbb' }}>{agenda.has(f.key) ? '★' : '☆'}</button>
                </td>
              </tr>
            ))}
            {!filtradas.length && (
              <tr><td colSpan={7} style={{ padding: 28, textAlign: 'center', color: 'var(--text-secondary)' }}>Ningún circuito coincide con los filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
        Aprobación = Aprobación del Gobernador (última ronda). “Ref. G23” compara contra el share de Llaryora 2023 como referencia direccional: son métricas distintas, no una igualdad.
      </div>
    </div>
  );
}
