// Hoja Resumen: la foto general, centrada en el mapa. Mapa de Córdoba Capital pintado por prioridad
// (izquierda) + 5 tarjetas temáticas (derecha) + KPIs arriba. El filtro es compartido por todo:
// tocar una barra, un KPI o un color de la leyenda pinta en el mapa solo los circuitos que cumplen y
// recalcula las demás tarjetas. Ctrl/Cmd/Shift + clic (o el botón "Combinar") suma más filtros:
// en una misma tarjeta se suman (o), entre tarjetas se cruzan (y). Tocar un circuito del mapa o
// "Ver lista" lleva a la hoja Circuitos; nada más navega.
import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { TIERS, COLOR_PRIORIDAD, LABEL_PRIORIDAD } from '../../lib/planificador/config';
import {
  agregadosDeSubconjunto, distribucionPrioridad, fmtPctPadron,
  combinarFiltros, etiquetaFiltros, alternarFiltro, padronDe, problemasTop,
} from '../../lib/planificador/resumenMapa';
import {
  listarRecomendaciones, resumenRecomendaciones, ordenarRecomendaciones, circuitosDe, ESTADOS_REC, COLOR_ESTADO_REC,
} from '../../lib/planificador/recomendaciones';
import { ETIQUETA_ESTADO, TIPOS_ACCION, ordenarEtapas, textoAccion } from '../../lib/planificador/acciones';
import { filasExportables, descargarCsv, abrirImpresion, subtituloListado } from '../../lib/planificador/exportar';
import { Boton, PuntoPrioridad } from './ui';
import { CabeceraImpresion, PieImpresion } from './Marca';
import { MARCA, LOGOS } from '../../lib/planificador/marca';

// Leaflet necesita el navegador: mismo criterio que MapaCircuitos en pages/index.js.
const MapaResumen = dynamic(() => import('./MapaResumen'), {
  ssr: false,
  loading: () => <div style={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', borderRadius: 8, color: 'var(--text-tertiary)' }}>Cargando mapa…</div>,
});

const COLOR_BARRA = '#3478B5';
// Colores de las categorías del tablero, usados acá solo para el clima electoral (semántico).
const COLOR_TIER = { favorable: '#2E7D32', intermedio: '#26A69A', desfavorable: '#FF7043', adverso: '#EF5350' };

const Tarjeta = ({ titulo, subtitulo, children, filtrada, claveImp }) => (
  <section className="plan-seccion" data-plan-card={claveImp} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
    <h2 style={{ fontSize: 15, fontWeight: 700 }}>
      {titulo}
      {filtrada && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 8, background: '#3478B518', color: '#2A6296', verticalAlign: 'middle' }}>en el filtro</span>}
    </h2>
    {subtitulo && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 10px' }}>{subtitulo}</p>}
    {!subtitulo && <div style={{ height: 8 }} />}
    {children}
  </section>
);

