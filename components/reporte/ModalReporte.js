import { useState, useEffect, useMemo } from 'react';
import { GRUPOS_REPORTE } from './registro';
import { SelectorRondas, fechasPorDefecto } from '../EncuestasBlock';

// Modal "Generar reporte". Muestra las secciones del registro agrupadas, deshabilita (con
// motivo) las que no aplican al territorio actual, y arma la selección + opciones de
// Encuestas. El orden del PDF lo decide el registro, no el orden de tildado.
const CLAVE_STORAGE = 'tablero.reporte.v2';
const OPC_IV_DEFAULT = { modo: 'ronda' };

const estiloLink = { background: 'none', border: 'none', color: '#1976D2', cursor: 'pointer', padding: 0, fontSize: '12px' };
const estiloSelect = { padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', backgroundColor: '#fff', maxWidth: '100%' };

export default function ModalReporte({ isOpen, ctx, registro, tituloContexto, rondas, rondasIV = [], formatearFecha, useFocusTrap, onGenerar, onCancelar }) {
  const overlayRef = useFocusTrap(isOpen);
  const disponibilidad = useMemo(() => Object.fromEntries(registro.map(s => [s.id, s.disponible(ctx)])), [registro, ctx]);
  const idsDisponibles = useMemo(() => registro.filter(s => disponibilidad[s.id].ok).map(s => s.id), [registro, disponibilidad]);
  // Clave estable del territorio: el efecto de restauración corre al abrir o al cambiar de
  // territorio, no en cada render (ctx se reconstruye con los datos del tablero).
  const claveCtx = `${ctx.tipo}|${ctx.datosCircuito?.CircuitoKey || ''}|${ctx.nombreBarrio || ''}`;
  const [ids, setIds] = useState(() => new Set());
  const [enc, setEnc] = useState({ fechas: [] }); // rondas de Encuestas a mostrar (ISO, máx. 3)
  // Intención de voto — Gobernador: modo (una ronda / comparativo), rondas elegidas (índices dentro de las rondas con
  // escenarios) y escenarios destildados.
  const [iv, setIv] = useState({ ...OPC_IV_DEFAULT, rondaIdx: 0, a: 0, b: 1, excluidos: [] });
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState(null);

  // Al abrir: restaurar la última selección (con try/catch: localStorage puede no estar disponible).
  useEffect(() => {
    if (!isOpen) return;
    setGenerando(false); setError(null);
    let guardado = null;
    try { guardado = JSON.parse(localStorage.getItem(CLAVE_STORAGE) || 'null'); } catch (e) { /* sin storage */ }
    const base = Array.isArray(guardado?.ids) ? guardado.ids.filter(id => idsDisponibles.includes(id)) : idsDisponibles;
    setIds(new Set(base.length || !guardado ? base : idsDisponibles));
    const g = guardado?.enc || {}; // (se conserva tal cual para la restauración de Intención de voto)
    setEnc({ fechas: fechasPorDefecto(rondas) });
    const m = rondasIV.length;
    setIv({ modo: g.iv?.modo === 'comparativo' && m >= 2 ? 'comparativo' : 'ronda', rondaIdx: Math.max(m - 1, 0), a: Math.max(m - 2, 0), b: Math.max(m - 1, 0), excluidos: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, claveCtx]);

  const seleccionOrdenada = registro.filter(s => ids.has(s.id) && disponibilidad[s.id].ok);
  const idsEscenariosIV = (() => {
    if (!rondasIV.length) return [];
    if (iv.modo === 'comparativo' && rondasIV.length >= 2) {
      const A = rondasIV[Math.min(iv.a, rondasIV.length - 1)], B = rondasIV[Math.min(iv.b, rondasIV.length - 1)];
      return B.escenarios.filter(e => A.escenarios.some(x => x.id === e.id)).map(e => e.id);
    }
    return rondasIV[Math.min(iv.rondaIdx, rondasIV.length - 1)].escenarios.map(e => e.id);
  })();
  const escenariosElegidosIV = idsEscenariosIV.filter(id => !iv.excluidos.includes(id));
  const opcionesIV = { modo: iv.modo, rondaIdx: iv.rondaIdx, a: iv.a, b: iv.b, escenarios: escenariosElegidosIV };
  const opciones = { encuestas: enc, intencion: opcionesIV };
  const paginas = Math.max(1, Math.ceil(seleccionOrdenada.reduce((acc, s) => acc + (s.paginas ? s.paginas(ctx, opciones) : 1), 0)));

  if (!isOpen) return null;
  const toggle = (id) => setIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const descargar = async () => {
    if (seleccionOrdenada.length === 0) return;
    try { localStorage.setItem(CLAVE_STORAGE, JSON.stringify({ ids: seleccionOrdenada.map(s => s.id), iv: { modo: iv.modo } })); } catch (e) { /* ignorar */ }
    setGenerando(true); setError(null);
    try {
      await onGenerar({ ids: seleccionOrdenada.map(s => s.id), opciones: { encuestas: { fechas: enc.fechas }, intencion: opcionesIV } });
    } catch (e) {
      setError('No se pudo generar el reporte. Probá de nuevo o desactivá alguna sección.');
      console.error('Reporte:', e);
    } finally { setGenerando(false); }
  };


  const subOpcionesEncuestas = (
    <div style={{ margin: '4px 14px 12px 38px', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <SelectorRondas rondas={rondas} seleccion={enc.fechas} onChange={(fechas) => setEnc({ fechas })} />
      {rondas.length < 2 && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Este territorio tiene una sola ronda: se muestra sin comparación.</div>}
    </div>
  );

  const optRondaIV = (r, i) => <option key={r.fecha} value={i}>{formatearFecha(r.fecha)}</option>;
  const toggleEscIV = (id) => setIv(prev => {
    const quedan = idsEscenariosIV.filter(x => !prev.excluidos.includes(x));
    if (!prev.excluidos.includes(id) && quedan.length <= 1) return prev; // siempre queda al menos un escenario
    return { ...prev, excluidos: prev.excluidos.includes(id) ? prev.excluidos.filter(x => x !== id) : [...prev.excluidos, id] };
  });
  const nombreEscIV = (id) => {
    const r = iv.modo === 'comparativo' && rondasIV.length >= 2 ? rondasIV[Math.min(iv.b, rondasIV.length - 1)] : rondasIV[Math.min(iv.rondaIdx, Math.max(rondasIV.length - 1, 0))];
    const e = r?.escenarios.find(x => x.id === id);
    return e ? `Escenario ${e.orden} · ${e.nombre}` : id;
  };
  const subOpcionesIV = (
    <div style={{ margin: '4px 14px 12px 38px', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
          <input type="radio" name="modoIV" checked={iv.modo === 'ronda'} onChange={() => setIv(p => ({ ...p, modo: 'ronda', excluidos: [] }))} /> Una ronda
        </label>
        {iv.modo === 'ronda' && (
          <div style={{ marginLeft: '24px', marginTop: '6px' }}>
            <select value={iv.rondaIdx} onChange={(e) => setIv(p => ({ ...p, rondaIdx: Number(e.target.value), excluidos: [] }))} style={estiloSelect} aria-label="Ronda de intención de voto">{rondasIV.map(optRondaIV)}</select>
          </div>
        )}
      </div>
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: rondasIV.length >= 2 ? 'pointer' : 'not-allowed', color: rondasIV.length >= 2 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
          <input type="radio" name="modoIV" disabled={rondasIV.length < 2} checked={iv.modo === 'comparativo'} onChange={() => setIv(p => ({ ...p, modo: 'comparativo', excluidos: [] }))} /> Comparativo entre rondas
        </label>
        {rondasIV.length < 2 && <div style={{ marginLeft: '24px', fontSize: '11px', color: 'var(--text-tertiary)' }}>La intención de voto se relevó en una sola ronda: no hay con qué comparar.</div>}
        {iv.modo === 'comparativo' && (
          <div style={{ marginLeft: '24px', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px' }}>
            <select value={iv.a} onChange={(e) => { const a = Number(e.target.value); setIv(p => ({ ...p, a, b: p.b > a ? p.b : Math.min(a + 1, rondasIV.length - 1), excluidos: [] })); }} style={estiloSelect} aria-label="Ronda A de intención de voto">{rondasIV.slice(0, -1).map(optRondaIV)}</select>
            <span>vs</span>
            <select value={iv.b} onChange={(e) => setIv(p => ({ ...p, b: Number(e.target.value), excluidos: [] }))} style={estiloSelect} aria-label="Ronda B de intención de voto">{rondasIV.map((r, i) => i > iv.a ? optRondaIV(r, i) : null)}</select>
          </div>
        )}
      </div>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Escenarios a incluir</div>
        {iv.modo === 'comparativo' && rondasIV.length >= 2 && (() => { const B = rondasIV[Math.min(iv.b, rondasIV.length - 1)]; const solo = B.escenarios.length - idsEscenariosIV.length; return solo > 0 ? <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>{solo} {solo === 1 ? 'escenario de la ronda nueva no está' : 'escenarios de la ronda nueva no están'} en la otra ronda y no se pueden comparar.</div> : null; })()}
        {idsEscenariosIV.length === 0
          ? <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Ningún escenario está en las dos rondas elegidas: no se puede comparar.</div>
          : idsEscenariosIV.map(id => (
            <label key={id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', cursor: 'pointer', padding: '2px 0' }}>
              <input type="checkbox" style={{ marginTop: '2px' }} checked={!iv.excluidos.includes(id)} onChange={() => toggleEscIV(id)} />
              <span>{nombreEscIV(id)}</span>
            </label>
          ))}
      </div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={onCancelar}>
      <div ref={overlayRef} tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '22px 24px', maxWidth: '620px', width: '100%', maxHeight: '90vh', overflow: 'hidden', margin: '12px', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>Generar reporte</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Reporte para: <strong style={{ color: 'var(--text-primary)' }}>{tituloContexto}</strong></p>

        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '8px' }}>
          <button onClick={() => setIds(new Set(idsDisponibles))} style={estiloLink}>Seleccionar todo</button>
          <button onClick={() => setIds(new Set())} style={estiloLink}>Ninguno</button>
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-secondary)' }}>{seleccionOrdenada.length} {seleccionOrdenada.length === 1 ? 'sección seleccionada' : 'secciones seleccionadas'}</span>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {GRUPOS_REPORTE.map(grupo => {
            const items = registro.filter(s => s.grupo === grupo);
            if (!items.length) return null;
            return (
              <div key={grupo}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>{grupo}</div>
                <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                  {items.map((s, i) => {
                    const disp = disponibilidad[s.id];
                    const marcado = ids.has(s.id) && disp.ok;
                    return (
                      <div key={s.id} data-seccion={s.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', backgroundColor: disp.ok ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px', fontSize: '14px', cursor: disp.ok ? 'pointer' : 'not-allowed' }}>
                          <input type="checkbox" style={{ marginTop: '3px' }} checked={marcado} disabled={!disp.ok} onChange={() => toggle(s.id)} />
                          <span style={{ flex: 1, color: disp.ok ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                            {s.label}
                            <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-tertiary)' }}>{disp.ok ? s.descripcion : disp.motivo}</span>
                          </span>
                        </label>
                        {s.tieneOpciones && marcado && ctx.tipo !== 'capital' && subOpcionesEncuestas}
                        {s.tieneOpcionesIV && marcado && ctx.tipo !== 'capital' && subOpcionesIV}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {seleccionOrdenada.length > 0 && (
          <div style={{ marginTop: '14px', padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Vista previa · ≈ {paginas} {paginas === 1 ? 'página' : 'páginas'} A4</div>
            <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {seleccionOrdenada.map(s => <li key={s.id}>{s.label}</li>)}
            </ol>
          </div>
        )}

        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '10px' }}>Formato A4 vertical. Se abre la ventana de impresión: elegí “Guardar como PDF”. Los mapas no se incluyen en esta versión. Las secciones salen en el orden de esta lista, no en el que las tildes.</p>
        {error && <p role="alert" style={{ fontSize: '12px', color: '#C62828', marginTop: '6px' }}>{error}</p>}
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={onCancelar} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '13px', cursor: 'pointer', color: 'var(--text-secondary)' }}>Cancelar</button>
          <button onClick={descargar} disabled={seleccionOrdenada.length === 0 || generando} style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', backgroundColor: seleccionOrdenada.length === 0 || generando ? '#B0BEC5' : '#1976D2', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: seleccionOrdenada.length === 0 || generando ? 'not-allowed' : 'pointer' }}>{generando ? 'Generando…' : '📄 Descargar PDF'}</button>
        </div>
      </div>
    </div>
  );
}
