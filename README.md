# Tablero Diagnóstico Territorial - Córdoba Capital

Aplicación web para análisis electoral de los 119 circuitos de Córdoba Capital.

## 🚀 Deploy en Vercel

### Opción 1: Deploy directo desde GitHub

1. **Subir código a GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/TU_USUARIO/tablero-electoral.git
   git push -u origin main
   ```

2. **Conectar con Vercel**
   - Ir a [vercel.com](https://vercel.com)
   - Click en "New Project"
   - Importar el repositorio de GitHub
   - Configurar variables de entorno:
     - `AUTH_USERS`: usuarios y claves, formato `usuario1:clave1,usuario2:clave2`
   - Click en "Deploy"

### Opción 2: Deploy con Vercel CLI

1. **Instalar Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Login y deploy**
   ```bash
   vercel login
   vercel
   ```

3. **Configurar variables de entorno en producción**
   ```bash
   vercel env add AUTH_USERS
   ```

4. **Deploy a producción**
   ```bash
   vercel --prod
   ```

## 🔒 Seguridad

La aplicación usa Basic Auth para proteger el acceso, con varios usuarios del mismo nivel. Configurar las variables de entorno (solo en Vercel, nunca en el repo):

- `AUTH_USERS`: lista `usuario:clave` separada por comas (las claves no pueden llevar comas). No hay credenciales por defecto: sin esta variable el sitio responde 401.
- `AUTH_USER` / `AUTH_PASS`: esquema anterior de un solo usuario, aceptado como compatibilidad temporal.
- `DISABLE_AUTH`: Poner en "true" para desarrollo local sin auth

El auth también cubre `/data/*` (los JSON y xlsx de `public/data/`). Para sumar o quitar un usuario: editar `AUTH_USERS` en Vercel y redeployar.

## 📁 Estructura del proyecto

```
tablero-electoral/
├── pages/
│   ├── index.js          # Página principal
│   ├── _app.js           # Configuración de la app
│   └── _document.js      # Configuración HTML
├── components/
│   └── MapaCircuitos.js  # Mapa interactivo con Leaflet
├── public/
│   └── data/
│       ├── circuitos_completo.json    # 119 circuitos × 54 métricas
│       ├── partidos_por_eleccion.json # Top 5 partidos × 9 elecciones
│       ├── barrios_por_circuito.json  # 486 barrios mapeados
│       └── circuitos_cordoba.json     # TopoJSON del mapa
├── styles/
│   └── globals.css
├── middleware.js         # Autenticación
├── next.config.js
└── package.json
```

## 🛠️ Desarrollo local

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Abrir http://localhost:3000
```

## 📊 Datos incluidos

- **119 circuitos** con 54 métricas cada uno
- **9 elecciones**: Gob 2007-2023, Dip 2021-2025, Int 2019
- **486 barrios** mapeados a circuitos
- **Categorías de diagnóstico**: Bastión, Leal, Pérdida, Disputa, Hostil

## 📱 Características

- ✅ Responsive (funciona en TV, desktop, tablet)
- ✅ Mapa interactivo con Leaflet
- ✅ 5 solapas de análisis por circuito
- ✅ Vista agregada de Capital
- ✅ Búsqueda de circuitos
- ✅ Comparativas Llaryora/Schiaretti
- ✅ Autenticación Basic Auth

---

Desarrollado para análisis electoral de Córdoba Capital.
