// Secuencia cronológica de eventos por circuito + señales derivadas.
//
// Port de construirEventosPorCircuito (pages/index.js) con DOS diferencias deliberadas:
//  1) La pauta sale de derivarPautaPorCircuito (lib/pautaPorCircuito.js, ya exportada),
//     que deduplica por contenido: buscarPautaCircuito repite la misma pieza una vez por
//     barrio (~1.955 repeticiones en pautas_barrios.json) y eso inflaba el "N pautas".
//  2) Se suma el tipo 'obra' (obra lista, con fecha). Es informativo: NO cuenta como
//     intervención en las señales, porque "lista" no es "inaugurada".
// Además, el Planificador solo considera las visitas desde el 1/1/2026 (FECHA_MIN_VISITAS): las anteriores
// no entran en la ficha ni en el Resumen (ni en las señales ni en la prioridad que se derivan de ellas).
import { esFechaValida, normalizarNombreBarrio, buscarEncuestaCircuito, fechaISOCorta } from './base';
import { esObraInaugurable, fechaListaObra } from './obras';

export const FECHA_MIN_VISITAS = '2026-01-01';

const dia = (f) => String(f).slice(0, 10);

export function construirEventos({ circuito, encuestasData, recorridosLookup, cruceData, piezasPauta, obrasDelCircuito }) {
  const eventos = [];

  // Medición: una por ronda de encuesta.
  const enc = buscarEncuestaCircuito(encuestasData, circuito.CircuitoKey);
  const rondas = enc?.rondas || [];
  rondas.forEach((r, i) => {
    if (esFechaValida(r.fecha)) eventos.push({ tipo: 'medicion', fecha: dia(r.fecha), detalle: { ronda: i + 1, totalRondas: rondas.length, casos: r.casos, datos: r } });
  });

  // Visita: solo barrios donde ESTE circuito es el principal (orden_importancia 1), y solo desde FECHA_MIN_VISITAS.
  const clave = `${circuito.Mapkey} - ${circuito.cirn_nom}`;
  (cruceData?.circuito_to_barrios?.[clave] || []).filter((b) => b.orden_importancia === 1).forEach((b) => {
    const info = recorridosLookup?.[normalizarNombreBarrio(b.barrio_normalizado)];
    (info?.visitas || []).forEach((v) => {
      if (esFechaValida(v.fecha) && dia(v.fecha) >= FECHA_MIN_VISITAS) eventos.push({ tipo: 'visita', fecha: dia(v.fecha), detalle: { ...v, barrio: b.barrio } });
    });
  });

  // Pauta: fecha del evento = inicio de la pieza; `fin` queda en el detalle.
  (piezasPauta || []).forEach((p) => {
    if (esFechaValida(p.pauta?.inicio)) eventos.push({ tipo: 'pauta', fecha: dia(p.pauta.inicio), detalle: p.pauta, vigente: p.vigente, barrios: p.barrios });
  });

  // Obra lista para inaugurar (informativo).
  (obrasDelCircuito || []).filter(esObraInaugurable).forEach((o) => {
    const f = fechaListaObra(o);
    if (f) eventos.push({ tipo: 'obra', fecha: f, detalle: o });
  });

  const peso = { medicion: 0, visita: 1, pauta: 2, obra: 3 };
  eventos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : peso[a.tipo] - peso[b.tipo]));
  return eventos;
}

/**
 * Señales derivadas. Intervención = visita o pauta.
 * - Una pauta "termina" en su `fin` (si no tiene, en su `inicio`): una medición solo la
 *   evalúa si es posterior a ese fin.
 * - Las comparaciones son por día (YYYY-MM-DD) y estrictas.
 */
export function analizarSecuencia(eventos) {
  const meds = eventos.filter((e) => e.tipo === 'medicion').map((e) => e.fecha);
  const pautas = eventos.filter((e) => e.tipo === 'pauta');
  const visitas = eventos.filter((e) => e.tipo === 'visita');

  const finPauta = (e) => fechaISOCorta(e.detalle?.fin) || e.fecha;
  const finesPauta = pautas.map(finPauta).sort();
  const ultimaPautaFin = finesPauta.length ? finesPauta[finesPauta.length - 1] : null;
  const ultimaPautaInicio = pautas.length ? pautas[pautas.length - 1].fecha : null;
  const ultimaVisita = visitas.length ? visitas[visitas.length - 1].fecha : null;
  const finesInterv = [ultimaPautaFin, ultimaVisita].filter(Boolean).sort();
  const ultimaIntervencion = finesInterv.length ? finesInterv[finesInterv.length - 1] : null;
  const ultimaIntervencionTipo = !ultimaIntervencion ? null : (ultimaIntervencion === ultimaPautaFin ? 'pauta' : 'visita');

  const ultimaMedicion = meds.length ? meds[meds.length - 1] : null;
  const hayMedicionDespuesDe = (f) => f != null && meds.some((m) => m > f);
  const hayIntervenciones = pautas.length + visitas.length > 0;

  return {
    nMediciones: meds.length,
    nPautas: pautas.length,
    nVisitas: visitas.length,
    ultimaMedicion, ultimaIntervencion, ultimaIntervencionTipo, ultimaPautaInicio, ultimaPautaFin, ultimaVisita,
    hayIntervenciones,
    medicionPosteriorEvaluable: hayIntervenciones && hayMedicionDespuesDe(ultimaIntervencion),
    pautaSinMedicionPosterior: pautas.length > 0 && !hayMedicionDespuesDe(ultimaPautaFin),
  };
}

export { fechaISOCorta };
