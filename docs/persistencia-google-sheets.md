# Persistencia del Planificador en Google Sheets

Las recomendaciones (acciones) y las notas de cada circuito se guardan en una **planilla de Google Sheets**, a través de un
**Apps Script** publicado como aplicación web. Reemplaza a la base KV/Redis (que sigue soportada como alternativa: si están
`PLANIFICADOR_SHEETS_*`, se usa Sheets; si no, KV; si no, archivo local en desarrollo).

```
Navegador ──(Basic Auth)──> /api/planificador/fichas (Vercel) ──(token)──> Apps Script ──> Planilla de Drive
```

El navegador nunca habla con Google: lo hace el servidor del tablero, con la URL y el token guardados como variables de
entorno. El repo es público: **ni la URL ni el token van en el código.**

## Qué hay armado
- Planilla **"Planificador - Base de datos (recomendaciones)"** en la carpeta *TABLERO CAPITAL* de Drive, con el script vinculado
  **"Planificador - Base de datos"** (código en `docs/planificador-db.gs`).
- Hoja **Acciones**: una fila por recomendación (`circuito, id, tipo, texto, estado, creada_por, creada_en, estado_por, estado_en, hecha_por, hecha_en`).
  Los estados se guardan como `pendiente` / `en_curso` / `hecha` (en pantalla: Pendiente / En ejecución / Cumplido).
- Hoja **Etapas**: una fila por etapa de cada recomendación (circuito, accion_id, id, fecha, texto, creada_por, creada_en): el historial con fechas (p. ej. visita pedida → respondieron fecha → confirmada).
- Hoja **Notas**: una fila por circuito (`circuito, notas, actualizado_por, actualizado_en`).
- Todo se guarda como texto. Se puede mirar, filtrar y exportar la planilla; si se edita a mano, no cambiar los títulos de las
  columnas ni los `id`. El tablero toma los cambios en su próxima actualización (cada 60 s).

## Para activarlo en Vercel (una vez)
En el proyecto `tablero-electoral` → *Settings → Environment Variables*, cargar en **Preview y Production**:

| Variable | Valor |
|---|---|
| `PLANIFICADOR_SHEETS_URL` | URL de la aplicación web del script (termina en `/exec`) |
| `PLANIFICADOR_SHEETS_TOKEN` | el token del script (propiedad `TOKEN` en el proyecto de Apps Script) |

Después **redeployar** la rama (las variables nuevas solo se aplican a deploys nuevos). Si faltan, la ficha avisa que no se
puede guardar y el Resumen muestra "Sin datos de seguimiento"; el resto funciona.

## Notas técnicas y límites
- Cada guardado tarda 1–3 s (Apps Script). El script usa un candado (`LockService`) al escribir.
- El servidor sigue haciendo leer → aplicar operación → guardar sobre la ficha del circuito: dos personas editando *el mismo
  circuito en el mismo segundo* podrían pisarse (aceptable para un equipo chico).
- Para rotar el token: cambiar la propiedad `TOKEN` en *Configuración del proyecto → Propiedades del script* y actualizar
  `PLANIFICADOR_SHEETS_TOKEN` en Vercel.
- Si se cambia el código del script, hay que publicar una **nueva versión** de la implementación (la URL se mantiene).
