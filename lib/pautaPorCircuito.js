// Derivación en runtime de la vista "Pauta por circuito" a partir de pautas_barrios.json.
// NO existe (ni debe crearse) un pautas_circuitos.json: el barrio es la fuente de verdad
// territorial y el circuito se deriva de él, sin recalcular geometría.
//
// Reglas (ver docs/pauta-por-circuito-notas.md):
//  - Entradas de `barrios`: si traen `circuito` explícito, ese gana (es el circuito que
//    declara la fuente; 191 de esas entradas ni siquiera están en el cruce del barrio).
//    Si no, circuito PRINCIPAL del barrio: `circuito_principal` de barrios_geo.json (primer
//    fragmento con el nombre, igual que buscarPautaCircuito) y, si falta, circuito_barrios_
//    cruce.json con orden_importancia 1. Cada pieza cae en UN solo circuito.
//  - `circuitos_sin_barrio` se indexa directo por CircuitoKey; `toda_capital` va aparte.
//  - Dentro de un circuito la pieza se deduplica por CONTENIDO (el JSON no expone COD.
//    CONTENIDO) y se juntan sus barrios. `fila_origen` NO alcanza: la misma pieza multi-
//    barrio llega con una fila distinta por barrio, y como "gemela" una fila de circuito sin
//    barrio (filas consecutivas, métricas idénticas): ~1.955 repeticiones. Las métricas son
//    las de UNA de las repeticiones (idénticas entre sí por construcción de la clave):
//    nunca se suman. Dos filas con mismo título pero métricas distintas son piezas
//    distintas (ad-sets separados) y se muestran separadas.
//  - El estado se muestra tal cual viene (Vigente/Finalizada/Observada/Programada/S/D); la
//    vigencia (Activa/Inactiva) sale del predicado único pautaEstaVigente() (estado Vigente e
//    INICIO <= hoy <= FIN). `cuentaCobertura` = activa Y dirigida (barrio o circuito): la pauta de
//    toda la Capital puede estar activa pero no cuenta como cobertura de ningún circuito.
//  - Lo que no resuelve a ningún circuito NO se descarta: va a `sinCircuitoResuelto`.
import { pautaEstaVigente, parsearFechaISOPauta } from './estadoPauta';

// 010A -> 10A (Mapkey con cero a la izquierda vs CircuitoKey). Solo ceros delante de un dígito.
export const normalizarCircuitoKey = (k) => String(k ?? '').trim().toUpperCase().replace(/^0+(?=\d)/, '');

const normBarrio = (s) => (s || '')
  .toUpperCase()
  .replace(/[ºª]/g, 'O')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
// Red de seguridad para las siglas con punto ("A.T. E." en pautas/geo vs "A.T. E" en el
// cruce): sin puntos ni espacios sobrantes los dos lados coinciden.
export const normBarrioSinPuntos = (s) => normBarrio(s).replace(/\./g, '').replace(/\s+/g, ' ').trim();

export const normalizarTexto = (s) => (s || '')
  .toString()
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const mapkeyDe = (clave) => String(clave || '').split(' - ')[0].trim();

// Mapkey (con ceros) -> registro de `datos`
function indiceMapkey(datos) {
  const idx = new Map();
  datos.forEach((d) => idx.set(String(d.Mapkey), d));
  return idx;
}

function construirResolutorBarrio(datos, barriosGeoData, cruceData) {
  const porMapkey = indiceMapkey(datos);
  // Primer fragmento por nombre normalizado (mismo criterio que buscarPautaCircuito).
  const principalGeo = new Map();
  (barriosGeoData?.features || []).forEach((f) => {
    const nombre = f.properties?.nombre_barrio;
    const mk = mapkeyDe(f.properties?.circuito_principal);
    if (!nombre || !mk) return;
    const k = normBarrio(nombre);
    if (!principalGeo.has(k)) principalGeo.set(k, mk);
  });
  const principalCruce = new Map();
  Object.entries(cruceData?.barrio_to_circuitos || {}).forEach(([barrio, lista]) => {
    const principal = (lista || []).find((c) => c.orden_importancia === 1);
    const mk = mapkeyDe(principal?.circuito);
    if (mk) principalCruce.set(normBarrioSinPuntos(barrio), mk);
  });
  return (nombreBarrio) => {
    const mk = principalGeo.get(normBarrio(nombreBarrio)) || principalCruce.get(normBarrioSinPuntos(nombreBarrio));
    const registro = mk ? porMapkey.get(mk) : null;
    return registro ? normalizarCircuitoKey(registro.CircuitoKey) : null;
  };
}

