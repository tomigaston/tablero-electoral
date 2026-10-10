import { useState, useMemo, useEffect } from 'react';
import {
  escenariosDeEncuesta, ordenarFilas, punteroYDiferencia, variacion, alinearComparativo, escenariosEnAmbas,
  nombreCandidato, tipoCandidato, NOTA_SIN_CONNOTACION, notaNumeracion,
  esCandidatoDestacado, titularEscenario, ACLARACION_ESCENARIOS,
} from '../lib/intencionVoto';
import { formatearFecha } from '../lib/formatearFecha';
import { ChipRonda } from './ChipRonda';
import { fechaRondaActual } from '../lib/lecturaRondas';

// Intención de voto — Gobernador. Componentes puros (sirven igual en pantalla y en el reporte
// PDF, que los renderiza a HTML estático) + SeccionIntencionVoto, que agrega los selectores.
// Los porcentajes se muestran tal cual vienen: no se recalculan ni se completan.

const fmtPct = (v) => (v == null ? '—' : `${v.toFixed(1)}%`);
const COLOR_VARIACION = '#546E7A'; // neutro a propósito: acá subir no es "bueno" ni "malo"
const sinSigno = (n) => (n > 0 ? '+' : n < 0 ? '−' : '');

const Variacion = ({ v }) => {
  if (!v) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
  if (v.estado === 'estable') return <span style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>· Estable</span>;
  return <span style={{ color: COLOR_VARIACION, fontWeight: 600, whiteSpace: 'nowrap' }}>{v.estado === 'sube' ? '▲' : '▼'} {sinSigno(v.delta)}{Math.abs(v.delta).toFixed(1)} pp</span>;
};

// Barra fina SVG de apoyo visual (sin librerías). escalaMax: valor que ocupa el 100% del ancho.
const BarraFina = ({ valor, escalaMax, color }) => {
  const ancho = valor == null || !escalaMax ? 0 : Math.max(0, Math.min(100, (valor / escalaMax) * 100));
  return (
    <svg viewBox="0 0 100 6" preserveAspectRatio="none" width="100%" height="6" role="presentation" aria-hidden="true" style={{ display: 'block' }}>
      <rect x="0" y="0" width="100" height="6" rx="3" fill="#E5E7EB" />
      {ancho > 0 && <rect x="0" y="0" width={ancho} height="6" rx="3" fill={color} />}
    </svg>
  );
};

// Encabezado de cada tabla: el chip de ronda (el mismo de todo el reporte), con n.
const EncabezadoTabla = ({ fecha, casos, compacto, actual }) => (
  <div style={{ marginBottom: compacto ? '5px' : '8px' }}>
    <ChipRonda fecha={fecha} casos={casos} actual={actual} />
  </div>
);

