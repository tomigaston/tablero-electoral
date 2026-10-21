// /planificador — Planificador territorial (piloto, rama feature/planificador).
// Dos hojas: Resumen (foto general navegable) y Circuitos (lista + ficha con decisión y seguimiento).
// Vista nueva y separada: NO modifica pages/index.js ni ninguna ruta existente.
// Lógica en lib/planificador/, componentes en components/planificador/. Ver docs/planificador.md.
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import { enriquecerObrasConCircuito, construirIndiceBarrioCircuito, construirIndiceMapkeyNombre } from '../lib/obrasCercanas';
import { construirPlanificador } from '../lib/planificador';
import { calcularAgregados } from '../lib/planificador/agregados';
import { FILTRO_VACIO } from '../lib/planificador/filtros';
import { cargarFichas, enviarOperacion } from '../lib/planificador/fichasApi';
import { aplicarOperacion, nuevoIdAccion } from '../lib/planificador/acciones';
import { parsearParte } from '../lib/parteObras';
import HojaResumen from '../components/planificador/HojaResumen';
import HojaCircuitos from '../components/planificador/HojaCircuitos';
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
const LS_PARTE = 'planificador.parte';
const REFRESCO_FICHAS_MS = 60000;

const CSS = `
@page{size:A4 portrait;margin:12mm}
.plan-fila:hover{background:#1976D211 !important}
.plan-solo-movil{display:none}
@media (max-width:900px){
  .plan-circuitos{grid-template-columns:1fr !important}
  .plan-lista{position:static !important}
  .plan-lista-con-ficha{display:none}
  .plan-solo-movil{display:inline}
  .plan-grilla-resumen{grid-template-columns:1fr !important}
  .plan-mapa-col{position:static !important}
}
@media print{
  html,body{background:#fff !important}
  .plan-no-print{display:none !important}
  .plan-solo-print{display:block !important}
  .plan-raiz{padding:0 !important;max-width:none !important}
  .plan-circuitos{display:block !important}
  .plan-lista{display:none !important}
  .plan-raiz *{box-shadow:none !important}
  /* La impresión conserva el diseño del tablero: colores, barras, chips y tarjetas (antes se borraban los fondos).
     Se fuerzan los colores del tema claro para que salga igual aunque se imprima desde modo oscuro. */
  .plan-raiz{--bg-primary:#fff;--bg-secondary:#f3f5f8;--text-primary:#111;--text-secondary:#444;--text-tertiary:#666;--border:#d5dae1}
  .plan-raiz,.plan-raiz *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  .plan-raiz .plan-seccion{break-inside:avoid;page-break-inside:avoid}
  .plan-linea-tiempo,.plan-encuesta-fila{overflow:visible !important;flex-wrap:wrap !important}
  .plan-lista-scroll{max-height:none !important;overflow:visible !important}
  .plan-grilla-resumen{display:block !important}
  .plan-grilla-resumen > div{margin-bottom:10px}
  .plan-grilla-resumen .plan-seccion{margin-bottom:10px}
}
`;

// "#/circuitos/14M" · "#/resumen" · (compatibilidad con el piloto anterior) "#14M"
function leerHash() {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  if (a === 'resumen') return { hoja: 'resumen', seleccion: null };
  if (a === 'circuitos') return { hoja: 'circuitos', seleccion: b || null };
  if (a) return { hoja: 'circuitos', seleccion: a };
  return { hoja: 'resumen', seleccion: null };
}

