// /planificador — Planificador Estratégico Territorial (piloto, rama feature/planificador).
// Vista nueva y separada: NO modifica pages/index.js ni ninguna ruta existente.
// Lógica en lib/planificador/, componentes en components/planificador/. Ver docs/planificador.md.
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Head from 'next/head';
import { enriquecerObrasConCircuito, construirIndiceBarrioCircuito, construirIndiceMapkeyNombre } from '../lib/obrasCercanas';
import { construirPlanificador, calcularKpis } from '../lib/planificador';
import { parsearParte } from '../lib/parteObras';
import VistaPlanificador from '../components/planificador/VistaPlanificador';
import FichaEstrategica from '../components/planificador/FichaEstrategica';
import { Boton } from '../components/planificador/ui';

const ARCHIVOS = {
  datos: 'circuitos_completo.json',
  encuestasData: 'encuestas_circuitos.json',
  encuestasMetadata: 'encuestas_metadata.json',
  recorridosData: 'recorridos_barrios.json',
  cruceData: 'circuito_barrios_cruce.json',
  pautasBarriosData: 'pautas_barrios.json',
  barriosGeoData: 'barrios_geo.json',
  obrasData: 'obras_capital.json',
};
const LS_AGENDA = 'planificador.agenda';
const LS_PARTE = 'planificador.parte';

const CSS_IMPRESION = `
@page{size:A4 portrait;margin:12mm}
@media print{
  html,body{background:#fff !important}
  .plan-no-print{display:none !important}
  .plan-solo-print{display:block !important}
  .plan-raiz{padding:0 !important;max-width:none !important}
  .plan-ficha *{background:transparent !important;color:#000 !important;box-shadow:none !important}
  .plan-ficha .plan-seccion{border:1px solid #888 !important;break-inside:avoid;page-break-inside:avoid}
  .plan-ficha svg polyline{stroke:#000 !important}
}
.plan-fila:hover{background:#1976D211}
`;

