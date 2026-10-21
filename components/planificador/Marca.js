// Piezas de marca del Planificador: cabecera de pantalla, cabecera y pie de las hojas impresas / PDF.
// Logos y colores según el Manual de marca (ver lib/planificador/marca.js).
import React from 'react';
import { MARCA, LOGOS, FRANJA_MARCA } from '../../lib/planificador/marca';

// Cabecera de las hojas impresas / exportadas a PDF: logos, título, subtítulo y franja tricolor. Solo se ve al imprimir.
export const CabeceraImpresion = ({ titulo, subtitulo, detalle }) => (
  <div className="plan-solo-print" style={{ display: 'none', marginBottom: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
      <img src={LOGOS.gobierno} alt="Córdoba · Gobierno de la Provincia" style={{ height: 40, width: 'auto' }} />
      <img src={LOGOS.hacer} alt="Hacer para crecer" style={{ height: 40, width: 'auto' }} />
    </div>
    <div style={{ height: 4, borderRadius: 2, background: FRANJA_MARCA, margin: '8px 0 10px' }} />
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15, color: '#1F2933' }}>{titulo}</div>
        {subtitulo && <div style={{ fontSize: 12.5, fontWeight: 500, color: MARCA.gris, marginTop: 2 }}>{subtitulo}</div>}
      </div>
      {detalle && <div style={{ fontSize: 11, color: '#5B6772', textAlign: 'right' }}>{detalle}</div>}
    </div>
  </div>
);

// Pie de las hojas impresas: Gobierno + marca de cierre (como indica el manual) y la leyenda del documento.
export const PieImpresion = ({ leyenda }) => (
  <div className="plan-solo-print" style={{ display: 'none', marginTop: 16, paddingTop: 8, borderTop: `1px solid #E4E8EE`, breakInside: 'avoid' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
      <img src={LOGOS.lockup} alt="Córdoba · Gobierno de la Provincia · Hacer para crecer" style={{ height: 30, width: 'auto' }} />
      <div style={{ fontSize: 10, color: '#8A94A0', textAlign: 'right' }}>{leyenda}</div>
    </div>
  </div>
);

// Cabecera de la pantalla: logo del Gobierno, nombre de la herramienta y marca de cierre, con franja tricolor.
export const CabeceraPantalla = ({ children, derecha }) => (
  <header className="plan-no-print" style={{ background: '#fff', borderRadius: 18, boxShadow: '0 2px 14px rgba(16,24,40,0.07)', overflow: 'hidden', marginBottom: 16 }}>
    <div style={{ height: 4, background: FRANJA_MARCA }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', padding: '12px 22px' }}>
      <img src={LOGOS.gobierno} alt="Córdoba · Gobierno de la Provincia" style={{ height: 44, width: 'auto' }} />
      <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: '#E4E8EE' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
        {children}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 'auto' }}>
        {derecha}
        <img src={LOGOS.hacer} alt="Hacer para crecer" style={{ height: 44, width: 'auto' }} />
      </div>
    </div>
  </header>
);

// Pie de la pantalla.
export const PiePantalla = () => (
  <footer className="plan-no-print" style={{ marginTop: 22, padding: '14px 4px 4px', borderTop: '1px solid #E4E8EE', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
    <img src={LOGOS.lockup} alt="Córdoba · Gobierno de la Provincia · Hacer para crecer" style={{ height: 32, width: 'auto', opacity: 0.95 }} />
    <span style={{ fontSize: 11.5, color: '#8A94A0' }}>Planificador territorial · Gobierno de la Provincia de Córdoba</span>
  </footer>
);
