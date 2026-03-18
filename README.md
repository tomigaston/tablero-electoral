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
     - `AUTH_USER`: usuario para acceder
     - `AUTH_PASS`: contraseña segura
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
   vercel env add AUTH_USER
   vercel env add AUTH_PASS
   ```

4. **Deploy a producción**
   ```bash
   vercel --prod
   ```

## 🔒 Seguridad

La aplicación usa Basic Auth para proteger el acceso. Configurar las variables de entorno:

- `AUTH_USER`: Usuario (default: admin)
- `AUTH_PASS`: Contraseña (default: cordoba2026)
- `DISABLE_AUTH`: Poner en "true" para desarrollo local sin auth

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
