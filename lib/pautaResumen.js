// Conteos de resumen de pauta (tarjetas del panel derecho y de la cabecera de "Pauta por
// circuito"). Se calculan SOBRE la derivación de lib/pautaPorCircuito.js (la misma que
// alimenta la pestaña), así tarjetas y pestaña no pueden discrepar: "activa" es
// pieza.vigente (= pautaEstaVigente) y cada pieza ya viene deduplicada por contenido dentro
// de su circuito/bucket.
//
//  - Pauta activa: piezas ÚNICAS activas. Una pieza multi-barrio puede caer en circuitos
//    distintos (cada barrio va a su circuito principal), así que acá se vuelve a deduplicar
//    por claveContenido a nivel global. generales = piezas de toda_capital; específicas =
//    el resto (circuito + barrio, incluidas las que no resuelven a circuito).
//  - Circuitos cubiertos: circuitos con >=1 pieza activa PROPIA (de circuito o de alguno de
//    sus barrios, según la asignación de la pestaña). toda_capital queda afuera.
//  - Barrios cubiertos: barrios distintos con >=1 pieza activa de barrio. toda_capital afuera.
//  - Total de barrios: catálogo del cruce (barrio_to_circuitos), no hardcodeado.
import { claveContenido, normBarrioSinPuntos } from './pautaPorCircuito';

const unicasActivas = (piezas) => {
  const vistas = new Map();
  piezas.forEach((p) => { if (p.vigente && !vistas.has(claveContenido(p.pauta))) vistas.set(claveContenido(p.pauta), p); });
  return vistas;
};

export function resumirPauta(derivado, cruceData) {
  if (!derivado) return null;
  const universoBarrios = new Set(Object.keys(cruceData?.barrio_to_circuitos || {}).map(normBarrioSinPuntos));

  const generales = unicasActivas(derivado.alcanceCapital);
  const especificas = unicasActivas([...derivado.circuitos.flatMap((c) => c.piezas), ...derivado.sinCircuitoResuelto.piezas]);

  const activasPorCircuito = new Map();
  derivado.circuitos.forEach((c) => activasPorCircuito.set(c.key, c.piezas.filter((p) => p.vigente).length));

  const barriosActivos = new Set();
  const barriosSinCircuito = new Set();
  derivado.circuitos.forEach((c) => c.piezas.forEach((p) => { if (p.vigente) p.barrios.forEach((b) => barriosActivos.add(normBarrioSinPuntos(b))); }));
  derivado.sinCircuitoResuelto.piezas.forEach((p) => {
    if (!p.vigente) return;
    p.barrios.forEach((b) => { const n = normBarrioSinPuntos(b); barriosActivos.add(n); barriosSinCircuito.add(n); });
  });

  return {
    activa: { total: generales.size + especificas.size, generales: generales.size, especificas: especificas.size },
    circuitos: { cubiertos: Array.from(activasPorCircuito.values()).filter((n) => n > 0).length, total: derivado.circuitos.length },
    barrios: { cubiertos: barriosActivos.size, total: universoBarrios.size, sinCircuito: barriosSinCircuito.size },
    activasPorCircuito,
  };
}
