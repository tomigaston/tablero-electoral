import { formatearFecha } from '../lib/formatearFecha';

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
