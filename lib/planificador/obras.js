// Obras por circuito, "inaugurables" y cobertura por tipo (spec §3.5 y §3.6).
import { normalizarCircuitoKey } from '../pautaPorCircuito';
import { esFechaValida, fechaISOCorta } from './base';

export const esObraFinalizada = (o) => o?.estado === 'Finalizada' || (typeof o?.porcentaje_avance === 'number' && o.porcentaje_avance >= 1);

// Obra inaugurable = Finalizada, O avance 100 %, O con fecha_disponible_inaugurar.
export const esObraInaugurable = (o) => esObraFinalizada(o) || !!o?.fecha_disponible_inaugurar;

// Agrupa obras_capital.json (ya enriquecidas con _circuitoMapkey, ver
// enriquecerObrasConCircuito) por CircuitoKey normalizado ("0010" -> "10").
export function agruparObrasPorCircuito(obrasEnriquecidas, datos) {
  const keyPorMapkey = new Map(datos.map((d) => [String(d.Mapkey), normalizarCircuitoKey(d.CircuitoKey)]));
  const porCircuito = new Map(datos.map((d) => [normalizarCircuitoKey(d.CircuitoKey), []]));
  (obrasEnriquecidas || []).forEach((o) => {
    const ck = keyPorMapkey.get(String(o._circuitoMapkey));
    if (ck) porCircuito.get(ck).push(o);
  });
  return porCircuito;
}

// Fecha de referencia de una obra lista para inaugurar: fecha_disponible_inaugurar,
// si no fecha_finalizacion.
export const fechaListaObra = (o) => fechaISOCorta(o?.fecha_disponible_inaugurar) || fechaISOCorta(o?.fecha_finalizacion);

// Obras de un circuito a mostrar/recomendar como inauguración, las más relevantes primero:
// con fecha disponible para inaugurar más reciente, luego finalizadas.
export function ordenarInaugurables(lista) {
  return [...lista].sort((a, b) => {
    const fa = fechaListaObra(a) || '';
    const fb = fechaListaObra(b) || '';
    if (fa !== fb) return fa < fb ? 1 : -1;
    return String(a.nombre_obra || '').localeCompare(String(b.nombre_obra || ''), 'es');
  });
}

/**
 * Punto de integración del Parte de Obras diario (spec §3.6).
 * Si hay parte del día (resultado de parsearParte) usa las obras "finalizadas" del
 * parte para ese circuito; si no, cae a obras_capital.json.
 * @returns {{ fuente: 'parte'|'obras_capital', items: object[] }}
 */
export function obrasInaugurablesDeCircuito(circuitoKey, { parte, obrasDelCircuito }) {
  const ck = normalizarCircuitoKey(circuitoKey);
  if (parte?.items?.length) {
    const delParte = parte.items.filter((it) => normalizarCircuitoKey(it.ck) === ck && /^FINALIZ|^TERMINAD/.test(String(it.estadoNorm)));
    if (delParte.length) return { fuente: 'parte', items: delParte };
  }
  return { fuente: 'obras_capital', items: ordenarInaugurables((obrasDelCircuito || []).filter(esObraInaugurable)) };
}

export { esFechaValida };
