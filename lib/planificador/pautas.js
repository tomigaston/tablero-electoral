// Agrupación de piezas de pauta de un circuito: campaña → pieza (drill-down de la ficha).
import { limpiarMetrica, normalizarTexto } from '../pautaPorCircuito';
import { fechaISOCorta } from './base';

const sumar = (vals) => vals.reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);
export const inversionDe = (pauta) => { const v = limpiarMetrica(pauta?.metricas_ejecutadas?.inversion); return typeof v === 'number' ? v : null; };

/** piezas = [{ pauta, vigente, barrios }] -> campañas ordenadas por fin desc. */
export function agruparPorCampania(piezas) {
  const mapa = new Map();
  (piezas || []).forEach((p) => {
    // Clave sin mayúsculas/acentos: "CORDOBESES EN ALERTA" y "Cordobeses en Alerta" son la misma campaña.
    const k = `${normalizarTexto(p.pauta.campania || 'Sin campaña')}||${normalizarTexto(p.pauta.eje || '')}`;
    if (!mapa.has(k)) mapa.set(k, { campania: p.pauta.campania || 'Sin campaña', eje: p.pauta.eje || null, piezas: [] });
    mapa.get(k).piezas.push(p);
  });
  return [...mapa.values()].map((c) => {
    const inicios = c.piezas.map((p) => fechaISOCorta(p.pauta.inicio)).filter(Boolean).sort();
    const fines = c.piezas.map((p) => fechaISOCorta(p.pauta.fin)).filter(Boolean).sort();
    const invs = c.piezas.map((p) => inversionDe(p.pauta)).filter((v) => v != null);
    return {
      ...c,
      desde: inicios[0] || null,
      hasta: fines[fines.length - 1] || null,
      inversion: invs.length ? sumar(invs) : null,
      plataformas: [...new Set(c.piezas.map((p) => p.pauta.plataforma).filter(Boolean))],
      vigentes: c.piezas.filter((p) => p.vigente).length,
      piezasOrdenadas: [...c.piezas].sort((a, b) => String(b.pauta.inicio || '').localeCompare(String(a.pauta.inicio || ''))),
    };
  }).sort((a, b) => String(b.hasta || '').localeCompare(String(a.hasta || '')));
}
