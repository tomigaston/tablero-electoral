// Registro único de secciones del reporte imprimible.
//
// Cada sección declara: id, grupo (subtítulo del modal), label, descripcion, a qué niveles
// aplica (capital / circuito / barrio, con el motivo cuando no aplica), cómo se imprime
// (render → HTML) y de dónde sale la fecha del dato. El modal y el generador leen SOLO
// este registro: sumar una sección es agregar un objeto acá, sin tocar el resto.
//
// Las secciones reutilizan los componentes reales de la UI (SolapaResumen, SolapaEvolucion,
// etc.) renderizados a HTML estático, para que impresión y pantalla no diverjan. Las que
// son listas largas (visitas, pauta, obras) usan tablas HTML con columnas de ancho fijo.
//
// crearRegistroSecciones(D) recibe de pages/index.js los componentes y helpers que no
// pueden importarse directamente (viven en ese archivo): D = { ui: {...}, fn: {...} }.

import { escenariosDeEncuesta, alinearComparativo } from '../../lib/intencionVoto';
import { EscenarioRonda, EscenarioComparativo, CabeceraRondaIV, PieIntencionVoto } from '../IntencionVotoGobernador';
import { ChipRonda } from '../ChipRonda';
import { ResumenRondaActual } from '../ResumenRondaActual';
import { fechaRondaActual, ultimoEscalar } from '../../lib/encuestasBloque';
import { htmlEncuestasCuerpo } from './encuestasHtml';

export const GRUPOS_REPORTE = ['Resumen', 'Territorio', 'Electoral', 'Comunicación y gestión', 'Opinión pública'];

const maxFecha = (fechas) => fechas.filter(Boolean).reduce((m, f) => (!m || f > m ? f : m), null);
const conClaseTabla = (html) => html.replace(/<table>/g, '<table class="rp-tabla">');