// fin descendente; sin fecha parseable al final (empate: título, para orden estable).
export function compararPorFinDesc(a, b) {
  const fa = parsearFechaISOPauta(a.pauta.fin);
  const fb = parsearFechaISOPauta(b.pauta.fin);
  if (fa && fb && fa.getTime() !== fb.getTime()) return fb - fa;
  if (fa && !fb) return -1;
  if (!fa && fb) return 1;
  return String(a.pauta.titulo_pieza || '').localeCompare(String(b.pauta.titulo_pieza || ''), 'es');
}

// Clave de identidad de una pieza dentro de un circuito: todo lo que la hace "la misma
// pieza" (incluye las métricas ejecutadas y el link, así dos ad-sets con igual título pero
// distinto gasto no se funden). Sin fila_origen a propósito (ver cabecera).
export function claveContenido(p) {
  return JSON.stringify([
    p.titulo_pieza, p.campania, p.plataforma, p.inicio, p.fin, p.objetivo_campana, p.tipo_pauta,
    p.estado, p.material?.link ?? null, p.metricas_ejecutadas ?? null,
  ]);
}

// Acumulador por circuito/bucket: dedup por contenido + barrios de la pieza.
function crearAcumulador(hoy) {
  const piezas = new Map();
  return {
    agregar(pauta, barrio, alcance) {
      const clave = claveContenido(pauta);
      let pieza = piezas.get(clave);
      if (!pieza) {
        pieza = { id: `p${piezas.size}-${pauta.fila_origen}`, pauta, alcance, barrios: [], sinBarrio: false, filas: [], entradas: 0, vigente: pautaEstaVigente(pauta, hoy), cuentaCobertura: alcance !== 'capital' && pautaEstaVigente(pauta, hoy) };
        piezas.set(clave, pieza);
      }
      pieza.entradas += 1;
      if (pauta.fila_origen != null && !pieza.filas.includes(pauta.fila_origen)) pieza.filas.push(pauta.fila_origen);
      if (barrio) { if (!pieza.barrios.includes(barrio)) pieza.barrios.push(barrio); } else pieza.sinBarrio = true;
    },
    lista() {
      const l = Array.from(piezas.values());
      l.forEach((p) => { p.barrios.sort((x, y) => x.localeCompare(y, 'es')); p.filas.sort((x, y) => x - y); });
      return l.sort(compararPorFinDesc);
    },
  };
}

