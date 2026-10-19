# Carga semanal de la pauta de Capital (runbook)

Reemplaza a la skill `procesar-pauta-cordoba-capital` y al maestro `BASE_PAUTA_RRSS_CORDOBA_CAPITAL.xlsx`. Mismo modelo que la carga semanal del tablero del interior (`Tablero comunicacion`): un script versionado lee el crudo y genera el JSON; nada se edita a mano.

Reglas completas: manual metodológico "Pauta Digital, Córdoba Capital". Código: `scripts/generar_pauta_capital.py`. Decisiones versionadas: `scripts/config_pauta/`.

## Política: solo lo confirmado; lo que no se entiende queda afuera
El área confirma las reglas. Mientras una regla no esté confirmada, el generador **no adivina**: si algo no se entiende o no respeta la regla, queda afuera (la fila pasa a `pendiente`, o el ítem de la audiencia se omite) y se informa en la corrida. No hay coincidencia aproximada de nombres ni alias sin confirmar. Cada semana se le pasa al área la lista de lo que quedó afuera (`Pendientes_de_confirmacion.xlsx`, paso 3) y, cuando confirma, se agrega la regla o el alias y se vuelve a generar.

## Antes de empezar
- Tener el crudo vigente: `Pauta RRSS_GLOBAL.xlsx`, hoja `GLOBAL_ImportRange` (77 columnas, encabezados en la fila 1). **No se versiona** en este repo; guardarlo fuera del repo y anotar su fecha de carga.
- Python 3 con `pandas` y `openpyxl`; Node para los controles.
- Una rama de trabajo desde `main` actualizada. Las cargas de datos van a `preview-testing` (nunca directo a `main`): antes, `git log --oneline preview-testing..main`; si `main` tiene commits que `preview-testing` no, ponerla al día primero.

## Pasos
1. **Tests.** Tienen que pasar antes de cargar nada.
   ```bash
   python3 scripts/test_pauta_capital.py
   node scripts/test_estado_pauta.mjs
   ```
2. **Corrida de verificación** (no escribe nada):
   ```bash
   python3 scripts/generar_pauta_capital.py --crudo "<ruta>/Pauta RRSS_GLOBAL.xlsx"
   ```
   Leer el resumen con la tabla de señales de abajo.
3. **Lista para el área.** Genera el Excel con lo que quedó afuera: alias pendientes con cuántos ítems afectarían, ítems de audiencia sin resolver, filas pendientes y reglas a confirmar:
   ```bash
   python3 scripts/pendientes_pauta_capital.py --crudo "<ruta>/Pauta RRSS_GLOBAL.xlsx" --salida Pendientes_de_confirmacion.xlsx
   ```
   El área completa las columnas "¿Se confirma?" y "Barrio correcto".
   **Resolver lo que avisa** (ver tabla). Un alias nuevo o una decisión por fila es un cambio de **código**: va en su propio commit, con un caso en `scripts/test_pauta_capital.py`, antes del commit de datos.
4. **Generar el JSON.**
   ```bash
   python3 scripts/generar_pauta_capital.py --crudo "<ruta>/Pauta RRSS_GLOBAL.xlsx" --salida public/data/pautas_barrios.json
   ```
   Si frena por bajas de `COD. CONTENIDO`, **no seguir**: mostrar la lista al área. Solo si confirman que las bajas son legítimas, repetir con `--aceptar-bajas`.
5. **Conteos de control** con fechas fijas (usar siempre las mismas fechas para comparar con la carga anterior):
   ```bash
   node scripts/control_pauta_capital.mjs 2026-10-14 2026-10-15
   ```
6. **Archivo de verificación** (una fila por cada fila real del crudo; sirve para cotejar cualquier número fila por fila):
   ```bash
   python3 scripts/verificacion_pauta_capital.py --crudo "<ruta>/Pauta RRSS_GLOBAL.xlsx" --salida Verificacion_pauta_capital.xlsx --fechas 2026-10-14 2026-10-15
   ```
   Los totales de su hoja `Resumen` tienen que coincidir con los del paso 5.
