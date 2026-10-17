// Motor de recomendación (spec §5). Devuelve un paquete { regla, etiqueta, acciones[], motivo, ... }.
//
// Estructura: primero se ramifica por estado de medición (sin base no se decide), se elige
// la acción base con el primer match de la tabla, y después se aplican dos cosas SIEMPRE:
//  - el override "inauguramos todo" (si hay obra inaugurable se suma la acción), y
//  - el modificador 15 (pauta que no cubre el problema #1).
//
// Lenguaje prudente: con 1–2 encuestas por circuito solo hay coincidencia temporal.
// Nunca se escribe "la pauta funcionó / no funcionó".
import { fmtPuntos, fmtDeltaPP, formatPct } from './base';
import { estaDescubierto } from './cobertura';

const ACCION = {
  medir: 'medir',
  remedir: 'remedir',
  pauta: 'pauta',
  visita: 'visita',
  visitaJerarquia: 'visita_jerarquia',
  obra: 'obra',
  inaugurar: 'inaugurar',
  sostener: 'sostener',
  realinear: 'realinear',
  cambiarPalanca: 'cambiar_palanca',
};

const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

function textoProblema1(p1) {
  if (!p1) return null;
  const pct = `${fmtPuntos(p1.valor, 0)} %`;
  if (p1.estado === 'sin_palanca') return `el problema principal del barrio es ${p1.cat} (${pct}) y no tiene obra ni pauta que lo atienda`;
  if (p1.estado === 'cubierto') return `el problema principal es ${p1.cat} (${pct}), con cobertura: ${p1.detalle}`;
  if (p1.estado === 'planificado') return `el problema principal es ${p1.cat} (${pct}); hay obra planificada pero sin iniciar`;
  return `el problema principal es ${p1.cat} (${pct}) y no está cubierto por ninguna intervención`;
}

function textoTendencia(t) {
  if (t.estado === 'mejora') return `La aprobación subió ${fmtDeltaPP(t.delta).replace('+', '')} (de ${fmtPuntos(t.aprobacionPrevia)} % a ${fmtPuntos(t.aprobacion)} %)`;
  if (t.estado === 'empeora') return `La aprobación bajó ${fmtDeltaPP(t.delta).replace('−', '')} (de ${fmtPuntos(t.aprobacionPrevia)} % a ${fmtPuntos(t.aprobacion)} %)`;
  if (t.estado === 'estable') return `La aprobación se mantuvo estable (${fmtPuntos(t.aprobacionPrevia)} % → ${fmtPuntos(t.aprobacion)} %)`;
  if (t.estado === 'sin_tendencia') return `Hay una sola medición (aprobación ${fmtPuntos(t.aprobacion)} %), sin tendencia todavía`;
  return 'El circuito nunca fue medido';
}

function textoNivel(vsRef) {
  if (!vsRef) return null;
  const pp = Math.abs(vsRef.diff * 100).toFixed(1).replace('.', ',');
  return vsRef.porEncima ? `queda ${pp} pp por encima de la referencia 2023` : `queda ${pp} pp por debajo de la referencia 2023`;
}

function textoIntervenciones(s) {
  const partes = [];
  const nPautas = s.nPautasTotal ?? s.nPautas;
  if (nPautas) partes.push(plural(nPautas, 'pauta', 'pautas'));
  if (s.nVisitas) partes.push(plural(s.nVisitas, 'visita', 'visitas'));
  return partes.length ? partes.join(' y ') : null;
}

/**
 * @param {object} ctx
 *  tier, tendencia, vsRef, senales (analizarSecuencia), cobertura (3 problemas, ordenados),
 *  inaugurables (array de obras/items), tieneEncuesta
 */
