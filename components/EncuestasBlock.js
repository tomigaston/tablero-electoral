// Bloque "Encuestas": UN componente para las tres superficies (pantalla, "Generar reporte" y "Exportar ficha").
// Las reglas (qué familia usa cada indicador, tope de 3 rondas, S/D, redondeo, deltas) viven en
// lib/encuestasBloque.js; acá solo se dibuja. Estilos en línea + una <style> con clases `eb-*`, así que sale
// igual con renderToStaticMarkup (reporte / ficha) que en pantalla, sin depender de CSS global.
//
// Formato por tipo de dato: A escalar → TimelineRow · B composición 100% → StackedBars · C lista → RankingBars.

import React from 'react';
import { armarBloque, seleccionarRondas, etiquetaRonda, colorTextoSobre, MAX_RONDAS } from '../lib/encuestasBloque';

/** @typedef {import('../lib/encuestasBloque').Ronda} Ronda */

const NEUTRO = '#444';
const TENUE = '#666'; // gris de lectura (contraste ≥ 5:1 sobre blanco), NO es "atenuado": los datos se ven completos

const CSS = `
.eb-root{container-type:inline-size;font-size:12px;color:var(--text-primary,#1a1a1a)}
.eb-root *{box-sizing:border-box}
.eb-grupo{margin:0 0 18px}
.eb-grupo-t{text-align:center;font-size:12px;font-weight:700;color:var(--text-secondary,#555);text-transform:uppercase;letter-spacing:.4px;margin:0 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border,#d9d9d9);break-after:avoid;page-break-after:avoid}
.eb-ind{margin:0 0 14px;break-inside:avoid;page-break-inside:avoid}
.eb-ind-t{font-size:13px;font-weight:600;margin:0 0 6px}
.eb-tl{display:flex;align-items:flex-start;gap:0}
.eb-col{flex:1 1 0;min-width:0;text-align:center}
.eb-num{font-size:26px;font-weight:700;line-height:1.1}
.eb-sd{font-size:13px;font-weight:600;color:${TENUE};line-height:1.3;padding:5px 2px 4px}
.eb-fecha{font-size:11px;color:${TENUE};margin-top:3px;white-space:nowrap}
.eb-fl{flex:0 0 92px;text-align:center;padding-top:1px;color:${NEUTRO}}
.eb-fl-d{font-size:12px;font-weight:700;min-height:16px;white-space:nowrap}
.eb-fl-a{font-size:22px;line-height:1;margin-top:2px}
.eb-fila{display:flex;align-items:flex-start;gap:10px;margin:0 0 5px}
.eb-lbl{flex:0 0 150px;font-size:11px;color:${TENUE};line-height:28px}
.eb-barra{display:flex;height:26px;border-radius:4px;overflow:hidden;border:1px solid #9e9e9e;background:#fff}
.eb-bw{flex:1 1 0;min-width:0}
.eb-seg{display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:11px;font-weight:600;border-left:1px solid #fff;white-space:nowrap}
.eb-seg:first-child{border-left:0}
.eb-co{position:relative;margin-top:1px}
.eb-co-i{position:absolute;top:0;transform:translateX(-50%);font-size:11px;font-weight:600;white-space:nowrap;line-height:13px;padding-top:7px}
.eb-co-i:before{content:'';position:absolute;left:50%;top:0;height:6px;border-left:1px solid #424242}
.eb-co-i.eb-ini{transform:none}.eb-co-i.eb-ini:before{left:0}
.eb-co-i.eb-fin{transform:translateX(-100%)}.eb-co-i.eb-fin:before{left:100%}
.eb-ceros{margin:-2px 0 5px 160px;font-size:11px;color:${TENUE}}
.eb-ley{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 14px;margin:6px 0 0 160px;font-size:11px;color:${NEUTRO}}
.eb-ley-i{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.eb-sw{width:11px;height:11px;border:1px solid #757575;border-radius:2px;display:inline-block}
.eb-dl{text-align:center;margin:3px 0 0 160px;font-size:11px;color:${NEUTRO}}
.eb-dl b{font-weight:700}
.eb-rk{display:flex;align-items:flex-start;gap:10px;margin:0 0 6px}
.eb-rk-l{flex:0 0 190px;font-size:12px;line-height:1.25;padding-top:2px}
.eb-rk-b{flex:1 1 0;min-width:0}
.eb-rk-r{display:flex;align-items:center;gap:6px;margin:0 0 2px;min-height:15px}
.eb-rk-f{height:13px;border-radius:2px;flex:0 0 auto}
.eb-rk-v{font-size:12px;font-weight:700;white-space:nowrap}
.eb-rk-sd{font-size:11px;font-weight:600;color:${TENUE}}
.eb-rk-ley{display:flex;flex-wrap:wrap;gap:4px 14px;margin:0 0 6px;font-size:11px;color:${NEUTRO}}
@container (max-width:520px){
  .eb-tl{flex-direction:column;align-items:stretch}
  .eb-fl{flex:0 0 auto;padding:6px 0}
  .eb-fl-a{transform:rotate(90deg);display:inline-block}
  .eb-fila{flex-direction:column;align-items:stretch;gap:3px}
  .eb-lbl{flex:0 0 auto;line-height:1.3}
  .eb-ceros,.eb-ley,.eb-dl{margin-left:0}
  .eb-rk{flex-direction:column;gap:2px}
  .eb-rk-l{flex:0 0 auto}
}
`;

