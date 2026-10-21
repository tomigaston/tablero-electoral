// Bloque 3 de la ficha — Encuesta, en orden cronológico: primero una tarjeta de otro color con el resultado de
// Gobernación 2023 (la meta), un poco más a la derecha las encuestas (de abril → agosto → octubre, por fecha).
// Cada encuesta muestra solo lo de Llaryora: aprobación del Gobernador y reelección, con la variación contra
// el dato anterior (la primera encuesta, contra Gobernación 2023).
// Los porcentajes de las encuestas están en puntos (53 = 53 %); Share_G23 viene en 0..1.
import React from 'react';
import { formatPct, num1, fmtDeltaPP } from '../../lib/planificador/base';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesDe = (iso) => MESES[Number(String(iso).slice(5, 7)) - 1] || '';
const fechaCorta = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};
const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const aprueba = (ronda) => numero(ronda?.preguntas?.['Aprobación Gobernador']?.Apruebo);
const reelige = (ronda) => numero(ronda?.preguntas?.['Reelección Llaryora']?.Si);

const COLOR_ENCUESTA = '#3478B5';
const COLOR_GOB2023 = '#6A1B9A'; // otro color a propósito: es un resultado electoral, no una encuesta
const COLOR_SUBE = '#2E7D32';
const COLOR_BAJA = '#BC1734';

// Variación en pp contra el dato anterior.
const Cambio = ({ delta, contra }) => {
  if (delta == null) return null;
  const c = delta >= 0 ? COLOR_SUBE : COLOR_BAJA;
  return (
    <span title={`Variación ${contra}`} style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 700, padding: '2px 9px', borderRadius: 12, background: `${c}1A`, color: c, whiteSpace: 'nowrap' }}>
      {delta >= 0 ? '▲' : '▼'} {fmtDeltaPP(delta)}
    </span>
  );
};

const Dato = ({ titulo, valor, delta, contra, tamano = 32, destacado }) => (
  <div style={destacado ? { marginTop: 8, padding: '5px 9px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)' } : undefined}>
    <div style={{ fontSize: destacado ? 11.5 : 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>{titulo}</div>
    {valor != null ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: tamano, fontWeight: 700, lineHeight: 1.15 }}>{num1(valor)}%</span>
        <Cambio delta={delta} contra={contra} />
      </div>
    ) : <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', padding: '6px 0' }}>No se preguntó</div>}
    {delta != null && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{contra}</div>}
  </div>
);

const Paso = ({ color, titulo, subtitulo, children }) => (
  <div style={{ flex: '0 0 auto', width: 232, boxSizing: 'border-box', borderRadius: 16, border: `1px solid ${color}44`, borderTop: `5px solid ${color}`, background: `${color}0D`, padding: '10px 14px 12px' }}>
    <div style={{ fontSize: 14, fontWeight: 700, color }}>{titulo}</div>
    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{subtitulo}</div>
    {children}
  </div>
);

export default function BloqueEncuesta({ f }) {
  if (f.tendencia.estado === 'sin_medir' || !f.rondas.length) return <p style={{ fontSize: 14 }}>Este circuito <strong>nunca fue medido</strong>: sin dato de aprobación.</p>;

  const gob2023 = f.shareG23 != null ? f.shareG23 * 100 : null;

  // En orden cronológico; cada dato se compara con el anterior que exista (el primero, con Gobernación 2023).
  let prevAprob = gob2023;
  let origenAprob = 'vs. Gobernación 2023';
  let prevRee = null;
  const pasos = f.rondas.map((r) => {
    const ap = aprueba(r);
    const re = reelige(r);
    const paso = {
      r, ap, re,
      dAp: ap != null && prevAprob != null ? ap - prevAprob : null, contraAp: origenAprob,
      dRe: re != null && prevRee != null ? re - prevRee : null,
    };
    if (ap != null) { prevAprob = ap; origenAprob = 'vs. encuesta anterior'; }
    if (re != null) prevRee = re;
    return paso;
  });

  return (
    <div>
      <div className="plan-encuesta-fila" style={{ display: 'flex', alignItems: 'stretch', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
        {gob2023 != null && (
          <>
            <Paso color={COLOR_GOB2023} titulo="Gobernación 2023" subtitulo="Resultado electoral (voto)">
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>Llaryora</div>
              <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.15, color: COLOR_GOB2023 }}>{formatPct(f.shareG23)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Meta de partida</div>
            </Paso>
            {/* Un poco de aire: lo electoral queda a la izquierda y las encuestas empiezan más a la derecha. */}
            <div aria-hidden="true" style={{ flex: '0 0 auto', width: 30, display: 'flex', justifyContent: 'center' }}>
              <div style={{ borderLeft: '2px dashed var(--border)' }} />
            </div>
          </>
        )}
        {pasos.map((p, i) => (
          <React.Fragment key={p.r.fecha + i}>
            {i > 0 && <div aria-hidden="true" style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', fontSize: 22, color: 'var(--text-secondary)' }}>→</div>}
            <Paso color={COLOR_ENCUESTA} titulo={`Encuesta de ${mesDe(p.r.fecha)}`} subtitulo={fechaCorta(p.r.fecha)}>
              <Dato titulo="Aprobación del Gobernador" valor={p.ap} delta={p.dAp} contra={p.contraAp} />
              <Dato titulo="Reelección Llaryora (Sí)" valor={p.re} delta={p.dRe} contra="vs. encuesta anterior" tamano={21} destacado />
            </Paso>
          </React.Fragment>
        ))}
      </div>
      {f.vsRef && (
        <div style={{ fontSize: 17, lineHeight: 1.45, marginTop: 10 }}>
          Meta (Gobernador 2023): <strong style={{ fontSize: 19 }}>{formatPct(f.shareG23)}</strong> — la aprobación actual está{' '}
          <strong style={{ fontSize: 19, color: f.vsRef.porEncima ? COLOR_SUBE : COLOR_BAJA }}>{num1(Math.abs(f.vsRef.diff) * 100)} pp {f.vsRef.porEncima ? 'por encima' : 'por debajo'}</strong>.
        </div>
      )}
    </div>
  );
}