// Panel del Parte de Obras diario: pegar el texto del día (o leerlo de /data/parte_obras.txt).
function PanelParte({ texto, setTexto, parte, estado }) {
  const [abierto, setAbierto] = useState(false);
  const finalizadas = parte?.items?.filter((i) => /^FINALIZ|^TERMINAD/.test(i.estadoNorm)).length ?? 0;
  return (
    <div style={{ marginBottom: 10, fontSize: 12.5 }}>
      <button onClick={() => setAbierto(!abierto)} style={{ border: 'none', background: 'none', color: '#1565C0', cursor: 'pointer', padding: 0, fontSize: 12.5 }}>
        {abierto ? '▾' : '▸'} Parte de Obras del día {parte?.items?.length ? `(cargado: ${parte.meta.fecha || 's/f'}, ${parte.items.length} ítems, ${finalizadas} finalizadas)` : '(no cargado — las obras salen de obras_capital.json)'}
      </button>
      {abierto && (
        <div style={{ marginTop: 6 }}>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={7} placeholder="Pegá acá el texto de la lista de difusión del día…"
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 8, borderRadius: 6, border: '1px solid var(--border)' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <Boton onClick={() => setTexto('')}>Quitar parte</Boton>
            <span style={{ color: 'var(--text-secondary)' }}>
              Con parte cargado, las obras inaugurables de cada circuito salen de las filas “Finalizadas” del parte; si el parte no trae ninguna para el circuito, se usa obras_capital.json. {estado}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Planificador() {
  const [crudo, setCrudo] = useState(null);
  const [error, setError] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [agenda, setAgenda] = useState(() => new Set());
  const [textoParte, setTextoParte] = useState('');

  // ---- carga de datos (mismos JSON que el tablero, vía /data/) ----
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const entradas = await Promise.all(Object.entries(ARCHIVOS).map(async ([k, f]) => {
          const res = await fetch(`/data/${f}`);
          if (!res.ok) throw new Error(`No se pudo cargar ${f} (${res.status})`);
          return [k, await res.json()];
        }));
        if (vivo) setCrudo(Object.fromEntries(entradas));
      } catch (e) { if (vivo) setError(e.message || String(e)); }
    })();
    return () => { vivo = false; };
  }, []);

  // ---- parte de obras: texto del repo (opcional) o pegado en la vista ----
  useEffect(() => {
    let guardado = null;
    try { guardado = window.localStorage.getItem(LS_PARTE); } catch (e) { /* sin storage */ }
    if (guardado) { setTextoParte(guardado); return; }
    fetch('/data/parte_obras.txt').then((r) => (r.ok ? r.text() : null)).then((t) => { if (t && !/^\s*</.test(t)) setTextoParte(t); }).catch(() => {});
  }, []);
  useEffect(() => {
    try { if (textoParte) window.localStorage.setItem(LS_PARTE, textoParte); else window.localStorage.removeItem(LS_PARTE); } catch (e) { /* sin storage */ }
  }, [textoParte]);

  // ---- agenda (piloto: marcar/listar, guardado local del navegador) ----
  useEffect(() => {
    try { const g = JSON.parse(window.localStorage.getItem(LS_AGENDA) || '[]'); if (Array.isArray(g)) setAgenda(new Set(g)); } catch (e) { /* ignorar */ }
  }, []);
  const toggleAgenda = useCallback((key) => {
    setAgenda((prev) => {
      const sig = new Set(prev);
      if (sig.has(key)) sig.delete(key); else sig.add(key);
      try { window.localStorage.setItem(LS_AGENDA, JSON.stringify([...sig])); } catch (e) { /* ignorar */ }
      return sig;
    });
  }, []);

  // ---- selección sincronizada con el hash (#14M) para poder compartir / volver con "atrás" ----
  useEffect(() => {
    const leer = () => setSeleccion(window.location.hash.replace(/^#/, '') || null);
    leer();
    window.addEventListener('hashchange', leer);
    return () => window.removeEventListener('hashchange', leer);
  }, []);
  const seleccionar = useCallback((key) => {
    if (key) window.location.hash = key;
    else { window.history.pushState(null, '', window.location.pathname); setSeleccion(null); }
  }, []);

  const parte = useMemo(() => {
    if (!textoParte.trim()) return null;
    try { return parsearParte(textoParte); } catch (e) { return null; }
  }, [textoParte]);

  const { filas, kpis } = useMemo(() => {
    if (!crudo) return { filas: [], kpis: null };
    const indiceBarrio = construirIndiceBarrioCircuito(crudo.cruceData);
    const indiceNombre = construirIndiceMapkeyNombre(crudo.cruceData);
    const obrasEnriquecidas = enriquecerObrasConCircuito(crudo.obrasData, indiceBarrio, indiceNombre);
    const { filas: fs } = construirPlanificador({ ...crudo, obrasEnriquecidas, parte });
    return { filas: fs, kpis: calcularKpis(fs) };
  }, [crudo, parte]);

  const fila = useMemo(() => filas.find((f) => f.key.toLowerCase() === String(seleccion || '').toLowerCase()), [filas, seleccion]);
  const hoyTexto = new Date().toLocaleDateString('es-AR');

  return (
    <>
      <Head>
        <title>Planificador estratégico · Tablero electoral</title>
        <meta name="robots" content="noindex" />
      </Head>
      <style>{CSS_IMPRESION}</style>
      <div className="plan-raiz" style={{ padding: '16px 20px', maxWidth: 1500, margin: '0 auto' }}>
        <div className="plan-no-print" style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Planificador estratégico territorial</h1>
          <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, background: '#FFCA2833', color: '#F57F17', fontWeight: 600 }}>PILOTO</span>
          <a href="/" style={{ marginLeft: 'auto', fontSize: 13, color: '#1565C0' }}>← Tablero</a>
        </div>

        {error && <div style={{ padding: 16, border: '1px solid #C62828', borderRadius: 8, color: '#B71C1C' }}>Error cargando datos: {error}</div>}
        {!error && !crudo && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando datos…</div>}

        {crudo && !fila && (
          <VistaPlanificador
            filas={filas} kpis={kpis} onSelect={seleccionar} agenda={agenda} onToggleAgenda={toggleAgenda} hoyTexto={hoyTexto}
            parteUI={<PanelParte texto={textoParte} setTexto={setTextoParte} parte={parte} estado="" />}
          />
        )}
        {crudo && fila && (
          <FichaEstrategica f={fila} onVolver={() => seleccionar(null)} enAgenda={agenda.has(fila.key)} onToggleAgenda={() => toggleAgenda(fila.key)} />
        )}
        {crudo && seleccion && !fila && (
          <p style={{ marginTop: 12, fontSize: 13 }}>No existe el circuito “{seleccion}”. <button onClick={() => seleccionar(null)} style={{ border: 'none', background: 'none', color: '#1565C0', cursor: 'pointer' }}>Volver a la tabla</button></p>
        )}
      </div>
    </>
  );
}
