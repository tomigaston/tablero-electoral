// Piezas visuales compartidas del Planificador. Estilos inline + tokens CSS del tablero
// (var(--text-primary) etc.); sin colores nuevos: categorías y semáforo vienen de lib/planificador/config.
import React from 'react';
import { COLOR_PRIORIDAD, LABEL_PRIORIDAD } from '../../lib/planificador/config';
import { colorDeCategoria } from '../../lib/planificador';
import { fmtPuntos, fmtDeltaPP } from '../../lib/planificador/base';

export const ChipCategoria = ({ categoria, tamano = 11 }) => {
  const c = colorDeCategoria(categoria);
  return (
    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '6px', backgroundColor: `${c.bg}22`, color: c.text, fontSize: `${tamano}px`, fontWeight: 600, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
      {categoria || 'SIN CATEGORÍA'}
    </span>
  );
};

// Punto del semáforo: azul no medido · rojo tendencia negativa · amarillo estable/leve baja · verde mejora.
export const PuntoPrioridad = ({ nivel, tamano = 12 }) => (
  <span title={LABEL_PRIORIDAD[nivel] || ''} style={{ display: 'inline-block', width: tamano, height: tamano, borderRadius: '50%', backgroundColor: COLOR_PRIORIDAD[nivel] || '#9E9E9E', flexShrink: 0 }} />
);

// Verde / ámbar / rojo de texto ya presentes en el tablero (categorías + IconoTendencia).
const COLOR_TEND = { mejora: '#2E7D32', estable: '#F57F17', empeora: '#C62828', neutro: '#757575' };

// Flecha + número. Nada de gráficos en la tabla.
export const Tendencia = ({ t, grande = false }) => {
  const fs = grande ? 20 : 13;
  if (t.estado === 'sin_medir') return <span style={{ color: COLOR_TEND.neutro, fontSize: fs, fontStyle: 'italic' }}>sin medir</span>;
  if (t.estado === 'sin_tendencia') return <span style={{ color: COLOR_TEND.neutro, fontSize: fs }}>sin tendencia</span>;
  const flecha = t.estado === 'mejora' ? '↑' : t.estado === 'empeora' ? '↓' : '→';
  const texto = t.estado === 'estable' ? 'estable' : fmtDeltaPP(t.delta);
  return (
    <span style={{ color: COLOR_TEND[t.estado], fontSize: fs, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {flecha} {texto}
    </span>
  );
};

export const Boton = ({ children, onClick, primario, activo, disabled, titulo, style }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={titulo}
    style={{
      padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
      border: primario ? '1px solid #1976D2' : '1px solid var(--border)',
      backgroundColor: primario ? '#1976D2' : activo ? '#1976D222' : 'var(--bg-primary)',
      color: primario ? '#fff' : activo ? '#1565C0' : 'var(--text-primary)',
      ...style,
    }}
  >
    {children}
  </button>
);

export { fmtPuntos };
