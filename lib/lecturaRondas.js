import { formatearFecha } from './formatearFecha';

// Lectura de rondas de encuesta — lógica pura (sin React ni HTML), compartida por la solapa
// Encuestas, el reporte y el resumen de ronda actual.
//
// Modelo: el reporte tiene UNA "ronda actual" (la más reciente de las rondas que se muestran).
// Cada número es, de un vistazo, una de dos cosas:
// Regla de la palabra "actual": solo se usa si la ronda más reciente MOSTRADA es la última real del circuito.
// Si la ventana excluye la última (ej. abril vs julio existiendo octubre), esa ronda va con su fecha, sin "actual"
// (ver crearRefRonda).
//   ACTUAL   — viene de la ronda actual.
//   ARRASTRE — la ronda actual no midió esa pregunta; se muestra el último valor disponible,
//              que es más viejo. La UI lo atenúa y lo rotula (ver CardIndicador / BloqueArrastre).


const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const partes = (f) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || ''); return m ? { y: m[1], m: Number(m[2]), d: m[3] } : null; };

// "11-07" (día-mes): referencia corta para "vs 11-07".
export function fechaCorta(fecha) {
  const p = partes(fecha);
  return p ? `${p.d}-${String(p.m).padStart(2, '0')}` : String(fecha ?? '—');
}

// Etiquetas cortas para los dos extremos de una comparación: "jul" / "oct" cuando los meses
// difieren (con el año si cambia: "dic 2025" → "ene 2026"); si caen en el mismo mes, "11-07" / "01-07".
export function etiquetaExtremos(fechaA, fechaB) {
  const a = partes(fechaA), b = partes(fechaB);
  if (!a || !b) return [String(fechaA), String(fechaB)];
  if (a.y === b.y && a.m === b.m) return [fechaCorta(fechaA), fechaCorta(fechaB)];
  const conAnio = a.y !== b.y;
  return [`${MESES[a.m - 1]}${conAnio ? ` ${a.y}` : ''}`, `${MESES[b.m - 1]}${conAnio ? ` ${b.y}` : ''}`];
}

// Etiquetas cortas para N fechas de una misma serie ("abr", "jul", "ago"…). Si dos caen en el mismo mes se usa
// día-mes ("11-07"); si cruzan de año, se agrega el año.
export function etiquetasSerie(fechas) {
  const ps = fechas.map(partes);
  if (ps.some(p => !p)) return fechas.map(String);
  const conAnio = new Set(ps.map(p => p.y)).size > 1;
  const meses = ps.map(p => `${p.y}-${p.m}`);
  const hayChoque = new Set(meses).size !== meses.length;
  return ps.map(p => hayChoque ? `${p.d}-${String(p.m).padStart(2, '0')}${conAnio ? `-${p.y}` : ''}` : `${MESES[p.m - 1]}${conAnio ? ` ${p.y}` : ''}`);
}

export const ordenarRondas = (rondas) => [...(rondas || [])].sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)));

// Fecha de la ronda actual de un conjunto de rondas (la más reciente), o null.
export const fechaRondaActual = (rondas) => {
  const o = ordenarRondas(rondas);
  return o.length ? o[o.length - 1].fecha : null;
};


// Serie [{fecha, casos, valor}] de un indicador, solo con las rondas que lo midieron, en orden cronológico.
export function serieIndicador(rondas, getValor) {
  return ordenarRondas(rondas)
    .map(r => ({ fecha: r.fecha, casos: r.casos ?? null, valor: getValor(r) }))
    .filter(d => d.valor != null);
}

