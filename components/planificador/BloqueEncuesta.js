// Bloque 3 de la ficha — Encuesta. De arriba abajo:
//  1) gráfico de línea: parte del resultado de Gobernación 2023 y sigue con la aprobación del Gobernador de cada encuesta;
//  2) una tarjeta por par de encuestas (Intendente / Gobernador / Presidente: valor y fecha → valor y fecha, con la variación);
//  3) una tarjeta destacada de reelección (Llaryora y Milei) con las dos últimas encuestas.
// Los porcentajes de las encuestas están en puntos (53 = 53 %); Share_G23 viene en 0..1.
import React from 'react';
import { formatPct, num1, fmtDeltaPP } from '../../lib/planificador/base';

const fechaCorta = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};
const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const aprueba = (ronda, pregunta) => numero(ronda?.preguntas?.[pregunta]?.Apruebo);
const reeligeSi = (ronda, pregunta) => numero(ronda?.preguntas?.[pregunta]?.Si);

const COLOR_LINEA = '#1976D2';
const COLOR_REF = '#78909C';
const COLOR_SUBE = '#2E7D32';
const COLOR_BAJA = '#C62828';

// ---- 1) Gráfico de línea ----
function LineaAprobacion({ f }) {
  const serie = f.tendencia.serie;
  const puntos = [];
  if (f.shareG23 != null) puntos.push({ etiqueta: 'Gob. 2023', v: f.shareG23 * 100, ref: true });
  serie.forEach((p) => puntos.push({ etiqueta: fechaCorta(p.fecha), v: p.apruebo }));
  if (!puntos.length) return null;

  const W = 560; const H = 190; const padL = 44; const padR = 44; const padT = 26; const padB = 36;
  const vs = puntos.map((p) => p.v);
  const vmin = Math.max(0, Math.floor((Math.min(...vs) - 8) / 10) * 10);
  const vmax = Math.min(100, Math.ceil((Math.max(...vs) + 8) / 10) * 10);
  const x = (i) => (puntos.length === 1 ? W / 2 : padL + (i / (puntos.length - 1)) * (W - padL - padR));
  const y = (v) => padT + (1 - (v - vmin) / (vmax - vmin || 1)) * (H - padT - padB);
  const guias = [vmin, (vmin + vmax) / 2, vmax];
  const tramo = (a, b, dash) => (
    <line key={`${a}-${b}`} x1={x(a)} y1={y(puntos[a].v)} x2={x(b)} y2={y(puntos[b].v)} stroke={COLOR_LINEA} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dash ? '5 5' : undefined} />
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 720, display: 'block' }} role="img" aria-label="Evolución de la aprobación del Gobernador desde Gobernación 2023">
      {guias.map((g) => (
        <g key={g}>
          <line x1={padL - 8} x2={W - padR + 8} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeWidth="1" />
          <text x={padL - 12} y={y(g) + 4} textAnchor="end" fontSize="10.5" fill="var(--text-tertiary)">{Math.round(g)}%</text>
        </g>
      ))}
      {puntos.slice(1).map((_, i) => tramo(i, i + 1, puntos[i].ref))}
      {puntos.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.v)} r="5" fill={p.ref ? 'var(--bg-primary)' : COLOR_LINEA} stroke={p.ref ? COLOR_REF : COLOR_LINEA} strokeWidth="2.5" />
          <text x={x(i)} y={y(p.v) - 11} textAnchor="middle" fontSize="12.5" fontWeight="700" fill={p.ref ? COLOR_REF : 'var(--text-primary)'}>{num1(p.v)}%</text>
          <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="11" fontWeight={p.ref ? 700 : 400} fill="var(--text-secondary)">{p.etiqueta}</text>
        </g>
      ))}
    </svg>
  );
}

