// API del parte de obras del día del Planificador: los dos mensajes de difusión, pegados tal cual.
//   GET  /api/planificador/parte                          -> { ejecucion: { texto, actualizado_en }, finalizadas: { ... } }
//   POST /api/planificador/parte { tipo, texto }          -> { ok, [tipo]: { texto, actualizado_en } }   (tipo: 'ejecucion' | 'finalizadas')
// Se guardan en la misma base que las fichas (hoja "Notas" de la planilla), con las claves PARTE_EJECUCION y PARTE_FINALIZADAS:
// así se comparten con todo el equipo sin tocar el Apps Script. El texto se interpreta en el navegador (lib/planificador/parteDia.js).
// La autenticación la hace middleware.js (Basic Auth); acá solo se guarda quién cargó el parte, sin mostrarlo en pantalla.
import { leerTodas, guardar, modo } from '../../../lib/planificador/servidor/store';

const CLAVES = { ejecucion: 'PARTE_EJECUCION', finalizadas: 'PARTE_FINALIZADAS' };
const MAX_TEXTO = 45000; // una celda de Google Sheets admite 50.000 caracteres

function usuarioDe(req) {
  const h = req.headers.authorization || '';
  const [esquema, cred] = h.split(' ');
  if (esquema?.toLowerCase() === 'basic' && cred) {
    try {
      const decoded = Buffer.from(cred, 'base64').toString('utf8');
      const i = decoded.indexOf(':');
      const nombre = (i >= 0 ? decoded.slice(0, i) : decoded).trim();
      if (nombre) return nombre.slice(0, 60);
    } catch (e) { /* header inválido */ }
  }
  return 'local';
}

const salida = (ficha) => ({ texto: ficha?.notas || '', actualizado_en: ficha?.actualizado_en || null });

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!modo()) return res.status(503).json({ error: 'sin_base', mensaje: 'No hay base de datos configurada (falta PLANIFICADOR_SHEETS_URL / PLANIFICADOR_SHEETS_TOKEN).' });
  try {
    if (req.method === 'GET') {
      const todas = await leerTodas();
      return res.status(200).json({ ejecucion: salida(todas[CLAVES.ejecucion]), finalizadas: salida(todas[CLAVES.finalizadas]) });
    }
    if (req.method === 'POST') {
      const { tipo, texto } = req.body || {};
      const clave = CLAVES[tipo];
      if (!clave) return res.status(400).json({ error: 'tipo_invalido' });
      const ficha = { notas: String(texto ?? '').slice(0, MAX_TEXTO), acciones: [], actualizado_por: usuarioDe(req), actualizado_en: new Date().toISOString() };
      await guardar(clave, ficha);
      return res.status(200).json({ ok: true, [tipo]: salida(ficha) });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'metodo_no_permitido' });
  } catch (e) {
    console.error('[planificador/parte]', e.message);
    return res.status(500).json({ error: 'error_interno' });
  }
}
