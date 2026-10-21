// Semáforo de situación de cada circuito (criterio del cliente; reemplaza al de prioridad por tier/pauta).
//  gris     (sin_medir) — no está medido: sin encuesta, o sin dato de aprobación del Gobernador.
//  rojo     (negativa)  — tendencia negativa: la aprobación cae más de UMBRAL_SEMAFORO_PP.
//  amarillo (estable)   — estable o leve baja (hasta −UMBRAL_SEMAFORO_PP); también una leve suba.
//  verde    (positiva)  — mejora: la aprobación sube más de UMBRAL_SEMAFORO_PP.
// Se compara contra la encuesta anterior si hay dos o más rondas; con una sola, contra el resultado de Gobernación 2023 (Share_G23).
import { UMBRAL_SEMAFORO_PP } from './config';
import { fmtDeltaPP } from './base';

/**
 * @param {{ tendencia: object, vsRef: {diff: number}|null }} p
 *  vsRef: aprobación actual vs Share_G23 (diff en 0..1), de nivelVsReferencia
 * @returns {{ nivel: 'sin_medir'|'negativa'|'estable'|'positiva', porque: string, delta: number|null, contra: string|null }}
 */
export function calcularPrioridad({ tendencia, vsRef }) {
  if (tendencia.estado === 'sin_medir' || tendencia.aprobacion == null) {
    return { nivel: 'sin_medir', porque: 'Sin dato de aprobación: no está medido', delta: null, contra: null };
  }
  let delta; let contra;
  if (tendencia.delta != null) { delta = tendencia.delta; contra = 'la encuesta anterior'; }
  else if (vsRef) { delta = vsRef.diff * 100; contra = 'Gobernación 2023'; }
  else return { nivel: 'estable', porque: 'Una sola ronda y sin resultado de Gobernación 2023 para comparar', delta: null, contra: null };

  const nivel = delta < -UMBRAL_SEMAFORO_PP ? 'negativa' : delta > UMBRAL_SEMAFORO_PP ? 'positiva' : 'estable';
  return { nivel, porque: `${fmtDeltaPP(delta)} respecto a ${contra}`, delta, contra };
}

// Para ordenar la lista: primero lo que empeora, después lo no medido.
export const ORDEN_PRIORIDAD = { negativa: 0, sin_medir: 1, estable: 2, positiva: 3 };
