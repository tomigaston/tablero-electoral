// Listado rápido de circuitos para imprimir / PDF: solo el encabezado de cada ficha (circuito, situación, categoría, padrón y
// resultados de referencia), una fila por circuito. Es lo que descarga el Resumen filtrado con la opción "Listado rápido".
import React from 'react';
import { LABEL_PRIORIDAD, COLOR_PRIORIDAD } from '../../lib/planificador/config';
import { formatPct } from '../../lib/planificador/base';
import { CabeceraImpresion, PieImpresion } from './Marca';

const celda = { padding: '7px 8px', verticalAlign: 'top', borderBottom: '1px solid #E4E8EE' };
const cab = { padding: '8px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: '#5B6772' };

export default function ListadoCircuitos({ filas, etiqueta }) {
  const hoy = new Date().toLocaleDateString('es-AR');
  const orden = [...filas].sort((a, b) => a.key.localeCompare(b.key, 'es', { numeric: true }));
  return (
    <div className="plan-listado-circuitos">
      <CabeceraImpresion titulo="Listado de circuitos" subtitulo="Planificador territorial · Córdoba Capital"
        detalle={<><div>Generado el {hoy}</div><div>{orden.length} {orden.length === 1 ? 'circuito' : 'circuitos'}{etiqueta ? ` · ${etiqueta}` : ''}</div></>} />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: '#F2F5F9' }}>
            <th style={cab}>Circuito</th>
            <th style={cab}>Situación</th>
            <th style={cab}>Categoría</th>
            <th style={{ ...cab, textAlign: 'right' }}>Padrón</th>
            <th style={{ ...cab, textAlign: 'right' }}>Llaryora Int. 2019</th>
            <th style={{ ...cab, textAlign: 'right' }}>Meta Gob. 2023</th>
          </tr>
        </thead>
        <tbody>
          {orden.map((f) => {
            const c = COLOR_PRIORIDAD[f.prioridad.nivel] || '#9E9E9E';
            return (
              <tr key={f.key} style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                <td style={{ ...celda, borderLeft: `5px solid ${c}` }}>
                  <div style={{ fontWeight: 800 }}>{f.key}</div>
                  <div style={{ color: '#5B6772', fontSize: 11.5 }}>{f.nombre}</div>
                </td>
                <td style={celda}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />
                    {LABEL_PRIORIDAD[f.prioridad.nivel] || ''}
                  </span>
                  {f.prioridad.porque && <div style={{ color: '#5B6772', fontSize: 11 }}>{f.prioridad.porque}</div>}
                </td>
                <td style={celda}>{f.categoria || '—'}</td>
                <td style={{ ...celda, textAlign: 'right' }}>{f.padron != null ? f.padron.toLocaleString('es-AR') : '—'}</td>
                <td style={{ ...celda, textAlign: 'right' }}>{formatPct(f.shareInt19)}</td>
                <td style={{ ...celda, textAlign: 'right', fontWeight: 700 }}>{formatPct(f.shareG23)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <PieImpresion leyenda={`Planificador territorial · Listado de circuitos · generado el ${hoy}`} />
    </div>
  );
}
