// Soporte del Resumen con mapa: subconjuntos para el cross-filter y distribución de la prioridad por padrón.
// Funciones puras sobre las mismas filas del planificador; no tocan lo existente.
import { calcularAgregados } from './agregados';

export const NIVELES_PRIORIDAD = ['alta', 'media', 'baja'];

// Filas y pauta derivada restringidas a un conjunto de circuitos (claves = null -> todos).
export function subconjuntoResumen(filas, pautaDerivada, claves) {
  if (!claves) return { filas, pautaDerivada };
  const set = new Set(claves);
  return {
    filas: filas.filter((f) => set.has(f.key)),
    pautaDerivada: pautaDerivada ? { ...pautaDerivada, circuitos: (pautaDerivada.circuitos || []).filter((c) => set.has(c.key)) } : pautaDerivada,
  };
}

// Mismos agregados de las tarjetas, calculados solo sobre los circuitos del filtro.
export function agregadosDeSubconjunto(filas, pautaDerivada, claves) {
  const s = subconjuntoResumen(filas, pautaDerivada, claves);
  return calcularAgregados(s.filas, s.pautaDerivada);
}

// "¿Cuánta ciudad está en rojo / amarillo / verde?": circuitos y % del padrón total (Padron_G23).
// Con `claves` cuenta solo esos circuitos, pero el % sigue siendo sobre el padrón de toda la ciudad.
// `claves` de cada nivel son todos los circuitos del nivel (para filtrar desde la leyenda).
export function distribucionPrioridad(filas, claves = null) {
  const totalPadron = filas.reduce((a, f) => a + (f.padron || 0), 0);
  const set = claves ? new Set(claves) : null;
  return NIVELES_PRIORIDAD.map((nivel) => {
    const delNivel = filas.filter((f) => f.prioridad.nivel === nivel);
    const fs = set ? delNivel.filter((f) => set.has(f.key)) : delNivel;
    const padron = fs.reduce((a, f) => a + (f.padron || 0), 0);
    return { nivel, n: fs.length, padron, pctPadron: totalPadron ? (padron / totalPadron) * 100 : 0, claves: delNivel.map((f) => f.key) };
  });
}

export const fmtPctPadron = (v) => `${v.toFixed(1).replace('.', ',')}%`;

// ---- Filtros combinables del Resumen ----
// Un filtro es una lista de items { origen, id, etiqueta, claves }. Reglas:
//  - items de un mismo origen (la misma tarjeta / el mismo KPI) se SUMAN (o): Desfavorable o Adverso;
//  - items de orígenes distintos se CRUZAN (y): Desfavorable + Sin medir.
// `exceptoOrigen`: ignora los items de ese origen (cada tarjeta se calcula con los filtros de las OTRAS,
// así sigue mostrando todas sus barras para poder sumar o cambiar la selección).
// Devuelve las claves de circuito que cumplen, o null si no hay filtro.
export function combinarFiltros(filtros, exceptoOrigen = null) {
  const grupos = new Map();
  (filtros || []).forEach((f) => {
    if (f.origen === exceptoOrigen) return;
    if (!grupos.has(f.origen)) grupos.set(f.origen, new Set());
    f.claves.forEach((k) => grupos.get(f.origen).add(k));
  });
  if (!grupos.size) return null;
  let res = null;
  grupos.forEach((set) => { res = res ? new Set([...res].filter((k) => set.has(k))) : new Set(set); });
  return [...res];
}

// "Clima Desfavorable o Clima Adverso + Sin medir"
export function etiquetaFiltros(filtros) {
  const grupos = new Map();
  (filtros || []).forEach((f) => grupos.set(f.origen, [...(grupos.get(f.origen) || []), f.etiqueta]));
  return [...grupos.values()].map((l) => l.join(' o ')).join(' + ');
}

// Clic simple: queda solo ese item (o se limpia si ya era el único). Ctrl/Cmd/Shift + clic (`combinar`): suma o quita ese item.
export function alternarFiltro(filtros, item, combinar) {
  const mismo = (f) => f.origen === item.origen && f.id === item.id;
  const existe = filtros.some(mismo);
  if (combinar) return existe ? filtros.filter((f) => !mismo(f)) : [...filtros, item];
  return existe && filtros.length === 1 ? [] : [item];
}

// Padrón de un conjunto de circuitos (claves = null -> todos).
export function padronDe(filas, claves = null) {
  const set = claves ? new Set(claves) : null;
  return filas.reduce((a, f) => (!set || set.has(f.key) ? a + (f.padron || 0) : a), 0);
}
