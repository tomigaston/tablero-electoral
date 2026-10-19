// Override temporal (REVERTIDO) que existió acá para la reunión del 2026-08-19 con el
// gobernador: mientras estuvo en una fecha (no null), toda pauta con `inicio` >= esa
// fecha se mostraba en TODO el tablero como vigente (mapa: estrella violeta, badges
// "Activa"/"Pauta activa") y con estado ACTIVO (card de solapa Pauta, tooltip del evento
// de circuito, columna "Estado" de los PDFs), sin importar su `fin` real ni su `estado`
// real de plataforma (ACTIVO/INACTIVO). Quedó activo por error después de la reunión
// (llegó a forzar ~2.700 piezas). pautaEstaForzada() ya contempla null como "sin
// override" (`!FORZAR_PAUTA_ACTIVA_DESDE` corta antes de mirar nada más), así que este
// valor null alcanza para apagarlo sin ambigüedad — no hace falta comentar ni borrar el
// mecanismo, que queda disponible por si hiciera falta un override puntual similar más
// adelante (fijarle una fecha de nuevo y commitear).
const FORZAR_PAUTA_ACTIVA_DESDE = null; // null = comportamiento normal, sin override (estado real)

// ---------------------------------------------------------------------------------------
// Estados de una pieza (homogéneo con el tablero del interior, lib/semaforo.js).
//
// `estado` viene DIRECTO de la columna ESTADO del crudo (scripts/generar_pauta_capital.py):
// Vigente (ACTIVO), Finalizada (INACTIVO), Observada, Programada, S/D (vacío) o el valor tal
// cual si es otro. Nunca se descarta una pieza por su estado.
// El JSON anterior a la migración traía ACTIVO/INACTIVO; normalizarEstadoPauta() acepta las
// dos formas para que el front funcione con cualquiera de los dos JSON.
export const ESTADOS_PAUTA = ['Vigente', 'Finalizada', 'Observada', 'Programada', 'S/D'];
const ESTADO_LEGADO = { ACTIVO: 'Vigente', INACTIVO: 'Finalizada', OBSERVADO: 'Observada', PROGRAMADO: 'Programada' };

export function normalizarEstadoPauta(estado) {
  if (estado == null) return 'S/D';
  const t = String(estado).trim();
  if (!t) return 'S/D';
  return ESTADO_LEGADO[t.toUpperCase()] || t;
}

// Fecha de hoy a medianoche, hora local (mismo criterio que usaban todos los call sites).
export function hoyLocal() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return hoy;
}

// Toma el prefijo "YYYY-MM-DD" de un string de fecha (ignora hora/timestamp si lo hubiera)
// y arma un Date en horario LOCAL, no UTC — evita que una fecha como "2026-08-05" se corra
// un día para atrás en husos horarios negativos como Argentina (new Date("2026-08-05") sí
// lo haría, al interpretarse como UTC medianoche). Fecha ausente o no parseable -> null.
// Único parser de fechas de pauta del tablero.
export function parsearFechaISOPauta(fechaStr) {
  if (!fechaStr || typeof fechaStr !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaStr);
  if (!match) return null;
  const [, y, m, d] = match;
  const fecha = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

// true si esta pauta cae bajo el override temporal (ver tope del archivo): el flag está activo
// Y su `inicio` es >= la fecha del flag. Comparación de strings "YYYY-MM-DD" (ancho fijo).
function pautaEstaForzada(pauta) {
  if (!FORZAR_PAUTA_ACTIVA_DESDE) return false;
  if (!pauta || typeof pauta.inicio !== 'string') return false;
  return pauta.inicio >= FORZAR_PAUTA_ACTIVA_DESDE;
}

// PREDICADO ÚNICO de "activa" (viva), el mismo del interior (esPiezaPDViva en lib/semaforo.js):
//   estado = Vigente (ESTADO = ACTIVO en el crudo)  Y  INICIO <= hoy <= FIN, con las dos
//   fechas cargadas. Observada, Programada, Finalizada, S/D y las piezas sin INICIO o sin FIN
//   NO son activas. `hoy` llega ya normalizado a medianoche (hoyLocal()).
// Lo usan TODAS las pantallas que dicen "activa" o "vigente": mapa, tarjetas, fichas, PDF,
// reporte y vista por circuito. Antes había dos definiciones (por `estado` y por `fin >= hoy`).
export function pautaEstaVigente(pauta, hoy) {
  if (pautaEstaForzada(pauta)) return true;
  if (normalizarEstadoPauta(pauta?.estado) !== 'Vigente') return false;
  const inicio = parsearFechaISOPauta(pauta?.inicio);
  const fin = parsearFechaISOPauta(pauta?.fin);
  if (!inicio || !fin) return false;
  return inicio <= hoy && hoy <= fin;
}
export const esPiezaViva = pautaEstaVigente;

// Estado tal como se muestra (etiqueta): el del dato normalizado, salvo el override temporal.
export function estadoMostradoPauta(pauta) {
  if (pautaEstaForzada(pauta)) return 'Vigente';
  return normalizarEstadoPauta(pauta?.estado);
}

// Pauta "dirigida": apunta a un barrio o a un circuito. La de toda la Capital (toda_capital) es
// genérica: se muestra y puede estar activa, pero NO cuenta como cobertura de un barrio ni de un
// circuito (mismo criterio que el interior con la pauta provincial: sub_ambito dirigido).
export function esPautaDirigida(pauta) {
  const d = pauta?.destino_tablero;
  return d === 'barrio' || d === 'circuito_sin_barrio';
}

// Cuenta para la cobertura de un barrio/circuito: dirigida y activa.
export function cuentaParaCobertura(pauta, hoy) {
  return esPautaDirigida(pauta) && pautaEstaVigente(pauta, hoy);
}

// Pauta "Mesa de Capital" (obras_capital.json, no pautas_barrios.json): una obra cuenta
// como tal cuando tiene entrega_material_pauta_nico (link) Y fecha_pauta ambos no-nulos.
// A diferencia de pautaEstaVigente, acá no hay noción de vigencia por fecha — fecha_pauta
// no siempre es una fecha ISO parseable (hay valores tipo "26-08 al 15-09" en el archivo
// real), así que "activa" es simplemente "tiene los dos campos cargados". Única fuente de
// este criterio — usado por pages/index.js (solapa Pauta de la ficha de barrio, badge del
// header) y components/MapaCircuitos.js (popup de estrella de pauta), que no deben
// reimplementarlo cada uno por su lado.
export function esObraPautaMesaCapital(obra) {
  return !!(obra?.entrega_material_pauta_nico && obra?.fecha_pauta);
}
