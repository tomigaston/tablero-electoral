# Pauta de Capital: generador desde el crudo

`scripts/generar_pauta_capital.py` lee `Pauta RRSS_GLOBAL.xlsx` (hoja `GLOBAL_ImportRange`) y genera `pautas_barrios.json`.
Es el mismo modelo que el tablero del interior (`Tablero comunicacion/scripts/generar_datos.py`): un script versionado, reproceso completo desde el crudo, sin maestro intermedio.

```bash
# Verificar sin escribir nada
python3 scripts/generar_pauta_capital.py --crudo "<ruta>/Pauta RRSS_GLOBAL.xlsx"

# Generar el JSON (el freno de bajas compara contra --previo, por defecto public/data/pautas_barrios.json)
python3 scripts/generar_pauta_capital.py --crudo "<ruta>/Pauta RRSS_GLOBAL.xlsx" --salida public/data/pautas_barrios.json

# Archivo de verificación fila por fila (una fila por cada fila real del crudo)
python3 scripts/verificacion_pauta_capital.py --crudo "<ruta>/Pauta RRSS_GLOBAL.xlsx" --salida Verificacion_pauta_capital.xlsx

# Lo que quedó afuera y el área tiene que confirmar (Excel)
python3 scripts/pendientes_pauta_capital.py --crudo "<ruta>/Pauta RRSS_GLOBAL.xlsx" --salida Pendientes_de_confirmacion.xlsx

# Conteos de control con fechas fijas
node scripts/control_pauta_capital.mjs 2026-10-14 2026-10-15

# Tests (obligatorios antes de mergear cambios de reglas)
python3 scripts/test_pauta_capital.py
node scripts/test_estado_pauta.mjs
```

## Archivos de decisiones (versionados)
- `scripts/config_pauta/alias_barrios.json`: correcciones de nombres de barrio de la columna AUDIENCIA. `alias` = confirmados (se aplican); `pendientes_de_confirmar` = NO se aplican, solo se sugieren en el aviso. También los barrios a descartar. **Política: solo lo confirmado; lo que no se entiende queda afuera.**
- `scripts/config_pauta/decisiones_filas.json`: decisiones puntuales sobre filas (por texto, no por número de fila).

## Qué frena y qué avisa
- **Frena** (sin escribir el JSON): si desaparece algún `COD. CONTENIDO` que estaba en el JSON anterior (con `--aceptar-bajas` se continúa, solo si el área confirmó las bajas); si un alias apunta a un barrio que no existe en `barrios_geo.json`.
- **Avisa** (la fila entra con el resto): ítems de audiencia sin resolver (quedan además en `observaciones`), estados fuera de ACTIVO/INACTIVO/OBSERVADO/PROGRAMADO/vacío, entradas sin INICIO o FIN válidos.

## Esquema de cada entrada
Igual al JSON anterior, con estos cambios: `estado` pasa a `Vigente | Finalizada | Observada | Programada | S/D` (o el valor tal cual si es otro); se agregan `cod_contenido`, `fecha_envio` y `plataforma_origen`; desaparece `incluir_tablero` (ninguna pantalla lo lee); `fila_origen` es el número de fila del crudo (varias entradas pueden compartirlo: una fila con N barrios genera N entradas). **Este cambio de esquema todavía no lo consume el frontend** (Etapa 2).

Paso a paso de la carga semanal: `docs/pauta-capital-carga-semanal.md`.
