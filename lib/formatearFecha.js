// Formato de fecha único para todo el tablero: convierte una fecha interna (ISO
// "YYYY-MM-DD", con o sin hora/timestamp, o un objeto Date) al formato argentino
// "DD-MM-YYYY", sin hora. Los datos internos (JSON, comparaciones, orden cronológico)
// siguen en ISO — esto es solo para lo que se le muestra al usuario.
export function formatearFecha(valor) {
  if (valor == null) return '—';

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return '—';
    const d = String(valor.getDate()).padStart(2, '0');
    const m = String(valor.getMonth() + 1).padStart(2, '0');
    return `${d}-${m}-${valor.getFullYear()}`;
  }

  if (typeof valor !== 'string') return String(valor);

  // Toma solo el prefijo de fecha (descarta cualquier hora/timestamp si lo hubiera).
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (!match) return valor;
  const [, y, m, d] = match;
  return `${d}-${m}-${y}`;
}
