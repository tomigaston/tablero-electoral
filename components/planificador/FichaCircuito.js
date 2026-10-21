// Ficha de un circuito (derecha de la hoja Circuitos). Bloques: encabezado · electoral ·
// encuesta · 3 problemas + cobertura · qué se hizo · lectura · decisión y seguimiento.
import React from 'react';
import { DESCRIPCION_CATEGORIA, LABEL_PRIORIDAD, COLOR_PRIORIDAD } from '../../lib/planificador/config';
import { formatPct, num1 } from '../../lib/planificador/base';
import { formatearFecha } from '../../lib/formatearFecha';
import { ChipCategoria, Boton } from './ui';
import BloqueEncuesta from './BloqueEncuesta';
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

// Situación del circuito bien visible: chip con el color del semáforo + la palabra (azul sin medir · rojo tendencia
// negativa · amarillo estable/leve baja · verde mejora), y debajo el porqué.
const ChipPrioridad = ({ nivel }) => {
  const c = COLOR_PRIORIDAD[nivel] || '#9E9E9E';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 18, border: `2px solid ${c}`, background: `${c}22`, color: 'var(--text-primary)', fontSize: 15, fontWeight: 700 }}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
      {LABEL_PRIORIDAD[nivel] || ''}
    </span>
  );
};

export default function FichaCircuito({ f, ficha, persistencia, onOperacion, hayParte, onVolver }) {
  const hoy = new Date().toLocaleDateString('es-AR');
  return (
    <div className="plan-ficha">
      {/* Encabezado de la hoja impresa / exportada a PDF (en pantalla no se ve). */}
      <div className="plan-solo-print" style={{ display: 'none', marginBottom: 8, paddingBottom: 6, borderBottom: '2px solid #000' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Planificador territorial · Ficha del circuito {f.key} · {f.nombre}</div>
        <div style={{ fontSize: 11 }}>Generada el {hoy} · {LABEL_PRIORIDAD[f.prioridad.nivel]} · Padrón {f.padron != null ? f.padron.toLocaleString('es-AR') : '—'}</div>
      </div>
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
              <ChipPrioridad nivel={f.prioridad.nivel} />
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

      <Seccion n={3} titulo="Encuesta"><BloqueEncuesta f={f} /></Seccion>

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
        <BloqueQueSeHizo key={f.key} f={f} hayParte={hayParte} />
      </Seccion>

      <Seccion titulo="Lectura">
        <div style={{ fontSize: 13.5, lineHeight: 1.55, display: 'grid', gap: 6 }}>{f.lectura.map((p, i) => <p key={i}>{p}</p>)}</div>
      </Seccion>

      <Seccion n={7} titulo="Decisión y seguimiento">
        <BloqueDecision circuito={f.key} ficha={ficha} persistencia={persistencia} onOperacion={onOperacion} />
      </Seccion>
      <div className="plan-solo-print" style={{ display: 'none', fontSize: 10, color: '#555' }}>Planificador territorial · {f.key} {f.nombre} · generado el {hoy}</div>
    </div>
  );
}
