// Semáforo de prioridad (criterio aprobado, spec §6).
//  Alta : la tendencia empeora, O (tier Desfavorable/Adverso SIN medir).
//  Media: pauta hecha sin medición posterior que la evalúe, O una sola ronda.
//  Baja : tier Favorable con tendencia estable o mejorando.
//  Default: media.
export function calcularPrioridad({ tendencia, tier, senales }) {
  const sinMedir = tendencia.estado === 'sin_medir';
  if (tendencia.estado === 'empeora') return { nivel: 'alta', porque: 'La aprobación empeora' };
  if (sinMedir && (tier === 'desfavorable' || tier === 'adverso')) return { nivel: 'alta', porque: 'Clima desfavorable y sin medir' };
  // Se evalúa en el orden de la spec (alta, media, baja): una pauta sin evaluar pesa más que "favorable y estable".
  if (senales.pautaSinMedicionPosterior) return { nivel: 'media', porque: 'Hay pauta sin medición posterior que la evalúe' };
  if (tendencia.nRondas === 1) return { nivel: 'media', porque: 'Una sola ronda de encuesta' };
  if (tier === 'favorable' && (tendencia.estado === 'estable' || tendencia.estado === 'mejora')) return { nivel: 'baja', porque: 'Favorable y estable o mejorando' };
  return { nivel: 'media', porque: 'Sin señal de urgencia ni de calma' };
}

export const ORDEN_PRIORIDAD = { alta: 0, media: 1, baja: 2 };
