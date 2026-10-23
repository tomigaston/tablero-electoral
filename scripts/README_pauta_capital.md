# Pauta de Capital: generador desde el crudo

Proceso completo de la carga semanal: `docs/pauta-capital-carga-semanal.md`.

`scripts/generar_pauta_capital.py` lee `Contexto/Pauta RRSS_GLOBAL.xlsx` (hoja `GLOBAL_ImportRange`, versionado) y genera `public/data/pautas_barrios.json` y, en la misma corrida, `public/data/Filas_no_procesadas_pauta_capital.xlsx` (filas que no entran, con su motivo, para el área; la corrida se detiene si su resumen no cuadra con el JSON). Mismo modelo que el tablero del interior: un script versionado, reproceso completo desde el crudo, sin maestro intermedio. Se pisa el crudo y se corre.

```bash
python3 scripts/generar_pauta_capital.py                    # genera el JSON y el documento de filas no procesadas
python3 scripts/generar_pauta_capital.py --solo-verificar   # solo imprime el resumen
python3 scripts/verificacion_pauta_capital.py               # Contexto/Verificacion_pauta_capital.xlsx (una fila por fila del crudo)
python3 scripts/pendientes_pauta_capital.py                 # Contexto/Pendientes_de_confirmacion.xlsx (para el área)
node scripts/control_pauta_capital.mjs 2026-10-14 2026-10-15  # conteos de control con fechas fijas
python3 scripts/test_pauta_capital.py                       # tests (obligatorios antes de mergear cambios de reglas)
node scripts/test_estado_pauta.mjs
```

## Archivos de decisiones (versionados)
- `scripts/config_pauta/alias_barrios.json`: correcciones de nombres de barrio de la columna AUDIENCIA. `alias` = confirmados (se aplican); `pendientes_de_confirmar` = NO se aplican, solo se sugieren en el aviso. También los barrios a descartar. **Política: solo lo confirmado; lo que no se entiende queda afuera.**
- `scripts/config_pauta/decisiones_filas.json`: decisiones puntuales sobre filas (por texto, no por número de fila).

## Qué frena y qué avisa
- **Frena** (sin escribir el JSON): si desaparece alguna pieza (CAMPAÑA + TITULO DE LA PIEZA, normalizados) que estaba en el JSON anterior (con `--aceptar-bajas` se continúa, solo si se confirmó); si un alias apunta a un barrio que no existe en `barrios_geo.json`; si el resumen del documento de filas no procesadas no coincide con las entradas y filas del JSON (en ese caso no deja el documento).
- **Avisa** (la fila entra con el resto): ítems de audiencia sin resolver (quedan además en `observaciones`), estados fuera de ACTIVO/INACTIVO/OBSERVADO/PROGRAMADO/vacío, entradas sin INICIO o FIN válidos.

## Duplicados
Clave: CAMPAÑA + TITULO DE LA PIEZA + PLATAFORMA (cruda) + destino + INICIO + FIN + LINK MATERIAL + TIPO DE MATERIAL + AUDIENCIA, normalizados (espacios, mayúsculas, tildes), comparada después de repartir la geografía. Se conserva la de FECHA DE ENVÍO más reciente, luego la de ESTADO = ACTIVO, luego la primera de la planilla. Las métricas nunca se suman. `COD. CONTENIDO` es solo informativo (no decide nada).

## Esquema de cada entrada
`estado` es `Vigente | Finalizada | Observada | Programada | S/D` (o el valor tal cual si es otro); incluye `cod_contenido` (informativo), `fecha_envio` y `plataforma_origen`; `fila_origen` es el número de fila del crudo (varias entradas pueden compartirlo: una fila con N barrios genera N entradas). Detalle de campos: `lib/data-manifest.js`.
