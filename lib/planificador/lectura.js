// "Lectura": observación factual, NO imperativa, generada de los datos del circuito.
// Describe lo que pasó y lo que todavía no se puede concluir; la decisión la toma el equipo.
// Con 1–2 encuestas por circuito solo hay coincidencia temporal: nunca "la pauta funcionó".
import { mesAnio, num1, fmtDeltaPP, periodoEntre } from './base';
import { formatearFecha } from '../formatearFecha';
import { estaDescubierto } from './cobertura';

const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

// Eventos de un tipo con fecha en (desde, hasta].
const entre = (eventos, tipo, desde, hasta) => eventos.filter((e) => e.tipo === tipo && e.fecha > desde && e.fecha <= hasta).length;
const despues = (eventos, tipo, desde) => eventos.filter((e) => e.tipo === tipo && e.fecha > desde).length;

function frasePeriodo(nPautas, nVisitas) {
  if (!nPautas && !nVisitas) return 'En el período no hubo pautas ni visitas registradas.';
  const partes = [];
  if (nPautas) partes.push(plural(nPautas, 'pauta', 'pautas'));
  if (nVisitas) partes.push(plural(nVisitas, 'visita', 'visitas'));
  return `En el período hubo ${partes.join(' y ')}.`;
}

function fraseUltimaIntervencion(s) {
  if (!s.hayIntervenciones) return null;
  const que = s.ultimaIntervencionTipo === 'pauta' ? 'La última pauta' : 'La última visita';
  if (!s.medicionPosteriorEvaluable) {
    return `${que} (${s.ultimaIntervencionTipo === 'pauta' ? 'hasta' : 'el'} ${formatearFecha(s.ultimaIntervencion)}) no tiene medición posterior, así que su efecto todavía no es evaluable.`;
  }
  return `Hubo una medición posterior a la última intervención (${formatearFecha(s.ultimaIntervencion)}).`;
}

/** @returns {string[]} párrafos */
export function redactarLectura(f) {
  const t = f.tendencia; const s = f.senales; const out = [];

  if (t.estado === 'sin_medir') {
    out.push('Sin mediciones: todavía no hay base para leer resultados.');
    if (s.hayIntervenciones) out.push(`Sí se registraron ${[s.nPautas && plural(s.nPautas, 'pauta', 'pautas'), s.nVisitas && plural(s.nVisitas, 'visita', 'visitas')].filter(Boolean).join(' y ')}, todas sin medición previa ni posterior.`);
  } else if (t.estado === 'sin_tendencia') {
    const u = t.serie[t.serie.length - 1];
    out.push(u ? `Una sola medición (${mesAnio(u.fecha)}): ${num1(u.apruebo)}%. Falta una segunda ronda para ver tendencia.`
      : `Una sola medición (${mesAnio(t.fechaUltima)}), sin dato de aprobación. Falta una segunda ronda para ver tendencia.`);
    if (u) {
      const p = despues(f.eventos, 'pauta', u.fecha); const v = despues(f.eventos, 'visita', u.fecha);
      if (p || v) out.push(`Después de esa medición hubo ${[p && plural(p, 'pauta', 'pautas'), v && plural(v, 'visita', 'visitas')].filter(Boolean).join(' y ')}, sin una segunda medición que permita evaluarlas.`);
      else if (s.hayIntervenciones) out.push(fraseUltimaIntervencion(s));
    }
  } else {
    const [a, b] = t.serie.slice(-2);
    const verbo = t.estado === 'mejora' ? 'subió' : t.estado === 'empeora' ? 'bajó' : 'se mantuvo';
    const cambio = t.estado === 'estable' ? `variación de ${fmtDeltaPP(t.delta)}` : fmtDeltaPP(t.delta);
    out.push(`La aprobación ${verbo} de ${num1(a.apruebo)}% (${mesAnio(a.fecha)}) a ${num1(b.apruebo)}% (${mesAnio(b.fecha)}): ${cambio}. ${frasePeriodo(entre(f.eventos, 'pauta', a.fecha, b.fecha), entre(f.eventos, 'visita', a.fecha, b.fecha))}`);
    const u = fraseUltimaIntervencion(s);
    if (u) out.push(u);
  }

  const p1 = f.cobertura?.[0];
  if (p1 && estaDescubierto(p1)) {
    out.push(p1.estado === 'sin_palanca'
      ? `El problema #1 (${p1.cat}, ${num1(p1.valor)}%) no tiene obra ni pauta que lo atienda: es un tema sin palanca.`
      : p1.estado === 'planificado'
        ? `El problema #1 (${p1.cat}, ${num1(p1.valor)}%) solo tiene obras planificadas, ninguna iniciada.`
        : `El problema #1 (${p1.cat}, ${num1(p1.valor)}%) no está cubierto por ninguna pauta ni obra en ejecución.`);
  }
  if (f.inaugurables.length) out.push(`Hay ${plural(f.inaugurables.length, 'obra lista', 'obras listas')} para inaugurar.`);
  return out.filter(Boolean);
}

export { periodoEntre };