// Barras horizontales clickeables con tooltip. `activos`: ids de las barras que están filtrando.
// onClick(item, evento): el evento trae Ctrl/Cmd/Shift para combinar.
function Barras({ items, max, onClick, activos = [], formato = (v) => String(v) }) {
  const tope = max ?? Math.max(1, ...items.map((i) => i.valor));
  const hayActivos = activos.length > 0;
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {items.map((it) => {
        const clic = onClick && it.claves?.length ? (e) => onClick(it, e) : undefined;
        const activa = activos.includes(it.id);
        const atenuada = hayActivos && !activa;
        return (
          <button key={it.id} onClick={clic} disabled={!clic} aria-pressed={activa} title={it.tooltip || `${it.label}: ${formato(it.valor)}`}
            style={{ all: 'unset', boxSizing: 'border-box', display: 'grid', gridTemplateColumns: 'minmax(110px, 38%) 1fr auto', gap: 8, alignItems: 'center', cursor: clic ? 'pointer' : 'default', padding: '2px 4px', borderRadius: 4, opacity: atenuada ? 0.45 : 1, boxShadow: activa ? 'inset 0 0 0 1.5px #3478B5' : 'none' }}>
            <span style={{ fontSize: 12.5, fontWeight: activa ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
            <span style={{ height: 16, background: 'var(--bg-secondary)', borderRadius: 8, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.max(2, (it.valor / tope) * 100)}%`, background: it.color || COLOR_BARRA, borderRadius: 8 }} />
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 54, textAlign: 'right' }}>{it.texto ?? formato(it.valor)}</span>
          </button>
        );
      })}
    </div>
  );
}

// KPI de arriba: número grande, etiqueta, barra de proporción y acento de color. Si filtra, se resalta.
const Kpi = ({ valor, de, label, extra, proporcion, color = COLOR_BARRA, activo, onClick }) => (
  <button onClick={onClick} disabled={!onClick} aria-pressed={onClick ? !!activo : undefined} className="plan-kpi"
    style={{ position: 'relative', overflow: 'hidden', flex: '1 1 210px', textAlign: 'left', padding: '18px 20px 14px', borderRadius: 18, border: '1px solid var(--border)', background: activo ? `${color}12` : 'var(--bg-primary)', color: 'var(--text-primary)', cursor: onClick ? 'pointer' : 'default', boxShadow: activo ? `0 0 0 2px ${color}66, 0 6px 20px ${color}22` : '0 2px 14px rgba(16,24,40,0.06)', transition: 'box-shadow .18s, background .18s, transform .18s' }}>
    <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: color }} />
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span className="plan-kpi-num" style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em' }}>{valor}</span>
      {de != null && <span className="plan-kpi-de" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>de {de}</span>}
    </div>
    <div className="plan-kpi-label" style={{ fontSize: 13.5, fontWeight: 600, marginTop: 3 }}>{label}</div>
    {extra && <div className="plan-kpi-extra" style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>{extra}</div>}
    {proporcion != null && (
      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-secondary)', marginTop: 12, overflow: 'hidden' }} aria-hidden="true">
        <div style={{ height: '100%', width: `${Math.max(2, Math.min(100, proporcion))}%`, background: color, borderRadius: 3 }} />
      </div>
    )}
  </button>
);

// Leyenda del mapa: cuánta ciudad (circuitos y % del padrón) está en cada color. Cada fila filtra.
function Leyenda({ items, activos, onClick }) {
  return (
    <div className="plan-leyenda" style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--bg-secondary)' }} aria-hidden="true">
        {items.map((d) => <div key={d.nivel} style={{ width: `${d.pctPadron}%`, background: COLOR_PRIORIDAD[d.nivel] }} />)}
      </div>
      <div style={{ display: 'grid', gap: 2, marginTop: 8 }}>
        {items.map((d) => {
          const activa = activos.includes(d.nivel);
          return (
            <button key={d.nivel} onClick={(e) => onClick(d, e)} disabled={!d.claves.length} aria-pressed={activa}
              style={{ all: 'unset', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8, padding: '3px 6px', borderRadius: 4, cursor: d.claves.length ? 'pointer' : 'default', fontSize: 13, opacity: activos.length && !activa ? 0.5 : 1, boxShadow: activa ? 'inset 0 0 0 1.5px #3478B5' : 'none' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: COLOR_PRIORIDAD[d.nivel], flexShrink: 0 }} />
              <span style={{ fontWeight: 600, minWidth: 150 }}>{LABEL_PRIORIDAD[d.nivel]}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{d.n} {d.n === 1 ? 'circuito' : 'circuitos'} · <strong style={{ color: 'var(--text-primary)' }}>{fmtPctPadron(d.pctPadron)}</strong> del padrón</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const pct = (v, t) => (t ? `${((v / t) * 100).toFixed(1).replace('.', ',')}%` : '—');
const millones = (v) => `$ ${(v / 1e6).toFixed(1).replace('.', ',')} M`;
const nombreEje = (e) => e.charAt(0) + e.slice(1).toLowerCase();

// KPIs filtrables (cada uno es su propio "origen": entre KPIs y tarjetas se cruzan).
const KPIS = [
  { origen: 'kpi:sinMedir', campo: 'sinMedir', label: 'sin medir', etiqueta: 'Sin medir', color: '#808080', extra: (k) => `+ ${k.unaRonda.n} con una sola ronda` },
  { origen: 'kpi:conObra', campo: 'conObra', label: 'con obra', etiqueta: 'Con obra', color: '#2E7D32' },
  { origen: 'kpi:pautaSinMed', campo: 'pautaSinMed', label: 'con pauta sin medición posterior', etiqueta: 'Pauta sin medición posterior', color: '#B07F2A' },
];

// Exportar un listado por tipo de tarea (p. ej. todos los circuitos a "Mandar a medir") a PDF o Excel.
function ExportarListado({ recs }) {
  const [tipo, setTipo] = useState('medir');
  const [alcance, setAlcance] = useState('pendientes'); // pendientes (pendientes + en ejecución) | todas
  const [aviso, setAviso] = useState('');
  const estados = alcance === 'todas' ? ESTADOS_REC : ['pendiente', 'en_curso'];
  const estadosTexto = alcance === 'todas' ? 'Todas las recomendaciones' : 'Pendientes y en ejecución';
  const cuentas = useMemo(() => {
    const m = {};
    recs.filter((r) => estados.includes(r.estado)).forEach((r) => { m[r.tipo] = (m[r.tipo] || 0) + 1; });
    return m;
  }, [recs, alcance]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = Object.values(cuentas).reduce((a, n) => a + n, 0);
  const filas = useMemo(() => filasExportables(recs, { tipo, estados }), [recs, tipo, alcance]); // eslint-disable-line react-hooks/exhaustive-deps
  const nombre = tipo === 'todos' ? 'Todas las acciones' : TIPOS_ACCION[tipo];
  const select = { padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)' };
  return (
    <div className="plan-no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px', marginBottom: 14, borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <strong style={{ fontSize: 13 }}>Exportar listado</strong>
      <select value={tipo} onChange={(e) => { setTipo(e.target.value); setAviso(''); }} aria-label="Tipo de acción" style={select}>
        <option value="todos">Todas las acciones ({total})</option>
        {Object.entries(TIPOS_ACCION).map(([k, label]) => <option key={k} value={k}>{label} ({cuentas[k] || 0})</option>)}
      </select>
      <select value={alcance} onChange={(e) => { setAlcance(e.target.value); setAviso(''); }} aria-label="Estados a incluir" style={select}>
        <option value="pendientes">Pendientes y en ejecución</option>
        <option value="todas">Todas (incluye cumplidas)</option>
      </select>
      <Boton primario disabled={!filas.length} style={{ padding: '6px 14px', fontSize: 13 }}
        onClick={() => setAviso(abrirImpresion(`Listado: ${nombre}`, subtituloListado(estadosTexto, filas.length), filas) ? 'En la ventana que se abrió, elegí “Guardar como PDF” como impresora.' : 'El navegador bloqueó la ventana emergente: permitila e intentá de nuevo.')}>Descargar PDF</Boton>
      <Boton disabled={!filas.length} style={{ padding: '6px 14px', fontSize: 13 }}
        onClick={() => { descargarCsv(`listado_${nombre.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, filas); setAviso('Descargado: se abre con Excel.'); }}>Descargar Excel</Boton>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{filas.length ? `${filas.length} ${filas.length === 1 ? 'fila' : 'filas'}` : 'Sin recomendaciones para ese criterio.'}{aviso ? ` · ${aviso}` : ''}</span>
    </div>
  );
}

const fmtN = (v) => `${v.toFixed(1).replace('.', ',')}%`;
const cuando = (iso) => { try { return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }); } catch (e) { return ''; } };
// Buscador de subcircuito: se escribe el número o el nombre y se elige de la lista; queda como filtro en el mapa y las tarjetas.
function FiltroSubcircuito({ filas, onElegir }) {
  const [q, setQ] = useState('');
  const opciones = useMemo(
    () => filas.map((f) => ({ fila: f, texto: `${f.key} · ${f.nombre}` })).sort((a, b) => a.fila.key.localeCompare(b.fila.key, 'es', { numeric: true })),
    [filas],
  );
  const elegir = (valor, permitirParcial) => {
    const v = valor.trim().toLowerCase();
    if (!v) return;
    const exacta = opciones.find((o) => o.texto.toLowerCase() === v);
    const parciales = permitirParcial ? opciones.filter((o) => o.texto.toLowerCase().includes(v)) : [];
    const o = exacta || (parciales.length === 1 ? parciales[0] : null);
    if (o) { onElegir(o.fila); setQ(''); }
  };
  return (
    <div className="plan-no-print" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input list="plan-lista-subcircuitos" value={q} aria-label="Filtrar por subcircuito" placeholder="Filtrar por subcircuito…"
        onChange={(e) => { setQ(e.target.value); elegir(e.target.value, false); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); elegir(q, true); } }}
        className="plan-campo" style={{ width: 250, padding: '8px 14px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 12.5, background: '#fff', color: 'var(--text-primary)' }} />
      <datalist id="plan-lista-subcircuitos">{opciones.map((o) => <option key={o.fila.key} value={o.texto} />)}</datalist>
    </div>
  );
}

// Fecha sin hora ("2026-10-28") a dd/mm: formateada a mano para que no se corra un día por la zona horaria.
const fechaDMY = (f) => { const [y, m, d] = String(f).slice(0, 10).split('-'); return d && m ? `${d}/${m}/${y}` : ''; };
const SubTitulo =({ children }) => <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>{children}</h3>;

// Seguimiento de recomendaciones del equipo: qué se pidió en las fichas y cuánto se ejecutó. Lee de las mismas fichas
// (KV). Tocar un número o una barra pinta en el mapa los circuitos con esa recomendación (mismo filtro compartido).
function SeguimientoRecomendaciones({ recs, filas, filtros, filtrar, activosDe, persistencia, onAbrir, pie }) {
  if (!persistencia.disponible) {
    return (
      <>
        <Tarjeta titulo="Seguimiento de recomendaciones">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{persistencia.cargando ? 'Cargando…' : `Sin datos de seguimiento: ${persistencia.mensaje || 'base de datos no disponible'}.`}</p>
        </Tarjeta>
        {pie}
      </>
    );
  }

  // Alcance: filtros de circuito (mapa y otras tarjetas); los de estado/tipo de esta sección se aplican sobre las recomendaciones.
  const clavesCircuito = combinarFiltros(filtros.filter((f) => !String(f.origen).startsWith('rec:')));
  const setCircuito = clavesCircuito ? new Set(clavesCircuito) : null;
  const recsBase = setCircuito ? recs.filter((r) => setCircuito.has(r.circuito)) : recs;
  const nAlcance = setCircuito ? setCircuito.size : filas.length;
  const estadosSel = activosDe('rec:estado');
  const tiposSel = activosDe('rec:tipo');
  const porEstadoSel = (r) => !estadosSel.length || estadosSel.includes(r.estado);
  const porTipoSel = (r) => !tiposSel.length || tiposSel.includes(r.tipo);

  const rK = resumenRecomendaciones(recsBase.filter((r) => porEstadoSel(r) && porTipoSel(r)), nAlcance);
  const rEstado = resumenRecomendaciones(recsBase.filter(porTipoSel), nAlcance);
  const rTipo = resumenRecomendaciones(recsBase.filter(porEstadoSel), nAlcance);
  // Visor rápido de TODO lo recomendado: respeta los filtros de circuito (mapa y tarjetas) y las barras de estado y de acciones.
  const lista = ordenarRecomendaciones(recsBase.filter((r) => porEstadoSel(r) && porTipoSel(r)));

  // Circuitos de cada criterio sobre TODAS las recomendaciones (lo que se filtra en el mapa).
  const claveEstado = (e) => circuitosDe(recs, (r) => r.estado === e);
  const claveTipo = (t) => circuitosDe(recs, (r) => r.tipo === t);
  const conClaves = circuitosDe(recs);
  const conSet = new Set(conClaves);
  const sinClaves = filas.filter((f) => !conSet.has(f.key)).map((f) => f.key);

  const kpiEstado = (estado, label) => (
    <Kpi key={estado} valor={rK.porEstado[estado]} label={label} color={COLOR_ESTADO_REC[estado]} activo={estadosSel.includes(estado)}
      proporcion={rK.total ? (rK.porEstado[estado] / rK.total) * 100 : 0}
      onClick={claveEstado(estado).length ? (e) => filtrar('rec:estado')({ id: estado, etiqueta: `Recomendación ${label}`, claves: claveEstado(estado) }, e) : undefined} />
  );

  return (
    <>
    <Tarjeta titulo="Seguimiento de recomendaciones" subtitulo="Lo que recomendó el equipo en las fichas y cuánto se ejecutó. Tocá un número o una barra para ver esos circuitos en el mapa.">
      {recs.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Todavía no hay recomendaciones cargadas. Se agregan desde la ficha de cada circuito, en “Decisión y seguimiento”.</p>
      ) : (
        <>
          <div className="plan-kpis plan-kpis-7" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <Kpi valor={rK.total} label="recomendaciones cargadas" color="#3478B5" />
            {kpiEstado('pendiente', 'Pendiente')}
            {kpiEstado('en_curso', 'En ejecución')}
            {kpiEstado('hecha', 'Cumplido')}
            <Kpi valor={fmtN(rK.pctCumplidas)} label="cumplidas" color={COLOR_ESTADO_REC.hecha} extra={`${rK.porEstado.hecha} de ${rK.total}`} proporcion={rK.pctCumplidas} />
            <Kpi valor={rK.conRecomendacion} de={nAlcance} label="subcircuitos con recomendación" color="#3478B5" activo={activosDe('seg:con').length > 0}
              onClick={conClaves.length ? (e) => filtrar('seg:con')({ id: 'con', etiqueta: 'Con recomendación', claves: conClaves }, e) : undefined} />
          </div>

          <ExportarListado recs={recs} />

          <div className="plan-seg-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18, alignItems: 'start' }}>
            <div className="plan-seg-izq" style={{ display: 'grid', gap: 18 }}>
              <div>
                <SubTitulo>Por estado</SubTitulo>
                <Barras items={ESTADOS_REC.map((e) => ({ id: e, label: ETIQUETA_ESTADO[e], valor: rEstado.porEstado[e], texto: `${rEstado.porEstado[e]}${rEstado.total ? ` · ${fmtN((rEstado.porEstado[e] / rEstado.total) * 100)}` : ''}`, color: COLOR_ESTADO_REC[e], claves: claveEstado(e), etiqueta: `Recomendación ${ETIQUETA_ESTADO[e]}` }))}
                  max={rEstado.total || 1} activos={estadosSel} onClick={filtrar('rec:estado')} />
              </div>

              <div>
                <SubTitulo>Principales acciones recomendadas</SubTitulo>
                <Barras items={rTipo.porTipo.map((t) => ({ id: t.tipo, label: t.label, valor: t.n, claves: claveTipo(t.tipo), etiqueta: `Acción: ${t.label}` }))}
                  max={Math.max(1, ...rTipo.porTipo.map((t) => t.n))} activos={tiposSel} onClick={filtrar('rec:tipo')} />
              </div>

              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div>
                  <SubTitulo>Ritmo</SubTitulo>
                  <div style={{ fontSize: 13 }}>Cumplidas en los últimos 7 días: <strong>{rK.cumplidas7}</strong></div>
                  <div style={{ fontSize: 13 }}>Cumplidas en los últimos 30 días: <strong>{rK.cumplidas30}</strong></div>
                </div>
              </div>
            </div>

            <div className="plan-no-print">
              <SubTitulo>Recomendaciones <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>({lista.length}{lista.length === recs.length ? '' : ` de ${recs.length}`}) · se filtran con las barras de estado y de acciones</span></SubTitulo>
              {lista.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No hay recomendaciones{clavesCircuito || tiposSel.length || estadosSel.length ? ' en este filtro' : ''}.</p> : (
                <div className="plan-lista-scroll" style={{ display: 'grid', gap: 0, maxHeight: 640, overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
                  {lista.map((r) => (
                    <button key={`${r.circuito}|${r.id}`} onClick={() => onAbrir(r.circuito)} title="Abrir la ficha de este circuito"
                      style={{ all: 'unset', boxSizing: 'border-box', display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 4px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <span style={{ paddingTop: 4 }}><PuntoPrioridad nivel={r.fila.prioridad.nivel} tamano={11} /></span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{r.fila.key} · {r.fila.nombre}</span>
                        <span style={{ display: 'block', fontSize: 13, textDecoration: r.estado === 'hecha' ? 'line-through' : 'none', color: r.estado === 'hecha' ? 'var(--text-secondary)' : 'inherit' }}>{textoAccion(r)}</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)' }}>Recomendada el {cuando(r.creada_en)}{r.estado === 'hecha' && r.hecha_en ? ` · Cumplida el ${cuando(r.hecha_en)}` : ''}</span>
                        {(r.etapas || []).length > 0 && (() => {
                          const e = ordenarEtapas(r.etapas).pop();
                          return <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-secondary)' }}>Última etapa ({r.etapas.length}): {fechaDMY(e.fecha)} — {e.texto}</span>;
                        })()}
                      </span>
                      <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 10, background: `${COLOR_ESTADO_REC[r.estado]}26`, color: COLOR_ESTADO_REC[r.estado] }}>{ETIQUETA_ESTADO[r.estado]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Tarjeta>
    {lista.length > 0 ? <ListadoImpresion lista={lista} pie={pie} /> : pie}
    </>
  );
}

// Hoja vertical del PDF (solo al imprimir): todas las recomendaciones (las que deja pasar el filtro) agrupadas por
// subcircuito y ordenadas por número de circuito, así las acciones de un mismo circuito quedan juntas.
function ListadoImpresion({ lista, pie }) {
  const grupos = useMemo(() => {
    const orden = [...lista].sort((a, b) => String(a.circuito).localeCompare(String(b.circuito), 'es', { numeric: true })
      || String(a.creada_en).localeCompare(String(b.creada_en)));
    const m = new Map();
    orden.forEach((r) => { if (!m.has(r.circuito)) m.set(r.circuito, []); m.get(r.circuito).push(r); });
    return [...m.values()];
  }, [lista]);
  const celda = { padding: '7px 8px', verticalAlign: 'top', borderBottom: '1px solid #E4E8EE' };
  return (
    <div className="plan-solo-print plan-hoja-lista" style={{ display: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 800, marginBottom: 2 }}>
        <span aria-hidden="true" style={{ width: 5, height: 20, borderRadius: 3, background: 'linear-gradient(180deg,#6CAEE5,#3478B5)' }} />
        Recomendaciones por subcircuito
      </div>
      <div style={{ fontSize: 12, color: '#5B6772', margin: '0 0 10px 15px' }}>{lista.length} {lista.length === 1 ? 'recomendación' : 'recomendaciones'} en {grupos.length} {grupos.length === 1 ? 'subcircuito' : 'subcircuitos'} · ordenados por circuito</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: '#F2F5F9', textAlign: 'left' }}>
            <th style={{ padding: '7px 8px', width: '30%' }}>Subcircuito</th>
            <th style={{ padding: '7px 8px' }}>Acción recomendada</th>
            <th style={{ padding: '7px 8px', width: 92 }}>Estado</th>
          </tr>
        </thead>
        {grupos.map((g) => (
          <tbody key={g[0].circuito} style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
            {g.map((r, i) => {
              const e = (r.etapas || []).length ? ordenarEtapas(r.etapas).pop() : null;
              return (
                <tr key={r.id}>
                  {i === 0 && (
                    <td rowSpan={g.length} style={{ ...celda, borderRight: '1px solid #E4E8EE' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 700 }}>
                        <PuntoPrioridad nivel={r.fila.prioridad.nivel} tamano={10} />{r.fila.key}
                      </span>
                      <div style={{ color: '#5B6772', marginLeft: 17 }}>{r.fila.nombre}</div>
                    </td>
                  )}
                  <td style={celda}>
                    <div style={{ fontWeight: 600, textDecoration: r.estado === 'hecha' ? 'line-through' : 'none' }}>{textoAccion(r)}</div>
                    <div style={{ fontSize: 11, color: '#8A94A0' }}>Recomendada el {cuando(r.creada_en)}{r.estado === 'hecha' && r.hecha_en ? ` · Cumplida el ${cuando(r.hecha_en)}` : ''}</div>
                    {e && <div style={{ fontSize: 11.5, color: '#5B6772' }}>Última etapa ({r.etapas.length}): {fechaDMY(e.fecha)} — {e.texto}</div>}
                  </td>
                  <td style={celda}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 10, background: `${COLOR_ESTADO_REC[r.estado]}26`, color: COLOR_ESTADO_REC[r.estado], whiteSpace: 'nowrap' }}>{ETIQUETA_ESTADO[r.estado]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
      {pie}
    </div>
  );
}

export default function HojaResumen({ filas, pautaDerivada, agregados: base, fichas, persistencia, filtros, setFiltros, onIr, onAbrir, hoyTexto }) {
  const [medida, setMedida] = useState('piezas'); // piezas | inversion
  const [combinar, setCombinar] = useState(false); // para pantallas táctiles (sin Ctrl)
  const k = base.kpis;
  const recs = useMemo(() => listarRecomendaciones(fichas, filas), [fichas, filas]);

  const clavesTodas = useMemo(() => combinarFiltros(filtros), [filtros]);
  const etiqueta = useMemo(() => etiquetaFiltros(filtros), [filtros]);

  // Cada tarjeta/KPI se calcula con los filtros de las OTRAS (así conserva sus barras para sumar o cambiar la selección).
  const aDe = useMemo(() => {
    const cache = new Map();
    return (origen) => {
      if (cache.has(origen)) return cache.get(origen);
      const claves = combinarFiltros(filtros, origen);
      const r = claves ? agregadosDeSubconjunto(filas, pautaDerivada, claves) : base;
      cache.set(origen, r);
      return r;
    };
  }, [filtros, filas, pautaDerivada, base]);
  const enFiltro = (origen) => combinarFiltros(filtros, origen) != null;
  const activosDe = (origen) => filtros.filter((f) => f.origen === origen).map((f) => f.id);
  const filtrar = (origen) => (it, e) => {
    const suma = combinar || !!(e && (e.ctrlKey || e.metaKey || e.shiftKey));
    setFiltros((prev) => alternarFiltro(prev, { origen, id: it.id, etiqueta: it.etiqueta, claves: it.claves }, suma));
  };
  const quitar = (f) => setFiltros((prev) => prev.filter((x) => !(x.origen === f.origen && x.id === f.id)));

  const leyenda = useMemo(() => distribucionPrioridad(filas, combinarFiltros(filtros, 'prioridad')), [filas, filtros]);
  const padronTotal = useMemo(() => padronDe(filas), [filas]);
  const padronFiltrado = useMemo(() => padronDe(filas, clavesTodas), [filas, clavesTodas]);

  // Filtro por subcircuito (circuito): se suma a los demás filtros; varios subcircuitos se suman entre sí (o).
  const agregarCircuito = (fila) => setFiltros((prev) => (prev.some((f) => f.origen === 'circuito' && f.id === fila.key)
    ? prev
    : [...prev, { origen: 'circuito', id: fila.key, etiqueta: `Subcircuito ${fila.key} · ${fila.nombre}`, claves: [fila.key] }]));

  const aTema = aDe('tema');
  const total = medida === 'piezas' ? aTema.tema.totalPiezas : aTema.tema.totalInversion;
  const ejes = [...aTema.tema.ejes].sort((x, y) => y[medida] - x[medida]);
  const seg = ejes.find((e) => e.eje === 'SEGURIDAD');
  const aCiegos = aDe('ciegos');
  const aClima = aDe('clima');
  const aProb = aDe('problema1');
  // Top de problemas: se calcula sobre los circuitos que dejan pasar los filtros de las OTRAS tarjetas.
  const clavesProb = combinarFiltros(filtros, 'problemas');
  const topProblemas = problemasTop(clavesProb ? filas.filter((f) => clavesProb.includes(f.key)) : filas, 10);
  const conEncuestaProb = (clavesProb ? filas.filter((f) => clavesProb.includes(f.key)) : filas).filter((f) => f.problemas.items.length > 0).length;

  return (
    <div className="plan-hoja-resumen">
      <div className="plan-no-print plan-hero" style={{ position: 'relative', overflow: 'hidden', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16, padding: '18px 24px', borderRadius: 20, border: '1px solid var(--border)', background: `linear-gradient(115deg, ${MARCA.azul}33 0%, #FFFFFF 50%, ${MARCA.dorado}26 100%)`, boxShadow: '0 2px 14px rgba(16,24,40,0.06)' }}>
        <img src={LOGOS.hacer} alt="" aria-hidden="true" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', height: 96, width: 'auto', opacity: 0.13, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', flex: '1 1 360px', minWidth: 260 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>Resumen · Córdoba Capital</h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '3px 0 9px' }}>Foto general de los {k.total} circuitos. Tocá un número, una barra o un color para filtrar todo el tablero.</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, padding: '3px 11px', borderRadius: 12, background: '#fff', border: '1px solid var(--border)' }}><strong>Ctrl + clic</strong> · suma más filtros</span>
            <span style={{ fontSize: 11.5, padding: '3px 11px', borderRadius: 12, background: '#fff', border: '1px solid var(--border)' }}><strong>Tocá un circuito</strong> · abre su ficha</span>
          </div>
        </div>
        <div style={{ position: 'relative', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <FiltroSubcircuito filas={filas} onElegir={agregarCircuito} />
          <Boton activo={combinar} onClick={() => setCombinar(!combinar)} titulo="Cada toque suma un filtro en vez de reemplazar (para pantallas táctiles, sin tecla Ctrl)" style={{ padding: '5px 12px', fontSize: 12.5 }}>Combinar filtros</Boton>
          <Boton onClick={() => window.print()} style={{ padding: '5px 12px', fontSize: 12.5 }}>Imprimir / PDF</Boton>
        </div>
      </div>
      <CabeceraImpresion titulo="Planificador territorial · Resumen" subtitulo="Tablero diagnóstico · Córdoba Capital"
        detalle={<><div>Generado el {hoyTexto}</div><div>{filtros.length ? `Filtro: ${etiqueta} (${clavesTodas.length} ${clavesTodas.length === 1 ? 'circuito' : 'circuitos'})` : 'Todos los circuitos'}</div></>} />

      <div className="plan-kpis" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Kpi valor={clavesTodas ? clavesTodas.length : k.total} de={clavesTodas ? k.total : null} label="circuitos" color="#3478B5"
          extra={`${fmtPctPadron(padronTotal ? (padronFiltrado / padronTotal) * 100 : 0)} del padrón de la ciudad`} proporcion={padronTotal ? (padronFiltrado / padronTotal) * 100 : 0} />
        {KPIS.map((d) => {
          const a = aDe(d.origen).kpis;
          const activo = activosDe(d.origen).length > 0;
          return (
            <Kpi key={d.origen} valor={a[d.campo].n} label={d.label} color={d.color} activo={activo}
              extra={d.extra ? d.extra(a) : `${pct(a[d.campo].n, a.total)} de los circuitos${clavesTodas ? ' del filtro' : ''}`}
              proporcion={a.total ? (a[d.campo].n / a.total) * 100 : 0}
              onClick={k[d.campo].claves.length ? (e) => filtrar(d.origen)({ id: d.campo, etiqueta: d.etiqueta, claves: k[d.campo].claves }, e) : undefined} />
          );
        })}
      </div>

      {filtros.length > 0 && (
        <div className="plan-no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, padding: '7px 12px', marginBottom: 12, borderRadius: 8, background: '#3478B518', color: '#2A6296' }}>
          <span><strong>{clavesTodas.length}</strong> {clavesTodas.length === 1 ? 'circuito' : 'circuitos'} en el filtro:</span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {filtros.map((f) => (
              <span key={`${f.origen}|${f.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 4px 2px 10px', borderRadius: 12, background: '#3478B526', fontSize: 12.5 }}>
                {f.etiqueta}
                <button onClick={() => quitar(f)} aria-label={`Quitar ${f.etiqueta}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', padding: '0 4px', fontSize: 13 }}>✕</button>
              </span>
            ))}
          </span>
          <Boton onClick={() => onIr(clavesTodas, etiqueta)} disabled={!clavesTodas.length} style={{ padding: '3px 10px', fontSize: 12 }}>Ver lista</Boton>
          <Boton primario onClick={() => setFiltros([])} style={{ padding: '3px 10px', fontSize: 12 }}>Limpiar filtro</Boton>
        </div>
      )}

      {/* En pantalla: mapa a la izquierda y las cinco tarjetas apiladas a la derecha (.plan-pag1 y .plan-pag2 son display:contents).
          Al imprimir: hoja 1 = mapa + clima + a ciegas; hoja 2 = pauta + top 10 + problema #1. */}
      <div className="plan-grilla-resumen" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(340px, 1fr)', gap: 12, alignItems: 'start' }}>
        <div className="plan-pag1">
          <div className="plan-mapa-col" style={{ position: 'sticky', top: 8 }}>
            <Tarjeta titulo="Córdoba Capital · situación por circuito" subtitulo={`${k.total} circuitos. Gris: sin medir · rojo: tendencia negativa · amarillo: estable o leve baja (hasta −3 pp) · verde: mejora. Se compara contra la encuesta anterior o, con una sola, contra Gobernación 2023.`}>
              <MapaResumen filas={filas} claves={clavesTodas} onAbrir={(key) => onAbrir(key, clavesTodas, etiqueta || null)} />
              <Leyenda items={leyenda} activos={activosDe('prioridad')} onClick={(d, e) => filtrar('prioridad')({ id: d.nivel, etiqueta: LABEL_PRIORIDAD[d.nivel], claves: d.claves }, e)} />
            </Tarjeta>
          </div>

          <Tarjeta titulo="¿Dónde estamos a ciegas?" claveImp="ciegos" filtrada={enFiltro('ciegos')} subtitulo="Circuitos según cantidad de rondas de encuesta">
            <Barras items={aCiegos.ciegos.distribucion.map((d) => ({ id: d.id, label: d.label, valor: d.n, claves: d.claves, etiqueta: d.label, color: d.id === 'sin_medir' ? '#808080' : undefined }))}
              max={aCiegos.kpis.total} activos={activosDe('ciegos')} onClick={filtrar('ciegos')} />
          </Tarjeta>

          <Tarjeta titulo="Clima electoral" claveImp="clima" filtrada={enFiltro('clima')} subtitulo="Circuitos por diagnóstico electoral">
            <Barras items={aClima.tiers.map((t) => ({ id: t.tier, label: TIERS[t.tier].label, valor: t.n, claves: t.claves, color: COLOR_TIER[t.tier], etiqueta: `Clima ${TIERS[t.tier].label}` }))}
              max={aClima.kpis.total} activos={activosDe('clima')} onClick={filtrar('clima')} />
          </Tarjeta>
        </div>

        <div className="plan-pag2">
          <Tarjeta titulo="Foco temático de la pauta" claveImp="tema" filtrada={enFiltro('tema')} subtitulo={`Pauta por eje temático · ${aTema.tema.totalPiezas.toLocaleString('es-AR')} piezas · ${millones(aTema.tema.totalInversion)} de inversión`}>
            <div className="plan-no-print" style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <Boton activo={medida === 'piezas'} onClick={() => setMedida('piezas')} style={{ padding: '3px 10px', fontSize: 12 }}>Piezas</Boton>
              <Boton activo={medida === 'inversion'} onClick={() => setMedida('inversion')} style={{ padding: '3px 10px', fontSize: 12 }}>Inversión</Boton>
            </div>
            {seg && <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{pct(seg[medida], total)} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>de {medida === 'piezas' ? 'las piezas' : 'la inversión'} es Seguridad</span></div>}
            <Barras
              items={ejes.map((e) => ({ id: e.eje, label: nombreEje(e.eje), valor: e[medida], texto: `${pct(e[medida], total)}`, claves: e.claves, tooltip: `${nombreEje(e.eje)}: ${e.piezas.toLocaleString('es-AR')} piezas · ${millones(e.inversion)} · ${e.claves.length} circuitos`, etiqueta: `Pauta de eje ${nombreEje(e.eje)}` }))}
              activos={activosDe('tema')} onClick={filtrar('tema')} />
          </Tarjeta>

          <Tarjeta titulo="Top 10 problemas reportados" claveImp="top" filtrada={enFiltro('problemas')} subtitulo={`En cuántos de los ${conEncuestaProb} circuitos con encuesta figura entre los 3 principales. Tocá uno para ver dónde.`}>
            <Barras
              items={topProblemas.map((p) => ({ id: p.cat, label: p.cat, valor: p.n, texto: `${p.n} · #1 en ${p.n1}`, claves: p.claves, etiqueta: `Problema reportado: ${p.cat}`, tooltip: `${p.cat}: entre los 3 principales en ${p.n} circuitos (#1 en ${p.n1}) · promedio ${p.promedio.toFixed(1).replace('.', ',')}% de menciones donde aparece` }))}
              max={conEncuestaProb || 1} activos={activosDe('problemas')} onClick={filtrar('problemas')} />
          </Tarjeta>

          <Tarjeta titulo="Problema #1 sin cobertura" claveImp="problema1" filtrada={enFiltro('problema1')} subtitulo="Circuitos donde el problema principal no tiene pauta ni obra (finalizada o en ejecución) que lo atienda">
            <button onClick={(e) => filtrar('problema1')({ id: 'total', etiqueta: 'Problema #1 sin cobertura', claves: aProb.problema1.claves }, e)} disabled={!aProb.problema1.claves.length}
              aria-pressed={activosDe('problema1').includes('total')}
              style={{ all: 'unset', cursor: aProb.problema1.claves.length ? 'pointer' : 'default', fontSize: 28, fontWeight: 700, display: 'block', marginBottom: 6, borderRadius: 4, boxShadow: activosDe('problema1').includes('total') ? 'inset 0 0 0 1.5px #3478B5' : 'none', padding: '0 4px' }}>
              {aProb.problema1.total} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>de {aProb.kpis.total - aProb.kpis.sinMedir.n} circuitos con encuesta</span>
            </button>
            <Barras items={aProb.problema1.porTipo.map((p) => ({ id: p.cat, label: p.cat, valor: p.n, claves: p.claves, etiqueta: `Problema #1 sin cobertura: ${p.cat}` }))}
              activos={activosDe('problema1')} onClick={filtrar('problema1')} />
          </Tarjeta>
        </div>
      </div>

      <div className="plan-pag3" style={{ marginTop: 12 }}>
        <SeguimientoRecomendaciones recs={recs} filas={filas} filtros={filtros} filtrar={filtrar} activosDe={activosDe}
          persistencia={persistencia} onAbrir={(key) => onAbrir(key, clavesTodas, etiqueta || null)}
          pie={<PieImpresion leyenda={`Planificador territorial · Resumen · generado el ${hoyTexto}`} />} />
      </div>
    </div>
  );
}
