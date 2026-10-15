import { NextResponse } from 'next/server';

// Autenticación Basic Auth con múltiples usuarios (mismo nivel de acceso).
//
// Variable de entorno:
//   AUTH_USERS="usuario1:clave1,usuario2:clave2,..."
//   - Se separan usuarios con coma y usuario/clave con el PRIMER ":".
//   - Las claves no pueden contener comas.
// Compatibilidad temporal: si AUTH_USER y AUTH_PASS están definidas, también valen.
// No hay credenciales por defecto: si no hay ninguna configurada, se responde 401.

function parseUsers() {
  const users = [];
  const raw = process.env.AUTH_USERS || '';
  for (const entry of raw.split(',')) {
    const i = entry.indexOf(':');
    if (i <= 0) continue;
    const user = entry.slice(0, i).trim();
    const pass = entry.slice(i + 1);
    if (user && pass) users.push([user, pass]);
  }
  if (process.env.AUTH_USER && process.env.AUTH_PASS) {
    users.push([process.env.AUTH_USER, process.env.AUTH_PASS]);
  }
  return users;
}

// Comparación en tiempo constante (evita filtrar información por tiempos de respuesta).
function safeEqual(a, b) {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function decodeBasic(header) {
  try {
    const [scheme, encoded] = header.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'basic' || !encoded) return null;
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder('utf-8').decode(bytes);
    const i = decoded.indexOf(':');
    if (i < 0) return null;
    return [decoded.slice(0, i), decoded.slice(i + 1)];
  } catch (e) {
    return null;
  }
}

function unauthorized(message) {
  return new NextResponse(message, {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Tablero Electoral Córdoba"',
    },
  });
}

export function middleware(request) {
  // Solo para desarrollo local
  if (process.env.DISABLE_AUTH === 'true') {
    return NextResponse.next();
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return unauthorized('Autenticación requerida');
  }

  const creds = decodeBasic(authHeader);
  if (!creds) {
    return unauthorized('Credenciales inválidas');
  }

  const [username, password] = creds;
  let ok = false;
  // Se recorren todos los usuarios sin cortar, para no variar el tiempo según cuál coincide.
  for (const [u, p] of parseUsers()) {
    const userOk = safeEqual(username, u);
    const passOk = safeEqual(password, p);
    if (userOk && passOk) ok = true;
  }

  return ok ? NextResponse.next() : unauthorized('Credenciales inválidas');
}

// Aplicar middleware a todas las rutas excepto assets de Next y favicon.
// /data/* ahora SÍ está protegido (antes estaba excluido).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
