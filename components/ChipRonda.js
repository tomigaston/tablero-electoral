import { formatearFecha } from '../lib/formatearFecha';
import { cssStr } from '../lib/lecturaRondas';

// Chip de ronda: la MISMA ronda se ve igual en toda la pantalla y en todo el reporte.
// Canal visual neutro a propósito (gris / azul de marca): nunca rojo, verde ni ámbar, para no chocar
// con "bueno/malo".
//   · ronda actual  → azul de marca suave + marca "actual"
//   · ronda anterior → gris
const BASE = {
  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '1px 8px', borderRadius: '999px',
  fontSize: '11px', fontWeight: 600, lineHeight: 1.5, whiteSpace: 'nowrap', border: '1px solid var(--border)',
  backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)',
};
const ACTUAL = { backgroundColor: '#1976D21A', color: '#0D47A1', border: '1px solid #1976D255' };

export const estiloChipRonda = (actual) => (actual ? { ...BASE, ...ACTUAL } : BASE);
const textoN = (casos) => (casos != null ? `n=${casos}` : 'n no informado');

// Chip + n. "actual" marca la ronda actual.
// etiqueta (opcional): texto del estado que va después de la fecha (ej. "sin dato nuevo"); si falta y actual=true, "actual".
export const ChipRonda = ({ fecha, casos, actual = false, etiqueta = null, conN = true }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
    <span style={estiloChipRonda(actual)}>{formatearFecha(fecha)}{etiqueta ? ` · ${etiqueta}` : actual ? ' · actual' : ''}</span>
    {conN && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{textoN(casos)}</span>}
  </span>
);

// Versión HTML-string (para las barras de Calificación de gestión, que se arman como texto).
export function htmlChipRonda(fecha, { casos, actual = false, etiqueta = null, conN = true } = {}) {
  const chip = `<span style="${cssStr(estiloChipRonda(actual))}">${formatearFecha(fecha)}${etiqueta ? ` · ${etiqueta}` : actual ? ' · actual' : ''}</span>`;
  if (!conN) return chip;
  const n = `<span style="font-size:11px;color:var(--text-tertiary)">${textoN(casos)}</span>`;
  return `<span style="display:inline-flex;align-items:center;gap:6px;flex-wrap:nowrap;white-space:nowrap">${chip}${n}</span>`;
}

// Fila con los chips de TODAS las rondas que entran en una comparación, en orden cronológico
// (de la más antigua a la más reciente). Solo la última real del circuito lleva la marca "actual".
export const FilaChipsRondas = ({ rondas, fechaUltima }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', marginBottom: '14px' }}>
    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Rondas, de la más antigua a la más reciente:</span>
    {rondas.map(r => <ChipRonda key={r.fecha} fecha={r.fecha} casos={r.casos} actual={r.fecha === fechaUltima} />)}
  </div>
);