// Variación de un indicador a partir de su serie (ya sin nulls, cronológica).
// Devuelve, además del valor final, la fecha/n del extremo inicial para poder mostrar los dos
// extremos de la comparación: anterior = penúltimo punto CON dato (se saltea el hueco puntual).
// estado: 'sube' | 'baja' | 'estable' (|delta| < umbral) o null con una sola medición.
export function calcularVariacionIndicador(datos, umbral) {
  if (!datos || datos.length === 0) return null;
  const actual = datos[datos.length - 1];
  const base = { actual: actual.valor, fechaActual: actual.fecha, actualCasos: actual.casos, anterior: null, fechaAnterior: null, anteriorCasos: null, delta: null, estado: null, serie: datos };
  if (datos.length < 2) return base;
  const previo = datos[datos.length - 2];
  const delta = actual.valor - previo.valor;
  const estado = Math.abs(delta) < umbral ? 'estable' : (delta > 0 ? 'sube' : 'baja');
  return { ...base, anterior: previo.valor, fechaAnterior: previo.fecha, anteriorCasos: previo.casos, delta, estado };
}

// Igual que calcularVariacionIndicador pero sabiendo cuál es la ronda actual: agrega esArrastre
// (el último dato NO es de la ronda actual).
export function resolverIndicador(rondas, fechaActual, getValor, umbral) {
  const v = calcularVariacionIndicador(serieIndicador(rondas, getValor), umbral);
  if (!v) return null;
  return { ...v, esArrastre: fechaActual != null && v.fechaActual !== fechaActual };
}

// Última ronda (de las dadas) que midió la pregunta, o null. Para el arrastre en vistas de una sola ronda.
export function ultimaRondaConDato(rondas, hastaFecha, tiene) {
  const o = ordenarRondas(rondas).filter(r => hastaFecha == null || r.fecha <= hastaFecha);
  for (let i = o.length - 1; i >= 0; i--) if (tiene(o[i])) return o[i];
  return null;
}

// Bloques de la encuesta con nombre legible: sirven para decir, con datos reales, qué no midió la ronda actual.
export const BLOQUES_ENCUESTA = [
  { id: 'problemas', nombre: 'problemas principales', preguntas: ['Problemas principales'] },
  { id: 'apr_int', nombre: 'aprobación del Intendente', preguntas: ['Aprobación Intendente'] },
  { id: 'apr_gob', nombre: 'aprobación del Gobernador', preguntas: ['Aprobación Gobernador'] },
  { id: 'apr_pres', nombre: 'aprobación del Presidente', preguntas: ['Aprobación Presidente'] },
  { id: 'gest_int', nombre: 'calificación de gestión del Intendente', preguntas: ['Gestión del Intendente'] },
  { id: 'gest_gob', nombre: 'calificación de gestión del Gobernador', preguntas: ['Gestión del Gobernador'] },
  { id: 'gest_pres', nombre: 'calificación de gestión del Presidente', preguntas: ['Gestión del Presidente'] },
  { id: 'ree_llar', nombre: 'reelección de Llaryora', preguntas: ['Reelección Llaryora'] },
  { id: 'ree_milei', nombre: 'reelección de Milei', preguntas: ['Reelección Milei'] },
];

// Qué bloques no midió la ronda actual y de cuándo es su último dato.
// Devuelve [{ id, nombre, ultimaFecha, ultimoCasos }] (ultimaFecha null = nunca se midió en las rondas dadas).
export function bloquesNoMedidos(rondas, fechaActual) {
  const o = ordenarRondas(rondas);
  const actual = o.find(r => r.fecha === fechaActual);
  if (!actual) return [];
  const out = [];
  BLOQUES_ENCUESTA.forEach(b => {
    if (b.preguntas.some(p => actual.preguntas?.[p])) return;
    const previa = ultimaRondaConDato(o, fechaActual, r => b.preguntas.some(p => r.preguntas?.[p]) && r.fecha !== fechaActual);
    if (!previa) return; // nunca se midió en estas rondas: no es una "ausencia" que haya que explicar
    out.push({ id: b.id, nombre: b.nombre, ultimaFecha: previa.fecha, ultimoCasos: previa.casos ?? null });
  });
  return out;
}

