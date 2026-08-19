// ⚠️ TEMPORAL — SOLO PARA REUNIÓN DEL 2026-08-19 CON EL GOBERNADOR — REVERTIR DESPUÉS.
// Ver instrucciones de revert al final de este archivo y en el mensaje del commit.
//
// Toda pauta con `inicio` >= FORZAR_PAUTA_ACTIVA_DESDE se muestra en TODO el tablero como
// vigente (mapa: estrella violeta, badges "Activa"/"Pauta activa") y con estado ACTIVO
// (card de solapa Pauta, tooltip del evento de circuito, columna "Estado" de los PDFs),
// sin importar su `fin` real ni su `estado` real de plataforma (ACTIVO/INACTIVO). Es puro
// efecto de presentación para la reunión: no toca ningún JSON de datos, ni cambia lo que
// devuelven las funciones de acá cuando el flag está en null.
//
// REVERT (después de la reunión): poner FORZAR_PAUTA_ACTIVA_DESDE en null acá abajo y
// commitear. Es un cambio de una sola línea en un solo archivo.
const FORZAR_PAUTA_ACTIVA_DESDE = '2026-07-01'; // null = comportamiento normal, sin override

// Toma el prefijo "YYYY-MM-DD" de un string de fecha (ignora hora/timestamp si lo hubiera)
// y arma un Date en horario LOCAL, no UTC — evita que una fecha como "2026-08-05" se corra
// un día para atrás en husos horarios negativos como Argentina (new Date("2026-08-05") sí
// lo haría, al interpretarse como UTC medianoche). Fecha ausente o no parseable -> null.
// Único parser de fechas de pauta del tablero — antes vivía duplicado como
// parsearFechaISO en components/MapaCircuitos.js y parsearFechaISOPauta en pages/index.js.
export function parsearFechaISOPauta(fechaStr) {
  if (!fechaStr || typeof fechaStr !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaStr);
  if (!match) return null;
  const [, y, m, d] = match;
  const fecha = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

// true si esta pauta cae bajo el override temporal de la reunión: el flag está activo Y
// su `inicio` es >= la fecha del flag. Comparación de strings "YYYY-MM-DD" tal cual (sin
// pasar por Date): formato de ancho fijo, así que el orden lexicográfico coincide con el
// orden cronológico. `inicio` ausente o no-string -> nunca forzada (misma pauta que hoy no
// tiene fecha de arranque tampoco la tendría bajo el comportamiento normal).
function pautaEstaForzada(pauta) {
  if (!FORZAR_PAUTA_ACTIVA_DESDE) return false;
  if (!pauta || typeof pauta.inicio !== 'string') return false;
  return pauta.inicio >= FORZAR_PAUTA_ACTIVA_DESDE;
}

// Vigencia por fecha de UNA pauta (fin >= hoy). Reemplaza el cálculo que antes vivía
// duplicado en components/MapaCircuitos.js (dentro del useMemo de pautaBarrioMarkers,
// campo _activa) y en estadoPautaBarrio de pages/index.js. Comportamiento base SIN
// cambios respecto de antes: sin `fin` parseable -> no vigente (nunca se trató como
// vigente por default, ni antes ni ahora). `hoy` se recibe ya normalizado a medianoche
// (setHours(0,0,0,0)) por el llamador, mismo criterio que ya usaban ambos call sites.
export function pautaEstaVigente(pauta, hoy) {
  if (pautaEstaForzada(pauta)) return true;
  const fechaFin = parsearFechaISOPauta(pauta?.fin);
  return fechaFin ? fechaFin >= hoy : false;
}

// Campo `estado` (ACTIVO/INACTIVO, propio de la plataforma de pauta) tal como se debe
// mostrar en UI/PDF — el valor crudo del dato, salvo que el override de la reunión lo
// pise a 'ACTIVO' para pautas con inicio >= el flag. Reemplaza las lecturas directas de
// pauta.estado en la card de solapa Pauta, el tooltip del evento de circuito y las
// columnas "Estado" de htmlPautaPDF/htmlPautaCircuitoPDF.
export function estadoMostradoPauta(pauta) {
  if (pautaEstaForzada(pauta)) return 'ACTIVO';
  return pauta?.estado;
}
