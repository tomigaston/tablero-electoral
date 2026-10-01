import { formatearFecha } from './formatearFecha';

// Exporta a .xlsx lo que muestra TablaEventosCobertura (filas ya filtradas y ordenadas,
// con eventos ya agrupados por tipo+fecha). exceljs se carga con import dinámico para no
// sumarlo al bundle inicial. Se usa el build de navegador (min.js) para evitar los
// polyfills de Node que el build normal intenta resolver en webpack.

const ENCABEZADO = { bold: true };

// "YYYY-MM-DD[...]" -> Date en UTC 00:00 (exceljs serializa Date como UTC, así evita
// que la fecha se corra un día según la zona horaria del navegador).
function fechaExcel(fechaISO) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaISO || '');
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

const unicos = (arr) => Array.from(new Set(arr.filter(Boolean)));

// Link de una pieza de pauta: material.link, y si no hay, el primero de IG/FB/YT.
function linkPauta(p) {
  const m = p.material || {};
  const r = m.redes_publicadas || {};
  return m.link || r.ig || r.fb || r.yt || '';
}

// Nota y link de un grupo de eventos (el grupo siempre es de un mismo tipo y fecha).
// Visita: info/link de cada visita (distintas si las hay). Pauta: título/link de la
// primera pieza (el grupo puede ser de decenas, ver "Cantidad"). Medición: sin nota/link.
function notaYLink(evento) {
  const grupo = evento._grupo || [evento];
  if (evento.tipo === 'visita') {
    return {
      nota: unicos(grupo.map(e => e.detalle.info)).join(' | '),
      link: unicos(grupo.map(e => e.detalle.link)).join(' | '),
    };
  }
  if (evento.tipo === 'pauta') {
    return { nota: evento.detalle.titulo_pieza || '', link: linkPauta(evento.detalle) };
  }
  return { nota: '', link: '' };
}

export async function descargarExcelEventos({ filas, tiposEvento, hoy = new Date() }) {
  const ExcelJS = (await import('exceljs/dist/exceljs.min.js')).default;
  const wb = new ExcelJS.Workbook();

  // --- Hoja "Eventos": formato largo, una fila por evento (grupo) ---
  const ws = wb.addWorksheet('Eventos', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'ID circuito', key: 'id', width: 12 },
    { header: 'Circuito', key: 'circuito', width: 32 },
    { header: 'Tipo', key: 'tipo', width: 14 },
    { header: 'Fecha', key: 'fecha', width: 12, style: { numFmt: 'dd-mm-yyyy' } },
    { header: 'Cantidad', key: 'cantidad', width: 10 },
    { header: 'Tipo de visita', key: 'tipoVisita', width: 18 },
    { header: 'Contacto con vecinos', key: 'contacto', width: 20 },
    { header: 'Nota', key: 'nota', width: 50 },
    { header: 'Link', key: 'link', width: 50 },
  ];
  ws.getRow(1).font = ENCABEZADO;

  filas.forEach(({ circuito, eventos }) => {
    eventos.forEach(e => {
      const grupo = e._grupo || [e];
      const { nota, link } = notaYLink(e);
      const esVisita = e.tipo === 'visita';
      ws.addRow({
        id: circuito.Mapkey,
        circuito: circuito.cirn_nom,
        tipo: tiposEvento[e.tipo].label,
        fecha: fechaExcel(e.fecha),
        cantidad: grupo.length > 1 ? grupo.length : null,
        tipoVisita: esVisita ? unicos(grupo.map(g => g.detalle.tipo_visita)).join(' | ') : '',
        contacto: esVisita ? unicos(grupo.map(g => g.detalle.contacto_vecinos)).join(' | ') : '',
        nota,
        link,
      });
    });
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

  // --- Hoja "Vista tabla": réplica de la grilla (un evento por columna) ---
  const maxColumnas = Math.max(1, ...filas.map(f => f.eventos.length));
  const wt = wb.addWorksheet('Vista tabla', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  wt.columns = [
    { header: 'Circuito', key: 'circuito', width: 36 },
    ...Array.from({ length: maxColumnas }, (_, i) => ({ header: `Evento ${i + 1}`, key: `e${i}`, width: 24 })),
  ];
  wt.getRow(1).font = ENCABEZADO;
  filas.forEach(({ circuito, eventos }) => {
    const fila = { circuito: `${circuito.Mapkey} · ${circuito.cirn_nom}` };
    eventos.forEach((e, i) => {
      const n = (e._grupo || [e]).length;
      fila[`e${i}`] = `${tiposEvento[e.tipo].label} · ${formatearFecha(e.fecha)}${n > 1 ? ` (${n})` : ''}`;
    });
    wt.addRow(fila);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const pad = (n) => String(n).padStart(2, '0');
  const nombre = `eventos_circuitos_${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
