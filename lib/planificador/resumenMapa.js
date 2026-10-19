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
