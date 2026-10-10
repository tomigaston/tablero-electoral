import fs from 'fs';
import path from 'path';
import { useState } from 'react';
import Head from 'next/head';
import dataManifest from '../../lib/data-manifest';

// Protegida por el mismo Basic Auth del resto del sitio (middleware.js aplica a
// todas las rutas salvo _next/static, _next/image, favicon.ico y /data/ — esta
// página cae dentro del set protegido, no necesita lógica propia de auth).

const GITHUB_REPO = 'tomigaston/tablero-electoral';
const GITHUB_TIMEOUT_MS = 6000;

const ESTADO_COLOR = {
  activo: { bg: '#E8F5E9', text: '#2E7D32', dot: '#4CAF50' },
  deprecado: { bg: '#F5F5F5', text: '#757575', dot: '#9E9E9E' },
  en_desarrollo: { bg: '#E3F2FD', text: '#1565C0', dot: '#42A5F5' },
  legacy: { bg: '#FFF8E1', text: '#B28900', dot: '#FFCA28' },
};

const ESTADO_LABEL = {
  activo: 'Activo',
  deprecado: 'Deprecado',
  en_desarrollo: 'En desarrollo',
  legacy: 'Legacy',
};

async function obtenerUltimaActualizacion(archivo, token) {
  if (!token) return null;
  const url = `https://api.github.com/repos/${GITHUB_REPO}/commits?path=public/data/${encodeURIComponent(archivo)}&page=1&per_page=1`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const commits = await res.json();
    return commits?.[0]?.commit?.author?.date || null;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Orden natural de código de circuito: separa la parte numérica de la parte de
// letras (sin importar el orden en que aparezcan, ej. "13A" o "A14") para que
// "4A, 4B... 5A... 14, 14A" quede en un orden legible, no alfabético plano.
function compararCircuitoKey(a, b) {
  const parse = (k) => ({
    num: parseInt((k.match(/\d+/) || ['0'])[0], 10),
    letras: k.replace(/\d+/g, ''),
  });
  const pa = parse(String(a));
  const pb = parse(String(b));
  if (pa.num !== pb.num) return pa.num - pb.num;
  return pa.letras.localeCompare(pb.letras);
}

// Lee y aplana, en el servidor, los dos JSON de producción (los mismos que
// consume el tablero en runtime — no un resumen aparte que se pueda
// desincronizar). El filtro de texto se aplica después, en el cliente.
function leerVisitasAplanadas() {
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'recorridos_barrios.json'), 'utf8'));
  return Object.entries(raw)
    .flatMap(([barrio, info]) =>
      (info.visitas || []).map((v) => ({
        barrio,
        fecha: v.fecha || '',
        tipo_visita: v.tipo_visita || '',
        contacto_vecinos: v.contacto_vecinos || '',
        link: v.link || '',
      }))
    )
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

// Escenarios de intención de voto para Gobernador: por ronda, cuántos escenarios y en qué circuitos
// hay datos. Se lee del mismo JSON de producción y se cruza con el registro de encuestas_metadata.json
// para marcar los escenarios que todavía no están registrados.
function leerEscenariosGobernador() {
  const dir = path.join(process.cwd(), 'public', 'data');
  const datos = JSON.parse(fs.readFileSync(path.join(dir, 'encuestas_circuitos.json'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'encuestas_metadata.json'), 'utf8')).escenarios_gobernador;
  if (!meta) return { rondas: [], sinEscenarios: 0, total: 0 };
  const registrados = new Set(Object.keys(meta.escenarios || {}));
  const porFecha = {};
  const conEscenarios = new Set();
  Object.entries(datos).forEach(([circuito, info]) => {
    (info.rondas || []).forEach((r) => {
      Object.keys(r.preguntas || {}).filter((q) => q.startsWith(meta.prefijo_pregunta)).forEach((q) => {
        const esc = q.slice(meta.prefijo_pregunta.length);
        conEscenarios.add(circuito);
        const f = (porFecha[r.fecha] = porFecha[r.fecha] || { fecha: r.fecha, escenarios: {}, circuitos: new Set() });
        f.circuitos.add(circuito);
        (f.escenarios[esc] = f.escenarios[esc] || new Set()).add(circuito);
      });
    });
  });
  const rondas = Object.values(porFecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((f) => ({
      fecha: f.fecha,
      circuitos: [...f.circuitos].sort(compararCircuitoKey),
      escenarios: Object.entries(f.escenarios).map(([nombre, cs]) => ({ nombre, circuitos: cs.size, registrado: registrados.has(nombre) })),
    }));
  return { rondas, sinEscenarios: Object.keys(datos).length - conEscenarios.size, total: Object.keys(datos).length };
}

function leerEncuestasAplanadas() {
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'encuestas_circuitos.json'), 'utf8'));
  return Object.entries(raw)
    .map(([circuito, info]) => ({
      circuito,
      cantidad_rondas: info.cantidad_rondas || 0,
      fechas: (info.rondas || []).map((r) => r.fecha),
    }))
    .sort((a, b) => compararCircuitoKey(a.circuito, b.circuito));
}

