# Planificador territorial (piloto)

Vista nueva en `/planificador` (rama `feature/planificador`). No modifica `pages/index.js` ni ninguna ruta existente.
Concepto: **informar → que el equipo concluya → que anote su decisión → seguimiento**. No recomienda qué hacer: la hoja
Circuitos muestra una *Lectura* factual y el equipo registra sus propias decisiones.

Dos hojas, con navegación cruzada y filtros que se conservan al ir y volver:

- **Resumen** — KPIs, tema de la pauta (piezas / inversión), dónde estamos a ciegas, clima, problema #1 sin cobertura,
  obras listas por antigüedad y seguimiento del equipo. Todo dato es clickeable y lleva a Circuitos filtrado.
- **Circuitos** — lista (izquierda) + ficha (derecha): electoral, encuesta con fechas y período, 3 problemas + cobertura,
  *Qué se hizo* (pauta campaña → pieza, visitas, obras listas/totales), Lectura, y *Tu decisión y seguimiento*.

Rutas con hash: `#/resumen`, `#/circuitos`, `#/circuitos/14M`.

## Correrlo local

```bash
DISABLE_AUTH=true npm run dev      # http://localhost:3000/planificador
```

Sin `DISABLE_AUTH` rige el Basic Auth de `middleware.js` (la ruta y la API quedan protegidas sin código propio).
En local las decisiones se guardan en `.data/planificador-fichas.json` (ignorado por git).

## Persistencia (decisiones, acciones, notas)

El repo no tenía base de datos, así que se agregó una capa mínima, **sin dependencias nuevas**:

- `pages/api/planificador/fichas.js` — `GET` (todas las fichas) y `POST { circuito, op }`. Cada operación se aplica sobre la
  ficha guardada (`lib/planificador/acciones.js`, reductor puro): `agregarAccion`, `cambiarEstado` (cicla pendiente → en curso →
  hecha), `borrarAccion`, `notas`. Se guarda en cada acción del usuario, no en cada render.
- `lib/planificador/servidor/store.js` — **Redis REST (Upstash / Vercel KV)** vía `fetch`. Un hash `planificador:fichas`
  (campo = circuito, valor = ficha JSON). Fuera de Vercel cae a archivo local. En Vercel sin base configurada la API responde 503
  y la UI avisa que no se puede guardar (el resto de la vista funciona).
- **Atribución:** el nombre de usuario sale del header Basic Auth que ya valida el middleware (`AUTH_USERS`). La API solo lee el
  *nombre*; nunca guarda ni loguea la clave. Sin header (`DISABLE_AUTH`) el usuario es `local`.
- Esquema de cada ficha: `{ notas, acciones: [{ id, tipo, texto, estado, creada_por, creada_en, estado_por, estado_en, hecha_por, hecha_en }], actualizado_por, actualizado_en }`.

### Para activarla en Vercel (una vez)