function PanelParte({ texto, setTexto, parte }) {
  const [abierto, setAbierto] = useState(false);
  const fin = parte?.items?.filter((i) => /^FINALIZ|^TERMINAD/.test(i.estadoNorm)).length ?? 0;
  return (
    <div className="plan-no-print" style={{ marginTop: 10, fontSize: 12.5 }}>
      <button onClick={() => setAbierto(!abierto)} style={{ border: 'none', background: 'none', color: '#1565C0', cursor: 'pointer', padding: 0, fontSize: 12.5 }}>
        {abierto ? '▾' : '▸'} Parte de Obras del día {parte?.items?.length ? `(cargado: ${parte.meta.fecha || 's/f'} · ${parte.items.length} ítems · ${fin} finalizadas)` : '(no cargado: las obras salen de obras_capital.json)'}
      </button>
      {abierto && (
        <div style={{ marginTop: 6 }}>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={7} placeholder="Pegá acá el texto de la lista de difusión del día…"
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 8, borderRadius: 6, border: '1px solid var(--border)' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
            <Boton onClick={() => setTexto('')}>Quitar parte</Boton>
            <span style={{ color: 'var(--text-secondary)' }}>Con parte cargado, las obras listas de cada circuito se marcan “confirmada por el parte” cuando el parte las trae como finalizadas. Se guarda solo en este navegador.</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Planificador() {
  const [crudo, setCrudo] = useState(null);
  const [error, setError] = useState(null);
  const [nav, setNav] = useState({ hoja: 'resumen', seleccion: null });
  const [filtro, setFiltro] = useState(FILTRO_VACIO);
  const [filtrosResumen, setFiltrosResumen] = useState([]); // filtros del Resumen: se conservan al ir y volver de Circuitos
  const [textoParte, setTextoParte] = useState('');
  const [fichas, setFichas] = useState({});
  const [persistencia, setPersistencia] = useState({ disponible: false, cargando: true, mensaje: null, usuario: null });
  const fichasRef = useRef({}); // última versión de las fichas (incluye lo aplicado en pantalla y aún sin confirmar)
  const usuarioRef = useRef('local');
  const colasRef = useRef({}); // cola de operaciones por circuito
  const pendientesRef = useRef(0); // operaciones enviadas y todavía sin confirmar

  // ---- datos del tablero (mismos JSON, vía /data/) ----
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

  // ---- parte de obras: texto en el repo (opcional) o pegado en la vista ----
  useEffect(() => {
    let guardado = null;
    try { guardado = window.localStorage.getItem(LS_PARTE); } catch (e) { /* sin storage */ }
    if (guardado) { setTextoParte(guardado); return; }
    fetch('/data/parte_obras.txt').then((r) => (r.ok ? r.text() : null)).then((t) => { if (t && !/^\s*</.test(t)) setTextoParte(t); }).catch(() => {});
  }, []);
  useEffect(() => {
    try { if (textoParte) window.localStorage.setItem(LS_PARTE, textoParte); else window.localStorage.removeItem(LS_PARTE); } catch (e) { /* sin storage */ }
  }, [textoParte]);

  // ---- fichas compartidas (notas, decisiones, seguimiento): base de datos real ----
  const refrescarFichas = useCallback(async () => {
    try {
      const r = await cargarFichas();
      usuarioRef.current = r.usuario || 'local';
      // Con operaciones en vuelo no se pisa lo que se ve en pantalla: la próxima lectura lo reconcilia.
      if (pendientesRef.current === 0) { fichasRef.current = r.fichas || {}; setFichas(fichasRef.current); }
      setPersistencia({ disponible: true, cargando: false, mensaje: null, usuario: r.usuario, modo: r.modo });
    } catch (e) {
      setPersistencia((p) => ({ ...p, disponible: false, cargando: false, mensaje: e.codigo === 'sin_base' ? 'falta configurar la base de datos (PLANIFICADOR_SHEETS_URL / PLANIFICADOR_SHEETS_TOKEN)' : e.message }));
    }
  }, []);
  useEffect(() => {
    refrescarFichas();
    const t = setInterval(refrescarFichas, REFRESCO_FICHAS_MS);
    const alVolver = () => { if (document.visibilityState === 'visible') refrescarFichas(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [refrescarFichas]);

  // Operaciones (recomendar, cambiar estado, borrar, notas) con actualización INMEDIATA: se aplica enseguida en pantalla con
  // el mismo reductor que usa el servidor y se confirma en segundo plano (la base en Google Sheets tarda 1-3 s). Las
  // operaciones de un mismo circuito van en cola, de a una; si el servidor rechaza alguna, se vuelve a leer lo guardado.
  const operar = useCallback((circuito, op) => {
    const key = circuito.toUpperCase();
    const opFinal = (op.op === 'agregarAccion' || op.op === 'agregarEtapa') && !op.id ? { ...op, id: nuevoIdAccion() } : op; // el mismo id en pantalla y en la base
    let optimista;
    try { optimista = aplicarOperacion(fichasRef.current[key], opFinal, usuarioRef.current, new Date().toISOString()); } catch (e) { return Promise.reject(e); }
    fichasRef.current = { ...fichasRef.current, [key]: optimista };
    setFichas(fichasRef.current);
    pendientesRef.current += 1;
    colasRef.current[key] = (colasRef.current[key] || Promise.resolve()).then(async () => {
      try {
        const r = await enviarOperacion(circuito, opFinal);
        pendientesRef.current -= 1;
        if (pendientesRef.current === 0) { fichasRef.current = { ...fichasRef.current, [key]: r.ficha }; setFichas(fichasRef.current); }
      } catch (e) {
        pendientesRef.current -= 1;
        refrescarFichas();
        throw e;
      }
    });
    const tarea = colasRef.current[key];
    colasRef.current[key] = tarea.catch(() => {}); // un error no frena las siguientes
    return tarea;
  }, [refrescarFichas]);

  // ---- navegación por hash ----
  useEffect(() => {
    const leer = () => setNav(leerHash());
    leer();
    window.addEventListener('hashchange', leer);
    return () => window.removeEventListener('hashchange', leer);
  }, []);
  const irA = useCallback((hoja, seleccion = null) => {
    window.location.hash = hoja === 'resumen' ? '/resumen' : `/circuitos${seleccion ? `/${seleccion}` : ''}`;
  }, []);
  const seleccionar = useCallback((key) => irA('circuitos', key), [irA]);

  // Resumen -> Circuitos: filtra por el conjunto (o entra directo si es un solo circuito).
  const irConConjunto = useCallback((claves, etiqueta, directo = false) => {
    if (directo && claves.length === 1) { irA('circuitos', claves[0]); return; }
    setFiltro({ ...FILTRO_VACIO, claves, etiqueta });
    irA('circuitos');
  }, [irA]);

  // Resumen (clic en un circuito del mapa) -> su ficha; si había un filtro activo en el Resumen, la lista de Circuitos lo conserva.
  const abrirDesdeResumen = useCallback((key, claves, etiqueta) => {
    if (claves) setFiltro({ ...FILTRO_VACIO, claves, etiqueta });
    irA('circuitos', key);
  }, [irA]);

  const parte = useMemo(() => {
    if (!textoParte.trim()) return null;
    try { return parsearParte(textoParte); } catch (e) { return null; }
  }, [textoParte]);

  const { filas, pautaDerivada } = useMemo(() => {
    if (!crudo) return { filas: [], pautaDerivada: null };
    const obrasEnriquecidas = enriquecerObrasConCircuito(crudo.obrasData, construirIndiceBarrioCircuito(crudo.cruceData), construirIndiceMapkeyNombre(crudo.cruceData));
    return construirPlanificador({ ...crudo, obrasEnriquecidas, parte });
  }, [crudo, parte]);
  const agregados = useMemo(() => (filas.length ? calcularAgregados(filas, pautaDerivada) : null), [filas, pautaDerivada]);
  const hoyTexto = new Date().toLocaleDateString('es-AR');

  const Tab = ({ id, children }) => (
    <button onClick={() => irA(id)} aria-current={nav.hoja === id}
      style={{ padding: '8px 18px', border: 'none', borderBottom: nav.hoja === id ? '3px solid #1976D2' : '3px solid transparent', background: 'none', fontSize: 14, fontWeight: nav.hoja === id ? 700 : 500, color: nav.hoja === id ? '#1565C0' : 'var(--text-secondary)', cursor: 'pointer' }}>{children}</button>
  );

  return (
    <>
      <Head>
        <title>Planificador territorial · Tablero electoral</title>
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <style>{CSS}</style>
      <div className="plan-raiz" style={{ padding: '14px 20px', maxWidth: 1600, margin: '0 auto' }}>
        <div className="plan-no-print plan-nav" style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
          <h1 style={{ fontSize: 19, fontWeight: 700 }}>Planificador territorial</h1>
          <span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 10, background: '#FFCA2833', color: '#F57F17', fontWeight: 600 }}>PILOTO</span>
          <nav style={{ display: 'flex', marginLeft: 8 }}><Tab id="resumen">Resumen</Tab><Tab id="circuitos">Circuitos</Tab></nav>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>{persistencia.usuario ? `Sesión: ${persistencia.usuario} · ` : ''}{hoyTexto}</span>
          <a href="/" style={{ fontSize: 13, color: '#1565C0' }}>← Tablero</a>
        </div>

        {error && <div style={{ padding: 16, border: '1px solid #C62828', borderRadius: 8, color: '#B71C1C' }}>Error cargando datos: {error}</div>}
        {!error && !crudo && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando datos…</div>}

        {crudo && agregados && nav.hoja === 'resumen' && (
          <HojaResumen filas={filas} pautaDerivada={pautaDerivada} agregados={agregados} fichas={fichas} persistencia={persistencia}
            filtros={filtrosResumen} setFiltros={setFiltrosResumen} onIr={irConConjunto} onAbrir={abrirDesdeResumen} hoyTexto={hoyTexto} />
        )}
        {crudo && agregados && nav.hoja === 'circuitos' && (
          <HojaCircuitos filas={filas} fichas={fichas} filtro={filtro} setFiltro={setFiltro} seleccion={nav.seleccion} onSelect={seleccionar}
            persistencia={persistencia} onOperacion={operar} hayParte={!!parte?.items?.length} />
        )}
        {crudo && <PanelParte texto={textoParte} setTexto={setTextoParte} parte={parte} />}
      </div>
    </>
  );
}
