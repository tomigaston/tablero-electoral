import { formatearFecha } from '../lib/formatearFecha';
import { fechaRondaActual, ultimoEscalar, problemasDeCircuito } from '../lib/encuestasBloque';
import { escenariosDeEncuesta, titularEscenario, nombreCandidato } from '../lib/intencionVoto';

// Resumen de la ronda actual: caja compacta de 3 líneas que se lee en 10 segundos. Es un RESUMEN: no vuelve a dibujar
// el bloque Encuestas. Habla el mismo idioma que el bloque: cada dato lleva SU PROPIA fecha (gris, a la derecha), sin
// chips, sin n, sin atenuado ni avisos; el cambio es un delta neutro con signo (▲/▼ +x.x pp).
//   · voto principal: Escenario 1 — quién va 1°, su % y la diferencia con el 2° (aunque no sea Llaryora)
//   · aprobación del Gobernador y su cambio contra la medición anterior
//   · problema principal
// "No se preguntó" cuando el dato no existe en ninguna ronda del circuito (S/D nunca se muestra como 0).

const fila = { display: 'flex', gap: '10px', alignItems: 'baseline', padding: '3px 0' };
const rotulo = { width: '128px', flexShrink: 0, fontSize: '11px', color: 'var(--text-tertiary)' };
const valorEstilo = { flex: 1, minWidth: 0, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.35 };
const fechaEstilo = { flexShrink: 0, fontSize: '12px', fontWeight: 700, color: '#333', whiteSpace: 'nowrap' };
const NEUTRO = '#444';

const Fila = ({ rotulo: r, fecha, children }) => (
  <div style={fila}>
    <div style={rotulo}>{r}</div>
    <div style={valorEstilo}>{children}</div>
    {fecha && <div style={fechaEstilo}>{formatearFecha(fecha)}</div>}
  </div>
);

// conTitulo=false en el reporte y la ficha: la sección ya trae su propio título.
export const ResumenRondaActual = ({ encuesta, meta, conTitulo = true }) => {
  const rondas = encuesta?.rondas || [];
  const fechaActual = fechaRondaActual(rondas);
  if (!fechaActual) return null;

  // Voto: la ronda más reciente que trae escenarios.
  const iv = escenariosDeEncuesta(encuesta, meta).rondas;
  const rondaIV = iv.length ? iv[iv.length - 1] : null;
  const tit = rondaIV?.escenarios?.[0] ? titularEscenario(rondaIV.escenarios[0].valores, meta) : null;

  const apr = ultimoEscalar(rondas, 'Aprobación Gobernador', 'Apruebo');
  const prob = problemasDeCircuito(rondas, 1);
  const top = prob.estado === 'ok' ? prob.items[0] : null;

  return (
    <div data-resumen-ronda-actual style={{ border: '1px solid var(--border)', borderLeft: '4px solid #1976D2', borderRadius: '10px', padding: '10px 14px', backgroundColor: 'var(--bg-primary)', breakInside: 'avoid' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 10px', marginBottom: '4px' }}>
        {conTitulo && <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Resumen de la ronda actual</span>}
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#333' }}>{formatearFecha(fechaActual)}</span>
      </div>

      <Fila rotulo="Voto a Gobernador" fecha={tit ? rondaIV.fecha : null}>
        {!tit && 'No se preguntó'}
        {tit && (
          <>
            <strong>Escenario 1: {tit.empate ? `empate entre ${nombreCandidato(tit.primero, meta)} y ${nombreCandidato(tit.segundo, meta)}, ${tit.valorPrimero.toFixed(1)}%` : `1° ${nombreCandidato(tit.primero, meta)} ${tit.valorPrimero.toFixed(1)}%`}</strong>
            {!tit.empate && tit.segundo != null && <> sobre {nombreCandidato(tit.segundo, meta)} {tit.valorSegundo.toFixed(1)}% (+{tit.diferencia.toFixed(1)} pp)</>}
            {tit.destacado && !tit.destacado.esPrimero && !tit.empate && <> · {nombreCandidato(tit.destacado.clave, meta)} va {tit.destacado.ordinal}</>}
          </>
        )}
      </Fila>

      <Fila rotulo="Aprobación Gobernador" fecha={apr ? apr.fecha : null}>
        {!apr && 'No se preguntó'}
        {apr && (
          <>
            <strong>{apr.texto}</strong>
            {apr.previo && <> <span style={{ fontWeight: 700, color: NEUTRO, whiteSpace: 'nowrap' }}>{apr.signo} {apr.deltaTexto} pp</span> <span style={{ color: 'var(--text-tertiary)' }}>(vs {formatearFecha(apr.previo.fecha)}: {apr.previo.texto})</span></>}
          </>
        )}
      </Fila>

      <Fila rotulo="Problema principal" fecha={top ? prob.fecha : null}>
        {!top && 'No se preguntó'}
        {top && <strong>{/^otr[oa]s?$/i.test(top.cat) ? 'Otros problemas no listados' : top.cat} {top.texto}</strong>}
      </Fila>
    </div>
  );
};
