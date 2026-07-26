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

export async function getServerSideProps() {
  const token = process.env.GITHUB_TOKEN || '';
  const fechas = await Promise.all(
    dataManifest.map((entry) => obtenerUltimaActualizacion(entry.archivo, token))
  );
  const manifest = dataManifest.map((entry, i) => ({
    ...entry,
    ultimaActualizacion: fechas[i],
  }));
  return { props: { manifest } };
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

const thStyle = { padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: 'var(--text-tertiary)', fontSize: '12px' };
const tdStyle = { padding: '10px 14px', verticalAlign: 'top', color: 'var(--text-primary)' };

const BadgeEstado = ({ estado }) => {
  const c = ESTADO_COLOR[estado] || ESTADO_COLOR.activo;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '999px', backgroundColor: c.bg, color: c.text, fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap' }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: c.dot, flexShrink: 0 }} />
      {ESTADO_LABEL[estado] || estado}
    </span>
  );
};

export default function DataStatus({ manifest }) {
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
      </div>
    </>
  );
}
