import React, { useState, useMemo } from 'react';
import { formatearFecha } from '../lib/formatearFecha';
import { estadoMostradoPauta } from '../lib/estadoPauta';
import {
  derivarPautaPorCircuito, filtrarPiezas, particionarPorVigencia, metricasParaMostrar, esUrlHttp,
} from '../lib/pautaPorCircuito';

// Vista "Pauta por circuito" (vistaFicha === 'pautaCircuito'). El estado de filtros y
// secciones abiertas vive en Home (mismo criterio que VistaObras): navegar a la Ficha de
// un barrio desmonta esta vista, y al volver todo tiene que seguir como estaba.
export const ESTADO_INICIAL_VISTA_PAUTA = {
  estado: 'activa', // 'activa' | 'inactiva' | 'todas'
  plataforma: 'todas', // 'todas' | 'META' | 'GOOGLE'
  textoCircuito: '',
  textoPieza: '',
  abiertos: [], // claves de circuito expandidas
  capitalAbierto: true,
  verSinPauta: false,
};

const TAMANO_PAGINA = 30;
const botonChico = { padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'transparent', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' };

// ---- Fila de pieza ----------------------------------------------------------------

const ChipBarrio = ({ nombre, onClick }) => (
  <button
    onClick={() => onClick(nombre)}
    title={`Abrir la ficha de ${nombre}`}
    style={{ padding: '2px 9px', borderRadius: '999px', border: '1px solid #1976D2', backgroundColor: 'transparent', color: '#1976D2', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
  >{nombre}</button>
);

// Alcance de la pieza: barrio(s) clickeables -> Ficha de ese barrio; circuito sin barrio -> chip gris.
const ChipsAlcance = ({ pieza, onIrABarrio }) => {
  const [todos, setTodos] = useState(false);
  if (pieza.alcance === 'capital') {
    return <span style={{ padding: '2px 9px', borderRadius: '999px', backgroundColor: '#9E9E9E22', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600 }}>Toda la capital</span>;
  }
  if (pieza.barrios.length === 0) {
    return <span style={{ padding: '2px 9px', borderRadius: '999px', backgroundColor: '#9E9E9E22', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600 }}>Circuito (sin barrio)</span>;
  }
  const visibles = todos ? pieza.barrios : pieza.barrios.slice(0, 1);
  const resto = pieza.barrios.length - 1;
  return (
    <>
      {visibles.map((b) => <ChipBarrio key={b} nombre={b} onClick={onIrABarrio} />)}
      {resto > 0 && (
        <button
          onClick={() => setTodos((t) => !t)}
          title={todos ? 'Mostrar solo el primer barrio' : `Mostrar los ${resto} barrios restantes`}
          style={{ padding: '2px 8px', borderRadius: '999px', border: '1px dashed var(--border)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
        >{todos ? '−' : `+${resto}`}</button>
      )}
    </>
  );
};

const BotonLink = ({ link }) => {
  if (esUrlHttp(link)) {
    return (
      <a href={link.trim()} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '8px 16px', borderRadius: '8px', backgroundColor: '#1976D2', color: '#fff', fontSize: '12px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>Abrir link ↗</a>
    );
  }
  return (
    <span
      aria-disabled="true"
      title={link ? `El campo link no es una URL: "${link}"` : 'Esta pieza no tiene link cargado'}
      style={{ display: 'inline-block', padding: '8px 16px', borderRadius: '8px', border: '1px dashed var(--border)', color: 'var(--text-tertiary)', fontSize: '12px', fontWeight: 600, cursor: 'not-allowed', whiteSpace: 'nowrap' }}
    >Sin link</span>
  );
};

const BadgePlataforma = ({ plataforma }) => {
  const google = plataforma === 'GOOGLE';
  return <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 700, backgroundColor: google ? '#E6510022' : '#1976D222', color: google ? '#BF360C' : '#1565C0' }}>{plataforma || '—'}</span>;
};

// Estado tal como viene del dato (estadoMostradoPauta), sin corregirlo contra las fechas.
const BadgeEstado = ({ pauta, vigente }) => {
  const estado = estadoMostradoPauta(pauta);
  const conocido = estado === 'ACTIVO' || estado === 'INACTIVO';
  const activo = estado === 'ACTIVO';
  const contradice = conocido && activo !== vigente;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '5px', backgroundColor: !conocido ? '#9E9E9E22' : activo ? '#2E7D3222' : '#9E9E9E22', color: !conocido ? '#757575' : activo ? '#2E7D32' : '#757575', whiteSpace: 'nowrap' }}>
        {!conocido ? 'Estado —' : activo ? 'Activo' : 'Inactivo'}
      </span>
      {contradice && (
        <span title={`Estado de la plataforma tal como viene (${estado}); las fechas indican ${vigente ? 'vigente' : 'no vigente'}.`} style={{ fontSize: '10px', color: 'var(--text-tertiary)', cursor: 'help' }}>≠ fechas</span>
      )}
    </span>
  );
};

