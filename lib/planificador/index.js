// Arma las filas del Planificador (una por circuito) cruzando las tres dimensiones:
// electoral, encuesta e intervenciones. Funciones puras: reciben los JSON ya cargados.
import { buscarEncuestaCircuito, hoyLocal, diasDesde } from './base';
import { TIER_POR_CATEGORIA, UMBRAL_VARIACION_PP_DEFAULT, COLOR_CATEGORIA, COLOR_CATEGORIA_NEUTRO } from './config';
import { calcularTendencia, nivelVsReferencia, rondasOrdenadas } from './tendencia';
import { construirEventos, compactarSecuencia, analizarSecuencia } from './eventos';
import { agruparObrasPorCircuito, obrasInaugurablesDeCircuito } from './obras';
import { top3Problemas, coberturaProblemas } from './cobertura';
import { recomendar } from './recomendacion';
import { calcularPrioridad } from './prioridad';
import { derivarPautaPorCircuito, normalizarCircuitoKey } from '../pautaPorCircuito';
import { normalizarNombreBarrio } from './base';

export function indexarRecorridos(recorridosData) {
  const lookup = {};
  Object.entries(recorridosData || {}).forEach(([nombre, info]) => {
    const key = normalizarNombreBarrio(nombre);
    if (key) lookup[key] = info;
  });
  return lookup;
}

export function colorDeCategoria(nombre) {
  return COLOR_CATEGORIA[nombre] || COLOR_CATEGORIA_NEUTRO;
}

/**
 * @param {object} d
 *  datos (circuitos_completo.json), encuestasData, encuestasMetadata, recorridosData, cruceData,
 *  pautasBarriosData, barriosGeoData, obrasEnriquecidas, parte (resultado de parsearParte | null), hoy
 */
export function construirPlanificador(d) {
  const hoy = d.hoy || hoyLocal();
  const umbral = d.encuestasMetadata?.umbral_variacion_pp ?? UMBRAL_VARIACION_PP_DEFAULT;
  const recorridosLookup = indexarRecorridos(d.recorridosData);
  const pautaDerivada = derivarPautaPorCircuito({
    pautasBarriosData: d.pautasBarriosData, datos: d.datos, barriosGeoData: d.barriosGeoData, cruceData: d.cruceData, hoy,
  });
  const piezasPorCircuito = new Map((pautaDerivada?.circuitos || []).map((c) => [c.key, c.piezas]));
  const obrasPorCircuito = agruparObrasPorCircuito(d.obrasEnriquecidas, d.datos);

  const filas = d.datos.map((c) => {
    const ck = normalizarCircuitoKey(c.CircuitoKey);
    const encuesta = buscarEncuestaCircuito(d.encuestasData, c.CircuitoKey);
    const piezas = piezasPorCircuito.get(ck) || [];
    const obras = obrasPorCircuito.get(ck) || [];

    const tier = TIER_POR_CATEGORIA[c.Categoria_v4_Nombre] || null;
    const tendencia = calcularTendencia(encuesta, umbral);
    const vsRef = nivelVsReferencia(tendencia.aprobacion, c.Share_G23);

    const eventos = construirEventos({
      circuito: c, encuestasData: d.encuestasData, recorridosLookup, cruceData: d.cruceData, piezasPauta: piezas, obrasDelCircuito: obras,
    });
    const senales = { ...analizarSecuencia(eventos), nPautasTotal: piezas.length };
    const problemas = top3Problemas(encuesta);
    const cobertura = coberturaProblemas(problemas.items, piezas, obras);
    const inaug = obrasInaugurablesDeCircuito(ck, { parte: d.parte, obrasDelCircuito: obras });

    const prioridad = calcularPrioridad({ tendencia, tier, senales });
    const recomendacion = recomendar({ tier, tendencia, vsRef, senales, cobertura, inaugurables: inaug.items });

    return {
      key: ck,
      mapkey: c.Mapkey,
      nombre: c.cirn_nom || '',
      datosCircuito: c,
      padron: c.Padron_G23 ?? null,
      shareInt19: c.Share_Int19 ?? null,
      shareG23: c.Share_G23 ?? null,
      categoria: c.Categoria_v4_Nombre || null,
      tier,
      tendencia,
      vsRef,
      rondas: rondasOrdenadas(encuesta),
      problemas, cobertura,
      eventos, secuencia: compactarSecuencia(eventos), senales,
      diasSinMedir: senales.ultimaMedicion ? diasDesde(senales.ultimaMedicion, hoy) : null,
      piezasPauta: piezas,
      obras,
      inaugurables: inaug.items,
      fuenteInaugurables: inaug.fuente,
      prioridad,
      recomendacion,
    };
  });

  return { filas, pautaDerivada };
}

export function calcularKpis(filas) {
  return {
    sinMedir: filas.filter((f) => f.tendencia.estado === 'sin_medir').length,
    empeorando: filas.filter((f) => f.tendencia.estado === 'empeora').length,
    conObraLista: filas.filter((f) => f.inaugurables.length > 0).length,
    prioritarios: filas.filter((f) => f.prioridad.nivel === 'alta').length,
  };
}
