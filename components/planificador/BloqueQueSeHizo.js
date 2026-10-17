// Bloque 5 de la ficha — "Qué se hizo": drill-down progresivo resumen → agrupado → unidad.
//   Pauta : campañas agrupadas → pieza por pieza (métricas reales + link al material)
//   Visitas: listado
//   Obras  : listas para inaugurar (con marca del parte del día) y totales
import React, { useMemo, useState } from 'react';
import { formatearFecha } from '../../lib/formatearFecha';
import { metricasParaMostrar, esUrlHttp } from '../../lib/pautaPorCircuito';
import { agruparPorCampania } from '../../lib/planificador/pautas';
import { Boton } from './ui';

const peso = (n) => (n == null ? '—' : `$ ${Math.round(n).toLocaleString('es-AR')}`);
const Etiqueta = ({ k, v }) => (v == null || v === '' ? null : <span style={{ marginRight: 14, display: 'inline-block' }}><span style={{ color: 'var(--text-tertiary)' }}>{k} </span>{v}</span>);
const Enlace = ({ href, children }) => (esUrlHttp(href) ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#1565C0' }}>{children}</a> : null);
const Caja = ({ children }) => <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-secondary)' }}>{children}</div>;

function PanelPauta({ f }) {
  const campanias = useMemo(() => agruparPorCampania(f.piezasPauta), [f.piezasPauta]);
  const [abierta, setAbierta] = useState(null);
  if (!campanias.length) return <Caja>Sin pautas registradas para este circuito.</Caja>;
  return (
    <Caja>
      {campanias.map((c) => {
        const k = `${c.campania}||${c.eje}`.toLowerCase();
        const abre = abierta === k;
        return (
          <div key={k} style={{ borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
            <button onClick={() => setAbierta(abre ? null : k)} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }} aria-expanded={abre}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{abre ? '▾' : '▸'} {c.campania}{c.eje ? <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}> · {c.eje}</span> : null}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 14 }}>
                {c.piezas.length} {c.piezas.length === 1 ? 'pieza' : 'piezas'} · {formatearFecha(c.desde)} → {formatearFecha(c.hasta)} · {peso(c.inversion)} · {c.plataformas.join(' / ') || '—'}{c.vigentes ? ` · ${c.vigentes} vigente${c.vigentes === 1 ? '' : 's'}` : ''}
              </div>
            </button>
            {abre && (
              <div style={{ margin: '6px 0 4px 14px', display: 'grid', gap: 6 }}>
                {c.piezasOrdenadas.map((p, i) => {
                  const pa = p.pauta;
                  return (
                    <div key={i} style={{ padding: '6px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12.5 }}>
                      <div style={{ fontWeight: 600 }}>{pa.titulo_pieza || 'Sin título'}</div>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        <Etiqueta k="" v={`${pa.plataforma || '—'}${pa.tipo_pauta ? ` · ${pa.tipo_pauta}` : ''}`} />
                        <Etiqueta k="" v={`${formatearFecha(pa.inicio)} → ${formatearFecha(pa.fin)}`} />
                        <Etiqueta k="Estado" v={pa.estado} />
                      </div>
                      <div>{metricasParaMostrar(pa).map((m) => <Etiqueta key={m.label} k={m.label} v={m.valor} />)}{esUrlHttp(pa.material?.link) && <Enlace href={pa.material.link}>Ver material</Enlace>}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </Caja>
  );
}

function PanelVisitas({ f }) {
  const visitas = f.eventos.filter((e) => e.tipo === 'visita').sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!visitas.length) return <Caja>Sin visitas registradas para este circuito.</Caja>;
  return (
    <Caja>
      {visitas.map((e, i) => (
        <div key={i} style={{ padding: '5px 0', borderBottom: i < visitas.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
          <strong>{formatearFecha(e.fecha)}</strong> · {e.detalle.tipo_visita || '—'}{e.detalle.barrio ? ` · ${e.detalle.barrio}` : ''}
          <div style={{ color: 'var(--text-secondary)' }}>{e.detalle.info || 'Sin detalle'} {esUrlHttp(e.detalle.link) && <Enlace href={e.detalle.link}>Ver nota</Enlace>}</div>
        </div>
      ))}
    </Caja>
  );
}

function Obra({ o, hayParte }) {
  const disponible = o.fecha_disponible_inaugurar || o.fecha_finalizacion;
  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <div style={{ fontWeight: 600 }}>
        {o.nombre_obra || 'Obra sin nombre'}
        {o.confirmadaParte && <span title="El parte del día la trae como finalizada" style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 8, background: '#2E7D3222', color: '#2E7D32' }}>✓ Confirmada por el parte{o.soloParte ? ' (solo en el parte)' : ''}</span>}
        {hayParte && !o.confirmadaParte && <span style={{ marginLeft: 8, fontSize: 10.5, color: 'var(--text-tertiary)' }}>no figura en el parte</span>}
      </div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>
        <Etiqueta k="" v={o.tipo_obra} />
        <Etiqueta k="Estado" v={`${o.estado || '—'}${typeof o.porcentaje_avance === 'number' ? ` (${Math.round(Math.min(o.porcentaje_avance, 1) * 100)} %)` : ''}`} />
        <Etiqueta k="Barrio" v={o.barrio} />
        <Etiqueta k="Disponible desde" v={disponible ? formatearFecha(disponible) : null} />
        {esUrlHttp(o.link_memoria_descriptiva) && <Enlace href={o.link_memoria_descriptiva}>Memoria descriptiva</Enlace>}
      </div>
    </div>
  );
}

function PanelObras({ items, vacio, hayParte, limite = 40 }) {
  const [todas, setTodas] = useState(false);
  if (!items.length) return <Caja>{vacio}</Caja>;
  const visibles = todas ? items : items.slice(0, limite);
  return (
    <Caja>
      {visibles.map((o, i) => <Obra key={i} o={o} hayParte={hayParte} />)}
      {items.length > limite && !todas && <button onClick={() => setTodas(true)} style={{ marginTop: 8, border: 'none', background: 'none', color: '#1565C0', cursor: 'pointer' }}>Ver las {items.length - limite} restantes</button>}
    </Caja>
  );
}

export default function BloqueQueSeHizo({ f, hayParte }) {
  const [abierto, setAbierto] = useState(null);
  const nPautas = f.piezasPauta.length;
  const nVisitas = f.senales.nVisitas;
  const botones = [
    { id: 'pautas', label: `${nPautas} ${nPautas === 1 ? 'pauta' : 'pautas'}`, n: nPautas },
    { id: 'visitas', label: `${nVisitas} ${nVisitas === 1 ? 'visita' : 'visitas'}`, n: nVisitas },
    { id: 'listas', label: `${f.inaugurables.length} ${f.inaugurables.length === 1 ? 'obra lista' : 'obras listas'}`, n: f.inaugurables.length },
    { id: 'totales', label: `${f.obras.length} ${f.obras.length === 1 ? 'obra total' : 'obras totales'}`, n: f.obras.length },
  ];
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {botones.map((b) => <Boton key={b.id} activo={abierto === b.id} onClick={() => setAbierto(abierto === b.id ? null : b.id)} disabled={false}>{b.label}</Boton>)}
      </div>
      {f.senales.nPautas !== f.piezasPauta.length && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{f.piezasPauta.length - f.senales.nPautas} pieza(s) sin fecha de inicio válida no entran en las comparaciones temporales.</div>}
      {abierto === 'pautas' && <PanelPauta f={f} />}
      {abierto === 'visitas' && <PanelVisitas f={f} />}
      {abierto === 'listas' && <PanelObras items={f.inaugurables} vacio="Sin obras listas para inaugurar en este circuito." hayParte={hayParte} />}
      {abierto === 'totales' && <PanelObras items={[...f.obras].sort((a, b) => String(a.estado).localeCompare(String(b.estado)))} vacio="Sin obras registradas en este circuito." hayParte={false} />}
    </div>
  );
}
