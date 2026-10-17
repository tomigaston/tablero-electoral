// Obras por circuito, "inaugurables" y cobertura por tipo (spec §3.5 y §3.6).
import { normalizarCircuitoKey } from '../pautaPorCircuito';
import { esFechaValida, fechaISOCorta, normalizarNombreBarrio } from './base';

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
 * Punto de integración del Parte de Obras diario (spec §2.6).
 * Devuelve las obras "listas" del circuito, cada una marcada con `confirmadaParte` si el parte
 * del día la trae como finalizada (mismo circuito y mismo barrio normalizado). Las obras
 * finalizadas del parte que no figuran en obras_capital.json se suman como `soloParte`.
 * Sin parte cargado: respaldo puro de obras_capital.json.
 * @returns {{ fuente: 'parte'|'obras_capital', items: object[], nConfirmadas: number }}
 */
const esFilaFinalizada = (it) => /^FINALIZ|^TERMINAD/.test(String(it.estadoNorm));

export function obrasInaugurablesDeCircuito(circuitoKey, { parte, obrasDelCircuito }) {
  const ck = normalizarCircuitoKey(circuitoKey);
  const delJson = ordenarInaugurables((obrasDelCircuito || []).filter(esObraInaugurable));
  const delParte = (parte?.items || []).filter((it) => esFilaFinalizada(it) && normalizarCircuitoKey(it.ck) === ck);
  if (!parte?.items?.length) return { fuente: 'obras_capital', items: delJson, nConfirmadas: 0 };

  const barriosParte = new Set(delParte.map((it) => normalizarNombreBarrio(it.barrio)));
  const usados = new Set();
  const items = delJson.map((o) => {
    const k = normalizarNombreBarrio(o.barrio);
    const confirmada = barriosParte.has(k);
    if (confirmada) usados.add(k);
    return { ...o, confirmadaParte: confirmada };
  });
  const soloParte = delParte.filter((it) => !usados.has(normalizarNombreBarrio(it.barrio)))
    .map((it) => ({ nombre_obra: [it.tipoLabel, it.dir].filter(Boolean).join(' · ') || it.tipoLong, tipo_obra: it.tipoLabel, estado: 'Finalizada (parte)', barrio: it.barrio, link_memoria_descriptiva: it.link, confirmadaParte: true, soloParte: true }));
  return { fuente: 'parte', items: [...items, ...soloParte], nConfirmadas: items.filter((o) => o.confirmadaParte).length + soloParte.length };
}

export { esFechaValida };
