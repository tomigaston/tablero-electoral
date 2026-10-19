// Hoja Resumen: la foto general, centrada en el mapa. Mapa de Córdoba Capital pintado por prioridad
// (izquierda) + 5 tarjetas temáticas (derecha). El filtro es compartido: tocar una barra de cualquier
// tarjeta (o un color de la leyenda) pinta en el mapa solo los circuitos que cumplen; las otras tarjetas
// se recalculan sobre ese subconjunto. Tocar un circuito del mapa abre su ficha.
import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { TIERS, COLOR_PRIORIDAD, LABEL_PRIORIDAD } from '../../lib/planificador/config';
import { agregadosDeSubconjunto, distribucionPrioridad, fmtPctPadron } from '../../lib/planificador/resumenMapa';
import { Boton } from './ui';

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

// Barras horizontales clickeables con tooltip. `activoId`: la barra que está filtrando el mapa.
function Barras({ items, max, onClick, activoId = null, formato = (v) => String(v) }) {
  const tope = max ?? Math.max(1, ...items.map((i) => i.valor));
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {items.map((it) => {
        const clic = onClick && it.claves?.length ? () => onClick(it) : undefined;
        const activa = activoId != null && it.id === activoId;
        const atenuada = activoId != null && !activa;
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

const Kpi = ({ valor, label, extra, onClick }) => (
  <button onClick={onClick} disabled={!onClick} style={{ flex: '1 1 200px', textAlign: 'left', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: onClick ? 'pointer' : 'default' }}>
    <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>{valor}</div>
    <div style={{ fontSize: 13, marginTop: 2 }}>{label}</div>
    {extra && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>{extra}</div>}
  </button>
);

// Leyenda del mapa: cuánta ciudad (circuitos y % del padrón) está en cada color. Cada fila filtra.
function Leyenda({ items, activoId, onClick }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--bg-secondary)' }} aria-hidden="true">
        {items.map((d) => <div key={d.nivel} style={{ width: `${d.pctPadron}%`, background: COLOR_PRIORIDAD[d.nivel] }} />)}
      </div>
      <div style={{ display: 'grid', gap: 2, marginTop: 8 }}>
        {items.map((d) => {
          const activa = activoId === d.nivel;
          return (
            <button key={d.nivel} onClick={() => onClick(d)} disabled={!d.claves.length} aria-pressed={activa}
              style={{ all: 'unset', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8, padding: '3px 6px', borderRadius: 4, cursor: d.claves.length ? 'pointer' : 'default', fontSize: 13, boxShadow: activa ? 'inset 0 0 0 1.5px #1976D2' : 'none' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: COLOR_PRIORIDAD[d.nivel], flexShrink: 0 }} />
              <span style={{ fontWeight: 600, minWidth: 100 }}>Prioridad {LABEL_PRIORIDAD[d.nivel]}</span>
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

export default function HojaResumen({ filas, pautaDerivada, agregados: base, seguimiento, persistencia, onIr, onAbrir, hoyTexto }) {
  const [medida, setMedida] = useState('piezas'); // piezas | inversion
  // Filtro compartido mapa <-> tarjetas: { origen, id, etiqueta, claves } | null
  const [filtro, setFiltro] = useState(null);
  const k = base.kpis;

  // Las demás tarjetas se recalculan sobre el subconjunto; la tarjeta que filtra conserva todas sus barras para poder cambiar de barra.
  const sub = useMemo(() => (filtro ? agregadosDeSubconjunto(filas, pautaDerivada, filtro.claves) : null), [filtro, filas, pautaDerivada]);
  const aDe = (origen) => (!sub || filtro.origen === origen ? base : sub);
  const enFiltro = (origen) => !!sub && filtro.origen !== origen;
  const activoDe = (origen) => (filtro && filtro.origen === origen ? filtro.id : null);
  const filtrar = (origen) => (it) => setFiltro(filtro && filtro.origen === origen && filtro.id === it.id
    ? null
    : { origen, id: it.id, etiqueta: it.etiqueta, claves: it.claves });

  const leyenda = useMemo(
    () => distribucionPrioridad(filas, filtro && filtro.origen !== 'prioridad' ? filtro.claves : null),
    [filas, filtro],
  );

  const aTema = aDe('tema');
  const total = medida === 'piezas' ? aTema.tema.totalPiezas : aTema.tema.totalInversion;
  const ejes = [...aTema.tema.ejes].sort((x, y) => y[medida] - x[medida]);
  const seg = ejes.find((e) => e.eje === 'SEGURIDAD');
  const aCiegos = aDe('ciegos');
  const aClima = aDe('clima');
  const aProb = aDe('problema1');
  const aObras = aDe('obras');

  return (
    <div>
      <div className="plan-no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tocá una barra para pintar en el mapa solo esos circuitos, o un circuito del mapa para abrir su ficha.</span>
        <Boton onClick={() => window.print()}>Imprimir / PDF</Boton>
      </div>
      <div className="plan-solo-print" style={{ display: 'none', fontSize: 11, marginBottom: 6 }}>Resumen · generado el {hoyTexto}</div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Kpi valor={k.total} label="circuitos" />
        <Kpi valor={k.sinMedir.n} label="sin medir" extra={`+ ${k.unaRonda.n} con una sola ronda`} onClick={() => onIr(k.sinMedir.claves, 'Sin medir')} />
        <Kpi valor={k.conObra.n} label="con obra lista" onClick={() => onIr(k.conObra.claves, 'Con obra lista para inaugurar')} />
        <Kpi valor={k.pautaSinMed.n} label="con pauta sin medición posterior" onClick={() => onIr(k.pautaSinMed.claves, 'Pauta sin medición posterior')} />
      </div>

      {filtro && (
        <div className="plan-no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, padding: '6px 12px', marginBottom: 12, borderRadius: 8, background: '#1976D218', color: '#1565C0' }}>
          <span style={{ flex: 1 }}>Filtro en el mapa: <strong>{filtro.etiqueta}</strong> · {filtro.claves.length} {filtro.claves.length === 1 ? 'circuito' : 'circuitos'}</span>
          <Boton onClick={() => onIr(filtro.claves, filtro.etiqueta)} style={{ padding: '3px 10px', fontSize: 12 }}>Ver lista</Boton>
          <Boton primario onClick={() => setFiltro(null)} style={{ padding: '3px 10px', fontSize: 12 }}>Limpiar filtro</Boton>
        </div>
      )}

      <div className="plan-grilla-resumen" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(340px, 1fr)', gap: 12, alignItems: 'start' }}>
        <div className="plan-mapa-col" style={{ position: 'sticky', top: 8 }}>
          <Tarjeta titulo="Córdoba Capital · prioridad por circuito" subtitulo={`${base.kpis.total} circuitos pintados según su prioridad (semáforo).`}>
            <MapaResumen filas={filas} claves={filtro ? filtro.claves : null} onAbrir={(key) => onAbrir(key, filtro ? filtro.claves : null, filtro ? filtro.etiqueta : null)} />
            <Leyenda items={leyenda} activoId={activoDe('prioridad')} onClick={(d) => filtrar('prioridad')({ id: d.nivel, etiqueta: `Prioridad ${LABEL_PRIORIDAD[d.nivel]}`, claves: d.claves })} />
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
              activoId={activoDe('tema')} onClick={filtrar('tema')} />
          </Tarjeta>

          <Tarjeta titulo="¿Dónde estamos a ciegas?" filtrada={enFiltro('ciegos')} subtitulo="Circuitos según cantidad de rondas de encuesta">
            <Barras items={aCiegos.ciegos.distribucion.map((d) => ({ id: d.id, label: d.label, valor: d.n, claves: d.claves, etiqueta: d.label, color: d.id === 'sin_medir' ? '#C62828' : undefined }))}
              max={aCiegos.kpis.total} activoId={activoDe('ciegos')} onClick={filtrar('ciegos')} />
          </Tarjeta>

          <Tarjeta titulo="Clima electoral" filtrada={enFiltro('clima')} subtitulo="Circuitos por tier de diagnóstico">
            <Barras items={aClima.tiers.map((t) => ({ id: t.tier, label: TIERS[t.tier].label, valor: t.n, claves: t.claves, color: COLOR_TIER[t.tier], etiqueta: `Clima ${TIERS[t.tier].label}` }))}
              max={aClima.kpis.total} activoId={activoDe('clima')} onClick={filtrar('clima')} />
          </Tarjeta>

          <Tarjeta titulo="Problema #1 sin cobertura" filtrada={enFiltro('problema1')} subtitulo="Circuitos donde el problema principal no tiene pauta ni obra (finalizada o en ejecución) que lo atienda">
            <button onClick={() => filtrar('problema1')({ id: 'total', etiqueta: 'Problema #1 sin cobertura', claves: aProb.problema1.claves })} disabled={!aProb.problema1.claves.length}
              style={{ all: 'unset', cursor: aProb.problema1.claves.length ? 'pointer' : 'default', fontSize: 28, fontWeight: 700, display: 'block', marginBottom: 6 }}>
              {aProb.problema1.total} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>de {aProb.kpis.total - aProb.kpis.sinMedir.n} circuitos con encuesta</span>
            </button>
            <Barras items={aProb.problema1.porTipo.map((p) => ({ id: p.cat, label: p.cat, valor: p.n, claves: p.claves, etiqueta: `Problema #1 sin cobertura: ${p.cat}` }))}
              activoId={activoDe('problema1')} onClick={filtrar('problema1')} />
          </Tarjeta>

          <Tarjeta titulo="Obras listas para inaugurar" filtrada={enFiltro('obras')} subtitulo={`${aObras.obras.totalObras} obras en espera, por antigüedad desde que están disponibles`}>
            <Barras items={aObras.obras.buckets.filter((b) => b.obras > 0).map((b) => ({ id: b.id, label: b.label, valor: b.obras, texto: `${b.obras} · ${b.claves.length} circ.`, claves: b.claves, etiqueta: `Obras listas: ${b.label}`, color: b.id === '180+' || b.id === '91-180' ? '#E65100' : undefined, tooltip: `${b.label}: ${b.obras} obras en ${b.claves.length} circuitos` }))}
              activoId={activoDe('obras')} onClick={filtrar('obras')} />
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Se refresca con el parte diario cuando está cargado; sin parte, sale de obras_capital.json.</p>
          </Tarjeta>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <Tarjeta titulo="Seguimiento del equipo" subtitulo="Decisiones y acciones cargadas en las fichas">
          {persistencia.disponible ? (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                {[['pendiente', 'Pendientes'], ['en_curso', 'En curso'], ['hecha', 'Hechas']].map(([id, label]) => (
                  <div key={id} style={{ flex: '1 1 80px', textAlign: 'center', padding: 8, borderRadius: 8, background: 'var(--bg-secondary)' }}>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{seguimiento[id]}</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => onIr(seguimiento.conDecision, 'Con decisión tomada')} disabled={!seguimiento.conDecision.length} style={{ all: 'unset', cursor: seguimiento.conDecision.length ? 'pointer' : 'default', fontSize: 13.5, display: 'block' }}>
                <strong>{seguimiento.conDecision.length}</strong> de {k.total} circuitos ya tienen una decisión
              </button>
              <button onClick={() => onIr(seguimiento.conPendientes, 'Con acciones pendientes o en curso')} disabled={!seguimiento.conPendientes.length} style={{ all: 'unset', cursor: seguimiento.conPendientes.length ? 'pointer' : 'default', fontSize: 13.5, display: 'block', marginTop: 4 }}>
                <strong>{seguimiento.conPendientes.length}</strong> con acciones pendientes o en curso
              </button>
            </>
          ) : <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{persistencia.cargando ? 'Cargando…' : `Sin datos de seguimiento: ${persistencia.mensaje || 'base de datos no disponible'}.`}</p>}
        </Tarjeta>
      </div>
    </div>
  );
}
