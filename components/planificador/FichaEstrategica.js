// Vista B — Ficha estratégica del circuito (drill-down). Imprimible: el CSS @media print
// de pages/planificador.js oculta todo lo marcado .plan-no-print y apaga fondos/colores.
import React, { useMemo, useState } from 'react';
import { DESCRIPCION_CATEGORIA, LABEL_PRIORIDAD, COLOR_TIPO_EVENTO } from '../../lib/planificador/config';
import { formatPct, fmtPuntos } from '../../lib/planificador/base';
import { formatearFecha } from '../../lib/formatearFecha';
import { ChipCategoria, PuntoPrioridad, Tendencia, IconoEvento, Boton } from './ui';
import DetalleEvento from './DetalleEvento';
import { apruebaDe } from '../../lib/planificador/tendencia';

const Seccion = ({ n, titulo, children }) => (
  <section className="plan-seccion" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 14 }}>
    <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{n}. {titulo}</h2>
    {children}
  </section>
);

// Un solo trazo gris, sin ejes. Con una sola ronda no se dibuja.
const Sparkline = ({ serie }) => {
  if (serie.length < 2) return null;
  const W = 120; const H = 34; const P = 4;
  const vals = serie.map((p) => p.apruebo);
  const min = Math.min(...vals); const max = Math.max(...vals);
  const rango = max - min || 1;
  const pts = serie.map((p, i) => `${P + (i * (W - 2 * P)) / (serie.length - 1)},${H - P - ((p.apruebo - min) / rango) * (H - 2 * P)}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolución de la aprobación">
      <polyline points={pts} fill="none" stroke="#757575" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

const ESTADO_COBERTURA = {
  cubierto: { icono: '✓', color: '#2E7D32', texto: 'Cubierto' },
  planificado: { icono: '◔', color: '#F57F17', texto: 'Solo planificado' },
  descubierto: { icono: '✗', color: '#C62828', texto: 'Descubierto' },
  sin_palanca: { icono: '⊘', color: '#C62828', texto: 'Sin palanca' },
};

// Agrupa eventos por (fecha, tipo): 52 pautas lanzadas el mismo día son UN ícono.
function agruparEventos(eventos) {
  const grupos = [];
  const idx = new Map();
  eventos.forEach((e) => {
    const k = `${e.fecha}|${e.tipo}`;
    if (!idx.has(k)) { const g = { k, fecha: e.fecha, tipo: e.tipo, eventos: [] }; idx.set(k, g); grupos.push(g); }
    idx.get(k).eventos.push(e);
  });
  return grupos;
}

const resumenGrupo = (g) => {
  const e0 = g.eventos[0].detalle;
  if (g.tipo === 'medicion') return `Medición (ronda ${e0.ronda} de ${e0.totalRondas})`;
  if (g.tipo === 'visita') return `Visita${g.eventos.length > 1 ? ` ×${g.eventos.length}` : ''}: ${e0.info || e0.tipo_visita || ''}`;
  if (g.tipo === 'pauta') return `${g.eventos.length} pauta${g.eventos.length > 1 ? 's' : ''}: ${e0.campania || e0.titulo_pieza || ''}`;
  return `${g.eventos.length} obra${g.eventos.length > 1 ? 's' : ''} lista${g.eventos.length > 1 ? 's' : ''}: ${e0.nombre_obra || e0.tipo_obra || ''}`;
};

export default function FichaEstrategica({ f, onVolver, enAgenda, onToggleAgenda }) {
  const [abierto, setAbierto] = useState(null); // clave de grupo abierto
  const grupos = useMemo(() => agruparEventos(f.eventos), [f.eventos]);
  const grupoAbierto = grupos.find((g) => g.k === abierto);
  const r = f.recomendacion;
  const hoy = new Date().toLocaleDateString('es-AR');

  return (
    <div className="plan-ficha">
      <div className="plan-no-print" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Boton onClick={onVolver}>← Volver al planificador</Boton>
        <Boton onClick={() => window.print()} titulo="Abre el diálogo de impresión (A4); desde ahí se puede guardar como PDF">Imprimir / PDF</Boton>
        <Boton activo={enAgenda} onClick={onToggleAgenda}>{enAgenda ? '★ En la agenda' : '☆ Mandar a la agenda'}</Boton>
      </div>

      {/* 1. Encabezado */}
      <header className="plan-seccion" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 260, flex: '1 1 320px' }}>
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>Circuito {f.key} · {f.nombre}</h1>
            <div style={{ marginTop: 6 }}><ChipCategoria categoria={f.categoria} tamano={12} /></div>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6, maxWidth: 520 }}>{DESCRIPCION_CATEGORIA[f.categoria] || ''}</p>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Padrón G23: {f.padron != null ? f.padron.toLocaleString('es-AR') : '—'}</p>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Llaryora Intendente 2019</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-secondary)' }}>{formatPct(f.shareInt19)}</div>
            </div>
            <div style={{ borderLeft: '3px solid #1976D2', paddingLeft: 12 }}>
              <div style={{ fontSize: 11, color: '#1565C0', fontWeight: 700 }}>META · Gobernador 2023</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{formatPct(f.shareG23)}</div>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Encuesta */}
      <Seccion n={2} titulo="Encuesta">
        {f.tendencia.estado === 'sin_medir' ? (
          <p style={{ fontSize: 14 }}>Este circuito <strong>nunca fue medido</strong>. Sin base no se puede evaluar ninguna intervención.</p>
        ) : (
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Aprobación del Gobernador · {formatearFecha(f.tendencia.fechaUltima)}</div>
              <div style={{ fontSize: 30, fontWeight: 700 }}>{f.tendencia.aprobacion != null ? `${fmtPuntos(f.tendencia.aprobacion)} %` : '—'}</div>
              <Tendencia t={f.tendencia} grande />
            </div>
            <div style={{ fontSize: 13, maxWidth: 360 }}>
              {f.vsRef && (
                <p>Referencia 2023 ({formatPct(f.shareG23)}): la aprobación queda <strong>{fmtPuntos(Math.abs(f.vsRef.diff) * 100)} pp {f.vsRef.porEncima ? 'por encima' : 'por debajo'}</strong>.
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)' }}>Referencia direccional: aprobación de gestión y share de votos son métricas distintas.</span></p>
              )}
              <p style={{ marginTop: 6, color: 'var(--text-secondary)' }}>
                {f.rondas.length} {f.rondas.length === 1 ? 'ronda' : 'rondas'}:{' '}
                {f.rondas.map((rd) => `${formatearFecha(rd.fecha)} → ${apruebaDe(rd) != null ? fmtPuntos(apruebaDe(rd)) + ' %' : 's/d'}`).join(' · ')}
              </p>
            </div>
            <Sparkline serie={f.tendencia.serie} />
          </div>
        )}
      </Seccion>

      {/* 3. Los 3 problemas principales */}
      <Seccion n={3} titulo="Los 3 problemas principales y qué hacemos contra cada uno">
        {f.problemas.items.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{f.problemas.estado === 'sin_rondas' ? 'Sin encuestas registradas para este circuito.' : 'Sin dato de problemas en las encuestas de este circuito.'}</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {f.cobertura.map((c, i) => {
              const e = ESTADO_COBERTURA[c.estado];
              const alerta = c.estado === 'descubierto' || c.estado === 'sin_palanca';
              return (
                <div key={c.cat} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '8px 10px', borderRadius: 6, borderLeft: `4px solid ${alerta ? '#C62828' : 'var(--border)'}`, background: alerta ? '#C6282810' : 'var(--bg-secondary)' }}>
                  <strong style={{ minWidth: 20 }}>#{i + 1}</strong>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{c.cat} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>· {fmtPuntos(c.valor, 0)} %</span></div>
                    <div style={{ fontSize: 12.5, color: e.color }}>{e.icono} {c.estado === 'sin_palanca' || c.detalle === 'Sin cobertura' ? c.detalle : `${e.texto} — ${c.detalle}`}</div>
                  </div>
                </div>
              );
            })}
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Según la ronda del {formatearFecha(f.problemas.fecha)}. Pauta cubre “Seguridad” (Cordobeses en Alerta); las obras cubren calles, pavimento, iluminación y plazas; residuos, cloacas, agua y transporte no tienen palanca.</div>
          </div>
        )}
      </Seccion>

      {/* 4. Secuencia */}
      <Seccion n={4} titulo="Secuencia de eventos">
        <div className="plan-no-print">
          {grupos.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Sin eventos registrados.</p> : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {grupos.map((g) => (
                  <span key={g.k} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                    <IconoEvento tipo={g.tipo} n={g.eventos.length} activo={abierto === g.k} onClick={() => setAbierto(abierto === g.k ? null : g.k)} titulo={`${COLOR_TIPO_EVENTO[g.tipo].label} · ${formatearFecha(g.fecha)}`} />
                    <span style={{ fontSize: 9.5, color: 'var(--text-tertiary)' }}>{formatearFecha(g.fecha).slice(0, 5)}</span>
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
                {Object.values(COLOR_TIPO_EVENTO).map((c) => `${c.letra} ${c.label}`).join(' · ')} — tocá un ícono para ver el detalle. “Obra lista” es informativa, no cuenta como intervención.
              </div>
              {grupoAbierto && <DetalleEvento tipo={grupoAbierto.tipo} fecha={grupoAbierto.fecha} eventos={grupoAbierto.eventos} onCerrar={() => setAbierto(null)} />}
            </>
          )}
        </div>
        {/* Versión papel: lista corta de la misma secuencia */}
        <div className="plan-solo-print" style={{ display: 'none' }}>
          {grupos.slice(-40).map((g) => (
            <div key={g.k} style={{ fontSize: 11.5, padding: '1px 0' }}>{formatearFecha(g.fecha)} · <strong>{COLOR_TIPO_EVENTO[g.tipo].letra}</strong> · {resumenGrupo(g)}</div>
          ))}
          {grupos.length > 40 && <div style={{ fontSize: 11 }}>… {grupos.length - 40} eventos anteriores omitidos.</div>}
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 10 }}>
          <span>{f.senales.nMediciones} {f.senales.nMediciones === 1 ? 'medición' : 'mediciones'}</span>
          <span>{f.senales.nPautasTotal} pautas</span>
          <span>{f.senales.nVisitas} visitas</span>
          <span>{f.diasSinMedir == null ? 'nunca medido' : `última medición hace ${f.diasSinMedir} días`}</span>
          <span>{f.senales.nPautas === 0 && f.senales.nVisitas === 0 ? 'sin intervenciones' : f.senales.medicionPosteriorEvaluable ? 'hay medición posterior a la última intervención' : 'sin medición posterior a la última intervención: el efecto no es evaluable'}</span>
        </div>
      </Seccion>

      {/* 5. Recomendación */}
      <Seccion n={5} titulo="Recomendación">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <PuntoPrioridad nivel={f.prioridad.nivel} tamano={16} />
          <strong style={{ fontSize: 17 }}>{r.etiqueta}</strong>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Prioridad {LABEL_PRIORIDAD[f.prioridad.nivel]} · {f.prioridad.porque}</span>
        </div>
        <ul style={{ margin: '0 0 10px 18px', fontSize: 13.5, lineHeight: 1.5 }}>
          {r.acciones.map((a, i) => <li key={i} style={a.tipo === 'inaugurar' ? { fontWeight: 700 } : undefined}>{a.texto}</li>)}
        </ul>
        <p style={{ fontSize: 13.5, lineHeight: 1.5 }}>{r.motivo}</p>
        {f.inaugurables.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12.5 }}>
            <strong>Obras listas para inaugurar ({f.inaugurables.length})</strong>{f.fuenteInaugurables === 'parte' ? ' — según el parte del día' : ' — según obras_capital.json'}:
            <div style={{ color: 'var(--text-secondary)' }}>
              {f.inaugurables.slice(0, 6).map((o, i) => <div key={i}>• {o.nombre_obra || o.tipoLong || 'Obra'}{o.tipo_obra ? ` (${o.tipo_obra})` : ''}{o.barrio ? ` — ${o.barrio}` : ''}</div>)}
              {f.inaugurables.length > 6 && <div>… y {f.inaugurables.length - 6} más.</div>}
            </div>
          </div>
        )}
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10 }}>Con una o dos encuestas por circuito solo se observa coincidencia temporal, no causalidad: “la aprobación subió/bajó después de…”, nunca “la pauta funcionó”.</p>
      </Seccion>
      <div className="plan-solo-print" style={{ display: 'none', fontSize: 10, color: '#555' }}>Planificador estratégico territorial · generado el {hoy}</div>
    </div>
  );
}
