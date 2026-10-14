// Cuerpo de la sección Encuestas como HTML estático, compartido por el reporte (registro.js) y el PDF de "Exportar
// ficha" (generarFichaPDF). Las dos superficies (y la pantalla) dibujan el MISMO <EncuestasBlock>; las reglas viven
// en lib/encuestasBloque.js. Acá solo se decide qué rondas entran:
//   opciones = { fechas?: string[] }  → rondas elegidas (ISO). Siempre máx. 3, las más recientes, de la más vieja a la más nueva.

import { EncuestasBlock } from '../EncuestasBlock';

/** Devuelve un array de fragmentos HTML (hoy, uno: el bloque). T.md renderiza JSX a HTML estático. */
export function htmlEncuestasCuerpo({ rondas, opciones, T }) {
  return [T.md(<EncuestasBlock rondas={rondas} fechas={opciones?.fechas} />)];
}
