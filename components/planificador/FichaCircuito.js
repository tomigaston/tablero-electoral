// Ficha de un circuito (derecha de la hoja Circuitos). Bloques: encabezado · electoral ·
// encuesta · 3 problemas + cobertura · qué se hizo · lectura · decisión y seguimiento.
import React from 'react';
import { DESCRIPCION_CATEGORIA, LABEL_PRIORIDAD, COLOR_PRIORIDAD } from '../../lib/planificador/config';
import { formatPct, num1, mesAnio, periodoEntre, fmtDeltaPP } from '../../lib/planificador/base';
import { reeleccionDe } from '../../lib/planificador/tendencia';
import { formatearFecha } from '../../lib/formatearFecha';
import { ChipCategoria, Boton } from './ui';
import BloqueQueSeHizo from './BloqueQueSeHizo';
import BloqueDecision from './BloqueDecision';

const Seccion = ({ n, titulo, children }) => (
  <section className="plan-seccion" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
    <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{n ? `${n}. ` : ''}{titulo}</h2>
    {children}
  </section>
);

const ESTADO_COBERTURA = {
  cubierto: { icono: '✓', color: '#2E7D32', texto: 'Cubierto' },
  planificado: { icono: '◔', color: '#F57F17', texto: 'Solo planificado' },
  descubierto: { icono: '✗', color: '#C62828', texto: 'Descubierto' },
  sin_palanca: { icono: '⊘', color: '#C62828', texto: 'Sin palanca' },
};

// Prioridad bien visible: chip con el color del semáforo + la palabra.
const ChipPrioridad = ({ nivel, porque }) => {
  const c = COLOR_PRIORIDAD[nivel] || '#9E9E9E';
  return (
    <span title={porque} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 18, border: `2px solid ${c}`, background: `${c}22`, color: 'var(--text-primary)', fontSize: 15, fontWeight: 700 }}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
      Prioridad {LABEL_PRIORIDAD[nivel] || ''}
    </span>
  );
};

// Una línea simple (sin ejes ni etiquetas) con la evolución de la aprobación; x proporcional a la fecha.
function Sparkline({ serie, color }) {
  if (serie.length < 2) return null;
  const w = 130; const h = 34; const pad = 4;
  const ts = serie.map((p) => new Date(String(p.fecha).slice(0, 10)).getTime());
  const vs = serie.map((p) => p.apruebo);
  const t0 = Math.min(...ts); const t1 = Math.max(...ts);
  const v0 = Math.min(...vs); const v1 = Math.max(...vs);
  const x = (t) => pad + (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * (w - 2 * pad));
  const y = (v) => (v1 === v0 ? h / 2 : h - pad - ((v - v0) / (v1 - v0)) * (h - 2 * pad));
  const puntos = serie.map((p, i) => `${x(ts[i]).toFixed(1)},${y(vs[i]).toFixed(1)}`).join(' ');
  const u = serie.length - 1;
  return (
    <svg width={w} height={h} role="img" aria-label="Evolución de la aprobación" style={{ flexShrink: 0 }}>
      <polyline points={puntos} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(ts[u])} cy={y(vs[u])} r="3" fill={color} />
    </svg>
  );
}

// 39,5% grande + chip de tendencia; debajo, secundario: desde (fecha) → hasta (fecha) · Δpp en N meses; luego la meta.
function Aprobacion({ f }) {
  const t = f.tendencia;
  if (t.estado === 'sin_medir') return <p style={{ fontSize: 14 }}>Este circuito <strong>nunca fue medido</strong>: sin dato de aprobación.</p>;
  const serie = t.serie;
  if (!serie.length) return <p style={{ fontSize: 14 }}>Hay {f.rondas.length === 1 ? 'una medición' : 'mediciones'} pero sin dato de aprobación del Gobernador.</p>;
  const ultima = serie[serie.length - 1];
  const prev = serie.length >= 2 ? serie[serie.length - 2] : null;
  const colorTend = t.estado === 'mejora' ? '#2E7D32' : t.estado === 'empeora' ? '#C62828' : t.estado === 'estable' ? '#F57F17' : 'var(--text-secondary)';
  const flecha = t.estado === 'mejora' ? '↑' : t.estado === 'empeora' ? '↓' : t.estado === 'estable' ? '→' : '';
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 38, fontWeight: 700, lineHeight: 1 }}>{num1(ultima.apruebo)}%</span>
        {prev ? (
          <span style={{ fontSize: 15, fontWeight: 700, padding: '3px 11px', borderRadius: 14, background: `${colorTend}1A`, color: colorTend, whiteSpace: 'nowrap' }}>
            {flecha} {t.estado === 'estable' ? 'estable · ' : ''}{fmtDeltaPP(t.delta)}
          </span>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>una sola medición ({mesAnio(ultima.fecha)})</span>
        )}
        <Sparkline serie={serie} color={colorTend} />
      </div>
      {prev && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
          desde {mesAnio(prev.fecha)} ({num1(prev.apruebo)}%) → {mesAnio(ultima.fecha)} ({num1(ultima.apruebo)}%) · {fmtDeltaPP(t.delta)} en {periodoEntre(prev.fecha, ultima.fecha)}
        </div>
      )}
      {serie.length >= 3 && (
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
          Serie completa: {serie.map((p) => `${num1(p.apruebo)}% (${mesAnio(p.fecha)})`).join(' → ')}
        </div>
      )}
      {f.vsRef && (
        <div style={{ fontSize: 13.5, marginTop: 8 }}>
          Meta (Gobernador 2023): <strong>{formatPct(f.shareG23)}</strong> — la aprobación está a <strong>{num1(Math.abs(f.vsRef.diff) * 100)} pp {f.vsRef.porEncima ? 'por encima' : 'por debajo'}</strong>.
        </div>
      )}
      {(() => {
        const r = [...f.rondas].reverse().find((x) => reeleccionDe(x) != null);
        return r ? <div style={{ fontSize: 13.5, marginTop: 4 }}>Reelección Llaryora (sí): <strong>{num1(reeleccionDe(r))}%</strong> <span style={{ color: 'var(--text-secondary)' }}>({mesAnio(r.fecha)})</span></div> : null;
      })()}
    </>
  );
}

