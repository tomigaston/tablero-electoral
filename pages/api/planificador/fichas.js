// API de fichas del Planificador (notas, decisiones y seguimiento por circuito).
//   GET  /api/planificador/fichas                     -> { modo, usuario, fichas }
//   POST /api/planificador/fichas { circuito, op }    -> { ficha }   (ver aplicarOperacion)
// La autenticación la hace middleware.js (Basic Auth) antes de llegar acá; este endpoint solo
// lee el NOMBRE de usuario del mismo header para la atribución. Nunca se guarda ni se loguea la clave.
import { leerTodas, leerUna, guardar, modo } from '../../../lib/planificador/servidor/store';
import { aplicarOperacion, OperacionInvalida } from '../../../lib/planificador/acciones';

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

const CIRCUITO_VALIDO = /^[0-9]{1,2}[A-Za-z]?$/;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const usuario = usuarioDe(req);
  const m = modo();
  if (!m) return res.status(503).json({ error: 'sin_base', mensaje: 'No hay base de datos configurada (falta PLANIFICADOR_SHEETS_URL / PLANIFICADOR_SHEETS_TOKEN).', usuario,
    // Diagnóstico sin exponer valores: qué variables ve este deploy y en qué entorno de Vercel corre.
    diagnostico: { entorno: process.env.VERCEL_ENV || null, tieneUrl: !!process.env.PLANIFICADOR_SHEETS_URL, tieneToken: !!process.env.PLANIFICADOR_SHEETS_TOKEN } });

  try {
    if (req.method === 'GET') {
      // Las claves PARTE_* guardan los mensajes del parte de obras (ver parte.js): no son fichas de circuito.
      const fichas = await leerTodas();
      Object.keys(fichas).filter((k) => k.startsWith('PARTE_')).forEach((k) => { delete fichas[k]; });
      return res.status(200).json({ modo: m, usuario, fichas });
    }
    if (req.method === 'POST') {
      const { circuito, op } = req.body || {};
      if (!CIRCUITO_VALIDO.test(String(circuito || ''))) return res.status(400).json({ error: 'circuito_invalido' });
      const clave = String(circuito).toUpperCase();
      const ficha = aplicarOperacion(await leerUna(clave), op, usuario, new Date().toISOString());
      await guardar(clave, ficha);
      return res.status(200).json({ ficha, usuario });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'metodo_no_permitido' });
  } catch (e) {
    if (e instanceof OperacionInvalida) return res.status(400).json({ error: 'operacion_invalida', mensaje: e.message });
    console.error('[planificador/fichas]', e.message);
    return res.status(500).json({ error: 'error_interno' });
  }
}
