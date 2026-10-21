// Exportables del seguimiento de recomendaciones: listado por tipo de acción (p. ej. "Mandar a medir"),
// a PDF (ventana de impresión → "Guardar como PDF") o a Excel (CSV). Solo se ejecuta en el navegador.
import { TIPOS_ACCION, ETIQUETA_ESTADO, ordenarEtapas } from './acciones';
import { LABEL_PRIORIDAD } from './config';
import { ORDEN_PRIORIDAD } from './prioridad';

export const COLUMNAS_EXPORT = [
  ['circuito', 'Circuito'], ['nombre', 'Nombre'], ['accion', 'Acción'], ['detalle', 'Detalle'], ['estado', 'Estado'],
  ['situacion', 'Situación'], ['padron', 'Padrón'], ['ultimaEtapa', 'Última etapa'], ['fecha', 'Fecha'],
];

const fechaCorta = (iso) => {
  try { return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) { return ''; }
};
// "28/10/2026 — Respondieron posible fecha: 14/11" (la etapa más reciente por fecha) o '' si no tiene etapas.
const ultimaEtapaTexto = (r) => {
  const e = ordenarEtapas(r.etapas).pop();
  if (!e) return '';
  const [y, m, d] = String(e.fecha).slice(0, 10).split('-');
  return `${d}/${m}/${y} — ${e.texto}`;
};
const hoyTexto = () => new Date().toLocaleDateString('es-AR');
const hoyISO = () => new Date().toISOString().slice(0, 10);

/**
 * Filas del listado. tipo: clave de TIPOS_ACCION o 'todos'. estados: lista de estados guardados (pendiente / en_curso / hecha).
 * Orden: primero los circuitos con peor semáforo (rojo, azul, amarillo, verde) y después por número de circuito.
 */
export function filasExportables(recs, { tipo = 'todos', estados = ['pendiente', 'en_curso'] } = {}) {
  return recs
    .filter((r) => (tipo === 'todos' || r.tipo === tipo) && estados.includes(r.estado))
    .sort((a, b) => (ORDEN_PRIORIDAD[a.fila.prioridad.nivel] ?? 9) - (ORDEN_PRIORIDAD[b.fila.prioridad.nivel] ?? 9)
      || String(a.circuito).localeCompare(String(b.circuito), 'es', { numeric: true }))
    .map((r) => ({
      circuito: r.fila.key,
      nombre: r.fila.nombre,
      accion: TIPOS_ACCION[r.tipo] || r.tipo,
      detalle: r.texto && r.texto !== TIPOS_ACCION[r.tipo] ? r.texto : '',
      estado: ETIQUETA_ESTADO[r.estado] || r.estado,
      situacion: LABEL_PRIORIDAD[r.fila.prioridad.nivel] || '',
      padron: r.fila.padron != null ? r.fila.padron.toLocaleString('es-AR') : '',
      ultimaEtapa: ultimaEtapaTexto(r),
      fecha: fechaCorta(r.creada_en),
    }));
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Excel en español usa ";" como separador de columnas; el BOM hace que abra bien los acentos.
export function descargarCsv(nombreBase, filas) {
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lineas = [COLUMNAS_EXPORT.map(([, t]) => celda(t)).join(';'), ...filas.map((f) => COLUMNAS_EXPORT.map(([k]) => celda(f[k])).join(';'))];
  const blob = new Blob([`﻿${lineas.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombreBase}_${hoyISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Abre una página lista para imprimir (A4 apaisado); desde el diálogo se elige "Guardar como PDF". Devuelve false si el
// navegador bloqueó la ventana emergente.
export function abrirImpresion(titulo, subtitulo, filas) {
  const w = window.open('', '_blank');
  if (!w) return false;
  const cabecera = COLUMNAS_EXPORT.map(([, t]) => `<th>${esc(t)}</th>`).join('');
  const cuerpo = filas.map((f) => `<tr>${COLUMNAS_EXPORT.map(([k]) => `<td>${esc(f[k])}</td>`).join('')}</tr>`).join('');
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color: #111; font-size: 12px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  p { margin: 0 0 10px; color: #555; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #e8eef7; }
  tr { break-inside: avoid; }
  tbody tr:nth-child(even) { background: #f6f6f6; }
</style></head><body>
<h1>${esc(titulo)}</h1><p>${esc(subtitulo)}</p>
<table><thead><tr>${cabecera}</tr></thead><tbody>${cuerpo}</tbody></table>
</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
  return true;
}

export const subtituloListado = (estadosTexto, n) => `${estadosTexto} · ${n} ${n === 1 ? 'recomendación' : 'recomendaciones'} · generado el ${hoyTexto()}`;