const Sd = () => <div className="eb-sd">No se preguntó</div>;

/** Familia A — escalar: una fila, una columna por ronda; entre rondas una flecha con el cambio en pp encima. */
export function TimelineRow({ item }) {
  const partes = [];
  item.columnas.forEach((c, i) => {
    if (i > 0) {
      const f = item.flechas[i - 1];
      partes.push(
        <div key={`f${i}`} className="eb-fl" aria-hidden={f.delta == null ? 'true' : undefined}>
          <div className="eb-fl-d">{f.delta == null ? '' : `${f.signo} ${f.texto} pp`}</div>
          <div className="eb-fl-a">→</div>
        </div>
      );
    }
    partes.push(
      <div key={`c${i}`} className="eb-col">
        {c.valor == null ? <Sd /> : <div className="eb-num">{c.texto}</div>}
        <div className="eb-fecha">{c.etiqueta}</div>
      </div>
    );
  });
  return (
    <div className="eb-ind" data-familia="A">
      <div className="eb-ind-t">{item.titulo}</div>
      <div className="eb-tl">{partes}</div>
    </div>
  );
}

// Etiquetas de los segmentos angostos, debajo de la barra y alineadas a su centro. Si dos se pisan, la siguiente baja un nivel.
// El ancho de texto se estima (no se mide) contra una barra nominal de 480px: solo decide si hace falta bajar de nivel.
function EtiquetasExternas({ partes, segmentos }) {
  if (!partes.length) return null;
  const AV = 6.2, BARRA = 480; // px por carácter (11px, negrita) y ancho nominal de la barra
  const fin = [];
  const items = partes.map(p => {
    const texto = `${segmentos.find(s => s.cat === p.cat)?.etiqueta} ${p.texto}`;
    const ancho = (texto.length * AV) / BARRA * 100; // % de la barra
    const borde = p.centro - ancho / 2 < 0 ? 'ini' : p.centro + ancho / 2 > 100 ? 'fin' : null;
    const desde = borde === 'ini' ? 0 : borde === 'fin' ? 100 - ancho : p.centro - ancho / 2;
    let nivel = fin.findIndex(f => f <= desde);
    if (nivel < 0) nivel = fin.length;
    fin[nivel] = desde + ancho + 1;
    return { p, texto, borde, nivel };
  });
  const niveles = fin.length;
  return (
    <div className="eb-co" style={{ height: 7 + niveles * 14 }}>
      {items.map(({ p, texto, borde, nivel }) => (
        <span key={p.cat} className={`eb-co-i${borde ? ` eb-${borde}` : ''}`} style={{ left: borde === 'ini' ? 0 : borde === 'fin' ? '100%' : `${p.centro}%`, top: nivel * 14 }}>{texto}</span>
      ))}
    </div>
  );
}

/** Familia B — composición 100%: una barra apilada por ronda (solo las que tienen dato), orden de segmentos fijo. */
export function StackedBars({ item }) {
  const nombres = item.segmentos.filter(s => item.barras.some(b => b.partes.some(p => p.cat === s.cat)));
  return (
    <div className="eb-ind" data-familia="B">
      <div className="eb-ind-t">{item.titulo}</div>
      {item.barras.map(b => {
        const ceros = b.partes.filter(p => p.valor <= 0);
        return (
          <React.Fragment key={b.fecha}>
            <div className="eb-fila">
              <div className="eb-lbl">{b.etiqueta}</div>
              <div className="eb-bw">
                <div className="eb-barra" role="img" aria-label={b.partes.map(p => `${item.segmentos.find(s => s.cat === p.cat)?.etiqueta} ${p.texto}`).join(', ')}>
                  {b.partes.filter(p => p.valor > 0).map(p => (
                    // Ancho proporcional a valor / suma de la fila; el texto es el número reportado.
                    // Los segmentos angostos no llevan texto adentro: su etiqueta va por fuera, con línea guía.
                    <div key={p.cat} className="eb-seg" style={{ flex: `${p.valor} 1 0%`, background: p.color, color: colorTextoSobre(p.color) }}>{p.externa ? '' : p.texto}</div>
                  ))}
                </div>
                <EtiquetasExternas partes={b.partes.filter(p => p.externa)} segmentos={item.segmentos} />
              </div>
            </div>
            {ceros.length > 0 && (
              <div className="eb-ceros">{ceros.map(p => `${item.segmentos.find(s => s.cat === p.cat)?.etiqueta} ${p.texto}`).join(' · ')}</div>
            )}
          </React.Fragment>
        );
      })}
      <div className="eb-ley">
        {nombres.map(s => <span key={s.cat} className="eb-ley-i"><span className="eb-sw" style={{ background: s.color }} />{s.etiqueta}</span>)}
      </div>
      {item.deltas.map(d => (
        <div key={d.hasta} className="eb-dl">
          Cambio {d.desde} → {d.hasta}: {d.items.map((x, i) => <React.Fragment key={x.cat}>{i > 0 ? ' · ' : ''}{x.etiqueta} <b>{x.signo} {x.texto}</b></React.Fragment>)} <span style={{ color: TENUE }}>(pp)</span>
        </div>
      ))}
    </div>
  );
}

