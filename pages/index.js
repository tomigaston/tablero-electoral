import React, { useState, useEffect, useMemo, useRef } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import * as topojson from 'topojson-client';
import { obrasCercanasABarrio, obrasCercanasACircuito, construirIndiceBarrioCircuito, construirIndiceMapkeyNombre, enriquecerObrasConCircuito, obrasCercanasAObra } from '../lib/obrasCercanas';
import { formatearFecha } from '../lib/formatearFecha';
import { descargarExcelEventos } from '../lib/exportarEventosExcel';
import ModalReporte from '../components/reporte/ModalReporte';
import { crearRegistroSecciones, infoEncuestasContexto } from '../components/reporte/registro';
import { generarReporte as armarReporte } from '../components/reporte/generar';
import { imprimirReporte } from '../components/reporte/imprimir';
import { estilosReporte } from '../components/reporte/estilos';
import { pautaEstaVigente, estadoMostradoPauta, parsearFechaISOPauta, esObraPautaMesaCapital } from '../lib/estadoPauta';

const MapaCircuitos = dynamic(() => import('../components/MapaCircuitos'), { 
  ssr: false,
  loading: () => <div style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>Cargando mapa...</div>
});

// ============================================
// PALETA DE COLORES
// ============================================
const COLORES_CATEGORIA = {
  'A.1': { bg: '#2E7D32', text: '#1B5E20', label: 'BASTIÓN SÓLIDO' },
  'A.2': { bg: '#FFCA28', text: '#F57F17', label: 'BASTIÓN CON EROSIÓN' },
  'B.1': { bg: '#26A69A', text: '#00695C', label: 'TERRITORIO LEAL' },
  'B.3': { bg: '#FF7043', text: '#BF360C', label: 'PÉRDIDA 2023' },
  'B.2': { bg: '#78909C', text: '#37474F', label: 'EN DISPUTA' },
  'D': { bg: '#78909C', text: '#37474F', label: 'EN DISPUTA' },
  'C': { bg: '#EF5350', text: '#B71C1C', label: 'TERRITORIO HOSTIL' },
};

// Semáforo de diagnóstico (punto de color sin texto, header de circuito — solapa +
// PDF). Mapeo FIJO desde el código de Categoria_v4, no se deriva de nuevo con lógica
// propia: los 3 "buenos" (Bastión Sólido/con Erosión, Territorio Leal) a verde, "En
// Disputa" (código B.2 y su alias D, ver COLORES_CATEGORIA arriba) a amarillo, y los
// 2 "perdidos" (Pérdida 2023, Territorio Hostil) a rojo. Gris neutro de fallback para
// categoría ausente/desconocida — no debe romper (mismo criterio de fallback que ya
// usa Badge más abajo).
const COLOR_DIAGNOSTICO_V4 = {
  'A.1': '#22C55E', 'A.2': '#22C55E', 'B.1': '#22C55E',
  'B.2': '#FBBF24', 'D': '#FBBF24',
  'B.3': '#EF4444', 'C': '#EF4444',
};
const COLOR_DIAGNOSTICO_NEUTRO = '#9E9E9E';
const colorDiagnosticoV4 = (categoria) => COLOR_DIAGNOSTICO_V4[categoria] || COLOR_DIAGNOSTICO_NEUTRO;

// Wording neutro para el tooltip (solo pantalla, on-hover) del punto — sin la palabra
// "hostil", ver CONTEXTO_PROYECTO.md.
const TEXTO_DIAGNOSTICO_V4 = {
  'A.1': 'Diagnóstico general: favorable', 'A.2': 'Diagnóstico general: favorable', 'B.1': 'Diagnóstico general: favorable',
  'B.2': 'Diagnóstico general: mixto', 'D': 'Diagnóstico general: mixto',
  'B.3': 'Diagnóstico general: desfavorable', 'C': 'Diagnóstico general: desfavorable',
};
const textoDiagnosticoV4 = (categoria) => TEXTO_DIAGNOSTICO_V4[categoria] || 'Diagnóstico general: sin clasificar';

const COLORES_ML = {
  'ML.1': { bg: '#4CAF50', text: '#1B5E20', label: 'FIEL CRECIENTE' },
  'ML.2': { bg: '#FFCA28', text: '#F57F17', label: 'FIEL ESTANCADO' },
  'ML.3': { bg: '#42A5F5', text: '#1565C0', label: 'CONQUISTA ML' },
  'ML.4': { bg: '#26A69A', text: '#00695C', label: 'AVANCE CON DERROTA' },
  'ML.5': { bg: '#EF5350', text: '#B71C1C', label: 'RETROCESO' },
  'ML.6': { bg: '#78909C', text: '#37474F', label: 'ADVERSO' },
};

// Umbral de "Finalizada" para Vista Obras (tarjeta resumen + eventual filtro) — valor
// por default a falta de un criterio oficial, fácil de ajustar en un solo lugar si
// después se define otro corte.
const UMBRAL_OBRA_FINALIZADA = 0.95;

// Mismos 3 colores fijos por rango que pide la barra de avance de Vista Obras; también
// usado por htmlObrasPDF (ficha PDF de circuito/barrio) para el badge de avance.
const COLOR_AVANCE_OBRA = { bajo: '#EF5350', medio: '#FFA726', alto: '#66BB6A' };
const colorAvanceObra = (avance) => {
  const pct = (avance ?? 0) * 100;
  if (pct < 30) return COLOR_AVANCE_OBRA.bajo;
  if (pct < 70) return COLOR_AVANCE_OBRA.medio;
  return COLOR_AVANCE_OBRA.alto;
};

// Descripciones CLARAS para el popup de info
const DESCRIPCIONES_CATEGORIA = {
  'A.1': 'Ganó las 4 elecciones analizadas: Gob. 2019, Gob. 2023, Dip. 2021 y Dip. 2025.',
  'A.2': 'Ganó en Gob. 2019 y Gob. 2023, pero el porcentaje de votos bajó de una elección a la otra.',
  'B.1': 'Vota mayoritariamente al oficialismo de forma consistente, aunque no siempre gana.',
  'B.3': 'Ganó en Gob. 2019 pero perdió en Gob. 2023.',
  'D': 'Circuito reñido donde las elecciones se definen por pocos votos. Sin patrón claro.',
  'C': 'Perdió las 4 elecciones analizadas: Gob. 2019, Gob. 2023, Dip. 2021 y Dip. 2025.',
};

const DESCRIPCIONES_ML = {
  'ML.1': 'Ganó con Llaryora en Int. 2019 y en Gob. 2023, y el porcentaje de votos creció más que el promedio de Capital (+5.6 pp).',
  'ML.2': 'Ganó con Llaryora en Int. 2019 y en Gob. 2023, pero el crecimiento fue igual o menor que el promedio de Capital.',
  'ML.3': 'Perdió en Int. 2019 pero ganó en Gob. 2023. Territorio conquistado por Llaryora.',
  'ML.4': 'Ganó en Int. 2019 pero perdió en Gob. 2023. Sin embargo, el porcentaje de votos de Llaryora subió. Perdió por irrupción de terceros, no por pérdida de votos propios.',
  'ML.5': 'Perdió en Gob. 2023 y además el porcentaje de votos bajó respecto a Int. 2019.',
  'ML.6': 'Perdió ambas elecciones con Llaryora: Int. 2019 y Gob. 2023.',
};

// ============================================
// FOCUS TRAP (accesibilidad — overlays tipo modal/popup)
// ============================================
// Selector de elementos "tabeables" estándar (mismo criterio que usan los focus traps
// de las librerías de UI más comunes, WAI-ARIA Authoring Practices).
const FOCUS_TRAP_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Pila de contenedores con trap activo, compartida entre todas las instancias del hook
// a propósito: cuando dos overlays quedan apilados (p.ej. PopupNavegacionCruzada abierto
// sobre FichaObra) el Tab tiene que cicular SOLO dentro del que está arriba de todo — el
// o los overlays de abajo se quedan callados (su handler no hace nada) hasta que el de
// encima se desapile al cerrarse.
const pilaFocusTrap = [];

// Hook reusado por los 5 overlays tipo modal/popup del tablero (InfoModal, ModalObra,
// FichaObra, DialogExportFicha, PopupNavegacionCruzada): al abrirse mueve el foco al
// primer elemento foco-able de adentro (o al contenedor mismo si no hay ninguno),
// mientras está abierto cicla Tab/Shift+Tab entre los elementos foco-ables de adentro
// sin dejarlo salir hacia el resto de la página, y al cerrarse devuelve el foco a quien
// lo disparó. `isOpen` cubre los dos patrones de overlay que conviven en el archivo:
// los que se montan/desmontan condicionalmente desde el padre (FichaObra,
// PopupNavegacionCruzada — pasarle siempre `true`, el mount ES la apertura) y los que
// quedan montados fijos y prenden/apagan con un prop propio (InfoModal, ModalObra,
// DialogExportFicha) — en ese caso el hook igual se llama en TODOS los renders, antes
// de cualquier `if (!x) return null`, para no romper las Rules of Hooks. Devuelve un
// ref para poner en el elemento contenedor del overlay (la "card" centrada, no el
// backdrop) — hay que sumarle `tabIndex={-1}` en el JSX para que sea foco-able incluso
// cuando no tiene ningún elemento interactivo adentro.
function useFocusTrap(isOpen) {
  const containerRef = useRef(null);
  const previoFocoRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const contenedor = containerRef.current;
    if (!contenedor) return undefined;

    previoFocoRef.current = document.activeElement;
    pilaFocusTrap.push(contenedor);

    const focusables = () => Array.from(contenedor.querySelectorAll(FOCUS_TRAP_SELECTOR)).filter((el) => el.offsetParent !== null);
    const primero = focusables()[0];
    (primero || contenedor).focus();

    const handleKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      if (pilaFocusTrap[pilaFocusTrap.length - 1] !== contenedor) return; // no es el tope de la pila: no responde
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const activo = document.activeElement;
      if (e.shiftKey) {
        if (activo === first || !contenedor.contains(activo)) { e.preventDefault(); last.focus(); }
      } else if (activo === last || !contenedor.contains(activo)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const idx = pilaFocusTrap.indexOf(contenedor);
      if (idx !== -1) pilaFocusTrap.splice(idx, 1);
      previoFocoRef.current?.focus?.();
    };
  }, [isOpen]);

  return containerRef;
}

// ============================================
// COMPONENTES REUTILIZABLES
// ============================================
const Badge = ({ categoria, tipo = 'v4' }) => {
  const colores = tipo === 'v4' ? COLORES_CATEGORIA : COLORES_ML;
  const config = colores[categoria] || { bg: '#9E9E9E', text: '#424242', label: categoria || '—' };
  return (
    <span style={{ display: 'inline-block', padding: '4px 11px', borderRadius: '6px', backgroundColor: `${config.bg}22`, color: config.text, fontSize: '11px', fontWeight: 600, letterSpacing: '0.3px' }}>
      {config.label}
    </span>
  );
};

// Ícono de tendencia (círculo relleno + glifo blanco) que reemplaza los símbolos
// Unicode ✓/○/✗ del insight de "Tendencias del circuito" — esos caracteres no
// renderizan bien en todas las fuentes/plataformas. 3 variantes según nivel:
// 'positivo' (check), 'neutro' (guion), 'negativo' (cruz). Mismo criterio de "SVG a
// mano, sin librería de íconos" que crearIconoPautaEstrella en MapaCircuitos.js.
const COLOR_ICONO_TENDENCIA = { positivo: '#2E7D32', neutro: '#F57F17', negativo: '#C62828' };
const IconoTendencia = ({ nivel, size = 16 }) => {
  const color = COLOR_ICONO_TENDENCIA[nivel] || '#9E9E9E';
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="8" fill={color} />
      {nivel === 'positivo' && <path d="M4.5 8.3L6.8 10.8L11.5 5.3" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
      {nivel === 'neutro' && <line x1="4.5" y1="8" x2="11.5" y2="8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />}
      {nivel === 'negativo' && <path d="M5 5L11 11M11 5L5 11" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
};

// Mismo criterio de estado (activa/finalizada/sin_pauta) que calcularCoberturaBarrio —
// usado en la tabla "Barrios del circuito" para que la columna Pauta se lea a simple
// vista sin abrir la ficha del barrio.
const BadgeEstadoPauta = ({ estado }) => {
  if (estado === 'activa') return <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '8px', backgroundColor: '#2E7D3222', color: '#2E7D32', whiteSpace: 'nowrap' }}>● Activa</span>;
  if (estado === 'finalizada') return <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '8px', backgroundColor: '#9E9E9E22', color: '#757575', whiteSpace: 'nowrap' }}>Finalizada</span>;
  return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
};

// Ícono de ayuda con tooltip nativo del navegador (sin estado propio: funciona igual
// en la app como en la ficha exportada, que se abre en una pestaña aparte para
// imprimir). Se usa junto al label de Padrón/Población solo en su primera aparición
// dentro de cada ficha — Padrón (circuito) y Población (barrio) son de fuentes y
// unidades distintas (padrón electoral vs. censo/IDECOR) y se prestan a confundirse
// porque aparecen en pantallas parecidas de la misma ficha.
const InfoTip = ({ texto }) => (
  <span title={texto} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '13px', height: '13px', borderRadius: '50%', border: '1px solid var(--text-tertiary)', color: 'var(--text-tertiary)', fontSize: '9px', lineHeight: 1, cursor: 'help', marginLeft: '5px', flexShrink: 0 }}>
    i
  </span>
);

// Punto de diagnóstico (semáforo por color, sin texto) del header de circuito — ver
// COLOR_DIAGNOSTICO_V4 más arriba. Va inmediatamente antes del número de circuito.
// Tooltip on-hover vía title nativo (mismo mecanismo que InfoTip): oculto por default,
// solo aparece al interactuar. Equivalente PDF (estático, sin tooltip) en
// generarFichaPDF más abajo.
const PuntoDiagnostico = ({ categoria }) => (
  <span
    title={textoDiagnosticoV4(categoria)}
    style={{ display: 'inline-block', width: '15px', height: '15px', borderRadius: '50%', backgroundColor: colorDiagnosticoV4(categoria), flexShrink: 0, cursor: 'help' }}
  />
);

const MetricCard = ({ label, value, subtitle, trend, trendPositive }) => (
  <div style={{ flex: 1, minWidth: '160px', padding: '14px 16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px' }}>
    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
      {subtitle && <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{subtitle}</span>}
    </div>
    {trend && <div style={{ marginTop: '6px', fontSize: '12px', color: trendPositive ? '#2E7D32' : '#C62828', fontWeight: 500 }}>{trendPositive ? '▲' : '▼'} {trend}</div>}
  </div>
);

const VictoriaIndicator = ({ label, gano }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', minWidth: '75px' }}>{label}</span>
    <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: gano ? '#4CAF50' : '#EF5350', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 600 }}>{gano ? '✓' : '✗'}</div>
  </div>
);

// Modal de información
const InfoModal = ({ isOpen, onClose }) => {
  const overlayRef = useFocusTrap(isOpen);
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={onClose}>
      <div ref={overlayRef} tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', maxWidth: '700px', maxHeight: '80vh', overflowY: 'auto', margin: '20px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 600, margin: 0 }}>Guía de categorías</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '19px', cursor: 'pointer', color: '#666' }}>×</button>
        </div>
        
        <div style={{ marginBottom: '28px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: '#1976D2' }}>Diagnóstico Territorial</h3>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>Basado en resultados de: Gob. 2019, Gob. 2023, Dip. 2021 y Dip. 2025.</p>
          {Object.entries(COLORES_CATEGORIA).filter(([k]) => k !== 'B.2').map(([cat, config]) => (
            <div key={cat} style={{ display: 'flex', gap: '12px', marginBottom: '12px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: config.bg, flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: config.text }}>{config.label}</div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{DESCRIPCIONES_CATEGORIA[cat]}</div>
              </div>
            </div>
          ))}
        </div>
        
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: '#1976D2' }}>Evolución Llaryora</h3>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>Compara el desempeño de Llaryora entre Int. 2019 (como candidato a intendente) y Gob. 2023 (como candidato a gobernador).</p>
          {Object.entries(COLORES_ML).map(([cat, config]) => (
            <div key={cat} style={{ display: 'flex', gap: '12px', marginBottom: '12px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: config.bg, flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: config.text }}>{config.label}</div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{DESCRIPCIONES_ML[cat]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const formatPct = (val) => val != null ? `${(val * 100).toFixed(1)}%` : '—';
const formatPP = (val) => val != null ? `${val > 0 ? '+' : ''}${(val * 100).toFixed(1)} pp` : '—';
// Fecha de una ronda de encuesta + su cantidad de encuestados cuando está
// disponible — casos es number | null; null (o el campo ausente en rondas viejas)
// se trata como dato ausente, nunca como 0, así que se omite "Respuestas" en ese caso.
const formatearFechaRonda = (fecha, casos) => `${formatearFecha(fecha)}${casos != null ? ` · Respuestas: ${casos}` : ''}`;
const getNumeroBase = (circuitoKey) => {
  if (!circuitoKey) return '';
  return String(circuitoKey).replace(/[A-Za-z]/g, '');
};
// Mismo criterio de normalización usado en components/MapaCircuitos.js para cruzar
// barrios_por_circuito_completo.json / recorridos_barrios.json con barrios_geo.json
const normalizarNombreBarrio = (s) => (s || '')
  .toUpperCase()
  .replace(/[ºª]/g, 'O')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Radio por defecto para considerar dos barrios "cercanos" entre sí, en km.
// Ajustable con uso real sin tocar la lógica de distanciaHaversineKm/barriosCercanos.
const RADIO_BARRIOS_CERCANOS_KM = 1.5;

// Barrios con menos de esta cantidad de habitantes DENTRO de un circuito dado se ocultan
// de la tabla "Barrios del circuito" (fragmentos catastrales ínfimos, sin valor de
// lectura) — el título y la fila Total siguen contando el conjunto completo.
const UMBRAL_POBLACION_BARRIO = 50;

// Distancia entre dos puntos lat/lon sobre la superficie terrestre (fórmula
// haversine) — a diferencia de la distancia euclidiana simple, no acumula error
// por la curvatura de la Tierra, relevante incluso a esta escala urbana.
function distanciaHaversineKm(lat1, lon1, lat2, lon2) {
  const R_TIERRA_KM = 6371;
  const aRad = (deg) => (deg * Math.PI) / 180;
  const dLat = aRad(lat2 - lat1);
  const dLon = aRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(aRad(lat1)) * Math.cos(aRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R_TIERRA_KM * c;
}

// Barrios cuyo centroide cae dentro de `radioKm` del centroide de `nombreBarrio`,
// ordenados de más cercano a más lejano. Usa barrios_geo.json como fuente.
function barriosCercanos(nombreBarrio, barriosGeoData, radioKm = RADIO_BARRIOS_CERCANOS_KM) {
  const features = barriosGeoData?.features || [];
  const origen = features.find(f => f.properties?.nombre_barrio === nombreBarrio);
  if (!origen) return [];
  const { centroid_lat: lat1, centroid_lon: lon1 } = origen.properties;
  if (lat1 == null || lon1 == null) return [];

  return features
    .filter(f => f.properties?.nombre_barrio && f.properties.nombre_barrio !== nombreBarrio)
    .map(f => {
      const { centroid_lat: lat2, centroid_lon: lon2 } = f.properties;
      if (lat2 == null || lon2 == null) return null;
      return { nombre: f.properties.nombre_barrio, distanciaKm: distanciaHaversineKm(lat1, lon1, lat2, lon2), poblacion: f.properties.poblacion };
    })
    .filter((b) => b && b.distanciaKm <= radioKm)
    .sort((a, b) => a.distanciaKm - b.distanciaKm);
}

// pautas_barrios.json (esquema campañas 2026) trae dos buckets: `barrios` (pautas
// asignadas a un barrio) y `circuitos_sin_barrio` (pautas asignadas directo a un
// circuito, ej. "10A", sin barrio identificado). Este helper resuelve la lista de
// pautas de UN barrio, indexando por nombre normalizado (mismo criterio de cruce que
// ya usa el resto del archivo).
function obtenerPautasDeBarrio(pautasBarriosData, nombreBarrio) {
  const bucket = pautasBarriosData?.barrios;
  if (!bucket) return [];
  const key = normalizarNombreBarrio(nombreBarrio);
  const claveOriginal = Object.keys(bucket).find(k => normalizarNombreBarrio(k) === key);
  return claveOriginal ? (bucket[claveOriginal].pautas || []) : [];
}
// Pautas asignadas directo a un circuito (circuitos_sin_barrio) — indexado por
// CircuitoKey (ej. "10A"), no por Mapkey.
function obtenerPautasCircuitoSinBarrio(pautasBarriosData, circuitoKey) {
  if (!circuitoKey) return [];
  return pautasBarriosData?.circuitos_sin_barrio?.[String(circuitoKey)]?.pautas || [];
}

// pautas_barrios.json trae la vigencia como inicio/fin en "YYYY-MM-DD" (esquema
// campañas 2026). El parseo de fecha y el cálculo de vigencia (fin >= hoy) viven ahora en
// lib/estadoPauta.js (parsearFechaISOPauta / pautaEstaVigente) — antes duplicados acá y en
// components/MapaCircuitos.js, centralizado para poder aplicar ahí el override temporal
// de la reunión (ver comentario al tope de ese archivo).
// 'activa' si tiene al menos una pauta vigente, 'finalizada' si tiene pautas pero
// ninguna vigente, 'sin_pauta' si no hay ninguna registrada. Nota: esto es independiente
// del campo `estado` (ACTIVO/INACTIVO) de cada pauta individual — calcularCoberturaBarrio
// usa este resumen por vigencia de fecha, mismo criterio que ya tenía antes del cambio de
// esquema.
function estadoPautaBarrio(nombreBarrio, pautasBarriosData) {
  const pautas = obtenerPautasDeBarrio(pautasBarriosData, nombreBarrio);
  if (pautas.length === 0) return 'sin_pauta';
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const tieneActiva = pautas.some(p => pautaEstaVigente(p, hoy));
  return tieneActiva ? 'activa' : 'finalizada';
}

// esObraPautaMesaCapital: ver lib/estadoPauta.js (única fuente, reusada también por
// components/MapaCircuitos.js para el popup de estrella de pauta).

// Todas las obras de Mesa de Capital de un barrio — mismo criterio de match por barrio
// normalizado que el resto del proyecto (obrasEnriquecidas ya viene con barrio como
// texto directo, ver comentario de obras_capital.json en lib/data-manifest.js).
function obrasPautaMesaCapitalDeBarrio(obrasEnriquecidas, nombreBarrio) {
  const key = normalizarNombreBarrio(nombreBarrio);
  return (obrasEnriquecidas || []).filter(o => normalizarNombreBarrio(o.barrio) === key && esObraPautaMesaCapital(o));
}

// Badge del header/resumen de barrio (Parte 2): se enciende si el barrio tiene pauta
// activa por CUALQUIERA de las dos fuentes — la de siempre (pautas_barrios.json, vía
// estadoPautaBarrio) O al menos una pauta activa de Mesa de Capital.
function tienePautaActivaBarrio(nombreBarrio, pautasBarriosData, obrasEnriquecidas) {
  if (estadoPautaBarrio(nombreBarrio, pautasBarriosData) === 'activa') return true;
  return obrasPautaMesaCapitalDeBarrio(obrasEnriquecidas, nombreBarrio).length > 0;
}

// Cobertura territorial de un barrio (Visitas/Pauta/Obras/Escuelas) — mismos lookups
// por nombre normalizado que ya usan las solapas de la ficha de barrio (recorridosLookup,
// pautasBarriosData, obrasEnriquecidas, votosEscuelasBarrioLookup), reutilizado por la
// tabla "Barrios del circuito" (pantalla y PDF) para no reinventar el match.
function calcularCoberturaBarrio(nombreBarrio, { recorridosLookup, pautasBarriosData, obrasEnriquecidas, votosEscuelasBarrioLookup }) {
  const key = normalizarNombreBarrio(nombreBarrio);
  const visitas = recorridosLookup?.[key]?.total_visitas || 0;
  const pauta = estadoPautaBarrio(nombreBarrio, pautasBarriosData);
  const obras = (obrasEnriquecidas || []).filter(o => normalizarNombreBarrio(o.barrio) === key).length;
  const escuelasInfo = votosEscuelasBarrioLookup?.[key];
  const escuelas = escuelasInfo?.escuelas?.length ?? escuelasInfo?.n_escuelas ?? 0;
  return { visitas, pauta, obras, escuelas };
}

// Población de un circuito = suma directa de "poblacion" de sus barrios en
// barrios_por_circuito_completo.json. Ese campo YA es la porción de cada barrio que cae
// dentro de ESTE circuito (no el total del barrio) — pct_en_circuito es simplemente esa
// porción sobre el total del barrio, así que sumar poblacion×pct_en_circuito (como se
// hacía antes) descontaba dos veces. Nada de "estimado": es la suma tal cual viene.
// No necesariamente igual al padrón electoral (personas habilitadas a votar).
function poblacionCircuito(barriosCircuito) {
  return (barriosCircuito || []).reduce((sum, b) => sum + (b.poblacion || 0), 0);
}

// Población total real de un barrio = suma de "poblacion" a través de TODOS los
// circuitos donde aparece en barrios_por_circuito_completo.json (un barrio puede estar
// repartido en varios circuitos, cada fila trae solo la porción de ese circuito).
// Verificado con LICEO GENERAL PAZ: 20 (007A) + 38 (007F) + 782 (013G) + 78 (013L) = 918
// habitantes totales, de los cuales 782 (85.2%) caen en el circuito 013G — eso es
// pct_en_circuito, no una fracción a aplicar de nuevo sobre 918.
function construirPoblacionTotalPorBarrio(barriosPorCircuito) {
  const totales = {};
  Object.values(barriosPorCircuito || {}).forEach(info => {
    (info.barrios || []).forEach(b => {
      const key = normalizarNombreBarrio(b.nombre);
      if (!key) return;
      totales[key] = (totales[key] || 0) + (b.poblacion || 0);
    });
  });
  return totales;
}

// Compara IDs de circuito (Mapkey) en orden natural: primero el numero base,
// despues la letra como desempate (evita que "0014" quede antes que "004A").
const compararMapkey = (a, b) => {
  const numA = parseInt(a, 10);
  const numB = parseInt(b, 10);
  if (numA !== numB) return numA - numB;
  return String(a).localeCompare(String(b));
};

// Match de PREFIJO (sin '$' final), no de string completa: tolera un sufijo de
// hora/timestamp ("2026-07-31 00:00:00"), mismo criterio que ya usan
// parsearFechaISOPauta (lib/estadoPauta.js) y formatearFecha (lib/formatearFecha.js)
// para el resto de las fechas de pauta del tablero. Antes exigía match exacto y
// descartaba en silencio cualquier fecha con sufijo — pasó con el 93% de las piezas
// en la carga 28/08 (bug de origen en el maestro, ya corregido en el dato).
const esFechaValida = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f) && !isNaN(new Date(f).getTime());

const TIPOS_EVENTO_COBERTURA = {
  medicion: { label: 'Medicion', color: '#2E7D32', bg: '#4CAF5022' },
  visita: { label: 'Visita Gob.', color: '#1565C0', bg: '#1976D222' },
  pauta: { label: 'Pauta', color: '#E65100', bg: '#FF980022' },
};

// Arma, para cada circuito (por Mapkey), la lista de eventos de cobertura ya
// ordenada cronologicamente.
function construirEventosPorCircuito(datos, encuestasData, recorridosLookup, cruceData, pautasBarriosData, barriosGeoData) {
  const eventosPorMapkey = {};
  datos.forEach(d => { eventosPorMapkey[d.Mapkey] = []; });

  // Medicion: fechas_rondas derivadas en vivo de encuestas_circuitos.json (ver coberturaDesdeEncuesta).
  datos.forEach(d => {
    const c = coberturaDesdeEncuesta(encuestasData, d.CircuitoKey);
    (c.fechas_rondas || []).forEach((f, i) => {
      if (esFechaValida(f)) {
        eventosPorMapkey[d.Mapkey].push({ tipo: 'medicion', fecha: f, detalle: { ronda: i + 1, totalRondas: c.cantidad_rondas } });
      }
    });
  });

  // Visita Gob.: solo el/los barrio(s) donde ESTE circuito es su barrio principal
  // (orden_importancia: 1 en circuito_to_barrios) - evita inflar circuitos que
  // solo rozan el borde de un barrio grande y populoso.
  datos.forEach(d => {
    const clave = `${d.Mapkey} - ${d.cirn_nom}`;
    const barriosPrincipales = (cruceData?.circuito_to_barrios?.[clave] || []).filter(b => b.orden_importancia === 1);
    barriosPrincipales.forEach(b => {
      const key = normalizarNombreBarrio(b.barrio_normalizado);
      const info = recorridosLookup?.[key];
      (info?.visitas || []).forEach(v => {
        if (esFechaValida(v.fecha)) {
          eventosPorMapkey[d.Mapkey].push({ tipo: 'visita', fecha: v.fecha, detalle: v });
        }
      });
    });
  });

  // Pauta: derivada en runtime desde pautas_barrios.json (sin pautas_circuitos.json,
  // mismo criterio que se usó para retirar cobertura_circuitos.json). inicio es la
  // fecha del evento (cuando arranca la pauta). Incluye tanto las pautas de los barrios
  // del circuito como las de circuitos_sin_barrio (ver buscarPautaCircuito).
  datos.forEach(d => {
    buscarPautaCircuito(pautasBarriosData, barriosGeoData, datos, d.CircuitoKey).forEach(p => {
      if (esFechaValida(p.inicio)) eventosPorMapkey[d.Mapkey].push({ tipo: 'pauta', fecha: p.inicio, detalle: p });
    });
  });

  Object.values(eventosPorMapkey).forEach(lista => lista.sort((a, b) => a.fecha.localeCompare(b.fecha)));
  return eventosPorMapkey;
}

// ============================================
// SOLAPAS
// ============================================
const SolapaResumen = ({ circuito, datos, padronTotal, encuestasData }) => {
  if (!datos) return null;
  const pctPadron = padronTotal > 0 ? ((datos.Padron_G23 / padronTotal) * 100).toFixed(2) : 0;
  const cobertura = coberturaDesdeEncuesta(encuestasData, datos.CircuitoKey);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <MetricCard label={<>Padrón electoral (circuito) <InfoTip texto="Personas habilitadas para votar en este circuito según el padrón electoral 2023." /></>} value={datos.Padron_G23?.toLocaleString() || '—'} subtitle={`(${pctPadron}% de Capital)`} />
        <MetricCard label="Participación Gob. 2023" value={formatPct(datos.Turnout_G23)} trend={`${formatPP(datos.Turnout_G23 - 0.67)} vs Capital`} trendPositive={(datos.Turnout_G23 - 0.67) > 0} />
        <MetricCard label="Δ Gob. 2023 vs Int. 2019" value={formatPP(datos.Efecto_ML / 100)} trend={datos.Crecio_vs_Capital ? 'mejor que Capital' : 'peor que Capital'} trendPositive={datos.Crecio_vs_Capital === 1} />
      </div>
      
      <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Tendencias electorales</h4>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '280px', padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Tendencia Gobernador</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Gob. 2019 → Gob. 2023</div>
            </div>
            <div style={{ display: 'inline-block', padding: '8px 16px', borderRadius: '8px', backgroundColor: datos.Residual_Gov >= 0 ? '#4CAF5022' : '#EF535022', color: datos.Residual_Gov >= 0 ? '#2E7D32' : '#C62828', fontSize: '13px', fontWeight: 600 }}>
              {formatPP(datos.Residual_Gov)} {datos.Residual_Gov >= 0 ? '▲' : '▼'}
            </div>
            <div style={{ marginTop: '20px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Tendencia Legislativa</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Dip. 2021 → Dip. 2025</div>
            </div>
            <div style={{ display: 'inline-block', padding: '8px 16px', borderRadius: '8px', backgroundColor: datos.Residual_Leg >= 0 ? '#4CAF5022' : '#EF535022', color: datos.Residual_Leg >= 0 ? '#2E7D32' : '#C62828', fontSize: '13px', fontWeight: 600 }}>
              {formatPP(datos.Residual_Leg)} {datos.Residual_Leg >= 0 ? '▲' : '▼'}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: '280px', padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '16px' }}>Victorias (de 4 elecciones)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <VictoriaIndicator label="Gob. 2019" gano={datos.Gano_G19 === 1} />
              <VictoriaIndicator label="Gob. 2023" gano={datos.Gano_G23 === 1} />
              <VictoriaIndicator label="Dip. 2021" gano={datos.Gano_L21 === 1} />
              <VictoriaIndicator label="Dip. 2025" gano={datos.Gano_L25 === 1} />
            </div>
            <div style={{ marginTop: '18px', fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>{datos.Victorias_Total}/4</div>
          </div>
        </div>
      </div>
      
      {encuestasData && (
        <div>
          <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Cobertura de encuesta</h4>
          <div style={{ padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <BadgeCobertura encuestado={!!cobertura?.encuestado} />
            {cobertura?.encuestado && (
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{cobertura.cantidad_rondas} ronda{cobertura.cantidad_rondas !== 1 ? 's' : ''}</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(cobertura.fechas_rondas || []).map((f, i) => (
                    <span key={i} style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '6px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 500 }}>{formatearFecha(f)}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: '18px 22px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>Última elección: Dip. 2025</div>
        <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div><span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>% Votos peronismo: </span><span style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)' }}>{formatPct(datos.Share_L25)}</span></div>
          <div><span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Posición: </span><span style={{ fontSize: '15px', fontWeight: 600, color: datos.Posicion_L25 === 1 ? '#2E7D32' : '#FF8F00' }}>{datos.Posicion_L25}°</span></div>
          <div><span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>vs Capital: </span><span style={{ fontSize: '13px', fontWeight: 500, color: (datos.Share_L25 - datos.ShareCap_L25) >= 0 ? '#2E7D32' : '#C62828' }}>{formatPP(datos.Share_L25 - datos.ShareCap_L25)}</span></div>
        </div>
      </div>
      
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '10px 18px', backgroundColor: datos.Volatilidad_Cat === 'Estable' ? '#4CAF5015' : datos.Volatilidad_Cat === 'Moderado' ? '#FF980015' : '#EF535015', borderRadius: '10px', alignSelf: 'flex-start' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Estabilidad histórica:</span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: datos.Volatilidad_Cat === 'Estable' ? '#2E7D32' : datos.Volatilidad_Cat === 'Moderado' ? '#E65100' : '#C62828' }}>{datos.Volatilidad_Cat}</span>
      </div>
    </div>
  );
};

const SolapaEvolucion = ({ circuito, datos }) => {
  const [mostrarCapital, setMostrarCapital] = useState(true);
  if (!datos) return null;
  
  const elecciones = [
    { key: 'G07', label: 'Gob. 2007', share: datos.Share_G07, shareCap: datos.ShareCap_G07 },
    { key: 'G11', label: 'Gob. 2011', share: datos.Share_G11, shareCap: datos.ShareCap_G11 },
    { key: 'G15', label: 'Gob. 2015', share: datos.Share_G15, shareCap: datos.ShareCap_G15 },
    { key: 'G19', label: 'Gob. 2019', share: datos.Share_G19, shareCap: datos.ShareCap_G19, highlight: true },
    { key: 'G23', label: 'Gob. 2023', share: datos.Share_G23, shareCap: datos.ShareCap_G23, highlight: true },
    { key: 'L21', label: 'Dip. 2021', share: datos.Share_L21, shareCap: datos.ShareCap_L21 },
    { key: 'L23', label: 'Dip. 2023', share: datos.Share_L23, shareCap: datos.ShareCap_L23 },
    { key: 'L25', label: 'Dip. 2025', share: datos.Share_L25, shareCap: datos.ShareCap_L25 },
  ];
  
  const validShares = elecciones.filter(e => e.share != null).map(e => e.share);
  const validCapShares = elecciones.filter(e => e.shareCap != null).map(e => e.shareCap);
  const maxShare = Math.max(...validShares, ...validCapShares, 0.5);
  const chartHeight = 200, chartWidth = 600;
  const padding = { left: 50, right: 25, top: 25, bottom: 50 };
  const getY = (val) => val == null ? null : padding.top + (1 - val / Math.min(maxShare * 1.15, 1)) * chartHeight;
  const getX = (idx) => padding.left + (idx / (elecciones.length - 1)) * (chartWidth - padding.left - padding.right);
  
  const todasElecciones = [
    { label: 'Gob. 2023', share: datos.Share_G23, cap: datos.ShareCap_G23, gano: datos.Gano_G23 },
    { label: 'Gob. 2019', share: datos.Share_G19, cap: datos.ShareCap_G19, gano: datos.Gano_G19 },
    { label: 'Gob. 2015', share: datos.Share_G15, cap: datos.ShareCap_G15, gano: null },
    { label: 'Gob. 2011', share: datos.Share_G11, cap: datos.ShareCap_G11, gano: null },
    { label: 'Gob. 2007', share: datos.Share_G07, cap: datos.ShareCap_G07, gano: null },
    { label: 'Dip. 2025', share: datos.Share_L25, cap: datos.ShareCap_L25, gano: datos.Gano_L25 },
    { label: 'Dip. 2023', share: datos.Share_L23, cap: datos.ShareCap_L23, gano: null },
    { label: 'Dip. 2021', share: datos.Share_L21, cap: datos.ShareCap_L21, gano: datos.Gano_L21 },
    { label: 'Int. 2019', share: datos.Share_Int19, cap: datos.ShareCap_Int19, gano: datos.Gano_Int19 },
  ];
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Evolución histórica del % de votos peronismo</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={mostrarCapital} onChange={(e) => setMostrarCapital(e.target.checked)} style={{ accentColor: '#1976D2', width: '18px', height: '18px' }} />
          Mostrar Capital
        </label>
      </div>
      
      <div style={{ padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <svg width="100%" viewBox={`0 0 ${chartWidth} ${chartHeight + padding.top + padding.bottom}`} style={{ overflow: 'visible' }}>
          {[0.2, 0.4, 0.6].map(val => (
            <g key={val}>
              <line x1={padding.left} y1={getY(val)} x2={chartWidth - padding.right} y2={getY(val)} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
              <text x={padding.left - 10} y={getY(val) + 5} textAnchor="end" fontSize="12" fill="var(--text-tertiary)">{(val * 100).toFixed(0)}%</text>
            </g>
          ))}
          {mostrarCapital && <polyline points={elecciones.filter(e => e.shareCap != null).map((e) => `${getX(elecciones.indexOf(e))},${getY(e.shareCap)}`).join(' ')} fill="none" stroke="#78909C" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" />}
          <polyline points={elecciones.filter(e => e.share != null).map((e) => `${getX(elecciones.indexOf(e))},${getY(e.share)}`).join(' ')} fill="none" stroke="#1976D2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {elecciones.map((e, i) => e.share != null && <circle key={e.key} cx={getX(i)} cy={getY(e.share)} r="6" fill="#1976D2" stroke="#fff" strokeWidth="2" />)}
          {elecciones.map((e, i) => (
            <g key={e.key}>
              <text x={getX(i)} y={chartHeight + padding.top + 22} textAnchor="middle" fontSize="12" fill={e.highlight ? 'var(--text-primary)' : 'var(--text-tertiary)'} fontWeight={e.highlight ? 600 : 400}>{e.label.split(' ')[0]}</text>
              <text x={getX(i)} y={chartHeight + padding.top + 38} textAnchor="middle" fontSize="11" fill={e.highlight ? 'var(--text-primary)' : 'var(--text-tertiary)'}>{e.label.split(' ')[1]}</text>
            </g>
          ))}
        </svg>
        <div style={{ display: 'flex', gap: '28px', marginTop: '16px', paddingLeft: '50px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '28px', height: '3px', backgroundColor: '#1976D2', borderRadius: '2px' }} /><span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>Circuito {circuito}</span></div>
          {mostrarCapital && <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '28px', height: '0', borderTop: '2px dashed #78909C' }} /><span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Capital</span></div>}
        </div>
      </div>
      
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>Resumen</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ backgroundColor: 'var(--bg-secondary)' }}><th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Elección</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Circuito</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Capital</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Diferencia</th><th style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 500, color: 'var(--text-tertiary)' }}>Resultado</th></tr></thead>
            <tbody>
              {todasElecciones.map((row, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 14px', fontWeight: 500 }}>{row.label}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600 }}>{formatPct(row.share)}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: 'var(--text-secondary)' }}>{formatPct(row.cap)}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: row.share != null && row.cap != null ? ((row.share - row.cap) >= 0 ? '#2E7D32' : '#C62828') : 'var(--text-tertiary)', fontWeight: 500 }}>{row.share != null && row.cap != null ? formatPP(row.share - row.cap) : '—'}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'center' }}>{row.gano != null ? <span style={{ display: 'inline-block', padding: '5px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, backgroundColor: row.gano ? '#4CAF5022' : '#EF535022', color: row.gano ? '#2E7D32' : '#C62828' }}>{row.gano ? 'GANÓ' : 'PERDIÓ'}</span> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const SolapaPartidos = ({ circuito, datos, partidos }) => {
  const [eleccionSeleccionada, setEleccionSeleccionada] = useState('G23');
  const elecciones = ['G23', 'G19', 'L25', 'L21', 'Int19'];
  const nombresEleccion = { 'G23': 'Gob. 2023', 'G19': 'Gob. 2019', 'L25': 'Dip. 2025', 'L21': 'Dip. 2021', 'Int19': 'Int. 2019' };
  const getColorPartido = (nombre, esPeronismo) => {
    if (esPeronismo) return '#1565C0';
    const lower = nombre.toLowerCase();
    if (lower.includes('juntos') || lower.includes('cambia')) return '#FFC107';
    if (lower.includes('libertad')) return '#7B1FA2';
    if (lower.includes('todos') || lower.includes('patria')) return '#E53935';
    return '#78909C';
  };
  const partidosCircuito = partidos?.[circuito] || {};
  const partidosEleccion = partidosCircuito[eleccionSeleccionada] || [];
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Composición del voto por elección</span>
        <select value={eleccionSeleccionada} onChange={(e) => setEleccionSeleccionada(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer' }}>
          {elecciones.map(e => <option key={e} value={e}>{nombresEleccion[e]}</option>)}
        </select>
      </div>
      <div style={{ padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        {elecciones.slice(0, 4).map(elec => {
          const parts = partidosCircuito[elec] || [];
          return (
            <div key={elec} style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '12px', color: elec === eleccionSeleccionada ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: elec === eleccionSeleccionada ? 600 : 400, minWidth: '80px' }}>{nombresEleccion[elec]}</span>
                <div style={{ flex: 1, height: '30px', display: 'flex', borderRadius: '6px', overflow: 'hidden' }}>
                  {parts.map((p, i) => (
                    <div key={i} style={{ width: `${p.share * 100}%`, backgroundColor: getColorPartido(p.partido, p.es_peronismo), display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }} title={`${p.partido}: ${(p.share * 100).toFixed(1)}%`}>
                      {p.share > 0.08 && <span style={{ fontSize: '11px', color: '#fff', fontWeight: 500 }}>{(p.share * 100).toFixed(0)}%</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
          {[{ label: 'Peronismo', color: '#1565C0' }, { label: 'JxC/Cambiemos', color: '#FFC107' }, { label: 'LLA', color: '#7B1FA2' }, { label: 'FdT/UP', color: '#E53935' }, { label: 'Otros', color: '#78909C' }].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '14px', height: '14px', borderRadius: '3px', backgroundColor: l.color }} /><span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{l.label}</span></div>
          ))}
        </div>
      </div>
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>Ranking {nombresEleccion[eleccionSeleccionada]}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead><tr style={{ backgroundColor: 'var(--bg-secondary)' }}><th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)', width: '50px' }}>#</th><th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Partido</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Votos</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>% Votos</th></tr></thead>
          <tbody>
            {partidosEleccion.map((p, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 14px' }}><div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: getColorPartido(p.partido, p.es_peronismo), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 600 }}>{i + 1}</div></td>
                <td style={{ padding: '8px 14px', fontWeight: p.es_peronismo ? 600 : 400, color: p.es_peronismo ? '#1565C0' : 'var(--text-primary)' }}>{p.partido.length > 40 ? p.partido.substring(0, 40) + '...' : p.partido}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right' }}>{p.votos?.toLocaleString()}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600 }}>{(p.share * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SolapaTerritorio = ({
  circuito, datos, barrios, todosLosDatos, onSelectCircuito,
  barriosGeoLookup, recorridosLookup, pautasBarriosData, obrasEnriquecidas, votosEscuelasBarrioLookup,
  onSelectBarrioFicha, onSelectBarrioFichaPauta,
  circuitosGeoJsonData, obrasFoco, onSelectObra, votosEscuelasCircuitoData,
  // bloques (opcional): ids de los bloques a mostrar — 'barrios' | 'alcance' |
  // 'coberturaPauta' | 'obras' | 'escuelas' | 'zona'. Sin definir se muestran todos (la
  // UI de siempre); el reporte imprimible lo usa para sacar cada bloque como sección propia.
  bloques = null,
}) => {
  const ver = (id) => !bloques || bloques.includes(id);
  const mapkey = datos?.Mapkey;
  const barriosCircuito = barrios?.[mapkey]?.barrios || [];
  const barriosVisibles = barriosCircuito.filter(b => (b.poblacion || 0) >= UMBRAL_POBLACION_BARRIO);
  const barriosOcultos = barriosCircuito.length - barriosVisibles.length;
  const poblacionCircuitoTotal = poblacionCircuito(barriosCircuito);
  const pctPadronDePoblacion = poblacionCircuitoTotal > 0 && datos?.Padron_G23 != null ? (datos.Padron_G23 / poblacionCircuitoTotal) * 100 : null;
  const numeroBase = getNumeroBase(circuito);
  const vecinos = todosLosDatos?.filter(d => {
    if (d.CircuitoKey === circuito) return false;
    const numOtro = getNumeroBase(d.CircuitoKey);
    return numeroBase && numOtro && numeroBase === numOtro;
  }) || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {ver('barrios') && <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Barrios del circuito ({barriosCircuito.length})</h4>
        <div style={{ padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          {barriosCircuito.length > 0 ? (
            <>
              <div style={{ maxHeight: '320px', overflowY: 'auto', marginBottom: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-secondary)' }}>
                    <tr>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Barrio</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Población en el circuito</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>% del total del barrio <InfoTip texto="Qué porcentaje de la población total de ese barrio cae dentro de este circuito (un barrio puede estar dividido entre varios circuitos)." /></th>
                      <th style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)', fontSize: '11px' }}>Visitas</th>
                      <th style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 500, color: 'var(--text-tertiary)', fontSize: '11px' }}>Pauta</th>
                      <th style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)', fontSize: '11px' }}>Obras</th>
                      <th style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)', fontSize: '11px' }}>Escuelas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {barriosVisibles.map((barrio, i) => {
                      const nombreBarrio = barrio.nombre || barrio;
                      const cobertura = calcularCoberturaBarrio(nombreBarrio, { recorridosLookup, pautasBarriosData, obrasEnriquecidas, votosEscuelasBarrioLookup });
                      return (
                        <tr
                          key={i}
                          style={{ borderTop: '1px solid var(--border)', backgroundColor: i === 0 ? '#1976D208' : 'transparent', cursor: 'pointer' }}
                          onClick={() => {
                            const key = normalizarNombreBarrio(nombreBarrio);
                            const feature = barriosGeoLookup[key];
                            onSelectBarrioFicha(feature ? feature.nombre_barrio : nombreBarrio);
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = i === 0 ? '#1976D208' : 'transparent'}
                        >
                          <td style={{ padding: '10px 14px', fontWeight: i === 0 ? 600 : 400 }}>{nombreBarrio}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>{barrio.poblacion != null ? barrio.poblacion.toLocaleString() : '—'}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>{barrio.pct_en_circuito != null ? `${barrio.pct_en_circuito.toFixed(1)}%` : '—'}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: '11px', color: cobertura.visitas > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{cobertura.visitas > 0 ? cobertura.visitas : '—'}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'center' }}><BadgeEstadoPauta estado={cobertura.pauta} /></td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: '11px', color: cobertura.obras > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{cobertura.obras > 0 ? cobertura.obras : '—'}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: '11px', color: cobertura.escuelas > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{cobertura.escuelas > 0 ? cobertura.escuelas : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>Total</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{Math.round(poblacionCircuitoTotal).toLocaleString()}</td>
                      <td style={{ padding: '10px 14px' }}></td>
                      <td style={{ padding: '10px 10px' }}></td>
                      <td style={{ padding: '10px 10px' }}></td>
                      <td style={{ padding: '10px 10px' }}></td>
                      <td style={{ padding: '10px 10px' }}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {barriosOcultos > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '10px' }}>
                  Se omiten {barriosOcultos} barrio{barriosOcultos !== 1 ? 's' : ''} con menos de {UMBRAL_POBLACION_BARRIO} habitantes en este circuito.
                </div>
              )}
              <div style={{ padding: '12px 16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                {poblacionCircuitoTotal > 0 && (
                  <div>
                    En los barrios de este circuito viven <strong style={{ color: 'var(--text-primary)' }}>{Math.round(poblacionCircuitoTotal).toLocaleString()}</strong> personas
                    {datos?.Padron_G23 != null && (
                      <>; el padrón habilitado es <strong style={{ color: 'var(--text-primary)' }}>{datos.Padron_G23.toLocaleString()}</strong>{pctPadronDePoblacion != null && ` (${pctPadronDePoblacion.toFixed(0)}%)`}</>
                    )}.
                  </div>
                )}
              </div>
            </>
          ) : <div style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>No hay información de barrios disponible</div>}
          {/* Pautas de alcance Capital-completa (bucket toda_capital): NO son propias de
              este circuito (aplican por igual a los 119), así que van en su propio
              acordeón colapsado, separadas de la tabla de barrios de arriba. */}
          {ver('alcance') && <BloqueAlcanceCapital pautasBarriosData={pautasBarriosData} />}
        </div>
      </div>}

      {/* Cobertura de pauta ESPECÍFICA de barrio (pautas_barrios.json.barrios u obras Mesa
          de Capital), a diferencia de BloqueAlcanceCapital arriba (pauta genérica
          toda_capital) — bloque separado a propósito, no se mezclan (ver comentario de
          BloqueCoberturaPautaBarrios). Usa barriosVisibles, no barriosCircuito crudo:
          mismo universo que ya filtra la tabla de arriba. */}
      {ver('coberturaPauta') && <BloqueCoberturaPautaBarrios
        barrios={barriosVisibles}
        pautasBarriosData={pautasBarriosData}
        obrasEnriquecidas={obrasEnriquecidas}
        onSelectBarrioFicha={onSelectBarrioFichaPauta}
      />}

      {ver('obras') && <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 500 }}>Obras</h4>
        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>Obras públicas en este circuito y en circuitos cercanos.</p>
        <ObrasPanel
          tipo="circuito"
          datosCircuito={datos}
          obrasEnriquecidas={obrasEnriquecidas}
          circuitosGeoJsonData={circuitosGeoJsonData}
          focoInicial={obrasFoco}
          onSelectObra={onSelectObra}
        />
      </div>}

      {ver('escuelas') && <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 500 }}>Escuelas</h4>
        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>% de votos a Peronismo sobre votos válidos, por escuela con centro de votación en este circuito.</p>
        {votosEscuelasCircuitoData?.circuitos?.[mapkey] ? (
          <ListaVotosEscuelas escuelas={votosEscuelasCircuitoData.circuitos[mapkey].escuelas} promedioCapitalPct={votosEscuelasCircuitoData?.promedio_capital_pct} />
        ) : (
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin centros de votación identificados en este circuito.</div>
        )}
      </div>}

      {ver('zona') && <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Circuitos de la zona ({vecinos.length} relacionados)</h4>
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ backgroundColor: 'var(--bg-secondary)' }}><th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Circuito</th><th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Diagnóstico</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>% Votos G23</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Tendencia</th></tr></thead>
            <tbody>
              {vecinos.length > 0 ? vecinos.map((v, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => onSelectCircuito(v.CircuitoKey)} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <td style={{ padding: '8px 14px', fontWeight: 500 }}>{v.CircuitoKey} - {v.cirn_nom}</td>
                  <td style={{ padding: '8px 14px' }}><Badge categoria={v.Categoria_v4} tipo="v4" /></td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600 }}>{formatPct(v.Share_G23)}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: v.Residual_Gov >= 0 ? '#2E7D32' : '#C62828', fontWeight: 500 }}>{v.Residual_Gov >= 0 ? '▲' : '▼'} {Math.abs(v.Residual_Gov * 100).toFixed(1)} pp</td>
                </tr>
              )) : <tr><td colSpan={4} style={{ padding: '16px', textAlign: 'center', color: 'var(--text-tertiary)' }}>Este circuito no tiene variantes (A, B, C, etc.)</td></tr>}
            </tbody>
          </table>
        </div>
      </div>}
    </div>
  );
};

const SolapaComparativas = ({ circuito, datos }) => {
  if (!datos) return null;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '14px', fontWeight: 600 }}>Comparativa Gobernador: 2019 vs 2023</h4>
        <div style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Gob. 2019</div><div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_G19)}</div><div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_G19}°</div></div>
            <div style={{ fontSize: '22px', color: '#1976D2' }}>→</div>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Gob. 2023</div><div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_G23)}</div><div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_G23}°</div></div>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: (datos.Share_G23 - datos.Share_G19) >= 0 ? '#4CAF5018' : '#EF535018', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Variación</div><div style={{ fontSize: '24px', fontWeight: 700, color: (datos.Share_G23 - datos.Share_G19) >= 0 ? '#2E7D32' : '#C62828' }}>{formatPP(datos.Share_G23 - datos.Share_G19)}</div><div style={{ fontSize: '12px', color: datos.Residual_Gov >= 0 ? '#2E7D32' : '#C62828', marginTop: '6px' }}>vs Capital: {formatPP(datos.Residual_Gov)}</div></div>
          </div>
        </div>
      </div>
      
      <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '14px', fontWeight: 600 }}>Evolución Llaryora: Int. 2019 → Gob. 2023</h4>
        <div style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Int. 2019</div><div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_Int19)}</div><div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_Int19}°</div></div>
            <div style={{ fontSize: '22px', color: '#1976D2' }}>→</div>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: '#1976D218', border: '1px solid #1976D240', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: '#1976D2', marginBottom: '10px' }}>Gob. 2023</div><div style={{ fontSize: '24px', fontWeight: 700, color: '#1565C0' }}>{formatPct(datos.Share_G23)}</div><div style={{ fontSize: '12px', color: '#1976D2', marginTop: '6px' }}>Posición: {datos.Posicion_G23}°</div></div>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: datos.Crecio_vs_Capital ? '#4CAF5018' : '#EF535018', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Δ Circuito</div><div style={{ fontSize: '24px', fontWeight: 700, color: datos.Efecto_ML >= 0 ? '#2E7D32' : '#C62828' }}>{formatPP(datos.Efecto_ML / 100)}</div><div style={{ fontSize: '12px', color: datos.Crecio_vs_Capital ? '#2E7D32' : '#C62828', marginTop: '6px' }}>vs Capital: {formatPP(datos.Efecto_ML_vs_Capital / 100)}</div></div>
          </div>
          <div style={{ marginTop: '18px' }}><Badge categoria={datos.Categoria_ML} tipo="ml" /></div>
          {datos.Categoria_ML === 'ML.4' && <div style={{ marginTop: '12px', padding: '10px 14px', backgroundColor: '#26A69A15', borderRadius: '8px', fontSize: '12px', color: '#00695C' }}>ℹ️ ML subió su % de votos ({formatPP(datos.Efecto_ML / 100)}), pero perdió la elección por irrupción de terceros.</div>}
        </div>
      </div>
      
      <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '14px', fontWeight: 600 }}>Efecto Schiaretti: Dip. 2021 → Dip. 2025</h4>
        <div style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Dip. 2021</div><div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_L21)}</div><div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_L21}°</div></div>
            <div style={{ fontSize: '22px', color: '#1976D2' }}>→</div>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Dip. 2025</div><div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPct(datos.Share_L25)}</div><div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Posición: {datos.Posicion_L25}°</div></div>
            <div style={{ flex: '1 1 160px', padding: '14px', backgroundColor: datos.Sch_Mejoro ? '#4CAF5018' : '#EF535018', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Δ Circuito</div><div style={{ fontSize: '24px', fontWeight: 700, color: datos.Sch_Efecto >= 0 ? '#2E7D32' : '#C62828' }}>{formatPP(datos.Sch_Efecto)}</div><div style={{ fontSize: '12px', color: datos.Sch_Efecto_vs_Capital >= 0 ? '#2E7D32' : '#C62828', marginTop: '6px' }}>vs Capital: {formatPP(datos.Sch_Efecto_vs_Capital)}</div></div>
          </div>
          <div style={{ marginTop: '18px' }}><span style={{ display: 'inline-block', padding: '7px 16px', borderRadius: '8px', backgroundColor: datos.Sch_Mejoro ? '#4CAF5022' : '#EF535022', color: datos.Sch_Mejoro ? '#2E7D32' : '#C62828', fontSize: '12px', fontWeight: 600 }}>{datos.Sch_Mejoro ? 'MEJORÓ' : 'EMPEORÓ'}</span></div>
        </div>
      </div>
      
      <div style={{ padding: '16px', backgroundColor: datos.Victorias_Total >= 2 ? '#4CAF5012' : '#EF535012', border: `1px solid ${datos.Victorias_Total >= 2 ? '#4CAF5040' : '#EF535040'}`, borderRadius: '12px' }}>
        <h4 style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '18px', fontWeight: 600 }}>Tendencias del circuito</h4>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '18px' }}>
          <div style={{ padding: '10px 14px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Diagnóstico</div><Badge categoria={datos.Categoria_v4} tipo="v4" /></div>
          <div style={{ padding: '10px 14px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Evolución Llaryora</div><Badge categoria={datos.Categoria_ML} tipo="ml" /></div>
          <div style={{ padding: '10px 14px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px' }}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Efecto legislativo</div><span style={{ fontSize: '13px', fontWeight: 600, color: datos.Sch_Mejoro ? '#2E7D32' : '#C62828' }}>{datos.Sch_Mejoro ? 'MEJORÓ' : 'EMPEORÓ'} ({formatPP(datos.Sch_Efecto)})</span></div>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <IconoTendencia nivel={datos.Victorias_Total >= 3 ? 'positivo' : datos.Victorias_Total >= 2 ? 'neutro' : 'negativo'} />
          <span>{datos.Victorias_Total >= 3 ? 'Circuito sólido para el oficialismo' : datos.Victorias_Total >= 2 ? 'Circuito con potencial de recuperación' : 'Circuito difícil, requiere estrategia específica'}</span>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '10px' }}>Ganó {datos.Victorias_Total}/4 elecciones. {datos.Crecio_vs_Capital ? 'Creció más que Capital con Llaryora.' : 'Creció menos que Capital con Llaryora.'} {datos.Sch_Mejoro ? 'Mejoró en legislativas.' : 'Empeoró en legislativas.'}</div>
      </div>
    </div>
  );
};

// SolapaEscuelas y SolapaObras (circuito) se retiraron: su contenido ahora vive
// dentro de SolapaTerritorio (fusión de solapas, ver comentario en el array `solapas`).

// ============================================
// FICHA DE BARRIO
// ============================================

const SolapaResumenBarrio = ({
  nombreBarrio, props, cruceData, barriosGeoLookup, todosLosDatos, encuestasData,
  recorridosLookup, pautasBarriosData, votosEscuelasBarrioLookup, obrasEnriquecidas,
  poblacionTotalPorBarrio, onIrACircuito, onCambiarSolapa,
}) => {
  const poblacionTotalBarrio = poblacionTotalPorBarrio?.[normalizarNombreBarrio(nombreBarrio)];
  // Circuito principal resuelto de forma independiente de circuitoSeleccionado (Etapa 1).
  const circuito = resolverCircuitoPrincipalDeBarrio(nombreBarrio, cruceData, barriosGeoLookup, todosLosDatos);
  const encuesta = circuito ? buscarEncuestaCircuito(encuestasData, circuito.CircuitoKey) : null;

  // Top 3 "Problemas principales" de la ÚLTIMA ronda (valor absoluto, no la variación
  // entre rondas que calcula ResumenAutomaticoProblemas) — para el bloque "Contexto
  // político". Son datos del CIRCUITO, no del barrio (una encuesta no se releva por barrio).
  let topProblemas = [];
  if (encuesta?.rondas?.length > 0) {
    const ultima = encuesta.rondas[encuesta.rondas.length - 1];
    const problemas = ultima.preguntas?.['Problemas principales'];
    if (problemas) topProblemas = Object.entries(problemas).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }

  const key = normalizarNombreBarrio(nombreBarrio);
  const totalVisitas = recorridosLookup?.[key]?.total_visitas || 0;
  const totalPautas = obtenerPautasDeBarrio(pautasBarriosData, nombreBarrio).length;
  const totalObras = (obrasEnriquecidas || []).filter(o => normalizarNombreBarrio(o.barrio) === key).length;
  const escuelasBarrio = votosEscuelasBarrioLookup?.[key];
  const totalEscuelas = escuelasBarrio?.escuelas?.length ?? escuelasBarrio?.n_escuelas ?? 0;

  const contadores = [
    { key: 'visitas', label: 'Visitas', cantidad: totalVisitas },
    { key: 'pauta', label: 'Pauta', cantidad: totalPautas },
    { key: 'obras', label: 'Obras', cantidad: totalObras },
    { key: 'escuelas', label: 'Escuelas', cantidad: totalEscuelas },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <MetricCard label={<>Población total (barrio) <InfoTip texto="Población total censada de este barrio (fuente: IDECOR/censo), no vinculada al padrón electoral." /></>} value={poblacionTotalBarrio != null ? poblacionTotalBarrio.toLocaleString() : '—'} subtitle={props.pct_poblacion_en_circuito != null ? `${props.pct_poblacion_en_circuito.toFixed(1)}% de este barrio está en este circuito` : undefined} />
        <MetricCard label="Tipo" value={props.tipo_barrio === 'BarrioOficial' ? 'Oficial' : 'No oficial'} />
      </div>

      <div style={{ padding: '16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '2px' }}>Contexto político{circuito ? ` — Circuito ${circuito.CircuitoKey} ${circuito.cirn_nom}` : ''}</div>
        {circuito ? (
          <>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '10px' }}>Datos del circuito, no del barrio.</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <Badge categoria={circuito.Categoria_v4} tipo="v4" />
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Gob. 2023: <strong style={{ color: 'var(--text-primary)' }}>{formatPct(circuito.Share_G23)}</strong>
                {circuito.ShareCap_G23 != null && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}> (vs Capital {formatPct(circuito.ShareCap_G23)})</span>}
              </div>
            </div>
            {topProblemas.length > 0 ? (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Principales problemas (última ronda de encuesta)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {topProblemas.map(([nombre, pct]) => (
                    <div key={nombre} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span>{nombre}</span><strong style={{ color: 'var(--text-primary)', flexShrink: 0 }}>{pct.toFixed(1)}%</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>Sin encuestas registradas para este circuito.</div>
            )}
            <button onClick={() => onIrACircuito(circuito)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: '#1976D2', cursor: 'pointer', fontWeight: 500 }}>Ver ficha completa del circuito →</button>
          </>
        ) : (
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin circuito asociado.</div>
        )}
      </div>

      <div>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '10px' }}>En este barrio</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {contadores.map(c => (
            <div
              key={c.key}
              onClick={() => onCambiarSolapa(c.key)}
              style={{ padding: '12px 16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', cursor: 'pointer', minWidth: '90px', textAlign: 'center' }}
            >
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{c.cantidad}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{c.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const SolapaTerritorioBarrio = ({ nombreBarrio, barriosGeoData, onSelectBarrioFicha }) => {
  const cercanos = barriosCercanos(nombreBarrio, barriosGeoData);
  return (
    <div>
      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Barrios cercanos (≤1,5 km)</h4>
      {cercanos.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin barrios cercanos dentro de 1,5 km.</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ backgroundColor: 'var(--bg-secondary)' }}><th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Barrio</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Población</th><th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)' }}>Distancia</th></tr></thead>
            <tbody>
              {cercanos.map((b, i) => (
                <tr
                  key={i}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => onSelectBarrioFicha(b.nombre)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '8px 14px' }}>{b.nombre}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>{b.poblacion != null ? b.poblacion.toLocaleString() : '—'}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>{b.distanciaKm.toFixed(2)} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Reconstruye el bloque que antes vivía inline en PanelMiniBarrio (retirado en la Etapa 1),
// mismos campos: fecha, tipo de visita coloreado, contacto con vecinos, link a la nota.
const SolapaVisitasBarrio = ({ nombreBarrio, recorridosLookup }) => {
  const key = normalizarNombreBarrio(nombreBarrio);
  const recorridos = recorridosLookup?.[key];
  return (
    <div>
      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Recorridos del Gobernador</h4>
      {recorridos && recorridos.total_visitas > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>{recorridos.total_visitas} visita{recorridos.total_visitas !== 1 ? 's' : ''}</div>
          {(recorridos.visitas || []).map((v, i) => {
            const colorTipo = TIPO_VISITA_COLOR[v.tipo_visita] || TIPO_VISITA_COLOR['NO HAY DATOS certeros'];
            return (
              <div key={i} style={{ padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{formatearFecha(v.fecha)}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '5px', backgroundColor: colorTipo.bg, color: colorTipo.text }}>{v.tipo_visita}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Contacto con vecinos: <strong>{v.contacto_vecinos || 'NO'}</strong></div>
                {v.link && (
                  <a href={v.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#1976D2', marginTop: '4px', display: 'inline-block' }}>Ver nota →</a>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin visitas registradas.</div>
      )}
    </div>
  );
};

// Etiquetas de metricas_ejecutadas que dependen de la plataforma: META reporta
// impresiones/CPM, GOOGLE reporta visualizaciones/CPV — mismo campo crudo
// (alcance_o_visualizaciones/costo_unitario) en ambos casos, solo cambia el label.
function etiquetasMetricasPauta(plataforma) {
  if (plataforma === 'META') return { alcance: 'Impresiones', costoUnitario: 'CPM' };
  if (plataforma === 'GOOGLE') return { alcance: 'Visualizaciones', costoUnitario: 'CPV' };
  return { alcance: 'Alcance/Visualizaciones', costoUnitario: 'Costo unitario' };
}
// Nunca "null"/"undefined"/"NaN" a la vista: campos ausentes de metricas_ejecutadas
// (frecuencia/costo_unitario/inversion pueden venir null) se muestran como "s/d".
function formatearMetricaPauta(valor, prefijo) {
  if (valor == null || Number.isNaN(valor)) return 's/d';
  return `${prefijo || ''}${valor.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
}

// material.link + redes_publicadas.ig/fb/yt: enlaces clicables individuales, cada uno
// solo si no es null (pueden venir 0, 1, 2 o 3 llenos). Si no hay ninguno, "Sin
// material disponible" en vez de dejar el espacio vacío.
const MaterialPautaLinks = ({ material }) => {
  const redes = material?.redes_publicadas || {};
  const links = [
    material?.link ? { label: 'Ver material', href: material.link } : null,
    redes.ig ? { label: 'Instagram', href: redes.ig } : null,
    redes.fb ? { label: 'Facebook', href: redes.fb } : null,
    redes.yt ? { label: 'YouTube', href: redes.yt } : null,
  ].filter(Boolean);
  if (links.length === 0) {
    return <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Sin material disponible</span>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
      {links.map(l => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#1976D2' }}>{l.label} →</a>
      ))}
    </div>
  );
};

// Esquema campañas 2026 (reemplaza por completo al viejo esquema Meta Ads). Card
// compacta: campaña/pieza, plataforma·objetivo·tipo, vigencia, estado, métricas
// ejecutadas (con label según plataforma) y material/redes. observaciones NO se
// muestra (uso interno de auditoría, ver prompt de esquema nuevo) — fila_origen/
// pueden repetirse entre registros (son ad-sets o snapshots distintos, no duplicados
// a filtrar).
const FilaPauta = ({ pauta, mostrarBarrio }) => {
  const etiquetas = etiquetasMetricasPauta(pauta.plataforma);
  const m = pauta.metricas_ejecutadas || {};
  const inactiva = estadoMostradoPauta(pauta) === 'INACTIVO';
  return (
    <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px', opacity: inactiva ? 0.65 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{pauta.titulo_pieza || '—'}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{pauta.campania || '—'}</div>
        </div>
        <span style={{ flexShrink: 0, fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '5px', backgroundColor: inactiva ? '#9E9E9E22' : '#2E7D3222', color: inactiva ? '#757575' : '#2E7D32', whiteSpace: 'nowrap' }}>
          {inactiva ? 'Inactivo' : 'Activo'}
        </span>
      </div>
      {mostrarBarrio && (
        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
          {pauta.barrio ? `Barrio: ${pauta.barrio}` : (
            <span style={{ fontWeight: 600, padding: '1px 6px', borderRadius: '5px', backgroundColor: '#9E9E9E22' }}>Sin barrio asignado</span>
          )}
        </div>
      )}
      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
        {pauta.plataforma || '—'} · {pauta.objetivo_campana || '—'} · {pauta.tipo_pauta || '—'}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Vigencia: {formatearFecha(pauta.inicio)} → {formatearFecha(pauta.fin)}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
        {etiquetas.alcance}: {m.alcance_o_visualizaciones != null ? m.alcance_o_visualizaciones.toLocaleString() : 's/d'}
        {m.frecuencia != null && ` · Frecuencia: ${typeof m.frecuencia === 'number' ? m.frecuencia.toFixed(2) : m.frecuencia}`}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
        {etiquetas.costoUnitario}: {formatearMetricaPauta(m.costo_unitario, '$')} · Inversión: {formatearMetricaPauta(m.inversion, '$')}
      </div>
      <MaterialPautaLinks material={pauta.material} />
    </div>
  );
};

// Fila de pauta "Mesa de Capital" (Parte 3) — mismo layout de tarjeta que FilaPauta,
// pero con los campos de una obra (nombre_obra/entrega_material_pauta_nico/fecha_pauta)
// en vez de un registro de pautas_barrios.json, y un distintivo visual propio (naranja,
// no choca con el verde/gris de Activo/Inactivo de FilaPauta) para que se note que es
// una fuente distinta. fecha_pauta se muestra tal cual la trae el archivo (formatearFecha
// devuelve el string sin tocar si no matchea el prefijo YYYY-MM-DD, ver lib/formatearFecha.js
// — hay valores tipo "26-08 al 15-09" en el archivo real, no siempre ISO).
const FilaPautaMesaCapital = ({ obra }) => (
  <div style={{ padding: '10px 12px', backgroundColor: '#FFF3E0', border: '1px solid #FFB74D55', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{obra.nombre_obra || '(sin nombre)'}</div>
      <span style={{ flexShrink: 0, fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', backgroundColor: '#EF6C0022', color: '#E65100', whiteSpace: 'nowrap' }}>Mesa de Capital</span>
    </div>
    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Fecha de pauta: {formatearFecha(obra.fecha_pauta)}</div>
    <div style={{ fontSize: '11px' }}>
      {esURLValida(obra.entrega_material_pauta_nico)
        ? <a href={obra.entrega_material_pauta_nico} target="_blank" rel="noopener noreferrer" style={{ color: '#1976D2' }}>Ver material →</a>
        : <span style={{ color: 'var(--text-secondary)' }}>{obra.entrega_material_pauta_nico}</span>}
    </div>
  </div>
);

// Bucket `toda_capital` de pautas_barrios.json (esquema campañas 2026): campañas
// genéricas de alcance Capital-completa (ej. "Córdoba Capital"/"Provincia de Córdoba"),
// sin barrio ni circuito puntual — aplican por igual a CUALQUIER barrio y CUALQUIER
// circuito, sin filtrado alguno (es la MISMA lista para todos). Por eso se muestra en
// bloque aparte ("Alcance Capital — toda la ciudad") en vez de mezclarse con la lista de
// pautas propias del barrio/circuito, que sí son específicas de ese territorio.
// Reutilizado tanto por SolapaPautaBarrio (ficha de barrio) como por SolapaTerritorio
// (ficha de circuito, que no tiene solapa Pauta propia — vive dentro de Territorio).
//
// Filtra a VIGENTES (pautaEstaVigente, fin >= hoy) — mismo criterio que ya usa la
// estrella del mapa (pautaCapitalMarkers/tieneActiva en components/MapaCircuitos.js) para
// decidir si pintar la estrella de alcance Capital en un circuito. Antes este bloque
// mostraba TODAS las piezas de toda_capital (vigentes y finalizadas mezcladas, con un
// badge "Activo"/"Inactivo" basado en el campo `estado` de la plataforma, un criterio
// DISTINTO al de vigencia por fecha) — eso podía dejar la estrella prendida en un
// circuito sin que esta sección tuviera ninguna pieza que lo justificara con claridad, o
// mostrar piezas ya finalizadas por fecha como si fueran las que sostienen la estrella.
// Con el filtro acá, si la estrella está prendida por toda_capital, este bloque SIEMPRE
// tiene al menos una fila (y viceversa: si está vacío, la estrella de alcance Capital no
// debería estar prendida en ningún circuito).
const BloqueAlcanceCapital = ({ pautasBarriosData }) => {
  const [abierto, setAbierto] = useState(false);
  const pautasVigentes = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return (pautasBarriosData?.toda_capital?.pautas || []).filter(p => pautaEstaVigente(p, hoy));
  }, [pautasBarriosData]);
  if (pautasVigentes.length === 0) return null;
  return (
    <div style={{ marginTop: '14px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
      <button
        onClick={() => setAbierto(a => !a)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: 'var(--bg-primary)', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}
      >
        <span>📍 Alcance Capital — toda la ciudad ({pautasVigentes.length})</span>
        <span style={{ fontSize: '10px', transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
      </button>
      {abierto && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '0 0 4px' }}>Campañas vigentes de alcance Capital-completa (sin barrio ni circuito puntual) — aplican por igual en toda la ciudad, no son propias de este circuito/barrio.</p>
          {pautasVigentes.map((p, i) => <FilaPauta key={p.fila_origen ?? i} pauta={p} />)}
        </div>
      )}
    </div>
  );
};

// Cobertura de pauta ESPECÍFICA de barrio, agregada a nivel circuito (solapa Territorio,
// SolapaTerritorio) — a diferencia de BloqueAlcanceCapital (pauta genérica toda_capital,
// la misma lista para todos), éste resume, barrio por barrio, si tiene pauta propia
// activa: pautas_barrios.json.barrios O al menos una obra Mesa de Capital activa (mismo
// criterio que tienePautaActivaBarrio, ya usado para el badge de Resumen de barrio y para
// BadgeEstadoPauta en la tabla "Barrios del circuito" de más arriba — no se reinventa el
// cálculo). Colapsado por default, mismo patrón visual/interacción que BloqueAlcanceCapital
// (acordeón con header + flecha) para consistencia, pero con su propio contador X/Y en el
// header en vez de un simple "(N)": X = barrios con pauta activa, Y = total de barrios
// listados (recibe `barrios` ya filtrado por el caller — SolapaTerritorio pasa
// barriosVisibles, mismo universo que la tabla de arriba, no barriosCircuito crudo).
const BloqueCoberturaPautaBarrios = ({ barrios, pautasBarriosData, obrasEnriquecidas, onSelectBarrioFicha }) => {
  const [abierto, setAbierto] = useState(false);
  if (!barrios || barrios.length === 0) return null;
  const filas = barrios.map(b => {
    const nombreBarrio = b.nombre || b;
    return { nombreBarrio, activa: tienePautaActivaBarrio(nombreBarrio, pautasBarriosData, obrasEnriquecidas) };
  });
  const conPauta = filas.filter(f => f.activa).length;
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
      <button
        onClick={() => setAbierto(a => !a)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: 'var(--bg-primary)', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}
      >
        <span>Cobertura de pauta por barrio: {conPauta}/{filas.length}</span>
        <span style={{ fontSize: '10px', transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
      </button>
      {abierto && (
        <div style={{ padding: '4px 14px 10px', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)' }}>
          {/* Cuenta pauta de Mesa de Capital además de pautas_barrios.json — por eso un
              barrio puede aparecer con pauta acá aunque la columna "Pauta" de la tabla de
              arriba (calcularCoberturaBarrio, solo pautas_barrios.json) muestre "—". */}
          <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '2px 0 8px' }}>Incluye pauta de barrio propia y de Mesa de Capital (no la de Alcance Capital, ver bloque de arriba).</p>
          {filas.map((f, i) => (
            <div
              key={i}
              onClick={() => onSelectBarrioFicha && onSelectBarrioFicha(f.nombreBarrio)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 4px', cursor: onSelectBarrioFicha ? 'pointer' : 'default', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0, backgroundColor: f.activa ? '#2E7D32' : '#BDBDBD' }} />
              <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{f.nombreBarrio}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Mismo cruce normalizado que ya usa buscarPautaCircuito, pero directo por barrio (sin
// pasar por circuito_principal).
const SolapaPautaBarrio = ({ nombreBarrio, pautasBarriosData, obrasEnriquecidas, origenCircuito, onVolverACircuito }) => {
  const pautas = obtenerPautasDeBarrio(pautasBarriosData, nombreBarrio);
  // Parte 3: las obras de Mesa de Capital de este barrio van SIEMPRE primero, antes de
  // cualquier pauta de pautas_barrios.json (activa o inactiva) — y entre ellas, si hay
  // más de una, ordenadas por fecha_pauta descendente. fecha_pauta no siempre es ISO
  // parseable (ver esObraPautaMesaCapital) — las no parseables quedan al final del grupo
  // Mesa de Capital, en el orden en que vinieron, en vez de reventar el sort.
  const obrasMesaCapital = useMemo(() => {
    const arr = obrasPautaMesaCapitalDeBarrio(obrasEnriquecidas, nombreBarrio);
    return [...arr].sort((a, b) => {
      const fa = parsearFechaISOPauta(a.fecha_pauta);
      const fb = parsearFechaISOPauta(b.fecha_pauta);
      if (fa && fb) return fb - fa;
      if (fa) return -1;
      if (fb) return 1;
      return 0;
    });
  }, [obrasEnriquecidas, nombreBarrio]);

  return (
    <div>
      {/* Punto 4: solo aparece si se llegó acá desde "Cobertura de pauta por barrio"
          (BloqueCoberturaPautaBarrios, solapa Territorio del circuito de origen) — ver
          origenCoberturaPautaCircuito en pages/index.js. No hay patrón de "volver"
          reusable en el tablero (investigado antes de agregar esto): el resto de los
          botones "← Volver" son genéricos, a la vista de mapa. Éste es el único
          contextual, así que vive acotado a este flujo puntual en vez de generalizarse. */}
      {origenCircuito && (
        <button
          onClick={() => onVolverACircuito && onVolverACircuito(origenCircuito.CircuitoKey)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: 0, marginBottom: '14px', border: 'none', background: 'none', fontSize: '12px', color: '#1976D2', fontWeight: 500, cursor: 'pointer' }}
        >
          ← Volver a barrios de {origenCircuito.CircuitoKey} - {origenCircuito.cirn_nom}
        </button>
      )}
      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Pauta publicitaria</h4>
      {pautas.length === 0 && obrasMesaCapital.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin pauta registrada para este barrio.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {obrasMesaCapital.map((o, i) => <FilaPautaMesaCapital key={o.id_registro ?? i} obra={o} />)}
          {pautas.map((p, i) => <FilaPauta key={p.fila_origen ?? i} pauta={p} />)}
        </div>
      )}
      <BloqueAlcanceCapital pautasBarriosData={pautasBarriosData} />
    </div>
  );
};

// Reconstruye el bloque que antes vivía inline en PanelMiniBarrio (retirado en la Etapa 1).
const SolapaEscuelasBarrio = ({ nombreBarrio, votosEscuelasBarrioLookup, promedioCapitalPct }) => {
  const key = normalizarNombreBarrio(nombreBarrio);
  const votosEscuelas = votosEscuelasBarrioLookup?.[key];
  return (
    <div>
      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 500 }}>Votos por escuela</h4>
      <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>% de votos a Peronismo sobre votos válidos, por escuela con centro de votación en este barrio.</p>
      {votosEscuelas ? (
        <ListaVotosEscuelas escuelas={votosEscuelas.escuelas} promedioCapitalPct={promedioCapitalPct} />
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin centros de votación identificados para este barrio.</div>
      )}
    </div>
  );
};

// Wrapper fino, mismo patrón que SolapaObras (circuito) — ObrasPanel ya soporta tipo="barrio".
const SolapaObrasBarrio = ({ nombreBarrio, obrasEnriquecidas, barriosGeoData, onSelectObra }) => (
  <div>
    <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', fontWeight: 500 }}>Obras</h4>
    <ObrasPanel
      tipo="barrio"
      nombreBarrio={nombreBarrio}
      obrasEnriquecidas={obrasEnriquecidas}
      barriosGeoData={barriosGeoData}
      onSelectObra={onSelectObra}
    />
  </div>
);

// ============================================
// ENCUESTAS DE CIRCUITO
// ============================================

// encuestas_circuitos.json a veces tiene la clave con letra y número invertidos
// respecto a CircuitoKey (ej. "A14" en vez de "14A") — se prueba directo y,
// si falla, con el swap. Las claves que ni así matchean (circuitos que no
// existen en este tablero) quedan descartadas sin intentar adivinar a cuál corresponden.
function buscarEncuestaCircuito(encuestasData, circuitoKey) {
  if (!encuestasData || !circuitoKey) return null;
  const key = String(circuitoKey);
  if (encuestasData[key]) return encuestasData[key];
  const m = /^(\d+)([A-Za-z]+)$/.exec(key);
  if (m) {
    const swapped = `${m[2]}${m[1]}`;
    if (encuestasData[swapped]) return encuestasData[swapped];
  }
  return null;
}

// Reemplaza a cobertura_circuitos.json (snapshot fijo que quedaba desactualizado apenas
// se agregaba una encuesta nueva): deriva encuestado/cantidad_rondas/fechas_rondas en
// runtime directamente de encuestas_circuitos.json, reusando buscarEncuestaCircuito
// (sin duplicar su lógica de cruce de claves). Si el circuito no tiene encuesta, devuelve
// la misma forma "vacía" que antes daba el snapshot (encuestado: false, 0 rondas).
function coberturaDesdeEncuesta(encuestasData, circuitoKey) {
  const e = buscarEncuestaCircuito(encuestasData, circuitoKey);
  const cantidadRondas = e?.cantidad_rondas || 0;
  return {
    encuestado: cantidadRondas > 0,
    cantidad_rondas: cantidadRondas,
    fechas_rondas: (e?.rondas || []).map(r => r.fecha),
  };
}

// Deriva en runtime todas las pautas publicitarias de un circuito, sin pautas_circuitos.json
// (mismo criterio ya aplicado para retirar cobertura_circuitos.json: nada de snapshots que
// se desincronicen). pautas_barrios.json viene indexado por nombre de barrio, no por
// circuito — así que se recorren los features de barrios_geo.json buscando cuáles tienen
// circuito_principal apuntando al circuito pedido, y se suman sus pautas.
//
// circuito_principal viene como "Mapkey - nombre" (mismo patrón que ya usa
// handleSelectBarrioDesdeBusqueda): se resuelve el Mapkey real del circuito buscado a
// través de `datos` (no se asume que alcance con rellenar/sacar ceros del circuitoKey).
//
// barrios_geo.json tiene 16 nombres de barrio duplicados (fragmentos no contiguos, ver
// sección 14 de CONTEXTO_PROYECTO.md) que pueden tener circuito_principal distinto entre
// sí — por eso se itera .features (no el lookup ya colapsado por nombre) y se deduplica
// por nombre normalizado SOLO dentro del resultado de este circuito, para no sumar dos
// veces el mismo barrio si aparece en más de un fragmento con el mismo circuito_principal.
// Resuelve el circuito "principal" de un barrio, de forma independiente de cuál sea
// el circuito actualmente seleccionado (no asume que circuitoSeleccionado ya es el
// principal de este barrio — puede no serlo, ej. si se llegó acá vía "Otros barrios en
// este circuito", que a propósito no re-deriva circuito). Dos pasos, en este orden:
// 1) circuito_principal de barrios_geo.json (vía barriosGeoLookup); 2) si falta, cae a
// circuito_barrios_cruce.json → barrio_to_circuitos, orden_importancia: 1. Mismo criterio
// que ya usaba handleSelectBarrioDesdeBusqueda, extraído acá para reusarlo también desde
// la ficha de barrio.
function resolverCircuitoPrincipalDeBarrio(nombreBarrio, cruceData, barriosGeoLookup, todosLosDatos) {
  const key = normalizarNombreBarrio(nombreBarrio);
  const props = barriosGeoLookup[key];
  let circuitoRecord = null;
  const mapkeyPrincipal = props?.circuito_principal?.split(' - ')[0]?.trim();
  if (mapkeyPrincipal) circuitoRecord = todosLosDatos.find(d => d.Mapkey === mapkeyPrincipal);
  if (!circuitoRecord) {
    const lista = cruceData?.barrio_to_circuitos?.[nombreBarrio];
    const principal = lista?.find(c => c.orden_importancia === 1);
    const mapkeyCruce = principal?.circuito?.split(' - ')[0]?.trim();
    if (mapkeyCruce) circuitoRecord = todosLosDatos.find(d => d.Mapkey === mapkeyCruce);
  }
  return circuitoRecord || null;
}

// Dirección inversa de resolverCircuitoPrincipalDeBarrio: el barrio "principal" DE un
// circuito (orden_importancia: 1 en circuito_to_barrios) — mismo mecanismo que ya usa
// handleSelectCircuito, extraído acá para reusarlo desde generarFichaPDF.
function resolverBarrioPrincipalDeCircuito(datosCircuito, cruceData, barriosGeoLookup) {
  const clave = `${datosCircuito.Mapkey} - ${datosCircuito.cirn_nom}`;
  const lista = cruceData?.circuito_to_barrios?.[clave];
  const principal = lista?.find(b => b.orden_importancia === 1);
  if (!principal) return null;
  const key = normalizarNombreBarrio(principal.barrio_normalizado);
  const props = barriosGeoLookup[key];
  const nombreBarrio = props ? props.nombre_barrio : principal.barrio_normalizado;
  return { nombreBarrio, props: props || null };
}

// TODOS los barrios que tocan un circuito (no solo el principal) según
// circuito_barrios_cruce.json → circuito_to_barrios. Usado para los bloques de circuito
// "Visitas del Gobernador" y "Pauta publicitaria" del PDF (generarFichaPDF), que
// concatenan la cobertura de cada barrio del circuito con su columna de origen.
// circuito_to_barrios trae fragmentos no contiguos del mismo barrio (mismo caso que
// documenta buscarPautaCircuito) y a veces una fila sintética "Sin Barrio - Circuito
// ..." sin barrio real detrás — se dedupea por nombre normalizado y se descarta esa
// fila sintética para no listar dos veces la cobertura del mismo barrio ni intentar
// resolver un barrio que no existe.
function resolverBarriosDelCircuito(datosCircuito, cruceData) {
  const clave = `${datosCircuito.Mapkey} - ${datosCircuito.cirn_nom}`;
  const lista = cruceData?.circuito_to_barrios?.[clave] || [];
  const vistos = new Set();
  const resultado = [];
  lista.forEach(b => {
    if (!b.barrio || b.barrio.startsWith('Sin Barrio')) return;
    const key = normalizarNombreBarrio(b.barrio_normalizado || b.barrio);
    if (!key || vistos.has(key)) return;
    vistos.add(key);
    resultado.push({ nombre: b.barrio, key });
  });
  return resultado;
}

function buscarPautaCircuito(pautasBarriosData, barriosGeoData, datos, circuitoKey) {
  if (!pautasBarriosData || !datos || !circuitoKey) return [];
  const circuitoRecord = datos.find(d => String(d.CircuitoKey) === String(circuitoKey));
  if (!circuitoRecord) return [];
  const mapkeyBuscado = circuitoRecord.Mapkey;

  const pautas = [];
  if (barriosGeoData) {
    const barriosVistos = new Set();
    (barriosGeoData.features || []).forEach(feature => {
      const props = feature.properties || {};
      const nombreBarrio = props.nombre_barrio;
      if (!nombreBarrio) return;
      const mapkeyPrincipal = props.circuito_principal?.split(' - ')[0]?.trim();
      if (!mapkeyPrincipal || mapkeyPrincipal !== mapkeyBuscado) return;

      const claveNormalizada = normalizarNombreBarrio(nombreBarrio);
      if (barriosVistos.has(claveNormalizada)) return;
      barriosVistos.add(claveNormalizada);

      obtenerPautasDeBarrio(pautasBarriosData, nombreBarrio).forEach(p => {
        pautas.push({ ...p, barrio: nombreBarrio });
      });
    });
  }
  // Pautas asignadas directo al circuito (circuitos_sin_barrio, ver esquema campañas
  // 2026) — no vienen de ningún barrio, se suman aparte con barrio: null para poder
  // diferenciarlas visualmente ("Sin barrio asignado") en vez de inventarles un barrio.
  obtenerPautasCircuitoSinBarrio(pautasBarriosData, circuitoRecord.CircuitoKey).forEach(p => {
    pautas.push({ ...p, barrio: null });
  });
  return pautas;
}

const COLOR_GESTION = { 'Positiva': '#22C55E', 'Regular': '#FBBF24', 'Negativa': '#EF4444', 'Ns/Nc': '#CBD5E1' };
const ORDEN_CATEGORIAS_GESTION = ['Positiva', 'Regular', 'Negativa', 'Ns/Nc'];

// Fallback defensivo: si algún día una ronda vuelve a cargarse con un nombre de
// categoría no reconocido (el mismo tipo de error que motivó el fix de "No se" ->
// "Ns/Nc" en encuestas_circuitos.json), el segmento no debe desaparecer en silencio
// del gráfico ni pintarse "undefined" — cae a gris neutro y avisa una vez por nombre
// en consola, para detectarlo en QA en vez de mucho después. avisadas vive a nivel de
// módulo a propósito: un solo aviso por nombre por sesión de la app alcanza para QA,
// no hace falta repetirlo en cada render.
const COLOR_GESTION_FALLBACK = '#9CA3AF';
const categoriasGestionAvisadas = new Set();
function colorCategoriaGestion(cat) {
  if (COLOR_GESTION[cat]) return COLOR_GESTION[cat];
  if (!categoriasGestionAvisadas.has(cat)) {
    categoriasGestionAvisadas.add(cat);
    console.warn(`Calificación de gestión: categoría "${cat}" no reconocida (sin color mapeado), usando gris de fallback.`);
  }
  return COLOR_GESTION_FALLBACK;
}

// Orden canónico primero, seguido de cualquier categoría inesperada presente en el
// dato (para que también se dibuje su segmento en vez de perderse por no estar en
// ORDEN_CATEGORIAS_GESTION) — ver colorCategoriaGestion.
function categoriasGestion(data) {
  const extra = Object.keys(data).filter(k => !ORDEN_CATEGORIAS_GESTION.includes(k));
  return [...ORDEN_CATEGORIAS_GESTION, ...extra];
}

// Barra horizontal azul con % embebido (dentro si entra, afuera si no) — compartida
// con FilasProblemasComparativo (vista Comparativo), que agrega badge de variación al
// lado. Misma pieza en los dos lugares, sin duplicar el cálculo de si el texto entra
// adentro de la barra o no.
const BarraHorizontalPct = ({ pct }) => {
  const anchoPct = Math.min(pct, 100);
  const cabeAdentro = anchoPct >= 15; // suficiente lugar para el texto dentro del relleno
  return (
    <div style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', borderRadius: '5px', height: '20px', position: 'relative' }}>
      <div style={{ width: `${anchoPct}%`, backgroundColor: '#1976D2', height: '100%', borderRadius: '5px' }} />
      <span style={{
        position: 'absolute', top: '2px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap',
        ...(cabeAdentro ? { left: '8px', color: '#fff' } : { left: `calc(${anchoPct}% + 6px)`, color: 'var(--text-primary)' }),
      }}>{pct}%</span>
    </div>
  );
};

const BarraProblemas = ({ problemas }) => {
  if (!problemas) return null;
  const entradas = Object.entries(problemas).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 500 }}>Principales problemas</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {entradas.map(([nombre, pct]) => (
          <div key={nombre} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '190px', flexShrink: 0, fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'right' }}>{nombre}</div>
            <BarraHorizontalPct pct={pct} />
          </div>
        ))}
      </div>
    </div>
  );
};

const BarraGestion = ({ label, data }) => {
  if (!data) return <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{label}: sin dato</div>;
  const categorias = categoriasGestion(data);
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '5px' }}>{label}</div>
      <div style={{ display: 'flex', height: '26px', borderRadius: '6px', overflow: 'hidden' }}>
        {categorias.map(cat => {
          const v = data[cat];
          if (!v || v <= 0) return null;
          const esNsNc = cat === 'Ns/Nc';
          return (
            <div
              key={cat}
              title={esNsNc ? `${cat}: ${v}%` : undefined}
              style={{ width: `${v}%`, backgroundColor: colorCategoriaGestion(cat), display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {!esNsNc && v > 8 && <span style={{ fontSize: '11px', color: '#fff', fontWeight: 600 }}>{v}%</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SeccionGestionFuncionarios = ({ gestiones }) => (
  <div>
    <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 500 }}>Calificación de gestión</h4>
    {Object.entries(gestiones).map(([label, data]) => <BarraGestion key={label} label={`Calificación de gestión: ${label}`} data={data} />)}
    <div style={{ display: 'flex', gap: '14px', marginTop: '6px' }}>
      {['Positiva', 'Regular', 'Negativa'].map(cat => (
        <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: COLOR_GESTION[cat] }} />
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{cat}</span>
        </div>
      ))}
    </div>
  </div>
);

const GaugeAprobacion = ({ label, data }) => {
  if (!data || data.Apruebo == null) {
    return <div style={{ flex: '1 1 140px', padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-tertiary)' }}>Aprobación {label}: sin dato</div>;
  }
  const pct = data.Apruebo;
  const color = pct >= 40 ? '#0DCE1D' : pct >= 25 ? '#D9B300' : '#D64550';
  const r = 40, mediaCircunferencia = Math.PI * r;
  const progreso = (Math.min(pct, 100) / 100) * mediaCircunferencia;
  return (
    <div style={{ flex: '1 1 140px', textAlign: 'center', padding: '12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px' }}>
      <svg viewBox="0 0 100 60" style={{ width: '100%', maxWidth: '160px' }}>
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="var(--border)" strokeWidth="10" strokeLinecap="round" />
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${mediaCircunferencia} ${mediaCircunferencia}`}
          strokeDashoffset={mediaCircunferencia - progreso}
        />
        <text x="50" y="45" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--text-primary)">{pct}%</text>
      </svg>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Aprobación {label}</div>
    </div>
  );
};

const DonutReeleccion = ({ label, data }) => {
  if (!data || data.Si == null) {
    return <div style={{ flex: '1 1 140px', padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-tertiary)' }}>{label}: sin dato</div>;
  }
  const si = data.Si;
  const r = 35, cx = 50, cy = 50, circunferencia = 2 * Math.PI * r;
  const siLen = (Math.min(si, 100) / 100) * circunferencia;
  return (
    <div style={{ flex: '1 1 140px', textAlign: 'center', padding: '12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px' }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', maxWidth: '140px' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EF4444" strokeWidth="16" />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke="#22C55E" strokeWidth="16"
          strokeDasharray={`${siLen} ${circunferencia}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <text x="50" y="55" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--text-primary)">{si}%</text>
      </svg>
      <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '4px' }}>{label}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Sí</div>
    </div>
  );
};

const ResumenEncuesta = ({ preguntas }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
    <BarraProblemas problemas={preguntas['Problemas principales']} />
    <SeccionGestionFuncionarios gestiones={{
      Intendente: preguntas['Gestión del Intendente'],
      Gobernador: preguntas['Gestión del Gobernador'],
      Presidente: preguntas['Gestión del Presidente'],
    }} />
    <div>
      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 500 }}>Aprobación de gestión</h4>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <GaugeAprobacion label="Intendente" data={preguntas['Aprobación Intendente']} />
        <GaugeAprobacion label="Gobernador" data={preguntas['Aprobación Gobernador']} />
        <GaugeAprobacion label="Presidente" data={preguntas['Aprobación Presidente']} />
      </div>
    </div>
    <div>
      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 500 }}>Reelección</h4>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <DonutReeleccion label="Llaryora (Gobernador)" data={preguntas['Reelección Llaryora']} />
        <DonutReeleccion label="Milei (Presidente)" data={preguntas['Reelección Milei']} />
      </div>
    </div>
  </div>
);

// ============================================
// VISTA "COMPARATIVO" (solapa Encuestas) — lógica de datos compartida entre pantalla
// (ComparativoEncuesta, JSX) y PDF (htmlComparativoEncuestaBody, HTML-string), definida
// más abajo junto a esta última. Ya no hay sparkline (eliminado a favor de lectura
// directa en texto plano, ver calcularVariacionIndicador/textoVariacionIndicador) ni
// una única función de HTML compartida: cada lado renderiza con su propia técnica
// (JSX vs. HTML-string) sobre la MISMA lógica de cálculo, para no desincronizarse.
// Convención de deltas: última ronda vs. anteúltima ronda (NO contra la primera) —
// con exactamente 2 rondas la anteúltima es la primera, caso base sin nada especial.
// ============================================

// Solo la barra apilada Positiva/Regular/Negativa/Ns-Nc (sin label), para poder
// componerla tanto en una fila de mini-pendiente (fecha a la izquierda) como en
// htmlBarraCategoriasPDF (label arriba). Mismos colores/umbral de texto que BarraGestion.
// deltas (opcional): {categoria: delta} para pintar, arriba de CADA segmento presente,
// su variación en pp contra la barra INMEDIATAMENTE ANTERIOR — se pasa null en la
// primera barra de la serie (nada previo con qué comparar, ver htmlMiniPendienteGestion).
// Cada label ocupa el mismo ancho % que su segmento para quedar centrado justo arriba
// de él. umbral: mismo umbral_variacion_pp del resto — por debajo, el segmento se trata
// como estable (ver htmlDeltaSegmentoBadge).
const UMBRAL_SEGMENTO_CHICO = 12;
function htmlBarraSegmentosPDF(data, { height = 18, deltas = null, umbral = 2.5 } = {}) {
  if (!data) return `<div style="height:${height}px;border-radius:5px;background:#eee"></div>`;
  const categorias = categoriasGestion(data);
  const presentes = categorias.filter(cat => data[cat] > 0);
  const segmentos = presentes.map(cat => {
    const v = data[cat];
    const texto = cat !== 'Ns/Nc' && v > 8 ? `<span style="font-size:9px;color:#fff;font-weight:600">${v}%</span>` : '';
    return `<div title="${cat}: ${v}%" style="width:${v}%;background:${colorCategoriaGestion(cat)};display:flex;align-items:center;justify-content:center">${texto}</div>`;
  }).join('');
  const barra = `<div style="display:flex;height:${height}px;border-radius:5px;overflow:hidden;background:#eee">${segmentos}</div>`;
  if (!deltas) return barra;
  // Segmentos angostos (< UMBRAL_SEGMENTO_CHICO %) llevan el badge en versión compacta
  // (solo flecha + número, sin "pp") y con overflow visible centrado, para que no se
  // pise con el del vecino ni se corte; el valor completo queda en el tooltip del segmento.
  const labels = presentes.map(cat => `<div style="width:${data[cat]}%;display:flex;justify-content:center;white-space:nowrap;min-width:0">${deltas[cat] != null ? htmlDeltaSegmentoBadge(deltas[cat], umbral, cat, data[cat] < UMBRAL_SEGMENTO_CHICO) : ''}</div>`).join('');
  return `<div style="display:flex;margin-bottom:3px">${labels}</div>${barra}`;
}

// Arma {actual, fechaActual, actualCasos, anterior, delta, estado} para un indicador a
// partir de [{fecha, valor, casos}] ya sin nulls, en orden cronológico. Compartida por
// pantalla (ComparativoEncuesta, JSX) y PDF (htmlComparativoEncuestaBody, HTML-string) —
// es pura lógica de datos, sin JSX ni HTML, así que no hay nada que duplicar entre las
// dos. "anterior" es el penúltimo elemento CON DATO de esta lista ya filtrada — si la
// pregunta no está presente en la ronda anteúltima global pero sí en una previa, se
// compara contra esa (mismo criterio de "omitir el hueco puntual sin romper el resto"
// que ya aplicaba con la convención vieja). estado: 'sube' | 'baja' | 'estable'
// (|delta| < umbral) según anterior vs. actual, o null con < 2 rondas con dato (nada
// que comparar todavía).
function calcularVariacionIndicador(datos, umbral) {
  if (!datos || datos.length === 0) return null;
  const actual = datos[datos.length - 1];
  if (datos.length < 2) return { actual: actual.valor, fechaActual: actual.fecha, actualCasos: actual.casos, anterior: null, delta: null, estado: null };
  const anterior = datos[datos.length - 2];
  const delta = actual.valor - anterior.valor;
  const estado = Math.abs(delta) < umbral ? 'estable' : (delta > 0 ? 'sube' : 'baja');
  return { actual: actual.valor, fechaActual: actual.fecha, actualCasos: actual.casos, anterior: anterior.valor, delta, estado };
}

// positivoEsSubir: polaridad del indicador, no del delta — true para Aprobación/
// Reelección (subir es buena noticia en las 5 cards, ver
// ITEMS_INDICADORES_COMPARATIVO), false para "Principales problemas" (subir es
// siempre mala noticia, constante para esa tabla). colorNeutro es configurable porque
// pantalla usa var(--text-tertiary) y el PDF necesita un hex fijo (no hereda custom
// properties).
function colorVariacionIndicador(estado, positivoEsSubir, colorNeutro = 'var(--text-tertiary)') {
  if (!estado || estado === 'estable') return colorNeutro;
  const esBueno = positivoEsSubir ? estado === 'sube' : estado === 'baja';
  return esBueno ? '#2E7D32' : '#C62828';
}

// Usado solo por el PDF (htmlIndicadorCardPlano/htmlTablaProblemasPlano) — pantalla
// tiene su propio formateo de 2 líneas, ver formatoVariacionCard/BadgeVariacionProblema.
function textoVariacionIndicador(v) {
  if (!v || v.estado == null) return null;
  if (v.estado === 'estable') return `≈ estable (${v.anterior.toFixed(1)}%)`;
  const flecha = v.estado === 'sube' ? '▲' : '▼';
  const verbo = v.estado === 'sube' ? 'subió' : 'bajó';
  return `${flecha} ${verbo} desde ${v.anterior.toFixed(1)}%`;
}

// 5 cards: Aprobación x3 + Reelección x2. 4º elemento de cada tupla = positivoEsSubir
// (default true si se omite, ninguna de las 5 lo necesita en false).
// "Cordobeses en Alerta" se sacó del tablero por completo (card removida acá y de
// htmlResumenRondaPDF) — el grid es auto-fill así que no queda hueco en el layout,
// mismo comportamiento que ya tiene el sistema para preguntas ausentes en una ronda.
// "Calificación de gestión" NO es una card de este grid — sigue siendo la sección
// aparte de barras apiladas de siempre (htmlMiniPendientesGestion/ComparativoEncuesta
// más abajo), sin ningún cambio de diseño.
const ITEMS_INDICADORES_COMPARATIVO = [
  ['Aprobación Intendente', 'Aprobación Intendente', 'Apruebo'],
  ['Aprobación Gobernador', 'Aprobación Gobernador', 'Apruebo'],
  ['Aprobación Presidente', 'Aprobación Presidente', 'Apruebo'],
  ['Reelección Llaryora', 'Reelección Llaryora', 'Si'],
  ['Reelección Milei', 'Reelección Milei', 'Si'],
];

// Mismo filtro de siempre (se omiten problemas en 0% en TODAS las rondas). Orden por
// valor actual descendente — el problema más relevante hoy va primero (ya no
// alfabético ni por orden fijo de categoría).
function calcularFilasProblemasComparativo(rondas, umbral) {
  const categorias = Array.from(new Set(rondas.flatMap(r => Object.keys(r.preguntas?.['Problemas principales'] || {}))));
  return categorias
    .map(cat => {
      const datos = rondas.map(r => ({ fecha: r.fecha, valor: r.preguntas?.['Problemas principales']?.[cat] })).filter(d => d.valor != null);
      return { cat, datos, v: calcularVariacionIndicador(datos, umbral) };
    })
    .filter(f => f.datos.length > 0 && f.datos.some(d => d.valor > 0))
    .sort((a, b) => b.v.actual - a.v.actual);
}

// Resumen de Principales problemas — última ronda vs. anteúltima (misma convención que
// el resto de Comparativo; con exactamente 2 rondas la anteúltima es la primera).
// Devuelve, además de las variaciones, las fechas de las dos rondas comparadas para
// poder rotular de dónde sale cada número. "Más mencionados" = el % de vecinos que
// nombra el problema subió; "menos mencionados" = bajó.
function calcularResumenVariacionesProblemas(rondas, umbral) {
  const vacio = { suben: [], bajan: [], fechaAnterior: null, fechaActual: null, sinRondasComparables: false };
  // Solo cuentan las rondas que traen la pregunta: las rondas más nuevas (ej. 01/10)
  // no la incluyen, y comparar contra una ronda sin dato diría "sin variaciones" sin
  // que sea cierto.
  const conProblemas = rondas.filter(r => r.preguntas?.['Problemas principales']);
  if (conProblemas.length < 2) return { ...vacio, sinRondasComparables: true };
  const anterior = conProblemas[conProblemas.length - 2], ultima = conProblemas[conProblemas.length - 1];
  const probActual = ultima.preguntas['Problemas principales'];
  const probAnterior = anterior.preguntas['Problemas principales'];
  const categorias = new Set([...Object.keys(probActual), ...Object.keys(probAnterior)]);
  const variaciones = [];
  categorias.forEach(cat => {
    const vA = probActual[cat], vB = probAnterior[cat];
    if (vA == null || vB == null) return;
    const delta = vA - vB;
    if (Math.abs(delta) >= umbral) variaciones.push({ cat, delta, anterior: vB, actual: vA });
  });
  return {
    suben: variaciones.filter(v => v.delta > 0).sort((a, b) => b.delta - a.delta),
    bajan: variaciones.filter(v => v.delta < 0).sort((a, b) => a.delta - b.delta),
    fechaAnterior: anterior.fecha, fechaActual: ultima.fecha,
  };
}

// "Otro" en los datos significa "otros problemas que no están en la lista de opciones" —
// se muestra igual (suele ser el que más se mueve, ocultarlo escondería información)
// pero con esa aclaración, para que no se lea como un problema concreto.
const etiquetaProblema = (cat) => cat === 'Otro' ? 'Otro (otros problemas no listados)' : cat;

const TITULO_RESUMEN_PROBLEMAS = 'Problemas que más cambiaron en la percepción vecinal';
const subtituloResumenProblemas = (fechaAnterior, fechaActual) =>
  `Comparación entre ${formatearFecha(fechaAnterior)} y ${formatearFecha(fechaActual)} · variación en puntos porcentuales (pp) del % de vecinos que menciona cada problema`;
const NOTA_SEMANTICA_PROBLEMAS = 'En problemas, que un porcentaje suba es una mala señal (rojo) y que baje es una buena señal (verde): al revés que en Aprobación.';

// --- Render PDF (HTML-string, colores hardcodeados porque el documento no hereda
// var(--...)) del resumen/cards/tabla que arma ComparativoEncuesta en pantalla, sobre
// la MISMA lógica de cálculo de arriba — ver htmlComparativoEncuestaBody más abajo.
// "Calificación de gestión" (barras apiladas) no pasa por acá, ver más abajo. ---
function htmlIndicadorCardPlano(label, rondas, pregunta, categoria, umbral, positivoEsSubir) {
  const datos = rondas.map(r => ({ fecha: r.fecha, valor: r.preguntas?.[pregunta]?.[categoria] })).filter(d => d.valor != null);
  const v = calcularVariacionIndicador(datos, umbral);
  const frase = textoVariacionIndicador(v);
  const color = colorVariacionIndicador(v?.estado, positivoEsSubir, '#999');
  return `<div style="padding:14px;background:#f5f5f5;border-radius:10px;display:flex;flex-direction:column;gap:4px;min-height:96px">
    <div style="font-size:11px;color:#666">${label}</div>
    <div style="font-size:20px;font-weight:700;color:#1a1a1a">${v?.actual != null ? v.actual.toFixed(1) + '%' : '—'}</div>
    ${frase ? `<div style="font-size:11px;font-weight:600;color:${color}">${frase}</div>` : ''}
    ${v?.fechaActual ? `<div style="font-size:9px;color:#999;margin-top:2px">${formatearFecha(v.fechaActual)}</div>` : ''}
  </div>`;
}

function htmlGridIndicadoresPlano(rondas, umbral) {
  const cards = ITEMS_INDICADORES_COMPARATIVO
    .map(([label, pregunta, categoria, positivoEsSubir = true]) => htmlIndicadorCardPlano(label, rondas, pregunta, categoria, umbral, positivoEsSubir))
    .join('');
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));gap:10px">${cards}</div>`;
}

function htmlTablaProblemasPlano(rondas, umbral) {
  const filas = calcularFilasProblemasComparativo(rondas, umbral);
  if (filas.length === 0) return `<p style="font-size:12px;color:#999">Sin datos de problemas.</p>`;
  const filasHtml = filas.map(f => `<tr>
      <td style="padding:8px;border-top:1px solid #e0e0e0">${f.cat}</td>
      <td style="padding:8px;border-top:1px solid #e0e0e0;text-align:right"><strong>${f.v.actual.toFixed(1)}%</strong></td>
      <td style="padding:8px;border-top:1px solid #e0e0e0;text-align:right;font-weight:600;color:${colorVariacionIndicador(f.v.estado, false, '#999')}">${textoVariacionIndicador(f.v) || '—'}</td>
    </tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr>
      <th style="padding:8px;text-align:left;background:#f5f5f5;font-weight:500">Problema</th>
      <th style="padding:8px;text-align:right;background:#f5f5f5;font-weight:500">% actual</th>
      <th style="padding:8px;text-align:right;background:#f5f5f5;font-weight:500">Variación</th>
    </tr></thead>
    <tbody>${filasHtml}</tbody>
  </table>`;
}

function htmlResumenVariacionesPlano(rondas, umbral) {
  const { suben, bajan, fechaAnterior, fechaActual, sinRondasComparables } = calcularResumenVariacionesProblemas(rondas, umbral);
  if (suben.length === 0 && bajan.length === 0) {
    return `<div style="font-size:12px;color:#999;margin-bottom:16px">${sinRondasComparables ? 'No hay dos rondas con la pregunta de problemas para comparar.' : `Sin variaciones significativas (≥${umbral}pp) entre rondas.`}</div>`;
  }
  const fila = (v, color) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:12px;font-weight:500;color:#1a1a1a"><span>${etiquetaProblema(v.cat)}</span><span style="white-space:nowrap;color:${color};font-weight:600">${v.anterior.toFixed(1)}% → ${v.actual.toFixed(1)}% (${v.delta > 0 ? '+' : ''}${v.delta.toFixed(1)} pp)</span></div>`;
  const grupo = (titulo, items, color) => items.length === 0 ? '' : `<div style="margin-bottom:8px"><div style="font-size:13px;font-weight:700;color:${color};margin-bottom:2px">${titulo}</div>${items.map(v => fila(v, color)).join('')}</div>`;
  return `<div style="margin-bottom:18px;break-inside:avoid">
    <div style="font-size:14px;font-weight:700;color:#1a1a1a">${TITULO_RESUMEN_PROBLEMAS}</div>
    <div style="font-size:11px;color:#999;margin:2px 0 10px">${subtituloResumenProblemas(fechaAnterior, fechaActual)}</div>
    ${grupo('🔺 Más mencionados ahora', suben, '#C62828')}
    ${grupo('🔻 Menos mencionados ahora', bajan, '#2E7D32')}
    <div style="font-size:10px;color:#999">${NOTA_SEMANTICA_PROBLEMAS}</div>
  </div>`;
}

// --- "Calificación de gestión" (barras apiladas). Una fila por ronda (fecha a la
// izquierda + barra apilada Positiva/Regular/Negativa/Ns-Nc, reutilizando
// htmlBarraSegmentosPDF), apiladas verticalmente. Cada barra desde la SEGUNDA en
// adelante lleva, arriba de cada segmento, su delta contra la barra INMEDIATAMENTE
// ANTERIOR (no contra la primera) — ver htmlDeltaSegmentoBadge/
// calcularDeltasCategoriasGestion. La primera barra nunca lleva badge (nada previo
// con qué comparar). ---
// Polaridad de "sube = buena noticia" por categoría de Calificación de gestión — a
// diferencia de ITEMS_INDICADORES_COMPARATIVO (una sola polaridad para todo el
// indicador), acá cada categoría de la MISMA barra apilada tiene sentido opuesto:
// Positiva/Regular subiendo es buena noticia (verde), Negativa/Ns-Nc subiendo es mala
// noticia (rojo) — y a la inversa si bajan. Reemplaza la lógica vieja de color por
// signo crudo del delta (ver calcularDeltasCategoriasGestion).
const POSITIVO_ES_SUBIR_GESTION = { 'Positiva': true, 'Regular': true, 'Negativa': false, 'Ns/Nc': false };

// umbral: por debajo, "estable" (mismo criterio que el resto de Comparativo, misma
// convención de < estricto que calcularVariacionIndicador) en vez de forzar un color
// por un cambio de redondeo. categoria: Positiva/Regular/Negativa/Ns-Nc — decide el
// color vía POSITIVO_ES_SUBIR_GESTION; sin categoría (llamador legado) cae a "sube
// siempre es bueno" como estaba antes.
function htmlDeltaSegmentoBadge(delta, umbral = 2.5, categoria, compacto = false) {
  const redondeado = Math.round(delta * 10) / 10;
  if (Math.abs(redondeado) < umbral) return `<span style="font-size:10px;font-weight:600;color:#999">${compacto ? '·' : '· Estable'}</span>`;
  const sube = redondeado > 0;
  // categoria == null es el llamador legado documentado arriba (cae a "sube = bueno"
  // sin avisar); categoria definida pero ausente del mapa es el mismo tipo de nombre
  // no reconocido que colorCategoriaGestion, con el mismo aviso una sola vez.
  if (categoria != null && !(categoria in POSITIVO_ES_SUBIR_GESTION) && !categoriasGestionAvisadas.has(categoria)) {
    categoriasGestionAvisadas.add(categoria);
    console.warn(`Calificación de gestión: categoría "${categoria}" no reconocida (sin polaridad mapeada), asumiendo "sube = bueno".`);
  }
  const positivoEsSubir = POSITIVO_ES_SUBIR_GESTION[categoria] ?? true;
  const esBueno = positivoEsSubir ? sube : !sube;
  const color = esBueno ? '#2E7D32' : '#C62828';
  const arrow = sube ? '▲' : '▼';
  const signo = sube ? '+' : '';
  return `<span style="font-size:${compacto ? 9 : 10}px;font-weight:600;color:${color}">${arrow} ${signo}${redondeado.toFixed(1)}${compacto ? '' : ' pp'}</span>`;
}

// Delta por categoría (Positiva/Regular/Negativa/Ns-Nc) entre dos filas CONSECUTIVAS
// (anterior/actual) para un funcionario — se llama una vez por cada par de barras
// adyacentes, no solo primera-vs-última. Devuelve el delta crudo (con signo); el color
// semántico según categoría se decide en htmlDeltaSegmentoBadge (POSITIVO_ES_SUBIR_GESTION),
// no acá. Si una categoría existe en la barra actual pero no en la anterior (ej.
// Ns/Nc recién aparece), se toma 0% como valor de esa categoría en la anterior.
function calcularDeltasCategoriasGestion(anteriorData, actualData) {
  const categorias = categoriasGestion(actualData);
  const deltas = {};
  categorias.forEach(cat => {
    const vActual = actualData[cat];
    if (!vActual || vActual <= 0) return; // sin segmento en esta barra => sin badge
    deltas[cat] = vActual - (anteriorData[cat] || 0);
  });
  return deltas;
}

function htmlMiniPendienteGestion(funcionario, rondas, umbral) {
  const pregunta = `Gestión del ${funcionario}`;
  const filas = rondas.map(r => ({ fecha: r.fecha, casos: r.casos, data: r.preguntas?.[pregunta] })).filter(f => f.data);
  if (filas.length === 0) {
    return `<div style="margin-bottom:16px"><div style="font-size:13px;color:#666;font-weight:500;margin-bottom:8px">Calificación de gestión: ${funcionario}</div><p style="font-size:12px;color:#999">Sin dato.</p></div>`;
  }
  const filasHtml = filas.map((f, i) => {
    const deltas = i > 0 ? calcularDeltasCategoriasGestion(filas[i - 1].data, f.data) : null;
    return `
    <div style="margin-bottom:10px;break-inside:avoid">
      <div style="font-size:12px;font-weight:600;color:#1a1a1a">${formatearFecha(f.fecha)}</div>
      <div style="font-size:10px;color:var(--text-tertiary,#999);margin-bottom:3px">${f.casos != null ? `n = ${f.casos} respuestas` : 'n no informado'}</div>
      ${htmlBarraSegmentosPDF(f.data, { height: 22, deltas, umbral })}
    </div>`;
  }).join('');
  return `<div style="margin-bottom:16px;break-inside:avoid">
    <div style="font-size:13px;color:#666;font-weight:500;margin-bottom:8px">Calificación de gestión: ${funcionario}</div>
    ${filasHtml}
  </div>`;
}

function htmlMiniPendientesGestion(rondas, umbral) {
  return ['Intendente', 'Gobernador', 'Presidente'].map(f => htmlMiniPendienteGestion(f, rondas, umbral)).join('');
}

function htmlLegendGestion() {
  const items = ['Positiva', 'Regular', 'Negativa'].map(cat =>
    `<div style="display:flex;align-items:center;gap:5px"><div style="width:10px;height:10px;border-radius:2px;background:${COLOR_GESTION[cat]}"></div><span style="font-size:11px;color:#666">${cat}</span></div>`
  ).join('');
  return `<div style="display:flex;gap:14px;margin-top:6px">${items}</div>`;
}

// Cuerpo completo de la vista Comparativo para el PDF — mismo criterio que
// ComparativoEncuesta en pantalla: cards sin sparkline + tabla ordenada con frase en
// texto plano para Indicadores/Principales problemas, "Calificación de gestión" sin
// tocar (barras apiladas de siempre, ver bloque de arriba).
function htmlComparativoEncuestaBody(encuesta, umbral) {
  const rondas = encuesta.rondas;
  return `
    ${htmlResumenVariacionesPlano(rondas, umbral)}
    <div style="margin-bottom:20px">
      <h4 style="font-size:13px;color:#666;margin-bottom:10px;font-weight:500">Indicadores</h4>
      ${htmlGridIndicadoresPlano(rondas, umbral)}
    </div>
    <div style="margin-bottom:20px">
      <h4 style="font-size:13px;color:#666;margin-bottom:10px;font-weight:500">Calificación de gestión</h4>
      ${htmlMiniPendientesGestion(rondas, umbral)}
      ${htmlLegendGestion()}
    </div>
    <div>
      <h4 style="font-size:13px;color:#666;margin-bottom:10px;font-weight:500">Principales problemas — evolución</h4>
      ${htmlTablaProblemasPlano(rondas, umbral)}
    </div>
  `;
}

// ============================================
// VISTA "COMPARATIVO" EN PANTALLA — JSX puro sobre la lógica de cálculo de arriba
// (calcularVariacionIndicador/etc.), independiente del renderer del PDF
// (htmlComparativoEncuestaBody, HTML-string) aunque comparten esa misma lógica — ver
// comentario de la sección de arriba. El PDF sigue con su propio formato de texto
// plano (textoVariacionIndicador) sin cambios visuales — acá abajo va el rediseño de
// pantalla: cards de 2 líneas con acento por tipo de pregunta, badge en vez de frase
// para Principales problemas, y umbral aplicado en el badge de gestión.
// ============================================

// Acento por tipo de pregunta (encuestas_metadata.json → preguntas[pregunta].tipo) —
// mismos colores ya usados en otras partes del tablero, no inventados para esto:
// Aprobación = azul primario del tablero, Reelección = teal de TERRITORIO LEAL/
// Relevado, neutro = gris pizarra de EN DISPUTA/ADVERSO (fallback para cualquier tipo
// futuro sin color asignado en ITEMS_INDICADORES_COMPARATIVO).
const ACENTO_TIPO_PREGUNTA = { Aprobacion: '#1976D2', Reeleccion: '#26A69A' };
const ACENTO_TIPO_NEUTRO = '#78909C';
const colorAcentoTipoPregunta = (tipo) => ACENTO_TIPO_PREGUNTA[tipo] || ACENTO_TIPO_NEUTRO;

// Formato de 2 líneas de la card, sobre calcularVariacionIndicador (anterior vs.
// actual): con cambio ≥umbral, línea1 = delta en negrita+color, línea2 = "De A% a B%"
// muted; por debajo del umbral, una sola línea "· Estable (A% → B%)" en gris — no hay
// "subida"/"bajada" que destacar, así que no tiene sentido partirla en 2.
function formatoVariacionCard(v, positivoEsSubir) {
  if (!v || v.estado == null) return null;
  const color = colorVariacionIndicador(v.estado, positivoEsSubir);
  if (v.estado === 'estable') return { color, linea1: `· Estable (${v.anterior.toFixed(1)}% → ${v.actual.toFixed(1)}%)`, linea2: null };
  const flecha = v.estado === 'sube' ? '▲' : '▼';
  const verbo = v.estado === 'sube' ? 'Subió' : 'Bajó';
  return { color, linea1: `${flecha} ${verbo} ${Math.abs(v.delta).toFixed(1)} p.p`, linea2: `De ${v.anterior.toFixed(1)}% a ${v.actual.toFixed(1)}%` };
}

const CardIndicadorComparativo = ({ label, rondas, pregunta, categoria, umbral, positivoEsSubir = true, colorAcento }) => {
  const datos = rondas.map(r => ({ fecha: r.fecha, casos: r.casos, valor: r.preguntas?.[pregunta]?.[categoria] })).filter(d => d.valor != null);
  const v = calcularVariacionIndicador(datos, umbral);
  const cambio = formatoVariacionCard(v, positivoEsSubir);
  return (
    <div style={{ padding: '14px 16px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderLeft: `3px solid ${colorAcento}`, borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '4px', minHeight: '92px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
      {cambio ? (
        <>
          <div style={{ fontSize: '13px', fontWeight: 600, color: cambio.color }}>{cambio.linea1}</div>
          {cambio.linea2 && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{cambio.linea2}</div>}
        </>
      ) : (
        <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)' }}>{v?.actual != null ? `${v.actual.toFixed(1)}%` : '—'}</div>
      )}
      {v?.fechaActual && <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{formatearFechaRonda(v.fechaActual, v.actualCasos)}</div>}
    </div>
  );
};

// Una sola grilla continua con wrap para Aprobación + Reelección + cualquier otra
// pregunta que se agregue (mismo orden relativo de ITEMS_INDICADORES_COMPARATIVO) —
// la diferenciación entre categorías es el acento de color, no separación de layout.
const GridIndicadoresComparativo = ({ rondas, umbral, metadata }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
    {ITEMS_INDICADORES_COMPARATIVO.map(([label, pregunta, categoria, positivoEsSubir = true]) => (
      <CardIndicadorComparativo
        key={label} label={label} rondas={rondas} pregunta={pregunta} categoria={categoria} umbral={umbral} positivoEsSubir={positivoEsSubir}
        colorAcento={colorAcentoTipoPregunta(metadata?.preguntas?.[pregunta]?.tipo)}
      />
    ))}
  </div>
);

// Badge de variación para una fila de Principales problemas — subir SIEMPRE es rojo
// (más gente lo percibe como problema) y bajar SIEMPRE es verde, polaridad constante
// (por eso positivoEsSubir=false fijo, a diferencia de las cards de arriba).
const BadgeVariacionProblema = ({ v }) => {
  if (!v || v.estado == null) return <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>—</span>;
  const color = colorVariacionIndicador(v.estado, false);
  if (v.estado === 'estable') return <span style={{ fontSize: '12px', fontWeight: 600, color }}>· Estable</span>;
  const flecha = v.estado === 'sube' ? '▲' : '▼';
  const verbo = v.estado === 'sube' ? 'Subió' : 'Bajó';
  return <span style={{ fontSize: '12px', fontWeight: 600, color, whiteSpace: 'nowrap' }}>{flecha} {verbo} {Math.abs(v.delta).toFixed(1)} p.p</span>;
};

// Top 5 categorías por % actual, cada fila: nombre + barra horizontal + % actual +
// badge de variación (última vs. anteúltima ronda). El corte a 5 es solo de pantalla
// (calcularFilasProblemasComparativo se comparte con el PDF, que sigue mostrando la
// tabla completa) — no se filtran filas "vacías" si el circuito tiene menos de 5
// categorías con datos.
const FilasProblemasComparativo = ({ rondas, umbral }) => {
  const filas = calcularFilasProblemasComparativo(rondas, umbral).slice(0, 5);
  if (filas.length === 0) return <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin datos de problemas.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {filas.map(f => (
        <div key={f.cat} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '170px', flexShrink: 0, fontSize: '13px', color: 'var(--text-primary)' }}>{f.cat}</div>
          <BarraHorizontalPct pct={Number(f.v.actual.toFixed(1))} />
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', minWidth: '48px', textAlign: 'right' }}>{f.v.actual.toFixed(1)}%</div>
          <div style={{ minWidth: '100px', textAlign: 'right' }}><BadgeVariacionProblema v={f.v} /></div>
        </div>
      ))}
    </div>
  );
};

// Resumen automático de Principales problemas — última ronda vs. anteúltima (misma
// convención que el resto de Comparativo, ver calcularResumenVariacionesProblemas).
// Va primero y con jerarquía visual: título + subtítulo que explican qué se está
// comparando, y dos grupos (más / menos mencionados) con valor anterior → actual.
// Cada fila hace wrap en pantallas angostas (flex-wrap) para leerse bien en mobile.
const FilaCambioProblema = ({ v, color }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '2px 12px', padding: '4px 0', fontSize: '14px', color: 'var(--text-primary)' }}>
    <span style={{ fontWeight: 500 }}>{etiquetaProblema(v.cat)}</span>
    <span style={{ fontWeight: 600, color, whiteSpace: 'nowrap' }}>{v.anterior.toFixed(1)}% → {v.actual.toFixed(1)}% ({v.delta > 0 ? '+' : ''}{v.delta.toFixed(1)} pp)</span>
  </div>
);

const GrupoCambiosProblemas = ({ titulo, items, color }) => items.length === 0 ? null : (
  <div style={{ marginBottom: '10px' }}>
    <div style={{ fontSize: '14px', fontWeight: 700, color, marginBottom: '2px' }}>{titulo}</div>
    {items.map(v => <FilaCambioProblema key={v.cat} v={v} color={color} />)}
  </div>
);

const ResumenVariacionesComparativo = ({ rondas, umbral }) => {
  const { suben, bajan, fechaAnterior, fechaActual, sinRondasComparables } = calcularResumenVariacionesProblemas(rondas, umbral);
  if (suben.length === 0 && bajan.length === 0) {
    return <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '22px' }}>{sinRondasComparables ? 'No hay dos rondas con la pregunta de problemas para comparar.' : `Sin variaciones significativas (≥${umbral}pp) entre rondas.`}</div>;
  }
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{TITULO_RESUMEN_PROBLEMAS}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '2px 0 12px' }}>{subtituloResumenProblemas(fechaAnterior, fechaActual)}</div>
      <GrupoCambiosProblemas titulo="🔺 Más mencionados ahora" items={suben} color="#C62828" />
      <GrupoCambiosProblemas titulo="🔻 Menos mencionados ahora" items={bajan} color="#2E7D32" />
      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{NOTA_SEMANTICA_PROBLEMAS}</div>
    </div>
  );
};

const ComparativoEncuesta = ({ encuesta, umbral, metadata }) => {
  const rondas = encuesta.rondas;
  return (
    <div>
      <ResumenVariacionesComparativo rondas={rondas} umbral={umbral} />
      <div style={{ marginBottom: '28px' }}>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 500 }}>Indicadores</h4>
        <GridIndicadoresComparativo rondas={rondas} umbral={umbral} metadata={metadata} />
      </div>
      {/* Barras apiladas Positiva/Regular/Negativa/Ns-Nc por ronda, vía
          dangerouslySetInnerHTML para reusar exactamente el mismo render que el PDF
          (htmlMiniPendientesGestion) — ahora con badge de delta en todas las barras
          menos la primera, ver htmlDeltaSegmentoBadge/calcularDeltasCategoriasGestion. */}
      <div style={{ marginBottom: '28px' }}>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 500 }}>Calificación de gestión</h4>
        <div dangerouslySetInnerHTML={{ __html: htmlMiniPendientesGestion(rondas, umbral) + htmlLegendGestion() }} />
      </div>
      <div>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px', fontWeight: 500 }}>Principales problemas — evolución</h4>
        <FilasProblemasComparativo rondas={rondas} umbral={umbral} />
      </div>
    </div>
  );
};

// fechaRondaInicial (opcional): pedido puntual de qué ronda mostrar al montar (ver
// click en evento de Medición de TablaEventosCobertura, irACircuitoDesdeGrillaMedicion).
// Sin ese pedido, o si la fecha no matchea ninguna ronda de ESTE circuito, se cae al
// comportamiento de siempre (última ronda) — no rompe ningún otro caller.
const SolapaEncuestas = ({ encuesta, metadata, fechaRondaInicial }) => {
  const [rondaIdx, setRondaIdx] = useState(() => {
    if (!fechaRondaInicial) return encuesta.rondas.length - 1;
    const idx = encuesta.rondas.findIndex(r => r.fecha === fechaRondaInicial);
    return idx >= 0 ? idx : encuesta.rondas.length - 1;
  });
  const [vista, setVista] = useState('resumen');
  const ronda = encuesta.rondas[rondaIdx];
  const umbral = metadata?.umbral_variacion_pp ?? 2.5;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
          {vista === 'resumen' ? `Encuesta · ${formatearFechaRonda(ronda.fecha, ronda.casos)}` : 'Comparativo entre rondas'}
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {vista === 'resumen' && encuesta.rondas.length > 1 && (
            <select value={rondaIdx} onChange={(e) => setRondaIdx(Number(e.target.value))} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', backgroundColor: '#fff' }}>
              {encuesta.rondas.map((r, i) => <option key={i} value={i}>{formatearFechaRonda(r.fecha, r.casos)}</option>)}
            </select>
          )}
          {encuesta.tiene_comparativo && (
            <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', padding: '3px' }}>
              <button onClick={() => setVista('resumen')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: vista === 'resumen' ? '#1976D2' : 'transparent', color: vista === 'resumen' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Resumen</button>
              <button onClick={() => setVista('comparativo')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: vista === 'comparativo' ? '#1976D2' : 'transparent', color: vista === 'comparativo' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Comparativo</button>
            </div>
          )}
        </div>
      </div>

      {vista === 'resumen'
        ? <ResumenEncuesta preguntas={ronda.preguntas} />
        : <ComparativoEncuesta encuesta={encuesta} umbral={umbral} metadata={metadata} />}
    </div>
  );
};

const ListadoEncuestasCircuitos = ({ datos, encuestasData, onSelectCircuito }) => {
  const filas = useMemo(() => {
    return datos
      .map(d => ({ circuito: d, encuesta: buscarEncuestaCircuito(encuestasData, d.CircuitoKey) }))
      .filter(f => f.encuesta)
      .map(f => ({ ...f, fechaReciente: f.encuesta.rondas[f.encuesta.rondas.length - 1].fecha }))
      .sort((a, b) => compararMapkey(a.circuito.CircuitoKey, b.circuito.CircuitoKey));
  }, [datos, encuestasData]);

  return (
    <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '8px' }}>
      {filas.map(({ circuito, encuesta, fechaReciente }) => (
        <div
          key={circuito.CircuitoKey}
          onClick={() => onSelectCircuito(circuito.CircuitoKey)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{circuito.CircuitoKey} · {circuito.cirn_nom}</span>
          <span style={{ display: 'flex', gap: '18px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <span>{encuesta.cantidad_rondas} ronda{encuesta.cantidad_rondas !== 1 ? 's' : ''}</span>
            <span>{formatearFecha(fechaReciente)}</span>
          </span>
        </div>
      ))}
    </div>
  );
};

// ============================================
// VISTA CAPITAL
// ============================================
// Cabecera y resultados históricos de Capital — compartidos entre VistaCapital (pantalla)
// y el reporte imprimible (components/reporte).
const CabeceraCapital = ({ totalPadron, cantidadCircuitos }) => (
      <div style={{ padding: '16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '14px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>CÓRDOBA CAPITAL</h2>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '10px' }}>{cantidadCircuitos} circuitos │ {totalPadron.toLocaleString()} electores</div>
      </div>
);

const ResultadosCapital = () => (
      <div style={{ padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Resultados Capital - % Votos Peronismo</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[{ label: 'Gob. 2023', value: 0.458 }, { label: 'Gob. 2019', value: 0.515 }, { label: 'Dip. 2025', value: 0.255 }, { label: 'Dip. 2021', value: 0.222 }, { label: 'Int. 2019', value: 0.402 }].map(e => (
            <div key={e.label} style={{ flex: '1 1 140px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>{e.label}</div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: e.value >= 0.45 ? '#2E7D32' : e.value >= 0.25 ? '#FF8F00' : '#C62828' }}>{formatPct(e.value)}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px' }}>
          <div><span style={{ color: 'var(--text-secondary)' }}>Tendencia Gob (19→23): </span><span style={{ color: '#C62828', fontWeight: 500 }}>-5.7 pp</span></div>
          <div><span style={{ color: 'var(--text-secondary)' }}>Tendencia Dip (21→25): </span><span style={{ color: '#2E7D32', fontWeight: 500 }}>+3.3 pp</span></div>
          <div><span style={{ color: 'var(--text-secondary)' }}>Efecto ML (Int19→G23): </span><span style={{ color: '#2E7D32', fontWeight: 500 }}>+5.6 pp</span></div>
        </div>
      </div>
);

const VistaCapital = ({ datos, onSelectCircuito, filtroCategoria, setFiltroCategoria }) => {
  const [ordenColumna, setOrdenColumna] = useState('Share_G23');
  const [ordenAsc, setOrdenAsc] = useState(false);
  
  const conteoCategoria = datos.reduce((acc, d) => { 
    const cat = d.Categoria_v4;
    const catNorm = cat === 'B.2' ? 'D' : cat;
    acc[catNorm] = (acc[catNorm] || 0) + 1; 
    return acc; 
  }, {});
  
  const datosFiltrados = filtroCategoria 
    ? datos.filter(d => d.Categoria_v4 === filtroCategoria || (filtroCategoria === 'D' && d.Categoria_v4 === 'B.2'))
    : datos;
  const datosOrdenados = [...datosFiltrados].sort((a, b) => { const valA = a[ordenColumna] || 0; const valB = b[ordenColumna] || 0; return ordenAsc ? valA - valB : valB - valA; });
  const totalPadron = datos.reduce((sum, d) => sum + (d.Padron_G23 || 0), 0);
  
  const handleOrdenar = (col) => { if (ordenColumna === col) { setOrdenAsc(!ordenAsc); } else { setOrdenColumna(col); setOrdenAsc(false); } };
  
  const categoriasUnicas = Object.entries(COLORES_CATEGORIA).filter(([k]) => k !== 'B.2');
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <CabeceraCapital totalPadron={totalPadron} cantidadCircuitos={datos.length} />
      <ResultadosCapital />
      
      <div style={{ padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          Filtrar por diagnóstico
          {filtroCategoria && <button onClick={() => setFiltroCategoria(null)} style={{ marginLeft: '12px', padding: '4px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕ Limpiar filtro</button>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {categoriasUnicas.map(([cat, config]) => (
            <div key={cat} onClick={() => setFiltroCategoria(filtroCategoria === cat ? null : cat)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '8px', backgroundColor: filtroCategoria === cat ? `${config.bg}30` : 'var(--bg-secondary)', border: filtroCategoria === cat ? `2px solid ${config.bg}` : '2px solid transparent', cursor: 'pointer', transition: 'all 0.2s' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '4px', backgroundColor: config.bg }} />
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: filtroCategoria === cat ? 600 : 400 }}>{config.label} ({conteoCategoria[cat] || 0})</span>
            </div>
          ))}
        </div>
      </div>
      
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{filtroCategoria ? `Mostrando ${datosFiltrados.length} circuitos` : 'Todos los circuitos (119)'}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Click en columna para ordenar</span>
        </div>
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-secondary)' }}>
              <tr>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)', cursor: 'pointer' }} onClick={() => handleOrdenar('CircuitoKey')}>Circuito</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Diagnóstico</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)', cursor: 'pointer' }} onClick={() => handleOrdenar('Share_G23')}>G23 {ordenColumna === 'Share_G23' && (ordenAsc ? '↑' : '↓')}</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)', cursor: 'pointer' }} onClick={() => handleOrdenar('Share_L25')}>D25 {ordenColumna === 'Share_L25' && (ordenAsc ? '↑' : '↓')}</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)', cursor: 'pointer' }} onClick={() => handleOrdenar('Victorias_Total')}>Vict. {ordenColumna === 'Victorias_Total' && (ordenAsc ? '↑' : '↓')}</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: 'var(--text-tertiary)', cursor: 'pointer' }} onClick={() => handleOrdenar('Padron_G23')}>Padrón {ordenColumna === 'Padron_G23' && (ordenAsc ? '↑' : '↓')}</th>
              </tr>
            </thead>
            <tbody>
              {datosOrdenados.map((d) => (
                <tr key={d.CircuitoKey} onClick={() => onSelectCircuito(d.CircuitoKey)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <td style={{ padding: '10px 14px' }}><strong>{d.CircuitoKey}</strong> - {d.cirn_nom?.substring(0, 20)}{d.cirn_nom?.length > 20 ? '...' : ''}</td>
                  <td style={{ padding: '10px 14px' }}><Badge categoria={d.Categoria_v4} tipo="v4" /></td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: d.Share_G23 >= 0.5 ? '#2E7D32' : d.Share_G23 >= 0.4 ? '#FF8F00' : '#C62828' }}>{formatPct(d.Share_G23)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-secondary)' }}>{formatPct(d.Share_L25)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500 }}>{d.Victorias_Total}/4</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-secondary)' }}>{d.Padron_G23?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div style={{ padding: '18px 24px', backgroundColor: '#1976D218', borderRadius: '12px', textAlign: 'center' }}>
        <span style={{ fontSize: '13px', color: '#1565C0' }}>Hacé click en el mapa o en una fila para ver el detalle del circuito</span>
      </div>
    </div>
  );
};

// ============================================
// VISTA OBRAS (Etapa 1 — estructura, resumen y tabla "Estado general")
// ============================================
// A diferencia de ObrasPanel/ModalObra (que muestran obras UNA POR UNA dentro de la
// ficha de un circuito/barrio, ver más arriba), esta vista trabaja el conjunto de las
// 756 obras. Trabaja directo sobre obras_capital.json crudo (prop obrasData, mismo
// array que ya carga el fetch inicial) en vez de obrasEnriquecidas — no necesita
// _circuitoMapkey derivado porque el registro crudo ya trae su propio campo `circuito`.
//
// id_obra NO es un campo del JSON: 809 registros = 756 obras, repetidas por
// multi-barrio con id_registro tipo "OBRA-0049-a", "-b", etc. — se agrupa acá pelando
// ese sufijo de una letra. Confirmado a mano: 756 ids base únicos.
const idObraDeRegistro = (idRegistro) => (idRegistro || '').replace(/-[a-z]$/, '');

// porcentaje_avance viene 0–1, pero hay al menos un registro con error de carga
// (OBRA-0280 = 99 en vez de 0.99) — se acota acá solo para la vista, sin tocar el
// archivo fuente (fuera de alcance de esta etapa).
const normalizarAvanceObra = (v) => (v == null ? null : Math.min(v, 1));

// Estado derivado de avance + fecha_disponible_inaugurar para las fichas de circuito y
// barrio (FilaObra/ModalObra) — reemplaza el "Avance: X%" plano, que no distinguía "obra
// terminada pero sin fecha de inauguración confirmada" de "ya disponible para inaugurar".
// Devuelve null si el avance es dato sucio/ausente (normalizarAvanceObra ya lo resolvió a
// null) — en ese caso el caller mantiene el comportamiento actual (no inventar estado).
// Reusa parsearFechaISOPauta (lib/estadoPauta.js) para fecha_disponible_inaugurar: mismo
// parser que ya tolera "-"/""/null -> null sin intentar `new Date("-")` (hay un registro
// real con "-" literal en obras_capital.json).
// Misma paleta que ya usa el resto de la ficha para estados (Activo/Inactivo de pauta,
// notaUbicacion): gris = en obra, ámbar = terminada sin fecha, verde = lista/disponible.
const COLOR_ESTADO_OBRA = { enObra: '#757575', terminadaSinFecha: '#F57F17', disponible: '#2E7D32' };
function estadoDerivadoObra(avance, fechaDisponibleInaugurar) {
  if (avance == null) return null;
  const pct = Math.round(avance * 100);
  if (pct < 100) return { label: `En obra — ${pct}%`, color: COLOR_ESTADO_OBRA.enObra };
  const fecha = parsearFechaISOPauta(fechaDisponibleInaugurar);
  if (!fecha) return { label: 'Terminada — sin fecha de inauguración confirmada', color: COLOR_ESTADO_OBRA.terminadaSinFecha };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fechaLabel = formatearFecha(fechaDisponibleInaugurar);
  if (fecha <= hoy) return { label: `Lista para inaugurar (desde ${fechaLabel})`, color: COLOR_ESTADO_OBRA.disponible };
  return { label: `Disponible desde ${fechaLabel}`, color: COLOR_ESTADO_OBRA.disponible };
}

const RANGOS_AVANCE_OBRA = [
  { key: '0-30', label: '0% – 30%', test: (pct) => pct >= 0 && pct < 30 },
  { key: '30-70', label: '30% – 70%', test: (pct) => pct >= 30 && pct < 70 },
  { key: '70-100', label: '70% – 100%', test: (pct) => pct >= 70 && pct <= 100 },
];

const BarraAvanceObra = ({ avance }) => {
  const pct = Math.max(0, Math.min(100, (avance ?? 0) * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '110px' }}>
      <div style={{ flex: 1, height: '8px', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: colorAvanceObra(avance), borderRadius: '4px' }} />
      </div>
      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', minWidth: '30px', textAlign: 'right', flexShrink: 0 }}>
        {avance != null ? `${pct.toFixed(0)}%` : '—'}
      </span>
    </div>
  );
};

// Columna Barrio/Circuito: obra de un solo barrio → "Barrio · Circuito"; multi-barrio
// (mismo id_obra con varios id_registro) → "N barrios · multi", sin desplegar la lista
// (eso es Etapa 2); tipo_ubicacion 'sin_geometria' pisa el nombre de barrio cuando la
// obra es de un solo registro.
const CeldaBarrioCircuitoObra = ({ grupo }) => {
  if (grupo.multiBarrio) {
    return <span>{grupo.registros.length} barrios · multi</span>;
  }
  const r = grupo.registros[0];
  if (r.tipo_ubicacion === 'sin_geometria') return <span style={{ color: 'var(--text-tertiary)' }}>Sin geometría</span>;
  if (!r.barrio) return <span style={{ color: 'var(--text-tertiary)' }}>{r.circuito || '—'}</span>;
  return <span>{r.barrio}{r.circuito ? ` · ${r.circuito}` : ''}</span>;
};

// Filtros/orden/pestaña activa viven en el componente padre (Home), no acá adentro —
// Etapa 2 abre FichaObra desde una fila y permite navegar a la ficha de un
// barrio/circuito, lo que desmonta VistaObras (vistaFicha deja de ser 'obras'); si
// este estado fuera local se perdería al volver. Mismo criterio que filtroCategoria
// para VistaCapital (también lifted a Home por el mismo motivo).
const VistaObras = ({
  obrasData, busqueda, setBusqueda, filtroCircuito, setFiltroCircuito, filtroBarrio, setFiltroBarrio, filtroReparticion, setFiltroReparticion, filtroAvance, setFiltroAvance, ordenColumna, setOrdenColumna, ordenAsc, setOrdenAsc, onSelectObra,
  // Ronda 2 del prompt de actualización: se unificaron las solapas "Estado general" y
  // "Planificación de comunicación" en una sola vista (Tomás: "necesita todo junto, no
  // quiere cambiar de solapa para ver un dato") — un único set de filtros/orden en vez de
  // dos independientes, mismo criterio de "lifted a Home" que ya tenía cada uno por
  // separado (VistaObras se desmonta al entrar a la ficha de una obra, así que el estado
  // no puede vivir acá adentro sin perderse al volver).
  filtroAptoDifusion, setFiltroAptoDifusion, filtroEstadoRelevamiento, setFiltroEstadoRelevamiento, filtroPrioridad, setFiltroPrioridad,
  filtroEnvioComunicacion, setFiltroEnvioComunicacion,
  modo, setModo, anio, setAnio, mes, setMes,
}) => {
  // Colapsado por default: búsqueda + Circuito + Barrio (los 3 más usados) quedan
  // siempre visibles; el resto de los filtros (antes repartidos entre dos solapas) se
  // agrupan acá atrás de "Más filtros" para no saturar la vista de entrada — están a un
  // click, no detrás de un cambio de solapa que esconda datos (ver comentario de arriba).
  const [mostrarMasFiltros, setMostrarMasFiltros] = useState(false);
  // Una fila por id_obra único, no por id_registro (ver comentario de idObraDeRegistro).
  const obrasUnicas = useMemo(() => {
    const grupos = new Map();
    (obrasData || []).forEach((o) => {
      const idObra = idObraDeRegistro(o.id_registro);
      if (!idObra) return;
      if (!grupos.has(idObra)) grupos.set(idObra, []);
      grupos.get(idObra).push(o);
    });
    return Array.from(grupos.entries()).map(([idObra, registros]) => {
      const principal = registros[0];
      return {
        idObra,
        nombreObra: principal.nombre_obra || '(sin nombre)',
        reparticion: (principal.reparticion || '').trim() || '—',
        avance: normalizarAvanceObra(principal.porcentaje_avance),
        registros,
        multiBarrio: registros.length > 1,
        // Campos de la pestaña Planificación de comunicación (Etapa 3) — se agregan
        // acá, en la ÚNICA fuente de "una fila por id_obra", en vez de recalcular el
        // agrupado de nuevo en otro componente. Consistentes entre registros de una
        // misma obra multi-barrio (verificado en la Etapa 2: 0 grupos con valores
        // distintos para ningún campo salvo barrio/circuito), tomar del principal es
        // seguro.
        prioridad: principal.prioridad || null,
        aptoDifusion: principal.apto_difusion || null,
        estadoRelevamiento: principal.estado_relevamiento?.trim() || null,
        fechaDisponibleInaugurar: principal.fecha_disponible_inaugurar || null,
        fechaRodaje: principal.fecha_rodaje || null,
        fechaRelevamiento: principal.fecha_relevamiento || null,
        fechaPauta: principal.fecha_pauta || null,
        // Campos nuevos de obras_capital.json (actualización con envio_comunicacion_
        // relevamiento/comentarios_relevamiento_territorial/estado_produccion_piezas/
        // entrega_material_pauta_nico) — mismo criterio "una fila por id_obra" de acá
        // arriba. Reseña usa `descripcion` (el prompt la pedía como breve_resena, pero
        // el campo real en el archivo sigue siendo descripcion — mismo que ya consume
        // ModalObra). "Estado relevamiento" como filtro ya existía (estadoRelevamiento,
        // arriba) — el archivo no trae un campo `relevamiento` separado.
        tipoObra: principal.tipo_obra || null,
        resenaObra: principal.descripcion || null,
        comentariosRelevamientoTerritorial: principal.comentarios_relevamiento_territorial || null,
        estadoProduccionPiezas: principal.estado_produccion_piezas || null,
        entregaMaterialPautaNico: principal.entrega_material_pauta_nico || null,
        envioComunicacionRelevamiento: principal.envio_comunicacion_relevamiento || null,
      };
    });
  }, [obrasData]);

  // .map(String): obras_capital.json trae circuito como número en 69/771 registros
  // (error de carga, ej. 3 en vez de "3A") — sin esto, esos valores pasan el
  // .filter(Boolean) (son truthy) y el .sort de abajo explota porque los números no
  // tienen .localeCompare. Mismo criterio defensivo que ya usa circuitoMapkeyDeObra
  // en lib/obrasCercanas.js (obra.circuito.toString()) para el mismo campo.
  const opcionesCircuito = useMemo(() => (
    Array.from(new Set((obrasData || []).map((o) => o.circuito).filter(Boolean).map(String))).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  ), [obrasData]);
  const opcionesBarrio = useMemo(() => (
    Array.from(new Set((obrasData || []).map((o) => o.barrio).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'))
  ), [obrasData]);
  const opcionesReparticion = useMemo(() => (
    Array.from(new Set((obrasData || []).map((o) => (o.reparticion || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'))
  ), [obrasData]);
  // Opciones de los filtros que antes vivían solo en "Planificación de comunicación" —
  // mismo criterio que los de arriba: derivadas de los datos reales, no hardcodeadas.
  const opcionesAptoDifusion = useMemo(() => Array.from(new Set(obrasUnicas.map((g) => g.aptoDifusion).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')), [obrasUnicas]);
  const opcionesEstadoRelevamiento = useMemo(() => Array.from(new Set(obrasUnicas.map((g) => g.estadoRelevamiento).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')), [obrasUnicas]);
  const opcionesPrioridad = useMemo(() => Array.from(new Set(obrasUnicas.map((g) => g.prioridad).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')), [obrasUnicas]);
  const opcionesEnvioComunicacion = useMemo(() => Array.from(new Set(obrasUnicas.map((g) => g.envioComunicacionRelevamiento).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')), [obrasUnicas]);

  // Filtros sobre los datos ya deduplicados por id_obra: una obra multi-barrio queda
  // adentro si CUALQUIERA de sus registros (barrios/circuitos) matchea. El buscador de
  // texto libre se combina en AND con el resto — contains, case-insensitive, sin tildes,
  // con normalizarNombreBarrio (mismo criterio de normalización que ya usa el proyecto
  // para nombres de barrio, reusado tal cual acá para nombre_obra). Único filtrado ahora
  // (antes había dos, uno por solapa) — alimenta tabla Y calendario por igual.
  const obrasFiltradas = useMemo(() => {
    const q = busqueda.trim() ? normalizarNombreBarrio(busqueda) : '';
    return obrasUnicas.filter((g) => {
      if (q && !normalizarNombreBarrio(g.nombreObra).includes(q)) return false;
      if (filtroCircuito && !g.registros.some((r) => String(r.circuito) === filtroCircuito)) return false;
      if (filtroBarrio && !g.registros.some((r) => r.barrio === filtroBarrio)) return false;
      if (filtroReparticion && g.reparticion !== filtroReparticion) return false;
      if (filtroAvance) {
        const rango = RANGOS_AVANCE_OBRA.find((r) => r.key === filtroAvance);
        const pct = (g.avance ?? 0) * 100;
        if (rango && !rango.test(pct)) return false;
      }
      if (filtroAptoDifusion && g.aptoDifusion !== filtroAptoDifusion) return false;
      if (filtroEstadoRelevamiento && g.estadoRelevamiento !== filtroEstadoRelevamiento) return false;
      if (filtroPrioridad && g.prioridad !== filtroPrioridad) return false;
      if (filtroEnvioComunicacion && g.envioComunicacionRelevamiento !== filtroEnvioComunicacion) return false;
      return true;
    });
  }, [obrasUnicas, busqueda, filtroCircuito, filtroBarrio, filtroReparticion, filtroAvance, filtroAptoDifusion, filtroEstadoRelevamiento, filtroPrioridad, filtroEnvioComunicacion]);

  const obrasOrdenadas = useMemo(() => {
    const arr = [...obrasFiltradas];
    arr.sort((a, b) => {
      if (ordenColumna === 'avance') {
        const valA = a.avance ?? -1, valB = b.avance ?? -1;
        return ordenAsc ? valA - valB : valB - valA;
      }
      const valA = (a[ordenColumna] || '').toString();
      const valB = (b[ordenColumna] || '').toString();
      return ordenAsc ? valA.localeCompare(valB, 'es') : valB.localeCompare(valA, 'es');
    });
    return arr;
  }, [obrasFiltradas, ordenColumna, ordenAsc]);

  const handleOrdenar = (col) => { if (ordenColumna === col) setOrdenAsc(!ordenAsc); else { setOrdenColumna(col); setOrdenAsc(true); } };

  const totalObras = obrasFiltradas.length;
  // Nulo cuenta como 0 en el promedio, mismo criterio que "Sin iniciar" (que agrupa
  // 0 y null) — no hay avance registrado todavía, no un dato ausente a ignorar.
  const avancePromedio = totalObras > 0 ? obrasFiltradas.reduce((sum, g) => sum + (g.avance ?? 0), 0) / totalObras : 0;
  const finalizadas = obrasFiltradas.filter((g) => (g.avance ?? 0) >= UMBRAL_OBRA_FINALIZADA).length;
  const sinIniciar = obrasFiltradas.filter((g) => g.avance == null || g.avance === 0).length;
  // Separados en primarios (búsqueda + Circuito + Barrio, siempre visibles) y
  // secundarios (detrás de "Más filtros") para poder avisar con un punto "•" en el
  // botón cuando hay un filtro secundario activo pero el panel está colapsado — si no,
  // un filtro escondido ahí atrás podría pasar desapercibido.
  const hayFiltrosSecundarios = !!(filtroReparticion || filtroAvance || filtroAptoDifusion || filtroEstadoRelevamiento || filtroPrioridad || filtroEnvioComunicacion);
  const hayFiltros = !!(busqueda || filtroCircuito || filtroBarrio) || hayFiltrosSecundarios;

  const limpiarFiltros = () => {
    setBusqueda(''); setFiltroCircuito(''); setFiltroBarrio(''); setFiltroReparticion(''); setFiltroAvance('');
    setFiltroAptoDifusion(''); setFiltroEstadoRelevamiento(''); setFiltroPrioridad(''); setFiltroEnvioComunicacion('');
  };

  // Calendario (antes exclusivo de "Planificación de comunicación"): mismas
  // obrasFiltradas que la tabla — un evento por cada fecha de agenda cargada
  // (fechaRelevamiento/fechaRodaje/fechaDisponibleInaugurar). obrasFiltradas ya está
  // deduplicada por id_obra, así que una obra multi-barrio nunca genera más de un
  // evento por tipo, sin importar cuántos id_registro/barrios tenga.
  const eventos = useMemo(() => {
    const lista = [];
    obrasFiltradas.forEach((g) => {
      TIPOS_EVENTO_AGENDA_OBRA.forEach((tipo) => {
        const fecha = parsearFechaAgendaObra(g[tipo.campo]);
        if (fecha) lista.push({ idObra: g.idObra, nombreObra: g.nombreObra, tipo, fecha });
      });
    });
    return lista;
  }, [obrasFiltradas]);

  const eventosPorDia = useMemo(() => {
    const mapa = new Map();
    eventos.forEach((ev) => {
      if (ev.fecha.getFullYear() !== anio || ev.fecha.getMonth() !== mes) return;
      const dia = ev.fecha.getDate();
      if (!mapa.has(dia)) mapa.set(dia, []);
      mapa.get(dia).push(ev);
    });
    return mapa;
  }, [eventos, anio, mes]);

  const grilla = useMemo(() => generarGrillaMesObra(anio, mes), [anio, mes]);
  const mesAnterior = () => { if (mes === 0) { setMes(11); setAnio(anio - 1); } else setMes(mes - 1); };
  const mesSiguiente = () => { if (mes === 11) { setMes(0); setAnio(anio + 1); } else setMes(mes + 1); };
  const hoy = new Date();
  const esHoy = (dia) => dia === hoy.getDate() && mes === hoy.getMonth() && anio === hoy.getFullYear();

  const estiloSelect = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer' };
  const estiloBuscador = { width: '100%', padding: '10px 14px', paddingLeft: '36px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ padding: '16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '14px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>OBRAS</h2>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '10px' }}>{obrasUnicas.length} obras │ Córdoba Capital</div>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <MetricCard label="Total de obras" value={totalObras.toLocaleString('es-AR')} subtitle={hayFiltros ? `de ${obrasUnicas.length}` : undefined} />
        <MetricCard label="Avance promedio" value={`${(avancePromedio * 100).toFixed(0)}%`} />
        <MetricCard label="Finalizadas" value={finalizadas.toLocaleString('es-AR')} subtitle={`≥ ${(UMBRAL_OBRA_FINALIZADA * 100).toFixed(0)}%`} />
        <MetricCard label="Sin iniciar" value={sinIniciar.toLocaleString('es-AR')} subtitle="0% o sin dato" />
      </div>

      <div style={{ padding: '14px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span>Filtros</span>
          <button onClick={() => setMostrarMasFiltros(v => !v)} style={{ padding: '4px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', backgroundColor: mostrarMasFiltros ? 'var(--bg-secondary)' : 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: hayFiltrosSecundarios ? 600 : 400 }}>
            {mostrarMasFiltros ? '▴ Menos filtros' : '▾ Más filtros'}{hayFiltrosSecundarios && !mostrarMasFiltros ? ' •' : ''}
          </button>
          {hayFiltros && <button onClick={limpiarFiltros} style={{ padding: '4px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕ Limpiar filtros</button>}
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '2 1 240px', minWidth: '200px' }}>
            <input type="text" placeholder="Buscar obra por nombre..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={estiloBuscador} />
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: '13px', pointerEvents: 'none' }}>🔍</span>
          </div>
          <select value={filtroCircuito} onChange={(e) => setFiltroCircuito(e.target.value)} style={estiloSelect}>
            <option value="">Circuito (todos)</option>
            {opcionesCircuito.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtroBarrio} onChange={(e) => setFiltroBarrio(e.target.value)} style={estiloSelect}>
            <option value="">Barrio (todos)</option>
            {opcionesBarrio.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        {/* "Más filtros": los 6 que antes vivían repartidos entre las dos solapas —
            siguen filtrando la MISMA tabla/calendario de abajo aunque estén colapsados
            (no se limpian al ocultar el panel), así un filtro seteado y luego escondido
            no deja de aplicarse en silencio. */}
        {mostrarMasFiltros && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
            <select value={filtroReparticion} onChange={(e) => setFiltroReparticion(e.target.value)} style={estiloSelect}>
              <option value="">Repartición (todas)</option>
              {opcionesReparticion.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={filtroAvance} onChange={(e) => setFiltroAvance(e.target.value)} style={estiloSelect}>
              <option value="">Avance (todos)</option>
              {RANGOS_AVANCE_OBRA.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <select value={filtroAptoDifusion} onChange={(e) => setFiltroAptoDifusion(e.target.value)} style={estiloSelect}>
              <option value="">Apto difusión (todos)</option>
              {opcionesAptoDifusion.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filtroEstadoRelevamiento} onChange={(e) => setFiltroEstadoRelevamiento(e.target.value)} style={estiloSelect}>
              <option value="">Estado de relevamiento (todos)</option>
              {opcionesEstadoRelevamiento.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value)} style={estiloSelect}>
              <option value="">Prioridad (todas)</option>
              {opcionesPrioridad.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filtroEnvioComunicacion} onChange={(e) => setFiltroEnvioComunicacion(e.target.value)} style={estiloSelect}>
              <option value="">Envío a Comunicación p/relevamiento (todos)</option>
              {opcionesEnvioComunicacion.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{hayFiltros ? `Mostrando ${obrasFiltradas.length} de ${obrasUnicas.length} obras` : `Todas las obras (${obrasUnicas.length})`}</span>
        <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', padding: '3px' }}>
          <button onClick={() => setModo('tabla')} style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', backgroundColor: modo === 'tabla' ? '#1976D2' : 'transparent', color: modo === 'tabla' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>📋 Tabla</button>
          <button onClick={() => setModo('calendario')} style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', backgroundColor: modo === 'calendario' ? '#1976D2' : 'transparent', color: modo === 'calendario' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>📅 Calendario</button>
        </div>
      </div>

      {modo === 'tabla' ? (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Click en columna para ordenar</span>
          </div>
          {/* overflowX: 14 columnas (antes 4 + 12 repartidas en dos tablas separadas)
              desbordan cualquier pantalla — scroll horizontal acá adentro en vez de
              romper el layout de la página, mismo criterio que ya usaba cada tabla por
              separado. */}
          <div style={{ maxHeight: '560px', overflow: 'auto' }}>
            <table style={{ width: '100%', minWidth: '1900px', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-secondary)' }}>
                <tr>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)', cursor: 'pointer' }} onClick={() => handleOrdenar('nombreObra')}>Obra {ordenColumna === 'nombreObra' && (ordenAsc ? '↑' : '↓')}</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Barrio / Circuito</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)', cursor: 'pointer' }} onClick={() => handleOrdenar('reparticion')}>Repartición {ordenColumna === 'reparticion' && (ordenAsc ? '↑' : '↓')}</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)', cursor: 'pointer' }} onClick={() => handleOrdenar('avance')}>Avance {ordenColumna === 'avance' && (ordenAsc ? '↑' : '↓')}</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Tipo de obra</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)', minWidth: '220px' }}>Reseña</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Apto difusión</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Estado de relevamiento</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)', minWidth: '200px' }}>Comentarios s/relevamiento territorial</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Disp. inaugurar</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Rodaje</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Estado producción piezas</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 500, color: 'var(--text-tertiary)' }}>Entrega material pauta Nico</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)' }}>Fecha pauta</th>
                </tr>
              </thead>
              <tbody>
                {obrasOrdenadas.map((g) => (
                  <tr
                    key={g.idObra}
                    onClick={() => onSelectObra(g.idObra)}
                    style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '10px 14px' }}>{g.nombreObra}</td>
                    <td style={{ padding: '10px 14px' }}><CeldaBarrioCircuitoObra grupo={g} /></td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{g.reparticion}</td>
                    <td style={{ padding: '10px 14px' }}><BarraAvanceObra avance={g.avance} /></td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{g.tipoObra || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{g.resenaObra || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>{g.aptoDifusion ? <BadgeComunicacionObra texto={g.aptoDifusion} color={COLOR_APTO_DIFUSION_OBRA[g.aptoDifusion] || '#78909C'} /> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                    <td style={{ padding: '10px 14px' }}>{g.estadoRelevamiento ? <BadgeComunicacionObra texto={g.estadoRelevamiento} color={COLOR_ESTADO_RELEVAMIENTO_OBRA[g.estadoRelevamiento] || '#78909C'} /> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{g.comentariosRelevamientoTerritorial || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{g.fechaDisponibleInaugurar ? formatearFecha(g.fechaDisponibleInaugurar) : '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{g.fechaRodaje ? formatearFecha(g.fechaRodaje) : '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{g.estadoProduccionPiezas || '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {g.entregaMaterialPautaNico ? (
                        esURLValida(g.entregaMaterialPautaNico)
                          ? <a href={g.entregaMaterialPautaNico} target="_blank" rel="noopener noreferrer" title="Ver material de pauta" onClick={(e) => e.stopPropagation()} style={{ fontSize: '14px', textDecoration: 'none' }}>🔗</a>
                          : <span title={g.entregaMaterialPautaNico} style={{ color: 'var(--text-tertiary)' }}>🔗</span>
                      ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{g.fechaPauta ? formatearFecha(g.fechaPauta) : '—'}</td>
                  </tr>
                ))}
                {obrasOrdenadas.length === 0 && (
                  <tr><td colSpan={14} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>{busqueda ? `Sin resultados para "${busqueda}".` : 'Ninguna obra coincide con los filtros elegidos.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <button onClick={mesAnterior} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>← Mes anterior</button>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{NOMBRES_MES_OBRA[mes]} {anio}</div>
            <button onClick={mesSiguiente} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>Mes siguiente →</button>
          </div>

          {obrasFiltradas.length === 0 ? (
            // Ninguna obra matchea filtros/búsqueda — distinto de "hay obras pero
            // ninguna tiene evento este mes" (eso es normal, no es un estado vacío:
            // el grid simplemente no muestra puntos ese mes, ver eventosPorDia).
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
              {busqueda ? `Sin resultados para "${busqueda}".` : 'Ninguna obra coincide con los filtros elegidos.'}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '14px', marginBottom: '14px', flexWrap: 'wrap' }}>
                {TIPOS_EVENTO_AGENDA_OBRA.map((t) => (
                  <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: t.color, flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{t.label}</span>
                  </div>
                ))}
              </div>

              {/* overflowX: 7 columnas de calendario desbordan en tablet — scroll
                  horizontal acá adentro en vez de romper el layout de la página. */}
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', backgroundColor: 'var(--border)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', minWidth: '560px' }}>
                  {DIAS_SEMANA_CORTOS_OBRA.map((d, i) => (
                    <div key={i} style={{ padding: '8px', textAlign: 'center', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-secondary)' }}>{d}</div>
                  ))}
                  {grilla.map((dia, i) => (
                    <div key={i} style={{ minHeight: '76px', padding: '6px', backgroundColor: dia && esHoy(dia) ? '#1976D210' : '#fff', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {dia && (
                        <>
                          <span style={{ fontSize: '11px', fontWeight: esHoy(dia) ? 700 : 500, color: esHoy(dia) ? '#1976D2' : 'var(--text-tertiary)' }}>{dia}</span>
                          {(eventosPorDia.get(dia) || []).map((ev, j) => (
                            // <button>, no <div onClick>: foco de teclado + Enter/Space
                            // funcionan nativos (globals.css ya define el anillo de foco
                            // para <button>, sin CSS aparte acá).
                            <button
                              key={j}
                              type="button"
                              onClick={() => onSelectObra(ev.idObra)}
                              title={`${ev.tipo.label}: ${ev.nombreObra}`}
                              style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: '10px', padding: '2px 5px', borderRadius: '4px', border: 'none', backgroundColor: `${ev.tipo.color}22`, color: ev.tipo.color, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, fontFamily: 'inherit' }}
                            >
                              {ev.nombreObra}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// FICHA DE OBRA (Vista Obras, Etapa 2 — detalle completo + navegación cruzada)
// ============================================
// Componente nuevo, no una extensión de ModalObra (que sigue siendo el modal liviano
// del mapa — mismo shell visual de overlay a propósito, pero sin compartir código, ver
// "Qué NO hacer" del prompt de Etapa 2). Agrupa TODOS los id_registro que comparten un
// mismo id_obra (multi-barrio), usando obrasEnriquecidas (no obrasData crudo) porque
// necesita _circuitoMapkey/_circuitoNombre para el chip de circuito.

function esURLValida(s) {
  if (!s) return false;
  try { new URL(s); return true; } catch { return false; }
}

const COLOR_PRIORIDAD_OBRA = { 'Alta': '#EF5350', 'Media': '#FFA726', 'Baja': '#78909C' };

const BadgeSimpleObra = ({ texto, color = '#5C6BC0' }) => (
  <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', backgroundColor: `${color}22`, color, whiteSpace: 'nowrap' }}>{texto}</span>
);

// No se renderiza si el valor viene vacío/null — con 20+ campos posibles en una obra,
// una ficha con "Sin dato" en cada campo ausente es peor que una ficha corta con lo
// que sí hay (ver Etapa 2 del prompt, Paso 2).
const FilaDetalleObra = ({ label, valor }) => {
  if (valor == null || valor === '') return null;
  return (
    <div style={{ display: 'flex', gap: '10px', fontSize: '12px' }}>
      <span style={{ color: 'var(--text-tertiary)', minWidth: '170px', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{valor}</span>
    </div>
  );
};

const SeccionFicha = ({ titulo, children }) => (
  <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid var(--border)' }}>
    <h4 style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '12px' }}>{titulo}</h4>
    {children}
  </div>
);

// <button>, no <span onClick>: foco de teclado + Enter/Space funcionan nativos
// (globals.css ya define el anillo de foco para <button>, sin CSS aparte acá) — ver
// Etapa 4, Paso 3.4.
const ChipUbicacion = ({ label, onClick }) => (
  <button type="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 12px', borderRadius: '999px', border: 'none', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>
);

// Lista de chips con "+N más" que EXPANDE INLINE (no abre otro modal — evitar apilar
// overlays, ver Etapa 2 del prompt Paso 2.3) en vez de mostrar todos de entrada.
const ListaChipsUbicacion = ({ items, onSelectItem, limite = 4 }) => {
  const [expandido, setExpandido] = useState(false);
  const visibles = expandido ? items : items.slice(0, limite);
  const restantes = items.length - limite;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {visibles.map((item) => <ChipUbicacion key={item.valor} label={item.label} onClick={() => onSelectItem(item)} />)}
      {!expandido && restantes > 0 && (
        <button type="button" onClick={() => setExpandido(true)} style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 12px', borderRadius: '999px', backgroundColor: 'transparent', border: '1px dashed var(--border)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>+{restantes} más</button>
      )}
    </div>
  );
};

// Popup chico de confirmación antes de navegar a la ficha de un barrio/circuito —
// reusable a propósito (no exclusivo de FichaObra, pensado para engancharse en otros
// lugares del tablero más adelante, ver Etapa 2 del prompt Paso 3). Sin preview de
// contenido: solo confirma la intención de navegar. stopPropagation en el backdrop
// propio para no dispararle el onClick=onClose del overlay que lo contenga (FichaObra
// u otro) cuando este popup se usa apilado sobre otro overlay.
const PopupNavegacionCruzada = ({ tipo, nombre, onConfirmar, onCancelar }) => {
  const overlayRef = useFocusTrap(true);
  useEffect(() => {
    const handleEscape = (e) => { if (e.key === 'Escape') onCancelar(); };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onCancelar]);
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }} onClick={(e) => { e.stopPropagation(); onCancelar(); }}>
      <div ref={overlayRef} tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', maxWidth: '320px', width: '100%', margin: '20px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '20px' }}>
          Ir a la ficha de {tipo === 'barrio' ? 'barrio' : 'circuito'} <strong>{nombre}</strong> →
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={onCancelar} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={onConfirmar} style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#1976D2', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Confirmar</button>
        </div>
      </div>
    </div>
  );
};

const FichaObra = ({ idObra, obrasEnriquecidas, onClose, onIrABarrio, onIrACircuito }) => {
  const [popupNav, setPopupNav] = useState(null); // { tipo: 'barrio'|'circuito', nombre, valor } | null
  const overlayRef = useFocusTrap(true);

  // Todos los id_registro que comparten este id_obra (multi-barrio incluido).
  const registros = useMemo(
    () => (obrasEnriquecidas || []).filter((o) => idObraDeRegistro(o.id_registro) === idObra),
    [obrasEnriquecidas, idObra]
  );
  const principal = registros[0];

  const barriosUnicos = useMemo(() => Array.from(new Set(registros.map((r) => r.barrio).filter(Boolean))), [registros]);
  // Mapkey -> nombre legible (sin el prefijo de Mapkey), deduplicado — varios barrios
  // de una misma obra pueden caer en el mismo circuito.
  const circuitosUnicos = useMemo(() => {
    const vistos = new Map();
    registros.forEach((r) => {
      if (r._circuitoMapkey && !vistos.has(r._circuitoMapkey)) {
        vistos.set(r._circuitoMapkey, r._circuitoNombre ? r._circuitoNombre.split(' - ').slice(1).join(' - ') : r._circuitoMapkey);
      }
    });
    return vistos;
  }, [registros]);

  // Escape cierra el popup de navegación si está abierto, si no cierra la ficha.
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key !== 'Escape') return;
      if (popupNav) setPopupNav(null); else onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, popupNav]);

  if (!principal) return null;

  const avance = normalizarAvanceObra(principal.porcentaje_avance);
  const requiereAuditoria = registros.some((r) => r.requiere_auditoria);
  const obraConAuditoria = registros.find((r) => r.requiere_auditoria);
  const notaUbicacion = (barriosUnicos.length === 0 && circuitosUnicos.size === 0) ? NOTA_TIPO_UBICACION[principal.tipo_ubicacion] : null;

  const confirmarNav = () => {
    if (!popupNav) return;
    if (popupNav.tipo === 'barrio') onIrABarrio(popupNav.valor); else onIrACircuito(popupNav.valor);
    setPopupNav(null);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={onClose}>
      <div ref={overlayRef} tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '28px', maxWidth: '640px', width: '100%', maxHeight: '85vh', overflowY: 'auto', margin: '20px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>{principal.nombre_obra || '(sin nombre)'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '19px', cursor: 'pointer', color: '#666', flexShrink: 0 }}>×</button>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          {(principal.reparticion || '').trim() || '—'}{principal.sub_reparticion?.trim() ? ` · ${principal.sub_reparticion.trim()}` : ''}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
          {principal.prioridad && <BadgeSimpleObra texto={`Prioridad: ${principal.prioridad}`} color={COLOR_PRIORIDAD_OBRA[principal.prioridad] || '#78909C'} />}
          {principal.apto_difusion && <BadgeSimpleObra texto={`Apto difusión: ${principal.apto_difusion}`} color="#5C6BC0" />}
          {requiereAuditoria && <BadgeAuditoriaObra obra={obraConAuditoria} />}
        </div>

        <SeccionFicha titulo="Avance">
          <BarraAvanceObra avance={avance} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '10px' }}>
            <FilaDetalleObra label="Inicio" valor={principal.fecha_inicio ? formatearFecha(principal.fecha_inicio) : null} />
            <FilaDetalleObra label="Finalización" valor={principal.fecha_finalizacion ? formatearFecha(principal.fecha_finalizacion) : null} />
            <FilaDetalleObra label="Disponible para inaugurar" valor={principal.fecha_disponible_inaugurar ? formatearFecha(principal.fecha_disponible_inaugurar) : null} />
          </div>
        </SeccionFicha>

        {(barriosUnicos.length > 0 || circuitosUnicos.size > 0 || notaUbicacion) && (
          <SeccionFicha titulo="Ubicación">
            {barriosUnicos.length > 0 && (
              <div style={{ marginBottom: circuitosUnicos.size > 0 ? '14px' : 0 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Barrios afectados ({barriosUnicos.length})</div>
                <ListaChipsUbicacion items={barriosUnicos.map((b) => ({ valor: b, label: b }))} onSelectItem={(item) => setPopupNav({ tipo: 'barrio', nombre: item.label, valor: item.valor })} />
              </div>
            )}
            {circuitosUnicos.size > 0 && (
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Circuitos ({circuitosUnicos.size})</div>
                <ListaChipsUbicacion items={Array.from(circuitosUnicos.entries()).map(([mapkey, nombre]) => ({ valor: mapkey, label: nombre }))} onSelectItem={(item) => setPopupNav({ tipo: 'circuito', nombre: item.label, valor: item.valor })} />
              </div>
            )}
            {notaUbicacion && <div style={{ fontSize: '12px', color: '#F57F17', fontWeight: 600, marginTop: barriosUnicos.length || circuitosUnicos.size ? '10px' : 0 }}>{notaUbicacion}</div>}
          </SeccionFicha>
        )}

        {(principal.descripcion || principal.tipo_obra || principal.nombre_plan) && (
          <SeccionFicha titulo="Descripción">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <FilaDetalleObra label="Tipo de obra" valor={principal.tipo_obra} />
              <FilaDetalleObra label="Plan" valor={principal.nombre_plan} />
            </div>
            {principal.descripcion && <p style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '8px', lineHeight: 1.5 }}>{principal.descripcion}</p>}
          </SeccionFicha>
        )}

        {(principal.estado_relevamiento || principal.fecha_relevamiento || principal.observaciones_relevamiento || principal.fecha_rodaje || principal.apto_difusion || principal.entrega_material_pauta_nico || principal.fecha_pauta || principal.comentarios_relevamiento_territorial || principal.estado_produccion_piezas || principal.envio_comunicacion_relevamiento) && (
          <SeccionFicha titulo="Comunicación">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <FilaDetalleObra label="Estado de relevamiento" valor={principal.estado_relevamiento?.trim()} />
              <FilaDetalleObra label="Fecha de relevamiento" valor={principal.fecha_relevamiento ? formatearFecha(principal.fecha_relevamiento) : null} />
              <FilaDetalleObra label="Observaciones de relevamiento" valor={principal.observaciones_relevamiento} />
              <FilaDetalleObra label="Comentarios s/relevamiento territorial" valor={principal.comentarios_relevamiento_territorial} />
              <FilaDetalleObra label="Envío a Comunicación p/relevamiento" valor={principal.envio_comunicacion_relevamiento} />
              <FilaDetalleObra label="Fecha de rodaje" valor={principal.fecha_rodaje ? formatearFecha(principal.fecha_rodaje) : null} />
              <FilaDetalleObra label="Apto para difusión" valor={principal.apto_difusion} />
              <FilaDetalleObra label="Estado producción de piezas" valor={principal.estado_produccion_piezas} />
              <FilaDetalleObra
                label="Material de pauta"
                valor={principal.entrega_material_pauta_nico
                  ? (esURLValida(principal.entrega_material_pauta_nico)
                    ? <a href={principal.entrega_material_pauta_nico} target="_blank" rel="noopener noreferrer" style={{ color: '#1976D2' }}>Ver material →</a>
                    : principal.entrega_material_pauta_nico)
                  : null}
              />
              <FilaDetalleObra label="Fecha de pauta" valor={principal.fecha_pauta ? formatearFecha(principal.fecha_pauta) : null} />
            </div>
          </SeccionFicha>
        )}

        {(principal.link_memoria_descriptiva || principal.geolocalizacion_original) && (
          <SeccionFicha titulo="Enlaces">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <FilaDetalleObra
                label="Memoria descriptiva"
                valor={principal.link_memoria_descriptiva
                  ? (esURLValida(principal.link_memoria_descriptiva)
                    ? <a href={principal.link_memoria_descriptiva} target="_blank" rel="noopener noreferrer" style={{ color: '#1976D2' }}>Ver documento →</a>
                    : principal.link_memoria_descriptiva)
                  : null}
              />
              <FilaDetalleObra
                label="Geolocalización (original)"
                valor={principal.geolocalizacion_original
                  ? (esURLValida(principal.geolocalizacion_original)
                    ? <a href={principal.geolocalizacion_original} target="_blank" rel="noopener noreferrer" style={{ color: '#1976D2' }}>Ver mapa →</a>
                    : principal.geolocalizacion_original)
                  : null}
              />
            </div>
          </SeccionFicha>
        )}

        {principal.responsable_obra && (
          <div>
            <h4 style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Responsable</h4>
            <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{principal.responsable_obra}</div>
          </div>
        )}
      </div>

      {popupNav && (
        <PopupNavegacionCruzada tipo={popupNav.tipo} nombre={popupNav.nombre} onConfirmar={confirmarNav} onCancelar={() => setPopupNav(null)} />
      )}
    </div>
  );
};

// ============================================
// PLANIFICACIÓN DE COMUNICACIÓN (Vista Obras, Etapa 3 — tabla + calendario)
// ============================================
// Fechas de AGENDA (van al calendario: alguien tiene que estar en un lugar en un
// momento) vs. fechas de PROCESO (fecha_inicio/fecha_finalizacion/fecha_pauta, quedan
// SOLO en la tabla) — distinción explícita del prompt de Etapa 3, no todas las fechas
// de una obra son "eventos" de agenda.
const TIPOS_EVENTO_AGENDA_OBRA = [
  { key: 'relevamiento', campo: 'fechaRelevamiento', label: 'Relevamiento', color: '#5C6BC0' },
  { key: 'rodaje', campo: 'fechaRodaje', label: 'Rodaje', color: '#FFA726' },
  { key: 'inauguracion', campo: 'fechaDisponibleInaugurar', label: 'Disponible para inaugurar', color: '#2E7D32' },
];

const COLOR_APTO_DIFUSION_OBRA = { 'Sí': '#2E7D32', 'No': '#C62828', 'Sin iniciar': '#78909C' };
const COLOR_ESTADO_RELEVAMIENTO_OBRA = { 'Relevado': '#2E7D32', 'En proceso': '#FFA726', 'Revisar Prioridad': '#EF5350', 'Sin Iniciar': '#78909C' };

// Mismo criterio que parsearFechaISO en components/MapaCircuitos.js (duplicado a
// propósito, mismo motivo que el resto de los helpers de fecha entre archivos): toma
// el prefijo YYYY-MM-DD y arma un Date en horario LOCAL (no UTC), para que una fecha
// tipo "2026-08-05" no se corra un día para atrás en husos horarios negativos como
// Argentina (new Date("2026-08-05") sí lo haría, al interpretarse como UTC medianoche).
function parsearFechaAgendaObra(fechaStr) {
  if (!fechaStr || typeof fechaStr !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaStr);
  if (!match) return null;
  const [, y, m, d] = match;
  const fecha = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

const NOMBRES_MES_OBRA = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS_SEMANA_CORTOS_OBRA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// Grilla de un mes (lunes primero, como el resto de calendarios en español): null de
// relleno antes del día 1 y después del último día, hasta completar filas de 7.
function generarGrillaMesObra(anio, mes) {
  const primerDia = new Date(anio, mes, 1);
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const offsetInicio = (primerDia.getDay() + 6) % 7; // getDay(): 0=domingo..6=sábado -> acá 0=lunes..6=domingo
  const dias = [];
  for (let i = 0; i < offsetInicio; i++) dias.push(null);
  for (let d = 1; d <= diasEnMes; d++) dias.push(d);
  while (dias.length % 7 !== 0) dias.push(null);
  return dias;
}

// Badge denso para celda de tabla — mismo criterio de tamaño que el badge de estado
// que ya usaba FilaObra (más chico que BadgeSimpleObra de FichaObra, pensado para un
// header de ficha, no para una tabla densa).
const BadgeComunicacionObra = ({ texto, color }) => (
  <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '5px', backgroundColor: `${color}22`, color, whiteSpace: 'nowrap' }}>{texto}</span>
);


// ============================================
// PANEL LATERAL (VISTA MAPA)
// ============================================
const MetricCardMini = ({ label, value, subtitle, trend, trendPositive }) => (
  <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
      {subtitle && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{subtitle}</span>}
    </div>
    {trend && <div style={{ marginTop: '3px', fontSize: '11px', color: trendPositive ? '#2E7D32' : '#C62828', fontWeight: 500 }}>{trendPositive ? '▲' : '▼'} {trend}</div>}
  </div>
);

const BadgeCobertura = ({ encuestado }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '6px', backgroundColor: encuestado ? '#4CAF5022' : 'var(--bg-secondary)', color: encuestado ? '#2E7D32' : 'var(--text-tertiary)', fontSize: '11px', fontWeight: 600 }}>
    {encuestado ? '✓ Encuestado' : '○ Sin encuestar'}
  </span>
);

const ResumenCircuitoMini = ({ datos, padronTotal, encuestasData }) => {
  if (!datos) {
    return <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin circuito asociado.</div>;
  }
  const pctPadron = padronTotal > 0 ? ((datos.Padron_G23 / padronTotal) * 100).toFixed(1) : 0;
  const cobertura = coberturaDesdeEncuesta(encuestasData, datos.CircuitoKey);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Circuito {datos.CircuitoKey}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{datos.cirn_nom}</div>
      </div>
      <Badge categoria={datos.Categoria_v4} tipo="v4" />
      <MetricCardMini label={<>Padrón electoral (circuito) <InfoTip texto="Personas habilitadas para votar en este circuito según el padrón electoral 2023." /></>} value={datos.Padron_G23?.toLocaleString() || '—'} subtitle={`${pctPadron}% Capital`} />
      <MetricCardMini label="Participación G23" value={formatPct(datos.Turnout_G23)} trend={`${formatPP(datos.Turnout_G23 - 0.67)} vs Capital`} trendPositive={(datos.Turnout_G23 - 0.67) > 0} />
      <MetricCardMini label="Tendencia Gob. 19→23" value={formatPP(datos.Residual_Gov)} trendPositive={datos.Residual_Gov >= 0} />
      {encuestasData && (
        <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Cobertura de encuesta</div>
          <BadgeCobertura encuestado={!!cobertura?.encuestado} />
          {cobertura?.encuestado && (
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>
              {cobertura.cantidad_rondas} ronda{cobertura.cantidad_rondas !== 1 ? 's' : ''}: {(cobertura.fechas_rondas || []).map(formatearFecha).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// `actual`: resalta la fila del barrio actualmente seleccionado (barrioSeleccionado) en
// vez de excluirla de la lista — así el usuario ve dónde está parado sin que ese barrio
// desaparezca del listado (ver comentario en PanelMiniCircuito).
const FilaCruce = ({ label, sublabel, onClick, actual }) => (
  <div
    onClick={onClick}
    style={{
      padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px',
      backgroundColor: actual ? '#1976D218' : 'var(--bg-secondary)',
      border: actual ? '1px solid #1976D2' : '1px solid transparent',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
      {actual && <span style={{ fontSize: '9px', fontWeight: 600, color: '#1976D2', backgroundColor: '#1976D222', padding: '1px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>BARRIO ACTUAL</span>}
    </div>
    {sublabel && <div style={{ color: 'var(--text-tertiary)', marginTop: '1px' }}>{sublabel}</div>}
  </div>
);

const ListaCruceColapsable = ({ titulo, items }) => {
  if (!items || items.length === 0) return null;
  return (
    <details>
      <summary style={{ cursor: 'pointer', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500, padding: '4px 0' }}>{titulo} ({items.length})</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
        {items}
      </div>
    </details>
  );
};

// Gradiente secuencial de un solo tono (no diverging): a más % de peronismo, más intensidad
// del mismo rojo que ya usa COLORES_CATEGORIA.C ("Territorio hostil"), para mantener un único
// vocabulario de color en todo el tablero. El promedio de Capital se marca aparte (línea
// vertical), así que este color codifica solo la magnitud, no la comparación contra el promedio.
function colorPeronismo(pct) {
  const t = Math.max(0, Math.min(100, pct ?? 0)) / 100;
  const desde = { r: 255, g: 235, b: 238 }; // rojo muy pálido
  const hasta = { r: 183, g: 28, b: 28 };   // mismo rojo "text" de Categoria_v4 'C'
  const r = Math.round(desde.r + (hasta.r - desde.r) * t);
  const g = Math.round(desde.g + (hasta.g - desde.g) * t);
  const b = Math.round(desde.b + (hasta.b - desde.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

// Layout apilado (nombre+pct arriba, barra, detalle abajo) en vez de columnas de ancho
// fijo: este mismo componente se usa tanto en la solapa de ficha completa (ancha) como
// en PanelMiniBarrio (sidebar angosto, ~260px), y columnas fijas desbordarían ahí.
const FilaVotoEscuela = ({ escuela, promedioCapitalPct }) => {
  const pct = escuela.pct_peronismo;
  const anchoPct = Math.max(0, Math.min(100, pct ?? 0));
  const pendienteRevision = escuela.confianza === 'pendiente_revision';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
        <div title={escuela.nombre} style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pendienteRevision && <span title="Match pendiente de revisión, dato aproximado" style={{ color: '#F57F17' }}>⚠ </span>}
          {escuela.nombre}
        </div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>{pct != null ? `${pct.toFixed(1)}%` : '—'}</div>
      </div>
      <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '5px', height: '10px', position: 'relative', border: pendienteRevision ? '1px dashed #F57F17' : 'none' }}>
        <div style={{ width: `${anchoPct}%`, backgroundColor: colorPeronismo(pct), height: '100%', borderRadius: '4px' }} />
        {promedioCapitalPct != null && (
          <div
            title={`Promedio Capital: ${promedioCapitalPct}%`}
            style={{ position: 'absolute', left: `${Math.max(0, Math.min(100, promedioCapitalPct))}%`, top: '-2px', bottom: '-2px', width: '2px', backgroundColor: '#37474F' }}
          />
        )}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '3px' }}>
        {escuela.votos_validos?.toLocaleString() ?? '—'} votos · {escuela.n_mesas ?? '—'} mesas
      </div>
    </div>
  );
};

const ListaVotosEscuelas = ({ escuelas, promedioCapitalPct }) => {
  if (!escuelas || escuelas.length === 0) {
    return <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin centros de votación identificados.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      {promedioCapitalPct != null && (
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '2px', height: '11px', backgroundColor: '#37474F' }} /> Promedio Capital: {promedioCapitalPct}%
        </div>
      )}
      {escuelas.map(e => <FilaVotoEscuela key={e.cue} escuela={e} promedioCapitalPct={promedioCapitalPct} />)}
    </div>
  );
};

// ============================================
// OBRAS (obras_capital.json) — panel reusable, ver lib/obrasCercanas.js
// ============================================

// Badge de "requiere_auditoria" — propio de obras (el flag acá es "el lat/lon no cae
// en el polígono declarado", no una revisión editorial; Pauta ya no tiene este campo
// en el esquema campañas 2026). Título = observaciones_geo, la explicación puntual del desvío.
const BadgeAuditoriaObra = ({ obra }) => (
  <span title={obra.observaciones_geo || undefined} style={{ flexShrink: 0, fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '5px', backgroundColor: '#FBBF2422', color: '#B45309', whiteSpace: 'nowrap' }}>
    ⚠ Requiere auditoría
  </span>
);

// Nota de ubicación no exacta — cubre los 4 tipo_ubicacion que no son 'exacta'. Antes
// esto se resolvía con obra.fuente_barrio === 'cercano_aproximado' (campo que ya no
// existe en el esquema nuevo); tipo_ubicacion es el equivalente actual.
const NOTA_TIPO_UBICACION = {
  centroide_barrio: 'Ubicación aproximada (centroide del barrio, no la dirección exacta)',
  centroide_circuito: 'Ubicación aproximada (centroide del circuito, no la dirección exacta)',
  geometria_externa: 'Sin coordenada en el mapa — geometría cargada aparte (ver memoria descriptiva)',
  sin_geometria: 'Sin geometría disponible',
};

const FilaObra = ({ obra, onSelectObra }) => {
  const avance = normalizarAvanceObra(obra.porcentaje_avance);
  const estadoObra = estadoDerivadoObra(avance, obra.fecha_disponible_inaugurar);
  const colorEstado = estadoObra ? estadoObra.color : colorAvanceObra(avance);
  const notaUbicacion = NOTA_TIPO_UBICACION[obra.tipo_ubicacion];
  return (
    <div
      onClick={onSelectObra ? () => onSelectObra(obra) : undefined}
      style={{ padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px', cursor: onSelectObra ? 'pointer' : 'default' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{obra.nombre_obra || '(sin nombre)'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {obra.requiere_auditoria && <BadgeAuditoriaObra obra={obra} />}
          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '5px', backgroundColor: `${colorEstado}22`, color: colorEstado, whiteSpace: 'nowrap' }}>{estadoObra ? estadoObra.label : 'Sin dato'}</span>
        </div>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{obra.tipo_obra || '—'}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
        {obra.barrio || 'Sin barrio asignado'}{obra._circuitoNombre ? ` · ${obra._circuitoNombre}` : ' · Sin circuito derivado'}
      </div>
      {notaUbicacion && (
        <div style={{ fontSize: '11px', color: '#F57F17', fontWeight: 600 }}>{notaUbicacion}</div>
      )}
      {obra.prioridad && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Prioridad: {obra.prioridad}</div>}
      {(obra.fecha_inicio || obra.fecha_finalizacion) && (
        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
          {obra.fecha_inicio && <div>Inicio: {formatearFecha(obra.fecha_inicio)}</div>}
          {obra.fecha_finalizacion && <div>Finalización: {formatearFecha(obra.fecha_finalizacion)}</div>}
        </div>
      )}
      {obra.observaciones_obra && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{obra.observaciones_obra}</div>}
    </div>
  );
};

const ListaObras = ({ obras, vacio, onSelectObra }) => {
  const [filtroAvance, setFiltroAvance] = useState('');
  const rangosPresentes = RANGOS_AVANCE_OBRA.filter(r => obras.some(o => r.test((normalizarAvanceObra(o.porcentaje_avance) ?? 0) * 100)));
  const filtradas = filtroAvance
    ? obras.filter(o => RANGOS_AVANCE_OBRA.find(r => r.key === filtroAvance)?.test((normalizarAvanceObra(o.porcentaje_avance) ?? 0) * 100))
    : obras;

  if (!obras || obras.length === 0) {
    return <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{vacio}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {rangosPresentes.length > 1 && (
        <select value={filtroAvance} onChange={(e) => setFiltroAvance(e.target.value)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
          <option value="">Todos los avances ({obras.length})</option>
          {rangosPresentes.map(r => <option key={r.key} value={r.key}>{r.label} ({obras.filter(o => r.test((normalizarAvanceObra(o.porcentaje_avance) ?? 0) * 100)).length})</option>)}
        </select>
      )}
      {filtradas.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Ninguna obra en ese rango de avance.</div>
      ) : filtradas.map((o, i) => <FilaObra key={`${o.id_registro}-${i}`} obra={o} onSelectObra={onSelectObra} />)}
    </div>
  );
};

// Componente reusable (no atado a la solapa de circuito): recibe un barrio o un
// circuito y muestra dos secciones — obras propias (match directo por barrio/circuito
// derivado) y obras cercanas (radio 1.5km, lib/obrasCercanas.js). Pensado para
// reusarse tal cual dentro de la futura solapa unificada de barrio.
const ObrasPanel = ({ tipo, datosCircuito, nombreBarrio, obrasEnriquecidas, barriosGeoData, circuitosGeoJsonData, focoInicial = 'propio', onSelectObra }) => {
  const obrasPropias = useMemo(() => {
    if (tipo === 'circuito') {
      if (!datosCircuito) return [];
      return (obrasEnriquecidas || []).filter(o => o._circuitoMapkey === datosCircuito.Mapkey);
    }
    if (!nombreBarrio) return [];
    const key = normalizarNombreBarrio(nombreBarrio);
    return (obrasEnriquecidas || []).filter(o => normalizarNombreBarrio(o.barrio) === key);
  }, [tipo, datosCircuito, nombreBarrio, obrasEnriquecidas]);

  const obrasCercanas = useMemo(() => {
    // id_registro, no id (no existe en el esquema nuevo) — con `id` este Set quedaba
    // {undefined} y filtraba TODAS las cercanas apenas obrasPropias no estaba vacío.
    const idsPropias = new Set(obrasPropias.map(o => o.id_registro));
    let resultado = [];
    if (tipo === 'circuito' && datosCircuito) resultado = obrasCercanasACircuito(datosCircuito.Mapkey, circuitosGeoJsonData, obrasEnriquecidas);
    else if (tipo === 'barrio' && nombreBarrio) resultado = obrasCercanasABarrio(nombreBarrio, barriosGeoData, obrasEnriquecidas);
    return resultado.filter(o => !idsPropias.has(o.id_registro));
  }, [tipo, datosCircuito, nombreBarrio, obrasEnriquecidas, circuitosGeoJsonData, barriosGeoData, obrasPropias]);

  const tituloPropio = tipo === 'circuito' ? 'Obras en este circuito' : 'Obras en este barrio';
  const vacioPropio = tipo === 'circuito' ? 'Sin obras identificadas en este circuito.' : 'Sin obras identificadas en este barrio.';
  const tituloCercanas = `Obras cercanas, de otro ${tipo === 'circuito' ? 'circuito' : 'barrio'}`;

  const secciones = [
    { key: 'propio', titulo: tituloPropio, obras: obrasPropias, vacio: vacioPropio },
    { key: 'cercanas', titulo: tituloCercanas, obras: obrasCercanas, vacio: 'Sin obras cercanas dentro de 1,5 km.' },
  ];
  if (focoInicial === 'cercanas') secciones.reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {secciones.map(s => (
        <div key={s.key}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>{s.titulo} ({s.obras.length})</div>
          <ListaObras obras={s.obras} vacio={s.vacio} onSelectObra={onSelectObra} />
        </div>
      ))}
    </div>
  );
};

const BadgeObrasCercanas = ({ cantidad, onClick }) => (
  <span onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', backgroundColor: '#5C6BC018', color: '#3949AB', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
    🏗️ Obras cercanas ({cantidad})
  </span>
);

// Vista de obra individual, disparada desde cualquier FilaObra o desde el marker del
// mapa (ver onSelectObra en MapaCircuitos.js) — mismo patrón visual que InfoModal
// (overlay + card flotante). Las filas de "Obras cercanas a esta obra" son clickeables
// y vuelven a llamar a onSelectObra, para poder navegar de obra en obra sin cerrar.
const ModalObra = ({ obra, onClose, onSelectObra, obrasEnriquecidas }) => {
  const overlayRef = useFocusTrap(!!obra);
  if (!obra) return null;
  const avance = normalizarAvanceObra(obra.porcentaje_avance);
  const estadoObra = estadoDerivadoObra(avance, obra.fecha_disponible_inaugurar);
  const colorEstado = estadoObra ? estadoObra.color : colorAvanceObra(avance);
  const notaUbicacion = NOTA_TIPO_UBICACION[obra.tipo_ubicacion];
  const tieneCoordenadas = obra.lat != null && obra.lon != null;
  const cercanas = tieneCoordenadas ? obrasCercanasAObra(obra, obrasEnriquecidas, 1.5) : [];

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={onClose}>
      <div ref={overlayRef} tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '28px', maxWidth: '480px', width: '100%', maxHeight: '80vh', overflowY: 'auto', margin: '20px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '18px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>{obra.nombre_obra || '(sin nombre)'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '19px', cursor: 'pointer', color: '#666', flexShrink: 0 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{(obra.reparticion || '').trim() || '—'} · {obra.tipo_obra || '—'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignSelf: 'flex-start', fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', backgroundColor: `${colorEstado}22`, color: colorEstado }}>{estadoObra ? estadoObra.label : 'Sin dato de avance'}</span>
            {obra.requiere_auditoria && <BadgeAuditoriaObra obra={obra} />}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            {obra.barrio || 'Sin barrio asignado'}{obra._circuitoNombre ? ` · ${obra._circuitoNombre}` : ' · Sin circuito derivado'}
          </div>
          {notaUbicacion && (
            <div style={{ fontSize: '12px', color: '#F57F17', fontWeight: 600 }}>{notaUbicacion}</div>
          )}
          {obra.prioridad && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Prioridad: {obra.prioridad}</div>}
          {(obra.fecha_inicio || obra.fecha_finalizacion) && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {obra.fecha_inicio && <div>Inicio: {formatearFecha(obra.fecha_inicio)}</div>}
              {obra.fecha_finalizacion && <div>Finalización: {formatearFecha(obra.fecha_finalizacion)}</div>}
            </div>
          )}
          {obra.observaciones_obra && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{obra.observaciones_obra}</div>}
        </div>

        <div>
          <h4 style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', fontWeight: 500 }}>Obras cercanas a esta obra</h4>
          {!tieneCoordenadas ? (
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin coordenada propia — no se puede calcular cercanía.</div>
          ) : cercanas.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin obras cercanas dentro de 1,5 km.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {cercanas.map((o, i) => {
                const avanceOtra = normalizarAvanceObra(o.porcentaje_avance);
                const colorOtra = colorAvanceObra(avanceOtra);
                return (
                  <div
                    key={`${o.id_registro}-${i}`}
                    onClick={() => onSelectObra(o)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{o.nombre_obra || '(sin nombre)'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '5px', backgroundColor: `${colorOtra}22`, color: colorOtra }}>{avanceOtra != null ? `${(avanceOtra * 100).toFixed(0)}%` : 'Sin dato'}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{o.distanciaKm.toFixed(2)} km</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Diálogo unificado "Opciones de exportación" previo a exportar la ficha de un
// circuito: sección "Barrios" (qué barrios llevan su propia sección en el PDF,
// además del circuito que siempre se incluye) + sección "Encuestas" (qué rondas/vista
// de encuesta incluir — solo visible con 2+ rondas). Datos de barrios: mismos que la
// tabla "Barrios del circuito" de la solapa Territorio, ordenados por población (no
// por orden_importancia) y con el principal premarcado.
const DialogExportFicha = ({ datosCircuito, dialog, encuestaCircuito, onToggleBarrio, onSetModoEncuestas, onToggleRonda, onExportar, onCancelar }) => {
  const overlayRef = useFocusTrap(!!dialog);
  if (!dialog) return null;
  const { barrios, seleccionados, principalNorm, modoEncuestas, rondasSeleccionadas } = dialog;
  const cantidadBarrios = seleccionados.size;
  const textoBoton = cantidadBarrios === 0
    ? 'Exportar circuito'
    : `Exportar circuito + ${cantidadBarrios} barrio${cantidadBarrios !== 1 ? 's' : ''}`;
  const rondas = encuestaCircuito?.rondas || [];
  const mostrarSeccionEncuestas = rondas.length >= 2;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={onCancelar}>
      <div ref={overlayRef} tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', maxWidth: '480px', width: '100%', maxHeight: '84vh', overflowY: 'auto', margin: '20px', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>Opciones de exportación — Circuito {datosCircuito.CircuitoKey}</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '18px' }}>El circuito se incluye siempre en el PDF. Además, podés sumar la ficha completa de barrios específicos.</p>

        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Barrios</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Elegí qué barrios querés incluir con todo su detalle.</p>
          <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
            {barrios.length === 0 ? (
              <div style={{ padding: '14px', fontSize: '13px', color: 'var(--text-tertiary)' }}>Sin barrios registrados para este circuito.</div>
            ) : barrios.map((b, i) => {
              const esPrincipal = principalNorm != null && normalizarNombreBarrio(b.nombre) === principalNorm;
              return (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', fontSize: '13px', cursor: 'pointer', backgroundColor: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}>
                  <input type="checkbox" checked={seleccionados.has(b.nombre)} onChange={() => onToggleBarrio(b.nombre)} />
                  <span style={{ flex: 1, color: 'var(--text-primary)' }}>
                    {b.nombre}
                    {esPrincipal && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> (barrio principal)</span>}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{b.poblacion != null ? b.poblacion.toLocaleString() : '—'}</span>
                </label>
              );
            })}
          </div>
        </div>

        {mostrarSeccionEncuestas && (
          <div style={{ marginBottom: '8px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Encuestas</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>El circuito tiene {rondas.length} rondas. Elegí qué incluir en el PDF.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input type="radio" name="modoEncuestasExport" checked={modoEncuestas === 'ultima'} onChange={() => onSetModoEncuestas('ultima')} />
                Última ronda
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input type="radio" name="modoEncuestasExport" checked={modoEncuestas === 'elegir'} onChange={() => onSetModoEncuestas('elegir')} />
                Elegir rondas
              </label>
              {modoEncuestas === 'elegir' && (
                <div style={{ marginLeft: '24px', display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 0' }}>
                  {rondas.map((r, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={rondasSeleccionadas.has(i)} onChange={() => onToggleRonda(i)} />
                      {formatearFecha(r.fecha)}
                    </label>
                  ))}
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input type="radio" name="modoEncuestasExport" checked={modoEncuestas === 'comparativo'} onChange={() => onSetModoEncuestas('comparativo')} />
                Comparativo
              </label>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button onClick={onCancelar} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '13px', cursor: 'pointer', color: 'var(--text-secondary)' }}>Cancelar</button>
          <button onClick={onExportar} style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#1976D2', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>📄 {textoBoton}</button>
        </div>
      </div>
    </div>
  );
};

const PanelMiniCircuito = ({ datos, padronTotal, onVerFicha, cruceData, barriosGeoLookup, barrioSeleccionado, onSelectBarrio, encuestasData, obrasEnriquecidas, circuitosGeoJsonData }) => {
  if (!datos) {
    return <div style={{ padding: '16px 4px', fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>Hacé click en un circuito del mapa para ver su resumen.</div>;
  }
  const clave = `${datos.Mapkey} - ${datos.cirn_nom}`;
  const claveSel = barrioSeleccionado ? normalizarNombreBarrio(barrioSeleccionado) : null;
  // Lista COMPLETA de circuito_to_barrios[clave], sin excluir a barrioSeleccionado — antes
  // se lo sacaba de acá para no "repetirlo", pero barrioSeleccionado puede llegar por dos
  // caminos que no tienen relación entre sí (buscador → barrio con más población en este
  // circuito; click en el mapa → barrio geométrico bajo el punto clickeado), así que
  // excluirlo hacía desaparecer barrios reales de la lista según por dónde hubieras
  // entrado (ver [[tablero-electoral-barrioseleccionado-bug]]). Ahora se marca inline
  // (FilaCruce `actual`) en vez de ocultarse. Orden por `poblacion` (población que ese
  // barrio le aporta a ESTE circuito) en vez de `orden_importancia` — ese campo es el
  // ranking del barrio sobre sus PROPIOS circuitos, no un ranking dentro de este circuito
  // (mismo motivo que el fix de handleSelectCircuito, ver comentario ahí).
  const barriosDelCircuito = (cruceData?.circuito_to_barrios?.[clave] || [])
    .slice()
    .sort((a, b) => (b.poblacion || 0) - (a.poblacion || 0));
  const obrasCercanasCount = obrasEnriquecidas ? obrasCercanasACircuito(datos.Mapkey, circuitosGeoJsonData, obrasEnriquecidas).length : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <ResumenCircuitoMini datos={datos} padronTotal={padronTotal} encuestasData={encuestasData} />
      <button onClick={() => onVerFicha()} style={{ padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#1976D2', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Ver ficha completa →</button>
      {obrasEnriquecidas && <BadgeObrasCercanas cantidad={obrasCercanasCount} onClick={() => onVerFicha('territorio', 'cercanas')} />}
      <ListaCruceColapsable
        titulo="Barrios en este circuito"
        items={barriosDelCircuito.map((b, i) => (
          <FilaCruce
            key={i}
            label={b.barrio}
            sublabel={`${b.pct_poblacion_en_circuito?.toFixed(1)}% de ese barrio, en este circuito`}
            actual={claveSel != null && normalizarNombreBarrio(b.barrio_normalizado) === claveSel}
            onClick={() => {
              const key = normalizarNombreBarrio(b.barrio_normalizado);
              const feature = barriosGeoLookup[key];
              onSelectBarrio(feature ? feature.nombre_barrio : b.barrio_normalizado);
            }}
          />
        ))}
      />
    </div>
  );
};

const TIPO_VISITA_COLOR = {
  'TERRITORIAL': { bg: '#4CAF5022', text: '#2E7D32' },
  'INSTITUCIONAL': { bg: '#42A5F522', text: '#1565C0' },
  'NO HAY DATOS certeros': { bg: 'var(--bg-secondary)', text: 'var(--text-tertiary)' },
};

const PanelMiniBarrio = ({ nombreBarrio, barriosGeoLookup, todosLosDatos, datosCircuito, cruceData, onSelectCircuito, onVerFichaBarrio, onVerFichaCircuito, poblacionTotalPorBarrio, obrasEnriquecidas }) => {
  if (!nombreBarrio) {
    return <div style={{ padding: '16px 4px', fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>Hacé click en un barrio del mapa para ver su info.</div>;
  }
  const key = normalizarNombreBarrio(nombreBarrio);
  const props = barriosGeoLookup[key];
  if (!props) {
    return <div style={{ padding: '16px 4px', fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>Sin datos para "{nombreBarrio}".</div>;
  }
  const poblacionTotalBarrio = poblacionTotalPorBarrio?.[key];
  const listaCircuitos = cruceData?.barrio_to_circuitos?.[nombreBarrio];
  const claveSel = datosCircuito ? `${datosCircuito.Mapkey} - ${datosCircuito.cirn_nom}` : null;
  const otrosCircuitos = (listaCircuitos || [])
    .filter(c => c.circuito !== claveSel)
    .sort((a, b) => a.orden_importancia - b.orden_importancia);
  // barrio es la fuente de verdad: la lista de obras de este barrio se deriva acá en
  // runtime filtrando obras_capital.json (obrasEnriquecidas), NUNCA de una copia
  // estática — barrios_geo.json ya no trae `obras`/`cantidad_obras` embebidos (esa
  // copia había quedado desincronizada del pipeline nuevo). Mismo criterio de
  // normalización y de no deduplicar por id_obra que ya usa ObrasPanel para tipo="barrio".
  const obrasBarrio = (obrasEnriquecidas || []).filter(o => normalizarNombreBarrio(o.barrio) === key);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{nombreBarrio}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{props.tipo_barrio === 'BarrioOficial' ? 'Barrio oficial' : 'Barrio no oficial'}</div>
      </div>
      <MetricCardMini label={<>Población total (barrio) <InfoTip texto="Población total censada de este barrio (fuente: IDECOR/censo), no vinculada al padrón electoral." /></>} value={poblacionTotalBarrio != null ? poblacionTotalBarrio.toLocaleString() : '—'} subtitle={props.pct_poblacion_en_circuito != null ? `${props.pct_poblacion_en_circuito.toFixed(1)}% de este barrio está en este circuito` : undefined} />

      {/* Línea compacta, no la card completa del circuito (padrón/participación/
          tendencia/cobertura de encuesta vivían acá antes) — este panel es del barrio;
          los datos completos del circuito quedan a un click en "Ver ficha completa". */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px' }}>
        {datosCircuito ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>Circuito {datosCircuito.CircuitoKey} {datosCircuito.cirn_nom}</span>
              <Badge categoria={datosCircuito.Categoria_v4} tipo="v4" />
            </div>
            <button onClick={() => onVerFichaCircuito(datosCircuito)} style={{ alignSelf: 'flex-start', padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '11px', color: '#1976D2', cursor: 'pointer', fontWeight: 500 }}>Ver ficha completa →</button>
          </>
        ) : props.circuito_principal ? (
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{props.circuito_principal}</span>
        ) : (
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin circuito asociado.</span>
        )}
      </div>

      <button onClick={onVerFichaBarrio} style={{ padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#1976D2', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Ver ficha completa →</button>

      <ListaCruceColapsable
        titulo="Otros circuitos en este barrio"
        items={otrosCircuitos.map((c, i) => (
          <FilaCruce
            key={i}
            label={c.circuito.split(' - ').slice(1).join(' - ')}
            sublabel={`≈${c.pct_poblacion_en_circuito?.toFixed(1)}% de este barrio, en este circuito`}
            onClick={() => {
              const mapkeyClicked = c.circuito.split(' - ')[0].trim();
              const circuitoRecord = todosLosDatos.find(d => d.Mapkey === mapkeyClicked);
              if (circuitoRecord) onSelectCircuito(circuitoRecord.CircuitoKey);
            }}
          />
        ))}
      />

      {obrasBarrio.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>Obras ({obrasBarrio.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* Vista compacta (sidebar angosto): nombre + repartición + avance alcanza,
                el detalle completo (fechas, prioridad, auditoría, cercanas) vive en la
                solapa Obras de la ficha completa del barrio (SolapaObrasBarrio → ObrasPanel,
                a un click en "Ver ficha completa" de arriba). */}
            {obrasBarrio.map((o, i) => {
              const avance = normalizarAvanceObra(o.porcentaje_avance);
              const colorAvance = colorAvanceObra(avance);
              return (
                <div key={`${o.id_registro}-${i}`} style={{ padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{o.nombre_obra || '(sin nombre)'}</div>
                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '5px', backgroundColor: `${colorAvance}22`, color: colorAvance, whiteSpace: 'nowrap', flexShrink: 0 }}>{avance != null ? `${(avance * 100).toFixed(0)}%` : 'Sin dato'}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{(o.reparticion || '').trim() || '—'}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const PanelLateral = ({ panelTab, setPanelTab, datosCircuito, padronTotal, onVerFicha, onVerFichaBarrio, onVerFichaCircuito, barrioSeleccionado, barriosGeoLookup, todosLosDatos, cruceData, onSelectBarrio, onSelectCircuito, encuestasData, obrasEnriquecidas, circuitosGeoJsonData, poblacionTotalPorBarrio }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
      <button onClick={() => setPanelTab('circuito')} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', backgroundColor: panelTab === 'circuito' ? '#1976D2' : 'var(--bg-secondary)', color: panelTab === 'circuito' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Circuito</button>
      <button onClick={() => setPanelTab('barrio')} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', backgroundColor: panelTab === 'barrio' ? '#1976D2' : 'var(--bg-secondary)', color: panelTab === 'barrio' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Barrio</button>
    </div>
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {panelTab === 'circuito'
        ? <PanelMiniCircuito datos={datosCircuito} padronTotal={padronTotal} onVerFicha={onVerFicha} cruceData={cruceData} barriosGeoLookup={barriosGeoLookup} barrioSeleccionado={barrioSeleccionado} onSelectBarrio={onSelectBarrio} encuestasData={encuestasData} obrasEnriquecidas={obrasEnriquecidas} circuitosGeoJsonData={circuitosGeoJsonData} />
        : <PanelMiniBarrio nombreBarrio={barrioSeleccionado} barriosGeoLookup={barriosGeoLookup} todosLosDatos={todosLosDatos} datosCircuito={datosCircuito} cruceData={cruceData} onSelectCircuito={onSelectCircuito} onVerFichaBarrio={onVerFichaBarrio} onVerFichaCircuito={onVerFichaCircuito} poblacionTotalPorBarrio={poblacionTotalPorBarrio} obrasEnriquecidas={obrasEnriquecidas} />}
    </div>
  </div>
);

// ============================================
// BARRA DE COBERTURA DE ENCUESTA
// ============================================
const PillFiltro = ({ activo, color, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      padding: '5px 11px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
      border: `1px solid ${activo ? color : 'var(--border)'}`,
      backgroundColor: activo ? `${color}18` : 'transparent',
      color: activo ? color : 'var(--text-tertiary)',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </button>
);

// Agrupa eventos consecutivos del mismo circuito por tipo+fecha exacta (comparación de
// string directa, ya alcanza porque esFechaValida ya validó "YYYY-MM-DD" al construirlos)
// en un solo registro representativo (el primero del grupo, por orden cronológico) con
// _grupo = [todos los eventos agrupados, incluido el representante]. El orden de
// aparición sigue siendo el de "eventos" (ya viene ordenado por fecha desde
// construirEventosPorCircuito) — Map preserva el orden de primera aparición de cada
// clave tipo+fecha.
function agruparEventosPorFechaYTipo(eventos) {
  const indice = new Map();
  const grupos = [];
  eventos.forEach(e => {
    const clave = `${e.tipo}|${e.fecha}`;
    if (indice.has(clave)) {
      grupos[indice.get(clave)]._grupo.push(e);
    } else {
      indice.set(clave, grupos.length);
      grupos.push({ ...e, _grupo: [e] });
    }
  });
  return grupos;
}

// Detalle de UN evento individual (usado tanto para una celda sin agrupar como para
// cada entrada del tooltip de una celda agrupada) — mismo markup que ya mostraba
// CeldaEvento antes de agrupar, solo extraído para no duplicarlo por cada item del grupo.
const DetalleEventoCobertura = ({ evento }) => {
  if (evento.tipo === 'medicion') {
    return <div style={{ color: 'var(--text-secondary)' }}>Ronda {evento.detalle.ronda} de {evento.detalle.totalRondas}</div>;
  }
  if (evento.tipo === 'visita') {
    return (
      <>
        <div style={{ color: 'var(--text-secondary)', marginBottom: '2px' }}>Tipo: {evento.detalle.tipo_visita}</div>
        <div style={{ color: 'var(--text-secondary)', marginBottom: '6px' }}>Contacto con vecinos: {evento.detalle.contacto_vecinos}</div>
        {evento.detalle.info && <div style={{ color: 'var(--text-primary)', marginBottom: '6px' }}>{evento.detalle.info}</div>}
        {evento.detalle.link && <a href={evento.detalle.link} target="_blank" rel="noopener noreferrer" style={{ color: '#1976D2' }}>Ver nota →</a>}
      </>
    );
  }
  // observaciones NO se muestra acá (uso interno de auditoría, esquema campañas 2026).
  const etiquetas = etiquetasMetricasPauta(evento.detalle.plataforma);
  const m = evento.detalle.metricas_ejecutadas || {};
  const inactiva = estadoMostradoPauta(evento.detalle) === 'INACTIVO';
  return (
    <>
      <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginBottom: '2px' }}>
        {evento.detalle.titulo_pieza || '—'}
        {inactiva && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '5px', backgroundColor: '#9E9E9E22', color: '#757575' }}>Inactivo</span>}
      </div>
      <div style={{ color: 'var(--text-secondary)', marginBottom: '2px' }}>Barrio: {evento.detalle.barrio || 'Sin barrio asignado'}</div>
      <div style={{ color: 'var(--text-secondary)', marginBottom: '2px' }}>Vigencia: {formatearFecha(evento.detalle.inicio)} → {formatearFecha(evento.detalle.fin)}</div>
      <div style={{ color: 'var(--text-secondary)' }}>
        {etiquetas.alcance}: {m.alcance_o_visualizaciones != null ? m.alcance_o_visualizaciones.toLocaleString() : 's/d'}
        {m.frecuencia != null && ` · Frecuencia: ${typeof m.frecuencia === 'number' ? m.frecuencia.toFixed(2) : m.frecuencia}`}
      </div>
    </>
  );
};

// evento acá es siempre el representante de un grupo (_grupo con 1+ eventos, ver
// agruparEventosPorFechaYTipo) — onClick usa ese representante (el primero del grupo)
// como referencia de navegación, según lo pedido para celdas agrupadas.
const CeldaEvento = ({ evento, onClick }) => {
  const [hover, setHover] = useState(false);
  if (!evento) return <td style={{ padding: '4px', borderBottom: '1px solid var(--border)' }} />;
  const tipo = TIPOS_EVENTO_COBERTURA[evento.tipo];
  const grupo = evento._grupo || [evento];
  const esGrupo = grupo.length > 1;
  // Solo relevante para pauta: un circuito puede tocar varios barrios, así que una celda
  // agrupada de pauta puede mezclar eventos de barrios distintos — se avisa en el tooltip
  // porque el click sigue navegando a uno solo (el del evento representante).
  const barriosDistintos = evento.tipo === 'pauta' ? new Set(grupo.map(e => e.detalle.barrio)) : null;
  const etiqueta = `${tipo.label} · ${formatearFecha(evento.fecha)}${esGrupo ? ` (${grupo.length})` : ''}`;
  return (
    <td
      style={{ padding: '4px', borderBottom: '1px solid var(--border)', position: 'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        onClick={onClick}
        style={{ backgroundColor: tipo.bg, color: tipo.color, borderRadius: '6px', padding: '5px 8px', fontSize: '11px', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : 'default' }}
      >
        {etiqueta}
      </div>
      {hover && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 30, backgroundColor: '#fff', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.18)', minWidth: '220px', maxWidth: '280px', fontSize: '12px', marginTop: '4px' }}>
          <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>{etiqueta}</div>
          {grupo.map((e, i) => (
            <div key={i} style={i > 0 ? { borderTop: '1px solid #eee', marginTop: '6px', paddingTop: '6px' } : undefined}>
              <DetalleEventoCobertura evento={e} />
            </div>
          ))}
          {barriosDistintos && barriosDistintos.size > 1 && (
            <div style={{ marginTop: '6px', fontSize: '10px', fontWeight: 600, color: '#B45309' }}>⚠ Incluye pautas de distintos barrios — el click abre "{evento.detalle.barrio || 'Sin barrio asignado'}"</div>
          )}
        </div>
      )}
    </td>
  );
};

const TablaEventosCobertura = ({ datos, eventosPorCircuito, onClickVisita, onClickMedicion, onClickPauta }) => {
  const [tiposActivos, setTiposActivos] = useState({ medicion: true, visita: true, pauta: true });
  const [rangoSeleccionado, setRangoSeleccionado] = useState(null);
  const [orden, setOrden] = useState('id');
  const [busquedaCircuito, setBusquedaCircuito] = useState('');
  const [descargando, setDescargando] = useState(false);

  const toggleTipo = (tipo) => setTiposActivos(prev => ({ ...prev, [tipo]: !prev[tipo] }));

  const aniosDisponibles = useMemo(() => {
    const set = new Set();
    Object.values(eventosPorCircuito).forEach(lista => lista.forEach(e => set.add(e.fecha.slice(0, 4))));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [eventosPorCircuito]);

  const rangoEfectivo = rangoSeleccionado || aniosDisponibles[0] || 'todo';

  // Mismo criterio de normalización que normalizarNombreBarrio (mayúsculas + sin
  // tildes) ya usa en todo el proyecto para cruzar/comparar texto — se reaprovecha acá
  // para el buscador aunque el nombre del helper diga "Barrio", es genérico.
  const busquedaNormalizada = useMemo(() => normalizarNombreBarrio(busquedaCircuito), [busquedaCircuito]);

  const filas = useMemo(() => {
    return datos
      .filter(d => {
        if (!busquedaNormalizada) return true;
        return normalizarNombreBarrio(d.Mapkey).includes(busquedaNormalizada)
          || normalizarNombreBarrio(String(d.CircuitoKey ?? '')).includes(busquedaNormalizada)
          || normalizarNombreBarrio(d.cirn_nom).includes(busquedaNormalizada);
      })
      .map(d => {
        const eventosFiltrados = (eventosPorCircuito[d.Mapkey] || [])
          .filter(e => tiposActivos[e.tipo])
          .filter(e => rangoEfectivo === 'todo' || e.fecha.startsWith(rangoEfectivo));
        return { circuito: d, eventos: agruparEventosPorFechaYTipo(eventosFiltrados) };
      });
  }, [datos, eventosPorCircuito, tiposActivos, rangoEfectivo, busquedaNormalizada]);

  const filasOrdenadas = useMemo(() => {
    const copia = [...filas];
    if (orden === 'reciente') {
      copia.sort((a, b) => {
        const fa = a.eventos.length ? a.eventos[a.eventos.length - 1].fecha : '';
        const fb = b.eventos.length ? b.eventos[b.eventos.length - 1].fecha : '';
        return fb.localeCompare(fa);
      });
    } else {
      copia.sort((a, b) => compararMapkey(a.circuito.Mapkey, b.circuito.Mapkey));
    }
    return copia;
  }, [filas, orden]);

  // maxColumnas ya considera los eventos agrupados (eventos acá es el resultado de
  // agruparEventosPorFechaYTipo) — menos columnas que antes cuando hay agrupamientos.
  const maxColumnas = Math.max(1, ...filas.map(f => f.eventos.length));

  const descargarExcel = async () => {
    setDescargando(true);
    try {
      await descargarExcelEventos({ filas: filasOrdenadas, tiposEvento: TIPOS_EVENTO_COBERTURA });
    } catch (err) {
      console.error('Error generando Excel de eventos', err);
      alert('No se pudo generar el Excel.');
    } finally {
      setDescargando(false);
    }
  };

  const manejarClickEvento = (evento, circuito) => {
    if (evento.tipo === 'visita') onClickVisita(circuito.CircuitoKey);
    else if (evento.tipo === 'medicion') onClickMedicion(circuito.CircuitoKey, evento.fecha);
    // Pautas de circuitos_sin_barrio (barrio: null) no tienen ficha de barrio a la que
    // navegar — el click queda sin efecto para esas (el badge "Sin barrio asignado" del
    // tooltip ya avisa por qué).
    else if (evento.tipo === 'pauta' && evento.detalle.barrio) onClickPauta(evento.detalle.barrio);
  };

  return (
    <div style={{ padding: '14px' }}>
      <style>{`
        .fila-tabla-cobertura td { background-color: #fff; }
        .fila-tabla-cobertura:hover td { background-color: var(--bg-secondary); }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            value={busquedaCircuito}
            onChange={(e) => setBusquedaCircuito(e.target.value)}
            placeholder="Buscar circuito..."
            style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-primary)', backgroundColor: '#fff', width: '150px' }}
          />
          {Object.entries(TIPOS_EVENTO_COBERTURA).map(([key, tipo]) => (
            <PillFiltro key={key} activo={tiposActivos[key]} color={tipo.color} onClick={() => toggleTipo(key)}>
              {tiposActivos[key] ? '✓ ' : ''}{tipo.label}
            </PillFiltro>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          {aniosDisponibles.map(anio => (
            <PillFiltro key={anio} activo={rangoEfectivo === anio} color="#1976D2" onClick={() => setRangoSeleccionado(anio)}>
              {anio}
            </PillFiltro>
          ))}
          <PillFiltro activo={rangoEfectivo === 'todo'} color="#1976D2" onClick={() => setRangoSeleccionado('todo')}>
            Todo
          </PillFiltro>
          <select value={orden} onChange={(e) => setOrden(e.target.value)} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-secondary)', backgroundColor: '#fff' }}>
            <option value="id">Orden: ID circuito</option>
            <option value="reciente">Orden: más reciente</option>
          </select>
          <button onClick={descargarExcel} disabled={descargando} style={{ padding: '5px 11px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: '#fff', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', cursor: descargando ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
            {descargando ? 'Generando…' : '⬇ Descargar Excel'}
          </button>
        </div>
      </div>

      {filasOrdenadas.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', fontSize: '13px', color: 'var(--text-tertiary)', border: '1px solid var(--border)', borderRadius: '10px' }}>
          Sin resultados
        </div>
      ) : (
        <div style={{ overflow: 'auto', maxHeight: '420px', border: '1px solid var(--border)', borderRadius: '10px' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '12px', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 3, backgroundColor: '#fff', borderBottom: '1px solid var(--border)', padding: '8px 10px', textAlign: 'left', minWidth: '190px' }}>Circuito</th>
                {Array.from({ length: maxColumnas }).map((_, i) => (
                  <th key={i} style={{ position: 'sticky', top: 0, zIndex: 2, backgroundColor: '#fff', borderBottom: '1px solid var(--border)', padding: '8px 10px', fontWeight: 500, color: 'var(--text-tertiary)', minWidth: '120px' }}>
                    Evento {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filasOrdenadas.map(({ circuito, eventos }) => (
                <tr key={circuito.Mapkey} className="fila-tabla-cobertura">
                  <td style={{ position: 'sticky', left: 0, zIndex: 1, borderBottom: '1px solid var(--border)', padding: '8px 10px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {circuito.Mapkey} · {circuito.cirn_nom}
                  </td>
                  {Array.from({ length: maxColumnas }).map((_, i) => (
                    <CeldaEvento key={i} evento={eventos[i]} onClick={eventos[i] ? () => manejarClickEvento(eventos[i], circuito) : undefined} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const BarraCobertura = ({ resumen, datos, eventosPorCircuito, onClickVisita, onClickMedicion, onClickPauta }) => {
  const [expandida, setExpandida] = useState(false);
  const contenedorRef = useRef(null);

  // Cierra el panel "Ver detalle" con click afuera o Escape. El ref envuelve TODO el
  // componente (barra + panel), así que clicks en el botón toggle, filtros, buscador,
  // celdas o el scroll interno de la tabla quedan "adentro" y no disparan el cierre —
  // solo un click fuera de este contenedor cuenta como "afuera". Los listeners se
  // agregan/quitan según `expandida` (no quedan colgados cuando el panel está cerrado).
  useEffect(() => {
    if (!expandida) return;
    const handleClickAfuera = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setExpandida(false);
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setExpandida(false);
    };
    document.addEventListener('mousedown', handleClickAfuera);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickAfuera);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [expandida]);

  if (!resumen) return null;
  const pct = resumen.total > 0 ? Math.round((resumen.encuestados / resumen.total) * 100) : 0;

  return (
    <div ref={contenedorRef} style={{ position: 'relative', backgroundColor: '#fff', borderBottom: '1px solid var(--border)' }}>
      <div style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Cobertura de encuesta</span>
        <div style={{ flex: '0 1 220px', minWidth: '140px', height: '8px', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#4CAF50', borderRadius: '4px' }} />
        </div>
        <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>{resumen.encuestados} / {resumen.total} circuitos encuestados ({pct}%)</span>
        {resumen.fechaMasReciente && (
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Última ronda: {formatearFecha(resumen.fechaMasReciente)}</span>
        )}
        <button onClick={() => setExpandida(!expandida)} style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          Ver detalle {expandida ? '▲' : '▼'}
        </button>
      </div>
      {expandida && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid var(--border)', borderTop: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 900 }}>
          <TablaEventosCobertura
            datos={datos}
            eventosPorCircuito={eventosPorCircuito}
            onClickVisita={(c) => { onClickVisita(c); setExpandida(false); }}
            onClickMedicion={(c, f) => { onClickMedicion(c, f); setExpandida(false); }}
            onClickPauta={(b) => { onClickPauta(b); setExpandida(false); }}
          />
        </div>
      )}
    </div>
  );
};

// ============================================
// FUNCIÓN EXPORTAR FICHA PDF MEJORADA
// ============================================
// Escuelas queda afuera del PDF hasta que subamos la capa corregida — el código de
// las 2 secciones (circuito y barrio) ya está escrito y funcionando más abajo, envuelto
// en este flag. Reactivar = cambiar esto a true, no hace falta tocar nada más.
const INCLUIR_ESCUELAS_PDF = false;

// Filas de tabla compartidas entre la parte de circuito y la de barrio (mismos datos,
// mismo formato en los dos lugares).
function filaVotoEscuelaPDF(e) {
  return `<tr><td>${e.nombre}</td><td class="text-right">${e.pct_peronismo != null ? e.pct_peronismo.toFixed(1) + '%' : '—'}</td><td class="text-right">${e.votos_validos != null ? e.votos_validos.toLocaleString() : '—'}</td></tr>`;
}
function htmlEscuelasPDF(escuelas, promedioCapitalPct) {
  if (!escuelas || escuelas.length === 0) return `<p style="color:#999;font-size:12px">Sin centros de votación identificados.</p>`;
  return `<table><thead><tr><th>Escuela</th><th class="text-right">% Peronismo</th><th class="text-right">Votos válidos</th></tr></thead><tbody>${escuelas.map(filaVotoEscuelaPDF).join('')}</tbody></table>${promedioCapitalPct != null ? `<p style="font-size:11px;color:#666;margin-top:6px">Promedio Capital: ${promedioCapitalPct}%</p>` : ''}`;
}
function htmlVisitasPDF(visitas) {
  if (!visitas || visitas.length === 0) return `<p style="color:#999;font-size:12px">Sin visitas registradas.</p>`;
  return `<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Contacto vecinos</th><th>Detalle</th></tr></thead><tbody>${visitas.map(v => `<tr><td>${formatearFecha(v.fecha)}</td><td>${v.tipo_visita || '—'}</td><td>${v.contacto_vecinos || 'NO'}</td><td>${v.info || '—'}</td></tr>`).join('')}</tbody></table>`;
}
// Barrio principal hereda del circuito solo los eventos que le faltan (el circuito
// suma TODOS los barrios con orden_importancia:1, no solo este). Dedup por fecha+info.
function unificarVisitasPDF(visitasBarrio, visitasCircuito) {
  // Dedup sobre el conjunto combinado (no solo barrio-vs-extra): el circuito puede
  // traer el mismo evento repetido si dos barrios con orden_importancia:1 lo cargaron
  // cada uno por su cuenta (pasa con visitas que abarcan varios barrios a la vez).
  const claves = new Set();
  const resultado = [];
  [...(visitasBarrio || []), ...(visitasCircuito || [])].forEach(v => {
    const clave = `${v.fecha}|${v.info || ''}`;
    if (!claves.has(clave)) {
      claves.add(clave);
      resultado.push(v);
    }
  });
  return resultado.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
// Formatea un valor de metricas_ejecutadas para el PDF (string, no JSX): nunca
// "null"/"undefined"/"NaN" — "s/d" si el campo vino null.
function htmlMetricaPauta(valor, prefijo) {
  if (valor == null || Number.isNaN(valor)) return 's/d';
  return `${prefijo || ''}${valor.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
}
// material.link + redes_publicadas.ig/fb/yt: enlaces individuales, solo los que no son
// null. "Sin material disponible" si no hay ninguno.
function htmlMaterialPauta(material) {
  const redes = material?.redes_publicadas || {};
  const links = [
    material?.link ? { label: 'Material', href: material.link } : null,
    redes.ig ? { label: 'IG', href: redes.ig } : null,
    redes.fb ? { label: 'FB', href: redes.fb } : null,
    redes.yt ? { label: 'YT', href: redes.yt } : null,
  ].filter(Boolean);
  if (links.length === 0) return `<span style="color:#ccc">Sin material disponible</span>`;
  return links.map(l => `<a href="${l.href}" target="_blank" style="color:#1976D2;text-decoration:none;white-space:nowrap">${l.label} →</a>`).join('<br>');
}
// Badge Activo/Inactivo de UNA pauta (campo `estado`) — distinto de
// pdfBadgeEstadoPauta (más abajo), que resume la vigencia por fecha de TODAS las
// pautas de un barrio para la tabla "Barrios del circuito".
function pdfBadgeEstadoPautaItem(estado) {
  if (estado === 'ACTIVO') return `<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:6px;background:#2E7D3222;color:#2E7D32;white-space:nowrap">Activo</span>`;
  if (estado === 'INACTIVO') return `<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:6px;background:#9E9E9E22;color:#757575;white-space:nowrap">Inactivo</span>`;
  return `<span style="color:#ccc">—</span>`;
}
// Filtro + orden de piezas de pauta para las tablas de PDF de ficha (circuito y barrio,
// htmlPautaPDF/htmlPautaCircuitoPDF) — evita listas larguísimas dominadas por piezas
// inactivas cuando hay poca actividad, sin ponerle techo a circuitos/barrios con mucha
// pauta activa (ej. campañas toda_capital que impactan a todos). Basado en la cantidad de
// piezas ACTIVAS (estadoMostradoPauta — dato sucio fuera de ACTIVO/INACTIVO cuenta como
// inactiva, no se descarta):
//   0 activas   -> últimas 6 inactivas
//   1-5 activas -> todas las activas + inactivas hasta completar 6 filas
//   6+ activas  -> todas las activas, ninguna inactiva (sin límite superior)
// Orden: activas agrupadas primero, después inactivas agrupadas (nunca intercaladas);
// dentro de cada grupo, por fecha de fin de vigencia descendente (para activas: vence más
// tarde primero; para inactivas: dejó de estar vigente más recientemente primero). Sin
// `fin` parseable -> al final de su grupo, sin romper el sort.
function ordenarPautasPorFinDescendente(pautas) {
  return [...pautas].sort((a, b) => {
    const finA = parsearFechaISOPauta(a.fin);
    const finB = parsearFechaISOPauta(b.fin);
    if (finA && finB) return finB - finA;
    if (finA) return -1;
    if (finB) return 1;
    return 0;
  });
}
function filtrarYOrdenarPautasPDF(pautas) {
  const activas = ordenarPautasPorFinDescendente((pautas || []).filter(p => estadoMostradoPauta(p) === 'ACTIVO'));
  const inactivas = ordenarPautasPorFinDescendente((pautas || []).filter(p => estadoMostradoPauta(p) !== 'ACTIVO'));
  if (activas.length === 0) return inactivas.slice(0, 6);
  if (activas.length < 6) return [...activas, ...inactivas.slice(0, 6 - activas.length)];
  return activas;
}

// Esquema campañas 2026: Pieza agrupa campaña/plataforma/objetivo/tipo (por espacio,
// mismo criterio que ya usaba este archivo para compactar columnas secundarias en una
// sola celda). observaciones NO se incluye (uso interno de auditoría). Sin columna
// CPM/CPV (ver Parte 1c del prompt de ficha: Pauta+Obras) — costo_unitario se sigue
// calculando y guardando en el dato, solo no se pinta acá.
function htmlPautaPDF(pautasSinFiltrar) {
  const pautas = filtrarYOrdenarPautasPDF(pautasSinFiltrar);
  if (!pautas || pautas.length === 0) return `<p style="color:#999;font-size:12px">Sin pauta registrada.</p>`;
  return `<table><thead><tr><th>Pieza</th><th>Vigencia</th><th class="text-center">Estado</th><th class="text-right">Alcance/Visualiz.</th><th class="text-right">Frecuencia</th><th class="text-right">Inversión</th><th>Material</th></tr></thead><tbody>${pautas.map(p => {
    const et = etiquetasMetricasPauta(p.plataforma);
    const m = p.metricas_ejecutadas || {};
    const estadoMostrado = estadoMostradoPauta(p);
    return `<tr${estadoMostrado === 'INACTIVO' ? ' style="opacity:0.6"' : ''}>
      <td><strong>${p.titulo_pieza || '—'}</strong><br><span style="font-size:10px;color:#999">${p.campania || '—'} · ${p.plataforma || '—'} · ${p.objetivo_campana || '—'} · ${p.tipo_pauta || '—'}</span></td>
      <td style="white-space:nowrap">${formatearFecha(p.inicio)} → ${formatearFecha(p.fin)}</td>
      <td class="text-center">${pdfBadgeEstadoPautaItem(estadoMostrado)}</td>
      <td class="text-right">${et.alcance}: ${htmlMetricaPauta(m.alcance_o_visualizaciones)}</td>
      <td class="text-right">${m.frecuencia != null ? (typeof m.frecuencia === 'number' ? m.frecuencia.toFixed(2) : m.frecuencia) : 's/d'}</td>
      <td class="text-right">${htmlMetricaPauta(m.inversion, '$')}</td>
      <td>${htmlMaterialPauta(p.material)}</td>
    </tr>`;
  }).join('')}</tbody></table>`;
}

// --- Bloques de circuito "Visitas del Gobernador" / "Pauta publicitaria" (generarFichaPDF) ---
// Concatenan la cobertura de TODOS los barrios del circuito (resolverBarriosDelCircuito),
// cada fila con su barrio de origen — sin agregación ni dedupe entre barrios, cada
// visita/pauta pertenece a un solo barrio y se lista tal cual viene de su fuente.

// Visitas: mismo criterio de fuente que a nivel barrio (recorridosLookup), concatenadas
// y ordenadas por fecha descendente (más reciente primero).
function visitasCircuitoPDF(datosCircuito, cruceData, recorridosLookup, barriosGeoLookup) {
  const visitas = [];
  resolverBarriosDelCircuito(datosCircuito, cruceData).forEach(({ nombre, key }) => {
    const nombreDisplay = barriosGeoLookup?.[key]?.nombre_barrio || nombre;
    (recorridosLookup?.[key]?.visitas || []).forEach(v => visitas.push({ ...v, _barrio: nombreDisplay }));
  });
  return visitas.sort((a, b) => b.fecha.localeCompare(a.fecha));
}
function htmlVisitasCircuitoPDF(visitas) {
  if (!visitas || visitas.length === 0) return `<p style="color:#999;font-size:12px">Sin visitas registradas en los barrios de este circuito.</p>`;
  return `<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Contacto vecinos</th><th>Detalle</th><th>Barrio</th></tr></thead><tbody>${visitas.map(v => `<tr><td>${formatearFecha(v.fecha)}</td><td>${v.tipo_visita || '—'}</td><td>${v.contacto_vecinos || 'NO'}</td><td>${v.info || '—'}</td><td>${v._barrio}</td></tr>`).join('')}</tbody></table>`;
}

// Pauta: mismo criterio de fuente que a nivel barrio (pautasBarriosData), concatenadas
// agrupadas por barrio (mismo orden que trae el JSON, igual que a nivel barrio), MÁS
// las pautas de circuitos_sin_barrio (esquema campañas 2026) asignadas directo a este
// circuito — no vienen de ningún barrio, se marcan con _barrio: null para que
// htmlPautaCircuitoPDF las etiquete como "Sin barrio asignado" en vez de omitirlas (las
// que sí vienen de un barrio muestran su nombre real en esa misma columna).
// Sin columna Gasto/Frecuencia/Inversión: mismo criterio que ya se aplica a "Visitas del
// Gobernador" al agregarse a nivel circuito (se resumen, el detalle completo de gasto
// queda para la ficha de barrio — metricas_ejecutadas.inversion se sigue calculando y
// guardando en el dato, solo no se pinta en esta vista agregada).
function pautaCircuitoPDF(datosCircuito, cruceData, pautasBarriosData, barriosGeoLookup) {
  const pautas = [];
  resolverBarriosDelCircuito(datosCircuito, cruceData).forEach(({ nombre, key }) => {
    const nombreDisplay = barriosGeoLookup?.[key]?.nombre_barrio || nombre;
    obtenerPautasDeBarrio(pautasBarriosData, nombre).forEach(p => pautas.push({ ...p, _barrio: nombreDisplay }));
  });
  obtenerPautasCircuitoSinBarrio(pautasBarriosData, datosCircuito.CircuitoKey).forEach(p => pautas.push({ ...p, _barrio: null }));
  return pautas;
}
// Sin columna CPM/CPV (ver Parte 1c del prompt de ficha: Pauta+Obras) — costo_unitario
// se sigue calculando y guardando en el dato, solo no se pinta acá.
function htmlPautaCircuitoPDF(pautasSinFiltrar) {
  const pautas = filtrarYOrdenarPautasPDF(pautasSinFiltrar);
  if (!pautas || pautas.length === 0) return `<p style="color:#999;font-size:12px">Sin pauta registrada en los barrios de este circuito.</p>`;
  const badgeSinBarrio = `<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:6px;background:#9E9E9E22;color:#757575;white-space:nowrap">Sin barrio asignado</span>`;
  return `<table><thead><tr><th>Pieza</th><th>Vigencia</th><th class="text-center">Estado</th><th class="text-right">Alcance/Visualiz.</th><th>Material</th><th>Barrio</th></tr></thead><tbody>${pautas.map(p => {
    const et = etiquetasMetricasPauta(p.plataforma);
    const m = p.metricas_ejecutadas || {};
    const estadoMostrado = estadoMostradoPauta(p);
    return `<tr${estadoMostrado === 'INACTIVO' ? ' style="opacity:0.6"' : ''}>
      <td><strong>${p.titulo_pieza || '—'}</strong><br><span style="font-size:10px;color:#999">${p.campania || '—'} · ${p.plataforma || '—'} · ${p.tipo_pauta || '—'}</span></td>
      <td style="white-space:nowrap">${formatearFecha(p.inicio)} → ${formatearFecha(p.fin)}</td>
      <td class="text-center">${pdfBadgeEstadoPautaItem(estadoMostrado)}</td>
      <td class="text-right">${et.alcance}: ${htmlMetricaPauta(m.alcance_o_visualizaciones)}</td>
      <td>${htmlMaterialPauta(p.material)}</td>
      <td>${p._barrio || badgeSinBarrio}</td>
    </tr>`;
  }).join('')}</tbody></table>`;
}
function htmlObrasPDF(obras) {
  if (!obras || obras.length === 0) return `<p style="color:#999;font-size:12px">Sin obras identificadas.</p>`;
  return `<table><thead><tr><th>Nombre</th><th>Tipo</th><th>Avance</th><th>Barrio / Circuito</th></tr></thead><tbody>${obras.map(o => {
    const avance = normalizarAvanceObra(o.porcentaje_avance);
    const color = colorAvanceObra(avance);
    const pctLabel = avance != null ? `${Math.round(avance * 100)}%` : 'Sin dato';
    return `<tr><td>${o.nombre_obra || '(sin nombre)'}</td><td>${o.tipo_obra || '—'}</td><td><span class="badge" style="background:${color}22;color:${color}">${pctLabel}</span></td><td>${o.barrio || 'Sin barrio asignado'}${o._circuitoNombre ? ' · ' + o._circuitoNombre : ''}</td></tr>`;
  }).join('')}</tbody></table>`;
}

// Mismo bloque "Contexto político" que se ve en la ficha de barrio (pantalla): categoría
// + %G23 vs Capital + top 3 problemas de la última ronda si el circuito tiene encuesta.
// Deja explícito que son datos del circuito, no del barrio.
function htmlContextoPoliticoPDF(circuito, encuestasData) {
  if (!circuito) {
    return `<div class="section"><h3>Contexto político</h3><p style="color:#999;font-size:12px">Sin circuito asociado.</p></div>`;
  }
  const encuesta = buscarEncuestaCircuito(encuestasData, circuito.CircuitoKey);
  let topProblemas = [];
  if (encuesta?.rondas?.length > 0) {
    const ultima = encuesta.rondas[encuesta.rondas.length - 1];
    const problemas = ultima.preguntas?.['Problemas principales'] || {};
    topProblemas = Object.entries(problemas).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }
  const topProblemasHtml = topProblemas.length > 0
    ? `<div style="margin-top:10px"><div style="font-size:11px;color:#666;margin-bottom:4px">Principales problemas (última ronda)</div><table><tbody>${topProblemas.map(([nombre, pct]) => `<tr><td>${nombre}</td><td class="text-right"><strong>${pct.toFixed(1)}%</strong></td></tr>`).join('')}</tbody></table></div>`
    : `<p style="color:#999;font-size:12px;margin-top:6px">Sin encuestas registradas para este circuito.</p>`;
  return `
<div class="section">
  <h3>Contexto político — Circuito ${circuito.CircuitoKey} ${circuito.cirn_nom}</h3>
  <p style="font-size:10px;color:#999;margin-bottom:8px">Datos del circuito, no del barrio.</p>
  <div style="display:flex;align-items:center;gap:10px">
    <span class="badge" style="background:${COLORES_CATEGORIA[circuito.Categoria_v4]?.bg}22;color:${COLORES_CATEGORIA[circuito.Categoria_v4]?.text}">${COLORES_CATEGORIA[circuito.Categoria_v4]?.label || circuito.Categoria_v4}</span>
    <span style="font-size:12px">Gob. 2023: <strong class="${circuito.Share_G23 >= 0.5 ? 'green' : 'red'}">${(circuito.Share_G23 * 100).toFixed(1)}%</strong>${circuito.ShareCap_G23 != null ? ` <span style="font-size:10px;color:#999">(vs Capital ${(circuito.ShareCap_G23 * 100).toFixed(1)}%)</span>` : ''}</span>
  </div>
  ${topProblemasHtml}
</div>`;
}

// Mismo criterio "valores cero atenuados" que el resto de la tabla "Barrios del
// circuito" — y mismo badge de estado de Pauta que BadgeEstadoPauta en pantalla.
function pdfCeldaCantidad(n) {
  return n > 0 ? `<strong>${n}</strong>` : `<span style="color:#ccc">—</span>`;
}
function pdfBadgeEstadoPauta(estado) {
  if (estado === 'activa') return `<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:6px;background:#2E7D3222;color:#2E7D32;white-space:nowrap">Activa</span>`;
  if (estado === 'finalizada') return `<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:6px;background:#9E9E9E22;color:#757575;white-space:nowrap">Finalizada</span>`;
  return `<span style="color:#ccc">—</span>`;
}

// --- Encuestas en el PDF: mismo criterio de agrupación que ResumenEncuesta en pantalla
// (Aprobación / Calificación de gestión / Reelección), extendido con las preguntas de
// ronda que la ficha todavía no mostraba. Sin librerías de charts: barras y donuts son
// divs/SVG propios, igual que el resto de la ficha. ---
function deltaEncuestaPDF(rondas, pregunta, categoria) {
  const serie = rondas.map(r => r.preguntas?.[pregunta]?.[categoria]).filter(v => v != null);
  if (serie.length < 2) return null;
  return serie[serie.length - 1] - serie[0];
}
// "Mejoras en X" no tiene Positiva/Negativa sino Si,mucho/Si,algo/No — el delta se toma
// sobre el total que percibe mejora (mucho + algo).
function deltaMejoraPDF(rondas, pregunta) {
  const serie = rondas
    .map(r => r.preguntas?.[pregunta])
    .filter(d => d != null)
    .map(d => (d['Si, mucho'] || 0) + (d['Si, algo'] || 0));
  if (serie.length < 2) return null;
  return serie[serie.length - 1] - serie[0];
}
function badgeDeltaPDF(delta) {
  if (delta == null) return '';
  const cls = delta > 0 ? 'green' : delta < 0 ? 'red' : '';
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
  const signo = delta > 0 ? '+' : '';
  return `<div class="metric-sub ${cls}" style="font-weight:600">${arrow} ${signo}${delta.toFixed(1)} pp vs. 1ª ronda</div>`;
}
function htmlMetricPDF(label, valor, delta) {
  return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value" style="font-size:18px">${valor}</div>${badgeDeltaPDF(delta)}</div>`;
}
// Mismo ícono (círculo relleno + glifo blanco) y mismo criterio de color por nivel
// que IconoTendencia en pantalla (solapa Comparativas) — no es una versión distinta,
// es el mismo dibujo, solo con colores fijos en vez de variables CSS.
function htmlIconoTendenciaPDF(nivel) {
  const color = { positivo: '#2E7D32', neutro: '#F57F17', negativo: '#C62828' }[nivel] || '#9E9E9E';
  const glifo = nivel === 'positivo'
    ? '<path d="M4.5 8.3L6.8 10.8L11.5 5.3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />'
    : nivel === 'negativo'
    ? '<path d="M5 5L11 11M11 5L5 11" stroke="#fff" stroke-width="1.6" stroke-linecap="round" />'
    : '<line x1="4.5" y1="8" x2="11.5" y2="8" stroke="#fff" stroke-width="1.8" stroke-linecap="round" />';
  return `<svg width="16" height="16" viewBox="0 0 16 16" style="flex-shrink:0"><circle cx="8" cy="8" r="8" fill="${color}" />${glifo}</svg>`;
}
// Bloque "Tendencias del circuito" de la solapa Comparativas — mismo layout que en
// pantalla (SolapaComparativas): 3 badges (Diagnóstico / Evolución Llaryora / Efecto
// legislativo) + renglón de insight con ícono debajo. Antes no se exportaba al PDF.
function htmlTendenciasCircuitoPDF(datos) {
  const nivel = datos.Victorias_Total >= 3 ? 'positivo' : datos.Victorias_Total >= 2 ? 'neutro' : 'negativo';
  const textoInsight = datos.Victorias_Total >= 3 ? 'Circuito sólido para el oficialismo' : datos.Victorias_Total >= 2 ? 'Circuito con potencial de recuperación' : 'Circuito difícil, requiere estrategia específica';
  const catV4 = COLORES_CATEGORIA[datos.Categoria_v4] || { bg: '#9E9E9E', text: '#424242', label: datos.Categoria_v4 || '—' };
  const catML = COLORES_ML[datos.Categoria_ML] || { bg: '#9E9E9E', text: '#424242', label: datos.Categoria_ML || '—' };
  return `
<div class="section" style="background:${datos.Victorias_Total >= 2 ? '#4CAF5012' : '#EF535012'};border:1px solid ${datos.Victorias_Total >= 2 ? '#4CAF5040' : '#EF535040'};border-radius:12px;padding:16px">
  <h3>Tendencias del circuito</h3>
  <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">
    <div style="padding:10px 14px;background:#fff;border-radius:10px"><div style="font-size:12px;color:#666;margin-bottom:6px">Diagnóstico</div><span class="badge" style="background:${catV4.bg}22;color:${catV4.text}">${catV4.label}</span></div>
    <div style="padding:10px 14px;background:#fff;border-radius:10px"><div style="font-size:12px;color:#666;margin-bottom:6px">Evolución Llaryora</div><span class="badge" style="background:${catML.bg}22;color:${catML.text}">${catML.label}</span></div>
    <div style="padding:10px 14px;background:#fff;border-radius:10px"><div style="font-size:12px;color:#666;margin-bottom:6px">Efecto legislativo</div><span style="font-size:13px;font-weight:600" class="${datos.Sch_Mejoro ? 'green' : 'red'}">${datos.Sch_Mejoro ? 'MEJORÓ' : 'EMPEORÓ'} (${formatPP(datos.Sch_Efecto)})</span></div>
  </div>
  <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#1a1a1a;font-weight:500">${htmlIconoTendenciaPDF(nivel)}<span>${textoInsight}</span></div>
  <div style="font-size:13px;color:#666;margin-top:10px">Ganó ${datos.Victorias_Total}/4 elecciones. ${datos.Crecio_vs_Capital ? 'Creció más que Capital con Llaryora.' : 'Creció menos que Capital con Llaryora.'} ${datos.Sch_Mejoro ? 'Mejoró en legislativas.' : 'Empeoró en legislativas.'}</div>
</div>`;
}
// Mismo gauge semáforo (SVG a mano) y mismo criterio de color por valor que
// GaugeAprobacion en pantalla (solapa Encuestas) — no es una versión distinta, es el
// mismo dibujo, solo con colores fijos en vez de variables CSS (el HTML del PDF no
// hereda las custom properties del tablero).
function htmlGaugeAprobacionPDF(label, data, delta) {
  if (!data || data.Apruebo == null) {
    return `<div class="metric"><div class="metric-label">Aprobación ${label}</div><div class="metric-value" style="font-size:12px;color:#999">Sin dato</div></div>`;
  }
  const pct = data.Apruebo;
  const color = pct >= 40 ? '#0DCE1D' : pct >= 25 ? '#D9B300' : '#D64550';
  const r = 40, mediaCircunferencia = Math.PI * r;
  const progreso = (Math.min(pct, 100) / 100) * mediaCircunferencia;
  return `<div class="metric">
    <svg viewBox="0 0 100 60" style="width:100%;max-width:140px">
      <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#e0e0e0" stroke-width="10" stroke-linecap="round" />
      <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"
        stroke-dasharray="${mediaCircunferencia} ${mediaCircunferencia}" stroke-dashoffset="${mediaCircunferencia - progreso}" />
      <text x="50" y="45" text-anchor="middle" font-size="18" font-weight="700" fill="#1a1a1a">${pct}%</text>
    </svg>
    <div style="font-size:11px;color:#666;margin-top:2px">Aprobación ${label}</div>
    ${badgeDeltaPDF(delta)}
  </div>`;
}
function htmlBarraCategoriasPDF(label, data, delta) {
  if (!data) return `<div style="margin-bottom:10px"><div style="font-size:11px;color:#1a1a1a;margin-bottom:4px">${label}</div><p style="font-size:11px;color:#999">Sin dato.</p></div>`;
  const deltaHtml = delta != null ? `<span class="${delta > 0 ? 'green' : delta < 0 ? 'red' : ''}" style="font-weight:600">${delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} ${delta > 0 ? '+' : ''}${delta.toFixed(1)} pp</span>` : '';
  return `<div style="margin-bottom:10px">
    <div style="font-size:11px;color:#1a1a1a;margin-bottom:4px;display:flex;justify-content:space-between"><span>${label}</span>${deltaHtml}</div>
    ${htmlBarraSegmentosPDF(data, { height: 18 })}
  </div>`;
}
function htmlMejoraPDF(label, data, delta) {
  if (!data) return `<div style="margin-bottom:10px"><div style="font-size:11px;color:#1a1a1a;margin-bottom:4px">${label}</div><p style="font-size:11px;color:#999">Sin dato.</p></div>`;
  const segmentos = [
    ['Si, mucho', '#22C55E'], ['Si, algo', '#86EFAC'], ['No', '#EF4444'],
  ].map(([cat, color]) => {
    const v = data[cat];
    if (!v || v <= 0) return '';
    const texto = v > 10 ? `<span style="font-size:9px;color:#fff;font-weight:600">${v}%</span>` : '';
    return `<div style="width:${v}%;background:${color};display:flex;align-items:center;justify-content:center">${texto}</div>`;
  }).join('');
  const deltaHtml = delta != null ? `<span class="${delta > 0 ? 'green' : delta < 0 ? 'red' : ''}" style="font-weight:600">${delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} ${delta > 0 ? '+' : ''}${delta.toFixed(1)} pp</span>` : '';
  return `<div style="margin-bottom:10px">
    <div style="font-size:11px;color:#1a1a1a;margin-bottom:4px;display:flex;justify-content:space-between"><span>${label}</span>${deltaHtml}</div>
    <div style="display:flex;height:18px;border-radius:5px;overflow:hidden;background:#eee">${segmentos}</div>
  </div>`;
}
// Cuerpo de UNA ronda (Aprobación/Gestión/Reelección/Funcionamiento/Mejoras),
// extraído de lo que antes era el cuerpo fijo de htmlEncuestasPDF, para poder
// reusarlo tanto con delta (modo "Última ronda", comparando contra la 1ª) como sin
// delta (modo "Elegir rondas", cada ronda mostrada de forma independiente).
function htmlResumenRondaPDF(preguntas, delta, deltaMejora) {
  const aprobacion = ['Intendente', 'Gobernador', 'Presidente'].map(f => {
    const d = preguntas[`Aprobación ${f}`];
    return htmlGaugeAprobacionPDF(f, d, delta(`Aprobación ${f}`, 'Apruebo'));
  }).join('');

  const gestion = ['Intendente', 'Gobernador', 'Presidente'].map(f =>
    htmlBarraCategoriasPDF(`Calificación de gestión: ${f}`, preguntas[`Gestión del ${f}`], delta(`Gestión del ${f}`, 'Positiva'))
  ).join('');

  const reeleccion = [['Llaryora (Gobernador)', 'Reelección Llaryora'], ['Milei (Presidente)', 'Reelección Milei']].map(([nom, key]) => {
    const d = preguntas[key];
    return htmlMetricPDF(`Reelección ${nom}`, d?.Si != null ? d.Si.toFixed(1) + '%' : '—', delta(key, 'Si'));
  }).join('');

  const funcionamiento = [['Centro Vecinal', 'Funcionamiento Centro Vecinal'], ['CPC', 'Funcionamiento CPC']].map(([nom, key]) =>
    htmlBarraCategoriasPDF(`Funcionamiento ${nom}`, preguntas[key], delta(key, 'Positiva'))
  ).join('');

  const mejoras = [
    ['Bacheos', 'Mejoras en bacheos'],
    ['Alumbrado público', 'Mejoras en alumbrado público'],
    ['Espacios públicos', 'Mejoras en espacios públicos'],
    ['Ordenamiento naranjitas y limpiavidrios', 'Mejoras en ordenamiento naranjitas y limpiavidrios'],
  ].map(([nom, key]) => htmlMejoraPDF(nom, preguntas[key], deltaMejora(key))).join('');

  const problemas = preguntas['Problemas principales'] || {};
  const topProblemas = Object.entries(problemas).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return `
  ${topProblemas.length > 0 ? `<div style="margin-bottom:16px"><table><thead><tr><th>Principales problemas</th><th class="text-right">%</th></tr></thead><tbody>${topProblemas.map(([nombre, pct]) => `<tr><td>${nombre}</td><td class="text-right"><strong>${pct.toFixed(1)}%</strong></td></tr>`).join('')}</tbody></table></div>` : ''}

  <div class="mini-title">Aprobación de gestión</div>
  <div class="metrics" style="grid-template-columns:repeat(3,1fr);margin-bottom:10px">${aprobacion}</div>

  <div class="mini-title">Calificación de gestión</div>
  ${gestion}

  <div class="mini-title">Reelección</div>
  <div class="metrics" style="grid-template-columns:repeat(2,1fr);margin-bottom:10px">${reeleccion}</div>

  <div class="mini-title">Funcionamiento de instituciones locales</div>
  ${funcionamiento}

  <div class="mini-title">Mejoras percibidas (ronda actual)</div>
  ${mejoras}`;
}

// Modo "Última ronda" del diálogo de export — comportamiento sin cambios respecto
// al que existía antes de las 3 opciones de export: última ronda, con delta vs. la
// 1ª si el circuito tiene comparativo.
function htmlEncuestasPDF(encuestaCircuito) {
  if (!encuestaCircuito || !(encuestaCircuito.cantidad_rondas > 0)) {
    return `<div class="section"><h3>Encuestas</h3><p style="color:#999;font-size:12px">Sin encuestas registradas para este circuito.</p></div>`;
  }
  const rondas = encuestaCircuito.rondas;
  const ultima = rondas[rondas.length - 1];
  const preguntas = ultima.preguntas || {};
  const comparativo = !!encuestaCircuito.tiene_comparativo && rondas.length >= 2;
  const delta = (pregunta, categoria) => comparativo ? deltaEncuestaPDF(rondas, pregunta, categoria) : null;
  const deltaMejora = (pregunta) => comparativo ? deltaMejoraPDF(rondas, pregunta) : null;

  return `
<div class="section">
  <h3>Encuestas</h3>
  <div class="metrics" style="grid-template-columns:repeat(2,1fr)">
    <div class="metric"><div class="metric-label">Rondas</div><div class="metric-value">${encuestaCircuito.cantidad_rondas}</div><div class="metric-sub">última: ${formatearFechaRonda(ultima.fecha, ultima.casos)}</div></div>
    <div class="metric"><div class="metric-label">Cobertura</div><div class="metric-value" style="font-size:14px">${comparativo ? 'Con comparativo' : 'Ronda única'}</div></div>
  </div>
  ${htmlResumenRondaPDF(preguntas, delta, deltaMejora)}
</div>`;
}

// Modo "Elegir rondas" — una sección de encuesta completa por cada ronda elegida
// (en el orden en que vienen los índices, ya ordenados cronológicamente por el
// diálogo), cada una con su fecha como subtítulo y sin deltas (cada ronda se
// muestra de forma independiente, no hay "ronda base" con la que compararlas).
function htmlEncuestasElegirRondasPDF(encuestaCircuito, indicesRondas) {
  const rondas = encuestaCircuito.rondas;
  const seleccion = (indicesRondas || []).filter(i => rondas[i]);
  if (seleccion.length === 0) {
    return `<div class="section"><h3>Encuestas</h3><p style="color:#999;font-size:12px">Sin rondas seleccionadas.</p></div>`;
  }
  const sinDelta = () => null;
  return seleccion.map(i => {
    const ronda = rondas[i];
    return `
<div class="section">
  <h3>Encuestas</h3>
  <div class="mini-title" style="margin-top:0">${formatearFechaRonda(ronda.fecha, ronda.casos)}</div>
  ${htmlResumenRondaPDF(ronda.preguntas || {}, sinDelta, sinDelta)}
</div>`;
  }).join('');
}

// Modo "Comparativo" — misma vista (resumen + cards + barras apiladas + tabla) que
// el bloque A en pantalla, generada por la misma función htmlComparativoEncuestaBody.
function htmlEncuestasComparativoPDF(encuestaCircuito, umbral) {
  if (!encuestaCircuito || encuestaCircuito.rondas.length < 2) {
    return `<div class="section"><h3>Encuestas — Comparativo</h3><p style="color:#999;font-size:12px">Sin datos suficientes para comparar.</p></div>`;
  }
  return `<div class="section"><h3>Encuestas — Comparativo</h3>${htmlComparativoEncuestaBody(encuestaCircuito, umbral)}</div>`;
}

// Sección "barrio" del PDF (población, contexto político, barrios cercanos, visitas,
// pauta, obras, escuelas) — compartida entre el PDF de circuito (embebida como "BARRIO
// PRINCIPAL") y la exportación standalone de un barrio cualquiera (generarFichaBarrioPDF).
// circuitoContexto: si se pasa ya resuelto (caso circuito: el barrio principal
// pertenece por definición a ESE circuito, no hace falta re-derivarlo), se usa tal
// cual; si no (caso standalone, puede ser cualquier barrio), se resuelve acá con
// resolverCircuitoPrincipalDeBarrio (necesita cruceData/barriosGeoLookup/todosLosDatos).
function generarSeccionBarrioPDF({
  nombreBarrio, props, tituloParte, incluirEncabezadoParte = true, circuitoContexto,
  // true cuando se llama desde generarFichaPDF (embebida en la ficha de circuito): en
  // ese caso "Visitas del Gobernador" y "Pauta publicitaria" ya se muestran arriba, a
  // nivel circuito (con columna Barrio), así que acá no se repiten — la "Cobertura
  // territorial del barrio" queda solo con Obras. false (default) = comportamiento de
  // siempre, usado por generarFichaBarrioPDF (standalone), donde sí se muestran ambas.
  modoEmbebidoEnCircuito = false,
  cruceData, barriosGeoLookup, todosLosDatos, encuestasData,
  recorridosLookup, pautasBarriosData, obrasEnriquecidas, barriosGeoData,
  votosEscuelasBarrioLookup, votosEscuelasBarrioData, poblacionTotalPorBarrio, eventosPorCircuito,
}) {
  if (!nombreBarrio || !props) {
    return incluirEncabezadoParte ? `
<div class="part-header page-break">
  <h1>${tituloParte}</h1>
  <h2 style="color:#999">Sin barrio principal identificado para este circuito.</h2>
</div>` : '';
  }

  const key = normalizarNombreBarrio(nombreBarrio);
  const poblacionTotalBarrio = poblacionTotalPorBarrio?.[key];
  const circuito = circuitoContexto || resolverCircuitoPrincipalDeBarrio(nombreBarrio, cruceData, barriosGeoLookup, todosLosDatos);
  const eventosCircuito = circuito ? (eventosPorCircuito?.[circuito.Mapkey] || []) : [];
  const visitasCircuito = eventosCircuito.filter(e => e.tipo === 'visita').map(e => e.detalle);

  // Visitas: partimos de las del barrio (fuente más precisa) y sumamos las del circuito
  // (que incluye TODOS los barrios con orden_importancia:1, no solo este) que no estén
  // ya cubiertas, dedupeando por fecha+detalle.
  const visitasBarrio = unificarVisitasPDF(recorridosLookup?.[key]?.visitas || [], visitasCircuito);
  const pautaBarrio = obtenerPautasDeBarrio(pautasBarriosData, nombreBarrio);
  const obrasBarrio = (obrasEnriquecidas || []).filter(o => normalizarNombreBarrio(o.barrio) === key);
  const cercanosBarrio = barriosCercanos(nombreBarrio, barriosGeoData);
  const votosEscuelasBarrio = votosEscuelasBarrioLookup?.[key] || null;

  const encabezadoHtml = incluirEncabezadoParte ? `
<div class="part-header page-break">
  <h1>${tituloParte}</h1>
  <h2>${nombreBarrio}</h2>
</div>` : '';

  return `
${encabezadoHtml}
<div class="metrics">
  <div class="metric"><div class="metric-label">Población total (barrio) <span title="Población total censada de este barrio (fuente: IDECOR/censo), no vinculada al padrón electoral." style="display:inline-flex;align-items:center;justify-content:center;width:12px;height:12px;border-radius:50%;border:1px solid #999;color:#999;font-size:9px;cursor:help;">i</span></div><div class="metric-value">${poblacionTotalBarrio != null ? poblacionTotalBarrio.toLocaleString() : '—'}</div></div>
  <div class="metric"><div class="metric-label">Tipo</div><div class="metric-value" style="font-size:16px">${props?.tipo_barrio === 'BarrioOficial' ? 'Oficial' : 'No oficial'}</div></div>
</div>
${htmlContextoPoliticoPDF(circuito, encuestasData)}
<div class="section">
  <h3>Barrios cercanos (≤1,5 km)</h3>
  ${cercanosBarrio.length === 0 ? `<p style="color:#999;font-size:12px">Sin barrios cercanos dentro de 1,5 km.</p>` : `<table><thead><tr><th>Barrio</th><th class="text-right">Población</th><th class="text-right">Distancia</th></tr></thead><tbody>${cercanosBarrio.map(b => `<tr><td>${b.nombre}</td><td class="text-right">${b.poblacion != null ? b.poblacion.toLocaleString() : '—'}</td><td class="text-right">${b.distanciaKm.toFixed(2)} km</td></tr>`).join('')}</tbody></table>`}
</div>
<div class="subheader">Cobertura territorial del barrio</div>
${!modoEmbebidoEnCircuito ? `<div class="section"><h3>Visitas del Gobernador</h3>${htmlVisitasPDF(visitasBarrio)}</div>` : ''}
${!modoEmbebidoEnCircuito ? `<div class="section"><h3>Pauta publicitaria</h3>${htmlPautaPDF(pautaBarrio)}</div>` : ''}
<div class="section"><h3>Obras (en el barrio)</h3>${htmlObrasPDF(obrasBarrio)}</div>
${INCLUIR_ESCUELAS_PDF ? `<div class="section"><h3>Votos por escuela</h3>${htmlEscuelasPDF(votosEscuelasBarrio?.escuelas, votosEscuelasBarrioData?.promedio_capital_pct)}</div>` : ''}
`;
}

// CSS compartido entre generarFichaPDF (circuito) y generarFichaBarrioPDF (barrio
// standalone) — mismo documento, mismas clases, para que ambos exports se vean
// consistentes con el resto de la ficha.
function estilosFichaPDF() {
  return `
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:30px;max-width:850px;margin:0 auto;color:#1a1a1a;font-size:13px}
.header{border-bottom:3px solid #1976D2;padding-bottom:16px;margin-bottom:24px}
.header h1{font-size:24px;font-weight:700}
.header h2{font-size:16px;font-weight:400;color:#666;margin-top:6px}
.badges{margin-top:12px;display:flex;gap:10px}
.badge{display:inline-block;padding:4px 12px;border-radius:5px;font-size:11px;font-weight:600}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.metric{padding:14px;background:#f5f5f5;border-radius:6px;text-align:center}
.metric-label{font-size:11px;color:#666;margin-bottom:4px}
.metric-value{font-size:22px;font-weight:700}
.metric-sub{font-size:10px;color:#999;margin-top:2px}
.section{margin-bottom:24px}
.section h3{font-size:14px;font-weight:600;margin-bottom:10px;color:#1976D2}
table{width:100%;border-collapse:collapse;font-size:12px}
th{padding:8px;text-align:left;background:#f5f5f5;font-weight:500}
td{padding:8px;border-top:1px solid #e0e0e0}
.text-right{text-align:right}
.text-center{text-align:center}
.green{color:#2E7D32}
.red{color:#C62828}
.chart-container{background:#f9f9f9;padding:16px;border-radius:8px;margin-bottom:20px}
.comparativas{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px}
.comp-box{padding:14px;border:1px solid #e0e0e0;border-radius:6px;text-align:center}
.comp-box h4{font-size:11px;color:#666;margin-bottom:8px}
.comp-value{font-size:20px;font-weight:700}
.partidos-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.partido-section{background:#f5f5f5;padding:12px;border-radius:6px}
.partido-section h4{font-size:12px;font-weight:600;margin-bottom:8px}
.partido-item{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #e0e0e0}
.partido-item:last-child{border:none}
.part-header{background:#1a1a1a;color:#fff;padding:20px 24px;border-radius:8px;margin-bottom:20px}
.part-header h1{font-size:20px;font-weight:700;letter-spacing:0.5px}
.part-header h2{font-size:15px;font-weight:400;color:#ccc;margin-top:4px}
.subheader{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#999;margin:28px 0 12px;border-bottom:1px solid #e0e0e0;padding-bottom:6px}
.mini-title{font-size:12px;font-weight:600;color:#444;margin:14px 0 8px}
.page-break{page-break-before:always}
.footer{margin-top:30px;padding-top:16px;border-top:1px solid #e0e0e0;font-size:10px;color:#999;text-align:center}
@media print{body{padding:15px} .page-break{page-break-before:always}}
`;
}

// Abre la ventana de impresión con el HTML de la ficha ya armado — mismo mecanismo
// (window.open + print) para el export de circuito y el de barrio individual.
// window.open puede devolver null (bloqueador de popups del navegador, o el propio
// entorno de testing) — sin este guard, ventana.document.write revienta con un
// TypeError poco claro para quien lo ve. Se avisa con un alert accionable en vez de
// dejar pasar una excepción sin manejar.
function abrirVentanaImpresion(html) {
  const ventana = window.open('', '_blank');
  if (!ventana) {
    alert('No se pudo abrir la ventana de impresión: el navegador bloqueó el popup. Permití popups para este sitio (suele aparecer un ícono en la barra de direcciones) e intentá exportar de nuevo.');
    return;
  }
  ventana.document.write(html);
  ventana.document.close();
  setTimeout(() => ventana.print(), 500);
}

// Ficha standalone de UN barrio (cualquiera, no solo el principal de un circuito) —
// mismas secciones de barrio que ya usa generarFichaPDF embebidas, reutilizadas vía
// generarSeccionBarrioPDF, sin la parte de circuito completa.
const generarFichaBarrioPDF = ({
  nombreBarrio, props, cruceData, barriosGeoLookup, todosLosDatos, encuestasData,
  recorridosLookup, pautasBarriosData, obrasEnriquecidas, barriosGeoData,
  votosEscuelasBarrioLookup, votosEscuelasBarrioData, poblacionTotalPorBarrio, eventosPorCircuito,
}) => {
  const seccionBarrio = generarSeccionBarrioPDF({
    nombreBarrio, props, incluirEncabezadoParte: false,
    cruceData, barriosGeoLookup, todosLosDatos, encuestasData,
    recorridosLookup, pautasBarriosData, obrasEnriquecidas, barriosGeoData,
    votosEscuelasBarrioLookup, votosEscuelasBarrioData, poblacionTotalPorBarrio, eventosPorCircuito,
  });

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ficha ${nombreBarrio}</title>
<style>${estilosFichaPDF()}</style></head><body>

<div class="header">
  <h1>BARRIO ${nombreBarrio}</h1>
  <h2>${props?.tipo_barrio === 'BarrioOficial' ? 'Barrio oficial' : 'Barrio no oficial'}</h2>
</div>

${seccionBarrio}

<div class="footer">Diagnóstico Territorial - Córdoba Capital │ Generado el ${formatearFecha(new Date())}</div>
</body></html>`;
};

const generarFichaPDF = ({
  datos, barrios, partidos, padronTotal,
  eventosPorCircuito, encuestaCircuito, encuestasData, encuestasMetadata,
  cruceData, barriosGeoLookup, barriosGeoData, poblacionTotalPorBarrio,
  recorridosLookup, pautasBarriosData, obrasEnriquecidas,
  votosEscuelasCircuitoData, votosEscuelasBarrioLookup, votosEscuelasBarrioData,
  // Nombres de barrio (tal como vienen en barrios_por_circuito_completo.json) a incluir
  // como sección propia — selección explícita del usuario en el diálogo de export
  // (puede ser [], uno, o varios). Sin este parámetro (llamador legado), se cae al
  // comportamiento de siempre: solo el barrio principal.
  nombresBarriosParaExportar,
  // Sección "Encuestas" del diálogo de export: 'ultima' (default, comportamiento de
  // siempre) | 'elegir' (una sección completa por ronda, ver rondasSeleccionadas) |
  // 'comparativo' (vista comparativa del bloque A, en versión print).
  modoEncuestas,
  rondasSeleccionadas,
}) => {
  const mapkey = datos.Mapkey;
  const barriosCircuito = barrios?.[mapkey]?.barrios || [];
  const barriosVisibles = barriosCircuito.filter(b => (b.poblacion || 0) >= UMBRAL_POBLACION_BARRIO);
  const barriosOcultos = barriosCircuito.length - barriosVisibles.length;
  const poblacionCircuitoTotal = poblacionCircuito(barriosCircuito);
  const pctPadronDePoblacion = poblacionCircuitoTotal > 0 && datos.Padron_G23 != null ? (datos.Padron_G23 / poblacionCircuitoTotal) * 100 : null;
  const pctPadron = padronTotal > 0 ? ((datos.Padron_G23 / padronTotal) * 100).toFixed(2) : 0;
  const partidosG23 = partidos?.[datos.CircuitoKey]?.['G23'] || [];
  const partidosL25 = partidos?.[datos.CircuitoKey]?.['L25'] || [];

  // --- Cobertura territorial del circuito: reusa eventosPorCircuito (ya calculado en
  // Home, misma atribución por barrio principal que usa el resto del tablero) ---
  const obrasCircuito = (obrasEnriquecidas || []).filter(o => o._circuitoMapkey === mapkey);

  // --- Barrio principal del circuito (dirección inversa de resolverCircuitoPrincipalDeBarrio) ---
  const barrioPrincipal = resolverBarrioPrincipalDeCircuito(datos, cruceData, barriosGeoLookup);

  // --- Encuestas del circuito: mismo criterio de agrupación que ResumenEncuesta en pantalla.
  // modoEncuestas viene del diálogo de export; sin dato (llamador legado) se cae al
  // comportamiento de siempre (última ronda). ---
  const umbralComparativo = encuestasMetadata?.umbral_variacion_pp ?? 2.5;
  const encuestaHtml = (() => {
    if (!encuestaCircuito || !(encuestaCircuito.cantidad_rondas > 0)) return htmlEncuestasPDF(encuestaCircuito);
    if (modoEncuestas === 'comparativo') return htmlEncuestasComparativoPDF(encuestaCircuito, umbralComparativo);
    if (modoEncuestas === 'elegir') return htmlEncuestasElegirRondasPDF(encuestaCircuito, rondasSeleccionadas || []);
    return htmlEncuestasPDF(encuestaCircuito);
  })();

  const escuelasCircuitoHtml = INCLUIR_ESCUELAS_PDF ? `
<div class="section">
  <h3>Votos por escuela</h3>
  ${htmlEscuelasPDF(votosEscuelasCircuitoData?.circuitos?.[mapkey]?.escuelas, votosEscuelasCircuitoData?.promedio_capital_pct)}
</div>` : '';

  // --- Visitas del Gobernador / Pauta publicitaria a nivel circuito: concatenan la
  // cobertura de TODOS los barrios del circuito (no solo el principal), cada fila con
  // su barrio de origen — ver resolverBarriosDelCircuito. ---
  const visitasCircuitoHtml = htmlVisitasCircuitoPDF(visitasCircuitoPDF(datos, cruceData, recorridosLookup, barriosGeoLookup));
  const pautaCircuitoHtml = htmlPautaCircuitoPDF(pautaCircuitoPDF(datos, cruceData, pautasBarriosData, barriosGeoLookup));

  // Selección de barrios a exportar como sección propia: por defecto (sin diálogo, ej.
  // llamadas legadas) solo el barrio principal; con el diálogo de export, la selección
  // explícita del usuario — puede ser ninguno, uno o varios. Cada uno pertenece por
  // definición a ESTE circuito (datos), así que se pasa como circuitoContexto para que
  // el bloque de Contexto político no tenga que re-derivarlo.
  const nombrePrincipalNorm = barrioPrincipal ? normalizarNombreBarrio(barrioPrincipal.nombreBarrio) : null;
  const nombresBarrios = nombresBarriosParaExportar ?? (barrioPrincipal ? [barrioPrincipal.nombreBarrio] : []);
  const barrioPartHtml = nombresBarrios.map(nombreBarrioRaw => {
    const key = normalizarNombreBarrio(nombreBarrioRaw);
    const feature = barriosGeoLookup[key];
    const nombreBarrio = feature ? feature.nombre_barrio : nombreBarrioRaw;
    const esPrincipal = nombrePrincipalNorm != null && key === nombrePrincipalNorm;
    return generarSeccionBarrioPDF({
      nombreBarrio,
      props: feature,
      tituloParte: esPrincipal ? 'BARRIO PRINCIPAL' : 'BARRIO',
      circuitoContexto: datos,
      modoEmbebidoEnCircuito: true,
      cruceData, barriosGeoLookup, encuestasData,
      recorridosLookup, pautasBarriosData, obrasEnriquecidas, barriosGeoData,
      votosEscuelasBarrioLookup, votosEscuelasBarrioData, poblacionTotalPorBarrio, eventosPorCircuito,
    });
  }).join('');

  const elecciones = [
    { key: 'G07', label: '2007', share: datos.Share_G07, shareCap: datos.ShareCap_G07 },
    { key: 'G11', label: '2011', share: datos.Share_G11, shareCap: datos.ShareCap_G11 },
    { key: 'G15', label: '2015', share: datos.Share_G15, shareCap: datos.ShareCap_G15 },
    { key: 'G19', label: '2019', share: datos.Share_G19, shareCap: datos.ShareCap_G19 },
    { key: 'G23', label: '2023', share: datos.Share_G23, shareCap: datos.ShareCap_G23 },
  ];
  
  const maxShare = Math.max(...elecciones.map(e => e.share || 0), ...elecciones.map(e => e.shareCap || 0), 0.6);
  const chartW = 500, chartH = 150, padL = 40, padR = 20, padT = 20, padB = 30;
  const getY = (v) => padT + (1 - v / maxShare) * (chartH - padT - padB);
  const getX = (i) => padL + (i / (elecciones.length - 1)) * (chartW - padL - padR);
  
  const circuitoPoints = elecciones.filter(e => e.share != null).map((e, i) => `${getX(elecciones.indexOf(e))},${getY(e.share)}`).join(' ');
  const capitalPoints = elecciones.filter(e => e.shareCap != null).map((e, i) => `${getX(elecciones.indexOf(e))},${getY(e.shareCap)}`).join(' ');
  
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ficha ${datos.CircuitoKey}</title>
<style>${estilosFichaPDF()}</style></head><body>

<div class="header" style="border-bottom-color:${colorDiagnosticoV4(datos.Categoria_v4)}">
  <h1 style="display:flex;align-items:center;gap:10px"><span style="display:inline-block;width:15px;height:15px;border-radius:50%;background:${colorDiagnosticoV4(datos.Categoria_v4)};flex-shrink:0"></span>CIRCUITO ${datos.CircuitoKey}</h1>
  <h2>${datos.cirn_nom}</h2>
  <div class="badges">
    <span class="badge" style="background:${COLORES_CATEGORIA[datos.Categoria_v4]?.bg}22;color:${COLORES_CATEGORIA[datos.Categoria_v4]?.text}">${COLORES_CATEGORIA[datos.Categoria_v4]?.label || datos.Categoria_v4}</span>
    <span class="badge" style="background:${COLORES_ML[datos.Categoria_ML]?.bg}22;color:${COLORES_ML[datos.Categoria_ML]?.text}">${COLORES_ML[datos.Categoria_ML]?.label || datos.Categoria_ML}</span>
  </div>
</div>

<div class="metrics">
  <div class="metric"><div class="metric-label">Padrón electoral (circuito) <span title="Personas habilitadas para votar en este circuito según el padrón electoral 2023." style="display:inline-flex;align-items:center;justify-content:center;width:12px;height:12px;border-radius:50%;border:1px solid #999;color:#999;font-size:9px;cursor:help;">i</span></div><div class="metric-value">${datos.Padron_G23?.toLocaleString() || '—'}</div><div class="metric-sub">${pctPadron}% de Capital</div></div>
  <div class="metric"><div class="metric-label">Victorias</div><div class="metric-value">${datos.Victorias_Total}/4</div></div>
  <div class="metric"><div class="metric-label">Gob. 2023</div><div class="metric-value ${datos.Share_G23 >= 0.5 ? 'green' : 'red'}">${(datos.Share_G23 * 100).toFixed(1)}%</div></div>
  <div class="metric"><div class="metric-label">Dip. 2025</div><div class="metric-value ${datos.Share_L25 >= 0.3 ? 'green' : 'red'}">${(datos.Share_L25 * 100).toFixed(1)}%</div></div>
</div>
${poblacionCircuitoTotal > 0 ? `<p style="font-size:11px;color:#666;margin:-10px 0 20px">En los barrios de este circuito viven ${Math.round(poblacionCircuitoTotal).toLocaleString()} personas; el padrón habilitado es ${datos.Padron_G23?.toLocaleString() || '—'}${pctPadronDePoblacion != null ? ` (${pctPadronDePoblacion.toFixed(0)}%)` : ''}.</p>` : ''}

<div class="section"><h3>Obras (en el circuito)</h3>${htmlObrasPDF(obrasCircuito)}</div>

<div class="section"><h3>Visitas del Gobernador</h3>${visitasCircuitoHtml}</div>

${encuestaHtml}

<div class="section"><h3>Pauta publicitaria</h3>${pautaCircuitoHtml}</div>

<div class="section">
  <h3>Evolución histórica - Gobernador</h3>
  <div class="chart-container">
    <svg width="100%" viewBox="0 0 ${chartW} ${chartH}">
      ${[0.2, 0.4, 0.6].filter(v => v <= maxShare).map(v => `<line x1="${padL}" y1="${getY(v)}" x2="${chartW - padR}" y2="${getY(v)}" stroke="#ddd" stroke-dasharray="3 3"/><text x="${padL - 5}" y="${getY(v) + 4}" text-anchor="end" font-size="10" fill="#999">${(v * 100).toFixed(0)}%</text>`).join('')}
      <polyline points="${capitalPoints}" fill="none" stroke="#999" stroke-width="2" stroke-dasharray="4 3"/>
      <polyline points="${circuitoPoints}" fill="none" stroke="#1976D2" stroke-width="2.5"/>
      ${elecciones.map((e, i) => e.share != null ? `<circle cx="${getX(i)}" cy="${getY(e.share)}" r="4" fill="#1976D2"/>` : '').join('')}
      ${elecciones.map((e, i) => `<text x="${getX(i)}" y="${chartH - 5}" text-anchor="middle" font-size="10" fill="#666">${e.label}</text>`).join('')}
    </svg>
    <div style="display:flex;gap:20px;margin-top:8px;font-size:11px">
      <div style="display:flex;align-items:center;gap:5px"><div style="width:20px;height:2px;background:#1976D2"></div>Circuito</div>
      <div style="display:flex;align-items:center;gap:5px"><div style="width:20px;height:0;border-top:2px dashed #999"></div>Capital</div>
    </div>
  </div>
</div>

<div class="section">
  <h3>Resultados históricos</h3>
  <table>
    <thead><tr><th>Elección</th><th class="text-right">% Votos</th><th class="text-right">vs Capital</th><th class="text-center">Resultado</th></tr></thead>
    <tbody>
      ${[
        { l: 'Gob. 2023', s: datos.Share_G23, c: datos.ShareCap_G23, g: datos.Gano_G23 },
        { l: 'Gob. 2019', s: datos.Share_G19, c: datos.ShareCap_G19, g: datos.Gano_G19 },
        { l: 'Dip. 2025', s: datos.Share_L25, c: datos.ShareCap_L25, g: datos.Gano_L25 },
        { l: 'Dip. 2021', s: datos.Share_L21, c: datos.ShareCap_L21, g: datos.Gano_L21 },
        { l: 'Int. 2019', s: datos.Share_Int19, c: datos.ShareCap_Int19, g: datos.Gano_Int19 },
      ].map(r => `<tr><td>${r.l}</td><td class="text-right"><strong>${(r.s * 100).toFixed(1)}%</strong></td><td class="text-right ${(r.s - r.c) >= 0 ? 'green' : 'red'}">${((r.s - r.c) * 100).toFixed(1)} pp</td><td class="text-center">${r.g != null ? (r.g ? '✓ GANÓ' : '✗ PERDIÓ') : '—'}</td></tr>`).join('')}
    </tbody>
  </table>
</div>

<div class="section">
  <h3>Comparativas</h3>
  <div class="comparativas">
    <div class="comp-box"><h4>Gob. 2019 → Gob. 2023</h4><div class="comp-value ${(datos.Share_G23 - datos.Share_G19) >= 0 ? 'green' : 'red'}">${(datos.Share_G23 - datos.Share_G19) >= 0 ? '+' : ''}${((datos.Share_G23 - datos.Share_G19) * 100).toFixed(1)} pp</div><div style="font-size:11px;color:#666;margin-top:4px">vs Capital: ${datos.Residual_Gov >= 0 ? '+' : ''}${(datos.Residual_Gov * 100).toFixed(1)} pp</div></div>
    <div class="comp-box"><h4>Efecto Llaryora (Int.19→G.23)</h4><div class="comp-value ${datos.Efecto_ML >= 0 ? 'green' : 'red'}">${datos.Efecto_ML >= 0 ? '+' : ''}${datos.Efecto_ML.toFixed(1)} pp</div></div>
    <div class="comp-box"><h4>Efecto Legislativo (D.21→D.25)</h4><div class="comp-value ${datos.Sch_Efecto >= 0 ? 'green' : 'red'}">${datos.Sch_Efecto >= 0 ? '+' : ''}${(datos.Sch_Efecto * 100).toFixed(1)} pp</div></div>
  </div>
  ${htmlTendenciasCircuitoPDF(datos)}
</div>

<div class="section">
  <h3>Composición del voto</h3>
  <div class="partidos-grid">
    <div class="partido-section">
      <h4>Gob. 2023</h4>
      ${partidosG23.slice(0, 5).map((p, i) => `<div class="partido-item"><span>${i + 1}. ${p.partido.substring(0, 25)}${p.partido.length > 25 ? '...' : ''}</span><strong>${(p.share * 100).toFixed(1)}%</strong></div>`).join('')}
    </div>
    <div class="partido-section">
      <h4>Dip. 2025</h4>
      ${partidosL25.slice(0, 5).map((p, i) => `<div class="partido-item"><span>${i + 1}. ${p.partido.substring(0, 25)}${p.partido.length > 25 ? '...' : ''}</span><strong>${(p.share * 100).toFixed(1)}%</strong></div>`).join('')}
    </div>
  </div>
</div>

${barriosCircuito.length > 0 ? `
<div class="section">
  <h3>Barrios del circuito (${barriosCircuito.length})</h3>
  <table><thead><tr><th>Barrio</th><th class="text-right">Población en el circuito</th><th class="text-right">% del total del barrio</th><th class="text-right" style="font-size:10px">Visitas</th><th class="text-center" style="font-size:10px">Pauta</th><th class="text-right" style="font-size:10px">Obras</th><th class="text-right" style="font-size:10px">Escuelas</th></tr></thead><tbody>${barriosVisibles.map(b => {
    const cobertura = calcularCoberturaBarrio(b.nombre, { recorridosLookup, pautasBarriosData, obrasEnriquecidas, votosEscuelasBarrioLookup });
    return `<tr><td>${b.nombre}</td><td class="text-right">${b.poblacion != null ? b.poblacion.toLocaleString() : '—'}</td><td class="text-right">${b.pct_en_circuito != null ? b.pct_en_circuito.toFixed(1) + '%' : '—'}</td><td class="text-right" style="font-size:10px">${pdfCeldaCantidad(cobertura.visitas)}</td><td class="text-center">${pdfBadgeEstadoPauta(cobertura.pauta)}</td><td class="text-right" style="font-size:10px">${pdfCeldaCantidad(cobertura.obras)}</td><td class="text-right" style="font-size:10px">${pdfCeldaCantidad(cobertura.escuelas)}</td></tr>`;
  }).join('')}</tbody><tfoot><tr style="font-weight:600;border-top:2px solid #ccc"><td>Total</td><td class="text-right">${Math.round(poblacionCircuitoTotal).toLocaleString()}</td><td></td><td></td><td></td><td></td><td></td></tr></tfoot></table>
  ${barriosOcultos > 0 ? `<p style="font-size:10px;color:#999;margin-top:6px">Se omiten ${barriosOcultos} barrio${barriosOcultos !== 1 ? 's' : ''} con menos de ${UMBRAL_POBLACION_BARRIO} habitantes en este circuito.</p>` : ''}
</div>
` : ''}

${escuelasCircuitoHtml}

${barrioPartHtml}

<div class="footer">Diagnóstico Territorial - Córdoba Capital │ Generado el ${formatearFecha(new Date())}</div>
</body></html>`;
  
  return html;
};

// ============================================
// PÁGINA PRINCIPAL
// ============================================
// Registro de secciones del reporte imprimible (components/reporte). Se arma acá porque
// los componentes de la UI que reutiliza viven en este archivo.
const REGISTRO_REPORTE = crearRegistroSecciones({
  ui: {
    SolapaResumen, SolapaEvolucion, SolapaPartidos, SolapaComparativas, SolapaTerritorio, SolapaResumenBarrio,
    SolapaTerritorioBarrio, SolapaEscuelasBarrio, ResumenEncuesta, ComparativoEncuesta,
    CabeceraCapital, ResultadosCapital, Badge, COLORES_CATEGORIA,
  },
  fn: {
    formatearFecha, normalizarNombreBarrio, buscarEncuestaCircuito, resolverCircuitoPrincipalDeBarrio,
    compararMapkey, estadoMostradoPauta, obtenerPautasDeBarrio, unificarVisitasPDF, visitasCircuitoPDF,
    htmlPautaPDF, htmlPautaCircuitoPDF, pautaCircuitoPDF, htmlObrasPDF, htmlBarraCategoriasPDF, htmlMejoraPDF,
    formatPct,
  },
});

export default function Home() {
  const [circuitoSeleccionado, setCircuitoSeleccionado] = useState(null);
  const [solapaActiva, setSolapaActiva] = useState('resumen');
  const [busqueda, setBusqueda] = useState('');
  const [datos, setDatos] = useState([]);
  const [partidos, setPartidos] = useState({});
  const [barrios, setBarrios] = useState({});
  const [geoData, setGeoData] = useState(null);
  const [barriosGeoData, setBarriosGeoData] = useState(null);
  const [obrasData, setObrasData] = useState([]);
  const [cruceData, setCruceData] = useState(null);
  const [recorridosData, setRecorridosData] = useState(null);
  const [pautasBarriosData, setPautasBarriosData] = useState(null);
  const [encuestasData, setEncuestasData] = useState(null);
  const [encuestasMetadata, setEncuestasMetadata] = useState(null);
  const [escuelasData, setEscuelasData] = useState(null);
  const [votosEscuelasCircuitoData, setVotosEscuelasCircuitoData] = useState(null);
  const [votosEscuelasBarrioData, setVotosEscuelasBarrioData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtroCategoria, setFiltroCategoria] = useState(null);
  const [mostrarInfo, setMostrarInfo] = useState(false);
  const [mostrarMenu, setMostrarMenu] = useState(false);
  const [mostrarListadoEncuestas, setMostrarListadoEncuestas] = useState(false);
  const [vistaFicha, setVistaFicha] = useState(null); // null | 'circuito' | 'barrio' | 'capital' | 'obras'
  const [barrioSeleccionado, setBarrioSeleccionado] = useState(null);
  const [zoomBarrioSolicitado, setZoomBarrioSolicitado] = useState(null); // { nombre, ts } | null — pedido puntual de zoom a barrio (buscador)
  const [rondaFechaSolicitada, setRondaFechaSolicitada] = useState(null); // fecha (YYYY-MM-DD) de ronda pedida al hacer click en un evento de Medición (tabla de cobertura), o null = última ronda (default de SolapaEncuestas)
  const [panelTab, setPanelTab] = useState('circuito');
  // Levantado desde MapaCircuitos (antes vivía ahí como estado local): pages/index.js
  // renderiza <MapaCircuitos> en dos bloques JSX distintos según vistaFicha (ver más
  // abajo), y cambiar de bloque desmonta/remonta el componente — si capasActivas vivía
  // adentro, cada vuelta al mapa perdía las capas activadas (ej. Pauta). Viviendo acá
  // arriba, sobrevive el remonte.
  const [capasActivas, setCapasActivas] = useState({ circuitos: true, barrios: false, obras: true, pauta: false, escuelas: false });
  const [obrasFoco, setObrasFoco] = useState('propio'); // 'propio' | 'cercanas' — qué sección de ObrasPanel viene destacada en la solapa Obras
  // CircuitoKey de origen cuando se llega a la solapa Pauta de un barrio desde el bloque
  // "Cobertura de pauta por barrio" (SolapaTerritorio de un circuito) — null en cualquier
  // otro camino. No se reusa circuitoSeleccionado como "origen" porque ese estado se pisa
  // en flujos no relacionados (ej. handleSelectBarrioDesdeBusqueda le asigna el circuito
  // PRINCIPAL del barrio buscado, no el circuito real de partida), así que no sirve como
  // breadcrumb confiable — investigado antes de construir esto (ver prompt del punto 4).
  // Se limpia en cualquier otra vía de navegación (handleSelectCircuito, handleSelectBarrio,
  // handleSelectBarrioDesdeBusqueda, handleMapClick) y se fija recién DESPUÉS de esas
  // llamadas en irABarrioDesdeCoberturaPauta, mismo truco de orden que ya usa el archivo
  // para pisar solapaActiva (ver irACircuitoDesdeGrillaMedicion).
  const [origenCoberturaPautaCircuito, setOrigenCoberturaPautaCircuito] = useState(null);
  const [obraSeleccionada, setObraSeleccionada] = useState(null); // obra (enriquecida) para ModalObra, o null
  // FichaObra (Vista Obras, Etapa 2): id_obra a mostrar, o null. Filtros/orden/pestaña
  // de Vista Obras lifted acá (no locales al componente) para que sobrevivan a
  // desmontar VistaObras al navegar a un barrio/circuito desde la ficha y volver —
  // mismo motivo que filtroCategoria para VistaCapital.
  const [fichaObraIdSeleccionada, setFichaObraIdSeleccionada] = useState(null);
  // Ronda 2: Vista Obras dejó de tener pestañas ("Estado general" vs "Planificación de
  // comunicación" se unificaron en una sola vista, ver comentario junto a VistaObras) —
  // un solo set de filtros/orden en vez de dos independientes. Se mantiene lifted a Home
  // (no local a VistaObras) porque VistaObras se desmonta al navegar a un barrio/circuito
  // desde la ficha de una obra y volver — mismo motivo que filtroCategoria en VistaCapital.
  const [vistaObrasBusqueda, setVistaObrasBusqueda] = useState('');
  const [vistaObrasFiltroCircuito, setVistaObrasFiltroCircuito] = useState('');
  const [vistaObrasFiltroBarrio, setVistaObrasFiltroBarrio] = useState('');
  const [vistaObrasFiltroReparticion, setVistaObrasFiltroReparticion] = useState('');
  const [vistaObrasFiltroAvance, setVistaObrasFiltroAvance] = useState('');
  const [vistaObrasOrdenColumna, setVistaObrasOrdenColumna] = useState('nombreObra');
  const [vistaObrasOrdenAsc, setVistaObrasOrdenAsc] = useState(true);
  const [vistaObrasFiltroAptoDifusion, setVistaObrasFiltroAptoDifusion] = useState('');
  const [vistaObrasFiltroEstadoRelevamiento, setVistaObrasFiltroEstadoRelevamiento] = useState('');
  const [vistaObrasFiltroPrioridad, setVistaObrasFiltroPrioridad] = useState('');
  const [vistaObrasFiltroEnvioComunicacion, setVistaObrasFiltroEnvioComunicacion] = useState('');
  const [vistaObrasModo, setVistaObrasModo] = useState('tabla'); // 'tabla' | 'calendario'
  const [vistaObrasAnio, setVistaObrasAnio] = useState(() => new Date().getFullYear());
  const [vistaObrasMes, setVistaObrasMes] = useState(() => new Date().getMonth());
  const [dialogExportCircuito, setDialogExportCircuito] = useState(null); // { barrios, seleccionados: Set<nombre>, principalNorm, modoEncuestas, rondasSeleccionadas: Set<idx> } | null — diálogo de opciones de exportación de la ficha de un circuito
  const [modalReporteAbierto, setModalReporteAbierto] = useState(false); // modal "Generar reporte" (secciones elegibles, ver SECCIONES_REPORTE)
  const [solapaActivaBarrio, setSolapaActivaBarrio] = useState('resumen'); // estado de tabs separado del de circuito (evita choques de clave, ej. 'resumen'/'escuelas'/'obras' existen en los dos)

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const [datosRes, partidosRes, barriosRes, geoRes, barriosGeoRes, obrasRes, cruceRes, recorridosRes, pautasBarriosRes, encuestasRes, encuestasMetaRes, escuelasRes, votosEscuelasCircuitoRes, votosEscuelasBarrioRes] = await Promise.all([
          fetch('/data/circuitos_completo.json'), fetch('/data/partidos_por_eleccion.json'),
          fetch('/data/barrios_por_circuito_completo.json'), fetch('/data/circuitos_cordoba.json'),
          fetch('/data/barrios_geo.json'), fetch('/data/obras_capital.json'),
          fetch('/data/circuito_barrios_cruce.json'),
          fetch('/data/recorridos_barrios.json'),
          fetch('/data/pautas_barrios.json'),
          fetch('/data/encuestas_circuitos.json'), fetch('/data/encuestas_metadata.json'),
          fetch('/data/escuelas_capital.json'), fetch('/data/votos_escuelas_por_circuito.json'),
          fetch('/data/votos_escuelas_por_barrio.json'),
        ]);
        setDatos(await datosRes.json()); setPartidos(await partidosRes.json());
        setBarrios(await barriosRes.json()); setGeoData(await geoRes.json());
        setBarriosGeoData(await barriosGeoRes.json()); setObrasData(await obrasRes.json());
        setCruceData(await cruceRes.json());
        setRecorridosData(await recorridosRes.json());
        setPautasBarriosData(await pautasBarriosRes.json());
        setEncuestasData(await encuestasRes.json()); setEncuestasMetadata(await encuestasMetaRes.json());
        setEscuelasData(await escuelasRes.json());
        setVotosEscuelasCircuitoData(await votosEscuelasCircuitoRes.json());
        setVotosEscuelasBarrioData(await votosEscuelasBarrioRes.json());
      } catch (e) { console.error('Error cargando datos:', e); }
      setCargando(false);
    };
    cargarDatos();
  }, []);
  
  const datosCircuito = useMemo(() => datos.find(d => d.CircuitoKey === circuitoSeleccionado), [datos, circuitoSeleccionado]);
  const encuestaCircuito = useMemo(() => buscarEncuestaCircuito(encuestasData, circuitoSeleccionado), [encuestasData, circuitoSeleccionado]);

  // GeoJSON de circuitos (mismo topojson.feature() que ya hace MapaCircuitos.js
  // internamente) — se recalcula acá aparte porque ObrasPanel/badge de obras cercanas
  // necesitan el centroide del polígono del circuito, algo que el mapa no expone hacia
  // afuera. Duplicar este parseo es aceptable (no vale la pena refactorizar cómo
  // MapaCircuitos expone su geoJsonData por esta única llamada extra).
  const circuitosGeoJsonData = useMemo(() => {
    if (!geoData) return null;
    try {
      const objectKey = Object.keys(geoData.objects)[0];
      if (!objectKey) return null;
      return topojson.feature(geoData, geoData.objects[objectKey]);
    } catch (e) {
      console.error('Error convirtiendo TopoJSON de circuitos:', e);
      return null;
    }
  }, [geoData]);

  // Índice barrio -> circuitos (circuito_barrios_cruce.json), fallback de
  // enriquecerObrasConCircuito para obras sin `circuito` propio (ver lib/obrasCercanas.js).
  const indiceBarrioCircuito = useMemo(() => construirIndiceBarrioCircuito(cruceData), [cruceData]);
  // Índice Mapkey -> nombre completo de circuito, para resolver el `circuito` crudo de
  // cada obra (fuente principal desde el fix de esquema, ver lib/obrasCercanas.js).
  const indiceMapkeyNombre = useMemo(() => construirIndiceMapkeyNombre(cruceData), [cruceData]);

  // Única fuente de obras que circula por el resto de la app (mapa, ObrasPanel, ModalObra):
  // cada obra ya trae _circuitoMapkey/_circuitoNombre resuelto, para que "toda obra en
  // cualquier lista muestra su circuito" quede garantizado acá, no repetido en cada
  // componente.
  const obrasEnriquecidas = useMemo(
    () => enriquecerObrasConCircuito(obrasData, indiceBarrioCircuito, indiceMapkeyNombre),
    [obrasData, indiceBarrioCircuito, indiceMapkeyNombre]
  );

  // Si cambiamos de circuito estando en la solapa Encuestas y el nuevo no tiene datos, volvemos a Resumen.
  useEffect(() => {
    if (solapaActiva === 'encuestas' && !encuestaCircuito) setSolapaActiva('resumen');
  }, [circuitoSeleccionado, encuestaCircuito, solapaActiva]);

  const resultadosBusqueda = useMemo(() => {
    if (!busqueda) return [];
    const lower = busqueda.toLowerCase();
    const circuitos = datos
      .filter(d => d.CircuitoKey?.toString().toLowerCase().includes(lower) || d.cirn_nom?.toLowerCase().includes(lower))
      .slice(0, 8)
      .map(d => ({ tipo: 'circuito', key: `c-${d.CircuitoKey}`, circuito: d }));
    const barrios = (barriosGeoData?.features || [])
      .filter(f => f.properties?.nombre_barrio?.toLowerCase().includes(lower))
      .slice(0, 8)
      .map(f => ({ tipo: 'barrio', key: `b-${f.properties.nombre_barrio}`, nombreBarrio: f.properties.nombre_barrio }));
    return [...circuitos, ...barrios];
  }, [datos, barriosGeoData, busqueda]);
  const padronTotal = useMemo(() => datos.reduce((sum, d) => sum + (d.Padron_G23 || 0), 0), [datos]);

  const barriosGeoLookup = useMemo(() => {
    const lookup = {};
    (barriosGeoData?.features || []).forEach(f => {
      const key = normalizarNombreBarrio(f.properties?.nombre_barrio);
      if (key) lookup[key] = f.properties;
    });
    return lookup;
  }, [barriosGeoData]);

  // Población total real de cada barrio = suma de "poblacion" a través de TODOS los
  // circuitos donde aparece en barrios_por_circuito_completo.json — no la fila del
  // circuito_principal (eso es solo la porción de ese barrio que cae en ese circuito).
  // Ver poblacionCircuito/construirPoblacionTotalPorBarrio para el detalle de por qué.
  const poblacionTotalPorBarrio = useMemo(() => construirPoblacionTotalPorBarrio(barrios), [barrios]);

  const recorridosLookup = useMemo(() => {
    const lookup = {};
    Object.entries(recorridosData || {}).forEach(([nombre, info]) => {
      const key = normalizarNombreBarrio(nombre);
      if (key) lookup[key] = info;
    });
    return lookup;
  }, [recorridosData]);

  // Los nombres de barrio de votos_escuelas_por_barrio.json vienen del catastro IDECOR,
  // sin pasar por normalizarNombreBarrio (mismo motivo que recorridosLookup) — se normalizan
  // acá para cruzar contra barriosGeoLookup.
  const votosEscuelasBarrioLookup = useMemo(() => {
    const lookup = {};
    Object.entries(votosEscuelasBarrioData?.barrios || {}).forEach(([nombre, info]) => {
      const key = normalizarNombreBarrio(nombre);
      if (key) lookup[key] = info;
    });
    return lookup;
  }, [votosEscuelasBarrioData]);

  const eventosPorCircuito = useMemo(
    () => construirEventosPorCircuito(datos, encuestasData, recorridosLookup, cruceData, pautasBarriosData, barriosGeoData),
    [datos, encuestasData, recorridosLookup, cruceData, pautasBarriosData, barriosGeoData]
  );

  const coberturaResumen = useMemo(() => {
    if (!encuestasData) return null;
    let encuestados = 0;
    let fechaMasReciente = null;
    datos.forEach(d => {
      const c = coberturaDesdeEncuesta(encuestasData, d.CircuitoKey);
      if (c.encuestado) {
        encuestados++;
        (c.fechas_rondas || []).forEach(f => {
          if (!fechaMasReciente || f > fechaMasReciente) fechaMasReciente = f;
        });
      }
    });
    return { encuestados, total: datos.length, fechaMasReciente };
  }, [encuestasData, datos]);

  // Selección de circuito por vías no geográficas (buscador, tabla, "zona", links del panel):
  // no hay un punto clickeado, así que el barrio se deriva del que más población le aporta
  // a ESTE circuito. orden_importancia NO sirve para esto (es el ranking del barrio sobre
  // SUS PROPIOS circuitos, dirección barrio->circuito — un circuito grande puede tener
  // varios barrios con orden_importancia:1 en simultáneo, ver comentario de
  // circuito_barrios_cruce.json en lib/data-manifest.js). El campo `poblacion` de cada
  // entrada de circuito_to_barrios YA es la población absoluta que ese barrio aporta a
  // ESTE circuito puntual (población total del barrio × su pct en este circuito, ya
  // calculado en el dato de origen) — no hace falta recalcularlo cruzando con
  // barrios_geo.json. Se excluye la fila sintética "Sin Barrio - Circuito ..." (mismo
  // descarte que ya usa pautaCapitalMarkers en components/MapaCircuitos.js), no es un
  // barrio real seleccionable.
  const handleSelectCircuito = (c) => {
    setCircuitoSeleccionado(c);
    setFiltroCategoria(null);
    setPanelTab('circuito');
    // Cambiar de circuito resetea siempre la solapa activa a Resumen — evita aterrizar
    // en una solapa que quedó activa desde el circuito/barrio anterior (ver también
    // handleSelectBarrio/handleSelectBarrioDesdeBusqueda/handleMapClick, mismos motivos).
    // Los dos flujos que deliberadamente saltan a "encuestas" (irACircuitoDesdeListadoEncuestas,
    // irACircuitoDesdeResumenBarrio) llaman a este handler y LUEGO pisan solapaActiva con su
    // propio setSolapaActiva('encuestas') — el orden dentro del mismo handler hace que ese
    // valor explícito gane.
    setSolapaActiva('resumen');
    setSolapaActivaBarrio('resumen');
    setRondaFechaSolicitada(null); // idem: solo irACircuitoDesdeGrillaMedicion pide una ronda puntual, y la pisa después de llamar acá
    setOrigenCoberturaPautaCircuito(null); // idem: solo irABarrioDesdeCoberturaPauta lo fija, y lo hace después de llamar acá
    const d = datos.find(x => x.CircuitoKey === c);
    const clave = d ? `${d.Mapkey} - ${d.cirn_nom}` : null;
    const lista = (clave ? cruceData?.circuito_to_barrios?.[clave] : null)?.filter(b => b.barrio && !b.barrio.startsWith('Sin Barrio')) || [];
    const principal = lista.reduce((max, b) => ((b.poblacion || 0) > (max?.poblacion || 0) ? b : max), null);
    if (principal) {
      const key = normalizarNombreBarrio(principal.barrio_normalizado);
      const feature = barriosGeoLookup[key];
      setBarrioSeleccionado(feature ? feature.nombre_barrio : principal.barrio_normalizado);
    } else {
      setBarrioSeleccionado(null);
    }
  };
  // Usado por los links "Otros barrios en este circuito": solo cambia el barrio, el circuito
  // actual no se toca (seguimos en el mismo circuito, solo mostrando otro barrio suyo).
  // "solapa" es opcional (default 'resumen', mismo criterio que onVerFicha para circuito
  // en la línea de abajo) — permite pedir que la ficha de barrio aterrice en una solapa
  // puntual (ver irABarrioDesdeMapaPauta) sin romper los callers existentes.
  const handleSelectBarrio = (nombre, solapa) => { setBarrioSeleccionado(nombre); setPanelTab('barrio'); setSolapaActivaBarrio(solapa || 'resumen'); setOrigenCoberturaPautaCircuito(null); };

  // Selección de barrio desde el buscador: a diferencia de "Otros barrios en este circuito"
  // (que mantiene el circuito activo sin tocarlo), acá no hay circuito activo relevante que
  // preservar — se deriva el circuito correspondiente al barrio (circuito_principal, con
  // circuito_barrios_cruce.json como respaldo si falta) y se pide zoom sobre el barrio en el
  // mapa (MapaCircuitos decide si puede, según si la capa Barrios está visible).
  const handleSelectBarrioDesdeBusqueda = (nombreBarrio) => {
    setBarrioSeleccionado(nombreBarrio);
    setPanelTab('barrio');
    setFiltroCategoria(null);
    setSolapaActivaBarrio('resumen');
    setOrigenCoberturaPautaCircuito(null); // idem handleSelectBarrio: no pasa por ahí, mismo reset

    const circuitoRecord = resolverCircuitoPrincipalDeBarrio(nombreBarrio, cruceData, barriosGeoLookup, datos);
    setCircuitoSeleccionado(circuitoRecord ? circuitoRecord.CircuitoKey : null);
    setZoomBarrioSolicitado({ nombre: nombreBarrio, ts: Date.now() });
  };

  // Click en el mapa: turf ya determinó geométricamente ambas selecciones de forma
  // independiente (ver ClickHandler en MapaCircuitos.js) — se aplican tal cual, sin cruce.
  const handleMapClick = (circuitoKey, nombreBarrio) => {
    setCircuitoSeleccionado(circuitoKey);
    setBarrioSeleccionado(nombreBarrio);
    setFiltroCategoria(null);
    setSolapaActiva('resumen');
    setSolapaActivaBarrio('resumen');
    setRondaFechaSolicitada(null); // no pasa por handleSelectCircuito — mismo reset, evita arrastrar una ronda pedida para el circuito anterior
    setOrigenCoberturaPautaCircuito(null); // idem: no pasa por handleSelectCircuito/handleSelectBarrio, mismo reset
  };

  // Click en una celda de la grilla de cobertura: selecciona el circuito y vuelve
  // a la vista de mapa (Estado 1) para verlo resaltado ahí.
  const irACircuitoDesdeGrilla = (circuitoKey) => {
    handleSelectCircuito(circuitoKey);
    setVistaFicha(null);
  };

  // Click en una fila del listado de "Circuitos con encuesta": va directo a la
  // ficha del circuito, solapa Encuestas.
  const irACircuitoDesdeListadoEncuestas = (circuitoKey) => {
    handleSelectCircuito(circuitoKey);
    setVistaFicha('circuito');
    setSolapaActiva('encuestas');
  };

  // Click en "Ver ficha completa del circuito" desde el Resumen de la ficha de barrio:
  // va directo a la ficha de ese circuito, solapa Encuestas (mismo patrón que arriba).
  const irACircuitoDesdeResumenBarrio = (circuito) => {
    handleSelectCircuito(circuito.CircuitoKey);
    setVistaFicha('circuito');
    setSolapaActiva('encuestas');
  };

  // Click en una fila de "Barrios del circuito" o "Barrios cercanos" (solapa Territorio,
  // de la ficha de circuito o de la de barrio): misma selección de barrio que ya usan
  // los links "Otros barrios en este circuito" (handleSelectBarrio, no un camino nuevo),
  // sumando el cambio de vistaFicha para abrir directamente la ficha completa de ese
  // barrio (acá sí, a diferencia del panel mini, ya estamos parados en una ficha
  // completa y el click debe llevar a otra).
  const irABarrioDesdeTerritorio = (nombreBarrio) => {
    handleSelectBarrio(nombreBarrio);
    setVistaFicha('barrio');
  };

  // Click en una fila de "Cobertura de pauta por barrio" (BloqueCoberturaPautaBarrios,
  // solapa Territorio de la ficha de circuito): mismo patrón que irABarrioDesdeTerritorio
  // (selección no geográfica de barrio + apertura de ficha completa), pero pidiendo
  // directo la solapa Pauta en vez del default Resumen — mismo criterio que
  // irABarrioDesdeMapaPauta (MapaCircuitos), acá disparado desde el bloque nuevo en vez
  // del popup del mapa. Guarda el circuito de origen (capturado ANTES de llamar a
  // handleSelectBarrio, que lo limpia) para el link "← Volver a barrios de [circuito]" de
  // SolapaPautaBarrio — se fija DESPUÉS de handleSelectBarrio, mismo orden que ya usa el
  // archivo para pisar solapaActiva (ver irACircuitoDesdeGrillaMedicion).
  const irABarrioDesdeCoberturaPauta = (nombreBarrio) => {
    const circuitoOrigen = circuitoSeleccionado;
    handleSelectBarrio(nombreBarrio, 'pauta');
    setVistaFicha('barrio');
    setOrigenCoberturaPautaCircuito(circuitoOrigen);
  };

  // Click en un chip de circuito de FichaObra (Vista Obras, Etapa 2 — navegación
  // cruzada): recibe el Mapkey (ej. "007D"), no el CircuitoKey que espera
  // handleSelectCircuito. Se resuelve buscando el registro de `datos` con ese Mapkey y
  // usando SU PROPIO CircuitoKey — necesario porque CircuitoKey es number para los
  // circuitos puramente numéricos (13, 12, ...) y string para los alfanuméricos
  // (10C, 4A, ...), mientras que el `circuito` crudo de una obra siempre es string:
  // comparar por Mapkey evita ese mismatch de tipos en vez de pasar el string crudo.
  const irACircuitoDesdeObra = (mapkey) => {
    const match = datos.find((d) => d.Mapkey === mapkey);
    if (match) { handleSelectCircuito(match.CircuitoKey); setVistaFicha('circuito'); }
  };

  // Click en "Ver en solapa Pauta" del popup de estrella de pauta (MapaCircuitos):
  // mismo patrón que irABarrioDesdeTerritorio (selección no geográfica de barrio +
  // apertura de ficha completa), pidiendo la solapa 'pauta' en vez del default 'resumen'.
  const irABarrioDesdeMapaPauta = (nombreBarrio) => {
    handleSelectBarrio(nombreBarrio, 'pauta');
    setVistaFicha('barrio');
  };

  // Click en "Ver en solapa Territorio" del popup de estrella de Alcance Capital
  // (MapaCircuitos): mismo patrón que irACircuitoDesdeListadoEncuestas (ficha completa +
  // pisar solapaActiva), pero a Territorio en vez de Encuestas — ahí es donde vive
  // BloqueAlcanceCapital, no hay solapa Pauta propia de circuito. setObrasFoco('propio')
  // por el mismo motivo que el click directo en la solapa Territorio (línea del array
  // `solapas` más abajo): aterrizar siempre en la sección de obras propias del circuito.
  const irACircuitoDesdeMapaPauta = (circuitoKey) => {
    handleSelectCircuito(circuitoKey);
    setVistaFicha('circuito');
    setSolapaActiva('territorio');
    setObrasFoco('propio');
  };

  // Click en un evento de tipo Medición (tabla de cobertura, BarraCobertura): mismo
  // patrón que irACircuitoDesdeListadoEncuestas (ficha completa, solapa Encuestas),
  // sumando la fecha de la ronda pedida — handleSelectCircuito ya resetea
  // rondaFechaSolicitada a null, así que fijarlo acá DESPUÉS es lo que hace que la
  // ronda pedida gane (mismo orden que ya usa el archivo para solapaActiva).
  const irACircuitoDesdeGrillaMedicion = (circuitoKey, fecha) => {
    handleSelectCircuito(circuitoKey);
    setVistaFicha('circuito');
    setSolapaActiva('encuestas');
    setRondaFechaSolicitada(fecha);
  };

  // Escuelas y Obras se fusionaron dentro de Territorio (población/padrón, Obras,
  // Escuelas y Circuitos de la zona, en ese orden) — ya no son solapas propias.
  const solapas = [
    { key: 'resumen', label: 'Resumen' }, { key: 'evolucion', label: 'Evolución' }, { key: 'partidos', label: 'Partidos' },
    { key: 'territorio', label: 'Territorio' }, { key: 'comparativas', label: 'Comparativas' },
    ...(encuestaCircuito ? [{ key: 'encuestas', label: 'Encuestas' }] : []),
  ];

  const solapasBarrio = [
    { key: 'resumen', label: 'Resumen' }, { key: 'territorio', label: 'Territorio' }, { key: 'visitas', label: 'Visitas' },
    { key: 'pauta', label: 'Pauta' }, { key: 'escuelas', label: 'Escuelas' }, { key: 'obras', label: 'Obras' },
  ];
  
  // Contexto del reporte: barrio abierto en ficha > circuito seleccionado > toda la Capital.
  const contextoReporte = useMemo(() => {
    const base = {
      datos, cruceData, barrios, partidos, padronTotal, barriosGeoLookup, barriosGeoData, encuestasData, encuestasMetadata,
      recorridosLookup, pautasBarriosData, obrasEnriquecidas, votosEscuelasCircuitoData, votosEscuelasBarrioLookup,
      votosEscuelasBarrioData, poblacionTotalPorBarrio, eventosPorCircuito, circuitosGeoJsonData,
    };
    if (vistaFicha === 'barrio' && barrioSeleccionado) {
      const feature = barriosGeoLookup[normalizarNombreBarrio(barrioSeleccionado)];
      return { ...base, tipo: 'barrio', nombreBarrio: feature?.nombre_barrio || barrioSeleccionado, barrioProps: feature || null };
    }
    if (circuitoSeleccionado && datosCircuito) return { ...base, tipo: 'circuito', datosCircuito };
    return { ...base, tipo: 'capital' };
  }, [datos, cruceData, barrios, partidos, padronTotal, barriosGeoLookup, barriosGeoData, encuestasData, encuestasMetadata, recorridosLookup, pautasBarriosData, obrasEnriquecidas,
    votosEscuelasCircuitoData, votosEscuelasBarrioLookup, votosEscuelasBarrioData, poblacionTotalPorBarrio, eventosPorCircuito, circuitosGeoJsonData,
    vistaFicha, barrioSeleccionado, circuitoSeleccionado, datosCircuito]);
  const tituloContextoReporte = contextoReporte.tipo === 'barrio' ? `Barrio ${contextoReporte.nombreBarrio}`
    : contextoReporte.tipo === 'circuito' ? `Circuito ${contextoReporte.datosCircuito.CircuitoKey} — ${contextoReporte.datosCircuito.cirn_nom || ''}` : 'Córdoba Capital';
  const rondasReporte = useMemo(() => infoEncuestasContexto(contextoReporte, buscarEncuestaCircuito, resolverCircuitoPrincipalDeBarrio), [contextoReporte]);
  const generarReporte = async (seleccion) => {
    const partes = await armarReporte({ ctx: contextoReporte, seleccion, registro: REGISTRO_REPORTE, tituloContexto: tituloContextoReporte, formatearFecha, estilos: estilosReporte });
    setModalReporteAbierto(false);
    imprimirReporte(partes);
  };

  // En la ficha de un barrio (vistaFicha === 'barrio') exporta SOLO ese barrio —
  // cualquiera, no solo el principal de algún circuito — reutilizando generarFichaBarrioPDF,
  // sin diálogo (comportamiento sin cambios). En la ficha de circuito, en cambio, abre el
  // selector de barrios antes de generar el PDF (ver abrirSelectorExportCircuito).
  const exportarPDF = () => {
    if (vistaFicha === 'barrio' && barrioSeleccionado) {
      const props = barriosGeoLookup[normalizarNombreBarrio(barrioSeleccionado)];
      if (!props) return;
      const html = generarFichaBarrioPDF({
        nombreBarrio: barrioSeleccionado, props,
        cruceData, barriosGeoLookup, todosLosDatos: datos, encuestasData,
        recorridosLookup, pautasBarriosData, obrasEnriquecidas, barriosGeoData,
        votosEscuelasBarrioLookup, votosEscuelasBarrioData, poblacionTotalPorBarrio, eventosPorCircuito,
      });
      abrirVentanaImpresion(html);
      return;
    }
    abrirSelectorExportCircuito();
  };

  // Arma la lista del diálogo con los mismos datos que la tabla "Barrios del circuito"
  // de Territorio, pero ordenados por población (no por orden_importancia) — el
  // barrio principal viene premarcado. Si el circuito tiene encuesta con 2+ rondas,
  // arranca con todas las rondas tildadas (para "Elegir rondas") y modo "Última ronda"
  // por defecto (mismo comportamiento que antes de existir estas 3 opciones).
  const abrirSelectorExportCircuito = () => {
    if (!datosCircuito) return;
    const mapkey = datosCircuito.Mapkey;
    const barriosCircuitoOrdenados = [...(barrios?.[mapkey]?.barrios || [])].sort((a, b) => (b.poblacion || 0) - (a.poblacion || 0));
    const principal = resolverBarrioPrincipalDeCircuito(datosCircuito, cruceData, barriosGeoLookup);
    const principalNorm = principal ? normalizarNombreBarrio(principal.nombreBarrio) : null;
    const seleccionados = new Set(
      barriosCircuitoOrdenados.filter(b => principalNorm && normalizarNombreBarrio(b.nombre) === principalNorm).map(b => b.nombre)
    );
    const cantidadRondas = encuestaCircuito?.cantidad_rondas || 0;
    setDialogExportCircuito({
      barrios: barriosCircuitoOrdenados,
      seleccionados,
      principalNorm,
      modoEncuestas: 'ultima',
      rondasSeleccionadas: new Set(Array.from({ length: cantidadRondas }, (_, i) => i)),
    });
  };

  const toggleBarrioExportCircuito = (nombre) => {
    setDialogExportCircuito(prev => {
      if (!prev) return prev;
      const seleccionados = new Set(prev.seleccionados);
      if (seleccionados.has(nombre)) seleccionados.delete(nombre); else seleccionados.add(nombre);
      return { ...prev, seleccionados };
    });
  };

  const setModoEncuestasExportCircuito = (modo) => {
    setDialogExportCircuito(prev => prev ? { ...prev, modoEncuestas: modo } : prev);
  };

  const toggleRondaExportCircuito = (idx) => {
    setDialogExportCircuito(prev => {
      if (!prev) return prev;
      const rondasSeleccionadas = new Set(prev.rondasSeleccionadas);
      if (rondasSeleccionadas.has(idx)) rondasSeleccionadas.delete(idx); else rondasSeleccionadas.add(idx);
      return { ...prev, rondasSeleccionadas };
    });
  };

  // Cero barrios marcados = solo la parte de circuito (generarFichaPDF no agrega
  // ninguna sección de barrio); varios marcados = una sección por cada uno, en orden.
  const confirmarExportCircuito = () => {
    if (!datosCircuito || !dialogExportCircuito) return;
    const html = generarFichaPDF({
      datos: datosCircuito, barrios, partidos, padronTotal,
      eventosPorCircuito, encuestaCircuito, encuestasData, encuestasMetadata,
      cruceData, barriosGeoLookup, barriosGeoData, poblacionTotalPorBarrio,
      recorridosLookup, pautasBarriosData, obrasEnriquecidas,
      votosEscuelasCircuitoData, votosEscuelasBarrioLookup, votosEscuelasBarrioData,
      nombresBarriosParaExportar: Array.from(dialogExportCircuito.seleccionados),
      modoEncuestas: dialogExportCircuito.modoEncuestas,
      rondasSeleccionadas: Array.from(dialogExportCircuito.rondasSeleccionadas).sort((a, b) => a - b),
    });
    abrirVentanaImpresion(html);
    setDialogExportCircuito(null);
  };
  
  if (cargando) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', fontFamily: '-apple-system, sans-serif' }}><div style={{ textAlign: 'center' }}><div style={{ fontSize: '18px', color: '#666', marginBottom: '10px' }}>Cargando datos...</div><div style={{ fontSize: '14px', color: '#999' }}>119 circuitos electorales</div></div></div>;
  }
  
  return (
    <>
      <Head><title>Diagnóstico Territorial - Córdoba Capital</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <style jsx global>{`
        :root { --bg-primary: #ffffff; --bg-secondary: #f5f5f5; --text-primary: #1a1a1a; --text-secondary: #666666; --text-tertiary: #999999; --border: #e0e0e0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f0f0f0; }
        .leaflet-container { z-index: 1 !important; }
      `}</style>
      
      <InfoModal isOpen={mostrarInfo} onClose={() => setMostrarInfo(false)} />
      <ModalObra obra={obraSeleccionada} onClose={() => setObraSeleccionada(null)} onSelectObra={setObraSeleccionada} obrasEnriquecidas={obrasEnriquecidas} />
      {/* Gateada también por vistaFicha === 'obras': si el usuario sale de Vista Obras
          por cualquier otro camino (☰ Menú, etc.) mientras la ficha está abierta, se
          oculta sola en vez de quedar flotando sobre una vista distinta. */}
      {vistaFicha === 'obras' && fichaObraIdSeleccionada && (
        <FichaObra
          idObra={fichaObraIdSeleccionada}
          obrasEnriquecidas={obrasEnriquecidas}
          onClose={() => setFichaObraIdSeleccionada(null)}
          onIrABarrio={irABarrioDesdeTerritorio}
          onIrACircuito={irACircuitoDesdeObra}
        />
      )}
      <ModalReporte isOpen={modalReporteAbierto} ctx={contextoReporte} registro={REGISTRO_REPORTE} tituloContexto={tituloContextoReporte} rondas={rondasReporte} formatearFecha={formatearFecha} useFocusTrap={useFocusTrap} onGenerar={generarReporte} onCancelar={() => setModalReporteAbierto(false)} />
      {datosCircuito && (
        <DialogExportFicha
          datosCircuito={datosCircuito}
          dialog={dialogExportCircuito}
          encuestaCircuito={encuestaCircuito}
          onToggleBarrio={toggleBarrioExportCircuito}
          onSetModoEncuestas={setModoEncuestasExportCircuito}
          onToggleRonda={toggleRondaExportCircuito}
          onExportar={confirmarExportCircuito}
          onCancelar={() => setDialogExportCircuito(null)}
        />
      )}
      
      <div style={{ minHeight: '100vh' }}>
        <header style={{ padding: '14px 24px', backgroundColor: '#fff', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 1000 }}>
          <div>
            <h1 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)' }}>Diagnóstico Territorial</h1>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px' }}>Córdoba Capital — 119 circuitos</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setMostrarMenu(!mostrarMenu)} style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>☰ Menú</button>
              {mostrarMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 1998 }} onClick={() => setMostrarMenu(false)} />
                  <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '6px', backgroundColor: '#fff', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 1999, minWidth: '210px', overflow: 'hidden' }}>
                    <button onClick={() => { setMostrarInfo(true); setMostrarMenu(false); }} style={{ width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', backgroundColor: 'transparent', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>ℹ️ Info</button>
                    <button onClick={() => { setVistaFicha('capital'); setCircuitoSeleccionado(null); setMostrarMenu(false); }} style={{ width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', backgroundColor: 'transparent', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>📊 Estadísticas de Capital</button>
                    <button onClick={() => { setVistaFicha('obras'); setCircuitoSeleccionado(null); setMostrarMenu(false); }} style={{ width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', backgroundColor: 'transparent', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>🏗️ Obras</button>
                    <button
                      onClick={() => { setMostrarListadoEncuestas(true); setMostrarMenu(false); }}
                      style={{ width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', backgroundColor: 'transparent', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}
                    >
                      📋 Encuestas
                    </button>
                  </div>
                </>
              )}
            </div>
            <button onClick={() => setModalReporteAbierto(true)} style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>🗂️ Generar reporte</button>
            {(circuitoSeleccionado || (vistaFicha === 'barrio' && barrioSeleccionado)) && <button onClick={exportarPDF} style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>📄 Exportar ficha</button>}
            <div style={{ position: 'relative' }}>
              <input type="text" placeholder="Buscar circuito o barrio..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ padding: '12px 18px', paddingLeft: '44px', width: '300px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '15px', backgroundColor: 'var(--bg-secondary)' }} />
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: '16px' }}>🔍</span>
              {busqueda && resultadosBusqueda.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid var(--border)', borderRadius: '10px', marginTop: '6px', maxHeight: '350px', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 9999 }}>
                  {resultadosBusqueda.map(r => (
                    <div
                      key={r.key}
                      onClick={() => {
                        if (r.tipo === 'circuito') handleSelectCircuito(r.circuito.CircuitoKey);
                        else handleSelectBarrioDesdeBusqueda(r.nombreBarrio);
                        setBusqueda('');
                      }}
                      style={{ padding: '14px 18px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}
                    >
                      <span style={{ fontSize: '15px' }}>
                        {r.tipo === 'circuito' ? <><strong>{r.circuito.CircuitoKey}</strong> - {r.circuito.cirn_nom}</> : r.nombreBarrio}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span style={{
                          fontSize: '10px', fontWeight: 600, padding: '3px 9px', borderRadius: '999px',
                          backgroundColor: r.tipo === 'circuito' ? '#1976D218' : '#5C6BC018',
                          color: r.tipo === 'circuito' ? '#1565C0' : '#3949AB',
                        }}>
                          {r.tipo === 'circuito' ? 'Circuito' : 'Barrio'}
                        </span>
                        {r.tipo === 'circuito' && <Badge categoria={r.circuito.Categoria_v4} tipo="v4" />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {mostrarListadoEncuestas && (
          <div style={{ backgroundColor: '#fff', borderBottom: '1px solid var(--border)' }}>
            <div style={{ padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Circuitos con encuesta</span>
              <button onClick={() => setMostrarListadoEncuestas(false)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕ Cerrar</button>
            </div>
            <ListadoEncuestasCircuitos datos={datos} encuestasData={encuestasData} onSelectCircuito={(c) => { irACircuitoDesdeListadoEncuestas(c); setMostrarListadoEncuestas(false); }} />
          </div>
        )}

        <BarraCobertura resumen={coberturaResumen} datos={datos} eventosPorCircuito={eventosPorCircuito} onClickVisita={irACircuitoDesdeGrilla} onClickMedicion={irACircuitoDesdeGrillaMedicion} onClickPauta={irABarrioDesdeMapaPauta} />

        <div style={{ display: 'flex', height: 'calc(100vh - 118px)' }}>
          {(vistaFicha === 'circuito' || vistaFicha === 'capital' || vistaFicha === 'barrio' || vistaFicha === 'obras') ? (
            <>
              <div style={{ flex: '1', padding: '18px', overflowY: 'auto' }}>
                {vistaFicha === 'obras' ? (
                  <>
                    <div style={{ marginBottom: '16px' }}>
                      <button onClick={() => setVistaFicha(null)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Volver al mapa</button>
                    </div>
                    <VistaObras
                      obrasData={obrasData}
                      busqueda={vistaObrasBusqueda} setBusqueda={setVistaObrasBusqueda}
                      filtroCircuito={vistaObrasFiltroCircuito} setFiltroCircuito={setVistaObrasFiltroCircuito}
                      filtroBarrio={vistaObrasFiltroBarrio} setFiltroBarrio={setVistaObrasFiltroBarrio}
                      filtroReparticion={vistaObrasFiltroReparticion} setFiltroReparticion={setVistaObrasFiltroReparticion}
                      filtroAvance={vistaObrasFiltroAvance} setFiltroAvance={setVistaObrasFiltroAvance}
                      ordenColumna={vistaObrasOrdenColumna} setOrdenColumna={setVistaObrasOrdenColumna}
                      ordenAsc={vistaObrasOrdenAsc} setOrdenAsc={setVistaObrasOrdenAsc}
                      onSelectObra={setFichaObraIdSeleccionada}
                      filtroAptoDifusion={vistaObrasFiltroAptoDifusion} setFiltroAptoDifusion={setVistaObrasFiltroAptoDifusion}
                      filtroEstadoRelevamiento={vistaObrasFiltroEstadoRelevamiento} setFiltroEstadoRelevamiento={setVistaObrasFiltroEstadoRelevamiento}
                      filtroPrioridad={vistaObrasFiltroPrioridad} setFiltroPrioridad={setVistaObrasFiltroPrioridad}
                      filtroEnvioComunicacion={vistaObrasFiltroEnvioComunicacion} setFiltroEnvioComunicacion={setVistaObrasFiltroEnvioComunicacion}
                      modo={vistaObrasModo} setModo={setVistaObrasModo}
                      anio={vistaObrasAnio} setAnio={setVistaObrasAnio}
                      mes={vistaObrasMes} setMes={setVistaObrasMes}
                    />
                  </>
                ) : vistaFicha === 'barrio' ? (
                  barrioSeleccionado && barriosGeoLookup[normalizarNombreBarrio(barrioSeleccionado)] ? (
                    <>
                      <div style={{ padding: '16px 20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>{barrioSeleccionado}</h2>
                            <button onClick={() => { setBarrioSeleccionado(null); setVistaFicha(null); }} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕ Cerrar</button>
                            <button onClick={() => setVistaFicha(null)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Volver al mapa</button>
                          </div>
                          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                            {barriosGeoLookup[normalizarNombreBarrio(barrioSeleccionado)].tipo_barrio === 'BarrioOficial' ? 'Barrio oficial' : 'Barrio no oficial'}
                          </p>
                        </div>
                        {/* Parte 2: badge "PAUTA ACTIVA" + acceso directo a la solapa Pauta — mismo
                            criterio de vigencia que estadoPautaBarrio/pautaEstaVigente (map/badges),
                            combinado en Mesa de Capital vía tienePautaActivaBarrio. Clickeable (mismo
                            patrón que el chip "📊 Tiene encuesta" del header de circuito, más abajo):
                            hace de badge Y de "Ir a Pauta" a la vez, en vez de dos controles separados. */}
                        {tienePautaActivaBarrio(barrioSeleccionado, pautasBarriosData, obrasEnriquecidas) && (
                          <span onClick={() => setSolapaActivaBarrio('pauta')} title="Ir a la solapa Pauta" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', backgroundColor: '#2E7D3218', color: '#2E7D32', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            ● PAUTA ACTIVA
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                        {solapasBarrio.map(s => <button key={s.key} onClick={() => setSolapaActivaBarrio(s.key)} style={{ padding: '10px 18px', borderRadius: '8px', border: 'none', backgroundColor: solapaActivaBarrio === s.key ? '#1976D2' : 'transparent', color: solapaActivaBarrio === s.key ? '#fff' : 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}>{s.label}</button>)}
                      </div>
                      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', minHeight: '400px' }}>
                        {solapaActivaBarrio === 'resumen' && (
                          <SolapaResumenBarrio
                            nombreBarrio={barrioSeleccionado}
                            props={barriosGeoLookup[normalizarNombreBarrio(barrioSeleccionado)]}
                            cruceData={cruceData}
                            barriosGeoLookup={barriosGeoLookup}
                            todosLosDatos={datos}
                            encuestasData={encuestasData}
                            recorridosLookup={recorridosLookup}
                            pautasBarriosData={pautasBarriosData}
                            votosEscuelasBarrioLookup={votosEscuelasBarrioLookup}
                            obrasEnriquecidas={obrasEnriquecidas}
                            poblacionTotalPorBarrio={poblacionTotalPorBarrio}
                            onIrACircuito={irACircuitoDesdeResumenBarrio}
                            onCambiarSolapa={setSolapaActivaBarrio}
                          />
                        )}
                        {solapaActivaBarrio === 'territorio' && <SolapaTerritorioBarrio nombreBarrio={barrioSeleccionado} barriosGeoData={barriosGeoData} onSelectBarrioFicha={irABarrioDesdeTerritorio} />}
                        {solapaActivaBarrio === 'visitas' && <SolapaVisitasBarrio nombreBarrio={barrioSeleccionado} recorridosLookup={recorridosLookup} />}
                        {solapaActivaBarrio === 'pauta' && (
                          <SolapaPautaBarrio
                            nombreBarrio={barrioSeleccionado}
                            pautasBarriosData={pautasBarriosData}
                            obrasEnriquecidas={obrasEnriquecidas}
                            origenCircuito={origenCoberturaPautaCircuito != null ? datos.find(d => d.CircuitoKey === origenCoberturaPautaCircuito) : null}
                            onVolverACircuito={irACircuitoDesdeMapaPauta}
                          />
                        )}
                        {solapaActivaBarrio === 'escuelas' && <SolapaEscuelasBarrio nombreBarrio={barrioSeleccionado} votosEscuelasBarrioLookup={votosEscuelasBarrioLookup} promedioCapitalPct={votosEscuelasBarrioData?.promedio_capital_pct} />}
                        {solapaActivaBarrio === 'obras' && <SolapaObrasBarrio nombreBarrio={barrioSeleccionado} obrasEnriquecidas={obrasEnriquecidas} barriosGeoData={barriosGeoData} onSelectObra={setObraSeleccionada} />}
                      </div>
                    </>
                  ) : (
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px' }}>
                      <div style={{ marginBottom: '16px' }}>
                        <button onClick={() => setVistaFicha(null)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Volver al mapa</button>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>Seleccioná un barrio para ver su ficha.</div>
                    </div>
                  )
                ) : circuitoSeleccionado && datosCircuito ? (
                  <>
                    <div style={{ padding: '16px 20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `3px solid ${colorDiagnosticoV4(datosCircuito.Categoria_v4)}` }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <PuntoDiagnostico categoria={datosCircuito.Categoria_v4} />
                          <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>CIRCUITO {circuitoSeleccionado}</h2>
                          <button onClick={() => { setCircuitoSeleccionado(null); setFiltroCategoria(null); setVistaFicha(null); }} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕ Cerrar</button>
                          <button onClick={() => setVistaFicha(null)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Volver al mapa</button>
                        </div>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '6px' }}>{datosCircuito.cirn_nom}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Badge categoria={datosCircuito.Categoria_v4} tipo="v4" />
                        {encuestaCircuito && (
                          <span onClick={() => setSolapaActiva('encuestas')} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', backgroundColor: '#1976D218', color: '#1565C0', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                            📊 Tiene encuesta
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                      {solapas.map(s => <button key={s.key} onClick={() => { setSolapaActiva(s.key); if (s.key === 'territorio') setObrasFoco('propio'); }} style={{ padding: '10px 18px', borderRadius: '8px', border: 'none', backgroundColor: solapaActiva === s.key ? '#1976D2' : 'transparent', color: solapaActiva === s.key ? '#fff' : 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}>{s.label}</button>)}
                    </div>
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', minHeight: '400px' }}>
                      {solapaActiva === 'resumen' && <SolapaResumen circuito={circuitoSeleccionado} datos={datosCircuito} padronTotal={padronTotal} encuestasData={encuestasData} />}
                      {solapaActiva === 'evolucion' && <SolapaEvolucion circuito={circuitoSeleccionado} datos={datosCircuito} />}
                      {solapaActiva === 'partidos' && <SolapaPartidos circuito={circuitoSeleccionado} datos={datosCircuito} partidos={partidos} />}
                      {solapaActiva === 'territorio' && (
                        <SolapaTerritorio
                          circuito={circuitoSeleccionado}
                          datos={datosCircuito}
                          barrios={barrios}
                          todosLosDatos={datos}
                          onSelectCircuito={handleSelectCircuito}
                          barriosGeoLookup={barriosGeoLookup}
                          recorridosLookup={recorridosLookup}
                          pautasBarriosData={pautasBarriosData}
                          obrasEnriquecidas={obrasEnriquecidas}
                          votosEscuelasBarrioLookup={votosEscuelasBarrioLookup}
                          onSelectBarrioFicha={irABarrioDesdeTerritorio}
                          onSelectBarrioFichaPauta={irABarrioDesdeCoberturaPauta}
                          circuitosGeoJsonData={circuitosGeoJsonData}
                          obrasFoco={obrasFoco}
                          onSelectObra={setObraSeleccionada}
                          votosEscuelasCircuitoData={votosEscuelasCircuitoData}
                        />
                      )}
                      {solapaActiva === 'comparativas' && <SolapaComparativas circuito={circuitoSeleccionado} datos={datosCircuito} />}
                      {solapaActiva === 'encuestas' && encuestaCircuito && (
                        <SolapaEncuestas
                          key={`${circuitoSeleccionado}-${rondaFechaSolicitada || 'ultima'}`}
                          encuesta={encuestaCircuito}
                          metadata={encuestasMetadata}
                          fechaRondaInicial={rondaFechaSolicitada}
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px' }}>
                    <div style={{ marginBottom: '16px' }}>
                      <button onClick={() => setVistaFicha(null)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Volver al mapa</button>
                    </div>
                    <VistaCapital datos={datos} onSelectCircuito={handleSelectCircuito} filtroCategoria={filtroCategoria} setFiltroCategoria={setFiltroCategoria} />
                  </div>
                )}
              </div>

              <div style={{ width: '320px', flexShrink: 0, padding: '18px', paddingLeft: '0', position: 'relative', zIndex: 1 }}>
                <div style={{ height: '100%', backgroundColor: '#fff', borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                  <MapaCircuitos datos={datos} geoData={geoData} barriosGeoData={barriosGeoData} obrasEnriquecidas={obrasEnriquecidas} escuelasData={escuelasData} pautasBarriosData={pautasBarriosData} cruceData={cruceData} circuitoSeleccionado={circuitoSeleccionado} onMapClick={handleMapClick} barrioSeleccionado={barrioSeleccionado} filtroCategoria={filtroCategoria} setFiltroCategoria={setFiltroCategoria} coloresCategoria={COLORES_CATEGORIA} zoomBarrioSolicitado={zoomBarrioSolicitado} onSelectObra={setObraSeleccionada} onVerBarrioEnPauta={irABarrioDesdeMapaPauta} onVerCircuitoEnPauta={irACircuitoDesdeMapaPauta} capasActivas={capasActivas} setCapasActivas={setCapasActivas} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ flex: '1', padding: '18px' }}>
                <div style={{ height: '100%', backgroundColor: '#fff', borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                  <MapaCircuitos datos={datos} geoData={geoData} barriosGeoData={barriosGeoData} obrasEnriquecidas={obrasEnriquecidas} escuelasData={escuelasData} pautasBarriosData={pautasBarriosData} cruceData={cruceData} circuitoSeleccionado={circuitoSeleccionado} onMapClick={handleMapClick} barrioSeleccionado={barrioSeleccionado} filtroCategoria={filtroCategoria} setFiltroCategoria={setFiltroCategoria} coloresCategoria={COLORES_CATEGORIA} zoomBarrioSolicitado={zoomBarrioSolicitado} onSelectObra={setObraSeleccionada} onVerBarrioEnPauta={irABarrioDesdeMapaPauta} onVerCircuitoEnPauta={irACircuitoDesdeMapaPauta} capasActivas={capasActivas} setCapasActivas={setCapasActivas} />
                </div>
              </div>

              <div style={{ width: '300px', flexShrink: 0, padding: '18px', paddingLeft: '0' }}>
                <div style={{ height: '100%', backgroundColor: '#fff', borderRadius: '12px', padding: '16px', overflowY: 'auto' }}>
                  <PanelLateral
                    panelTab={panelTab}
                    setPanelTab={setPanelTab}
                    datosCircuito={datosCircuito}
                    padronTotal={padronTotal}
                    onVerFicha={(solapa, foco) => { setVistaFicha('circuito'); setSolapaActiva(solapa || 'resumen'); setObrasFoco(foco || 'propio'); }}
                    onVerFichaBarrio={() => { setVistaFicha('barrio'); setSolapaActivaBarrio('resumen'); if (barrioSeleccionado) setZoomBarrioSolicitado({ nombre: barrioSeleccionado, ts: Date.now() }); }}
                    onVerFichaCircuito={irACircuitoDesdeResumenBarrio}
                    barrioSeleccionado={barrioSeleccionado}
                    barriosGeoLookup={barriosGeoLookup}
                    todosLosDatos={datos}
                    cruceData={cruceData}
                    onSelectBarrio={handleSelectBarrio}
                    onSelectCircuito={handleSelectCircuito}
                    encuestasData={encuestasData}
                    obrasEnriquecidas={obrasEnriquecidas}
                    circuitosGeoJsonData={circuitosGeoJsonData}
                    poblacionTotalPorBarrio={poblacionTotalPorBarrio}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
