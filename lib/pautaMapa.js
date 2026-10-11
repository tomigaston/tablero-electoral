// Estrellas de la capa Pauta del mapa. Regla: una estrella = "acá hay pauta PROPIA ACTIVA"
// (de barrio o de circuito), y sale de la MISMA derivación que las tarjetas y la pestaña
// (derivarPautaPorCircuito -> piezas con .vigente = pautaEstaVigente), así que no puede
// contradecirlas. La pauta general (toda_capital) y la inactiva NO van al mapa.
//
// Invariante: en un circuito hay estrella en su zona <=> "Pauta activa en este circuito" > 0.
//  - Estrella de barrio: en el centroide del barrio, SOLO si ese centroide cae en un circuito
//    al que la pieza efectivamente se asigna. Si el centroide cae en otro circuito (ej. Los
//    Robles: centroide en 11G, pieza asignada a 11F) plantarla ahí daría estrella con
//    contador 0; en ese caso el circuito asignado recibe una estrella propia.
//  - Estrella de circuito: circuitos con pieza activa propia sin barrio (circuitos_sin_barrio)
//    o con pieza activa cuyas estrellas de barrio no cayeron en su zona. Va en un punto
//    interior de su polígono (no inventa un centro: es el circuito, no una pauta puntual).
import { claveContenido, normBarrioSinPuntos, normalizarCircuitoKey } from './pautaPorCircuito';

const dentroDeAnillo = (p, anillo) => {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i]; const [xj, yj] = anillo[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
};
const poligonos = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const dentroDeGeometria = (p, g) => poligonos(g).some((poly) => dentroDeAnillo(p, poly[0]) && !poly.slice(1).some((h) => dentroDeAnillo(p, h)));

// Punto interior [lon, lat]: punto medio del tramo horizontal más largo dentro del polígono
// mayor, probando varias alturas (el centro del bbox puede caer fuera en formas cóncavas).
export function puntoInterior(g) {
  const polys = poligonos(g);
  if (!polys.length) return null;
  const bbox = (anillo) => anillo.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const mayor = polys.reduce((m, poly) => { const b = bbox(poly[0]); const a = (b[2] - b[0]) * (b[3] - b[1]); return a > m.a ? { poly, b, a } : m; }, { a: -1 });
  const [minX, minY, maxX, maxY] = mayor.b;
  for (const f of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
    const y = minY + (maxY - minY) * f;
    const xs = [];
    const anillo = mayor.poly[0];
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [xi, yi] = anillo[i]; const [xj, yj] = anillo[j];
      if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    let mejor = null;
    for (let k = 0; k + 1 < xs.length; k += 2) if (!mejor || xs[k + 1] - xs[k] > mejor[1] - mejor[0]) mejor = [xs[k], xs[k + 1]];
    if (mejor) {
      const p = [(mejor[0] + mejor[1]) / 2, y];
      if (dentroDeGeometria(p, g)) return p;
    }
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

export function estrellasPautaPropia({ derivado, barriosGeoData, circuitosGeoJson }) {
  if (!derivado || !barriosGeoData || !circuitosGeoJson) return { barrios: [], circuitos: [] };

  const geomPorCircuito = new Map();
  (circuitosGeoJson.features || []).forEach((f) => geomPorCircuito.set(normalizarCircuitoKey(String(f.properties?.circuito || '').split(' - ')[0]), f));
  const circuitoEnPunto = (lon, lat) => {
    for (const [key, f] of geomPorCircuito) if (dentroDeGeometria([lon, lat], f.geometry)) return key;
    return null;
  };

  const centroides = new Map();
  barriosGeoData.features.forEach((f) => {
    const k = normBarrioSinPuntos(f.properties?.nombre_barrio);
    if (k && !centroides.has(k) && f.properties?.centroid_lat != null) centroides.set(k, f.properties);
  });

  // Barrios con pieza activa propia: piezas únicas y circuitos a los que se asignan.
  const barrios = new Map();
  const agregarBarrio = (nombre, pieza, circuitoKey) => {
    const k = normBarrioSinPuntos(nombre);
    if (!barrios.has(k)) barrios.set(k, { nombre, piezas: new Map(), circuitos: new Set() });
    const b = barrios.get(k);
    b.piezas.set(claveContenido(pieza.pauta), pieza);
    if (circuitoKey) b.circuitos.add(circuitoKey);
  };
  derivado.circuitos.forEach((c) => c.piezas.forEach((p) => { if (p.vigente) p.barrios.forEach((b) => agregarBarrio(b, p, c.key)); }));
  derivado.sinCircuitoResuelto.piezas.forEach((p) => { if (p.vigente) p.barrios.forEach((b) => agregarBarrio(b, p, null)); });

  const estrellasBarrio = [];
  const cubiertos = new Set();
  barrios.forEach((b, k) => {
    const c = centroides.get(k);
    if (!c) return;
    const enCircuito = circuitoEnPunto(c.centroid_lon, c.centroid_lat);
    if (b.circuitos.size > 0 && !b.circuitos.has(enCircuito)) return; // lo cubre una estrella de circuito
    if (enCircuito) cubiertos.add(enCircuito);
    estrellasBarrio.push({ nombreBarrio: b.nombre, lat: c.centroid_lat, lon: c.centroid_lon, piezas: Array.from(b.piezas.values()) });
  });

  const estrellasCircuito = [];
  derivado.circuitos.forEach((c) => {
    const activas = c.piezas.filter((p) => p.vigente);
    if (!activas.length) return;
    const propiaSinBarrio = activas.some((p) => p.sinBarrio);
    if (!propiaSinBarrio && cubiertos.has(c.key)) return;
    const f = geomPorCircuito.get(c.key);
    const punto = f && puntoInterior(f.geometry);
    if (!punto) return;
    estrellasCircuito.push({ circuitoKey: c.key, circuitoNombre: c.nombre, lat: punto[1], lon: punto[0], piezas: activas });
  });

  return { barrios: estrellasBarrio, circuitos: estrellasCircuito };
}