export function recomendar(ctx) {
  const { tier, tendencia: t, vsRef, senales: s, cobertura, inaugurables } = ctx;
  const p1 = cobertura?.[0] || null;
  const peor = tier === 'desfavorable' || tier === 'adverso';
  const bajoMeta = vsRef ? !vsRef.porEncima : null; // null = no hay con qué comparar
  const intervs = textoIntervenciones(s);
  const nota = [];     // frases del motivo, en orden
  const acciones = [];
  let regla; let etiqueta; let prioridadSugerida;

  const accion = (tipo, texto) => acciones.push({ tipo, texto });
  const visitaTerritorial = () => accion(ACCION.visita, 'Visita territorial al circuito');
  const pautaAlineada = () => {
    if (!p1) return accion(ACCION.pauta, 'Pauta dirigida al problema principal (a definir al medir)');
    if (p1.estado === 'sin_palanca') return accion(ACCION.pauta, `Comunicar ${p1.cat} con visita: no hay obra ni pauta que lo atienda hoy`);
    return accion(ACCION.pauta, `Pauta alineada al problema #1 (${p1.cat})`);
  };

  // ---- 1) Ramificación por estado de medición ----
  if (t.nRondas === 0) {
    nota.push(textoTendencia(t));
    if (peor) {
      regla = 1; etiqueta = 'Medir ya'; prioridadSugerida = 'alta';
      accion(ACCION.medir, 'Medir ya: clima desfavorable y sin ninguna encuesta');
      nota.push(`el clima electoral es ${tier} y sin base no se puede decidir qué hacer`);
    } else {
      regla = 2; etiqueta = 'Medir (control)'; prioridadSugerida = tier === 'favorable' ? 'baja' : 'media';
      accion(ACCION.medir, 'Medir como control');
      nota.push(`el clima electoral es ${tier}; una medición de control da la base para decidir`);
    }
    if (s.intervencionSinMedicionPrevia) nota.push(`ya se hicieron ${intervs} sin medición previa`);
  } else if (t.nRondas === 1 || t.estado === 'sin_tendencia') {
    nota.push(textoTendencia(t));
    if (s.intervinoTrasMedirSinCierre) {
      regla = 5; etiqueta = 'Re-medir'; prioridadSugerida = 'media';
      accion(ACCION.remedir, 'Re-medir para cerrar el ciclo medición → intervención → medición');
      nota.push(`después de la medición hubo ${intervs || 'intervención'}; sin una segunda ronda no se puede evaluar (solo coincidencia temporal, no causalidad)`);
    } else if (bajoMeta === false || bajoMeta === null) {
      regla = 3; etiqueta = 'Intervenir y re-medir'; prioridadSugerida = 'media';
      pautaAlineada();
      if (!s.nVisitas) accion(ACCION.visita, 'Sumar una visita si corresponde');
      accion(ACCION.remedir, 'Re-medir luego de intervenir (≈30 días)');
      const n = textoNivel(vsRef);
      nota.push(n ? `${n}, sin intervención posterior a la medición` : 'sin intervención posterior a la medición');
    } else {
      regla = 4; etiqueta = 'Intervenir y re-medir'; prioridadSugerida = peor ? 'alta' : 'media';
      pautaAlineada();
      visitaTerritorial();
      accion(ACCION.remedir, 'Re-medir luego de intervenir (≈30 días)');
      nota.push(textoNivel(vsRef));
    }
  } else if (t.estado === 'empeora') {
    nota.push(`${textoTendencia(t)}${intervs ? ` con ${intervs} en el período (coincidencia temporal, no causalidad)` : ''}`);
    if (s.cicloIdealCumplido) {
      regla = 11; etiqueta = 'No repetir la receta'; prioridadSugerida = 'alta';
      accion(ACCION.cambiarPalanca, 'No repetir la receta: cambiar o intensificar la palanca');
      accion(ACCION.visitaJerarquia, 'Visita de jerarquía (Gobernador / Siciliano)');
      nota.push('el ciclo medir → intervenir → medir ya se cumplió y el resultado empeoró');
    } else if (tier === 'favorable') {
      regla = 13; etiqueta = 'Defender el bastión'; prioridadSugerida = 'media';
      accion(ACCION.sostener, 'Defender el bastión aunque el nivel siga alto');
      visitaTerritorial();
      accion(ACCION.remedir, 'Re-medir para confirmar la caída');
      nota.push('es un bastión: el nivel sigue alto pero la caída hay que frenarla a tiempo');
    } else {
      regla = 12; etiqueta = 'Intervención fuerte'; prioridadSugerida = 'alta';
      accion(ACCION.visitaJerarquia, 'Intervención fuerte: visita de jerarquía (Gobernador / Siciliano)');
      pautaAlineada();
      accion(ACCION.obra, 'Obra visible en el circuito');
      accion(ACCION.remedir, 'Medir después de intervenir');
      nota.push(`el clima es ${tier} y la tendencia es negativa`);
    }
  } else if (t.estado === 'mejora') {
    nota.push(`${textoTendencia(t)}${intervs ? ` con ${intervs} en el período (coincidencia temporal, no causalidad)` : ''}`);
    if (tier === 'favorable') {
      regla = 6; etiqueta = 'Sostener'; prioridadSugerida = 'baja';
      accion(ACCION.sostener, 'Sostener lo hecho');
    } else {
      regla = 7; etiqueta = 'Reforzar misma línea'; prioridadSugerida = 'media';
      accion(ACCION.pauta, 'Reforzar la misma línea (mismo tema) y seguir midiendo');
      accion(ACCION.remedir, 'Seguir midiendo');
    }
    if (bajoMeta) {
      nota.push(`pero todavía ${textoNivel(vsRef)}: no cantar victoria y re-medir`);
      if (regla === 6) accion(ACCION.remedir, 'Re-medir: aún por debajo de la referencia 2023');
    }
  } else { // estable
    nota.push(textoTendencia(t));
    if (bajoMeta) {
      regla = 9; etiqueta = 'Cambiar de palanca'; prioridadSugerida = peor ? 'alta' : 'media';
      const soloPauta = s.nPautas > 0 && s.nVisitas === 0;
      if (soloPauta) accion(ACCION.cambiarPalanca, 'Cambiar de palanca: hasta ahora solo hubo pauta, sumar visita y/u obra');
      else accion(ACCION.cambiarPalanca, 'Cambiar de palanca: lo hecho no movió la aprobación');
      if (p1 && estaDescubierto(p1)) accion(ACCION.realinear, `Alinear con el problema #1 (${p1.cat})`);
      nota.push(textoNivel(vsRef));
    } else {
      regla = 10; etiqueta = 'Sostener'; prioridadSugerida = 'baja';
      accion(ACCION.sostener, 'Sostener');
      const n = textoNivel(vsRef);
      if (n) nota.push(n);
    }
  }

  // ---- 2) Regla 14: intervención sin medición previa (modificador sobre cualquier rama) ----
  if (regla !== 1 && regla !== 2 && s.intervencionSinMedicionPrevia && t.nRondas > 0 && s.nMediciones > 0) {
    nota.push('parte de lo hecho se hizo antes de la primera medición, así que esa parte no es evaluable');
  }

  // ---- 3) Modificador 15: problema #1 sin cubrir (con pauta o sin ella) ----
  const flags = [];
  if (p1 && estaDescubierto(p1)) {
    flags.push('problema1_descubierto');
    nota.push(textoProblema1(p1));
    if (s.nPautas > 0 && p1.estado !== 'sin_palanca') {
      accion(ACCION.realinear, `La pauta no cubre el problema #1 (${p1.cat}): realinear el mensaje o sumar obra sobre ese tema`);
    } else if (s.nPautas > 0) {
      accion(ACCION.realinear, `La pauta no cubre el problema #1 (${p1.cat}): sin palanca de obra, resolver con comunicación y visita`);
    }
  } else if (p1) {
    nota.push(textoProblema1(p1));
  }
  // Los otros problemas del top-3 que tampoco tienen atención (el #1 ya se dijo arriba).
  const otrosSinAtender = (cobertura || []).slice(1).filter(estaDescubierto);
  if (otrosSinAtender.length) {
    nota.push(`también quedan sin atender: ${otrosSinAtender.map((c) => `${c.cat}${c.estado === 'sin_palanca' ? ' (sin palanca)' : ''}`).join(', ')}`);
  }

  // ---- 4) Principio override: inauguramos todo ----
  if (inaugurables?.length) {
    const principal = inaugurables[0];
    const nombre = principal.nombre_obra || [principal.tipoLabel, principal.barrio].filter(Boolean).join(' en ') || 'obra lista';
    const mas = inaugurables.length > 1 ? ` (y ${inaugurables.length - 1} más)` : '';
    acciones.unshift({ tipo: ACCION.inaugurar, texto: `Inaugurar: ${nombre}${mas}` });
    flags.push('inaugurar');
  }

  const motivo = `${nota.filter(Boolean).join('; ')}.`.replace(/^(.)/, (c) => c.toUpperCase());
  return { regla, etiqueta, prioridadSugerida, acciones, motivo, flags };
}

export { formatPct };
