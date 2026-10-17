// Secuencia cronológica de eventos por circuito + señales derivadas (spec §4).
//
// Port de construirEventosPorCircuito (pages/index.js) con DOS diferencias deliberadas:
//  1) La pauta sale de derivarPautaPorCircuito (lib/pautaPorCircuito.js, ya exportada),
//     que deduplica por contenido: buscarPautaCircuito repite la misma pieza una vez por
//     barrio (~1.955 repeticiones en pautas_barrios.json) y eso inflaba el "N pautas".
//  2) Se suma el tipo 'obra' (obra lista para inaugurar, con fecha). Es solo informativo:
//     NO cuenta como intervención en las señales de ciclo, porque "lista" no es "inaugurada".
import { esFechaValida, normalizarNombreBarrio, buscarEncuestaCircuito, fechaISOCorta } from './base';
import { normalizarCircuitoKey } from '../pautaPorCircuito';
import { esObraInaugurable, fechaListaObra } from './obras';

const dia = (f) => String(f).slice(0, 10);

export function construirEventos({ circuito, encuestasData, recorridosLookup, cruceData, piezasPauta, obrasDelCircuito }) {
  const eventos = [];

  // Medición: una por ronda de encuesta.
  const enc = buscarEncuestaCircuito(encuestasData, circuito.CircuitoKey);
  const rondas = enc?.rondas || [];
  rondas.forEach((r, i) => {
    if (esFechaValida(r.fecha)) eventos.push({ tipo: 'medicion', fecha: dia(r.fecha), detalle: { ronda: i + 1, totalRondas: rondas.length, casos: r.casos, datos: r } });
  });

  // Visita: solo barrios donde ESTE circuito es el principal (orden_importancia 1).
  const clave = `${circuito.Mapkey} - ${circuito.cirn_nom}`;
  (cruceData?.circuito_to_barrios?.[clave] || []).filter((b) => b.orden_importancia === 1).forEach((b) => {
    const info = recorridosLookup?.[normalizarNombreBarrio(b.barrio_normalizado)];
    (info?.visitas || []).forEach((v) => {
      if (esFechaValida(v.fecha)) eventos.push({ tipo: 'visita', fecha: dia(v.fecha), detalle: { ...v, barrio: b.barrio } });
    });
  });

  // Pauta: fecha del evento = inicio de la pieza.
  (piezasPauta || []).forEach((p) => {
    if (esFechaValida(p.pauta?.inicio)) eventos.push({ tipo: 'pauta', fecha: dia(p.pauta.inicio), detalle: p.pauta, vigente: p.vigente, barrios: p.barrios });
  });

  // Obra lista para inaugurar (informativo).
  (obrasDelCircuito || []).filter(esObraInaugurable).forEach((o) => {
    const f = fechaListaObra(o);
    if (f) eventos.push({ tipo: 'obra', fecha: f, detalle: o });
  });

  // Orden cronológico; a igual fecha, medición antes que intervención (la base va primero).
  const peso = { medicion: 0, visita: 1, pauta: 2, obra: 3 };
  eventos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : peso[a.tipo] - peso[b.tipo]));
  return eventos;
}

// Compacta eventos consecutivos del mismo tipo para el renglón de la tabla: M, P×12, V, M.
export function compactarSecuencia(eventos) {
  const out = [];
  eventos.forEach((e) => {
    const ult = out[out.length - 1];
    if (ult && ult.tipo === e.tipo) ult.n += 1;
    else out.push({ tipo: e.tipo, n: 1, desde: e.fecha });
  });
  return out;
}

/**
 * Señales derivadas de la secuencia. Intervención = visita o pauta.
 * Las comparaciones son por día (YYYY-MM-DD) y estrictas: una medición el mismo día que
 * la intervención no cuenta como "posterior".
 */
export function analizarSecuencia(eventos) {
  const meds = eventos.filter((e) => e.tipo === 'medicion').map((e) => e.fecha);
  const pautas = eventos.filter((e) => e.tipo === 'pauta');
  const visitas = eventos.filter((e) => e.tipo === 'visita');
  const ints = [...pautas, ...visitas].map((e) => e.fecha).sort();

  const ultimaMedicion = meds.length ? meds[meds.length - 1] : null;
  const primeraMedicion = meds.length ? meds[0] : null;
  const ultimaIntervencion = ints.length ? ints[ints.length - 1] : null;
  const primeraIntervencion = ints.length ? ints[0] : null;
  const ultimaPauta = pautas.length ? pautas[pautas.length - 1].fecha : null;

  const hayMedicionDespuesDe = (f) => f != null && meds.some((m) => m > f);
  const medicionPosteriorEvaluable = ints.length > 0 && hayMedicionDespuesDe(ultimaIntervencion);
  // medición -> intervención -> medición
  const cicloIdealCumplido = ints.some((i) => meds.some((m) => m < i) && meds.some((m) => m > i));
  // intervino después de medir y todavía no hay medición que lo cierre
  const intervinoTrasMedirSinCierre = meds.length > 0 && ints.some((i) => i > primeraMedicion) && !hayMedicionDespuesDe(ultimaIntervencion);
  // hay intervención sin ninguna medición previa que sirva de base
  const intervencionSinMedicionPrevia = ints.length > 0 && (primeraMedicion == null || primeraIntervencion < primeraMedicion);
  const pautaSinMedicionPosterior = pautas.length > 0 && !hayMedicionDespuesDe(ultimaPauta);

  return {
    nMediciones: meds.length,
    nPautas: pautas.length,
    nVisitas: visitas.length,
    ultimaMedicion, ultimaIntervencion, ultimaPauta,
    medicionPosteriorEvaluable, cicloIdealCumplido, intervinoTrasMedirSinCierre,
    intervencionSinMedicionPrevia, pautaSinMedicionPosterior,
  };
}

export { normalizarCircuitoKey, fechaISOCorta };
