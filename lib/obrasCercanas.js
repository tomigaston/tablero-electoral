// Utilidad reusable (no atada a ningún componente) para encontrar obras públicas
// cercanas a un punto o a un barrio, usando obras_capital.json. Pensada para la
// futura ficha de barrio, pero independiente de cómo se termine usando ahí.

// Mismo radio por defecto que barriosCercanos en pages/index.js.
export const RADIO_OBRAS_CERCANAS_KM = 1.5;

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