7. **Build:** `npm run build`. Si falla, no commitear.
8. **Commit de datos, solo el JSON** (los de código van aparte). Formato del mensaje:
   `data(pautas_barrios.json): regenerado completo, N entradas — fuente: Pauta RRSS_GLOBAL.xlsx (carga del DD/MM)`, con en el cuerpo: sha256 del crudo, filas reales, entradas por bucket, por estado y por plataforma, y qué barrios aparecen o desaparecen.
9. **Push a la rama de preview, revisar el deploy y recién después pedir el OK para el merge.** El sitio tiene Basic Auth: la revisión visual la hace una persona con credenciales (mirar una ficha de barrio, la pestaña "Pauta por circuito" y el mapa con la capa Pauta).

## Qué mirar en la corrida de verificación
| Señal | Qué significa | Qué hacer |
|---|---|---|
| `Códigos dados de baja: N` (y la corrida frena) | Desaparecieron códigos que estaban en el JSON anterior | No seguir. Pedir al área que explique. Con confirmación, `--aceptar-bajas` |
| `AVISO: N ítems de audiencia sin resolver` | Un barrio de la audiencia no se encontró; **ese ítem queda afuera**, la fila entra con los demás y la nota queda en `observaciones` | Pasarlo al área en `Pendientes_de_confirmacion.xlsx`. Si confirman un alias, pasarlo de `pendientes_de_confirmar` a `alias` en `alias_barrios.json` (commit de código + caso de test) |
| `Filas por destino: pendiente` creció | Hay filas cuyo alcance no se puede decidir (audiencia sin referencia geográfica, que nombra otro departamento o un barrio que no se resuelve) | Pedir al área que complete la audiencia; quedan afuera hasta que lo hagan |
| `AVISO: estados fuera de …` | Llegó un ESTADO nuevo (no ACTIVO, INACTIVO, OBSERVADO, PROGRAMADO ni vacío) | Se muestra tal cual. Avisar al área para que confirme que es intencional |
| `Entradas sin INICIO o sin FIN válidos` subió | Fechas escritas como texto, con un espacio o como número suelto | Pedir al área que las corrija en la planilla; el tablero no las interpreta |
| `colapsadas por dedup` subió mucho | Más filas con el mismo código, campaña, título y destino | Normal si se repiten piezas por conjunto de anuncios; revisar si coincide con una carga duplicada |
| `descartadas como basura` cambió mucho | Cambió la cantidad de renglones con formato sin datos, o la planilla perdió filas | Revisar el crudo antes de seguir |
| Un encabezado dejó de coincidir (error `KeyError`) | Renombraron o borraron una columna | Parar y avisar: el generador lee por nombre exacto (con espacios finales, `INICIO `, `Inversión ejecutada `, `UTM´S`) |

## Qué no se hace
- No se edita `pautas_barrios.json` a mano ni se mezcla un fragmento: siempre se regenera completo.
- No se versiona el crudo ni se vuelve a usar el maestro xlsx (queda como archivo histórico).
- No se cambia una regla sin test: cualquier cambio a la geografía, el estado, las fechas o los duplicados necesita un caso en `scripts/test_pauta_capital.py` o `scripts/test_estado_pauta.mjs`.
- No se hace merge ni push a `main` sin la aprobación explícita de quien dirige el proyecto.

## Dónde vive cada regla
| Regla | Archivo |
|---|---|
| Fila real, estado, fechas, geografía de Capital, barrios, duplicados, freno de bajas | `scripts/generar_pauta_capital.py` |
| Alias de barrios (confirmados y pendientes de confirmar) y barrios a descartar | `scripts/config_pauta/alias_barrios.json` |
| Lista de pendientes para el área | `scripts/pendientes_pauta_capital.py` |
| Decisiones puntuales por fila | `scripts/config_pauta/decisiones_filas.json` |
| "Activa" (único predicado), estados, cobertura dirigida | `lib/estadoPauta.js` |
| Piezas únicas por circuito, tarjetas y mapa | `lib/pautaPorCircuito.js`, `lib/pautaResumen.js`, `lib/pautaMapa.js` |
| Conteos de control | `scripts/control_pauta_capital.mjs` |
| Verificación fila por fila | `scripts/verificacion_pauta_capital.py` |