// Obras sin lat/lon ni barrio (fuente_barrio: "descartado" o null) — no se pueden
// graficar en el mapa ni ubicar en ningún listado por barrio/circuito, quedan
// pendientes de geolocalizar/asignar a mano.
function leerObrasSinGeolocalizar() {
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'obras_capital.json'), 'utf8'));
  return raw
    .filter((o) => (o.lat == null || o.lon == null) && !o.barrio)
    .map((o) => ({
      // obras_capital.json cambió de esquema (id_registro / nombre_obra): se aceptan ambos y nunca se
      // devuelve undefined (Next no puede serializarlo en getServerSideProps).
      id: o.id_registro ?? o.id ?? null,
      nombre: o.nombre_obra ?? o.nombre ?? '',
      reparticion: o.reparticion || '',
      tipo_obra: o.tipo_obra || '',
      estado: o.estado || '',
      fuente_barrio: o.fuente_barrio ?? null,
    }))
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
}

export async function getServerSideProps() {
  const token = process.env.GITHUB_TOKEN || '';
  const fechas = await Promise.all(
    dataManifest.map((entry) => obtenerUltimaActualizacion(entry.archivo, token))
  );
  const manifest = dataManifest.map((entry, i) => ({
    ...entry,
    ultimaActualizacion: fechas[i],
  }));
  const visitas = leerVisitasAplanadas();
  const encuestas = leerEncuestasAplanadas();
  const escenarios = leerEscenariosGobernador();
  const obrasSinGeolocalizar = leerObrasSinGeolocalizar();
  return { props: { manifest, visitas, encuestas, escenarios, obrasSinGeolocalizar } };
}

function formatRelativo(iso) {
  const fecha = new Date(iso).getTime();
  const diffSeg = Math.floor((Date.now() - fecha) / 1000);
  const diffMin = Math.floor(diffSeg / 60);
  const diffHoras = Math.floor(diffMin / 60);
  const diffDias = Math.floor(diffHoras / 24);
  const diffMeses = Math.floor(diffDias / 30);
  const diffAnios = Math.floor(diffDias / 365);

  if (diffAnios >= 1) return `hace ${diffAnios} año${diffAnios === 1 ? '' : 's'}`;
  if (diffMeses >= 1) return `hace ${diffMeses} mes${diffMeses === 1 ? '' : 'es'}`;
  if (diffDias >= 1) return `hace ${diffDias} día${diffDias === 1 ? '' : 's'}`;
  if (diffHoras >= 1) return `hace ${diffHoras} hora${diffHoras === 1 ? '' : 's'}`;
  if (diffMin >= 1) return `hace ${diffMin} minuto${diffMin === 1 ? '' : 's'}`;
  return 'hace instantes';
}

function formatFechaCompleta(iso) {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' });
}

