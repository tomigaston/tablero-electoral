// Cuerpo de la sección Encuestas como HTML estático, compartido por el reporte (registro.js) y el PDF de "Exportar
// ficha" (generarFichaPDF): una sola lógica para que los dos salgan iguales — mismo fechado de bloques, mismo
// tratamiento actual/arrastre, mismos chips de ronda y misma estructura de tarjeta.
//
// La palabra "actual" se usa solo si la ronda más reciente mostrada es la última real del circuito (crearRefRonda).

import { ChipRonda } from '../ChipRonda';
import { fechaRondaActual, bloquesNoMedidos, crearRefRonda } from '../../lib/lecturaRondas';

// Qué rondas entran según las opciones (ronda única / comparativo A vs B / evolución de todas).
//   o = { ronda, comparativo, todas, rondaIdx, a, b }
export function seleccionEncuestas(rondas, o = {}) {
  const iR = Math.min(Math.max(o.rondaIdx ?? rondas.length - 1, 0), rondas.length - 1);
  const hacerComparativo = !!o.comparativo && rondas.length >= 2;
  const hacerRonda = !!o.ronda || !hacerComparativo;
  let rondasComparadas = [];
  if (hacerComparativo) {
    if (o.todas && rondas.length >= 3) rondasComparadas = rondas;
    else {
      let a = Math.min(Math.max(o.a ?? rondas.length - 2, 0), rondas.length - 1);
      let b = Math.min(Math.max(o.b ?? rondas.length - 1, 0), rondas.length - 1);
      if (a === b) { a = Math.max(b - 1, 0); }
      if (a > b) [a, b] = [b, a];
      rondasComparadas = [rondas[a], rondas[b]];
    }
  }
  return { iR, hacerComparativo, hacerRonda, rondasComparadas };
}

// Rondas que efectivamente se muestran, sin repetir.
export const rondasMostradas = (rondas, sel) => [...new Set([...sel.rondasComparadas, ...(sel.hacerRonda && rondas[sel.iR] ? [rondas[sel.iR]] : [])])];

// "La ronda actual (01-10-2026) no relevó: A, B. …" / "La ronda del 11-07-2026 no relevó: …". '' si no falta nada.
export function notaBloquesNoMedidos(mostradas, fechaUltima, formatearFecha) {
  const ref = crearRefRonda(fechaRondaActual(mostradas), fechaUltima);
  const faltan = bloquesNoMedidos(mostradas, ref.fecha);
  if (!faltan.length) return '';
  const quien = ref.esUltima ? `La ronda actual (${formatearFecha(ref.fecha)})` : `La ronda del ${formatearFecha(ref.fecha)}`;
  return `${quien} no relevó: ${faltan.map(b => `${b.nombre} (último dato ${formatearFecha(b.ultimaFecha)})`).join('; ')}. Para esos bloques se muestra el último dato disponible, atenuado y con su fecha.`;
}

// Pie de la sección: dice de qué ronda son los datos; nunca estampa la fecha máxima sobre bloques más viejos.
export function pieDatosEncuestas(rondas, o, formatearFecha) {
  if (!rondas.length) return null;
  const sel = seleccionEncuestas(rondas, o || {});
  const mostradas = rondasMostradas(rondas, sel);
  const ultima = fechaRondaActual(rondas);
  const ref = crearRefRonda(fechaRondaActual(mostradas), ultima);
  const hayViejos = bloquesNoMedidos(mostradas.length > 1 ? mostradas : rondas.filter(r => r.fecha <= ref.fecha), ref.fecha).length > 0;
  const base = ref.esUltima
    ? `Ronda actual: ${formatearFecha(ref.fecha)}.`
    : `Última ronda mostrada: ${formatearFecha(ref.fecha)} (la ronda actual del circuito es la del ${formatearFecha(ultima)}).`;
  return `${base}${hayViejos ? ' Los bloques atenuados son de una ronda anterior (su fecha figura en cada uno).' : ''}`;
}

