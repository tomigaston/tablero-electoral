// Identidad visual del Planificador, según el Manual de marca del Gobierno de la Provincia de Córdoba:
//  · colores institucionales: gris #808080 (negro 50), azul #6CAEE5, rojo #BC1734, dorado #CFA55B
//  · tipografía: Poppins (Bold / Black)
//  · logos: "Córdoba · Gobierno de la Provincia" + marca de cierre "Hacer para crecer" (public/marca-*.png)
export const MARCA = {
  gris: '#808080',
  azul: '#6CAEE5',
  rojo: '#BC1734',
  dorado: '#CFA55B',
  // Variantes más oscuras del azul y del dorado, para texto y botones (el color pleno tiene poco contraste sobre blanco).
  azulOscuro: '#3478B5',
  azulTexto: '#2A6296',
  doradoOscuro: '#B07F2A',
  fondo: '#F5F7FA',
};

export const FUENTE = "'Poppins', 'Segoe UI', system-ui, -apple-system, sans-serif";
export const URL_FUENTE = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap';

export const LOGOS = {
  gobierno: '/marca-cordoba-gobierno.png',
  hacer: '/marca-hacer-para-crecer.png',
  lockup: '/marca-lockup.png',
};

// Franja tricolor de la marca (rojo · dorado · azul), usada como detalle de cabeceras.
export const FRANJA_MARCA = `linear-gradient(90deg, ${MARCA.rojo} 0 33.33%, ${MARCA.dorado} 33.33% 66.66%, ${MARCA.azul} 66.66% 100%)`;
