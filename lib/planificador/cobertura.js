// Cobertura de los 3 problemas principales (spec §4): para cada problema del top-3 de
// la encuesta, marca si alguna intervención lo atiende, según PALANCAS_POR_PROBLEMA.
import { problemasDeCircuito } from '../encuestasBloque';
import { PALANCAS_POR_PROBLEMA, ESTADOS_OBRA_EN_ACCION } from './config';
import { rondasOrdenadas } from './tendencia';

const esOtro = (cat) => /^otro/i.test(String(cat));

// Top-3 de "Problemas principales" de la última ronda que lo tenga, sin "Otro" (no es un
// problema accionable). Pide 4 a problemasDeCircuito para no perder un lugar si "Otro"
// cae dentro del top.
export function top3Problemas(encuesta) {
  const r = problemasDeCircuito(rondasOrdenadas(encuesta), 4);
  const items = r.items.filter((x) => !esOtro(x.cat)).slice(0, 3);
  return { estado: r.estado, fecha: r.fecha, items };
}

const etiquetaEstadoObra = (e) => (e === 'En ejecución' ? 'en ejecución' : e === 'Finalizada' ? 'finalizada' : e === 'Sin iniciar' ? 'sin iniciar' : 'sin datos');

/**
 * @param {{cat: string, valor: number}[]} problemas
 * @param {object[]} piezasPauta piezas de derivarPautaPorCircuito ({ pauta, vigente })
 * @param {object[]} obras obras del circuito (obras_capital.json enriquecidas)
 * @returns {{ cat, valor, estado: 'cubierto'|'planificado'|'descubierto'|'sin_palanca', detalle: string, nPautas?: number }[]}
 */
export function coberturaProblemas(problemas, piezasPauta, obras) {
  return problemas.map(({ cat, valor }) => {
    const palanca = PALANCAS_POR_PROBLEMA[cat];
    if (!palanca) {
      // Problema que el mapeo no conoce: no se simula cobertura.
      return { cat, valor, estado: 'descubierto', detalle: 'Sin cobertura definida para este problema' };
    }
    if (palanca.sinPalanca) {
      return { cat, valor, estado: 'sin_palanca', detalle: 'Sin palanca: no hay obra ni pauta que lo atienda' };
    }
    const partes = [];
    let cubierto = false;
    let nPautas = 0;
    if (palanca.pauta?.length) {
      const delEje = piezasPauta.filter((p) => palanca.pauta.includes(p.pauta?.eje));
      nPautas = delEje.length;
      if (nPautas) {
        cubierto = true;
        const vig = delEje.filter((p) => p.vigente).length;
        partes.push(`${nPautas} ${nPautas === 1 ? 'pauta' : 'pautas'}${vig ? ` (${vig} vigente${vig === 1 ? '' : 's'})` : ''}`);
      }
    }
    let planificado = false;
    if (palanca.obras?.length) {
      const delTipo = obras.filter((o) => palanca.obras.includes(o.tipo_obra));
      // Una obra solo "cubre" si está Finalizada o En ejecución (no si está solo planificada).
      const enAccion = delTipo.filter((o) => ESTADOS_OBRA_EN_ACCION.includes(o.estado));
      if (enAccion.length) {
        cubierto = true;
        const conteo = {};
        enAccion.forEach((o) => { const k = etiquetaEstadoObra(o.estado); conteo[k] = (conteo[k] || 0) + 1; });
        const tipos = [...new Set(enAccion.map((o) => o.tipo_obra))].join(' / ');
        partes.push(`${tipos}: ${Object.entries(conteo).map(([k, n]) => `${n} ${k}`).join(', ')}`);
      } else if (delTipo.length) {
        planificado = true;
        partes.push(`${delTipo.length} ${delTipo.length === 1 ? 'obra planificada' : 'obras planificadas'}, ninguna iniciada`);
      }
    }
    if (cubierto) return { cat, valor, estado: 'cubierto', detalle: partes.join(' · '), nPautas };
    if (planificado) return { cat, valor, estado: 'planificado', detalle: partes.join(' · '), nPautas };
    return { cat, valor, estado: 'descubierto', detalle: 'Sin cobertura', nPautas };
  });
}

// "No atendido" a los efectos de la recomendación: todo salvo "cubierto".
export const estaDescubierto = (c) => !c || c.estado !== 'cubierto';
