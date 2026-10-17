// Filtro y orden de la lista de circuitos. El estado del filtro vive en la página (no en la hoja),
// así se conserva al ir y volver entre Resumen y Circuitos.
import { ORDEN_PRIORIDAD } from './prioridad';
import { esAccionPendiente } from './agregados';

export const FILTRO_VACIO = { q: '', tier: 'todos', tend: 'todas', acciones: 'todas', orden: 'prioridad', claves: null, etiqueta: null };

const SEVERIDAD_TIER = { favorable: 0, intermedio: 1, desfavorable: 2, adverso: 3 };

// "Fuego" primero: empeora + desfavorable/adverso; después por severidad del clima y padrón.
function clavePrioridad(f) {
  const fuego = f.tendencia.estado === 'empeora' && (f.tier === 'desfavorable' || f.tier === 'adverso') ? 0 : 1;
  return [ORDEN_PRIORIDAD[f.prioridad.nivel], fuego, -SEVERIDAD_TIER[f.tier ?? 'favorable'], -(f.padron || 0)];
}
function cmpArr(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }

export const ORDENES = {
  prioridad: (a, b) => cmpArr(clavePrioridad(a), clavePrioridad(b)),
  padron: (a, b) => (b.padron || 0) - (a.padron || 0),
  alfa: (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
};

const tieneDecision = (ficha) => (ficha?.acciones || []).length > 0;

export function aplicarFiltro(filas, filtro, fichas) {
  const q = filtro.q.trim().toLowerCase();
  const set = filtro.claves ? new Set(filtro.claves) : null;
  return filas.filter((f) => {
    if (set && !set.has(f.key)) return false;
    if (filtro.tier !== 'todos' && f.tier !== filtro.tier) return false;
    if (filtro.tend !== 'todas' && f.tendencia.estado !== filtro.tend) return false;
    const ficha = fichas?.[f.key];
    if (filtro.acciones === 'pendientes' && !(ficha?.acciones || []).some(esAccionPendiente)) return false;
    if (filtro.acciones === 'sin_decision' && tieneDecision(ficha)) return false;
    if (filtro.acciones === 'con_decision' && !tieneDecision(ficha)) return false;
    if (q && !(f.key.toLowerCase().startsWith(q) || f.nombre.toLowerCase().includes(q))) return false;
    return true;
  }).sort(ORDENES[filtro.orden] || ORDENES.prioridad);
}

export const hayFiltroActivo = (fl) => fl.q || fl.tier !== 'todos' || fl.tend !== 'todas' || fl.acciones !== 'todas' || fl.claves;