/** Familia C — lista/ranking: barras horizontales grises, de mayor a menor, % a la derecha de cada barra. */
export function RankingBars({ item }) {
  const max = Math.max(1, ...item.filas.flatMap(f => f.valores.map(v => v.valor ?? 0)));
  const varias = item.rondas.length > 1;
  return (
    <div className="eb-ind" data-familia="C">
      <div className="eb-ind-t">{item.titulo}</div>
      {varias ? (
        <div className="eb-rk-ley">
          {item.rondas.map(r => <span key={r.fecha} className="eb-ley-i"><span className="eb-sw" style={{ background: r.color }} />{r.etiqueta}</span>)}
        </div>
      ) : (
        <div className="eb-rk-ley">{item.rondas[0].etiqueta}</div>
      )}
      {item.filas.map(f => (
        <div key={f.cat} className="eb-rk">
          <div className="eb-rk-l">{f.etiqueta}</div>
          <div className="eb-rk-b">
            {f.valores.map((v, k) => (
              <div key={k} className="eb-rk-r">
                {v.valor == null
                  ? <span className="eb-rk-sd">S/D</span>
                  : <><div className="eb-rk-f" style={{ width: `${Math.max((v.valor / max) * 84, v.valor > 0 ? 0.8 : 0)}%`, background: item.rondas[k].color }} /><span className="eb-rk-v">{v.texto}</span></>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const POR_FAMILIA = { A: TimelineRow, B: StackedBars, C: RankingBars };

/**
 * Bloque completo. `rondas` = las rondas del circuito (se recortan a las 3 más recientes); `fechas` (opcional)
 * restringe a las elegidas por el usuario. Misma salida en pantalla, reporte y ficha.
 * @param {{ rondas: Ronda[], fechas?: string[]|null }} props
 */
export function EncuestasBlock({ rondas, fechas = null }) {
  const { grupos } = armarBloque(seleccionarRondas(rondas, fechas));
  return (
    <div className="eb-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {grupos.length === 0 && <p style={{ fontSize: 12, color: TENUE }}>Sin datos de encuestas.</p>}
      {grupos.map(g => (
        <div key={g.id} className="eb-grupo">
          <div className="eb-grupo-t">{g.titulo}</div>
          {g.items.map(it => { const Fam = POR_FAMILIA[it.familia]; return <Fam key={it.id} item={it} />; })}
        </div>
      ))}
    </div>
  );
}

/** Fechas (ISO) que el bloque muestra por defecto: las 3 rondas más recientes. */
export const fechasPorDefecto = (rondas) => seleccionarRondas(rondas).map(r => r.fecha);

/**
 * Selector de rondas a comparar (máx. 3). Siempre queda al menos una. `seleccion` = fechas ISO elegidas.
 * Es solo para elegir QUÉ rondas ver: el formato del bloque no cambia.
 */
export function SelectorRondas({ rondas, seleccion, onChange, compacto = false }) {
  const orden = [...rondas].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const sel = new Set(seleccion);
  const lleno = sel.size >= MAX_RONDAS;
  const alternar = (fecha) => {
    const n = new Set(sel);
    if (n.has(fecha)) { if (n.size > 1) n.delete(fecha); } else if (!lleno) n.add(fecha);
    onChange(orden.filter(r => n.has(r.fecha)).map(r => r.fecha));
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      {!compacto && <span style={{ fontSize: 12, color: TENUE }}>Rondas a comparar (máx. {MAX_RONDAS}):</span>}
      {orden.map(r => {
        const on = sel.has(r.fecha);
        const bloqueado = !on && lleno;
        return (
          <button
            key={r.fecha} type="button" onClick={() => alternar(r.fecha)} disabled={bloqueado} aria-pressed={on}
            title={bloqueado ? `Ya hay ${MAX_RONDAS} rondas elegidas: sacá una para sumar otra` : undefined}
            style={{ padding: '5px 10px', borderRadius: 999, border: `1px solid ${on ? '#1976D2' : 'var(--border, #d9d9d9)'}`, background: on ? '#1976D2' : '#fff', color: on ? '#fff' : '#1a1a1a', fontSize: 12, fontWeight: 500, cursor: bloqueado ? 'not-allowed' : 'pointer', opacity: bloqueado ? 0.45 : 1 }}
          >{etiquetaRonda(r)}</button>
        );
      })}
    </div>
  );
}
