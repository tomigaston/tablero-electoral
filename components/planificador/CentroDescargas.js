// Ventana "Centro de descargas" del Planificador: se elige qué se exporta (alcance, formato y contenido) y se genera el PDF.
// La usan la ficha de un circuito (ficha resumen o completa) y el Resumen filtrado (fichas de todos los circuitos del filtro).
import React, { useEffect } from 'react';

const AZUL = '#2A6296';

const Etiqueta = ({ children }) => (
  <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '20px 0 8px' }}>{children}</div>
);

const Segmentos = ({ opciones, valor, onCambiar, nombre }) => (
  <div role="radiogroup" aria-label={nombre} style={{ display: 'inline-flex', flexWrap: 'wrap', border: '1px solid #D5DBE3', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
    {opciones.map((o) => {
      const activa = o.id === valor;
      return (
        <button key={o.id} role="radio" aria-checked={activa} onClick={() => onCambiar && onCambiar(o.id)} disabled={!onCambiar}
          style={{ padding: '11px 22px', border: 'none', cursor: onCambiar ? 'pointer' : 'default', fontSize: 15, fontWeight: 700, background: activa ? AZUL : '#fff', color: activa ? '#fff' : '#1F2933' }}>
          {o.etiqueta}
        </button>
      );
    })}
  </div>
);

/**
 * @param {string} subtitulo texto bajo el título
 * @param {string} alcance lo que se va a exportar ("Circuito 7B · ALTA CORDOBA", "12 circuitos · Clima: Adverso")
 * @param {{id: string, etiqueta: string, descripcion: string}[]} opciones tipos de contenido
 * @param {string} valor id elegido
 * @param {(id: string) => void} onCambiar
 * @param {string} [aviso] texto de advertencia (p. ej. muchas fichas)
 * @param {() => void} onGenerar
 * @param {() => void} onCerrar
 */
export default function CentroDescargas({ subtitulo, alcance, opciones, valor, onCambiar, aviso, onGenerar, onCerrar }) {
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);
  const elegida = opciones.find((o) => o.id === valor);
  return (
    <div className="plan-no-print" onClick={onCerrar}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(16,24,40,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="Centro de descargas" onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 22, width: 'min(560px, 100%)', maxHeight: '92vh', overflowY: 'auto', padding: '26px 28px 24px', boxShadow: '0 20px 60px rgba(16,24,40,0.35)', color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>Centro de descargas</h2>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 24, lineHeight: 1, color: 'var(--text-secondary)' }}>✕</button>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>{subtitulo}</p>

        <div style={{ marginTop: 18, padding: '14px 18px', borderRadius: 14, background: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Alcance</div>
          <div style={{ fontSize: 16, marginTop: 3 }}>{alcance}</div>
        </div>

        <Etiqueta>Formato</Etiqueta>
        <Segmentos nombre="Formato" opciones={[{ id: 'pdf', etiqueta: 'PDF' }]} valor="pdf" />

        <Etiqueta>Contenido</Etiqueta>
        <Segmentos nombre="Contenido" opciones={opciones} valor={valor} onCambiar={onCambiar} />
        {elegida?.descripcion && <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.45 }}>{elegida.descripcion}</p>}

        {aviso && <p style={{ fontSize: 13, color: '#B07F2A', marginTop: 12 }}>{aviso}</p>}
        <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 14 }}>Se abre el diálogo de impresión: elegí “Guardar como PDF” como destino.</p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button onClick={onCerrar} style={{ padding: '12px 26px', borderRadius: 14, border: '1px solid #D5DBE3', background: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', color: 'var(--text-primary)' }}>Cancelar</button>
          <button onClick={onGenerar} style={{ padding: '12px 26px', borderRadius: 14, border: `1px solid ${AZUL}`, background: AZUL, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Generar PDF</button>
        </div>
      </div>
    </div>
  );
}

// Contenido de una ficha de circuito.
export const OPCIONES_FICHA = [
  { id: 'resumen', etiqueta: 'Ficha resumen', descripcion: 'Encuesta, problemas y su cobertura, qué se hizo (línea de tiempo por mes), lectura y decisión con su seguimiento.' },
  { id: 'completa', etiqueta: 'Ficha completa', descripcion: 'Todo lo anterior más un anexo al final con el detalle de lo que se hizo: pautas, visitas, encuestas y obras, mes por mes.' },
];

// Contenido de las fichas de varios circuitos (las del filtro del Resumen).
export const OPCIONES_FICHAS_LOTE = [
  { id: 'resumen', etiqueta: 'Fichas resumen', descripcion: 'Una ficha resumen por circuito, una detrás de otra, en un solo PDF.' },
  { id: 'completa', etiqueta: 'Fichas completas', descripcion: 'Una ficha completa por circuito (con el anexo del detalle de lo que se hizo), en un solo PDF.' },
];