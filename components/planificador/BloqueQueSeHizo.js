// Bloque 5 de la ficha — "Qué se hizo": la secuencia cronológica real de lo que pasó en el circuito
// (encuesta · visita · pauta ×5 · visita ×2 · …), con los eventos consecutivos del mismo tipo colapsados.
// Cada grupo se abre y baja hasta la unidad:
//   pauta → pieza por pieza (métricas reales + link al material) · visita → detalle · encuesta → ronda · obra → ficha de la obra
// Los eventos vienen ordenados por fecha de construirEventos (lib/planificador/eventos.js).
import React, { useMemo, useState } from 'react';
import { formatearFecha } from '../../lib/formatearFecha';
import { metricasParaMostrar, esUrlHttp } from '../../lib/pautaPorCircuito';
import { COLOR_TIPO_EVENTO } from '../../lib/planificador/config';
import { apruebaDe } from '../../lib/planificador/tendencia';
import { num1 } from '../../lib/planificador/base';
import { esObraFinalizada, fechaListaObra } from '../../lib/planificador/obras';
import { Boton } from './ui';

const ETIQUETA_TIPO = {
  medicion: ['encuesta', 'encuestas'],
  visita: ['visita', 'visitas'],
  pauta: ['pauta', 'pautas'],
  obra: ['obra lista', 'obras listas'],
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// "pauta" · "10 pautas"
const etiquetaGrupo = (g) => {
  const [uno, varios] = ETIQUETA_TIPO[g.tipo];
  return g.eventos.length === 1 ? uno : `${g.eventos.length} ${varios}`;
};

// Una línea de texto por evento (para la versión impresa).
function lineaEvento(e) {
  const d = e.detalle || {};
  if (e.tipo === 'pauta') return [formatearFecha(d.inicio), d.titulo_pieza || 'Pieza sin título', [d.campania, d.eje].filter(Boolean).join(' · '), d.plataforma, d.fin ? `hasta ${formatearFecha(d.fin)}` : ''].filter(Boolean).join(' · ');
  if (e.tipo === 'visita') return [formatearFecha(e.fecha), d.tipo_visita, d.barrio, d.info].filter(Boolean).join(' · ');
  if (e.tipo === 'medicion') {
    const ap = apruebaDe(d.datos);
    return [formatearFecha(e.fecha), `Encuesta, ronda ${d.ronda} de ${d.totalRondas}`, d.casos != null ? `${d.casos} casos` : '', ap != null ? `aprobación ${num1(ap)}%` : ''].filter(Boolean).join(' · ');
  }
  return [formatearFecha(e.fecha), d.nombre_obra || 'Obra', d.tipo_obra, d.barrio, d.estado].filter(Boolean).join(' · ');
}

// Mes (o rango de meses) del grupo, y su año: "febrero – agosto" / "2026". Los eventos vienen ordenados por fecha.
function periodoDe(g) {
  const desde = g.eventos[0].fecha;
  const hasta = g.eventos[g.eventos.length - 1].fecha;
  const mes = (f) => MESES[Number(f.slice(5, 7)) - 1] || '';
  const anio = (f) => f.slice(0, 4);
  return {
    meses: desde.slice(0, 7) === hasta.slice(0, 7) ? mes(desde) : `${mes(desde)} – ${mes(hasta)}`,
    anios: anio(desde) === anio(hasta) ? anio(desde) : `${anio(desde)} – ${anio(hasta)}`,
  };
}

const Etiqueta = ({ k, v }) => (v == null || v === '' ? null : <span style={{ marginRight: 14, display: 'inline-block' }}><span style={{ color: 'var(--text-tertiary)' }}>{k} </span>{v}</span>);
const Enlace = ({ href, children }) => (esUrlHttp(href) ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#1565C0' }}>{children}</a> : null);
const Caja = ({ children }) => <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-secondary)' }}>{children}</div>;

// Colapsa los eventos consecutivos del mismo tipo: [pauta, pauta, visita] -> [{pauta ×2}, {visita ×1}].
export function colapsarEventos(eventos) {
  const grupos = [];
  (eventos || []).forEach((e) => {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.tipo === e.tipo) ultimo.eventos.push(e);
    else grupos.push({ tipo: e.tipo, eventos: [e] });
  });
  return grupos;
}

const peso = (n) => (n == null ? '—' : `$ ${Math.round(n).toLocaleString('es-AR')}`);

