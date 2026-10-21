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
  listarRecomendaciones, resumenRecomendaciones, pendientesPorHacer, circuitosDe, ESTADOS_REC, COLOR_ESTADO_REC,
} from '../../lib/planificador/recomendaciones';
import { ETIQUETA_ESTADO, TIPOS_ACCION, ordenarEtapas } from '../../lib/planificador/acciones';
import { filasExportables, descargarCsv, abrirImpresion, subtituloListado } from '../../lib/planificador/exportar';
import { Boton, PuntoPrioridad } from './ui';

// Leaflet necesita el navegador: mismo criterio que MapaCircuitos en pages/index.js.
const MapaResumen = dynamic(() => import('./MapaResumen'), {
  ssr: false,
  loading: () => <div style={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', borderRadius: 8, color: 'var(--text-tertiary)' }}>Cargando mapa…</div>,
});

const COLOR_BARRA = '#1976D2';
// Colores de las categorías del tablero, usados acá solo para el clima electoral (semántico).
const COLOR_TIER = { favorable: '#2E7D32', intermedio: '#26A69A', desfavorable: '#FF7043', adverso: '#EF5350' };

const Tarjeta = ({ titulo, subtitulo, children, filtrada }) => (
  <section className="plan-seccion" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
    <h2 style={{ fontSize: 15, fontWeight: 700 }}>
      {titulo}
      {filtrada && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 8, background: '#1976D218', color: '#1565C0', verticalAlign: 'middle' }}>en el filtro</span>}
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
            style={{ all: 'unset', boxSizing: 'border-box', display: 'grid', gridTemplateColumns: 'minmax(110px, 38%) 1fr auto', gap: 8, alignItems: 'center', cursor: clic ? 'pointer' : 'default', padding: '2px 4px', borderRadius: 4, opacity: atenuada ? 0.45 : 1, boxShadow: activa ? 'inset 0 0 0 1.5px #1976D2' : 'none' }}>
            <span style={{ fontSize: 12.5, fontWeight: activa ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
            <span style={{ height: 14, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.max(2, (it.valor / tope) * 100)}%`, background: it.color || COLOR_BARRA, borderRadius: 3 }} />
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
  <button onClick={onClick} disabled={!onClick} aria-pressed={onClick ? !!activo : undefined}
    style={{ flex: '1 1 210px', textAlign: 'left', padding: '12px 16px 10px', borderRadius: 10, border: '1px solid var(--border)', borderLeft: `5px solid ${color}`, background: activo ? `${color}14` : 'var(--bg-primary)', color: 'var(--text-primary)', cursor: onClick ? 'pointer' : 'default', boxShadow: activo ? `0 0 0 2px ${color}55` : '0 1px 2px rgba(0,0,0,0.06)', transition: 'box-shadow .15s, background .15s' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>{valor}</span>
      {de != null && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>de {de}</span>}
    </div>
    <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>{label}</div>
    {extra && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>{extra}</div>}
    {proporcion != null && (
      <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-secondary)', marginTop: 8, overflow: 'hidden' }} aria-hidden="true">
        <div style={{ height: '100%', width: `${Math.max(2, Math.min(100, proporcion))}%`, background: color, borderRadius: 3 }} />
      </div>
    )}
  </button>
);

// Leyenda del mapa: cuánta ciudad (circuitos y % del padrón) está en cada color. Cada fila filtra.
function Leyenda({ items, activos, onClick }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--bg-secondary)' }} aria-hidden="true">
        {items.map((d) => <div key={d.nivel} style={{ width: `${d.pctPadron}%`, background: COLOR_PRIORIDAD[d.nivel] }} />)}
      </div>
      <div style={{ display: 'grid', gap: 2, marginTop: 8 }}>
        {items.map((d) => {
          const activa = activos.includes(d.nivel);
          return (
            <button key={d.nivel} onClick={(e) => onClick(d, e)} disabled={!d.claves.length} aria-pressed={activa}
              style={{ all: 'unset', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8, padding: '3px 6px', borderRadius: 4, cursor: d.claves.length ? 'pointer' : 'default', fontSize: 13, opacity: activos.length && !activa ? 0.5 : 1, boxShadow: activa ? 'inset 0 0 0 1.5px #1976D2' : 'none' }}>
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
  { origen: 'kpi:sinMedir', campo: 'sinMedir', label: 'sin medir', etiqueta: 'Sin medir', color: '#C62828', extra: (k) => `+ ${k.unaRonda.n} con una sola ronda` },
  { origen: 'kpi:conObra', campo: 'conObra', label: 'con obra lista', etiqueta: 'Con obra lista para inaugurar', color: '#2E7D32' },
  { origen: 'kpi:pautaSinMed', campo: 'pautaSinMed', label: 'con pauta sin medición posterior', etiqueta: 'Pauta sin medición posterior', color: '#E65100' },
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
// Fecha sin hora ("2026-10-28") a dd/mm: formateada a mano para que no se corra un día por la zona horaria.
const fechaDMY = (f) => { const [y, m, d] = String(f).slice(0, 10).split('-'); return d && m ? `${d}/${m}/${y}` : ''; };
const SubTitulo =({ children }) => <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>{children}</h3>;

// Seguimiento de recomendaciones del equipo: qué se pidió en las fichas y cuánto se ejecutó. Lee de las mismas fichas
// (KV). Tocar un número o una barra pinta en el mapa los circuitos con esa recomendación (mismo filtro compartido).
function SeguimientoRecomendaciones({ recs, filas, filtros, filtrar, activosDe, persistencia, onAbrir }) {
  const [verTodas, setVerTodas] = useState(false);
  if (!persistencia.disponible) {
    return (
      <Tarjeta titulo="Seguimiento de recomendaciones">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{persistencia.cargando ? 'Cargando…' : `Sin datos de seguimiento: ${persistencia.mensaje || 'base de datos no disponible'}.`}</p>
      </Tarjeta>
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
  const lista = pendientesPorHacer(recsBase.filter(porTipoSel));
  const visibles = verTodas ? lista : lista.slice(0, 12);

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
    <Tarjeta titulo="Seguimiento de recomendaciones" subtitulo="Lo que recomendó el equipo en las fichas y cuánto se ejecutó. Tocá un número o una barra para ver esos circuitos en el mapa.">
      {recs.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Todavía no hay recomendaciones cargadas. Se agregan desde la ficha de cada circuito, en “Decisión y seguimiento”.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <Kpi valor={rK.total} label="recomendaciones cargadas" color="#1976D2" />
            {kpiEstado('pendiente', 'Pendiente')}
            {kpiEstado('en_curso', 'En ejecución')}
            {kpiEstado('hecha', 'Cumplido')}
            <Kpi valor={fmtN(rK.pctCumplidas)} label="cumplidas" color={COLOR_ESTADO_REC.hecha} extra={`${rK.porEstado.hecha} de ${rK.total}`} proporcion={rK.pctCumplidas} />
            <Kpi valor={rK.conRecomendacion} de={nAlcance} label="subcircuitos con recomendación" color="#1976D2" activo={activosDe('seg:con').length > 0}
              onClick={conClaves.length ? (e) => filtrar('seg:con')({ id: 'con', etiqueta: 'Con recomendación', claves: conClaves }, e) : undefined} />
            <Kpi valor={rK.sinRecomendacion} de={nAlcance} label="subcircuitos sin ninguna" color="#78909C" activo={activosDe('seg:sin').length > 0}
              onClick={sinClaves.length ? (e) => filtrar('seg:sin')({ id: 'sin', etiqueta: 'Sin recomendación', claves: sinClaves }, e) : undefined} />
          </div>

          <ExportarListado recs={recs} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18, alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: 18 }}>
              <div>
                <SubTitulo>Por estado</SubTitulo>
                <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-secondary)', marginBottom: 8 }} aria-hidden="true">
                  {ESTADOS_REC.map((e) => <div key={e} style={{ width: `${rEstado.total ? (rEstado.porEstado[e] / rEstado.total) * 100 : 0}%`, background: COLOR_ESTADO_REC[e] }} />)}
                </div>
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
                {rK.usuarios.length > 0 && (
                  <div>
                    <SubTitulo>Actividad del equipo</SubTitulo>
                    {rK.usuarios.slice(0, 6).map((u) => (
                      <div key={u.usuario} style={{ fontSize: 13 }}><strong>{u.usuario}</strong> · recomendó {u.recomendo} · cumplió {u.cumplio}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <SubTitulo>Pendientes por hacer <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>({lista.length}, primero los circuitos en rojo y sin medir)</span></SubTitulo>
              {lista.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No hay recomendaciones pendientes o en ejecución{clavesCircuito || tiposSel.length ? ' en este filtro' : ''}.</p> : (
                <div style={{ display: 'grid', gap: 0 }}>
                  {visibles.map((r) => (
                    <button key={`${r.circuito}|${r.id}`} onClick={() => onAbrir(r.circuito)} title="Abrir la ficha de este circuito"
                      style={{ all: 'unset', boxSizing: 'border-box', display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 4px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <span style={{ paddingTop: 4 }}><PuntoPrioridad nivel={r.fila.prioridad.nivel} tamano={11} /></span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{r.fila.key} · {r.fila.nombre}</span>
                        <span style={{ display: 'block', fontSize: 13 }}>{r.texto}</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)' }}>Recomendó {r.creada_por} · {cuando(r.creada_en)}</span>
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
              {lista.length > 12 && <Boton onClick={() => setVerTodas(!verTodas)} style={{ marginTop: 8, padding: '4px 12px', fontSize: 12 }}>{verTodas ? 'Ver menos' : `Ver las ${lista.length - 12} restantes`}</Boton>}
            </div>
          </div>
        </>
      )}
    </Tarjeta>
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

  const aTema = aDe('tema');
  const total = medida === 'piezas' ? aTema.tema.totalPiezas : aTema.tema.totalInversion;
  const ejes = [...aTema.tema.ejes].sort((x, y) => y[medida] - x[medida]);
  const seg = ejes.find((e) => e.eje === 'SEGURIDAD');
  const aCiegos = aDe('ciegos');
  const aClima = aDe('clima');
  const aProb = aDe('problema1');
  const aObras = aDe('obras');
  // Top de problemas: se calcula sobre los circuitos que dejan pasar los filtros de las OTRAS tarjetas.
  const clavesProb = combinarFiltros(filtros, 'problemas');
  const topProblemas = problemasTop(clavesProb ? filas.filter((f) => clavesProb.includes(f.key)) : filas, 10);
  const conEncuestaProb = (clavesProb ? filas.filter((f) => clavesProb.includes(f.key)) : filas).filter((f) => f.problemas.items.length > 0).length;

  return (
    <div>
      <div className="plan-no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tocá un número, una barra o un color para filtrar todo. <strong>Ctrl + clic</strong> suma más filtros. Tocá un circuito del mapa para abrir su ficha.</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <Boton activo={combinar} onClick={() => setCombinar(!combinar)} titulo="Cada toque suma un filtro en vez de reemplazar (para pantallas táctiles, sin tecla Ctrl)" style={{ padding: '5px 12px', fontSize: 12.5 }}>Combinar filtros</Boton>
          <Boton onClick={() => window.print()} style={{ padding: '5px 12px', fontSize: 12.5 }}>Imprimir / PDF</Boton>
        </div>
      </div>
      <div className="plan-solo-print" style={{ display: 'none', fontSize: 11, marginBottom: 6 }}>Resumen · generado el {hoyTexto}</div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Kpi valor={clavesTodas ? clavesTodas.length : k.total} de={clavesTodas ? k.total : null} label="circuitos" color="#1976D2"
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
        <div className="plan-no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, padding: '7px 12px', marginBottom: 12, borderRadius: 8, background: '#1976D218', color: '#1565C0' }}>
          <span><strong>{clavesTodas.length}</strong> {clavesTodas.length === 1 ? 'circuito' : 'circuitos'} en el filtro:</span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {filtros.map((f) => (
              <span key={`${f.origen}|${f.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 4px 2px 10px', borderRadius: 12, background: '#1976D226', fontSize: 12.5 }}>
                {f.etiqueta}
                <button onClick={() => quitar(f)} aria-label={`Quitar ${f.etiqueta}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', padding: '0 4px', fontSize: 13 }}>✕</button>
              </span>
            ))}
          </span>
          <Boton onClick={() => onIr(clavesTodas, etiqueta)} disabled={!clavesTodas.length} style={{ padding: '3px 10px', fontSize: 12 }}>Ver lista</Boton>
          <Boton primario onClick={() => setFiltros([])} style={{ padding: '3px 10px', fontSize: 12 }}>Limpiar filtro</Boton>
        </div>
      )}

      <div className="plan-grilla-resumen" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(340px, 1fr)', gap: 12, alignItems: 'start' }}>
        <div className="plan-mapa-col" style={{ position: 'sticky', top: 8 }}>
          <Tarjeta titulo="Córdoba Capital · situación por circuito" subtitulo={`${k.total} circuitos. Azul: sin medir · rojo: tendencia negativa · amarillo: estable o leve baja (hasta −3 pp) · verde: mejora. Se compara contra la encuesta anterior o, con una sola, contra Gobernación 2023.`}>
            <MapaResumen filas={filas} claves={clavesTodas} onAbrir={(key) => onAbrir(key, clavesTodas, etiqueta || null)} />
            <Leyenda items={leyenda} activos={activosDe('prioridad')} onClick={(d, e) => filtrar('prioridad')({ id: d.nivel, etiqueta: LABEL_PRIORIDAD[d.nivel], claves: d.claves }, e)} />
          </Tarjeta>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <Tarjeta titulo="Foco temático de la pauta" filtrada={enFiltro('tema')} subtitulo={`Pauta por eje temático · ${aTema.tema.totalPiezas.toLocaleString('es-AR')} piezas · ${millones(aTema.tema.totalInversion)} de inversión`}>
            <div className="plan-no-print" style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <Boton activo={medida === 'piezas'} onClick={() => setMedida('piezas')} style={{ padding: '3px 10px', fontSize: 12 }}>Piezas</Boton>
              <Boton activo={medida === 'inversion'} onClick={() => setMedida('inversion')} style={{ padding: '3px 10px', fontSize: 12 }}>Inversión</Boton>
            </div>
            {seg && <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{pct(seg[medida], total)} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>de {medida === 'piezas' ? 'las piezas' : 'la inversión'} es Seguridad</span></div>}
            <Barras
              items={ejes.map((e) => ({ id: e.eje, label: nombreEje(e.eje), valor: e[medida], texto: `${pct(e[medida], total)}`, claves: e.claves, tooltip: `${nombreEje(e.eje)}: ${e.piezas.toLocaleString('es-AR')} piezas · ${millones(e.inversion)} · ${e.claves.length} circuitos`, etiqueta: `Pauta de eje ${nombreEje(e.eje)}` }))}
              activos={activosDe('tema')} onClick={filtrar('tema')} />
          </Tarjeta>

          <Tarjeta titulo="¿Dónde estamos a ciegas?" filtrada={enFiltro('ciegos')} subtitulo="Circuitos según cantidad de rondas de encuesta">
            <Barras items={aCiegos.ciegos.distribucion.map((d) => ({ id: d.id, label: d.label, valor: d.n, claves: d.claves, etiqueta: d.label, color: d.id === 'sin_medir' ? '#C62828' : undefined }))}
              max={aCiegos.kpis.total} activos={activosDe('ciegos')} onClick={filtrar('ciegos')} />
          </Tarjeta>

          <Tarjeta titulo="Clima electoral" filtrada={enFiltro('clima')} subtitulo="Circuitos por tier de diagnóstico">
            <Barras items={aClima.tiers.map((t) => ({ id: t.tier, label: TIERS[t.tier].label, valor: t.n, claves: t.claves, color: COLOR_TIER[t.tier], etiqueta: `Clima ${TIERS[t.tier].label}` }))}
              max={aClima.kpis.total} activos={activosDe('clima')} onClick={filtrar('clima')} />
          </Tarjeta>

          <Tarjeta titulo="Top 10 problemas reportados" filtrada={enFiltro('problemas')} subtitulo={`En cuántos de los ${conEncuestaProb} circuitos con encuesta figura entre los 3 principales (última encuesta, sin “Otro”). Tocá uno para ver dónde.`}>
            <Barras
              items={topProblemas.map((p) => ({ id: p.cat, label: p.cat, valor: p.n, texto: `${p.n} · #1 en ${p.n1}`, claves: p.claves, etiqueta: `Problema reportado: ${p.cat}`, tooltip: `${p.cat}: entre los 3 principales en ${p.n} circuitos (#1 en ${p.n1}) · promedio ${p.promedio.toFixed(1).replace('.', ',')}% de menciones donde aparece` }))}
              max={conEncuestaProb || 1} activos={activosDe('problemas')} onClick={filtrar('problemas')} />
          </Tarjeta>

          <Tarjeta titulo="Problema #1 sin cobertura" filtrada={enFiltro('problema1')} subtitulo="Circuitos donde el problema principal no tiene pauta ni obra (finalizada o en ejecución) que lo atienda">
            <button onClick={(e) => filtrar('problema1')({ id: 'total', etiqueta: 'Problema #1 sin cobertura', claves: aProb.problema1.claves }, e)} disabled={!aProb.problema1.claves.length}
              aria-pressed={activosDe('problema1').includes('total')}
              style={{ all: 'unset', cursor: aProb.problema1.claves.length ? 'pointer' : 'default', fontSize: 28, fontWeight: 700, display: 'block', marginBottom: 6, borderRadius: 4, boxShadow: activosDe('problema1').includes('total') ? 'inset 0 0 0 1.5px #1976D2' : 'none', padding: '0 4px' }}>
              {aProb.problema1.total} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>de {aProb.kpis.total - aProb.kpis.sinMedir.n} circuitos con encuesta</span>
            </button>
            <Barras items={aProb.problema1.porTipo.map((p) => ({ id: p.cat, label: p.cat, valor: p.n, claves: p.claves, etiqueta: `Problema #1 sin cobertura: ${p.cat}` }))}
              activos={activosDe('problema1')} onClick={filtrar('problema1')} />
          </Tarjeta>

          <Tarjeta titulo="Obras listas para inaugurar" filtrada={enFiltro('obras')} subtitulo={`${aObras.obras.totalObras} obras en espera, por antigüedad desde que están disponibles`}>
            <Barras items={aObras.obras.buckets.filter((b) => b.obras > 0).map((b) => ({ id: b.id, label: b.label, valor: b.obras, texto: `${b.obras} · ${b.claves.length} circ.`, claves: b.claves, etiqueta: `Obras listas: ${b.label}`, color: b.id === '180+' || b.id === '91-180' ? '#E65100' : undefined, tooltip: `${b.label}: ${b.obras} obras en ${b.claves.length} circuitos` }))}
              activos={activosDe('obras')} onClick={filtrar('obras')} />
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Se refresca con el parte diario cuando está cargado; sin parte, sale de obras_capital.json.</p>
          </Tarjeta>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <SeguimientoRecomendaciones recs={recs} filas={filas} filtros={filtros} filtrar={filtrar} activosDe={activosDe}
          persistencia={persistencia} onAbrir={(key) => onAbrir(key, clavesTodas, etiqueta || null)} />
      </div>
    </div>
  );
}
