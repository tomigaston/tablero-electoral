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
