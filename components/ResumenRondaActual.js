import { formatearFecha } from '../lib/formatearFecha';
import { ChipRonda } from './ChipRonda';
import {
  fechaRondaActual, ordenarRondas, resolverIndicador, etiquetaExtremos, bloquesNoMedidos, calcularBloqueProblemas, muestraReducida,
} from '../lib/lecturaRondas';
import { escenariosDeEncuesta, titularEscenario, nombreCandidato } from '../lib/intencionVoto';

// Resumen de la ronda actual: caja compacta de 3-4 líneas que se lee en 10 segundos. Es un RESUMEN: no vuelve a
// dibujar las tarjetas completas (Indicadores, Calificación, Problemas) ni cuenta como un indicador repetido.
//   · ronda actual = la más reciente de la encuesta del circuito (fecha + n)
//   · voto principal: Escenario 1 — quién va 1°, su % y la diferencia con el 2° (aunque no sea Llaryora)
//   · aprobación del Gobernador y su dirección
//   · problema principal (con su fecha real si es arrastre)
//   · avisos: n chico y bloques que la ronda actual no midió
// Aprobación: subir es buena noticia (verde), bajar es mala (rojo). Mismos tonos que el resto del tablero.
const COLOR_SUBE_BUENO = '#2E7D32';
const COLOR_BAJA_MALO = '#C62828';

const fila = { display: 'flex', gap: '10px', alignItems: 'baseline', padding: '3px 0' };
const rotulo = { width: '128px', flexShrink: 0, fontSize: '11px', color: 'var(--text-tertiary)' };
const valorEstilo = { flex: 1, minWidth: 0, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.35 };
const tenue = { color: 'var(--text-tertiary)' };

const Fila = ({ rotulo: r, children, atenuada }) => (
  <div style={fila}>
    <div style={rotulo}>{r}</div>
    <div style={{ ...valorEstilo, ...(atenuada ? tenue : {}) }}>{children}</div>
  </div>
);

// conTitulo=false en el reporte: la sección ya trae su propio título.
// Agrupa los bloques no medidos por la fecha de su último dato.
const gruposNoMedidos = (lista) => {
  const m = new Map();
  lista.forEach(b => { if (!m.has(b.ultimaFecha)) m.set(b.ultimaFecha, []); m.get(b.ultimaFecha).push(b.nombre); });
  return [...m.entries()].map(([fecha, nombres]) => ({ fecha, nombres }));
};

