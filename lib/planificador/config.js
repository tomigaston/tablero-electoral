// Configuración editable del Planificador: tiers, paleta, umbrales y mapeos de cobertura.
// Todo lo que el equipo pueda querer ajustar con uso real vive acá, en un solo lugar.

// Umbral de tendencia en puntos porcentuales. Fuente: encuestas_metadata.json →
// umbral_variacion_pp (el valor de acá es el default si el metadata no lo trae).
export const UMBRAL_VARIACION_PP_DEFAULT = 2.5;

// Categoria_v4_Nombre -> tier de "clima electoral" (spec §3.1). Se indexa por NOMBRE,
// no por Categoria_v4_Orden (no es consecutivo y no coincide con el de la spec).
export const TIER_POR_CATEGORIA = {
  'BASTIÓN SÓLIDO': 'favorable',
  'BASTIÓN CON EROSIÓN': 'favorable',
  'TERRITORIO LEAL': 'intermedio',
  'PÉRDIDA 2023': 'desfavorable',
  'EN DISPUTA': 'desfavorable',
  'TERRITORIO HOSTIL': 'adverso',
};

export const TIERS = {
  favorable: { label: 'Favorable', orden: 1 },
  intermedio: { label: 'Intermedio', orden: 2 },
  desfavorable: { label: 'Desfavorable', orden: 3 },
  adverso: { label: 'Adverso', orden: 4 },
};

// Paleta de categorías: COPIA de COLORES_CATEGORIA de pages/index.js (no se inventan
// colores nuevos), re-indexada por Categoria_v4_Nombre.
export const COLOR_CATEGORIA = {
  'BASTIÓN SÓLIDO': { bg: '#2E7D32', text: '#1B5E20' },
  'BASTIÓN CON EROSIÓN': { bg: '#FFCA28', text: '#F57F17' },
  'TERRITORIO LEAL': { bg: '#26A69A', text: '#00695C' },
  'PÉRDIDA 2023': { bg: '#FF7043', text: '#BF360C' },
  'EN DISPUTA': { bg: '#78909C', text: '#37474F' },
  'TERRITORIO HOSTIL': { bg: '#EF5350', text: '#B71C1C' },
};
export const COLOR_CATEGORIA_NEUTRO = { bg: '#9E9E9E', text: '#424242' };

// Descripción de diagnóstico: COPIA de DESCRIPCIONES_CATEGORIA de pages/index.js,
// indexada por nombre.
export const DESCRIPCION_CATEGORIA = {
  'BASTIÓN SÓLIDO': 'Ganó las 4 elecciones analizadas: Gob. 2019, Gob. 2023, Dip. 2021 y Dip. 2025.',
  'BASTIÓN CON EROSIÓN': 'Ganó en Gob. 2019 y Gob. 2023, pero el porcentaje de votos bajó de una elección a la otra.',
  'TERRITORIO LEAL': 'Vota mayoritariamente al oficialismo de forma consistente, aunque no siempre gana.',
  'PÉRDIDA 2023': 'Ganó en Gob. 2019 pero perdió en Gob. 2023.',
  'EN DISPUTA': 'Circuito reñido donde las elecciones se definen por pocos votos. Sin patrón claro.',
  'TERRITORIO HOSTIL': 'Perdió las 4 elecciones analizadas: Gob. 2019, Gob. 2023, Dip. 2021 y Dip. 2025.',
};

// Semáforo de situación (criterio del cliente, ver lib/planificador/prioridad.js):
// azul = no medido, rojo = tendencia negativa, amarillo = estable / leve baja, verde = mejora.
// Rojo, amarillo y verde: los mismos tres colores que COLOR_DIAGNOSTICO_V4 de pages/index.js.
// Colores del Manual de marca: gris #808080 (sin medir), rojo #BC1734 (negativa), dorado #CFA55B (estable); el verde
// de "mejora" no está en la paleta institucional: se usa uno armonizado con ella.
export const COLOR_PRIORIDAD = {
  sin_medir: '#808080',
  negativa: '#BC1734',
  estable: '#CFA55B',
  positiva: '#4FA36B',
};
export const LABEL_PRIORIDAD = {
  sin_medir: 'Sin medir',
  negativa: 'Tendencia negativa',
  estable: 'Estable / leve baja',
  positiva: 'Mejora',
};
// Banda "estable" del semáforo, en puntos porcentuales: más de 3 pp abajo = rojo, más de 3 pp arriba = verde.
export const UMBRAL_SEMAFORO_PP = 3;

export const COLOR_TIPO_EVENTO = {
  medicion: { color: '#2E7D32', letra: 'M', label: 'Medición' },
  visita: { color: '#2A6296', letra: 'V', label: 'Visita' },
  pauta: { color: '#B07F2A', letra: 'P', label: 'Pauta' },
  obra: { color: '#6D4C41', letra: 'O', label: 'Obra lista' },
};

// Cobertura problema (encuesta) -> palanca (spec §4, confirmado con el equipo).
// `pauta`: ejes de pauta que lo cubren. `obras`: tipo_obra que lo cubren.
// `sinPalanca`: no hay ni obra ni pauta que lo atienda -> "descubierto".
export const PALANCAS_POR_PROBLEMA = {
  'Seguridad': { pauta: ['SEGURIDAD'], obras: [] },
  'Estado de las calles': { obras: ['Bacheo', 'Mantenimiento de calles de tierra', 'Red Vial'] },
  'Falta de pavimento': { obras: ['Pavimentación', 'Red Vial'] },
  'Iluminación de las calles': { obras: ['Alumbrado', 'Transmisión/Distribución'] },
  'Iluminación de espacios públicos': { obras: ['Alumbrado', 'Transmisión/Distribución'] },
  'Espacios públicos / plazas': { obras: ['Puesta en Valor'] },
  'Recolección de residuos': { sinPalanca: true },
  'Falta de cloacas': { sinPalanca: true },
  'Falta de agua potable': { sinPalanca: true },
  'Transporte urbano': { sinPalanca: true },
};

// Estados de obra que cuentan como "se está actuando" para cubrir un problema.
export const ESTADOS_OBRA_EN_ACCION = ['Finalizada', 'En ejecución'];
