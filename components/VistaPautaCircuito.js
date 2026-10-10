import React from 'react';

// Vista "Pauta por circuito" (vistaFicha === 'pautaCircuito'). Todo el estado de filtros
// vive en Home (mismo criterio que VistaObras): navegar a la Ficha de un barrio desmonta
// esta vista, y al volver los filtros/secciones abiertas tienen que seguir como estaban.
export default function VistaPautaCircuito({ onVolver }) {
  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <button onClick={onVolver} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Volver al mapa</button>
      </div>
      <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>Pauta por circuito</h2>
    </div>
  );
}