export const ResumenRondaActual = ({ encuesta, meta, umbral = 2.5, conTitulo = true }) => {
  const rondas = ordenarRondas(encuesta?.rondas);
  if (!rondas.length) return null;
  const fechaActual = fechaRondaActual(rondas);
  const actual = rondas[rondas.length - 1];

  // Voto
  const iv = escenariosDeEncuesta(encuesta, meta).rondas;
  const rondaIV = iv.length ? iv[iv.length - 1] : null;
  const tit = rondaIV?.escenarios?.[0] ? titularEscenario(rondaIV.escenarios[0].valores, meta) : null;
  const ivArrastre = rondaIV && rondaIV.fecha !== fechaActual;

  // Aprobación del Gobernador
  const apr = resolverIndicador(rondas, fechaActual, r => r.preguntas?.['Aprobación Gobernador']?.Apruebo, umbral);
  const [ea, eb] = apr?.fechaAnterior ? etiquetaExtremos(apr.fechaAnterior, apr.fechaActual) : [null, null];

  // Problema principal
  const prob = calcularBloqueProblemas(rondas, umbral, fechaActual);
  const top = prob?.filas?.[0];

  const noMedidos = bloquesNoMedidos(rondas, fechaActual);
  const chico = muestraReducida(actual.casos);

  return (
    <div data-resumen-ronda-actual style={{ border: '1px solid var(--border)', borderLeft: '4px solid #1976D2', borderRadius: '10px', padding: '10px 14px', backgroundColor: 'var(--bg-primary)', breakInside: 'avoid' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', marginBottom: '4px' }}>
        {conTitulo && <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Resumen de la ronda actual</span>}
        <ChipRonda fecha={actual.fecha} casos={actual.casos} actual />
      </div>

      <Fila rotulo="Voto a Gobernador" atenuada={ivArrastre}>
        {!rondaIV && 'Sin escenarios de voto en esta encuesta.'}
        {rondaIV && !tit && 'Sin escenarios de voto en esta ronda.'}
        {tit && (
          <>
            <strong>Escenario 1: {tit.empate ? `empate entre ${nombreCandidato(tit.primero, meta)} y ${nombreCandidato(tit.segundo, meta)}, ${tit.valorPrimero.toFixed(1)}%` : `1° ${nombreCandidato(tit.primero, meta)} ${tit.valorPrimero.toFixed(1)}%`}</strong>
            {!tit.empate && tit.segundo != null && <> sobre {nombreCandidato(tit.segundo, meta)} {tit.valorSegundo.toFixed(1)}% (+{tit.diferencia.toFixed(1)} pp)</>}
            {tit.destacado && !tit.destacado.esPrimero && !tit.empate && <> · {nombreCandidato(tit.destacado.clave, meta)} va {tit.destacado.ordinal}</>}
            {ivArrastre && <> · sin escenarios en la ronda actual, último dato: {formatearFecha(rondaIV.fecha)}{rondaIV.casos != null ? ` · n=${rondaIV.casos}` : ''}</>}
          </>
        )}
      </Fila>

      <Fila rotulo="Aprobación Gobernador" atenuada={apr?.esArrastre}>
        {!apr && 'Sin dato.'}
        {apr && (
          <>
            <strong>{apr.actual.toFixed(1)}%</strong>
            {apr.estado && (
              <> <span style={{ fontWeight: 700, color: apr.esArrastre || apr.estado === 'estable' ? 'var(--text-tertiary)' : (apr.estado === 'sube' ? COLOR_SUBE_BUENO : COLOR_BAJA_MALO), whiteSpace: 'nowrap' }}>
                {apr.estado === 'estable' ? '· Estable' : `${apr.estado === 'sube' ? '▲' : '▼'} ${apr.delta > 0 ? '+' : '−'}${Math.abs(apr.delta).toFixed(1)} pp`}
              </span> <span style={tenue}>({ea} {apr.anterior.toFixed(1)}% → {eb} {apr.actual.toFixed(1)}%)</span></>
            )}
            {apr.esArrastre && <> · sin dato en la ronda actual, último: {formatearFecha(apr.fechaActual)}{apr.actualCasos != null ? ` · n=${apr.actualCasos}` : ''}</>}
          </>
        )}
      </Fila>

      <Fila rotulo="Problema principal" atenuada={prob?.esArrastre}>
        {!top && 'Sin dato de problemas.'}
        {top && (
          <>
            <strong>{top.cat === 'Otro' ? 'Otros problemas no listados' : top.cat} {top.valor.toFixed(1)}%</strong>
            {prob.esArrastre ? <> · medición del {formatearFecha(prob.ultima.fecha)}{prob.ultima.casos != null ? ` · n=${prob.ultima.casos}` : ''} (la ronda actual no lo relevó)</> : null}
          </>
        )}
      </Fila>

      {(chico || noMedidos.length > 0) && (
        <Fila rotulo="Avisos">
          {chico && <div style={{ color: '#8a5a00', fontWeight: 600 }}>⚠ Muestra reducida (n={actual.casos}): los porcentajes son orientativos.</div>}
          {noMedidos.length > 0 && (
            <div style={tenue}>
              No se midió en esta ronda (se muestra su último dato, más viejo): {gruposNoMedidos(noMedidos).map(g => `${g.nombres.join(', ')} (último: ${formatearFecha(g.fecha)})`).join('; ')}.
            </div>
          )}
        </Fila>
      )}
    </div>
  );
};