export function derivarPautaPorCircuito({ pautasBarriosData, datos, barriosGeoData, cruceData, hoy }) {
  if (!pautasBarriosData || !datos?.length) return null;
  const resolverBarrio = construirResolutorBarrio(datos, barriosGeoData, cruceData);
  const circuitosConocidos = new Set(datos.map((d) => normalizarCircuitoKey(d.CircuitoKey)));

  const porCircuito = new Map();
  const acumuladorDe = (ck) => {
    if (!porCircuito.has(ck)) porCircuito.set(ck, crearAcumulador(hoy));
    return porCircuito.get(ck);
  };
  const sinResolver = crearAcumulador(hoy);
  const barriosSinResolver = new Map();
  const capital = crearAcumulador(hoy);
  let entradas = 0;

  Object.entries(pautasBarriosData.barrios || {}).forEach(([barrio, info]) => {
    (info.pautas || []).forEach((pauta) => {
      entradas += 1;
      const explicito = pauta.circuito ? normalizarCircuitoKey(pauta.circuito) : null;
      const ck = explicito && circuitosConocidos.has(explicito) ? explicito : resolverBarrio(barrio);
      if (ck) {
        acumuladorDe(ck).agregar(pauta, barrio, 'barrio');
      } else {
        sinResolver.agregar(pauta, barrio, 'barrio');
        barriosSinResolver.set(barrio, (barriosSinResolver.get(barrio) || 0) + 1);
      }
    });
  });

  Object.entries(pautasBarriosData.circuitos_sin_barrio || {}).forEach(([clave, info]) => {
    const ck = normalizarCircuitoKey(clave);
    (info.pautas || []).forEach((pauta) => {
      entradas += 1;
      if (circuitosConocidos.has(ck)) acumuladorDe(ck).agregar(pauta, null, 'circuito');
      else sinResolver.agregar(pauta, null, 'circuito');
    });
  });

  (pautasBarriosData.toda_capital?.pautas || []).forEach((pauta) => {
    entradas += 1;
    capital.agregar(pauta, null, 'capital');
  });

  const circuitos = [...datos]
    .sort((a, b) => {
      const na = parseInt(a.Mapkey, 10); const nb = parseInt(b.Mapkey, 10);
      return na !== nb ? na - nb : String(a.Mapkey).localeCompare(String(b.Mapkey));
    })
    .map((d) => {
      const key = normalizarCircuitoKey(d.CircuitoKey);
      return { key, nombre: d.cirn_nom || '', piezas: porCircuito.has(key) ? porCircuito.get(key).lista() : [] };
    });

  const piezasCapital = capital.lista();
  const piezasSinResolver = sinResolver.lista();
  return {
    alcanceCapital: piezasCapital,
    circuitos,
    sinCircuitoResuelto: {
      piezas: piezasSinResolver,
      barrios: Array.from(barriosSinResolver, ([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    },
    control: {
      entradas,
      // Cada entrada del JSON cae en exactamente una pieza: entradasAsignadas === entradas.
      entradasAsignadas: [...circuitos.flatMap((c) => c.piezas), ...piezasCapital, ...piezasSinResolver].reduce((n, p) => n + p.entradas, 0),
      piezasEnCircuitos: circuitos.reduce((s, c) => s + c.piezas.length, 0),
      piezasCapital: piezasCapital.length,
      piezasSinResolver: piezasSinResolver.length,
    },
  };
}

// ---- Filtros ----------------------------------------------------------------------

// estado: 'activa' | 'inactiva' | 'todas'. plataforma: 'todas' | 'META' | 'GOOGLE'.
// textoPieza: búsqueda sobre campaña/título (sin acentos, mayúsculas indistintas).
export function filtrarPiezas(piezas, { plataforma = 'todas', textoPieza = '' }) {
  const q = normalizarTexto(textoPieza);
  if (plataforma === 'todas' && !q) return piezas;
  return piezas.filter((p) => {
    if (plataforma !== 'todas' && p.pauta.plataforma !== plataforma) return false;
    if (q && !normalizarTexto(`${p.pauta.titulo_pieza} ${p.pauta.campania}`).includes(q)) return false;
    return true;
  });
}

export function particionarPorVigencia(piezas) {
  const activas = [];
  const inactivas = [];
  piezas.forEach((p) => (p.vigente ? activas : inactivas).push(p));
  return { activas, inactivas };
}

export function coincideCircuito(circuito, texto) {
  const q = normalizarTexto(texto);
  if (!q) return true;
  return normalizarTexto(circuito.key).startsWith(normalizarTexto(normalizarCircuitoKey(texto))) || normalizarTexto(circuito.nombre).includes(q);
}

// ---- Formateo de métricas --------------------------------------------------------

// '-', '#DIV/0!', vacío, NaN, null -> null. Nunca "0"/"NaN" por un dato ausente.
export function limpiarMetrica(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s || s === '-' || s === '—' || /^#(DIV\/0!|N\/A|VALUE!|REF!)/i.test(s)) return null;
  return s;
}

export function etiquetasMetricas(plataforma) {
  if (plataforma === 'GOOGLE') return { alcance: 'Visualizaciones', frecuencia: null, costo: 'CPV' };
  return { alcance: 'Impresiones', frecuencia: 'Frecuencia', costo: 'CPM' };
}

const fmtNum = (v, max = 2) => (typeof v === 'number' ? v.toLocaleString('es-AR', { maximumFractionDigits: max }) : v);

// Devuelve [{ label, valor }] listo para mostrar; el valor ausente es "—".
export function metricasParaMostrar(pauta) {
  const m = pauta.metricas_ejecutadas || {};
  const et = etiquetasMetricas(pauta.plataforma);
  const alcance = limpiarMetrica(m.alcance_o_visualizaciones);
  const frecuencia = limpiarMetrica(m.frecuencia);
  const costo = limpiarMetrica(m.costo_unitario);
  const inversion = limpiarMetrica(m.inversion);
  const items = [
    { label: 'Inversión', valor: inversion == null ? '—' : `$ ${fmtNum(inversion, 0)}` },
    { label: et.alcance, valor: alcance == null ? '—' : fmtNum(alcance, 0) },
  ];
  if (et.frecuencia) items.push({ label: et.frecuencia, valor: frecuencia == null ? '—' : fmtNum(frecuencia, 2) });
  items.push({ label: et.costo, valor: costo == null ? '—' : `$ ${fmtNum(costo, 2)}` });
  return items;
}

export const esUrlHttp = (s) => typeof s === 'string' && /^https?:\/\/\S+$/i.test(s.trim());
