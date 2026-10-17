// Agregados de la hoja Resumen. Todo se calcula de las mismas filas del planificador:
// cada agregado trae también la lista de circuitos involucrados (`claves`) para poder
// navegar a la hoja Circuitos filtrada por ese conjunto.
import { diasDesde, hoyLocal } from './base';
import { inversionDe } from './pautas';
import { fechaListaObra } from './obras';

const claves = (filas) => filas.map((f) => f.key);
const contar = (arr, fn) => { const m = new Map(); arr.forEach((x) => { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); }); return m; };

// Cortes de espera de una obra lista (días desde que está disponible).
export const BUCKETS_OBRA = [
  { id: 'futura', label: 'Disponible más adelante', test: (d) => d < 0 },
  { id: '0-30', label: '0–30 días', test: (d) => d >= 0 && d <= 30 },
  { id: '31-90', label: '31–90 días', test: (d) => d > 30 && d <= 90 },
  { id: '91-180', label: '91–180 días', test: (d) => d > 90 && d <= 180 },
  { id: '180+', label: 'Más de 180 días', test: (d) => d > 180 },
  { id: 'sin_fecha', label: 'Sin fecha', test: (d) => d == null },
];

export function bucketDeObra(o, hoy = hoyLocal()) {
  const f = fechaListaObra(o);
  const d = f ? diasDesde(f, hoy) : null;
  return BUCKETS_OBRA.find((b) => b.test(d)).id;
}

export function calcularAgregados(filas, pautaDerivada, hoy = hoyLocal()) {
  const sinMedir = filas.filter((f) => f.tendencia.estado === 'sin_medir');
  const unaRonda = filas.filter((f) => f.tendencia.nRondas === 1);
  const dosMas = filas.filter((f) => f.tendencia.nRondas >= 2);
  const conObra = filas.filter((f) => f.inaugurables.length > 0);
  const pautaSinMed = filas.filter((f) => f.senales.pautaSinMedicionPosterior);

  // ¿Sobre qué tema jugamos? Piezas e inversión por eje (piezas deduplicadas de circuitos).
  const piezas = (pautaDerivada?.circuitos || []).flatMap((c) => c.piezas);
  const porEje = new Map();
  piezas.forEach((p) => {
    const eje = p.pauta.eje || 'SIN EJE';
    const e = porEje.get(eje) || { eje, piezas: 0, inversion: 0 };
    e.piezas += 1; e.inversion += inversionDe(p.pauta) || 0;
    porEje.set(eje, e);
  });
  const ejes = [...porEje.values()];
  const totalPiezas = ejes.reduce((a, e) => a + e.piezas, 0);
  const totalInversion = ejes.reduce((a, e) => a + e.inversion, 0);
  const tema = {
    totalPiezas, totalInversion,
    ejes: ejes.map((e) => ({ ...e, claves: claves(filas.filter((f) => f.ejesPauta.includes(e.eje))) })),
  };

  // ¿Dónde estamos a ciegas?
  const ranking = filas.filter((f) => f.diasSinMedir != null).sort((a, b) => b.diasSinMedir - a.diasSinMedir).slice(0, 10)
    .map((f) => ({ key: f.key, nombre: f.nombre, dias: f.diasSinMedir }));
  const ciegos = {
    distribucion: [
      { id: 'sin_medir', label: 'Sin medir', n: sinMedir.length, claves: claves(sinMedir) },
      { id: 'una_ronda', label: 'Una sola ronda', n: unaRonda.length, claves: claves(unaRonda) },
      { id: 'dos_mas', label: 'Dos o más rondas', n: dosMas.length, claves: claves(dosMas) },
    ],
    ranking,
  };

  // Clima electoral
  const tiers = ['favorable', 'intermedio', 'desfavorable', 'adverso'].map((t) => {
    const fs = filas.filter((f) => f.tier === t);
    return { tier: t, n: fs.length, claves: claves(fs) };
  });

  // Problema #1 sin cobertura
  const sinCob = filas.filter((f) => f.problema1Descubierto);
  const porTipo = [...contar(sinCob, (f) => f.cobertura[0].cat)].map(([cat, n]) => ({ cat, n, claves: claves(sinCob.filter((f) => f.cobertura[0].cat === cat)) })).sort((a, b) => b.n - a.n);
  const problema1 = { total: sinCob.length, claves: claves(sinCob), porTipo };

  // Obras listas: backlog por antigüedad de espera (una obra = una unidad).
  const backlog = BUCKETS_OBRA.map((b) => ({ id: b.id, label: b.label, obras: 0, circuitos: new Set() }));
  filas.forEach((f) => f.inaugurables.forEach((o) => {
    const b = backlog.find((x) => x.id === bucketDeObra(o, hoy));
    b.obras += 1; b.circuitos.add(f.key);
  }));
  const obras = { totalObras: backlog.reduce((a, b) => a + b.obras, 0), buckets: backlog.map((b) => ({ id: b.id, label: b.label, obras: b.obras, claves: [...b.circuitos] })) };

  return {
    kpis: {
      total: filas.length,
      sinMedir: { n: sinMedir.length, claves: claves(sinMedir) },
      unaRonda: { n: unaRonda.length, claves: claves(unaRonda) },
      conObra: { n: conObra.length, claves: claves(conObra) },
      pautaSinMed: { n: pautaSinMed.length, claves: claves(pautaSinMed) },
    },
    tema, ciegos, tiers, problema1, obras,
  };
}

// Seguimiento del equipo a partir de las fichas guardadas ({ [circuito]: { acciones, ... } }).
const cuentaComoDecision = (a) => true;
export const esAccionPendiente = (a) => a.tipo !== 'sin_accion' && (a.estado === 'pendiente' || a.estado === 'en_curso');
export function calcularSeguimiento(fichas) {
  const out = { pendiente: 0, en_curso: 0, hecha: 0, conDecision: [], conPendientes: [] };
  Object.entries(fichas || {}).forEach(([key, ficha]) => {
    const acciones = ficha?.acciones || [];
    if (acciones.some(cuentaComoDecision)) out.conDecision.push(key);
    if (acciones.some(esAccionPendiente)) out.conPendientes.push(key);
    acciones.forEach((a) => { if (out[a.estado] != null) out[a.estado] += 1; });
  });
  return out;
}