export default function FichaCircuito({ f, ficha, persistencia, onOperacion, hayParte, onVolver }) {
  const hoy = new Date().toLocaleDateString('es-AR');
  return (
    <div className="plan-ficha">
      <div className="plan-no-print" style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {onVolver && <span className="plan-solo-movil"><Boton onClick={onVolver}>← Lista</Boton></span>}
        <Boton onClick={() => window.print()} titulo="Imprime la ficha en A4; desde el diálogo se puede guardar como PDF">Imprimir / exportar ficha</Boton>
      </div>

      {/* 1. Encabezado + 2. Electoral */}
      <header className="plan-seccion" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px' }}>
            <h1 style={{ fontSize: 21, fontWeight: 700 }}>{f.key} · {f.nombre}</h1>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <ChipPrioridad nivel={f.prioridad.nivel} porque={f.prioridad.porque} />
              <ChipCategoria categoria={f.categoria} tamano={12} />
            </div>
            {f.prioridad.porque && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{f.prioridad.porque}</div>}
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>{DESCRIPCION_CATEGORIA[f.categoria] || ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Padrón (habitantes)</div>
              <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.15 }}>{f.padron != null ? f.padron.toLocaleString('es-AR') : '—'}</div>
            </div>
            <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 18 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Llaryora · Intendente 2019</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-secondary)' }}>{formatPct(f.shareInt19)}</div>
            </div>
            <div style={{ borderLeft: '3px solid #1976D2', paddingLeft: 12 }}>
              <div style={{ fontSize: 11, color: '#1565C0', fontWeight: 700 }}>META · Gobernador 2023</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{formatPct(f.shareG23)}</div>
            </div>
          </div>
        </div>
      </header>

      <Seccion n={3} titulo="Encuesta · aprobación del gobernador"><Aprobacion f={f} /></Seccion>

      <Seccion n={4} titulo="Los 3 problemas principales y su cobertura">
        {f.problemas.items.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{f.problemas.estado === 'sin_rondas' ? 'Sin encuestas registradas para este circuito.' : 'Sin dato de problemas en las encuestas de este circuito.'}</p>
        ) : (
          <div style={{ display: 'grid', gap: 7 }}>
            {f.cobertura.map((c, i) => {
              const e = ESTADO_COBERTURA[c.estado];
              const alerta = c.estado === 'descubierto' || c.estado === 'sin_palanca';
              return (
                <div key={c.cat} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 10px', borderRadius: 6, borderLeft: `4px solid ${alerta ? '#C62828' : 'var(--border)'}`, background: alerta ? '#C6282810' : 'var(--bg-secondary)' }}>
                  <strong style={{ minWidth: 22 }}>#{i + 1}</strong>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{c.cat} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>· {num1(c.valor)}%</span></div>
                    <div style={{ fontSize: 12.5, color: e.color }}>{e.icono} {c.estado === 'sin_palanca' || c.detalle === 'Sin cobertura' ? c.detalle : `${e.texto} — ${c.detalle}`}</div>
                  </div>
                </div>
              );
            })}
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Ronda del {formatearFecha(f.problemas.fecha)}. La pauta cubre “Seguridad” (eje SEGURIDAD); una obra cubre calles, pavimento, iluminación o plazas solo si está Finalizada o En ejecución; residuos, cloacas, agua y transporte no tienen palanca.</div>
          </div>
        )}
      </Seccion>

      <Seccion n={5} titulo="Qué se hizo">
        <div className="plan-no-print"><BloqueQueSeHizo key={f.key} f={f} hayParte={hayParte} /></div>
        <div className="plan-solo-print" style={{ display: 'none', fontSize: 12.5 }}>
          {f.piezasPauta.length} pautas · {f.senales.nVisitas} visitas · {f.inaugurables.length} obras listas · {f.obras.length} obras totales
          {f.inaugurables.slice(0, 8).map((o, i) => <div key={i}>• {o.nombre_obra || 'Obra'}{o.tipo_obra ? ` (${o.tipo_obra})` : ''}{o.barrio ? ` — ${o.barrio}` : ''}</div>)}
        </div>
      </Seccion>

      <Seccion titulo="Lectura">
        <div style={{ fontSize: 13.5, lineHeight: 1.55, display: 'grid', gap: 6 }}>{f.lectura.map((p, i) => <p key={i}>{p}</p>)}</div>
      </Seccion>

      <Seccion n={7} titulo="Tu decisión y seguimiento">
        <BloqueDecision circuito={f.key} ficha={ficha} persistencia={persistencia} onOperacion={onOperacion} />
      </Seccion>
      <div className="plan-solo-print" style={{ display: 'none', fontSize: 10, color: '#555' }}>Planificador territorial · {f.key} {f.nombre} · generado el {hoy}</div>
    </div>
  );
}