// ---- 2) y 3) Tarjetas ----
const Valor = ({ v, fecha, vacio }) => (
  <div>
    {v != null
      ? <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>{num1(v)}%</div>
      : <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', padding: '7px 0' }}>{vacio}</div>}
    {fecha && <div style={{ fontSize: 12.5, fontWeight: 700 }}>{fechaCorta(fecha)}</div>}
  </div>
);

function Fila({ titulo, a, b, fa, fb, sinSegunda }) {
  const delta = a != null && b != null ? b - a : null;
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>{titulo}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, textAlign: 'center' }}>
        <Valor v={a} fecha={fa} vacio="No se preguntó" />
        <div style={{ minWidth: 76 }}>
          {delta != null && <div style={{ fontSize: 12.5, fontWeight: 700, color: delta >= 0 ? COLOR_SUBE : COLOR_BAJA, whiteSpace: 'nowrap' }}>{delta >= 0 ? '▲' : '▼'} {fmtDeltaPP(delta)}</div>}
          <div style={{ fontSize: 22, color: 'var(--text-secondary)', lineHeight: 1 }}>→</div>
        </div>
        <Valor v={b} fecha={sinSegunda ? null : fb} vacio={sinSegunda ? 'Sin nueva medición' : 'No se preguntó'} />
      </div>
    </div>
  );
}

const Tarjeta = ({ titulo, destacada, children }) => (
  <div style={{ border: destacada ? '2px solid #1976D2' : '1px solid var(--border)', background: destacada ? '#1976D20D' : 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px' }}>
    {titulo && <div style={{ fontSize: destacada ? 12 : 12.5, fontWeight: 700, color: destacada ? '#1565C0' : 'var(--text-secondary)', textTransform: destacada ? 'uppercase' : 'none', letterSpacing: destacada ? 0.8 : 0, textAlign: destacada ? 'center' : 'left', marginBottom: 2 }}>{titulo}</div>}
    <div style={{ display: 'grid' }}>{children}</div>
  </div>
);

export default function BloqueEncuesta({ f }) {
  const t = f.tendencia;
  if (t.estado === 'sin_medir' || !f.rondas.length) return <p style={{ fontSize: 14 }}>Este circuito <strong>nunca fue medido</strong>: sin dato de aprobación.</p>;

  const rondas = f.rondas;
  const unaSola = rondas.length === 1;
  const ultima = rondas[rondas.length - 1];
  const previa = unaSola ? null : rondas[rondas.length - 2];
  // Pares de encuestas consecutivos, de la más nueva a la más vieja (con una sola, esa única medición).
  const pares = unaSola ? [{ a: ultima, b: null }] : rondas.slice(1).map((r, i) => ({ a: rondas[i], b: r })).reverse();

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Aprobación del Gobernador</div>
        {t.serie.length ? <LineaAprobacion f={f} /> : <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Hay mediciones pero ninguna con dato de aprobación del Gobernador.</p>}
        <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2 }}>El punto inicial es el resultado de Gobernación 2023 (voto, línea punteada): es la referencia de partida, no una aprobación.</div>
        {f.vsRef && (
          <div style={{ fontSize: 13.5, marginTop: 8 }}>
            Meta (Gobernador 2023): <strong>{formatPct(f.shareG23)}</strong> — la aprobación actual está a <strong>{num1(Math.abs(f.vsRef.diff) * 100)} pp {f.vsRef.porEncima ? 'por encima' : 'por debajo'}</strong>.
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Cómo fue cambiando, encuesta por encuesta</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 10 }}>
          {pares.map(({ a, b }, i) => (
            <Tarjeta key={i} titulo={b ? `Encuesta ${fechaCorta(a.fecha)} → ${fechaCorta(b.fecha)}` : `Encuesta ${fechaCorta(a.fecha)} (única medición)`}>
              {[['Aprobación del Intendente', 'Aprobación Intendente'], ['Aprobación del Gobernador', 'Aprobación Gobernador'], ['Aprobación del Presidente', 'Aprobación Presidente']].map(([titulo, p]) => (
                <Fila key={p} titulo={titulo} a={aprueba(a, p)} b={b ? aprueba(b, p) : null} fa={a.fecha} fb={b?.fecha} sinSegunda={!b} />
              ))}
            </Tarjeta>
          ))}
        </div>
      </div>

      <Tarjeta titulo="Reelección" destacada>
        {[['Reelección Llaryora (Gobernador)', 'Reelección Llaryora'], ['Reelección Milei (Presidente)', 'Reelección Milei']].map(([titulo, p]) => (
          <Fila key={p} titulo={titulo} a={reeligeSi(previa || ultima, p)} b={previa ? reeligeSi(ultima, p) : null} fa={(previa || ultima).fecha} fb={ultima.fecha} sinSegunda={!previa} />
        ))}
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>Porcentaje que respondió “Sí” a la reelección.</div>
      </Tarjeta>
    </div>
  );
}
