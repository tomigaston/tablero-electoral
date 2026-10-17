// Capa 3 del drill-down: detalle crudo de los eventos de un mismo día y tipo.
import React from 'react';
import { formatearFecha } from '../../lib/formatearFecha';
import { metricasParaMostrar, esUrlHttp } from '../../lib/pautaPorCircuito';
import { fmtPuntos } from '../../lib/planificador/base';
import { apruebaDe, reeleccionDe } from '../../lib/planificador/tendencia';
import { COLOR_TIPO_EVENTO } from '../../lib/planificador/config';

const Fila = ({ k, v }) => (v == null || v === '' ? null : (
  <div style={{ display: 'flex', gap: 8, fontSize: 12.5, padding: '2px 0' }}>
    <span style={{ color: 'var(--text-secondary)', minWidth: 120, flexShrink: 0 }}>{k}</span>
    <span style={{ wordBreak: 'break-word' }}>{v}</span>
  </div>
));

const Link = ({ href, children }) => (esUrlHttp(href) ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#1565C0' }}>{children}</a> : null);

function Medicion({ e }) {
  const r = e.detalle.datos;
  const probs = Object.entries(r?.preguntas?.['Problemas principales'] || {}).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return (
    <>
      <Fila k="Ronda" v={`${e.detalle.ronda} de ${e.detalle.totalRondas}`} />
      <Fila k="Casos" v={r?.casos} />
      <Fila k="Aprobación Gob." v={apruebaDe(r) != null ? `${fmtPuntos(apruebaDe(r))} % (desaprueba ${fmtPuntos(r?.preguntas?.['Aprobación Gobernador']?.Desapruebo)} %)` : null} />
      <Fila k="Reelección Llaryora" v={reeleccionDe(r) != null ? `Sí ${fmtPuntos(reeleccionDe(r))} %` : null} />
      <Fila k="Problemas" v={probs.length ? probs.map(([c, v]) => `${c} ${fmtPuntos(v, 0)} %`).join(' · ') : null} />
    </>
  );
}

function Visita({ e }) {
  const v = e.detalle;
  return (
    <>
      <Fila k="Tipo" v={v.tipo_visita} />
      <Fila k="Contacto con vecinos" v={v.contacto_vecinos} />
      <Fila k="Barrio" v={v.barrio} />
      <Fila k="Detalle" v={v.info} />
      {esUrlHttp(v.link) && <Fila k="Nota" v={<Link href={v.link}>Ver nota de prensa</Link>} />}
    </>
  );
}

function Pauta({ e }) {
  const p = e.detalle;
  const mat = p.material?.link;
  return (
    <>
      <Fila k="Pieza" v={p.titulo_pieza} />
      <Fila k="Campaña" v={p.campania} />
      <Fila k="Eje" v={p.eje} />
      <Fila k="Plataforma" v={`${p.plataforma || '—'}${p.tipo_pauta ? ` · ${p.tipo_pauta}` : ''}`} />
      <Fila k="Vigencia" v={`${formatearFecha(p.inicio)} → ${formatearFecha(p.fin)} · ${e.vigente ? 'vigente' : 'finalizada'}`} />
      {metricasParaMostrar(p).map((m) => <Fila key={m.label} k={m.label} v={m.valor} />)}
      <Fila k="Barrios" v={e.barrios?.length ? e.barrios.join(', ') : 'Sin barrio asignado'} />
      {esUrlHttp(mat) && <Fila k="Material" v={<Link href={mat}>Ver material</Link>} />}
    </>
  );
}

function Obra({ e }) {
  const o = e.detalle;
  return (
    <>
      <Fila k="Obra" v={o.nombre_obra} />
      <Fila k="Tipo" v={o.tipo_obra} />
      <Fila k="Estado" v={`${o.estado || '—'}${typeof o.porcentaje_avance === 'number' ? ` · avance ${Math.round(Math.min(o.porcentaje_avance, 1) * 100)} %` : ''}`} />
      <Fila k="Barrio" v={o.barrio} />
      <Fila k="Disponible para inaugurar" v={o.fecha_disponible_inaugurar ? formatearFecha(o.fecha_disponible_inaugurar) : null} />
      <Fila k="Finalización" v={o.fecha_finalizacion ? formatearFecha(o.fecha_finalizacion) : null} />
      <Fila k="Descripción" v={o.descripcion} />
    </>
  );
}

const RENDER = { medicion: Medicion, visita: Visita, pauta: Pauta, obra: Obra };
const MAX_VISIBLES = 12;

export default function DetalleEvento({ tipo, fecha, eventos, onCerrar }) {
  const cfg = COLOR_TIPO_EVENTO[tipo];
  const R = RENDER[tipo];
  const visibles = eventos.slice(0, MAX_VISIBLES);
  return (
    <div style={{ marginTop: 10, padding: 12, border: `1px solid ${cfg.color}`, borderRadius: 8, background: 'var(--bg-secondary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ color: cfg.color }}>{cfg.label} · {formatearFecha(fecha)}{eventos.length > 1 ? ` · ${eventos.length} registros` : ''}</strong>
        <button onClick={onCerrar} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }} aria-label="Cerrar detalle">✕</button>
      </div>
      {visibles.map((e, i) => (
        <div key={i} style={{ padding: '6px 0', borderTop: i ? '1px dashed var(--border)' : 'none' }}>
          <R e={e} />
        </div>
      ))}
      {eventos.length > MAX_VISIBLES && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>… y {eventos.length - MAX_VISIBLES} más ese día.</div>}
    </div>
  );
}