// Case-insensitive y sin tildes, para que "cordoba"/"Córdoba"/"CÓRDOBA" matcheen igual.
function normalizarBusqueda(str) {
  return (str || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const thStyle = { padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)', fontSize: '12px' };
const tdStyle = { padding: '10px 14px', verticalAlign: 'top', color: 'var(--text-primary)' };
const searchInputStyle = { padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', width: '280px', maxWidth: '100%' };

const BadgeEstado = ({ estado }) => {
  const c = ESTADO_COLOR[estado] || ESTADO_COLOR.activo;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '999px', backgroundColor: c.bg, color: c.text, fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap' }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: c.dot, flexShrink: 0 }} />
      {ESTADO_LABEL[estado] || estado}
    </span>
  );
};

const UltimaActualizacion = ({ entry }) => (
  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
    Última actualización real:{' '}
    {entry?.ultimaActualizacion ? (
      <span title={formatFechaCompleta(entry.ultimaActualizacion)} style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
        {formatRelativo(entry.ultimaActualizacion)}
      </span>
    ) : (
      <span style={{ fontWeight: 500 }}>sin verificar</span>
    )}
  </span>
);

const SeccionHeader = ({ titulo, archivo, entry, busqueda, setBusqueda, placeholder, total, mostrados }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
    <div>
      <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>{titulo}</h2>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <code style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>public/data/{archivo}</code>
        <span style={{ color: 'var(--border)' }}>·</span>
        <UltimaActualizacion entry={entry} />
        <span style={{ color: 'var(--border)' }}>·</span>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{mostrados} de {total}</span>
      </div>
    </div>
    <input
      type="text"
      value={busqueda}
      onChange={(e) => setBusqueda(e.target.value)}
      placeholder={placeholder}
      style={searchInputStyle}
    />
  </div>
);

const TablaVisitas = ({ visitas, entry }) => {
  const [busqueda, setBusqueda] = useState('');
  const filtro = normalizarBusqueda(busqueda);
  const filtradas = filtro ? visitas.filter((v) => normalizarBusqueda(v.barrio).includes(filtro)) : visitas;

  return (
    <div style={{ marginBottom: '32px' }}>
      <SeccionHeader
        titulo="Visitas del Gobernador"
        archivo="recorridos_barrios.json"
        entry={entry}
        busqueda={busqueda}
        setBusqueda={setBusqueda}
        placeholder="Buscar por barrio…"
        total={visitas.length}
        mostrados={filtradas.length}
      />
      <div style={{ overflowX: 'auto', maxHeight: '480px', overflowY: 'auto', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
              <th style={thStyle}>Barrio</th>
              <th style={thStyle}>Fecha</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Contacto vecinos</th>
              <th style={thStyle}>Link</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr><td style={{ ...tdStyle, color: 'var(--text-tertiary)' }} colSpan={5}>Sin resultados para "{busqueda}".</td></tr>
            ) : filtradas.map((v, i) => (
              <tr key={`${v.barrio}-${v.fecha}-${i}`} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ ...tdStyle, fontWeight: 500 }}>{v.barrio}</td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{v.fecha || '—'}</td>
                <td style={tdStyle}>{v.tipo_visita || '—'}</td>
                <td style={tdStyle}>{v.contacto_vecinos || '—'}</td>
                <td style={tdStyle}>
                  {v.link ? <a href={v.link} target="_blank" rel="noreferrer" style={{ color: '#1976D2' }}>Ver nota</a> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TablaEncuestas = ({ encuestas, entry }) => {
  const [busqueda, setBusqueda] = useState('');
  const filtro = normalizarBusqueda(busqueda);
  const filtradas = filtro ? encuestas.filter((e) => normalizarBusqueda(e.circuito).includes(filtro)) : encuestas;

  return (
    <div style={{ marginBottom: '32px' }}>
      <SeccionHeader
        titulo="Encuestas por Circuito"
        archivo="encuestas_circuitos.json"
        entry={entry}
        busqueda={busqueda}
        setBusqueda={setBusqueda}
        placeholder="Buscar por código de circuito…"
        total={encuestas.length}
        mostrados={filtradas.length}
      />
      <div style={{ overflowX: 'auto', maxHeight: '480px', overflowY: 'auto', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
              <th style={thStyle}>Circuito</th>
              <th style={thStyle}>Cantidad de rondas</th>
              <th style={thStyle}>Fechas de cada ronda</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr><td style={{ ...tdStyle, color: 'var(--text-tertiary)' }} colSpan={3}>Sin resultados para "{busqueda}".</td></tr>
            ) : filtradas.map((e) => (
              <tr key={e.circuito} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 500 }}>{e.circuito}</td>
                <td style={tdStyle}>{e.cantidad_rondas}</td>
                <td style={tdStyle}>{e.fechas.length > 0 ? e.fechas.join(', ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TablaEscenarios = ({ escenarios, entry }) => (
  <div style={{ marginBottom: '32px' }}>
    <div style={{ marginBottom: '14px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Intención de voto — Gobernador (escenarios)</h2>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <code style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>public/data/encuestas_circuitos.json</code>
        <span style={{ color: 'var(--border)' }}>·</span>
        <UltimaActualizacion entry={entry} />
        <span style={{ color: 'var(--border)' }}>·</span>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{escenarios.total - escenarios.sinEscenarios} de {escenarios.total} circuitos con escenarios</span>
      </div>
    </div>
    <div style={{ overflowX: 'auto', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <th style={thStyle}>Ronda</th>
            <th style={thStyle}>Circuitos con datos</th>
            <th style={thStyle}>Escenarios</th>
          </tr>
        </thead>
        <tbody>
          {escenarios.rondas.length === 0 ? (
            <tr><td style={{ ...tdStyle, color: 'var(--text-tertiary)' }} colSpan={3}>Ninguna ronda tiene escenarios cargados.</td></tr>
          ) : escenarios.rondas.map((r) => (
            <tr key={r.fecha} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
              <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 500, whiteSpace: 'nowrap' }}>{r.fecha}</td>
              <td style={tdStyle}>{r.circuitos.length}: {r.circuitos.join(', ')}</td>
              <td style={tdStyle}>
                <ol style={{ margin: 0, paddingLeft: '18px' }}>
                  {r.escenarios.map((e) => (
                    <li key={e.nombre}>
                      {e.nombre} <span style={{ color: 'var(--text-tertiary)' }}>({e.circuitos} circuitos)</span>
                      {!e.registrado && <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 600, color: '#B28900', backgroundColor: '#FFF8E1', padding: '1px 7px', borderRadius: '8px' }}>no registrado en encuestas_metadata.json</span>}
                    </li>
                  ))}
                </ol>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
      Circuitos sin ningún escenario en ninguna ronda: {escenarios.sinEscenarios}. Validación de cada carga: <code>scripts/validar_escenarios_gobernador.py</code>.
    </p>
  </div>
);

const TablaObrasSinGeolocalizar = ({ obras, entry }) => {
  const [busqueda, setBusqueda] = useState('');
  const filtro = normalizarBusqueda(busqueda);
  const filtradas = filtro ? obras.filter((o) => normalizarBusqueda(o.nombre).includes(filtro)) : obras;

  return (
    <div style={{ marginBottom: '32px' }}>
      <SeccionHeader
        titulo="Obras pendientes de geolocalizar"
        archivo="obras_capital.json"
        entry={entry}
        busqueda={busqueda}
        setBusqueda={setBusqueda}
        placeholder="Buscar por nombre de obra…"
        total={obras.length}
        mostrados={filtradas.length}
      />
      <div style={{ overflowX: 'auto', maxHeight: '480px', overflowY: 'auto', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
              <th style={thStyle}>Nombre</th>
              <th style={thStyle}>Repartición</th>
              <th style={thStyle}>Tipo de obra</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>fuente_barrio</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr><td style={{ ...tdStyle, color: 'var(--text-tertiary)' }} colSpan={5}>Sin resultados para "{busqueda}".</td></tr>
            ) : filtradas.map((o) => (
              <tr key={o.id ?? o.nombre} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ ...tdStyle, fontWeight: 500 }}>{o.nombre}</td>
                <td style={tdStyle}>{o.reparticion || '—'}</td>
                <td style={tdStyle}>{o.tipo_obra || '—'}</td>
                <td style={tdStyle}>{o.estado || '—'}</td>
                <td style={{ ...tdStyle, color: 'var(--text-tertiary)' }}>{o.fuente_barrio ?? 'null'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function DataStatus({ manifest, visitas, encuestas, escenarios, obrasSinGeolocalizar }) {
  const entryVisitas = manifest.find((m) => m.archivo === 'recorridos_barrios.json');
  const entryEncuestas = manifest.find((m) => m.archivo === 'encuestas_circuitos.json');
  const entryObras = manifest.find((m) => m.archivo === 'obras_capital.json');

  return (
    <>
      <Head>
        <title>Estado de datos — Tablero Electoral</title>
      </Head>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '4px' }}>Estado de datos — public/data/</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
          Inventario de los archivos de datos del tablero (ver <code>lib/data-manifest.js</code>). La columna "Última actualización real" consulta en vivo el historial de commits de GitHub.
        </p>
        <div style={{ overflowX: 'auto', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <th style={thStyle}>Archivo</th>
                <th style={thStyle}>Descripción</th>
                <th style={thStyle}>Alimenta</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Estado</th>
                <th style={thStyle}>Última actualización real</th>
              </tr>
            </thead>
            <tbody>
              {manifest.map((entry) => (
                <tr key={entry.archivo} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{entry.archivo}</td>
                  <td style={{ ...tdStyle, minWidth: '260px' }}>{entry.descripcion}</td>
                  <td style={{ ...tdStyle, minWidth: '220px' }}>
                    {entry.alimenta.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: '16px' }}>
                        {entry.alimenta.map((c) => <li key={c}>{c}</li>)}
                      </ul>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)' }}>— (sin consumidores en el código)</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <BadgeEstado estado={entry.estado} />
                  </td>
                  <td style={tdStyle}>
                    {entry.ultimaActualizacion ? (
                      <span title={formatFechaCompleta(entry.ultimaActualizacion)}>{formatRelativo(entry.ultimaActualizacion)}</span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)' }}>sin verificar</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '40px' }}>
          <TablaVisitas visitas={visitas} entry={entryVisitas} />
          <TablaEncuestas encuestas={encuestas} entry={entryEncuestas} />
          <TablaEscenarios escenarios={escenarios} entry={entryEncuestas} />
          <TablaObrasSinGeolocalizar obras={obrasSinGeolocalizar} entry={entryObras} />
        </div>
      </div>
    </>
  );
}
