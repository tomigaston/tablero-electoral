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

export const GRUPOS_REPORTE = ['Resumen', 'Territorio', 'Electoral', 'Comunicación y gestión', 'Opinión pública'];

const UMBRAL_MUESTRA_REDUCIDA = 30;
const maxFecha = (fechas) => fechas.filter(Boolean).reduce((m, f) => (!m || f > m ? f : m), null);
const conClaseTabla = (html) => html.replace(/<table>/g, '<table class="rp-tabla">');

export function crearRegistroSecciones(D) {
  const { ui, fn } = D;
  const {
    SolapaResumen, SolapaEvolucion, SolapaPartidos, SolapaComparativas, SolapaTerritorio, SolapaResumenBarrio,
    SolapaTerritorioBarrio, SolapaEscuelasBarrio, ResumenEncuesta, ComparativoEncuesta,
    CabeceraCapital, ResultadosCapital, Badge, COLORES_CATEGORIA,
  } = ui;
  const {
    formatearFecha, normalizarNombreBarrio, buscarEncuestaCircuito, resolverCircuitoPrincipalDeBarrio,
    compararMapkey, estadoMostradoPauta, obtenerPautasDeBarrio, unificarVisitasPDF, visitasCircuitoPDF,
    htmlPautaPDF, htmlPautaCircuitoPDF, pautaCircuitoPDF, htmlObrasPDF, htmlBarraCategoriasPDF, htmlMejoraPDF,
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
  const etiquetaRonda = (r) => `${formatearFecha(r.fecha)}${r.casos != null ? ` (n=${r.casos})` : ''}`;
  const avisoMuestra = (rondas) => {
    const chicas = rondas.filter(r => r.casos != null && r.casos < UMBRAL_MUESTRA_REDUCIDA);
    if (!chicas.length) return '';
    return `<div class="rp-aviso">⚠ Muestra reducida: ${chicas.map(r => `${formatearFecha(r.fecha)} (n=${r.casos})`).join(', ')}. Con tan pocas respuestas los porcentajes son orientativos y pueden variar mucho.</div>`;
  };
  function complementosRonda(r) {
    const p = r.preguntas || {};
    const func = [['Centro Vecinal', 'Funcionamiento Centro Vecinal'], ['CPC', 'Funcionamiento CPC']].filter(([, k]) => p[k]).map(([n, k]) => htmlBarraCategoriasPDF(`Funcionamiento ${n}`, p[k], null)).join('');
    const mej = [['Bacheos', 'Mejoras en bacheos'], ['Alumbrado público', 'Mejoras en alumbrado público'], ['Espacios públicos', 'Mejoras en espacios públicos'], ['Ordenamiento de naranjitas y limpiavidrios', 'Mejoras en ordenamiento naranjitas y limpiavidrios']]
      .filter(([, k]) => p[k]).map(([n, k]) => htmlMejoraPDF(n, p[k], null)).join('');
    if (!func && !mej) return '';
    return `<div class="rp-evitar">${func ? `<div class="rp-h3">Funcionamiento de instituciones locales</div>${func}` : ''}${mej ? `<div class="rp-h3">Mejoras percibidas</div>${mej}` : ''}</div>`;
  }

  // Estructura sin repetir contenido:
  //  · Comparativo (A→B, o todas las rondas): resumen de cambios + indicadores + gestión + problemas, UNA vez.
  //  · Una ronda: foto completa de esa ronda. Si esa ronda ya está dentro del comparativo, no se vuelve a
  //    mostrar (sus indicadores ya están arriba): solo se agregan los datos que el comparativo no trae
  //    (funcionamiento de instituciones y mejoras percibidas).
  function renderEncuestas(ctx, opciones, T) {
    const { encuesta, heredada, circuito } = encuestaDeContexto(ctx);
    const rondas = encuesta?.rondas || [];
    const o = opciones?.encuestas || {};
    const umbral = ctx.encuestasMetadata?.umbral_variacion_pp ?? 2.5;
    const iR = Math.min(Math.max(o.rondaIdx ?? rondas.length - 1, 0), rondas.length - 1);
    const hacerComparativo = !!o.comparativo && rondas.length >= 2;
    const hacerRonda = !!o.ronda || !hacerComparativo;
    let rondasComparadas = [];
    if (hacerComparativo) {
      if (o.todas && rondas.length >= 3) rondasComparadas = rondas;
      else {
        let a = Math.min(Math.max(o.a ?? rondas.length - 2, 0), rondas.length - 1);
        let b = Math.min(Math.max(o.b ?? rondas.length - 1, 0), rondas.length - 1);
        if (a === b) { a = Math.max(b - 1, 0); }
        if (a > b) [a, b] = [b, a];
        rondasComparadas = [rondas[a], rondas[b]];
      }
    }
    const partes = [];
    if (heredada) partes.push(`<p class="rp-nota">Las encuestas se relevan por circuito: se muestra la del circuito ${esc(circuito?.CircuitoKey)} ${esc(circuito?.cirn_nom || '')}, al que pertenece este barrio.</p>`);
    const involucradas = [...rondasComparadas, ...(hacerRonda ? [rondas[iR]] : [])];
    partes.push(avisoMuestra([...new Set(involucradas)]));
    // Las rondas más nuevas pueden no repetir todas las preguntas: se avisa cuáles faltan en la última
    // ronda comparada, porque para esas el comparativo usa la última ronda que sí las tiene (la fecha
    // figura en cada tarjeta).
    if (hacerComparativo) {
      const ultimaComp = rondasComparadas[rondasComparadas.length - 1];
      const faltan = [['Problemas principales', 'problemas principales'], ['Aprobación Intendente', 'aprobación del Intendente'], ['Gestión del Intendente', 'gestión del Intendente'], ['Reelección Llaryora', 'reelección']]
        .filter(([k]) => !ultimaComp.preguntas?.[k]).map(([, n]) => n);
      if (faltan.length) partes.push(`<p class="rp-nota">La ronda del ${formatearFecha(ultimaComp.fecha)} no incluyó: ${faltan.join(', ')}. Para esas preguntas se compara contra la última ronda que sí las tiene (la fecha figura en cada tarjeta).</p>`);
    }

    if (hacerComparativo) {
      const titulo = rondasComparadas.length > 2
        ? `Encuestas · Evolución ${formatearFecha(rondasComparadas[0].fecha)} → ${formatearFecha(rondasComparadas[rondasComparadas.length - 1].fecha)} (${rondasComparadas.length} rondas)`
        : `Encuestas · Comparativo ${formatearFecha(rondasComparadas[0].fecha)} → ${formatearFecha(rondasComparadas[1].fecha)}`;
      partes.push(`<div class="rp-h3" style="margin-top:0">${titulo}</div>${T.md(<ComparativoEncuesta encuesta={{ rondas: rondasComparadas }} umbral={umbral} metadata={ctx.encuestasMetadata} />)}`);
    }
    if (hacerRonda && rondas[iR]) {
      const r = rondas[iR];
      const yaEnComparativo = hacerComparativo && rondasComparadas.includes(r);
      if (yaEnComparativo) {
        const comp = complementosRonda(r);
        if (comp) partes.push(`<div class="rp-h3">Datos complementarios · Ronda del ${etiquetaRonda(r)}</div>${comp}`);
      } else {
        partes.push(`<div class="rp-h3"${hacerComparativo ? '' : ' style="margin-top:0"'}>Encuestas · Ronda del ${etiquetaRonda(r)}</div>${T.md(<ResumenEncuesta preguntas={r.preguntas} />)}${complementosRonda(r)}`);
      }
    }
    return partes.join('');
  }

  function renderEncuestasCapital(ctx) {
    const filas = (ctx.datos || []).map(d => ({ d, enc: buscarEncuestaCircuito(ctx.encuestasData, d.CircuitoKey) }))
      .filter(f => f.enc && f.enc.rondas?.length).sort((a, b) => compararMapkey(a.d.CircuitoKey, b.d.CircuitoKey));
    if (!filas.length) return sectorTexto('Sin encuestas relevadas.');
    const ultimaDe = (rondas, pregunta, cat) => { for (let i = rondas.length - 1; i >= 0; i--) { const v = rondas[i].preguntas?.[pregunta]?.[cat]; if (v != null) return v; } return null; };
    const pct = (v) => v != null ? `${v.toFixed(1)}%` : '—';
    return `<p class="rp-sub">${filas.length} de ${ctx.datos.length} circuitos con encuesta. Por circuito: última ronda y último dato disponible de cada indicador.</p>
    <table class="rp-tabla rp-compacta"><thead><tr><th>Circuito</th><th class="fecha">Última ronda</th><th class="num">n</th><th class="num">Rondas</th><th class="num">Gestión Gob. (positiva)</th><th class="num">Aprobación Gob.</th></tr></thead><tbody>${filas.map(({ d, enc }) => {
      const ult = enc.rondas[enc.rondas.length - 1];
      return `<tr><td><strong>${esc(d.CircuitoKey)}</strong> ${esc(d.cirn_nom || '')}</td><td class="fecha">${formatearFecha(ult.fecha)}</td><td class="num">${ult.casos ?? '—'}</td><td class="num">${enc.rondas.length}</td><td class="num">${pct(ultimaDe(enc.rondas, 'Gestión del Gobernador', 'Positiva'))}</td><td class="num">${pct(ultimaDe(enc.rondas, 'Aprobación Gobernador', 'Apruebo'))}</td></tr>`;
    }).join('')}</tbody></table>`;
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
      id: 'encuestas', grupo: 'Opinión pública', label: 'Encuestas', descripcion: 'Una ronda, comparativo entre rondas o evolución',
      tieneOpciones: true,
      disponible: (ctx) => {
        if (ctx.tipo === 'capital') return { ok: true };
        return rondasDe(ctx).length > 0 ? { ok: true } : { ok: false, motivo: ctx.tipo === 'barrio' ? 'El circuito de este barrio no tiene encuestas relevadas.' : 'Este circuito no tiene encuestas relevadas.' };
      },
      render: (ctx, o, T) => ctx.tipo === 'capital' ? renderEncuestasCapital(ctx) : renderEncuestas(ctx, o, T),
      ultimoDato: (ctx) => ctx.tipo === 'capital' ? maxFecha(Object.values(ctx.encuestasData || {}).flatMap(e => (e.rondas || []).map(r => r.fecha))) : maxFecha(rondasDe(ctx).map(r => r.fecha)),
      paginas: (ctx, o) => {
        if (ctx.tipo === 'capital') return 3;
        const e = o?.encuestas || {};
        return (e.comparativo ? 2 : 0) + ((e.ronda || !e.comparativo) ? 1.5 : 0.5);
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