// Funcionamiento de instituciones y mejoras percibidas: datos que el comparativo no trae.
export function complementosRonda(r, fn) {
  const { htmlBarraCategoriasPDF, htmlMejoraPDF } = fn;
  const p = r.preguntas || {};
  const func = [['Centro Vecinal', 'Funcionamiento Centro Vecinal'], ['CPC', 'Funcionamiento CPC']].filter(([, k]) => p[k]).map(([n, k]) => htmlBarraCategoriasPDF(`Funcionamiento ${n}`, p[k], null)).join('');
  const mej = [['Bacheos', 'Mejoras en bacheos'], ['Alumbrado público', 'Mejoras en alumbrado público'], ['Espacios públicos', 'Mejoras en espacios públicos'], ['Ordenamiento de naranjitas y limpiavidrios', 'Mejoras en ordenamiento naranjitas y limpiavidrios']]
    .filter(([, k]) => p[k]).map(([n, k]) => htmlMejoraPDF(n, p[k], null)).join('');
  if (!func && !mej) return '';
  return `<div class="rp-evitar">${func ? `<div class="rp-h3">Funcionamiento de instituciones locales</div>${func}` : ''}${mej ? `<div class="rp-h3">Mejoras percibidas</div>${mej}` : ''}</div>`;
}

// Estructura sin repetir contenido:
//  · Comparativo (A→B, o todas las rondas): indicadores + gestión + problemas, UNA vez.
//  · Una ronda: foto completa de esa ronda. Si ya está dentro del comparativo, solo se agregan los datos que el
//    comparativo no trae (funcionamiento de instituciones y mejoras percibidas).
// ui = { ResumenEncuesta, ComparativoEncuesta }; fn = { htmlBarraCategoriasPDF, htmlMejoraPDF, formatearFecha }.
// Devuelve un array de fragmentos HTML.
export function htmlEncuestasCuerpo({ rondas, opciones, umbral, metadata, T, ui, fn }) {
  const { ResumenEncuesta, ComparativoEncuesta } = ui;
  const { formatearFecha } = fn;
  const fechaUltima = fechaRondaActual(rondas);
  const { iR, hacerComparativo, hacerRonda, rondasComparadas } = seleccionEncuestas(rondas, opciones);
  const partes = [];
  // El aviso sale de lo que REALMENTE tiene cada ronda (no de una lista fija).
  if (hacerComparativo) {
    const aviso = notaBloquesNoMedidos(rondasComparadas, fechaUltima, formatearFecha);
    if (aviso) partes.push(`<p class="rp-nota">${aviso}</p>`);
    const titulo = rondasComparadas.length > 2
      ? `Encuestas · Evolución ${formatearFecha(rondasComparadas[0].fecha)} → ${formatearFecha(rondasComparadas[rondasComparadas.length - 1].fecha)} (${rondasComparadas.length} rondas)`
      : `Encuestas · Comparativo ${formatearFecha(rondasComparadas[0].fecha)} → ${formatearFecha(rondasComparadas[1].fecha)}`;
    partes.push(`<div class="rp-h3" style="margin-top:0">${titulo}</div>${T.md(<ComparativoEncuesta encuesta={{ rondas: rondasComparadas }} umbral={umbral} metadata={metadata} fechaUltima={fechaUltima} />)}`);
  }
  if (hacerRonda && rondas[iR]) {
    const r = rondas[iR];
    const yaEnComparativo = hacerComparativo && rondasComparadas.includes(r);
    if (yaEnComparativo) {
      const comp = complementosRonda(r, fn);
      if (comp) partes.push(`<div class="rp-h3">Datos complementarios · Ronda ${T.md(<ChipRonda fecha={r.fecha} casos={r.casos} actual={r.fecha === fechaUltima} />)}</div>${comp}`);
    } else {
      const nota = hacerComparativo ? '' : notaBloquesNoMedidos(rondas.filter(x => x.fecha <= r.fecha), fechaUltima, formatearFecha);
      partes.push(`<div class="rp-h3"${hacerComparativo ? '' : ' style="margin-top:0"'}>Encuestas · Ronda ${T.md(<ChipRonda fecha={r.fecha} casos={r.casos} actual={r.fecha === fechaUltima} />)}</div>${nota ? `<p class="rp-nota">${nota}</p>` : ''}${T.md(<ResumenEncuesta preguntas={r.preguntas} contexto={{ rondas, fecha: r.fecha, fechaUltima }} />)}${complementosRonda(r, fn)}`);
    }
  }
  return partes;
}
