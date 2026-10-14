// Reglas del bloque "Encuestas": UNA sola fuente de verdad para pantalla, "Generar reporte" y "Exportar ficha".
// Lógica pura (sin React ni HTML): clasifica cada indicador en una familia según el TIPO de dato y arma el
// modelo que dibuja components/EncuestasBlock.js.
//
//   Familia A · escalar      un solo % por ronda (aprobación, reelección)       → fila-timeline
//   Familia B · composición  partes que suman ~100 (gestión, mejoras)           → barras apiladas, una por ronda
//   Familia C · lista        ítems independientes que NO suman 100 (problemas)  → ranking de barras grises
//
// Reglas duras: máximo 3 rondas (las más recientes, de la más vieja a la más nueva); S/D ≠ 0 (ausencia de
// medición nunca se convierte en 0); nada de atenuado ni badges; 1 decimal en todo; deltas siempre con signo.
//
// Para sumar un indicador nuevo alcanza con una entrada en GRUPOS (no hace falta tocar el componente).

import { formatearFecha } from './formatearFecha';

/**
 * @typedef {{ fecha: string, casos?: number|null, preguntas?: Object<string, Object<string, number>> }} Ronda
 * @typedef {{ cat: string, etiqueta: string, color: string }} SegmentoDef
 * @typedef {{ id: string, titulo: string, pregunta: string, familia: 'A', categoria: string }} IndicadorA
 * @typedef {{ id: string, titulo: string, pregunta: string, familia: 'B', segmentos: SegmentoDef[] }} IndicadorB
 * @typedef {{ id: string, titulo: string, pregunta: string, familia: 'C', top?: number, agruparResto?: string }} IndicadorC
 * @typedef {IndicadorA|IndicadorB|IndicadorC} Indicador
 */

export const MAX_RONDAS = 3;
export const TOP_RANKING = 6;
// Segmentos de una barra B con menos de este % del total llevan su etiqueta por fuera (línea guía), no apretada adentro.
export const UMBRAL_ETIQUETA_EXTERNA = 7;

