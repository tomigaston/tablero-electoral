// Seguimiento de recomendaciones del equipo (hoja Resumen). Todo se calcula de las fichas guardadas
// ({ [circuito]: { acciones: [...] } }, la misma base KV donde se cargan en la ficha) y de las filas del planificador.
// Los estados guardados son pendiente / en_curso / hecha; en pantalla: Pendiente / En ejecución / Cumplido.
import { ORDEN_PRIORIDAD } from './prioridad';
import { esAccionPendiente } from './agregados';
import { TIPOS_ACCION } from './acciones';

export const ESTADOS_REC = ['pendiente', 'en_curso', 'hecha'];
// Pendiente ámbar · En ejecución azul · Cumplido verde.
export const COLOR_ESTADO_REC = { pendiente: '#F59E0B', en_curso: '#1976D2', hecha: '#2E7D32' };

const DIA_MS = 86400000;

// Una recomendación por acción guardada, con su circuito (fila) para poder abrir la ficha y ordenar por semáforo.
export function listarRecomendaciones(fichas, filas) {
  const porClave = new Map(filas.map((f) => [String(f.key).toUpperCase(), f]));
  const out = [];
  Object.entries(fichas || {}).forEach(([clave, ficha]) => {
    const fila = porClave.get(String(clave).toUpperCase());
    if (!fila) return;
    (ficha?.acciones || []).forEach((a) => out.push({ ...a, circuito: fila.key, fila }));
  });
  return out;
}

// Circuitos (claves) que tienen al menos una recomendación que cumple `criterio`.
export const circuitosDe = (recs, criterio = () => true) => [...new Set(recs.filter(criterio).map((r) => r.circuito))];

/**
 * KPIs, distribución por estado, ranking por tipo, ritmo y actividad, sobre las recomendaciones recibidas.
 * @param {object[]} recs recomendaciones (ya filtradas por lo que se esté mirando)
 * @param {number} nCircuitosAlcance cantidad de circuitos del alcance (para "sin ninguna")
 */
export function resumenRecomendaciones(recs, nCircuitosAlcance, ahora = Date.now()) {
  const total = recs.length;
  const porEstado = { pendiente: 0, en_curso: 0, hecha: 0 };
  recs.forEach((r) => { if (porEstado[r.estado] != null) porEstado[r.estado] += 1; });
  const conRec = new Set(recs.map((r) => r.circuito)).size;

  const porTipo = Object.keys(TIPOS_ACCION).map((tipo) => ({ tipo, label: TIPOS_ACCION[tipo], n: recs.filter((r) => r.tipo === tipo).length }))
    .sort((a, b) => b.n - a.n);

  const cumplidasEn = (dias) => recs.filter((r) => r.estado === 'hecha' && r.hecha_en && ahora - new Date(r.hecha_en).getTime() <= dias * DIA_MS).length;

  const usuarios = new Map();
  const usuario = (u) => { if (!usuarios.has(u)) usuarios.set(u, { usuario: u, recomendo: 0, cumplio: 0 }); return usuarios.get(u); };
  recs.forEach((r) => {
    if (r.creada_por) usuario(r.creada_por).recomendo += 1;
    if (r.estado === 'hecha' && (r.hecha_por || r.estado_por)) usuario(r.hecha_por || r.estado_por).cumplio += 1;
  });

  return {
    total, porEstado,
    pctCumplidas: total ? (porEstado.hecha / total) * 100 : 0,
    conRecomendacion: conRec,
    sinRecomendacion: Math.max(0, nCircuitosAlcance - conRec),
    porTipo,
    cumplidas7: cumplidasEn(7), cumplidas30: cumplidasEn(30),
    usuarios: [...usuarios.values()].sort((a, b) => (b.recomendo + b.cumplio) - (a.recomendo + a.cumplio)),
  };
}

// Visor de todo lo recomendado: primero lo que falta ejecutar (pendiente y en ejecución), con los circuitos en peor semáforo
// arriba (rojo, azul, amarillo, verde) y las más antiguas primero; al final lo cumplido, lo más reciente primero.
export function ordenarRecomendaciones(recs) {
  const peso = (r) => ORDEN_PRIORIDAD[r.fila.prioridad.nivel] ?? 9;
  const hecha = (r) => (r.estado === 'hecha' ? 1 : 0);
  return [...recs].sort((a, b) => hecha(a) - hecha(b)
    || (hecha(a) ? String(b.hecha_en || '').localeCompare(String(a.hecha_en || '')) : peso(a) - peso(b) || String(a.creada_en || '').localeCompare(String(b.creada_en || ''))));
}

// "Qué falta ejecutar": pendientes y en ejecución (sin "Sin acción por ahora"), primero los circuitos con peor semáforo
// (rojo, azul, amarillo, verde) y, dentro de cada uno, las más antiguas.
export function pendientesPorHacer(recs) {
  return recs.filter(esAccionPendiente).sort((a, b) =>
    (ORDEN_PRIORIDAD[a.fila.prioridad.nivel] ?? 9) - (ORDEN_PRIORIDAD[b.fila.prioridad.nivel] ?? 9)
    || String(a.creada_en || '').localeCompare(String(b.creada_en || '')));
}
