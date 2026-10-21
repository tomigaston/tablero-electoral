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
import { CabeceraPantalla, PiePantalla } from '../components/planificador/Marca';
import { MARCA, URL_FUENTE } from '../lib/planificador/marca';

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
/* ---- Identidad de marca (Manual de marca del Gobierno de la Provincia de Córdoba) ---- */
html,body{background:#F5F7FA !important}
.plan-raiz{--bg-primary:#fff;--bg-secondary:#F2F5F9;--text-primary:#1F2933;--text-secondary:#5B6772;--text-tertiary:#8A94A0;--border:#E4E8EE;
  font-family:'Poppins','Segoe UI',system-ui,-apple-system,sans-serif;color:var(--text-primary);line-height:1.45}
.plan-raiz h1,.plan-raiz h2,.plan-raiz h3{font-family:inherit;letter-spacing:-0.01em}
.plan-raiz button,.plan-raiz input,.plan-raiz select,.plan-raiz textarea{font-family:inherit}
/* Tarjetas modernas: esquinas amplias, sombra suave y un detalle de color en el título. */
.plan-raiz .plan-seccion{border-radius:18px !important;border:1px solid var(--border) !important;box-shadow:0 2px 14px rgba(16,24,40,0.06) !important;padding:18px 22px !important;transition:box-shadow .18s ease}
.plan-raiz .plan-seccion:hover{box-shadow:0 8px 26px rgba(16,24,40,0.10) !important}
.plan-raiz .plan-seccion > h2{display:flex;align-items:center;gap:10px;font-weight:700}
.plan-raiz .plan-seccion > h2::before{content:'';flex:0 0 auto;width:5px;height:18px;border-radius:3px;background:linear-gradient(180deg,#6CAEE5,#3478B5)}
.plan-fila:hover{background:#6CAEE51F !important}
.plan-solo-movil{display:none}
@media (max-width:900px){
  .plan-circuitos{grid-template-columns:1fr !important}
  .plan-lista{position:static !important}
  .plan-lista-con-ficha{display:none}
  .plan-solo-movil{display:inline}
  .plan-grilla-resumen{grid-template-columns:1fr !important}
  .plan-mapa-col{position:static !important}
}

/* ---- Impresión / PDF: mismo diseño que la pantalla. El Resumen sale apaisado (mapa + tarjetas), la ficha vertical. ---- */
@page{size:A4 portrait;margin:11mm 11mm 13mm}
@page resumen{size:A4 landscape;margin:10mm 11mm 12mm}
@media print{
  html,body{background:#fff !important}
  .plan-no-print{display:none !important}
  .plan-solo-print{display:block !important}
  .plan-raiz{padding:0 !important;max-width:none !important}
  .plan-circuitos{display:block !important}
  .plan-lista{display:none !important}
  .plan-raiz,.plan-raiz *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  .plan-raiz *{box-shadow:none !important;transition:none !important}
  .plan-raiz .plan-seccion{break-inside:avoid;page-break-inside:avoid;padding:14px 16px !important;margin-bottom:10px}
  .plan-raiz .plan-seccion:hover{box-shadow:none !important}
  .plan-linea-tiempo,.plan-encuesta-fila{overflow:visible !important;flex-wrap:wrap !important}
  .plan-lista-scroll{max-height:none !important;overflow:visible !important}
  .plan-hoja-resumen{page:resumen}
  .plan-hoja-resumen .plan-grilla-resumen{display:grid !important;grid-template-columns:1.2fr 1fr !important;gap:10px !important}
  .plan-hoja-resumen .plan-mapa-col{position:static !important}
  .plan-hoja-resumen .plan-grilla-resumen > div{margin-bottom:0}
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
      <button onClick={() => setAbierto(!abierto)} style={{ border: 'none', background: 'none', color: '#2A6296', cursor: 'pointer', padding: 0, fontSize: 12.5 }}>
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
      style={{ padding: '8px 20px', border: 'none', borderRadius: 999, background: nav.hoja === id ? MARCA.rojo : 'transparent', fontSize: 13.5, fontWeight: 600, color: nav.hoja === id ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', transition: 'background .15s' }}>{children}</button>
  );

  return (
    <>
      <Head>
        <title>Planificador territorial · Tablero electoral</title>
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={URL_FUENTE} />
      </Head>
      <style>{CSS}</style>
      <div className="plan-raiz" style={{ padding: '14px 20px', maxWidth: 1600, margin: '0 auto' }}>
        <CabeceraPantalla
          derecha={(
            <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{persistencia.usuario ? `Sesión: ${persistencia.usuario} · ` : ''}{hoyTexto}</div>
              <a href="/" style={{ fontSize: 12.5, fontWeight: 600, color: MARCA.azulTexto, textDecoration: 'none' }}>← Tablero</a>
            </div>
          )}>
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 800, color: '#1F2933', lineHeight: 1.1 }}>Planificador territorial</h1>
            <div style={{ fontSize: 11.5, color: MARCA.gris, fontWeight: 500 }}>Tablero diagnóstico · Córdoba Capital</div>
          </div>
          <span style={{ fontSize: 10.5, padding: '3px 10px', borderRadius: 12, background: `${MARCA.dorado}33`, color: MARCA.doradoOscuro, fontWeight: 700, letterSpacing: 0.6 }}>PILOTO</span>
          <nav style={{ display: 'flex', gap: 4, marginLeft: 10 }}><Tab id="resumen">Resumen</Tab><Tab id="circuitos">Circuitos</Tab></nav>
        </CabeceraPantalla>

        {error && <div style={{ padding: 16, border: '1px solid #BC1734', borderRadius: 8, color: '#B71C1C' }}>Error cargando datos: {error}</div>}
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
        <PiePantalla />
      </div>
    </>
  );
}