// ---------- Números ----------
export const redondear1 = (v) => Math.round((v + Number.EPSILON) * 10) / 10;
export const fmtPct = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${redondear1(v).toFixed(1)}%` : null);
// Delta en pp calculado sobre los valores YA redondeados que se ven en pantalla (así 40.0 → 55.2 dice +15.2 siempre).
export const deltaPP = (antes, despues) => (esNum(antes) && esNum(despues) ? redondear1(redondear1(despues) - redondear1(antes)) : null);
// Signo siempre explícito; menos tipográfico (−), no guion.
export const fmtDelta = (d) => (d == null ? null : d > 0 ? `+${d.toFixed(1)}` : d < 0 ? `−${Math.abs(d).toFixed(1)}` : '0.0');
export const flechaDelta = (d) => (d == null ? '' : d > 0 ? '▲' : d < 0 ? '▼' : '=');
const esNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Encabezado de ronda: solo la fecha ("01-10-2026"). El tamaño de muestra (n) no se muestra en el bloque. */
export const etiquetaRonda = (r) => formatearFecha(r.fecha);

// ---------- Selección de rondas ----------
/**
 * Las rondas que entran al bloque: como mucho MAX_RONDAS, las más recientes, de la más vieja a la más nueva.
 * `fechas` (opcional) restringe a las rondas elegidas por el usuario; si ninguna coincide se usan todas.
 * @param {Ronda[]} rondas
 * @param {string[]|null} [fechas]
 * @returns {Ronda[]}
 */
export function seleccionarRondas(rondas, fechas = null) {
  const orden = [...(rondas || [])].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  let sel = Array.isArray(fechas) && fechas.length ? orden.filter(r => fechas.includes(r.fecha)) : orden;
  if (!sel.length) sel = orden;
  return sel.slice(-MAX_RONDAS);
}

// ---------- Colores ----------
// Valencia (buena/regular/mala; también a favor/intermedio/en contra y mejoró/algo/no): luminancias distintas para que
// se distinga en escala de grises, y siempre con orden fijo + etiqueta.
export const COLOR_VALENCIA = { Positiva: '#66BB6A', Regular: '#FBC02D', Negativa: '#C62828', 'Ns/Nc': '#E0E0E0' };
export const COLOR_BARRA_C = ['#B0BEC5', '#78909C', '#37474F']; // ronda más vieja → más nueva
export const COLOR_BARRA_C_UNICA = '#607D8B';
export const COLOR_EXTRA = '#BDBDBD'; // categoría inesperada en el dato: se dibuja igual, no se pierde

/** Texto claro u oscuro según la luminosidad del relleno, para que el % dentro de la barra siempre se lea. */
export function colorTextoSobre(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? '#1a1a1a' : '#ffffff';
}

const valencia = (extra = []) => [
  { cat: 'Positiva', etiqueta: 'Positiva', color: COLOR_VALENCIA.Positiva },
  { cat: 'Regular', etiqueta: 'Regular', color: COLOR_VALENCIA.Regular },
  { cat: 'Negativa', etiqueta: 'Negativa', color: COLOR_VALENCIA.Negativa },
  { cat: 'Ns/Nc', etiqueta: 'Ns/Nc', color: COLOR_VALENCIA['Ns/Nc'], ...extra },
];

const A = (id, titulo, pregunta, categoria) => ({ id, titulo, pregunta, familia: 'A', categoria });
const B = (id, titulo, pregunta, segmentos) => ({ id, titulo, pregunta, familia: 'B', segmentos });
const C = (id, titulo, pregunta, extra = {}) => ({ id, titulo, pregunta, familia: 'C', ...extra });

// Misma paleta que gestión (mismas luminancias, imprime bien en B&N): a favor / mejoró = verde, intermedio = ámbar, en contra = rojo.
const PV = COLOR_VALENCIA;
const SINO_NS = [{ cat: 'Si', etiqueta: 'Sí', color: PV.Positiva }, { cat: 'No', etiqueta: 'No', color: PV.Negativa }, { cat: 'No se', etiqueta: 'No sé', color: PV['Ns/Nc'] }];
const PRIVATIZAR = [{ cat: 'Se debe privatizar totalmente', etiqueta: 'Totalmente', color: PV.Positiva }, { cat: 'Se debe privatizar parcialmente', etiqueta: 'Parcialmente', color: PV.Regular }, { cat: 'No se debe privatizar', etiqueta: 'No privatizar', color: PV.Negativa }];
const MEJORA = [{ cat: 'Si, mucho', etiqueta: 'Sí, mucho', color: PV.Positiva }, { cat: 'Si, algo', etiqueta: 'Sí, algo', color: PV.Regular }, { cat: 'No', etiqueta: 'No', color: PV.Negativa }];

/** Orden de lectura del bloque. Una entrada por indicador. */
export const GRUPOS = [
  { id: 'aprobacion', titulo: 'Aprobación de gestión', indicadores: [
    A('apr_int', 'Aprobación del Intendente', 'Aprobación Intendente', 'Apruebo'),
    A('apr_gob', 'Aprobación del Gobernador', 'Aprobación Gobernador', 'Apruebo'),
    A('apr_pre', 'Aprobación del Presidente', 'Aprobación Presidente', 'Apruebo'),
  ] },
  { id: 'reeleccion', titulo: 'Reelección', indicadores: [
    A('ree_lla', 'Reelección Llaryora (Gobernador)', 'Reelección Llaryora', 'Si'),
    A('ree_mil', 'Reelección Milei (Presidente)', 'Reelección Milei', 'Si'),
  ] },
  { id: 'alerta', titulo: 'Cordobeses en Alerta', indicadores: [
    A('alerta_existe', 'Barrio con servicio de Cordobeses en Alerta', 'Cordobeses en Alerta (existencia)', 'Si'),
    B('alerta_calif', 'Calificación del servicio', 'Calificación Cordobeses en Alerta', valencia()),
  ] },
  { id: 'gestion', titulo: 'Calificación de gestión', indicadores: [
    B('ges_int', 'Gestión del Intendente', 'Gestión del Intendente', valencia()),
    B('ges_gob', 'Gestión del Gobernador', 'Gestión del Gobernador', valencia()),
    B('ges_pre', 'Gestión del Presidente', 'Gestión del Presidente', valencia()),
  ] },
  { id: 'instituciones', titulo: 'Instituciones locales', indicadores: [
    B('func_cv', 'Funcionamiento del Centro Vecinal', 'Funcionamiento Centro Vecinal', valencia()),
    B('func_cpc', 'Funcionamiento del CPC', 'Funcionamiento CPC', valencia()),
  ] },
  { id: 'problemas', titulo: 'Principales problemas', indicadores: [
    C('problemas', 'Problemas más mencionados (respuesta múltiple: no suman 100%)', 'Problemas principales', { top: TOP_RANKING }),
  ] },
  { id: 'mejoras', titulo: 'Mejoras percibidas', indicadores: [
    B('mej_bac', 'Bacheos', 'Mejoras en bacheos', MEJORA),
    B('mej_alu', 'Alumbrado público', 'Mejoras en alumbrado público', MEJORA),
    B('mej_esp', 'Espacios públicos', 'Mejoras en espacios públicos', MEJORA),
    B('mej_nar', 'Ordenamiento de naranjitas y limpiavidrios', 'Mejoras en ordenamiento naranjitas y limpiavidrios', MEJORA),
  ] },
  { id: 'privatizaciones', titulo: 'Privatizaciones', indicadores: [
    B('pri_epec', 'EPEC: ¿privatizar?', 'Privatización EPEC (opinión)', PRIVATIZAR),
    B('pri_epec_t', 'EPEC: ¿bajaría la tarifa?', 'Privatización EPEC (baja tarifa)', SINO_NS),
    B('pri_bancor', 'Bancor: ¿privatizar?', 'Privatización BANCOR (opinión)', PRIVATIZAR),
    B('pri_bancor_p', 'Bancor: ¿mejorarían las prestaciones?', 'Privatización BANCOR (mejoran prestaciones)', SINO_NS),
    B('pri_cds', 'Caminos de las Sierras: ¿privatizar?', 'Privatización Caminos de las Sierras (opinión)', PRIVATIZAR),
    B('pri_cds_p', 'Caminos de las Sierras: ¿bajaría el peaje?', 'Privatización Caminos de las Sierras (baja peaje)', SINO_NS),
    C('pri_atrib', '¿A quién se atribuye la propuesta de privatización?', 'Atribución propuesta de privatización', { top: TOP_RANKING }),
  ] },
  { id: 'otros', titulo: 'Otros temas', indicadores: [
    // Cuatro respuestas que no forman una escala ordenada → lista, no composición.
    C('modelo', '¿Existe un “modelo cordobés” de gestión?', 'Existencia Modelo Cordobés de gestión', { top: TOP_RANKING }),
    C('provincia', 'Mejor provincia de Argentina', 'Mejor provincia de Argentina', { top: 7, agruparResto: 'Otras' }),
  ] },
];

// ---------- Presencia de dato (S/D ≠ 0) ----------
const dato = (r, pregunta) => {
  const p = r?.preguntas?.[pregunta];
  return p && typeof p === 'object' && Object.values(p).some(esNum) ? p : null;
};
const esOtro = (cat) => /^otr[oa]s?$/i.test(String(cat).trim());

// ---------- Familia A ----------
function modeloA(ind, rondas) {
  const columnas = rondas.map(r => {
    const p = dato(r, ind.pregunta);
    const v = p && esNum(p[ind.categoria]) ? p[ind.categoria] : null;
    return { fecha: r.fecha, etiqueta: etiquetaRonda(r), valor: v, texto: fmtPct(v) }; // null = S/D
  });
  if (columnas.every(c => c.valor == null)) return null;
  const flechas = columnas.slice(1).map((c, i) => { const d = deltaPP(columnas[i].valor, c.valor); return { delta: d, texto: fmtDelta(d), signo: flechaDelta(d) }; });
  return { familia: 'A', id: ind.id, titulo: ind.titulo, columnas, flechas };
}

// ---------- Familia B ----------
function modeloB(ind, rondas) {
  const conDato = rondas.map(r => ({ r, p: dato(r, ind.pregunta) })).filter(x => x.p);
  if (!conDato.length) return null;
  const conocidas = new Set(ind.segmentos.map(s => s.cat));
  // Categorías inesperadas presentes en el dato: se agregan al final para no perder información en silencio.
  const extras = [...new Set(conDato.flatMap(x => Object.keys(x.p)).filter(c => !conocidas.has(c)))]
    .map(cat => ({ cat, etiqueta: cat, color: COLOR_EXTRA }));
  const segmentos = [...ind.segmentos, ...extras];
  const barras = conDato.map(({ r, p }) => {
    const partes = segmentos.filter(s => esNum(p[s.cat])).map(s => ({ cat: s.cat, valor: p[s.cat], texto: fmtPct(p[s.cat]), color: s.color }));
    // Ancho = valor / suma de la fila (la barra siempre llena el 100%); la etiqueta conserva el número reportado.
    const suma = partes.reduce((a, x) => a + x.valor, 0);
    let acum = 0;
    partes.forEach(x => { x.share = suma > 0 ? (x.valor / suma) * 100 : 0; x.centro = acum + x.share / 2; acum += x.share; x.externa = x.valor > 0 && x.share < UMBRAL_ETIQUETA_EXTERNA; });
    return { fecha: r.fecha, etiqueta: etiquetaRonda(r), partes, suma };
  });
  // Delta por segmento contra la barra mostrada inmediatamente anterior. Ns/Nc y categorías extra no llevan delta.
  const deltas = barras.slice(1).map((b, i) => {
    const a = barras[i];
    const items = ind.segmentos.filter(s => s.cat !== 'Ns/Nc').map(s => {
      const va = a.partes.find(x => x.cat === s.cat)?.valor, vb = b.partes.find(x => x.cat === s.cat)?.valor;
      const d = deltaPP(va, vb);
      return d == null ? null : { cat: s.cat, etiqueta: s.etiqueta, delta: d, texto: fmtDelta(d), signo: flechaDelta(d) };
    }).filter(Boolean);
    return { desde: formatearFecha(a.fecha), hasta: formatearFecha(b.fecha), items };
  }).filter(d => d.items.length);
  return { familia: 'B', id: ind.id, titulo: ind.titulo, segmentos, barras, deltas };
}

// ---------- Familia C ----------
function modeloC(ind, rondas) {
  const conDato = rondas.map(r => ({ r, p: dato(r, ind.pregunta) })).filter(x => x.p);
  if (!conDato.length) return null;
  const ref = conDato[conDato.length - 1]; // el ranking se ordena por la ronda más reciente con dato
  // Orden estable: primero el orden en que vienen las categorías en el dato, después por valor.
  const orden = [];
  [...conDato].reverse().forEach(({ p }) => Object.keys(p).forEach(c => { if (!orden.includes(c)) orden.push(c); }));
  const valorEn = (p, c) => (esNum(p[c]) ? p[c] : null);
  // Un ítem entra si es > 0 en AL MENOS una de las rondas mostradas (si es 0 en todas, no aparece).
  let items = orden.map((cat, i) => ({ cat, i, ref: valorEn(ref.p, cat) ?? 0, algunaVez: conDato.some(({ p }) => (valorEn(p, cat) ?? 0) > 0) })).filter(x => x.algunaVez);
  let otras = null;
  const top = ind.top ?? TOP_RANKING;
  if (ind.agruparResto) {
    // Top N + el resto (incluido "Otra" si existe) sumado en una sola fila final.
    const ordenados = items.filter(x => !esOtro(x.cat)).sort((a, b) => b.ref - a.ref || a.i - b.i);
    const visibles = ordenados.slice(0, top);
    const resto = new Set(items.filter(x => !visibles.includes(x)).map(x => x.cat));
    otras = { cat: ind.agruparResto, etiqueta: ind.agruparResto, valores: conDato.map(({ p }) => { const s = [...resto].reduce((a, c) => a + (valorEn(p, c) ?? 0), 0); return [...resto].some(c => valorEn(p, c) != null) ? redondear1(s) : null; }) };
    items = visibles;
  } else {
    const ordenados = items.sort((a, b) => b.ref - a.ref || a.i - b.i).slice(0, top);
    // "Otro"/"Otra" es un ítem más de la lista pero siempre va al final.
    items = [...ordenados.filter(x => !esOtro(x.cat)), ...ordenados.filter(x => esOtro(x.cat))];
  }
  const filas = items.map(x => ({ cat: x.cat, etiqueta: x.cat, valores: conDato.map(({ p }) => { const v = valorEn(p, x.cat); return v == null ? null : v; }) }));
  if (otras && otras.valores.some(v => v != null && v > 0)) filas.push(otras);
  if (!filas.length) return null;
  const rondasC = conDato.map(({ r }, k) => ({ fecha: r.fecha, etiqueta: etiquetaRonda(r), color: conDato.length === 1 ? COLOR_BARRA_C_UNICA : COLOR_BARRA_C[COLOR_BARRA_C.length - conDato.length + k] }));
  return { familia: 'C', id: ind.id, titulo: ind.titulo, rondas: rondasC, filas: filas.map(f => ({ ...f, valores: f.valores.map(v => ({ valor: v, texto: fmtPct(v) })) })) };
}

/**
 * Arma el modelo completo del bloque a partir de las rondas YA seleccionadas (ver seleccionarRondas).
 * Los indicadores sin ningún dato en las rondas mostradas se omiten; los grupos vacíos también.
 * @param {Ronda[]} rondasSel
 * @returns {{ rondas: {fecha:string, etiqueta:string}[], grupos: {id:string, titulo:string, items:any[]}[] }}
 */
export function armarBloque(rondasSel) {
  const rondas = seleccionarRondas(rondasSel);
  const grupos = GRUPOS.map(g => ({
    id: g.id, titulo: g.titulo,
    items: g.indicadores.map(ind => (ind.familia === 'A' ? modeloA(ind, rondas) : ind.familia === 'B' ? modeloB(ind, rondas) : modeloC(ind, rondas))).filter(Boolean),
  })).filter(g => g.items.length);
  return { rondas: rondas.map(r => ({ fecha: r.fecha, etiqueta: etiquetaRonda(r) })), grupos };
}
