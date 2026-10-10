// Imprime el reporte desde la propia página del tablero (sin ventana emergente ni
// document.write, que se comportan distinto según el navegador y los bloqueadores).
// Se inyecta un contenedor con el reporte y una hoja de estilos que, SOLO al imprimir,
// oculta todo lo demás: lo único que sale en papel es lo que se eligió en el modal.

const ID_RAIZ = 'rp-print-root';
const ID_ESTILO = 'rp-print-style';

export function limpiarReporteImpreso() {
  document.getElementById(ID_RAIZ)?.remove();
  document.getElementById(ID_ESTILO)?.remove();
}

export function montarReporteParaImprimir({ titulo, pagina, reglas, cuerpo }) {
  limpiarReporteImpreso();
  const estilo = document.createElement('style');
  estilo.id = ID_ESTILO;
  estilo.textContent = `${pagina}
@media screen{#${ID_RAIZ}{display:none !important}}
@media print{
  body > *:not(#${ID_RAIZ}){display:none !important}
  #${ID_RAIZ}{display:block !important;position:static !important}
  html,body{height:auto !important;overflow:visible !important;background:#fff !important}
  ${reglas}
}`;
  const raiz = document.createElement('div');
  raiz.id = ID_RAIZ;
  raiz.innerHTML = cuerpo;
  document.head.appendChild(estilo);
  document.body.appendChild(raiz);
  return { titulo };
}

export function imprimirReporte(partes) {
  const { titulo } = montarReporteParaImprimir(partes);
  const tituloAnterior = document.title;
  document.title = titulo; // el navegador lo usa como nombre sugerido del PDF
  const terminar = () => { document.title = tituloAnterior; limpiarReporteImpreso(); window.removeEventListener('afterprint', terminar); };
  window.addEventListener('afterprint', terminar);
  // Dos frames para que el navegador termine el layout antes de abrir el diálogo.
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}