const LinkExterno = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#1976D2' }}>{children} →</a>
);

const FilaPieza = React.memo(function FilaPieza({ pieza, onIrABarrio }) {
  const [detalle, setDetalle] = useState(false);
  const { pauta } = pieza;
  const redes = pauta.material?.redes_publicadas || {};
  const linkTexto = pauta.material?.link && !esUrlHttp(pauta.material.link) ? pauta.material.link : null;
  const fechas = pauta.inicio || pauta.fin ? `${formatearFecha(pauta.inicio)} → ${formatearFecha(pauta.fin)}` : 'Sin fechas';
  return (
    <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', opacity: pieza.vigente ? 1 : 0.78 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{pauta.titulo_pieza || '—'}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '1px' }}>{pauta.campania || '—'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '5px', marginTop: '6px' }}>
            <BadgePlataforma plataforma={pauta.plataforma} />
            <ChipsAlcance pieza={pieza} onIrABarrio={onIrABarrio} />
          </div>
        </div>
        <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-start', minWidth: '150px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fechas}</span>
          <BadgeEstado pauta={pauta} vigente={pieza.vigente} />
        </div>
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BotonLink link={pauta.material?.link} />
          <button onClick={() => setDetalle((d) => !d)} aria-expanded={detalle} style={botonChico}>{detalle ? 'Ocultar ▴' : 'Métricas ▾'}</button>
        </div>
      </div>
      {detalle && (
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
            {metricasParaMostrar(pauta).map((m) => (
              <div key={m.label}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>{m.label}</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{m.valor}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
            {[pauta.objetivo_campana, pauta.tipo_pauta, pauta.material?.tipo].filter(Boolean).join(' · ') || '—'}
          </div>
          {(redes.ig || redes.fb || redes.yt || linkTexto) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', alignItems: 'center' }}>
              {redes.ig && <LinkExterno href={redes.ig}>Instagram</LinkExterno>}
              {redes.fb && <LinkExterno href={redes.fb}>Facebook</LinkExterno>}
              {redes.yt && <LinkExterno href={redes.yt}>YouTube</LinkExterno>}
              {linkTexto && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Link cargado como texto (no es URL): {linkTexto}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ---- Listas de piezas (circuito y Alcance Capital) --------------------------------

// Activas primero (o inactivas si el filtro es "Inactiva"); la otra mitad detrás de un
// botón. Paginado: un circuito puede tener ~200 piezas y no se renderizan de entrada.
const ListaPiezas = ({ activas, inactivas, filtroEstado, limiteInicial = TAMANO_PAGINA, vacio, onIrABarrio }) => {
  const [verInactivas, setVerInactivas] = useState(false);
  const [limitePrincipal, setLimitePrincipal] = useState(limiteInicial);
  const [limiteSecundario, setLimiteSecundario] = useState(limiteInicial);
  const principal = filtroEstado === 'inactiva' ? inactivas : activas;
  const secundario = filtroEstado === 'inactiva' ? [] : inactivas;
  const mostrarSecundario = filtroEstado === 'todas' || verInactivas;
  const renderPaginado = (lista, limite, setLimite) => (
    <React.Fragment>
      {lista.slice(0, limite).map((p) => <FilaPieza key={p.id} pieza={p} onIrABarrio={onIrABarrio} />)}
      {lista.length > limite && (
        <button onClick={() => setLimite((l) => l + TAMANO_PAGINA)} style={{ ...botonChico, alignSelf: 'flex-start' }}>Mostrar {Math.min(TAMANO_PAGINA, lista.length - limite)} más ({lista.length - limite} restantes)</button>
      )}
    </React.Fragment>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {principal.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', padding: '6px 2px' }}>{vacio}</div>}
      {renderPaginado(principal, limitePrincipal, setLimitePrincipal)}
      {secundario.length > 0 && filtroEstado !== 'todas' && (
        <button onClick={() => setVerInactivas((v) => !v)} aria-expanded={verInactivas} style={{ ...botonChico, alignSelf: 'flex-start' }}>
          {verInactivas ? 'Ocultar' : 'Ver'} {secundario.length} inactiva{secundario.length === 1 ? '' : 's'} {verInactivas ? '▴' : '▾'}
        </button>
      )}
      {secundario.length > 0 && filtroEstado === 'todas' && principal.length > 0 && (
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', margin: '6px 0 0' }}>INACTIVAS ({secundario.length}) · por fecha de fin, más reciente primero</div>
      )}
      {mostrarSecundario && renderPaginado(secundario, limiteSecundario, setLimiteSecundario)}
    </div>
  );
};

// ---- Sección de circuito ----------------------------------------------------------

const ResumenConteo = ({ activas, inactivas }) => (
  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
    {activas > 0 ? <strong style={{ color: '#2E7D32' }}>{activas} activa{activas === 1 ? '' : 's'}</strong> : <span>0 activas</span>}
    {' · '}{inactivas} inactiva{inactivas === 1 ? '' : 's'}
  </span>
);

const SeccionCircuito = ({ item, abierto, onToggle, filtroEstado, onIrABarrio }) => {
  const { circuito, activas, inactivas, total } = item;
  const sinPauta = total === 0;
  return (
    <div id={`pauta-circuito-${circuito.key}`} style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', backgroundColor: 'var(--bg-primary)', opacity: sinPauta ? 0.65 : 1 }}>
      <button
        onClick={onToggle}
        aria-expanded={abierto}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', minWidth: '44px' }}>{circuito.key}</span>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', flex: 1 }}>{circuito.nombre}</span>
        {sinPauta ? <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sin pauta</span> : <ResumenConteo activas={activas.length} inactivas={inactivas.length} />}
      </button>
      {abierto && (
        <div style={{ padding: '4px 14px 14px' }}>
          {sinPauta ? (
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', padding: '6px 2px' }}>Este circuito no tiene pauta cargada (ni propia, ni de sus barrios).</div>
          ) : (
            <ListaPiezas
              activas={activas}
              inactivas={inactivas}
              filtroEstado={filtroEstado}
              vacio={filtroEstado === 'inactiva' ? 'Sin piezas inactivas con estos filtros.' : 'Sin piezas activas con estos filtros.'}
              onIrABarrio={onIrABarrio}
            />
          )}
        </div>
      )}
    </div>
  );
};

// ---- Vista ------------------------------------------------------------------------

export default function VistaPautaCircuito({ pautasBarriosData, datos, barriosGeoData, cruceData, estado, setEstado, onVolver, onIrABarrio }) {
  const set = (patch) => setEstado((e) => ({ ...e, ...patch }));
  const hoy = useMemo(() => { const h = new Date(); h.setHours(0, 0, 0, 0); return h; }, []);
  const derivado = useMemo(
    () => derivarPautaPorCircuito({ pautasBarriosData, datos, barriosGeoData, cruceData, hoy }),
    [pautasBarriosData, datos, barriosGeoData, cruceData, hoy],
  );

  const filtros = { plataforma: estado.plataforma, textoPieza: estado.textoPieza };

  const items = useMemo(() => {
    if (!derivado) return [];
    return derivado.circuitos.map((circuito) => {
      const { activas, inactivas } = particionarPorVigencia(filtrarPiezas(circuito.piezas, filtros));
      const visibles = estado.estado === 'activa' ? activas.length : estado.estado === 'inactiva' ? inactivas.length : activas.length + inactivas.length;
      return { circuito, activas, inactivas, total: circuito.piezas.length, visibles };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivado, estado.plataforma, estado.textoPieza, estado.estado]);

  const capital = useMemo(() => {
    if (!derivado) return { activas: [], inactivas: [] };
    return particionarPorVigencia(filtrarPiezas(derivado.alcanceCapital, filtros));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivado, estado.plataforma, estado.textoPieza]);

  if (!derivado) {
    return <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', padding: '20px' }}>Cargando pauta…</div>;
  }

  const conActividad = items.filter((i) => i.visibles > 0);
  const resto = items.filter((i) => i.visibles === 0);
  const abiertos = new Set(estado.abiertos);
  const toggle = (key) => set({ abiertos: abiertos.has(key) ? estado.abiertos.filter((k) => k !== key) : [...estado.abiertos, key] });
  const renderSeccion = (item) => (
    <SeccionCircuito key={item.circuito.key} item={item} abierto={abiertos.has(item.circuito.key)} onToggle={() => toggle(item.circuito.key)} filtroEstado={estado.estado} onIrABarrio={onIrABarrio} />
  );

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px' }}>
      <div style={{ marginBottom: '14px' }}>
        <button onClick={onVolver} style={botonChico}>← Volver al mapa</button>
      </div>
      <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>Pauta por circuito</h2>
      <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '4px 0 16px' }}>
        {derivado.control.piezasEnCircuitos + derivado.control.piezasCapital + derivado.control.piezasSinResolver} piezas únicas · {derivado.control.piezasEnCircuitos} en circuitos · {derivado.control.piezasCapital} de alcance Capital · {derivado.control.piezasSinResolver} sin circuito resuelto
      </p>

      <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', marginBottom: '18px' }}>
        <button
          onClick={() => set({ capitalAbierto: !estado.capitalAbierto })}
          aria-expanded={estado.capitalAbierto}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', border: 'none', backgroundColor: 'var(--bg-secondary)', cursor: 'pointer', textAlign: 'left' }}
        >
          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', transform: estado.capitalAbierto ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>📍 Alcance Capital</span>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', flex: 1 }}>Toda la ciudad · aplica a todos los circuitos, no se repite abajo</span>
          <ResumenConteo activas={capital.activas.length} inactivas={capital.inactivas.length} />
        </button>
        {estado.capitalAbierto && (
          <div style={{ padding: '12px 14px' }}>
            <ListaPiezas activas={capital.activas} inactivas={capital.inactivas} filtroEstado={estado.estado} limiteInicial={8} vacio={estado.estado === 'inactiva' ? 'Sin piezas inactivas de alcance Capital con estos filtros.' : 'Sin piezas activas de alcance Capital con estos filtros.'} onIrABarrio={onIrABarrio} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {conActividad.map(renderSeccion)}
      </div>

      {resto.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <button onClick={() => set({ verSinPauta: !estado.verSinPauta })} aria-expanded={estado.verSinPauta} style={botonChico}>
            {estado.verSinPauta ? 'Ocultar' : 'Ver'} {resto.length} circuito{resto.length === 1 ? '' : 's'} sin pauta para este filtro {estado.verSinPauta ? '▴' : '▾'}
          </button>
          {estado.verSinPauta && <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>{resto.map(renderSeccion)}</div>}
        </div>
      )}
    </div>
  );
}