1. En el proyecto `tablero-electoral` → *Storage* → crear/conectar **Upstash Redis** (o Vercel KV) y asociarlo al proyecto.
2. Verificar que se inyecten `KV_REST_API_URL` y `KV_REST_API_TOKEN` (o `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) en
   los entornos **Preview** y Production. Redeployar la rama.

Límite conocido: las operaciones son leer-modificar-escribir sobre la ficha del circuito. Dos personas editando *el mismo
circuito en el mismo segundo* podrían pisarse; con equipo chico es aceptable. Las fichas se refrescan cada 60 s y al volver a la pestaña.
El backend Redis no se pudo probar acá (no hay credenciales): se probó el reductor, la API y el almacenamiento en archivo.

## Datos que usa (mismos JSON de `public/data/`)

| Dimensión | Archivo | Campos |
|---|---|---|
| Electoral | `circuitos_completo.json` | `Share_Int19`, `Share_G23` (META), `Padron_G23`, `Categoria_v4_Nombre` |
| Encuesta | `encuestas_circuitos.json` + `encuestas_metadata.json` | `Aprobación Gobernador` (serie con fechas, umbral `umbral_variacion_pp`), `Reelección Llaryora`, `Problemas principales` |
| Pauta | `pautas_barrios.json` | piezas por circuito vía `derivarPautaPorCircuito` |
| Visitas | `recorridos_barrios.json` + `circuito_barrios_cruce.json` | barrio principal del circuito (orden 1) |
| Obras | `obras_capital.json` | por `circuito`, con `enriquecerObrasConCircuito` |
| Parte de Obras | texto diario (opcional) | `lib/parteObras.js` |

## Mapa de archivos

- `lib/planificador/` — `config.js` (tiers, paleta, mapeo problema→palanca), `tendencia.js`, `eventos.js`, `obras.js`,
  `cobertura.js`, `pautas.js` (campaña → pieza), `prioridad.js` (semáforo), `lectura.js` (texto factual), `agregados.js`
  (Resumen), `filtros.js`, `acciones.js` (decisiones), `index.js` (`construirPlanificador`).
- `lib/parteObras.js` (+ `parteObrasBarrios.js`) — port del parser del artefacto del Parte de Obras.
- `components/planificador/` — `HojaResumen`, `HojaCircuitos`, `FichaCircuito`, `BloqueQueSeHizo`, `BloqueDecision`, `ui`.

## Parte de Obras diario

No se lee del link del artefacto (devuelve la app vacía): se parsea el **texto** del parte. Se carga de dos formas:
pegándolo en el panel "Parte de Obras del día" (al pie; se recuerda en el navegador) o dejándolo en `public/data/parte_obras.txt`.
Con parte cargado, `obrasInaugurablesDeCircuito` marca cada obra lista como **"confirmada por el parte"** cuando el parte la
trae como finalizada en el mismo circuito y barrio, y suma como "solo en el parte" las finalizadas que no están en
`obras_capital.json`. Sin parte, el respaldo es `obras_capital.json`. Hoy el parte de ejemplo solo trae obras "En ejecución".

## Decisiones técnicas

1. **Helpers duplicados, no importados.** `buscarEncuestaCircuito`, `normalizarNombreBarrio`, `esFechaValida`, `formatPct`,
   la paleta y las descripciones de categoría son privados en `pages/index.js` (no exportados) y el piloto no lo toca: se copiaron
   a `lib/planificador/base.js` / `config.js` con su origen anotado. Al validar el piloto, extraerlos a un `lib/` común.
2. **Pauta deduplicada** con `derivarPautaPorCircuito` en lugar de `buscarPautaCircuito` (este repite la misma pieza por barrio).
   Las campañas se agrupan sin distinguir mayúsculas ("CORDOBESES EN ALERTA" = "Cordobeses en Alerta").
3. **Impresión por CSS** (`window.print()` con `@media print`, A4, sin fondos) en lugar de `generarFichaPDF`, que es privada de `index.js`.
4. **"Pauta sin medición posterior"** = ninguna ronda posterior al **fin** de la última pauta (si la pauta sigue corriendo, todavía
   no se puede evaluar). Da 93, igual que la spec.
5. **Cobertura:** una obra solo cubre si está *Finalizada* o *En ejecución*; "solo planificada" se muestra aparte y no cuenta.
6. **Semáforo** (§3.3) solo ordena; la lista parte por prioridad con "fuego" (empeora + Desfavorable/Adverso) arriba.
7. **Lectura** describe coincidencia temporal ("en el período hubo…"), nunca causalidad. "Período" = entre las dos últimas rondas.
8. Las piezas de pauta sin `inicio` válido cuentan en los totales pero no en las comparaciones temporales (la ficha lo avisa).

## Contraste con las cifras de la spec (datos al 17/10/2026)

| Dato | Spec | Resultado |
|---|---|---|
| Tiers F/I/D/A | 14 · 60 · 39 · 6 | 14 · 60 · 39 · 6 ✓ |
| Sin encuesta / 1 ronda / con tendencia | 23 · 73 · 23 | 23 · 73 · 23 ✓ |
| Mejoran / empeoran / estables | 11 · 9 · 3 | 11 · 9 · 3 ✓ |
| Obra lista | 92 | 92 ✓ |
| Pauta sin medición posterior | 93 | 93 ✓ |
| Seguridad: % de piezas / de inversión | ~92 % / ~94 % | **88,5 % / 90,3 %** |
| Problema #1 sin cobertura | 34 (21 calles) | **46 (25 calles)** |

Las dos últimas no coinciden. Probé variantes (con/sin pauta de Capital, solo vigentes, otras definiciones de "cubre") y ninguna da
las cifras de la spec, así que parecen venir de otra foto de los datos o de otro criterio. Del 46: 25 calles, 16 Seguridad (el
circuito no tiene pauta de eje SEGURIDAD), 2 cloacas, 2 pavimento, 1 residuos. Si en la spec "Seguridad" se daba por cubierta
(p. ej. por la pauta de toda la Capital), quedarían 30. **Hay que confirmar el criterio.**

## Puntos abiertos

- Confirmar el criterio de "problema #1 sin cobertura" y el origen de las cifras de seguridad (ver tabla).
- Mapeo problema↔intervención: quedan fuera obras que parecen atender calles/pavimento (`Repavimentacion con asfalto`,
  `Repavimentacion y bacheo con hormigon`, `Cordón Cuneta`). Se suman en `PALANCAS_POR_PROBLEMA` si el equipo lo aprueba.
- Automatizar la carga del parte diario (hoy es manual).
- Identidad: la atribución usa el usuario de Basic Auth (`AUTH_USERS`); si dos personas comparten usuario, comparten identidad.
- Afinar los pesos del semáforo cuando entren segundas rondas.
