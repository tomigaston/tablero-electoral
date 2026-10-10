// Intención de voto para Gobernador — lógica de datos compartida por la UI (solapa
// Encuestas), el reporte PDF y /admin/data-status. Sin React ni acceso a archivos.
//
// Modelo: en encuestas_circuitos.json cada escenario es UNA pregunta de la ronda, con
// nombre "Intención voto Gobernador - <escenario>" y una categoría por candidato (la
// encuestadora repite la misma pregunta con listas de candidatos distintas). El registro
// (alias, nombres para mostrar, notas) está en encuestas_metadata.json → escenarios_gobernador.
// Los porcentajes se muestran TAL CUAL vienen: nunca se normalizan ni se completan.

export const PREFIJO_ESCENARIO = 'Intención voto Gobernador - ';
export const UMBRAL_MUESTRA_REDUCIDA = 30;

// Nombre canónico de un candidato: resuelve alias (acentos, mayúsculas) con el mapa del registro.
export function claveCandidato(nombre, meta) {
  const limpio = String(nombre ?? '').trim();
  return meta?.alias_candidatos?.[limpio] || limpio;
}

// Nombre para mostrar (con acentos) y tipo ('candidato' | 'otro' | 'nsnc').
export function nombreCandidato(clave, meta) {
  return meta?.candidatos?.[clave]?.nombre || clave;
}
export function tipoCandidato(clave, meta) {
  return meta?.candidatos?.[clave]?.tipo || 'candidato';
}

// Extrae los escenarios de la encuesta de UN circuito. Devuelve:
//  rondas:    [{ fecha, casos, indice, escenarios: [{ id, nombre, orden, valores: {clave: pct} }] }]  solo rondas con escenarios
//  escenarios: [{ id, nombre, fechas: [...] }]  unión de escenarios, en orden de primera aparición
// "orden" = posición del escenario dentro de la ronda (Escenario N). En el informe del 01-10-2026
// coincide con el número impreso en la pregunta.
export function escenariosDeEncuesta(encuesta, meta) {
  const prefijo = meta?.prefijo_pregunta || PREFIJO_ESCENARIO;
  const rondas = [];
  const union = new Map();
  (encuesta?.rondas || []).forEach((r, indice) => {
    const escenarios = [];
    Object.entries(r.preguntas || {}).forEach(([pregunta, cats]) => {
      if (!pregunta.startsWith(prefijo)) return;
      const nombre = pregunta.slice(prefijo.length);
      const valores = {};
      Object.entries(cats || {}).forEach(([cand, pct]) => { valores[claveCandidato(cand, meta)] = pct; });
      escenarios.push({ id: nombre, nombre, orden: escenarios.length + 1, valores });
      if (!union.has(nombre)) union.set(nombre, { id: nombre, nombre, fechas: [] });
      union.get(nombre).fechas.push(r.fecha);
    });
    if (escenarios.length > 0) rondas.push({ fecha: r.fecha, casos: r.casos ?? null, indice, escenarios });
  });
  return { rondas, escenarios: [...union.values()] };
}

// Orden de las filas de UNA tabla: candidatos de mayor a menor %, después "Otro" y al final
// NS/NC (nunca pueden ser el "primero"). Empates: se mantiene el orden original del informe.
export function ordenarFilas(valores, meta, referencia) {
  const base = referencia || valores;
  const claves = Object.keys(valores);
  const peso = (c) => { const t = tipoCandidato(c, meta); return t === 'nsnc' ? 2 : t === 'otro' ? 1 : 0; };
  const orig = (c) => Object.keys(base).indexOf(c);
  return claves.sort((a, b) => peso(a) - peso(b) || (valores[b] - valores[a]) || (orig(a) - orig(b)));
}

// Primero y segundo entre los CANDIDATOS (excluye Otro y NS/NC), con la diferencia en pp.
export function punteroYDiferencia(valores, meta) {
  const cands = Object.keys(valores).filter(c => tipoCandidato(c, meta) === 'candidato').sort((a, b) => valores[b] - valores[a]);
  if (cands.length === 0) return null;
  const [primero, segundo] = cands;
  return { primero, segundo: segundo ?? null, diferencia: segundo != null ? valores[primero] - valores[segundo] : null };
}

// Variación de un candidato entre rondas. Mismo criterio de "estable" que el resto de las
// comparativas del tablero (calcularVariacionIndicador): |delta| < umbral. null si falta un dato.
export function variacion(actual, anterior, umbral) {
  if (actual == null || anterior == null) return null;
  const delta = actual - anterior;
  const estado = Math.abs(delta) < umbral ? 'estable' : (delta > 0 ? 'sube' : 'baja');
  return { delta, estado };
}

// Filas alineadas por candidato para dos rondas (A = anterior, B = nueva). Orden: el de la ronda
// nueva; los candidatos que solo estaban en la anterior quedan al final. Ausente = null (se muestra "—").
export function alinearComparativo(valoresA, valoresB, meta) {
  const ordenB = ordenarFilas(valoresB, meta);
  const soloA = ordenarFilas(Object.fromEntries(Object.entries(valoresA).filter(([c]) => !(c in valoresB))), meta, valoresA);
  return [...ordenB, ...soloA].map(c => ({ clave: c, a: valoresA[c] ?? null, b: valoresB[c] ?? null }));
}

// Escenarios que existen en las dos rondas (para el comparativo).
export function escenariosEnAmbas(rondaA, rondaB) {
  const idsB = new Set(rondaB.escenarios.map(e => e.id));
  return rondaA.escenarios.filter(e => idsB.has(e.id)).map(e => e.id);
}

// ¿El informe de esa ronda numera los escenarios? Solo el del 01-10-2026 trae la pregunta numerada
// (1 a 6); en los de septiembre "Escenario N" es el orden de aparición en el informe. Se sabe por
// escenarios.<nombre>.numero_en_informe.<fecha> del registro.
export function informeNumeraEscenarios(meta, fecha) {
  return Object.values(meta?.escenarios || {}).some(e => e?.numero_en_informe && fecha in e.numero_en_informe);
}
// Nota discreta para las rondas cuyo informe no numera los escenarios (null si todas los numeran).
export function notaNumeracion(fechas, meta, formatear) {
  const sin = [...new Set(fechas)].filter(f => !informeNumeraEscenarios(meta, f));
  if (!sin.length) return null;
  return `Numeración por orden de aparición en el informe${sin.length < new Set(fechas).size || sin.length === 1 ? ` (ronda del ${sin.map(formatear).join(', ')})` : ` (rondas del ${sin.map(formatear).join(' y ')})`}: el informe no numera los escenarios.`;
}

export const NOTA_SIN_CONNOTACION = 'En intención de voto, subir o bajar no es bueno ni malo en sí: las flechas indican solo el sentido del cambio.';
