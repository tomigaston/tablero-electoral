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
import { parsearParteDia, armarParteDia } from '../lib/planificador/parteDia';
import { cargarParte, guardarParte } from '../lib/planificador/parteApi';
import HojaResumen from '../components/planificador/HojaResumen';
import HojaCircuitos from '../components/planificador/HojaCircuitos';
import FichaCircuito from '../components/planificador/FichaCircuito';
import ListadoCircuitos from '../components/planificador/ListadoCircuitos';
import { Boton } from '../components/planificador/ui';
import { CabeceraPantalla, PiePantalla } from '../components/planificador/Marca';
import { MARCA, URL_FUENTE } from '../lib/planificador/marca';
import { FAVICON_CORDOBA } from '../lib/planificador/favicon';

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
.plan-raiz .plan-campo{outline:none;transition:box-shadow .15s,border-color .15s,background .15s}
.plan-raiz .plan-campo:focus{box-shadow:0 0 0 3px #6CAEE555;border-color:#6CAEE5 !important;background:#fff !important}
.plan-raiz .plan-kpi:hover:not(:disabled){transform:translateY(-2px)}
.plan-solo-movil{display:none}
/* Resumen en pantalla: mapa a la izquierda y las cinco tarjetas apiladas a la derecha (las hojas del PDF son display:contents acá). */
.plan-pag1,.plan-pag2{display:contents}
.plan-lote{display:none}
.plan-grilla-resumen .plan-mapa-col{grid-column:1;grid-row:1 / span 5}
.plan-grilla-resumen [data-plan-card]{grid-column:2}
@media (max-width:900px){
  .plan-grilla-resumen .plan-mapa-col{grid-column:1;grid-row:auto}
  .plan-grilla-resumen [data-plan-card]{grid-column:1}
  .plan-circuitos{grid-template-columns:1fr !important}
  .plan-lista{position:static !important}
  .plan-lista-con-ficha{display:none}
  .plan-solo-movil{display:inline}
  .plan-grilla-resumen{grid-template-columns:1fr !important}
  .plan-mapa-col{position:static !important}
}

/* ---- Impresión / PDF: mismo diseño que la pantalla. El Resumen y la ficha salen en hoja A4 vertical. ---- */
@page{size:A4 portrait;margin:11mm 11mm 13mm}
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
  /* Resumen: hoja vertical (A4). Hoja 1: KPIs + mapa con su leyenda + clima y "a ciegas". Hoja 2: pauta, top 10 y problema #1.
     Hoja 3: seguimiento y, a continuación, la tabla de recomendaciones por subcircuito (sigue en las hojas siguientes). */
  .plan-hoja-resumen{zoom:1}
  .plan-hoja-resumen .plan-grilla-resumen{display:block !important}
  .plan-hoja-resumen .plan-grilla-resumen .plan-seccion{margin-bottom:0 !important}
  /* Hoja 1 */
  .plan-hoja-resumen .plan-pag1{display:grid !important;grid-template-columns:1fr 1fr !important;gap:10px !important;align-items:stretch !important;break-after:page;page-break-after:always}
  .plan-hoja-resumen .plan-pag1 .plan-mapa-col{position:static !important;grid-column:1 / span 2 !important;grid-row:1 !important}
  .plan-hoja-resumen .plan-pag1 .plan-mapa-col .plan-seccion{height:100%;box-sizing:border-box;display:grid !important;grid-template-columns:1.2fr 1fr;column-gap:16px;align-items:center;align-content:start}
  .plan-hoja-resumen .plan-pag1 .plan-mapa-col .plan-seccion > h2{grid-column:1 / -1}
  .plan-hoja-resumen .plan-pag1 .plan-mapa-col .plan-seccion > p{display:none}
  .plan-hoja-resumen .plan-pag1 .plan-mapa-col .plan-seccion > div:not(.plan-leyenda){grid-column:1;grid-row:2}
  .plan-hoja-resumen .plan-pag1 .plan-mapa-col .plan-seccion > .plan-leyenda{grid-column:2;grid-row:2}
  .plan-hoja-resumen .plan-pag1 .plan-mapa-col svg{max-height:125mm !important}
  .plan-hoja-resumen .plan-pag1 [data-plan-card]{grid-column:auto !important;grid-row:2 !important}
  .plan-hoja-resumen [data-plan-card="clima"]{order:1}
  .plan-hoja-resumen [data-plan-card="ciegos"]{order:2}
  /* Hoja 2: las tres tarjetas a lo ancho de la hoja (un poco más chicas para que entren justo). */
  .plan-hoja-resumen .plan-pag2{display:grid !important;grid-template-columns:1fr !important;gap:10px !important;zoom:.93}
  .plan-hoja-resumen .plan-pag2 [data-plan-card]{grid-column:auto !important}
  .plan-hoja-resumen [data-plan-card="tema"]{order:1}
  .plan-hoja-resumen [data-plan-card="top"]{order:2}
  .plan-hoja-resumen [data-plan-card="problema1"]{order:3}
  /* Hoja 3: seguimiento (tarjetas de a tres, los dos gráficos de barras lado a lado y el ritmo debajo) y la tabla a continuación. */
  .plan-hoja-resumen .plan-pag3{break-before:page;page-break-before:always;margin-top:0 !important}
  .plan-hoja-resumen .plan-seg-grid{display:grid !important;grid-template-columns:1fr 1fr !important;gap:14px 30px !important}
  .plan-hoja-resumen .plan-seg-izq{display:contents !important}
  .plan-hoja-resumen .plan-seg-izq > div:nth-child(3){grid-column:1 / -1}
  .plan-hoja-resumen .plan-hoja-lista{margin-top:14px}
  .plan-hoja-resumen .plan-hoja-lista thead{display:table-header-group}
  /* Letra un poco más grande en las tarjetas del resumen. */
  .plan-hoja-resumen .plan-seccion > h2{font-size:17px !important}
  .plan-hoja-resumen .plan-seccion > p{font-size:13px !important}
  .plan-hoja-resumen .plan-pag1 [data-plan-card] button span,.plan-hoja-resumen .plan-pag2 .plan-seccion button span,.plan-hoja-resumen .plan-seg-grid button span{font-size:14px !important}
  .plan-hoja-resumen .plan-pag1 [data-plan-card] button,.plan-hoja-resumen .plan-seg-grid button{grid-template-columns:minmax(0,46%) 1fr auto !important}
  .plan-hoja-resumen .plan-pag1 [data-plan-card] button > span:first-child,.plan-hoja-resumen .plan-seg-grid button > span:first-child{white-space:normal !important;overflow:visible !important;text-overflow:clip !important}
  .plan-hoja-resumen .plan-leyenda button{display:grid !important;grid-template-columns:auto 1fr !important;column-gap:9px;align-items:center;font-size:14.5px !important}
  .plan-hoja-resumen .plan-leyenda button > span:nth-child(2){min-width:0 !important}
  .plan-hoja-resumen .plan-leyenda button > span:nth-child(3){grid-column:2}
  /* Tarjetas de números: contenido alineado arriba (los números a la misma altura) y la barra de proporción siempre abajo. */
  .plan-raiz .plan-kpi{display:flex !important;flex-direction:column !important;justify-content:flex-start !important}
  .plan-raiz .plan-kpi > div[aria-hidden]{margin-top:auto !important}
  .plan-raiz .plan-kpi-extra,.plan-raiz .plan-kpi-label{margin-bottom:6px}
  .plan-kpi-num{font-size:42px !important}
  .plan-kpi-de{font-size:15px !important}
  .plan-kpi-label{font-size:16px !important}
  .plan-kpi-extra{font-size:13.5px !important}
  /* Tarjetas de números: arriba de a cuatro; las del seguimiento de a tres (así se lee la etiqueta completa). */
  .plan-kpis{display:grid !important;grid-template-columns:repeat(4,1fr) !important;gap:8px !important;margin-bottom:10px !important}
  .plan-kpis > *{flex:none !important;min-width:0 !important}
  .plan-kpis-7{grid-template-columns:repeat(3,1fr) !important;gap:8px !important}
  .plan-kpis-7 .plan-kpi{padding:12px 14px 10px !important}
  .plan-kpis-7 .plan-kpi-num{font-size:36px !important}
  .plan-kpis-7 .plan-kpi-label{font-size:14.5px !important}
  .plan-raiz .plan-kpi{padding:12px 14px 10px !important;border-radius:14px !important}
  /* Ficha: encuestas y línea de tiempo se comprimen para entrar en una fila. */
  .plan-encuesta-fila{flex-wrap:nowrap !important;gap:6px !important;zoom:.8}
  .plan-paso{flex:1 1 0 !important;width:auto !important;min-width:0 !important;padding:8px 10px 10px !important}
  /* Línea de tiempo: columnas de ancho fijo y alineadas a la izquierda (la última fila no se estira, así no parece que pasó mucho tiempo). */
  .plan-linea-tiempo{zoom:.82;flex-wrap:wrap !important;justify-content:flex-start !important;row-gap:12px}
  .plan-col-tiempo{flex:0 0 108px !important;width:108px !important;min-width:0 !important}
  /* Anexo de la ficha: empieza en hoja nueva y puede cortarse entre páginas. */
  .plan-anexo{break-before:page;page-break-before:always}
  /* Ficha resumen (sin el anexo del detalle) y descarga de varias fichas: una ficha por circuito, cada una en hoja nueva. */
  .plan-sin-anexo .plan-anexo{display:none !important}
  .plan-modo-lote .plan-hoja-resumen{display:none !important}
  .plan-modo-lote .plan-lote{display:block !important}
  .plan-lote .plan-ficha{break-before:page;page-break-before:always}
  .plan-lote .plan-ficha:first-child{break-before:auto;page-break-before:auto}
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

const fechaCorta = (iso) => { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return d && m && y ? `${d}/${m}/${y}` : ''; };

// Cuadro plegable del parte de obras del día: se pega el mensaje de difusión tal cual, se lee solo y se guarda para todo el equipo.
// Las obras pasan a las fichas de cada circuito (bloque "Obras del parte").
function PanelParteDia({ titulo, tipo, guardado, disponible, onGuardar }) {
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState(null); // null = sin tocar: se muestra lo guardado
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);
  const base = guardado?.texto || '';
  const texto = borrador ?? base;
  const lectura = useMemo(() => (texto.trim() ? parsearParteDia(texto, tipo === 'ejecucion' ? 'ejecucion' : 'finalizada') : null), [texto, tipo]);
  const circuitos = lectura ? new Set(lectura.items.filter((o) => o.circuito).map((o) => o.circuito)).size : 0;
  const sinCircuito = lectura ? lectura.items.filter((o) => !o.circuito) : [];
  const hayCambio = borrador != null && borrador !== base;
  const resumen = lectura
    ? `cargado${lectura.fecha ? ` del ${fechaCorta(lectura.fecha)}` : ''} · ${lectura.items.length} obras · ${circuitos} circuitos`
    : 'sin cargar';
  const guardar = async (nuevo) => {
    setGuardando(true); setAviso('');
    try { await onGuardar(tipo, nuevo); setBorrador(null); setAviso(nuevo.trim() ? 'Guardado: ya está en las fichas de cada circuito.' : 'Quitado.'); } catch (e) { setAviso(`No se pudo guardar: ${e.message}`); }
    setGuardando(false);
  };
  return (
    <div className="plan-no-print" style={{ marginTop: 10, fontSize: 12.5 }}>
      <button onClick={() => setAbierto(!abierto)} style={{ border: 'none', background: 'none', color: '#2A6296', cursor: 'pointer', padding: 0, fontSize: 12.5 }}>
        {abierto ? '▾' : '▸'} {titulo} ({resumen})
      </button>
      {abierto && (
        <div style={{ marginTop: 6 }}>
          {!disponible && <div style={{ marginBottom: 6, color: '#B71C1C' }}>No se puede guardar: la base de datos no está disponible.</div>}
          <textarea value={texto} onChange={(e) => { setBorrador(e.target.value); setAviso(''); }} rows={8} placeholder={`Pegá acá el mensaje de ${tipo === 'ejecucion' ? 'obras en ejecución' : 'obras finalizadas'} tal cual se difunde…`}
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, padding: 8, borderRadius: 6, border: '1px solid var(--border)' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
            <Boton primario disabled={!disponible || !hayCambio || guardando} onClick={() => guardar(texto)}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
            <Boton disabled={!disponible || guardando || (!base && borrador == null)} onClick={() => guardar('')}>Quitar</Boton>
            <span style={{ color: 'var(--text-secondary)' }}>{aviso || (hayCambio ? 'Hay cambios sin guardar.' : 'Se guarda para todo el equipo.')}</span>
          </div>
          {sinCircuito.length > 0 && (
            <div style={{ marginTop: 6, color: '#B07F2A' }}>
              {sinCircuito.length} {sinCircuito.length === 1 ? 'obra no trae' : 'obras no traen'} circuito y no {sinCircuito.length === 1 ? 'entra' : 'entran'} en ninguna ficha: {sinCircuito.map((o) => o.nombre).join(' · ')}
            </div>
          )}
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
  const [lote, setLote] = useState(null); // fichas de varios circuitos para un solo PDF: { claves, modo: 'listado' | 'resumen' | 'completa', etiqueta }
  const [parteGuardada, setParteGuardada] = useState(null); // { ejecucion: { texto, actualizado_en }, finalizadas: { ... } } desde la base
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

  // ---- Descarga de las fichas de los circuitos filtrados en el Resumen (un PDF con una ficha por circuito) ----
  // Se dibujan las fichas en un contenedor oculto (.plan-lote), se espera a que se rendericen y se imprime solo ese contenedor.
  useEffect(() => {
    if (!lote) return undefined;
    const raiz = document.querySelector('.plan-raiz');
    const anterior = document.title;
    const limpiar = () => {
      document.title = anterior;
      raiz?.classList.remove('plan-modo-lote', 'plan-sin-anexo');
      window.removeEventListener('afterprint', limpiar);
      setLote(null);
    };
    const t = setTimeout(() => {
      raiz?.classList.add('plan-modo-lote');
      if (lote.modo !== 'completa') raiz?.classList.add('plan-sin-anexo');
      document.title = lote.modo === 'listado'
        ? `Planificador territorial · Tablero electoral - listado de ${lote.claves.length} ${lote.claves.length === 1 ? 'circuito' : 'circuitos'}`
        : `Planificador territorial · Tablero electoral - ${lote.claves.length} ${lote.claves.length === 1 ? 'ficha' : 'fichas'}${lote.modo === 'resumen' ? ' (resumen)' : ''}`;
      window.addEventListener('afterprint', limpiar);
      window.print();
    }, 400 + lote.claves.length * 20);
    return () => clearTimeout(t);
  }, [lote]);
  const descargarFichas = useCallback((claves, modo, etiqueta) => setLote({ claves, modo, etiqueta }), []);
  // ---- parte de obras del día (los dos mensajes), compartido en la base ----
  useEffect(() => {
    let vivo = true;
    const leer = () => cargarParte().then((r) => { if (vivo) setParteGuardada(r); }).catch(() => {});
    leer();
    const t = setInterval(leer, REFRESCO_FICHAS_MS);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  const guardarParteDia = useCallback(async (tipo, texto) => {
    const r = await guardarParte(tipo, texto);
    setParteGuardada((p) => ({ ...(p || {}), [tipo]: r[tipo] }));
  }, []);
  const parteDia = useMemo(() => {
    const ej = parteGuardada?.ejecucion?.texto || '';
    const fin = parteGuardada?.finalizadas?.texto || '';
    if (!ej.trim() && !fin.trim()) return null;
    try { return armarParteDia(ej, fin); } catch (e) { return null; }
  }, [parteGuardada]);

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
    return construirPlanificador({ ...crudo, obrasEnriquecidas, parte, parteDia });
  }, [crudo, parte, parteDia]);
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
        <link rel="icon" type="image/svg+xml" href={FAVICON_CORDOBA} />
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
            filtros={filtrosResumen} setFiltros={setFiltrosResumen} onIr={irConConjunto} onAbrir={abrirDesdeResumen} onDescargarFichas={descargarFichas} hoyTexto={hoyTexto} />
        )}
        {crudo && agregados && nav.hoja === 'circuitos' && (
          <HojaCircuitos filas={filas} fichas={fichas} filtro={filtro} setFiltro={setFiltro} seleccion={nav.seleccion} onSelect={seleccionar}
            persistencia={persistencia} onOperacion={operar} hayParte={!!parte?.items?.length} parteDia={parteDia} />
        )}
        {lote && (
          <>
            <div className="plan-no-print" role="status" style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 1000, padding: '12px 18px', borderRadius: 14, background: '#1F2933', color: '#fff', fontSize: 13.5, fontWeight: 600, boxShadow: '0 8px 30px rgba(16,24,40,0.35)' }}>
              Preparando {lote.modo === 'listado' ? 'el listado' : `${lote.claves.length} ${lote.claves.length === 1 ? 'ficha' : 'fichas'}`} para el PDF…
            </div>
            <div className="plan-lote">
              {lote.modo === 'listado'
                ? <ListadoCircuitos filas={filas.filter((f) => lote.claves.includes(f.key))} etiqueta={lote.etiqueta} />
                : filas.filter((f) => lote.claves.includes(f.key)).sort((a, b) => a.key.localeCompare(b.key, 'es', { numeric: true })).map((f) => (
                  <FichaCircuito key={f.key} f={f} ficha={fichas[f.key]} persistencia={persistencia} onOperacion={operar} hayParte={!!parte?.items?.length} />
                ))}
            </div>
          </>
        )}        {crudo && <PanelParteDia titulo="Parte de obras · en ejecución" tipo="ejecucion" guardado={parteGuardada?.ejecucion} disponible={persistencia.disponible} onGuardar={guardarParteDia} />}
        {crudo && <PanelParteDia titulo="Parte de obras · finalizadas" tipo="finalizadas" guardado={parteGuardada?.finalizadas} disponible={persistencia.disponible} onGuardar={guardarParteDia} />}
        <PiePantalla />
      </div>
    </>
  );
}