function PanelPauta({ eventos }) {
  return (
    <Caja>
      <div style={{ display: 'grid', gap: 6 }}>
        {eventos.map((e, i) => {
          const pa = e.detalle;
          return (
            <div key={i} style={{ padding: '6px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12.5 }}>
              <div style={{ fontWeight: 600 }}>{pa.titulo_pieza || 'Sin título'}</div>
              <div style={{ color: 'var(--text-secondary)' }}>
                <Etiqueta k="" v={[pa.campania, pa.eje].filter(Boolean).join(' · ')} />
                <Etiqueta k="" v={`${pa.plataforma || '—'}${pa.tipo_pauta ? ` · ${pa.tipo_pauta}` : ''}`} />
                <Etiqueta k="" v={`${formatearFecha(pa.inicio)} → ${formatearFecha(pa.fin)}`} />
                <Etiqueta k="Estado" v={pa.estado} />
                {e.vigente && <span style={{ fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 8, background: '#2E7D3222', color: '#2E7D32' }}>vigente</span>}
              </div>
              <div>{metricasParaMostrar(pa).map((m) => <Etiqueta key={m.label} k={m.label} v={m.valor} />)}{esUrlHttp(pa.material?.link) && <Enlace href={pa.material.link}>Ver material</Enlace>}</div>
            </div>
          );
        })}
      </div>
    </Caja>
  );
}

function PanelVisitas({ eventos }) {
  return (
    <Caja>
      {eventos.map((e, i) => (
        <div key={i} style={{ padding: '5px 0', borderBottom: i < eventos.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
          <strong>{formatearFecha(e.fecha)}</strong> · {e.detalle.tipo_visita || '—'}{e.detalle.barrio ? ` · ${e.detalle.barrio}` : ''}
          <div style={{ color: 'var(--text-secondary)' }}>{e.detalle.info || 'Sin detalle'} {esUrlHttp(e.detalle.link) && <Enlace href={e.detalle.link}>Ver nota</Enlace>}</div>
        </div>
      ))}
    </Caja>
  );
}

function PanelEncuestas({ eventos }) {
  return (
    <Caja>
      {eventos.map((e, i) => {
        const ap = apruebaDe(e.detalle.datos);
        return (
          <div key={i} style={{ padding: '5px 0', borderBottom: i < eventos.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
            <strong>{formatearFecha(e.fecha)}</strong> · ronda {e.detalle.ronda} de {e.detalle.totalRondas}
            <span style={{ color: 'var(--text-secondary)' }}>{e.detalle.casos != null ? ` · ${e.detalle.casos} casos` : ''}{ap != null ? ` · aprobación ${num1(ap)}%` : ''}</span>
          </div>
        );
      })}
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

// ---- Obras totales agrupadas por situación, con una "celda combinada" a la derecha por grupo ----
// obras_capital.json no trae un campo de inauguración efectiva: "listas e inauguradas" son las finalizadas
// (Finalizada o 100 %). Para inaugurar = todavía no finalizadas pero con fecha disponible para inaugurar.
const GRUPOS_OBRA = [
  { id: 'listas', label: 'Listas e inauguradas', color: '#2E7D32' },
  { id: 'para_inaugurar', label: 'Para inaugurar', color: '#1565C0' },
  { id: 'en_ejecucion', label: 'En ejecución', color: '#E65100' },
  { id: 'planificadas', label: 'Planificadas', color: '#78909C' },
];
function grupoDeObra(o) {
  if (esObraFinalizada(o)) return 'listas';
  if (o.fecha_disponible_inaugurar) return 'para_inaugurar';
  if (o.estado === 'En ejecución') return 'en_ejecucion';
  return 'planificadas';
}

function PanelObrasPorEstado({ items }) {
  if (!items.length) return <Caja>Sin obras registradas en este circuito.</Caja>;
  const grupos = GRUPOS_OBRA.map((g) => ({
    ...g,
    obras: items.filter((o) => grupoDeObra(o) === g.id)
      .sort((a, b) => (fechaListaObra(b) || '').localeCompare(fechaListaObra(a) || '') || String(a.nombre_obra || '').localeCompare(String(b.nombre_obra || ''), 'es')),
  })).filter((g) => g.obras.length);
  return (
    <Caja>
      {grupos.map((g, i) => (
        <div key={g.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(104px, 150px)', gap: 10, marginBottom: i < grupos.length - 1 ? 12 : 0 }}>
          <div>{g.obras.map((o, j) => <Obra key={j} o={o} hayParte={false} />)}</div>
          {/* Celda combinada: ocupa todo el alto del grupo. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 2, padding: 8, borderRadius: 8, background: `${g.color}1A`, border: `1px solid ${g.color}66`, color: g.color }}>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{g.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{g.obras.length}</div>
            <div style={{ fontSize: 11 }}>{g.obras.length === 1 ? 'obra' : 'obras'}</div>
          </div>
        </div>
      ))}
    </Caja>
  );
}

const claveObra = (o) => `${o?.nombre_obra || ''}|${o?.barrio || ''}`;

export default function BloqueQueSeHizo({ f, hayParte }) {
  const grupos = useMemo(() => colapsarEventos(f.eventos), [f.eventos]);
  const [abierto, setAbierto] = useState(null); // índice del grupo abierto en la secuencia
  const [verTotales, setVerTotales] = useState(false);

  // Las obras de la secuencia traen la marca del parte que calculó obrasInaugurablesDeCircuito.
  const marcadas = useMemo(() => new Map(f.inaugurables.map((o) => [claveObra(o), o])), [f.inaugurables]);
  const nObrasEnSecuencia = f.eventos.filter((e) => e.tipo === 'obra').length;
  const nObrasSinFecha = f.inaugurables.length - nObrasEnSecuencia;

  const nPautas = f.piezasPauta.length;
  const nVisitas = f.senales.nVisitas;
  const nListas = f.inaugurables.length;
  const totales = [
    `${nPautas} ${nPautas === 1 ? 'pauta' : 'pautas'}`,
    `${nVisitas} ${nVisitas === 1 ? 'visita' : 'visitas'}`,
    `${nListas} ${nListas === 1 ? 'obra lista' : 'obras listas'}`,
  ].join(' · ');

  const grupo = abierto != null ? grupos[abierto] : null;
  return (
    <div>
      <div className="plan-no-print">
      {!grupos.length ? (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Sin actividad con fecha registrada en este circuito.</p>
      ) : (
        // Línea de tiempo: una columna por grupo, con el mes (o rango de meses) arriba y el tipo de evento debajo.
        <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 6 }} role="list" aria-label="Línea de tiempo de lo que se hizo">
          {grupos.map((g, i) => {
            const t = COLOR_TIPO_EVENTO[g.tipo];
            const activo = abierto === i;
            const per = periodoDe(g);
            return (
              <div key={i} role="listitem" style={{ flex: '0 0 auto', minWidth: 112, textAlign: 'center', padding: '0 2px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{per.meses}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{per.anios}</div>
                <div style={{ position: 'relative', height: 16, margin: '4px 0 6px' }} aria-hidden="true">
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 2, background: 'var(--border)' }} />
                  <div style={{ position: 'absolute', left: '50%', top: 2, width: 12, height: 12, marginLeft: -6, borderRadius: '50%', background: t.color, border: '2px solid var(--bg-primary)', boxSizing: 'content-box' }} />
                </div>
                <button onClick={() => setAbierto(activo ? null : i)} aria-expanded={activo} title={`${t.label}: ver detalle`}
                  style={{ display: 'inline-block', padding: '4px 11px', borderRadius: 14, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', border: `1px solid ${t.color}`, background: activo ? t.color : `${t.color}1A`, color: activo ? '#fff' : 'var(--text-primary)' }}>
                  {etiquetaGrupo(g)}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {grupo && grupo.tipo === 'pauta' && <PanelPauta eventos={grupo.eventos} />}
      {grupo && grupo.tipo === 'visita' && <PanelVisitas eventos={grupo.eventos} />}
      {grupo && grupo.tipo === 'medicion' && <PanelEncuestas eventos={grupo.eventos} />}
      {grupo && grupo.tipo === 'obra' && <PanelObras items={grupo.eventos.map((e) => marcadas.get(claveObra(e.detalle)) || e.detalle)} vacio="Sin obras." hayParte={hayParte} />}

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span>{totales}</span>
        <Boton activo={verTotales} onClick={() => setVerTotales(!verTotales)} style={{ padding: '2px 9px', fontSize: 11.5 }}>{f.obras.length} {f.obras.length === 1 ? 'obra total' : 'obras totales'}</Boton>
      </div>
      {verTotales && <PanelObrasPorEstado items={f.obras} />}

      {f.senales.nPautas !== f.piezasPauta.length && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{f.piezasPauta.length - f.senales.nPautas} pieza(s) sin fecha de inicio válida no entran en la secuencia ni en las comparaciones temporales.</div>}
      {nObrasSinFecha > 0 && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{nObrasSinFecha} obra(s) lista(s) sin fecha de disponibilidad no entran en la secuencia.</div>}
      </div>

      {/* Versión para imprimir / exportar a PDF: la línea de tiempo completa, con los meses y el detalle de cada grupo. */}
      <div className="plan-solo-print" style={{ display: 'none', fontSize: 12.5 }}>
        <div style={{ marginBottom: 4 }}>{totales} · {f.obras.length} {f.obras.length === 1 ? 'obra total' : 'obras totales'}</div>
        {!grupos.length && <div>Sin actividad con fecha registrada en este circuito.</div>}
        {grupos.map((g, i) => {
          const per = periodoDe(g);
          return (
            <div key={i} style={{ marginTop: 6, breakInside: 'avoid' }}>
              <div style={{ fontWeight: 700 }}>{per.meses} {per.anios} — {etiquetaGrupo(g)}</div>
              {g.eventos.map((e, j) => <div key={j} style={{ marginLeft: 14 }}>• {lineaEvento(e)}</div>)}
            </div>
          );
        })}
        {nObrasSinFecha > 0 && <div style={{ marginTop: 6 }}>{nObrasSinFecha} obra(s) lista(s) sin fecha de disponibilidad no entran en la secuencia.</div>}
      </div>
    </div>
  );
}
