// Tendencia de aprobación del Gobernador por circuito (spec §3.2).
// Las encuestas guardan los porcentajes en puntos (53 = 53 %); Share_G23 está en 0..1.
import { UMBRAL_VARIACION_PP_DEFAULT } from './config';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function rondasOrdenadas(encuesta) {
  return [...(encuesta?.rondas || [])].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

export const apruebaDe = (ronda) => num(ronda?.preguntas?.['Aprobación Gobernador']?.Apruebo);
export const reeleccionDe = (ronda) => num(ronda?.preguntas?.['Reelección Llaryora']?.Si);

/**
 * @returns {{
 *   estado: 'sin_medir'|'sin_tendencia'|'mejora'|'empeora'|'estable',
 *   nRondas: number, aprobacion: number|null, aprobacionPrevia: number|null,
 *   delta: number|null, serie: {fecha: string, apruebo: number}[],
 *   fechaUltima: string|null
 * }}
 */
export function calcularTendencia(encuesta, umbral = UMBRAL_VARIACION_PP_DEFAULT) {
  const rondas = rondasOrdenadas(encuesta);
  if (!rondas.length) {
    return { estado: 'sin_medir', nRondas: 0, aprobacion: null, aprobacionPrevia: null, delta: null, serie: [], fechaUltima: null };
  }
  const serie = rondas.map((r) => ({ fecha: r.fecha, apruebo: apruebaDe(r) })).filter((p) => p.apruebo != null);
  const base = {
    nRondas: rondas.length,
    aprobacion: serie.length ? serie[serie.length - 1].apruebo : null,
    serie,
    fechaUltima: rondas[rondas.length - 1].fecha,
  };
  // Una sola ronda (o una sola con aprobación): no hay con qué comparar.
  if (rondas.length < 2 || serie.length < 2) {
    return { ...base, estado: 'sin_tendencia', aprobacionPrevia: null, delta: null };
  }
  const ultima = serie[serie.length - 1].apruebo;
  const previa = serie[serie.length - 2].apruebo;
  const delta = ultima - previa;
  const estado = delta >= umbral ? 'mejora' : delta <= -umbral ? 'empeora' : 'estable';
  return { ...base, estado, aprobacionPrevia: previa, delta };
}

// Aprobación actual (0..1) vs Share_G23 (0..1): referencia direccional, NO igualdad
// estricta (son métricas distintas: aprobación de gestión vs share de votos).
export function nivelVsReferencia(aprobacionPuntos, shareG23) {
  if (aprobacionPuntos == null || shareG23 == null) return null;
  const diff = aprobacionPuntos / 100 - shareG23;
  return { diff, porEncima: diff >= 0 };
}
