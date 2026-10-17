// Utilidades compartidas del Planificador.
//
// Varias funciones de acá son COPIAS de helpers que hoy viven privados dentro de
// pages/index.js (no están exportadas y esta feature no toca ese archivo): se
// duplican sin cambiar su lógica. Cuando el piloto se valide, lo correcto es extraerlas
// de index.js a un lib/ común y borrar estas copias. Origen de cada una indicado abajo.

// Origen: pages/index.js → normalizarNombreBarrio
export const normalizarNombreBarrio = (s) => (s || '')
  .toUpperCase()
  .replace(/[ºª]/g, 'O')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Origen: pages/index.js → esFechaValida (match de prefijo YYYY-MM-DD, tolera sufijo de hora)
export const esFechaValida = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f) && !isNaN(new Date(f).getTime());

// Origen: pages/index.js → formatPct / formatPP (valores en escala 0..1)
export const formatPct = (val) => (val != null ? `${(val * 100).toFixed(1)}%` : '—');
export const formatPP = (val) => (val != null ? `${val > 0 ? '+' : ''}${(val * 100).toFixed(1)} pp` : '—');

// Variantes en puntos porcentuales ya expresados en pp (la encuesta guarda 53 = 53 %).
export const fmtPuntos = (v, dec = 1) => (v == null || Number.isNaN(v) ? '—' : `${v.toFixed(dec).replace('.', ',')}`);
export const fmtDeltaPP = (v) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1).replace('.', ',')} pp`);

// Origen: pages/index.js → buscarEncuestaCircuito (la clave a veces viene con letra y
// número invertidos: "A14" por "14A").
export function buscarEncuestaCircuito(encuestasData, circuitoKey) {
  if (!encuestasData || !circuitoKey) return null;
  const key = String(circuitoKey);
  if (encuestasData[key]) return encuestasData[key];
  const m = /^(\d+)([A-Za-z]+)$/.exec(key);
  if (m) {
    const swapped = `${m[2]}${m[1]}`;
    if (encuestasData[swapped]) return encuestasData[swapped];
  }
  return null;
}

// Hoy a medianoche local, para diferencias en días.
export function hoyLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function diasDesde(fechaISO, hoy = hoyLocal()) {
  if (!esFechaValida(fechaISO)) return null;
  const [y, m, d] = fechaISO.slice(0, 10).split('-').map(Number);
  const f = new Date(y, m - 1, d);
  return Math.round((hoy.getTime() - f.getTime()) / 86400000);
}

// "2026-10-14T00:00:00" | "2026-10-14" -> "2026-10-14" (o null)
export const fechaISOCorta = (f) => (esFechaValida(f) ? f.slice(0, 10) : null);
