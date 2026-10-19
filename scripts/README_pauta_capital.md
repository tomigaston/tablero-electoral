# Pauta de Capital: generador desde el crudo

`scripts/generar_pauta_capital.py` lee `Pauta RRSS_GLOBAL.xlsx` (hoja `GLOBAL_ImportRange`) y genera `pautas_barrios.json`.
Es el mismo modelo que el tablero del interior (`Tablero comunicacion/scripts/generar_datos.py`): un script versionado, reproceso completo desde el crudo, sin maestro intermedio.

```bash
# Verificar sin escribir nada
python3 scripts/generar_pauta_capital.py --crudo "<ruta>/Pauta RRSS_GLOBAL.xlsx"

# Generar el JSON (el freno de bajas compara contra --previo, por defecto public/data/pautas_barrios.json)
python3 scripts/generar_pauta_capital.py --crudo "<ruta>/Pauta RRSS_GLOBAL.xlsx" --salida public/data/pautas_barrios.json

# Tests (obligatorios antes de mergear cambios de reglas)
python3 scripts/test_pauta_capital.py
```

## Archivos de decisiones (versionados)
- `scripts/config_pauta/alias_barrios.json`: correcciones de nombres de barrio de la columna AUDIENCIA y barrios a descartar. El generador no adivina nada que no esté acá.
- `scripts/config_pauta/decisiones_filas.json`: decisiones puntuales sobre filas (por texto, no por número de fila).

## Qué frena y qué avisa
- **Frena** (sin escribir el JSON): si desaparece algún `COD. CONTENIDO` que estaba en el JSON anterior; si un alias apunta a un barrio que no existe en `barrios_geo.json`.
- **Avisa** (la fila entra con el resto): ítems de audiencia sin resolver (quedan además en `observaciones`), estados fuera de ACTIVO/INACTIVO/OBSERVADO/PROGRAMADO/vacío, entradas sin INICIO o FIN válidos.

## Esquema de cada entrada
Igual al JSON anterior, con estos cambios: `estado` pasa a `Vigente | Finalizada | Observada | Programada | S/D` (o el valor tal cual si es otro); se agregan `cod_contenido`, `fecha_envio` y `plataforma_origen`; desaparece `incluir_tablero` (ninguna pantalla lo lee); `fila_origen` es el número de fila del crudo (varias entradas pueden compartirlo: una fila con N barrios genera N entradas). **Este cambio de esquema todavía no lo consume el frontend** (Etapa 2).