// Estilo (objeto camelCase) → atributo style de un HTML-string.
export const cssStr = (o) => Object.entries(o).map(([k, v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${v}`).join(';');

// Barras apiladas de calificación (Positiva/Regular/Negativa/Ns-Nc): qué segmentos llevan el % adentro y
// cuáles lo llevan afuera, con conector. Regla: NUNCA se cae la etiqueta de un segmento no nulo.
//   · v >= UMBRAL_ETIQUETA_DENTRO (% del ancho de la barra) → etiqueta adentro.
//   · menos → etiqueta debajo de la barra, centrada en su segmento; si dos etiquetas se pisarían
//     (centros a menos de SEPARACION_MIN_ETIQUETAS puntos de ancho) la segunda baja a otra fila.
export const UMBRAL_ETIQUETA_DENTRO = 9;
export const SEPARACION_MIN_ETIQUETAS = 8;
export function layoutSegmentos(data, categorias) {
  let acum = 0;
  const segs = [];
  categorias.forEach(cat => {
    const v = data?.[cat];
    if (!(v > 0)) return;
    segs.push({ cat, v, inicio: acum, centro: acum + v / 2, dentro: v >= UMBRAL_ETIQUETA_DENTRO, fila: 0 });
    acum += v;
  });
  const ultimoPorFila = [];
  segs.filter(s => !s.dentro).forEach(s => {
    let fila = 0;
    while (ultimoPorFila[fila] != null && s.centro - ultimoPorFila[fila] < SEPARACION_MIN_ETIQUETAS) fila++;
    ultimoPorFila[fila] = s.centro;
    s.fila = fila;
  });
  return { segs, filas: ultimoPorFila.length };
}

// --- Principales problemas: UNA vista y UNA pareja de comparación ---
export const MAX_PROBLEMAS = 6;
export function calcularBloqueProblemas(rondas, umbral, fechaActual) {
  const con = ordenarRondas(rondas).filter(r => r.preguntas?.['Problemas principales']);
  if (con.length === 0) return null;
  const ultima = con[con.length - 1];
  const previa = con.length > 1 ? con[con.length - 2] : null;
  const pUlt = ultima.preguntas['Problemas principales'];
  const pPrev = previa?.preguntas['Problemas principales'] || null;
  const filas = Object.keys(pUlt).filter(cat => (pUlt[cat] > 0) || (pPrev?.[cat] > 0))
    .map(cat => {
      const valor = pUlt[cat] ?? 0, anterior = pPrev ? (pPrev[cat] ?? null) : null;
      const delta = anterior != null ? valor - anterior : null;
      const estado = delta == null ? null : Math.abs(delta) < umbral ? 'estable' : (delta > 0 ? 'sube' : 'baja');
      return { cat, valor, anterior, delta, estado };
    })
    .sort((x, y) => y.valor - x.valor);
  return { ultima, previa, filas: filas.slice(0, MAX_PROBLEMAS), hayMas: filas.length > MAX_PROBLEMAS, esArrastre: fechaActual != null && ultima.fecha !== fechaActual };
}


// Ronda de referencia de una vista: { fecha, esUltima, rotulo, sinDato }.
//   fecha      — la ronda más reciente MOSTRADA en la vista.
//   esUltima   — esa ronda es la última real del circuito (única condición para decir "actual").
//   rotulo     — "la ronda actual" o "la ronda del 11-07-2026".
//   sinDato    — "Sin dato en la ronda actual" / "Sin dato en la ronda del 11-07-2026".
export function crearRefRonda(fecha, fechaUltima) {
  const esUltima = fecha != null && fecha === fechaUltima;
  const rotulo = esUltima ? 'la ronda actual' : `la ronda del ${formatearFecha(fecha)}`;
  const rotuloFecha = esUltima ? `la ronda actual (${formatearFecha(fecha)})` : rotulo;
  return { fecha, esUltima, rotulo, rotuloFecha, sinDato: `Sin dato en ${rotulo}` };
}
