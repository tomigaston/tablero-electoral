// Hoja Resumen: la foto general. Todo dato es clickeable y lleva a la hoja Circuitos
// filtrada por los circuitos involucrados (onIr(claves, etiqueta)).
import React, { useState } from 'react';
import { TIERS } from '../../lib/planificador/config';
import { Boton } from './ui';

const COLOR_BARRA = '#1976D2';
// Colores de las categorías del tablero, usados acá solo para el clima electoral (semántico).
const COLOR_TIER = { favorable: '#2E7D32', intermedio: '#26A69A', desfavorable: '#FF7043', adverso: '#EF5350' };

const Tarjeta = ({ titulo, subtitulo, children, ancho }) => (
  <section className="plan-seccion" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', gridColumn: ancho ? `span ${ancho}` : undefined }}>
    <h2 style={{ fontSize: 15, fontWeight: 700 }}>{titulo}</h2>
    {subtitulo && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 10px' }}>{subtitulo}</p>}
    {!subtitulo && <div style={{ height: 8 }} />}
    {children}
  </section>
);

// Barras horizontales clickeables con tooltip.
function Barras({ items, max, onClick, formato = (v) => String(v) }) {
  const tope = max ?? Math.max(1, ...items.map((i) => i.valor));
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {items.map((it) => {
        const clic = onClick && it.claves?.length ? () => onClick(it) : undefined;
        return (
          <button key={it.id} onClick={clic} disabled={!clic} title={it.tooltip || `${it.label}: ${formato(it.valor)}`}
            style={{ all: 'unset', boxSizing: 'border-box', display: 'grid', gridTemplateColumns: 'minmax(110px, 38%) 1fr auto', gap: 8, alignItems: 'center', cursor: clic ? 'pointer' : 'default', padding: '2px 0' }}>
            <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
            <span style={{ height: 14, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.max(2, (it.valor / tope) * 100)}%`, background: it.color || COLOR_BARRA, borderRadius: 3 }} />
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 54, textAlign: 'right' }}>{it.texto ?? formato(it.valor)}</span>
          </button>
        );
      })}
    </div>
  );
}

const Kpi = ({ valor, label, extra, onClick }) => (
  <button onClick={onClick} disabled={!onClick} style={{ flex: '1 1 200px', textAlign: 'left', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: onClick ? 'pointer' : 'default' }}>
    <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>{valor}</div>
    <div style={{ fontSize: 13, marginTop: 2 }}>{label}</div>
    {extra && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>{extra}</div>}
  </button>
);

const pct = (v, t) => (t ? `${((v / t) * 100).toFixed(1).replace('.', ',')}%` : '—');
const millones = (v) => `$ ${(v / 1e6).toFixed(1).replace('.', ',')} M`;
const nombreEje = (e) => e.charAt(0) + e.slice(1).toLowerCase();

export default function HojaResumen({ agregados: a, seguimiento, persistencia, onIr, hoyTexto }) {
  const [medida, setMedida] = useState('piezas'); // piezas | inversion
  const k = a.kpis;
  const total = medida === 'piezas' ? a.tema.totalPiezas : a.tema.totalInversion;
  const ejes = [...a.tema.ejes].sort((x, y) => y[medida] - x[medida]);
  const seg = ejes.find((e) => e.eje === 'SEGURIDAD');

  return (
    <div>
      <div className="plan-no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tocá cualquier dato para ver los circuitos involucrados.</span>
        <Boton onClick={() => window.print()}>Imprimir / PDF</Boton>
      </div>
      <div className="plan-solo-print" style={{ display: 'none', fontSize: 11, marginBottom: 6 }}>Resumen · generado el {hoyTexto}</div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Kpi valor={k.total} label="circuitos" />
        <Kpi valor={k.sinMedir.n} label="sin medir" extra={`+ ${k.unaRonda.n} con una sola ronda`} onClick={() => onIr(k.sinMedir.claves, 'Sin medir')} />
        <Kpi valor={k.conObra.n} label="con obra lista" onClick={() => onIr(k.conObra.claves, 'Con obra lista para inaugurar')} />
        <Kpi valor={k.pautaSinMed.n} label="con pauta sin medición posterior" onClick={() => onIr(k.pautaSinMed.claves, 'Pauta sin medición posterior')} />
      </div>

      <div className="plan-grilla-resumen" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 12 }}>
        <Tarjeta titulo="¿Sobre qué tema jugamos?" subtitulo={`Pauta por eje temático · ${a.tema.totalPiezas.toLocaleString('es-AR')} piezas · ${millones(a.tema.totalInversion)} de inversión`}>
          <div className="plan-no-print" style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <Boton activo={medida === 'piezas'} onClick={() => setMedida('piezas')} style={{ padding: '3px 10px', fontSize: 12 }}>Piezas</Boton>
            <Boton activo={medida === 'inversion'} onClick={() => setMedida('inversion')} style={{ padding: '3px 10px', fontSize: 12 }}>Inversión</Boton>
          </div>
          {seg && <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{pct(seg[medida], total)} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>de {medida === 'piezas' ? 'las piezas' : 'la inversión'} es Seguridad</span></div>}
          <Barras
            items={ejes.map((e) => ({ id: e.eje, label: nombreEje(e.eje), valor: e[medida], texto: `${pct(e[medida], total)}`, claves: e.claves, tooltip: `${nombreEje(e.eje)}: ${e.piezas.toLocaleString('es-AR')} piezas · ${millones(e.inversion)} · ${e.claves.length} circuitos`, etiqueta: `Pauta de eje ${nombreEje(e.eje)}` }))}
            onClick={(it) => onIr(it.claves, it.etiqueta)} />
        </Tarjeta>

        <Tarjeta titulo="¿Dónde estamos a ciegas?" subtitulo="Circuitos según cantidad de rondas de encuesta">
          <Barras items={a.ciegos.distribucion.map((d) => ({ id: d.id, label: d.label, valor: d.n, claves: d.claves, etiqueta: d.label, color: d.id === 'sin_medir' ? '#C62828' : undefined }))} max={a.kpis.total} onClick={(it) => onIr(it.claves, it.etiqueta)} />
          <h3 style={{ fontSize: 13, margin: '14px 0 6px' }}>Mayor demora sin medir <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(días desde la última ronda)</span></h3>
          <Barras items={a.ciegos.ranking.map((r) => ({ id: r.key, label: `${r.key} · ${r.nombre}`, valor: r.dias, texto: `${r.dias} d`, claves: [r.key], etiqueta: `Circuito ${r.key}` }))} onClick={(it) => onIr(it.claves, it.etiqueta, true)} />
        </Tarjeta>

        <Tarjeta titulo="Clima electoral" subtitulo="Circuitos por tier de diagnóstico">
          <Barras items={a.tiers.map((t) => ({ id: t.tier, label: TIERS[t.tier].label, valor: t.n, claves: t.claves, color: COLOR_TIER[t.tier], etiqueta: `Clima ${TIERS[t.tier].label}` }))} max={a.kpis.total} onClick={(it) => onIr(it.claves, it.etiqueta)} />
        </Tarjeta>

        <Tarjeta titulo="Problema #1 sin cobertura" subtitulo="Circuitos donde el problema principal no tiene pauta ni obra (finalizada o en ejecución) que lo atienda">
          <button onClick={() => onIr(a.problema1.claves, 'Problema #1 sin cobertura')} style={{ all: 'unset', cursor: 'pointer', fontSize: 28, fontWeight: 700, display: 'block', marginBottom: 6 }}>{a.problema1.total} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>de {a.kpis.total - a.kpis.sinMedir.n} circuitos con encuesta</span></button>
          <Barras items={a.problema1.porTipo.map((p) => ({ id: p.cat, label: p.cat, valor: p.n, claves: p.claves, etiqueta: `Problema #1 sin cobertura: ${p.cat}` }))} onClick={(it) => onIr(it.claves, it.etiqueta)} />
        </Tarjeta>

        <Tarjeta titulo="Obras listas para inaugurar" subtitulo={`${a.obras.totalObras} obras en espera, por antigüedad desde que están disponibles${''}`}>
          <Barras items={a.obras.buckets.filter((b) => b.obras > 0).map((b) => ({ id: b.id, label: b.label, valor: b.obras, texto: `${b.obras} · ${b.claves.length} circ.`, claves: b.claves, etiqueta: `Obras listas: ${b.label}`, color: b.id === '180+' || b.id === '91-180' ? '#E65100' : undefined, tooltip: `${b.label}: ${b.obras} obras en ${b.claves.length} circuitos` }))} onClick={(it) => onIr(it.claves, it.etiqueta)} />
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Se refresca con el parte diario cuando está cargado; sin parte, sale de obras_capital.json.</p>
        </Tarjeta>

        <Tarjeta titulo="Seguimiento del equipo" subtitulo="Decisiones y acciones cargadas en las fichas">
          {persistencia.disponible ? (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                {[['pendiente', 'Pendientes'], ['en_curso', 'En curso'], ['hecha', 'Hechas']].map(([id, label]) => (
                  <div key={id} style={{ flex: '1 1 80px', textAlign: 'center', padding: 8, borderRadius: 8, background: 'var(--bg-secondary)' }}>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{seguimiento[id]}</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => onIr(seguimiento.conDecision, 'Con decisión tomada')} disabled={!seguimiento.conDecision.length} style={{ all: 'unset', cursor: seguimiento.conDecision.length ? 'pointer' : 'default', fontSize: 13.5, display: 'block' }}>
                <strong>{seguimiento.conDecision.length}</strong> de {a.kpis.total} circuitos ya tienen una decisión
              </button>
              <button onClick={() => onIr(seguimiento.conPendientes, 'Con acciones pendientes o en curso')} disabled={!seguimiento.conPendientes.length} style={{ all: 'unset', cursor: seguimiento.conPendientes.length ? 'pointer' : 'default', fontSize: 13.5, display: 'block', marginTop: 4 }}>
                <strong>{seguimiento.conPendientes.length}</strong> con acciones pendientes o en curso
              </button>
            </>
          ) : <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{persistencia.cargando ? 'Cargando…' : `Sin datos de seguimiento: ${persistencia.mensaje || 'base de datos no disponible'}.`}</p>}
        </Tarjeta>
      </div>
    </div>
  );
}
