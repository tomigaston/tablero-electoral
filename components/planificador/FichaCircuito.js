// Ficha de un circuito (derecha de la hoja Circuitos). Bloques: encabezado · electoral ·
// encuesta · 3 problemas + cobertura · qué se hizo · lectura · decisión y seguimiento.
import React from 'react';
import { DESCRIPCION_CATEGORIA, LABEL_PRIORIDAD, COLOR_PRIORIDAD } from '../../lib/planificador/config';
import { MARCA } from '../../lib/planificador/marca';
import { CabeceraImpresion, PieImpresion } from './Marca';
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
  descubierto: { icono: '✗', color: '#BC1734', texto: 'Descubierto' },
  sin_palanca: { icono: '⊘', color: '#BC1734', texto: 'Sin palanca' },
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

// Dato grande del encabezado, en una tarjetita suave (la meta va destacada con el azul de la marca).
const DatoGrande = ({ etiqueta, valor, gris, destacado }) => (
  <div style={{ padding: '10px 18px', borderRadius: 14, minWidth: 140, background: destacado ? `${MARCA.azul}26` : 'var(--bg-secondary)', border: destacado ? `1px solid ${MARCA.azul}` : '1px solid transparent' }}>
    <div style={{ fontSize: 11, fontWeight: destacado ? 700 : 500, color: destacado ? MARCA.azulTexto : 'var(--text-secondary)' }}>{etiqueta}</div>
    <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em', color: gris ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{valor}</div>
  </div>
);

export default function FichaCircuito({ f, ficha, persistencia, onOperacion, hayParte, onVolver }) {
  const hoy = new Date().toLocaleDateString('es-AR');
  return (
    <div className="plan-ficha">
      {/* Encabezado de la hoja impresa / exportada a PDF (en pantalla no se ve). */}
      <CabeceraImpresion titulo={`Ficha del circuito ${f.key} · ${f.nombre}`} subtitulo="Planificador territorial · Córdoba Capital"
        detalle={<><div>Generada el {hoy}</div><div>{LABEL_PRIORIDAD[f.prioridad.nivel]} · Padrón {f.padron != null ? f.padron.toLocaleString('es-AR') : '—'}</div></>} />
      <div className="plan-no-print" style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {onVolver && <span className="plan-solo-movil"><Boton onClick={onVolver}>← Lista</Boton></span>}
        <Boton onClick={() => window.print()} titulo="Imprime la ficha en A4; desde el diálogo se puede guardar como PDF">Imprimir / exportar ficha</Boton>
      </div>

      {/* 1. Encabezado + 2. Electoral */}
      <header className="plan-seccion" style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 18, padding: '18px 22px 18px 28px', marginBottom: 12 }}>
        <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: COLOR_PRIORIDAD[f.prioridad.nivel] || '#9E9E9E' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em' }}>{f.key} · {f.nombre}</h1>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <ChipPrioridad nivel={f.prioridad.nivel} />
              <ChipCategoria categoria={f.categoria} tamano={12} />
            </div>
            {f.prioridad.porque && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{f.prioridad.porque}</div>}
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>{DESCRIPCION_CATEGORIA[f.categoria] || ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
            <DatoGrande etiqueta="Padrón (habitantes)" valor={f.padron != null ? f.padron.toLocaleString('es-AR') : '—'} />
            <DatoGrande etiqueta="Llaryora · Intendente 2019" valor={formatPct(f.shareInt19)} gris />
            <DatoGrande etiqueta="META · Gobernador 2023" valor={formatPct(f.shareG23)} destacado />
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
                <div key={c.cat} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 10px', borderRadius: 6, borderLeft: `4px solid ${alerta ? '#BC1734' : 'var(--border)'}`, background: alerta ? '#BC173410' : 'var(--bg-secondary)' }}>
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
      <PieImpresion leyenda={`Planificador territorial · Circuito ${f.key} ${f.nombre} · generado el ${hoy}`} />
    </div>
  );
}
