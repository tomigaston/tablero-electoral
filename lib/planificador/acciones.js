// Decisiones y seguimiento por circuito: tipos, estados y reductor PURO de operaciones.
// Lo usa el endpoint (servidor) para aplicar cada operación sobre la ficha guardada, y el
// cliente solo para mostrar etiquetas. Cada operación lleva atribución (quién) y marca de tiempo.
// En la UI cada acción es una "recomendación": cualquiera que lee la ficha puede recomendar una acción.

export const TIPOS_ACCION = {
  medir: 'Mandar a medir',
  obras: 'Revisar obras / inaugurar',
  visita: 'Pedir visita (Siciliano / gober)',
  pauta: 'Reforzar o ajustar pauta',
  seguir: 'Seguir de cerca',
  sin_accion: 'Sin acción por ahora',
  otra: 'Otra acción',
};
// Los valores guardados NO cambian (hay datos ya cargados): solo cambian las etiquetas visibles.
export const ESTADOS_ACCION = ['pendiente', 'en_curso', 'hecha'];
export const ETIQUETA_ESTADO = { pendiente: 'Pendiente', en_curso: 'En ejecución', hecha: 'Cumplido' };
export const MAX_TEXTO_ACCION = 300;
export const MAX_NOTAS = 5000;

export const fichaVacia = () => ({ notas: '', acciones: [], actualizado_por: null, actualizado_en: null });

const siguienteEstado = (e) => ESTADOS_ACCION[(ESTADOS_ACCION.indexOf(e) + 1) % ESTADOS_ACCION.length];
export const nuevoIdAccion = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
// El cliente puede mandar el id que ya usó en pantalla (actualización inmediata): se acepta si es válido y no está repetido.
const ID_VALIDO = /^[A-Za-z0-9]{6,40}$/;

export class OperacionInvalida extends Error {}

/**
 * @param {object|null} fichaActual
 * @param {{op: string, [k: string]: any}} operacion
 * @param {string} usuario quien ejecuta
 * @param {string} ahora ISO
 */
export function aplicarOperacion(fichaActual, operacion, usuario, ahora) {
  const ficha = { ...fichaVacia(), ...(fichaActual || {}), acciones: [...(fichaActual?.acciones || [])] };
  switch (operacion?.op) {
    case 'agregarAccion': {
      const tipo = operacion.tipo;
      if (!TIPOS_ACCION[tipo]) throw new OperacionInvalida('Tipo de acción desconocido');
      let texto = String(operacion.texto ?? '').trim().slice(0, MAX_TEXTO_ACCION);
      if (tipo === 'otra' && !texto) throw new OperacionInvalida('La acción libre necesita un texto');
      if (!texto) texto = TIPOS_ACCION[tipo];
      const id = typeof operacion.id === 'string' && ID_VALIDO.test(operacion.id) && !ficha.acciones.some((a) => a.id === operacion.id) ? operacion.id : nuevoIdAccion();
      ficha.acciones.push({ id, tipo, texto, estado: 'pendiente', creada_por: usuario, creada_en: ahora, estado_por: usuario, estado_en: ahora, hecha_por: null, hecha_en: null });
      break;
    }
    case 'cambiarEstado': {
      const i = ficha.acciones.findIndex((a) => a.id === operacion.id);
      if (i < 0) throw new OperacionInvalida('La acción ya no existe');
      const a = ficha.acciones[i];
      const estado = operacion.estado ? operacion.estado : siguienteEstado(a.estado);
      if (!ESTADOS_ACCION.includes(estado)) throw new OperacionInvalida('Estado desconocido');
      ficha.acciones[i] = { ...a, estado, estado_por: usuario, estado_en: ahora, hecha_por: estado === 'hecha' ? usuario : null, hecha_en: estado === 'hecha' ? ahora : null };
      break;
    }
    case 'borrarAccion': {
      if (!ficha.acciones.some((a) => a.id === operacion.id)) throw new OperacionInvalida('La acción ya no existe');
      ficha.acciones = ficha.acciones.filter((a) => a.id !== operacion.id);
      break;
    }
    case 'notas': {
      ficha.notas = String(operacion.texto ?? '').slice(0, MAX_NOTAS);
      break;
    }
    default:
      throw new OperacionInvalida('Operación desconocida');
  }
  ficha.actualizado_por = usuario;
  ficha.actualizado_en = ahora;
  return ficha;
}
