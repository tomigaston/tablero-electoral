// Arma el reporte a partir de la selección del usuario. El orden de las secciones es el
// del registro (orden lógico fijo), nunca el orden de tildado. Solo se imprimen las
// secciones seleccionadas Y disponibles para el territorio actual.

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function generarReporte({ ctx, seleccion, registro, tituloContexto, formatearFecha, estilos }) {
  // react-dom/server se carga recién acá: no pesa en la carga inicial del tablero.
  const { renderToStaticMarkup } = await import('react-dom/server');
  const herramientas = { md: (el) => renderToStaticMarkup(el), formatearFecha, esc };
  const activas = registro.filter(s => seleccion.ids.includes(s.id) && s.disponible(ctx).ok);
  const hoy = formatearFecha(new Date());

  const cuerpo = activas.map(s => {
    const html = s.render(ctx, seleccion.opciones, herramientas);
    const dato = s.ultimoDato ? s.ultimoDato(ctx) : null;
    // datosAl (opcional): pie propio cuando "Datos al <fecha más reciente>" no describe la sección (p. ej. Encuestas,
    // donde cada bloque puede venir de una ronda distinta). Devuelve texto, o null para no mostrar pie.
    const pieDatos = s.datosAl ? s.datosAl(ctx, seleccion.opciones) : undefined;
    return `<section class="rp-sec${s.nuevaPagina ? ' rp-nueva-pagina' : ''}${s.unida ? ' rp-unida' : ''}" data-seccion="${s.id}">
  <h2 class="rp-h2">${esc(s.tituloImpreso ? s.tituloImpreso(ctx) : s.label)}</h2>
  <div class="rp-body">${html}</div>
  ${pieDatos !== undefined ? (pieDatos ? `<p class="rp-datos">${esc(pieDatos)}</p>` : '') : (dato ? `<p class="rp-datos">Datos al ${formatearFecha(dato)}</p>` : '')}
</section>`;
  }).join('\n');

  const cuerpo_ = `<div class="rp-cab">
  <div><h1>Diagnóstico Territorial</h1><div class="rp-terr">${esc(tituloContexto)}</div></div>
  <div class="rp-meta">Generado el ${hoy}<br>Incluye: ${activas.map(s => esc(s.label)).join(' · ')}</div>
</div>
${cuerpo}`;
  const { pagina, reglas } = estilos({ territorio: tituloContexto, fechaGenerado: hoy });
  return { titulo: `Reporte — ${tituloContexto}`, pagina, reglas, cuerpo: cuerpo_, ids: activas.map(s => s.id) };
}
