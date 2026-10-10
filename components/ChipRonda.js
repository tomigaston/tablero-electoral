import { formatearFecha } from '../lib/formatearFecha';
import { cssStr, muestraReducida } from '../lib/lecturaRondas';

// Chip de ronda: la MISMA ronda se ve igual en toda la pantalla y en todo el reporte.
// Canal visual neutro a propósito (gris / azul de marca): nunca rojo, verde ni ámbar, para no chocar
// con "bueno/malo" ni con el aviso de muestra reducida.
//   · ronda actual  → azul de marca suave + marca "actual"
//   · ronda anterior → gris
const BASE = {
  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '1px 8px', borderRadius: '999px',
  fontSize: '11px', fontWeight: 600, lineHeight: 1.5, whiteSpace: 'nowrap', border: '1px solid var(--border)',
  backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)',
};
const ACTUAL = { backgroundColor: '#1976D21A', color: '#0D47A1', border: '1px solid #1976D255' };

export const estiloChipRonda = (actual) => (actual ? { ...BASE, ...ACTUAL } : BASE);
export const AVISO_N_CHICO = '⚠ muestra reducida';
const textoN = (casos) => (casos != null ? `n=${casos}` : 'n no informado');

// Chip + n (+ aviso si n < 30). "actual" marca la ronda actual.
export const ChipRonda = ({ fecha, casos, actual = false, conN = true }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
    <span style={estiloChipRonda(actual)}>{formatearFecha(fecha)}{actual ? ' · actual' : ''}</span>
    {conN && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{textoN(casos)}</span>}
    {conN && muestraReducida(casos) && <span style={{ fontSize: '11px', fontWeight: 600, color: '#8a5a00' }}>{AVISO_N_CHICO}</span>}
  </span>
);

// Versión HTML-string (para las barras de Calificación de gestión, que se arman como texto).
export function htmlChipRonda(fecha, { casos, actual = false, conN = true } = {}) {
  const chip = `<span style="${cssStr(estiloChipRonda(actual))}">${formatearFecha(fecha)}${actual ? ' · actual' : ''}</span>`;
  if (!conN) return chip;
  const n = `<span style="font-size:11px;color:var(--text-tertiary)">${textoN(casos)}</span>`;
  const aviso = muestraReducida(casos) ? `<span style="font-size:11px;font-weight:600;color:#8a5a00">${AVISO_N_CHICO}</span>` : '';
  return `<span style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap">${chip}${n}${aviso}</span>`;
}

// Fila con los chips de TODAS las rondas que entran en una comparación, en orden cronológico
// (de la más antigua a la actual). La actual lleva la marca "actual".
export const FilaChipsRondas = ({ rondas, fechaActual }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', marginBottom: '14px' }}>
    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Rondas, de la más antigua a la actual:</span>
    {rondas.map(r => <ChipRonda key={r.fecha} fecha={r.fecha} casos={r.casos} actual={r.fecha === fechaActual} />)}
  </div>
);