// Una tabla: filas = candidatos. filas: [{ clave, valor, variacion? }]. conVariacion agrega la columna Δ pp.
export const TablaEscenario = ({ fecha, casos, filas, meta, conVariacion = false, escalaMax, resaltar = true, compacto = false, actual = false }) => {
  const pad = compacto ? '3px 9px' : '7px 10px';
  const valores = Object.fromEntries(filas.filter(f => f.valor != null).map(f => [f.clave, f.valor]));
  const puntero = resaltar ? punteroYDiferencia(valores, meta) : null;
  const max = escalaMax || Math.max(...Object.values(valores), 1);
  return (
    <div style={{ minWidth: 0, breakInside: 'avoid' }}>
      <EncabezadoTabla fecha={fecha} casos={casos} compacto={compacto} actual={actual} />
      <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', backgroundColor: 'var(--bg-primary)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
          <colgroup>
            <col />
            <col style={{ width: '74px' }} />
            {conVariacion && <col style={{ width: '84px' }} />}
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 500, fontSize: '11px', color: 'var(--text-tertiary)' }}>Candidato</th>
              <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 500, fontSize: '11px', color: 'var(--text-tertiary)' }}>%</th>
              {conVariacion && <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 500, fontSize: '11px', color: 'var(--text-tertiary)' }}>vs. anterior</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map(f => {
              const esPrimero = puntero && f.clave === puntero.primero;
              const esDestacado = esCandidatoDestacado(f.clave, meta);
              const tipo = tipoCandidato(f.clave, meta);
              const color = esDestacado ? '#0D47A1' : tipo === 'candidato' ? '#1976D2' : '#9AA5B1';
              // Dos marcas distintas: el PRIMERO (fondo azul claro + etiqueta) y Llaryora (franja azul oscuro a la
              // izquierda + fondo), que se ve en TODOS los escenarios. Si coinciden se suman.
              return (
                <tr key={f.clave} data-fila={esDestacado ? 'destacado' : undefined} style={{ borderTop: '1px solid var(--border)', backgroundColor: esDestacado ? '#0D47A118' : esPrimero ? '#1976D20F' : 'transparent', boxShadow: esDestacado ? 'inset 4px 0 0 #0D47A1' : 'none' }}>
                  <td style={{ padding: pad, paddingLeft: esDestacado ? '14px' : undefined, verticalAlign: 'middle', color: tipo === 'candidato' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: esPrimero || esDestacado ? 700 : 400, overflowWrap: 'anywhere' }}>
                    {nombreCandidato(f.clave, meta)}
                    {esPrimero && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 700, color: '#1565C0' }}>PRIMERO</span>}
                    <div style={{ marginTop: compacto ? '1px' : '3px', opacity: f.valor == null ? 0 : 1 }}><BarraFina valor={f.valor} escalaMax={max} color={color} /></div>
                  </td>
                  <td style={{ padding: pad, textAlign: 'right', verticalAlign: 'top', fontSize: compacto ? '14px' : '15px', fontWeight: esPrimero || esDestacado ? 800 : 600, color: f.valor == null ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{fmtPct(f.valor)}</td>
                  {conVariacion && <td style={{ padding: pad, textAlign: 'right', verticalAlign: 'top', fontSize: '12px' }}><Variacion v={f.variacion} /></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {puntero && puntero.segundo != null && (
        <div style={{ marginTop: compacto ? '4px' : '6px', fontSize: compacto ? '11px' : '12px', color: 'var(--text-secondary)' }}>
          Diferencia entre el primero y el segundo: <strong style={{ color: 'var(--text-primary)' }}>{puntero.diferencia.toFixed(1)} pp</strong> ({nombreCandidato(puntero.primero, meta)} vs. {nombreCandidato(puntero.segundo, meta)}).
        </div>
      )}
    </div>
  );
};


// Titular de la sección: Escenario 1 (la lista completa de la ronda) — quién va primero, su %, la diferencia con el
// segundo y dónde está Llaryora. Dice la verdad aunque Llaryora no sea el primero. Pensado para leerse en 10 segundos.
// ronda: { fecha, casos, escenarios }; anterior (opcional): ronda previa, para una línea "Antes".
const linea = (t, meta) => {
  if (!t) return null;
  if (t.empate) return `Empate entre ${nombreCandidato(t.primero, meta)} y ${nombreCandidato(t.segundo, meta)}: ${t.valorPrimero.toFixed(1)}%`;
  return `${nombreCandidato(t.primero, meta)} ${t.valorPrimero.toFixed(1)}%${t.segundo != null ? ` sobre ${nombreCandidato(t.segundo, meta)} ${t.valorSegundo.toFixed(1)}% (+${t.diferencia.toFixed(1)} pp)` : ''}`;
};
export const TitularVoto = ({ ronda, meta, fechaActual = null, anterior = null }) => {
  const esc1 = ronda?.escenarios?.[0];
  if (!esc1) return <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '0 0 10px' }}>Sin escenarios de voto en esta ronda.</p>;
  const t = titularEscenario(esc1.valores, meta);
  if (!t) return null;
  const d = t.destacado;
  const esc1Ant = anterior?.escenarios?.find(e => e.id === esc1.id);
  const tAnt = esc1Ant ? titularEscenario(esc1Ant.valores, meta) : null;
  return (
    <div data-titular-voto style={{ border: '1px solid var(--border)', borderLeft: '4px solid #0D47A1', borderRadius: '10px', padding: '10px 14px', margin: '0 0 12px', backgroundColor: 'var(--bg-primary)', breakInside: 'avoid', breakAfter: 'avoid' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', marginBottom: '4px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
        <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Escenario 1 · {esc1.nombre}</span>
        <ChipRonda fecha={ronda.fecha} casos={ronda.casos} actual={ronda.fecha === fechaActual} />
      </div>
      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
        {t.empate ? '' : '1° '}{linea(t, meta)}
      </div>
      {d && !d.esPrimero && !t.empate && (
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0D47A1', marginTop: '2px' }}>{nombreCandidato(d.clave, meta)} va {d.ordinal} con {d.valor.toFixed(1)}%.</div>
      )}
      {d && d.esPrimero && !t.empate && <div style={{ fontSize: '12px', color: '#0D47A1', marginTop: '2px' }}>{nombreCandidato(d.clave, meta)} va primero.</div>}
      {tAnt && (
        <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
          Antes, {formatearFecha(anterior.fecha)}: {tAnt.empate ? '' : '1° '}{linea(tAnt, meta)}.
        </div>
      )}
    </div>
  );
};

// Lista de candidatos que componen el escenario (qué cambia de un escenario a otro).
const ChipsCandidatos = ({ claves, meta }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
    {claves.map(c => {
      const tipo = tipoCandidato(c, meta);
      return <span key={c} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '999px', backgroundColor: 'var(--bg-secondary)', color: tipo === 'candidato' ? 'var(--text-primary)' : 'var(--text-tertiary)', border: '1px solid var(--border)' }}>{nombreCandidato(c, meta)}</span>;
    })}
  </div>
);