export function crearRegistroSecciones(D) {
  const { ui, fn } = D;
  const {
    SolapaResumen, SolapaEvolucion, SolapaPartidos, SolapaComparativas, SolapaTerritorio, SolapaResumenBarrio,
    SolapaTerritorioBarrio, SolapaEscuelasBarrio,
    CabeceraCapital, ResultadosCapital, Badge, COLORES_CATEGORIA,
  } = ui;
  const {
    formatearFecha, normalizarNombreBarrio, buscarEncuestaCircuito, resolverCircuitoPrincipalDeBarrio,
    compararMapkey, estadoMostradoPauta, obtenerPautasDeBarrio, unificarVisitasPDF, visitasCircuitoPDF,
    htmlPautaPDF, htmlPautaCircuitoPDF, pautaCircuitoPDF, htmlObrasPDF,
    formatPct,
  } = fn;
  const noop = () => {};
  const SIN_BARRIO = (ctx) => ctx.tipo === 'barrio';

  // ---------- helpers de datos ----------
  const sectorTexto = (t) => `<p class="rp-nota">${t}</p>`;
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Encuesta que corresponde al contexto (el barrio no tiene encuesta propia: hereda la de su circuito principal).
  function encuestaDeContexto(ctx) {
    if (ctx.tipo === 'circuito') return { encuesta: buscarEncuestaCircuito(ctx.encuestasData, ctx.datosCircuito.CircuitoKey), circuito: ctx.datosCircuito, heredada: false };
    if (ctx.tipo === 'barrio') {
      const circ = resolverCircuitoPrincipalDeBarrio(ctx.nombreBarrio, ctx.cruceData, ctx.barriosGeoLookup, ctx.datos);
      return { encuesta: circ ? buscarEncuestaCircuito(ctx.encuestasData, circ.CircuitoKey) : null, circuito: circ, heredada: true };
    }
    return { encuesta: null, circuito: null, heredada: false };
  }

  function visitasUnicasCapital(ctx) {
    const vistos = new Map();
    Object.entries(ctx.recorridosLookup || {}).forEach(([key, r]) => (r.visitas || []).forEach(v => {
      const id = v.id ?? `${v.fecha}|${v.info}`;
      if (!vistos.has(id)) vistos.set(id, { ...v, _barrio: ctx.barriosGeoLookup?.[key]?.nombre_barrio || key });
    }));
    return [...vistos.values()].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }
  function todasLasPautas(pautasBarriosData) {
    const p = pautasBarriosData || {};
    const lista = [];
    Object.values(p.barrios || {}).forEach(b => lista.push(...(b.pautas || [])));
    Object.values(p.circuitos_sin_barrio || {}).forEach(c => lista.push(...(c.pautas || [])));
    lista.push(...(p.toda_capital?.pautas || []));
    return lista;
  }

  // ---------- tablas de impresión ----------
  function tablaVisitas(visitas, conBarrio) {
    if (!visitas || visitas.length === 0) return sectorTexto('Sin visitas registradas.');
    return `<table class="rp-tabla"><thead><tr>
      <th class="fecha">Fecha</th><th class="tipo">Tipo</th><th class="estrecha">Contacto vecinos</th><th class="detalle">Detalle</th>${conBarrio ? '<th class="barrio">Barrio</th>' : ''}
    </tr></thead><tbody>${visitas.map(v => `<tr>
      <td class="fecha">${formatearFecha(v.fecha)}</td><td class="tipo">${esc(v.tipo_visita || '—')}</td><td class="estrecha">${esc(v.contacto_vecinos || 'NO')}</td><td class="detalle">${esc(v.info || '—')}</td>${conBarrio ? `<td class="barrio">${esc(v._barrio || '')}</td>` : ''}
    </tr>`).join('')}</tbody></table>`;
  }

  function resumenCapitalKpis(ctx) {
    const visitas = visitasUnicasCapital(ctx);
    const pautas = todasLasPautas(ctx.pautasBarriosData);
    const conEncuesta = (ctx.datos || []).filter(d => { const e = buscarEncuestaCircuito(ctx.encuestasData, d.CircuitoKey); return e && e.rondas?.length; });
    const ultimaRonda = maxFecha(Object.values(ctx.encuestasData || {}).flatMap(e => (e.rondas || []).map(r => r.fecha)));
    const kpi = (k, v, s) => `<div class="rp-kpi"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    return `<div class="rp-kpis">
      ${kpi('Circuitos con encuesta', `${conEncuesta.length}/${ctx.datos.length}`, ultimaRonda ? `última ronda ${formatearFecha(ultimaRonda)}` : '')}
      ${kpi('Visitas del Gobernador', visitas.length, visitas[0] ? `última ${formatearFecha(visitas[0].fecha)}` : '')}
      ${kpi('Obras registradas', (ctx.obrasEnriquecidas || []).length, '')}
      ${kpi('Piezas de pauta activas', pautas.filter(p => estadoMostradoPauta(p) === 'ACTIVO').length, `${pautas.length} registradas`)}
    </div>`;
  }

  // ---------- Encuestas ----------
  const rondasDe = (ctx) => encuestaDeContexto(ctx).encuesta?.rondas || [];
  function renderEncuestas(ctx, opciones, T) {
    const { encuesta, heredada, circuito } = encuestaDeContexto(ctx);
    const rondas = encuesta?.rondas || [];
    const partes = [];
    if (heredada) partes.push(`<div class="rp-aviso" style="color:#0d47a1;background:#e8f1fb;border-color:#b6d0ee"><strong>Encuesta del circuito ${esc(circuito?.CircuitoKey)} — ${esc(circuito?.cirn_nom || '')}.</strong> Las encuestas se relevan por circuito, no por barrio: estos datos corresponden al circuito al que pertenece ${esc(ctx.nombreBarrio)}.</div>`);
    partes.push(...htmlEncuestasCuerpo({
      rondas, opciones: opciones?.encuestas || {}, T,
    }));
    return partes.join('');
  }

  function renderEncuestasCapital(ctx) {
    const filas = (ctx.datos || []).map(d => ({ d, enc: buscarEncuestaCircuito(ctx.encuestasData, d.CircuitoKey) }))
      .filter(f => f.enc && f.enc.rondas?.length).sort((a, b) => compararMapkey(a.d.CircuitoKey, b.d.CircuitoKey));
    if (!filas.length) return sectorTexto('Sin encuestas relevadas.');
    // Cada dato lleva la fecha de SU ronda (misma regla que el bloque Encuestas): sin "último dato" anónimo, sin n.
    // Si el dato no existe en ninguna ronda del circuito: "No se preguntó" (nunca 0 ni "—").
    const celda = (rondas, pregunta, cat) => {
      const u = ultimoEscalar(rondas, pregunta, cat);
      return u ? `<strong>${u.texto}</strong><div style="font-size:11px;font-weight:700;color:#333">${formatearFecha(u.fecha)}</div>` : '<span style="color:#666">No se preguntó</span>';
    };
    return `<p class="rp-sub">${filas.length} de ${ctx.datos.length} circuitos con encuesta. Cada dato lleva la fecha de su ronda.</p>
    <table class="rp-tabla rp-compacta"><thead><tr><th>Circuito</th><th class="fecha">Última ronda</th><th class="num">Rondas</th><th class="num">Gestión Gob. (positiva)</th><th class="num">Aprobación Gob.</th></tr></thead><tbody>${filas.map(({ d, enc }) => {
      const rondas = enc.rondas;
      return `<tr><td><strong>${esc(d.CircuitoKey)}</strong> ${esc(d.cirn_nom || '')}</td><td class="fecha">${formatearFecha(fechaRondaActual(rondas))}</td><td class="num">${rondas.length}</td><td class="num">${celda(rondas, 'Gestión del Gobernador', 'Positiva')}</td><td class="num">${celda(rondas, 'Aprobación Gobernador', 'Apruebo')}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  // ---------- Intención de voto — Gobernador ----------
  // Los escenarios se leen de la encuesta del circuito (el barrio hereda la de su circuito principal).
  // Capital no tiene dato agregado: no se promedian circuitos, se lista dónde hay datos.
  const metaIV = (ctx) => ctx.encuestasMetadata?.escenarios_gobernador;
  const datosIV = (ctx) => escenariosDeEncuesta(encuestaDeContexto(ctx).encuesta, metaIV(ctx));

  function renderIntencionCapital(ctx) {
    const meta = metaIV(ctx);
    const filas = (ctx.datos || []).map(d => ({ d, iv: escenariosDeEncuesta(buscarEncuestaCircuito(ctx.encuestasData, d.CircuitoKey), meta) }))
      .filter(f => f.iv.rondas.length > 0).sort((a, b) => compararMapkey(a.d.CircuitoKey, b.d.CircuitoKey));
    const aviso = '<div class="rp-aviso" style="color:#0d47a1;background:#e8f1fb;border-color:#b6d0ee">La intención de voto para Gobernador se relevó circuito por circuito: <strong>no hay un dato agregado de Capital</strong> y no se promedian circuitos. Para ver los porcentajes, generá el reporte desde un circuito.</div>';
    if (!filas.length) return aviso + sectorTexto('Ningún circuito tiene intención de voto relevada.');
    return `${aviso}<table class="rp-tabla rp-compacta"><thead><tr><th>Circuito</th><th class="fecha">Ronda</th><th class="num">Escenarios</th></tr></thead><tbody>${filas.flatMap(({ d, iv }) => iv.rondas.map(r => `<tr><td><strong>${esc(d.CircuitoKey)}</strong> ${esc(d.cirn_nom || '')}</td><td class="fecha">${formatearFecha(r.fecha)}</td><td class="num">${r.escenarios.length}</td></tr>`)).join('')}</tbody></table>`;
  }

  function renderIntencion(ctx, opciones, T) {
    if (ctx.tipo === 'capital') return renderIntencionCapital(ctx);
    const meta = metaIV(ctx);
    const umbral = ctx.encuestasMetadata?.umbral_variacion_pp ?? 2.5;
    const { encuesta, heredada, circuito } = encuestaDeContexto(ctx);
    const rondas = escenariosDeEncuesta(encuesta, meta).rondas;
    if (!rondas.length) return sectorTexto('Sin intención de voto relevada.');
    const o = opciones?.intencion || {};
    const elegidos = Array.isArray(o.escenarios) && o.escenarios.length ? new Set(o.escenarios) : null;
    const clamp = (i, d) => Math.min(Math.max(i ?? d, 0), rondas.length - 1);
    const hacerComparativo = o.modo === 'comparativo' && rondas.length >= 2;
    const partes = [];
    if (heredada) partes.push(`<div class="rp-aviso" style="color:#0d47a1;background:#e8f1fb;border-color:#b6d0ee"><strong>Encuesta del circuito ${esc(circuito?.CircuitoKey)} — ${esc(circuito?.cirn_nom || '')}.</strong> La intención de voto se relevó por circuito, no por barrio: estos datos corresponden al circuito al que pertenece ${esc(ctx.nombreBarrio)}.</div>`);
    // Ronda actual de la ENCUESTA del circuito (no solo de las rondas con escenarios): si la intención de voto es de una
    // ronda anterior, su chip no lleva la marca "actual" y se avisa.
    const fechaActualEnc = fechaRondaActual(encuesta?.rondas);

    if (hacerComparativo) {
      let ia = clamp(o.a, rondas.length - 2), ib = clamp(o.b, rondas.length - 1);
      if (ia === ib) ia = Math.max(ib - 1, 0);
      if (ia > ib) [ia, ib] = [ib, ia];
      const A = rondas[ia], B = rondas[ib];
      partes.push(T.md(<CabeceraRondaIV rondas={[A, B]} fechaActual={fechaActualEnc} />));
      if (B.fecha !== fechaActualEnc) partes.push(`<p class="rp-nota">La ronda actual (${formatearFecha(fechaActualEnc)}) no incluyó intención de voto: lo que sigue es del ${formatearFecha(B.fecha)}.</p>`);
      const enB = B.escenarios.filter(e => !elegidos || elegidos.has(e.id));
      const comunes = enB.filter(e => A.escenarios.some(x => x.id === e.id));
      const excluidos = enB.filter(e => !comunes.includes(e));
      if (!comunes.length) partes.push(`<div class="rp-aviso">Ningún escenario elegido está en las dos rondas (${formatearFecha(A.fecha)} y ${formatearFecha(B.fecha)}), así que no se puede comparar.</div>`);
      comunes.forEach(e => {
        partes.push(`<div class="rp-evitar" style="margin-top:12px">${T.md(<EscenarioComparativo rondaA={A} rondaB={B} escenario={e.id} meta={meta} umbral={umbral} conTitulo sufijo={`Comparativo ${formatearFecha(A.fecha)} → ${formatearFecha(B.fecha)}`} />)}</div>`);
      });
      if (comunes.length) {
        const hayAusentes = comunes.some(e => alinearComparativo(A.escenarios.find(x => x.id === e.id).valores, e.valores, meta).some(f => f.a == null || f.b == null));
        partes.push(T.md(<PieIntencionVoto comparativo umbral={umbral} hayAusentes={hayAusentes} />));
      }
      if (excluidos.length) partes.push(`<p class="rp-nota">No se comparan por no estar en la ronda del ${formatearFecha(A.fecha)}: ${excluidos.map(e => esc(e.nombre)).join('; ')}.</p>`);
    } else {
      const R = rondas[clamp(o.rondaIdx, rondas.length - 1)];
      partes.push(T.md(<CabeceraRondaIV rondas={[R]} fechaActual={fechaActualEnc} />));
      if (R.fecha !== fechaActualEnc) partes.push(`<p class="rp-nota">La ronda actual (${formatearFecha(fechaActualEnc)}) no incluyó intención de voto: lo que sigue es del ${formatearFecha(R.fecha)}.</p>`);
      // Dos escenarios por fila y modo compacto: entran 4 escenarios por hoja (6 escenarios = 2 hojas).
      const celdas = R.escenarios.filter(e => !elegidos || elegidos.has(e.id)).map(e =>
        `<div class="rp-evitar" style="min-width:0">${T.md(<EscenarioRonda ronda={R} escenario={e.id} meta={meta} conTitulo compacto />)}</div>`);
      partes.push(`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px 16px;align-items:start;margin-top:10px">${celdas.join('')}</div>`);
    }
    return partes.join('');
  }

  // ---------- Obras / Pauta de Capital ----------
  function renderObrasCapital(ctx) {
    const obras = ctx.obrasEnriquecidas || [];
    if (!obras.length) return sectorTexto('Sin obras registradas.');
    const contar = (f) => { const c = {}; obras.forEach(o => { const k = f(o) || 'Sin dato'; c[k] = (c[k] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]); };
    const tabla = (titulo, col, filas) => `<div class="rp-h3">${titulo}</div><table class="rp-tabla"><thead><tr><th>${col}</th><th class="num">Obras</th><th class="num">%</th></tr></thead><tbody>${filas.map(([k, n]) => `<tr><td>${esc(k)}</td><td class="num">${n}</td><td class="num">${((n / obras.length) * 100).toFixed(1)}%</td></tr>`).join('')}</tbody></table>`;
    const kpi = (k, v) => `<div class="rp-kpi"><div class="k">${k}</div><div class="v">${v}</div></div>`;
    return `<div class="rp-kpis" style="grid-template-columns:repeat(2,1fr)">${kpi('Obras registradas', obras.length)}${kpi('Con ubicación en el mapa', obras.filter(o => o.lat != null && o.lon != null).length)}</div>
      ${tabla('Obras por estado', 'Estado', contar(o => o.estado))}${tabla('Obras por repartición', 'Repartición', contar(o => o.reparticion))}${tabla('Obras por tipo', 'Tipo', contar(o => o.tipo_obra).slice(0, 12))}`;
  }
  function renderPautaCapital(ctx) {
    const pautas = todasLasPautas(ctx.pautasBarriosData);
    if (!pautas.length) return sectorTexto('Sin pauta registrada.');
    const porPlat = {}; pautas.forEach(p => { const k = p.plataforma || 'Sin dato'; porPlat[k] = (porPlat[k] || 0) + 1; });
    const todaCapital = ctx.pautasBarriosData?.toda_capital?.pautas || [];
    const totalCapital = todaCapital.length;
    const recientes = [...todaCapital].sort((a, b) => (b.fin || '').localeCompare(a.fin || '')).slice(0, 12);
    const kpi = (k, v, s) => `<div class="rp-kpi"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    return `<div class="rp-kpis" style="grid-template-columns:repeat(3,1fr)">${kpi('Piezas registradas', pautas.length)}${kpi('Activas hoy', pautas.filter(p => estadoMostradoPauta(p) === 'ACTIVO').length)}${kpi('Alcance toda Capital', ctx.pautasBarriosData?.toda_capital?.total_pautas ?? 0, 'piezas sin barrio ni circuito')}</div>
      <div class="rp-h3">Piezas por plataforma</div><table class="rp-tabla"><thead><tr><th>Plataforma</th><th class="num">Piezas</th></tr></thead><tbody>${Object.entries(porPlat).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<tr><td>${esc(k)}</td><td class="num">${n}</td></tr>`).join('')}</tbody></table>
      <div class="rp-h3">Pauta de alcance a toda la Capital</div>${conClaseTabla(htmlPautaPDF(recientes))}<p class="rp-nota">Se muestran las 12 piezas de alcance a toda la Capital con vigencia más reciente (de ${totalCapital} registradas).</p>`;
  }

  // ---------- Capital: ranking y cobertura ----------
  function renderRankingCapital(ctx, T) {
    const datos = ctx.datos || [];
    const conteo = {};
    datos.forEach(d => { const c = d.Categoria_v4 === 'B.2' ? 'D' : d.Categoria_v4; conteo[c] = (conteo[c] || 0) + 1; });
    const cats = Object.entries(COLORES_CATEGORIA).filter(([k]) => k !== 'B.2');
    const chips = cats.map(([cat, cfg]) => `<span class="rp-evitar" style="display:inline-flex;align-items:center;gap:6px;margin:0 14px 6px 0;font-size:11px"><span style="width:11px;height:11px;border-radius:3px;background:${cfg.bg};display:inline-block"></span>${esc(cfg.label)} (${conteo[cat] || 0})</span>`).join('');
    const orden = [...datos].sort((a, b) => (b.Share_G23 || 0) - (a.Share_G23 || 0));
    const filas = orden.map(d => T.md(<tr key={d.CircuitoKey}>
      <td><strong>{d.CircuitoKey}</strong> {d.cirn_nom}</td>
      <td><Badge categoria={d.Categoria_v4} tipo="v4" /></td>
      <td className="num"><strong>{formatPct(d.Share_G23)}</strong></td>
      <td className="num">{formatPct(d.Share_L25)}</td>
      <td className="num">{d.Victorias_Total}/4</td>
      <td className="num">{d.Padron_G23?.toLocaleString('es-AR')}</td>
    </tr>)).join('');
    return `<p class="rp-sub">Circuitos ordenados por % de votos del peronismo en Gob. 2023.</p><div style="margin-bottom:8px">${chips}</div>
      <table class="rp-tabla rp-compacta"><thead><tr><th>Circuito</th><th>Diagnóstico</th><th class="num">Gob. 2023</th><th class="num">Dip. 2025</th><th class="num">Victorias</th><th class="num">Padrón</th></tr></thead><tbody>${filas}</tbody></table>`;
  }
  function renderCoberturaCapital(ctx) {
    const filas = [...(ctx.datos || [])].sort((a, b) => compararMapkey(a.CircuitoKey, b.CircuitoKey)).map(d => {
      const ev = ctx.eventosPorCircuito?.[d.Mapkey] || [];
      const n = (t) => ev.filter(e => e.tipo === t).length;
      const ult = maxFecha(ev.map(e => e.fecha));
      return `<tr><td><strong>${esc(d.CircuitoKey)}</strong> ${esc(d.cirn_nom || '')}</td><td class="num">${n('medicion')}</td><td class="num">${n('visita')}</td><td class="num">${n('pauta')}</td><td class="fecha">${ult ? formatearFecha(ult) : '—'}</td></tr>`;
    }).join('');
    return `<p class="rp-sub">Mediciones (rondas de encuesta), visitas del Gobernador y piezas de pauta por circuito.</p>
      <table class="rp-tabla rp-compacta"><thead><tr><th>Circuito</th><th class="num">Mediciones</th><th class="num">Visitas</th><th class="num">Pauta</th><th class="fecha">Última actividad</th></tr></thead><tbody>${filas}</tbody></table>`;
  }

  // ---------- Props comunes para los componentes de la UI ----------
  const propsTerritorio = (ctx) => ({
    circuito: ctx.datosCircuito.CircuitoKey, datos: ctx.datosCircuito, barrios: ctx.barrios, todosLosDatos: ctx.datos,
    onSelectCircuito: noop, barriosGeoLookup: ctx.barriosGeoLookup, recorridosLookup: ctx.recorridosLookup,
    pautasBarriosData: ctx.pautasBarriosData, obrasEnriquecidas: ctx.obrasEnriquecidas, votosEscuelasBarrioLookup: ctx.votosEscuelasBarrioLookup,
    onSelectBarrioFicha: noop, onSelectBarrioFichaPauta: noop, circuitosGeoJsonData: ctx.circuitosGeoJsonData, obrasFoco: null,
    onSelectObra: noop, votosEscuelasCircuitoData: ctx.votosEscuelasCircuitoData,
  });
  const soloCircuito = { capital: 'Seleccioná un circuito para incluir esta sección.', barrio: 'Esta información se relevó por circuito: abrí un circuito para incluirla.' };

  const SECCIONES = [
    // ---------------- Resumen ----------------
    {
      id: 'resumen', unida: true, grupo: 'Resumen', label: 'Resumen ejecutivo', descripcion: 'Las cards principales del territorio',
      disponible: () => ({ ok: true }),
      render: (ctx, o, T) => {
        if (ctx.tipo === 'capital') {
          const total = ctx.datos.reduce((s, d) => s + (d.Padron_G23 || 0), 0);
          return `<div class="rp-stack">${T.md(<CabeceraCapital totalPadron={total} cantidadCircuitos={ctx.datos.length} />)}${resumenCapitalKpis(ctx)}${T.md(<ResultadosCapital />)}</div>`;
        }
        if (ctx.tipo === 'circuito') {
          const d = ctx.datosCircuito;
          return T.md(<div className="rp-stack">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}><strong style={{ fontSize: '14px' }}>Circuito {d.CircuitoKey} — {d.cirn_nom}</strong><Badge categoria={d.Categoria_v4} tipo="v4" /></div>
            <SolapaResumen circuito={d.CircuitoKey} datos={d} padronTotal={ctx.padronTotal} encuestasData={ctx.encuestasData} />
          </div>);
        }
        return T.md(<div className="rp-stack">
          <strong style={{ fontSize: '14px' }}>Barrio {ctx.nombreBarrio}</strong>
          <SolapaResumenBarrio nombreBarrio={ctx.nombreBarrio} props={ctx.barrioProps || {}} cruceData={ctx.cruceData} barriosGeoLookup={ctx.barriosGeoLookup} todosLosDatos={ctx.datos}
            encuestasData={ctx.encuestasData} recorridosLookup={ctx.recorridosLookup} pautasBarriosData={ctx.pautasBarriosData} votosEscuelasBarrioLookup={ctx.votosEscuelasBarrioLookup}
            obrasEnriquecidas={ctx.obrasEnriquecidas} poblacionTotalPorBarrio={ctx.poblacionTotalPorBarrio} onIrACircuito={noop} onCambiarSolapa={noop} />
        </div>);
      },
      ultimoDato: (ctx) => ctx.tipo === 'capital' ? maxFecha(Object.values(ctx.encuestasData || {}).flatMap(e => (e.rondas || []).map(r => r.fecha))) : null,
      paginas: () => 1,
    },
    // ---------------- Territorio ----------------
    {
      id: 'barrios', grupo: 'Territorio', label: 'Barrios y población', descripcion: 'Barrios del circuito, o barrios cercanos al barrio',
      disponible: (ctx) => ctx.tipo === 'capital' ? { ok: false, motivo: 'Seleccioná un circuito o un barrio para incluir esta sección.' } : { ok: true },
      render: (ctx, o, T) => ctx.tipo === 'circuito'
        ? T.md(<SolapaTerritorio {...propsTerritorio(ctx)} bloques={['barrios']} />)
        : T.md(<SolapaTerritorioBarrio nombreBarrio={ctx.nombreBarrio} barriosGeoData={ctx.barriosGeoData} onSelectBarrioFicha={noop} />),
      paginas: (ctx) => ctx.tipo === 'circuito' ? 1 : 1,
    },
    {
      id: 'zona', grupo: 'Territorio', label: 'Circuitos de la zona', descripcion: 'Circuitos relacionados (variantes A, B, C…)',
      disponible: (ctx) => ctx.tipo === 'circuito' ? { ok: true } : { ok: false, motivo: soloCircuito[ctx.tipo] },
      render: (ctx, o, T) => T.md(<SolapaTerritorio {...propsTerritorio(ctx)} bloques={['zona']} />),
      paginas: () => 0.5,
    },
    {
      id: 'escuelas', grupo: 'Territorio', label: 'Votos por escuela', descripcion: '% de peronismo por centro de votación',
      disponible: (ctx) => ctx.tipo === 'capital' ? { ok: false, motivo: 'Seleccioná un circuito o un barrio para incluir esta sección.' } : { ok: true },
      render: (ctx, o, T) => ctx.tipo === 'circuito'
        ? T.md(<SolapaTerritorio {...propsTerritorio(ctx)} bloques={['escuelas']} />)
        : T.md(<SolapaEscuelasBarrio nombreBarrio={ctx.nombreBarrio} votosEscuelasBarrioLookup={ctx.votosEscuelasBarrioLookup} promedioCapitalPct={ctx.votosEscuelasBarrioData?.promedio_capital_pct} />),
      paginas: () => 0.5,
    },
    // ---------------- Electoral ----------------
    {
      id: 'ranking', grupo: 'Electoral', label: 'Diagnóstico y ranking de circuitos', descripcion: 'Los 119 circuitos por categoría y resultado',
      disponible: (ctx) => ctx.tipo === 'capital' ? { ok: true } : { ok: false, motivo: 'Es una vista de toda la Capital: deseleccioná el circuito/barrio para incluirla.' },
      render: (ctx, o, T) => renderRankingCapital(ctx, T),
      paginas: () => 3,
    },
    {
      id: 'evolucion', unida: true, grupo: 'Electoral', label: 'Evolución histórica del voto', descripcion: '% de peronismo por elección vs. Capital',
      disponible: (ctx) => ctx.tipo === 'circuito' ? { ok: true } : { ok: false, motivo: soloCircuito[ctx.tipo] },
      render: (ctx, o, T) => T.md(<SolapaEvolucion circuito={ctx.datosCircuito.CircuitoKey} datos={ctx.datosCircuito} />),
      paginas: () => 1,
    },
    {
      id: 'partidos', unida: true, grupo: 'Electoral', label: 'Composición del voto', descripcion: 'Votos por partido y ranking (Gob. 2023)',
      disponible: (ctx) => ctx.tipo === 'circuito' ? { ok: true } : { ok: false, motivo: soloCircuito[ctx.tipo] },
      render: (ctx, o, T) => T.md(<SolapaPartidos circuito={ctx.datosCircuito.CircuitoKey} datos={ctx.datosCircuito} partidos={ctx.partidos} />),
      paginas: () => 1,
    },
    {
      id: 'comparativas', unida: true, grupo: 'Electoral', label: 'Comparativas electorales', descripcion: 'Gobernador 2019 vs 2023, efecto Schiaretti, tendencias',
      disponible: (ctx) => ctx.tipo === 'circuito' ? { ok: true } : { ok: false, motivo: soloCircuito[ctx.tipo] },
      render: (ctx, o, T) => T.md(<SolapaComparativas circuito={ctx.datosCircuito.CircuitoKey} datos={ctx.datosCircuito} />),
      paginas: () => 1,
    },
    // ---------------- Comunicación y gestión ----------------
    {
      id: 'visitas', grupo: 'Comunicación y gestión', label: 'Visitas del Gobernador', descripcion: 'Recorridos y actividades en el territorio',
      disponible: () => ({ ok: true }),
      render: (ctx) => {
        if (ctx.tipo === 'barrio') return tablaVisitas(unificarVisitasPDF(ctx.recorridosLookup?.[normalizarNombreBarrio(ctx.nombreBarrio)]?.visitas || [], []).reverse(), false);
        if (ctx.tipo === 'circuito') return tablaVisitas(visitasCircuitoPDF(ctx.datosCircuito, ctx.cruceData, ctx.recorridosLookup, ctx.barriosGeoLookup), true);
        const v = visitasUnicasCapital(ctx);
        if (!v.length) return sectorTexto('Sin visitas registradas.');
        const porTipo = {}; v.forEach(x => { const t = x.tipo_visita || 'Sin tipo'; porTipo[t] = (porTipo[t] || 0) + 1; });
        const kpi = (k, val) => `<div class="rp-kpi"><div class="k">${k}</div><div class="v">${val}</div></div>`;
        return `<div class="rp-kpis" style="grid-template-columns:repeat(3,1fr)">${kpi('Visitas registradas', v.length)}${kpi('Barrios visitados', new Set(v.map(x => x._barrio)).size)}${kpi('Última visita', formatearFecha(v[0].fecha))}</div>
          <div class="rp-h3">Por tipo</div><table class="rp-tabla"><thead><tr><th>Tipo</th><th class="num">Cantidad</th></tr></thead><tbody>${Object.entries(porTipo).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<tr><td>${esc(t)}</td><td class="num">${n}</td></tr>`).join('')}</tbody></table>
          <div class="rp-h3">Últimas 25 visitas</div>${tablaVisitas(v.slice(0, 25), true)}`;
      },
      ultimoDato: (ctx) => maxFecha(Object.values(ctx.recorridosLookup || {}).flatMap(r => (r.visitas || []).map(v => v.fecha))),
      paginas: (ctx) => ctx.tipo === 'capital' ? 2 : 1,
    },
    {
      id: 'pauta', grupo: 'Comunicación y gestión', label: 'Pauta publicitaria', descripcion: 'Piezas, vigencia y alcance',
      disponible: () => ({ ok: true }),
      render: (ctx) => ctx.tipo === 'barrio' ? conClaseTabla(htmlPautaPDF(obtenerPautasDeBarrio(ctx.pautasBarriosData, ctx.nombreBarrio)))
        : ctx.tipo === 'circuito' ? conClaseTabla(htmlPautaCircuitoPDF(pautaCircuitoPDF(ctx.datosCircuito, ctx.cruceData, ctx.pautasBarriosData, ctx.barriosGeoLookup)))
        : renderPautaCapital(ctx),
      ultimoDato: (ctx) => maxFecha(todasLasPautas(ctx.pautasBarriosData).map(p => p.inicio)),
      paginas: () => 1,
    },
    {
      id: 'obras', grupo: 'Comunicación y gestión', label: 'Obras', descripcion: 'Obras públicas en el territorio',
      disponible: () => ({ ok: true }),
      render: (ctx) => ctx.tipo === 'barrio' ? conClaseTabla(htmlObrasPDF((ctx.obrasEnriquecidas || []).filter(o => normalizarNombreBarrio(o.barrio) === normalizarNombreBarrio(ctx.nombreBarrio))))
        : ctx.tipo === 'circuito' ? conClaseTabla(htmlObrasPDF((ctx.obrasEnriquecidas || []).filter(o => o._circuitoMapkey === ctx.datosCircuito.Mapkey)))
        : renderObrasCapital(ctx),
      ultimoDato: () => null,
      paginas: () => 1,
    },
    {
      id: 'cobertura', grupo: 'Comunicación y gestión', label: 'Cobertura por circuito', descripcion: 'Mediciones, visitas y pauta de cada circuito',
      disponible: (ctx) => ctx.tipo === 'capital' ? { ok: true } : { ok: false, motivo: 'Es una vista de toda la Capital: deseleccioná el circuito/barrio para incluirla.' },
      render: (ctx) => renderCoberturaCapital(ctx),
      paginas: () => 3,
    },
    // ---------------- Opinión pública ----------------
    {
      // Resumen corto (3-4 líneas) de la ronda actual: va ANTES de Encuestas y no cuenta como indicador repetido.
      id: 'resumen_ronda', unida: true, grupo: 'Opinión pública', label: 'Resumen de la ronda actual', descripcion: 'Fecha, voto, aprobación, problema principal y avisos',
      tituloImpreso: (ctx) => {
        if (ctx.tipo !== 'barrio') return 'Resumen de la ronda actual';
        const c = encuestaDeContexto(ctx).circuito;
        return c ? `Resumen de la ronda actual · Encuesta del circuito ${c.CircuitoKey} — ${c.cirn_nom || ''}` : 'Resumen de la ronda actual';
      },
      disponible: (ctx) => {
        if (ctx.tipo === 'capital') return { ok: false, motivo: 'Es un resumen por circuito: elegí un circuito o un barrio.' };
        return rondasDe(ctx).length > 0 ? { ok: true } : { ok: false, motivo: ctx.tipo === 'barrio' ? 'El circuito de este barrio no tiene encuestas relevadas.' : 'Este circuito no tiene encuestas relevadas.' };
      },
      render: (ctx, o, T) => {
        const { encuesta } = encuestaDeContexto(ctx);
        return T.md(<ResumenRondaActual encuesta={encuesta} meta={metaIV(ctx)} conTitulo={false} />);
      },
      datosAl: () => null,
      paginas: () => 0.3,
    },
    {
      id: 'encuestas', grupo: 'Opinión pública', label: 'Encuestas', descripcion: 'Hasta 3 rondas, de la más vieja a la más nueva',
      tieneOpciones: true,
      // En un barrio la encuesta es la de su circuito principal: el título del PDF lo dice para que no se lea como dato del barrio.
      tituloImpreso: (ctx) => {
        if (ctx.tipo !== 'barrio') return 'Encuestas';
        const c = encuestaDeContexto(ctx).circuito;
        return c ? `Encuestas · Encuesta del circuito ${c.CircuitoKey} — ${c.cirn_nom || ''}` : 'Encuestas';
      },
      disponible: (ctx) => {
        if (ctx.tipo === 'capital') return { ok: true };
        return rondasDe(ctx).length > 0 ? { ok: true } : { ok: false, motivo: ctx.tipo === 'barrio' ? 'El circuito de este barrio no tiene encuestas relevadas.' : 'Este circuito no tiene encuestas relevadas.' };
      },
      render: (ctx, o, T) => ctx.tipo === 'capital' ? renderEncuestasCapital(ctx) : renderEncuestas(ctx, o, T),
      ultimoDato: (ctx) => ctx.tipo === 'capital' ? maxFecha(Object.values(ctx.encuestasData || {}).flatMap(e => (e.rondas || []).map(r => r.fecha))) : maxFecha(rondasDe(ctx).map(r => r.fecha)),
      // Cada indicador lleva la fecha de sus rondas: no hace falta pie "Datos al …" (Capital conserva el suyo).
      datosAl: (ctx) => ctx.tipo === 'capital' ? undefined : null,
      paginas: (ctx) => ctx.tipo === 'capital' ? 3 : 2.5,
    },
    {
      id: 'intencion_gobernador', grupo: 'Opinión pública', label: 'Intención de voto — Gobernador', descripcion: 'Escenarios de la encuesta: una ronda o comparativo',
      tieneOpcionesIV: true,
      disponible: (ctx) => {
        if (ctx.tipo === 'capital') return { ok: true };
        return escenariosDeEncuesta(encuestaDeContexto(ctx).encuesta, ctx.encuestasMetadata?.escenarios_gobernador).rondas.length > 0
          ? { ok: true } : { ok: false, motivo: ctx.tipo === 'barrio' ? 'El circuito de este barrio no tiene intención de voto relevada.' : 'Este circuito no tiene intención de voto relevada.' };
      },
      render: (ctx, o, T) => renderIntencion(ctx, o, T),
      datosAl: (ctx) => ctx.tipo === 'capital' ? undefined : null, // sin pie "Datos al …": la ronda va en el chip de la sección
      ultimoDato: (ctx) => ctx.tipo === 'capital' ? maxFecha(Object.values(ctx.encuestasData || {}).flatMap(e => escenariosDeEncuesta(e, metaIV(ctx)).rondas.map(r => r.fecha))) : maxFecha(datosIV(ctx).rondas.map(r => r.fecha)),
      paginas: (ctx, o) => {
        if (ctx.tipo === 'capital') return 1;
        const d = datosIV(ctx); const i = o?.intencion || {};
        const r = d.rondas[Math.min(Math.max(i.rondaIdx ?? d.rondas.length - 1, 0), d.rondas.length - 1)];
        const n = i.escenarios?.length || r?.escenarios.length || 0;
        return Math.max(0.5, i.modo === 'comparativo' ? n * 0.4 : Math.ceil(n / 4) * 1);
      },
    },
  ];
  return SECCIONES;
}

// Helpers que el modal necesita para dibujar las sub-opciones de Encuestas.
export function infoEncuestasContexto(ctx, buscarEncuestaCircuito, resolverCircuitoPrincipalDeBarrio) {
  if (ctx.tipo === 'circuito') return buscarEncuestaCircuito(ctx.encuestasData, ctx.datosCircuito.CircuitoKey)?.rondas || [];
  if (ctx.tipo === 'barrio') {
    const circ = resolverCircuitoPrincipalDeBarrio(ctx.nombreBarrio, ctx.cruceData, ctx.barriosGeoLookup, ctx.datos);
    return circ ? (buscarEncuestaCircuito(ctx.encuestasData, circ.CircuitoKey)?.rondas || []) : [];
  }
  return [];
}

// Escenarios del contexto, para las sub-opciones del modal: rondas con intención de voto y sus escenarios.
export function infoIntencionContexto(ctx, buscarEncuestaCircuito, resolverCircuitoPrincipalDeBarrio) {
  const meta = ctx.encuestasMetadata?.escenarios_gobernador;
  let encuesta = null;
  if (ctx.tipo === 'circuito') encuesta = buscarEncuestaCircuito(ctx.encuestasData, ctx.datosCircuito.CircuitoKey);
  else if (ctx.tipo === 'barrio') {
    const circ = resolverCircuitoPrincipalDeBarrio(ctx.nombreBarrio, ctx.cruceData, ctx.barriosGeoLookup, ctx.datos);
    encuesta = circ ? buscarEncuestaCircuito(ctx.encuestasData, circ.CircuitoKey) : null;
  }
  return escenariosDeEncuesta(encuesta, meta).rondas;
}
