import { NextResponse } from 'next/server';

// Configuración de autenticación
// En producción, usar variables de entorno
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || 'cordoba2026';

export function middleware(request) {
  // Verificar si la autenticación está habilitada
  if (process.env.DISABLE_AUTH === 'true') {
    return NextResponse.next();
  }
  
  // Obtener header de autorización
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader) {
    return new NextResponse('Autenticación requerida', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Tablero Electoral Córdoba"',
      },
    });
  }
  
  // Decodificar credenciales
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');
  
  // Verificar credenciales
  if (username === AUTH_USER && password === AUTH_PASS) {
    return NextResponse.next();
  }
  
  return new NextResponse('Credenciales inválidas', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Tablero Electoral Córdoba"',
    },
  });
}

// Aplicar middleware a todas las rutas excepto archivos estáticos
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|data/).*)',
  ],
};