// Título del escenario: "Escenario N · nombre · sufijo". Los candidatos ya están en la tabla.
export const TituloEscenario = ({ escenario, orden, sufijo, compacto }) => (
  <div style={{ marginBottom: compacto ? '5px' : '8px', breakAfter: 'avoid' }}>
    <div style={{ fontSize: compacto ? '12.5px' : '14px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.25 }}>
      {orden != null ? `Escenario ${orden} · ` : ''}{escenario}{sufijo ? ` · ${sufijo}` : ''}
    </div>
  </div>
);

// UNA ronda, UN escenario.
export const EscenarioRonda = ({ ronda, escenario, meta, conTitulo = true, sufijo, compacto = false, fechaActual = null }) => {
  const esc = ronda.escenarios.find(e => e.id === escenario);
  if (!esc) return null;
  const filas = ordenarFilas(esc.valores, meta).map(c => ({ clave: c, valor: esc.valores[c] }));
  return (
    <div style={{ breakInside: 'avoid' }}>
      {conTitulo
        ? <TituloEscenario escenario={esc.nombre} orden={esc.orden} sufijo={sufijo} compacto={compacto} />
        : <ChipsCandidatos claves={filas.map(f => f.clave)} meta={meta} />}
      <div style={{ maxWidth: '480px' }}><TablaEscenario fecha={ronda.fecha} casos={ronda.casos} filas={filas} meta={meta} compacto={compacto} actual={ronda.fecha === fechaActual} /></div>
    </div>
  );
};

// Dos rondas lado a lado (en pantallas angostas se apilan, cada una con su fecha de encabezado).
export const EscenarioComparativo = ({ rondaA, rondaB, escenario, meta, umbral, conTitulo = true, conNota = true, sufijo, fechaActual = null }) => {
  const a = rondaA.escenarios.find(e => e.id === escenario);
  const b = rondaB.escenarios.find(e => e.id === escenario);
  if (!a || !b) return null;
  const alineadas = alinearComparativo(a.valores, b.valores, meta);
  const escalaMax = Math.max(...alineadas.flatMap(f => [f.a ?? 0, f.b ?? 0]), 1);
  const filasA = alineadas.map(f => ({ clave: f.clave, valor: f.a }));
  const filasB = alineadas.map(f => ({ clave: f.clave, valor: f.b, variacion: variacion(f.b, f.a, umbral) }));
  const solo = alineadas.some(f => f.a == null || f.b == null);
  return (
    <div style={{ breakInside: 'avoid' }}>
      {conTitulo && <TituloEscenario escenario={b.nombre} orden={b.orden} sufijo={sufijo} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '16px', alignItems: 'start' }}>
        <TablaEscenario fecha={rondaA.fecha} casos={rondaA.casos} filas={filasA} meta={meta} escalaMax={escalaMax} actual={rondaA.fecha === fechaActual} />
        <TablaEscenario fecha={rondaB.fecha} casos={rondaB.casos} filas={filasB} meta={meta} escalaMax={escalaMax} conVariacion actual={rondaB.fecha === fechaActual} />
      </div>
      {conNota && <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
        {NOTA_SIN_CONNOTACION}{' '}
        {`"Estable" = cambio menor a ${umbral} pp. `}
        {solo && '"—" indica que el candidato no figuraba en esa ronda (no es 0%).'}
      </div>}
    </div>
  );
};

const selectStyle = { padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', backgroundColor: '#fff', maxWidth: '100%' };
const Aviso = ({ children }) => <div style={{ fontSize: '12px', color: '#8a5a00', backgroundColor: '#fff4dc', border: '1px solid #f0d28a', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px' }}>{children}</div>;

// Sección interactiva para la solapa Encuestas (y el resumen del barrio).
// vista: 'resumen' (una ronda: la elegida arriba en la solapa) | 'comparativo' (dos rondas).
export const SeccionIntencionVoto = ({ encuesta, meta, umbral = 2.5, vista = 'resumen', fechaRonda, aclaracion }) => {
  const fechaActualEncuesta = fechaRondaActual(encuesta?.rondas);
  const datos = useMemo(() => escenariosDeEncuesta(encuesta, meta), [encuesta, meta]);
  const rondas = datos.rondas;
  const [escId, setEscId] = useState(null);
  const [iA, setIA] = useState(Math.max(rondas.length - 2, 0));
  const [iB, setIB] = useState(Math.max(rondas.length - 1, 0));
  useEffect(() => { setIA(Math.max(rondas.length - 2, 0)); setIB(Math.max(rondas.length - 1, 0)); setEscId(null); }, [rondas.length, encuesta]);
  if (!meta || rondas.length === 0) return null;

  const titulo = <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 500 }}>Intención de voto — Gobernador</h4>;
  const comparar = vista === 'comparativo' && rondas.length >= 2;
  const rondaB = rondas[Math.min(iB, rondas.length - 1)];
  const rondaA = rondas[Math.min(iA, rondas.length - 1)];

  // Ronda mostrada en vista "resumen": la elegida en la solapa si tiene escenarios; si no, la última que los tiene.
  const rondaPedida = rondas.find(r => r.fecha === fechaRonda);
  const rondaUnica = rondaPedida || rondas[rondas.length - 1];
  const avisoRonda = vista === 'resumen' && fechaRonda && !rondaPedida
    ? `La ronda del ${formatearFecha(fechaRonda)} no incluyó intención de voto: se muestra la del ${formatearFecha(rondaUnica.fecha)}.` : null;

  const opciones = comparar ? (() => {
    const [x, y] = iA < iB ? [rondaA, rondaB] : [rondaB, rondaA];
    return { x, y, ids: escenariosEnAmbas(x, y) };
  })() : null;
  const listaEsc = comparar ? opciones.ids.map(id => opciones.y.escenarios.find(e => e.id === id)) : rondaUnica.escenarios;
  const actual = listaEsc.find(e => e.id === escId) || listaEsc[0];
  const nota = actual ? meta?.escenarios?.[actual.id]?.nota : null;

  return (
    <div>
      {titulo}
      {aclaracion && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>{aclaracion}</div>}
      <TitularVoto ronda={comparar ? opciones.y : rondaUnica} meta={meta} fechaActual={fechaActualEncuesta} anterior={comparar && iA !== iB ? opciones.x : null} />
      <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '0 0 12px' }}>
        {ACLARACION_ESCENARIOS} Los porcentajes se muestran como vienen en el informe.
      </p>
      {(() => { const n = notaNumeracion(comparar ? [opciones.x.fecha, opciones.y.fecha] : [rondaUnica.fecha], meta, formatearFecha); return n ? <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '-6px 0 10px' }}>{n}</div> : null; })()}
      {avisoRonda && <Aviso>{avisoRonda}</Aviso>}
      {vista === 'comparativo' && rondas.length < 2 && <Aviso>La intención de voto se relevó en una sola ronda ({formatearFecha(rondas[0].fecha)}): no hay con qué comparar. Se muestra esa ronda.</Aviso>}
      {comparar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px', marginBottom: '10px', color: 'var(--text-secondary)' }}>
          Comparar
          <select value={iA} onChange={(e) => setIA(Number(e.target.value))} style={selectStyle} aria-label="Ronda anterior">
            {rondas.map((r, i) => <option key={r.fecha} value={i}>{formatearFecha(r.fecha)}</option>)}
          </select>
          con
          <select value={iB} onChange={(e) => setIB(Number(e.target.value))} style={selectStyle} aria-label="Ronda nueva">
            {rondas.map((r, i) => <option key={r.fecha} value={i}>{formatearFecha(r.fecha)}</option>)}
          </select>
        </div>
      )}
      {comparar && iA === iB && <Aviso>Elegí dos rondas distintas para comparar.</Aviso>}
      {comparar && iA !== iB && listaEsc.length === 0 && <Aviso>Ningún escenario se repite entre el {formatearFecha(opciones.x.fecha)} y el {formatearFecha(opciones.y.fecha)}, así que no se puede comparar. Elegí otras rondas o mirá cada ronda por separado.</Aviso>}
      {listaEsc.length > 1 && (
        <div style={{ marginBottom: '10px' }}>
          <select value={actual?.id || ''} onChange={(e) => setEscId(e.target.value)} style={{ ...selectStyle, width: '100%' }} aria-label="Escenario">
            {listaEsc.map(e => <option key={e.id} value={e.id}>Escenario {e.orden} · {e.nombre}</option>)}
          </select>
        </div>
      )}
      {actual && (
        <>
          {nota && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>{nota}</div>}
          {comparar && iA !== iB
            ? <EscenarioComparativo rondaA={opciones.x} rondaB={opciones.y} escenario={actual.id} meta={meta} umbral={umbral} conTitulo={listaEsc.length <= 1} fechaActual={fechaActualEncuesta} />
            : <EscenarioRonda ronda={comparar ? rondaB : rondaUnica} escenario={actual.id} meta={meta} conTitulo={listaEsc.length <= 1} fechaActual={fechaActualEncuesta} />}
        </>
      )}
    </div>
  );
};
