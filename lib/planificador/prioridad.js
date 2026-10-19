// Semáforo de prioridad (criterio aprobado, spec §6) + ajuste pedido por el cliente.
//  Alta : la tendencia empeora, O (tier Desfavorable/Adverso SIN medir),
//         O (lo que sería Media pero el circuito es Desfavorable/Adverso).
//  Media: pauta hecha sin medición posterior que la evalúe, O una sola ronda (si el clima NO es Desfavorable/Adverso).
//  Baja : tier Favorable con tendencia estable o mejorando.
//  Default: media (o alta si el clima es Desfavorable/Adverso).
export function calcularPrioridad({ tendencia, tier, senales }) {
  const sinMedir = tendencia.estado === 'sin_medir';
  const climaDificil = tier === 'desfavorable' || tier === 'adverso';
  if (tendencia.estado === 'empeora') return { nivel: 'alta', porque: 'La aprobación empeora' };
  if (sinMedir && climaDificil) return { nivel: 'alta', porque: 'Clima desfavorable y sin medir' };

  // Se evalúa en el orden de la spec (alta, media, baja): una pauta sin evaluar pesa más que "favorable y estable".
  // Lo que cae en Media sube a Alta si el circuito es Desfavorable/Adverso.
  const media = (porque) => (climaDificil
    ? { nivel: 'alta', porque: `${porque}, y clima ${tier}` }
    : { nivel: 'media', porque });
  if (senales.pautaSinMedicionPosterior) return media('Hay pauta sin medición posterior que la evalúe');
  if (tendencia.nRondas === 1) return media('Una sola ronda de encuesta');
  if (tier === 'favorable' && (tendencia.estado === 'estable' || tendencia.estado === 'mejora')) return { nivel: 'baja', porque: 'Favorable y estable o mejorando' };
  return media('Sin señal de urgencia ni de calma');
}

export const ORDEN_PRIORIDAD = { alta: 0, media: 1, baja: 2 };
