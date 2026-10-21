// Bloque 7 de la ficha — "Decisión y seguimiento": cualquiera que lee la ficha puede recomendar una acción
// (menú de opciones + "otra acción" libre); cada recomendación avanza Pendiente → En ejecución → Cumplido,
// con quién la recomendó y cuándo, y quién la cumplió y cuándo. Más las notas libres con autosave.
// Los estados guardados siguen siendo pendiente / en_curso / hecha: solo cambian las etiquetas visibles.
import React, { useEffect, useRef, useState } from 'react';
import { TIPOS_ACCION, ESTADOS_ACCION, ETIQUETA_ESTADO, MAX_NOTAS, MAX_TEXTO_ACCION } from '../../lib/planificador/acciones';

// Pendiente ámbar · En ejecución azul · Cumplido verde.
const COLOR_ESTADO = { pendiente: { bg: '#F59E0B26', fg: '#B45309' }, en_curso: { bg: '#1976D222', fg: '#1565C0' }, hecha: { bg: '#2E7D3222', fg: '#2E7D32' } };
const cuando = (iso) => { try { return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

export default function BloqueDecision({ circuito, ficha, persistencia, onOperacion }) {
  const [otra, setOtra] = useState('');
  const [error, setError] = useState(null);
  const [borrador, setBorrador] = useState(ficha?.notas || '');
  const [estadoNotas, setEstadoNotas] = useState('');
  const timer = useRef(null);
  const pendiente = useRef(null); // { circuito, texto } sin guardar

  // No se bloquea la pantalla mientras se guarda: la operación se ve al instante y se confirma en segundo plano.
  const deshabilitado = !persistencia.disponible;

  const ejecutar = (op, circ = circuito) => {
    setError(null);
    onOperacion(circ, op).catch((e) => setError(e.message));
  };

  // Notas: al cambiar de circuito se vuelcan las pendientes del anterior y se carga el nuevo texto.
  const volcar = async () => {
    clearTimeout(timer.current);
    const p = pendiente.current;
    if (!p) return;
    pendiente.current = null;
    setEstadoNotas('Guardando…');
    try { await onOperacion(p.circuito, { op: 'notas', texto: p.texto }); setEstadoNotas('Guardado'); } catch (e) { setEstadoNotas(''); setError(e.message); }
  };
  useEffect(() => { setBorrador(ficha?.notas || ''); setEstadoNotas(''); setError(null); return () => { volcar(); }; }, [circuito]); // eslint-disable-line react-hooks/exhaustive-deps

  const alEscribir = (texto) => {
    setBorrador(texto.slice(0, MAX_NOTAS));
    pendiente.current = { circuito, texto: texto.slice(0, MAX_NOTAS) };
    setEstadoNotas('Sin guardar…');
    clearTimeout(timer.current);
    timer.current = setTimeout(volcar, 900);
  };

  const acciones = ficha?.acciones || [];
  return (
    <div>
      {!persistencia.disponible && (
        <div className="plan-no-print" style={{ padding: 10, marginBottom: 10, borderRadius: 6, border: '1px solid #F57F17', background: '#FFCA2822', fontSize: 12.5 }}>
          {persistencia.cargando ? 'Cargando recomendaciones…' : `Las recomendaciones y notas no se pueden guardar: ${persistencia.mensaje || 'base de datos no disponible'}.`}
        </div>
      )}

      <div className="plan-no-print">
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>Recomendar una acción</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(TIPOS_ACCION).filter(([k]) => k !== 'otra').map(([k, label]) => (
            <button key={k} disabled={deshabilitado} onClick={() => ejecutar({ op: 'agregarAccion', tipo: k })}
              style={{ padding: '6px 11px', borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg-primary)', fontSize: 12.5, cursor: deshabilitado ? 'default' : 'pointer', opacity: deshabilitado ? 0.5 : 1 }}>+ {label}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (otra.trim()) { ejecutar({ op: 'agregarAccion', tipo: 'otra', texto: otra }); setOtra(''); } }} style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input value={otra} onChange={(e) => setOtra(e.target.value)} maxLength={MAX_TEXTO_ACCION} placeholder="Otra acción…" disabled={deshabilitado}
            style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }} />
          <button type="submit" disabled={deshabilitado || !otra.trim()} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #1976D2', background: '#1976D2', color: '#fff', fontWeight: 600, fontSize: 13, opacity: deshabilitado || !otra.trim() ? 0.5 : 1 }}>Recomendar</button>
        </form>
      </div>

      {error && <div style={{ marginTop: 8, fontSize: 12.5, color: '#B71C1C' }}>{error}</div>}

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>Acciones recomendadas{acciones.length ? ` (${acciones.length})` : ''}</div>
        {acciones.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Todavía no se recomendó ninguna acción para este circuito.</div> : acciones.map((a) => {
          const c = COLOR_ESTADO[a.estado] || COLOR_ESTADO.pendiente;
          return (
            <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              {/* Desplegable de estado: se puede pasar directo a cualquiera (también volver atrás). */}
              <select className="plan-boton-estado" value={a.estado} disabled={deshabilitado} aria-label="Estado de la recomendación" title="Cambiar el estado"
                onChange={(e) => ejecutar({ op: 'cambiarEstado', id: a.id, estado: e.target.value })}
                style={{ flexShrink: 0, minWidth: 118, padding: '4px 6px', borderRadius: 12, border: `1px solid ${c.fg}55`, background: c.bg, color: c.fg, fontWeight: 700, fontSize: 12, cursor: deshabilitado ? 'default' : 'pointer' }}>
                {ESTADOS_ACCION.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO[e]}</option>)}
              </select>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, textDecoration: a.estado === 'hecha' ? 'line-through' : 'none', color: a.estado === 'hecha' ? 'var(--text-secondary)' : 'inherit' }}>{a.texto}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Recomendada por {a.creada_por} · {cuando(a.creada_en)}
                  {a.estado === 'en_curso' && ` · En ejecución desde ${cuando(a.estado_en)} (${a.estado_por})`}
                  {a.estado === 'hecha' && ` · Cumplida por ${a.hecha_por || a.estado_por} · ${cuando(a.hecha_en || a.estado_en)}`}
                </div>
              </div>
              <button className="plan-no-print" disabled={deshabilitado} onClick={() => { if (window.confirm('¿Borrar esta recomendación?')) ejecutar({ op: 'borrarAccion', id: a.id }); }} title="Borrar" aria-label="Borrar recomendación"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 15 }}>✕</button>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
          <span>Notas del circuito</span>
          <span className="plan-no-print">{estadoNotas || (ficha?.actualizado_por && ficha?.notas ? `Última edición: ${ficha.actualizado_por} · ${cuando(ficha.actualizado_en)}` : '')}</span>
        </div>
        <textarea className="plan-no-print" value={borrador} onChange={(e) => alEscribir(e.target.value)} disabled={!persistencia.disponible} rows={4} placeholder="Escribí tus notas… se guardan solas."
          style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 13.5, resize: 'vertical' }} />
        <div className="plan-solo-print" style={{ display: 'none', whiteSpace: 'pre-wrap', fontSize: 12 }}>{borrador || 'Sin notas.'}</div>
      </div>
    </div>
  );
}
