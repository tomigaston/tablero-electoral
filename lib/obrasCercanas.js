// Utilidad reusable (no atada a ningún componente) para encontrar obras públicas
// cercanas a un punto, un barrio o un circuito, usando obras_capital.json. Pensada
// para la futura ficha de barrio, pero independiente de cómo se termine usando ahí.
import centroid from '@turf/centroid';

// Mismo radio por defecto que barriosCercanos en pages/index.js.
export const RADIO_OBRAS_CERCANAS_KM = 1.5;

// Normaliza nombres de barrio para cruzar obra.barrio contra circuito_barrios_cruce.json
// / barrios_geo.json — mismo criterio que normalizarNombreBarrio en pages/index.js y
// components/MapaCircuitos.js, duplicado acá a propósito (mismo motivo que la haversine
// de abajo: este módulo no depende de ningún archivo de páginas/componentes).
function normalizarNombreBarrio(s) {
  return (s || '')
    .toUpperCase()
    .replace(/[ºª]/g, 'O')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Distancia entre dos puntos lat/lon (fórmula haversine) — mismo criterio que
// distanciaHaversineKm en pages/index.js, duplicado acá a propósito para que este
// módulo no dependa de un archivo de páginas.
function distanciaHaversineKm(lat1, lon1, lat2, lon2) {
  const R_TIERRA_KM = 6371;
  const aRad = (deg) => (deg * Math.PI) / 180;
  const dLat = aRad(lat2 - lat1);
  const dLon = aRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(aRad(lat1)) * Math.cos(aRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R_TIERRA_KM * c;
}

// Núcleo geométrico: obras con lat/lon propia dentro de radioKm del punto dado,
// ordenadas de más cercana a más lejana. Como filtra por coordenadas reales, incluye
// automáticamente a las de fuente_barrio "cercano_aproximado" sin importar qué barrio
// les haya quedado asignado — y excluye a las "manual"/"descartado" (sin lat/lon),
// que no se pueden ubicar geométricamente.
export function obrasCercanasAPunto(lat, lon, obrasCapitalData, radioKm = RADIO_OBRAS_CERCANAS_KM) {
  if (lat == null || lon == null) return [];
  const obras = Array.isArray(obrasCapitalData) ? obrasCapitalData : (obrasCapitalData?.obras || []);
  return obras
    .filter(o => o.lat != null && o.lon != null)
    .map(o => ({ ...o, distanciaKm: distanciaHaversineKm(lat, lon, o.lat, o.lon) }))
    .filter(o => o.distanciaKm <= radioKm)
    .sort((a, b) => a.distanciaKm - b.distanciaKm);
}

// Wrapper de conveniencia: resuelve el centroide del barrio contra barrios_geo.json
// y delega en obrasCercanasAPunto. Punto de entrada pensado para la ficha de barrio.
export function obrasCercanasABarrio(nombreBarrio, barriosGeoData, obrasCapitalData, radioKm = RADIO_OBRAS_CERCANAS_KM) {
  const feature = (barriosGeoData?.features || []).find(f => f.properties?.nombre_barrio === nombreBarrio);
  const lat = feature?.properties?.centroid_lat;
  const lon = feature?.properties?.centroid_lon;
  if (lat == null || lon == null) return [];
  return obrasCercanasAPunto(lat, lon, obrasCapitalData, radioKm);
}

// Wrapper de conveniencia: calcula el centroide del polígono del circuito (con
// @turf/centroid, no de sus barrios) y delega en obrasCercanasAPunto. Recibe el
// circuito ya convertido a GeoJSON (topojson.feature(...) sobre circuitos_cordoba.json
// — mismo objeto que ya arma MapaCircuitos.js internamente) y el Mapkey (formato
// "properties.circuito", ej. "004C") para encontrar la feature correspondiente.
export function obrasCercanasACircuito(mapkey, circuitosGeoJsonData, obrasCapitalData, radioKm = RADIO_OBRAS_CERCANAS_KM) {
  const feature = (circuitosGeoJsonData?.features || []).find(f => f.properties?.circuito === mapkey);
  if (!feature?.geometry) return [];
  const [lon, lat] = centroid(feature).geometry.coordinates;
  return obrasCercanasAPunto(lat, lon, obrasCapitalData, radioKm);
}

// Índice barrio (normalizado) -> lista de circuitos, precalculado una sola vez a
// partir de circuito_barrios_cruce.json, para resolver el circuito derivado de cada
// obra en O(1) por obra en vez de recorrer todo el cruce por cada una.
export function construirIndiceBarrioCircuito(cruceData) {
  const indice = {};
  Object.entries(cruceData?.barrio_to_circuitos || {}).forEach(([barrio, lista]) => {
    const key = normalizarNombreBarrio(barrio);
    if (key) indice[key] = lista;
  });
  return indice;
}

// Circuito "principal" derivado del barrio de una obra (orden_importancia: 1 en
// circuito_barrios_cruce.json) — no calcula nada geométrico aparte, así las obras sin
// lat/lon propia (las "manual") también consiguen circuito. Devuelve el Mapkey (4
// caracteres, formato "properties.circuito"), o null si el barrio no matchea o no
// tiene ningún circuito con orden_importancia === 1 (no se fuerza ningún match).
export function circuitoMapkeyDeObra(obra, indiceBarrioCircuito) {
  const lista = indiceBarrioCircuito[normalizarNombreBarrio(obra?.barrio)];
  const principal = lista?.find(c => c.orden_importancia === 1);
  if (!principal) return null;
  return principal.circuito.split(' - ')[0].trim();
}
