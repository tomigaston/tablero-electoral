# Cómo se actualiza la pauta de Capital (de ahora en más)

Este es el proceso completo para actualizar la pauta digital de Córdoba Capital. Es igual al del tablero del interior: **se pisa el crudo, se corre un comando y se sube el resultado.** No hay skill, no hay Claude.ai en el medio y no hay maestro intermedio.

## En una línea
Pisar `Contexto/Pauta RRSS_GLOBAL.xlsx` → `python3 scripts/generar_pauta_capital.py` → mirar el resumen → commit de datos → push.

## Qué cambió respecto del proceso anterior
| Antes | Ahora |
|---|---|
| Se subía el crudo y el maestro a Claude.ai y la skill `procesar-pauta-cordoba-capital` armaba un maestro nuevo y el JSON | Un script del repo (`scripts/generar_pauta_capital.py`) lee el crudo y genera el JSON. La skill se eliminó |
| El maestro `BASE_PAUTA_RRSS_CORDOBA_CAPITAL.xlsx` se acumulaba y era la entrada | **No hay maestro.** El crudo es la única entrada. El maestro viejo quedó archivado en `Contexto/historico/` solo como referencia |
| El crudo se guardaba fuera del repo | El crudo se guarda en `Contexto/Pauta RRSS_GLOBAL.xlsx` y **se versiona**, igual que en el interior |
| Se agregaban solo las filas nuevas y se refrescaban algunas | Se regenera **todo** desde el crudo, cada vez |
| Las reglas vivían en la skill y en las decisiones de la conversación | Las reglas están en el código, con tests, y en el manual metodológico |

## El crudo trae lo viejo y lo nuevo (confirmado)
`Pauta RRSS_GLOBAL.xlsx` es un acumulado: cada versión incluye las filas de las cargas anteriores. Se verificó el 19/10 contra el maestro del 8/10: de sus 1.955 códigos, 1.945 están en el crudo del 17/10 (los 10 que faltan eran códigos de relleno `1` a `10` de filas del maestro que ya no existen) y el crudo agrega 744 códigos nuevos. La pieza más vieja empieza el mismo día en los dos (03/07/2026).

Por eso se **pisa todo**: no hay nada que "sumar" a lo anterior. Lo que el crudo no traiga, no está en el tablero. Para que eso no pase sin que nadie se entere, el generador **frena** si desaparece algún código del JSON anterior (ver "Frenos").

**¿Para qué queda el control entonces?** El maestro acumulado ya no existe, y su función de control la cumple el **archivo de verificación**: un Excel con una fila por cada fila del crudo (su geografía, su destino, si entra y por qué no, entradas, estado y si está activa), que se regenera completo en cada carga. Está en `Contexto/Verificacion_pauta_capital.xlsx` y no se versiona.

## Antes de empezar (una sola vez)
- Repo: `/Users/tomasgaston/dev/tablero-electoral`, en `main` y actualizado (`git checkout main && git pull`).
- Python 3 con `pandas` y `openpyxl`, y Node (los mismos que ya están instalados).
- Las cargas de datos van en commits aparte de los cambios de código.

## Paso a paso (la carga de la semana que viene)

### 1. Pisar el crudo
Descargar el crudo nuevo (hoja `GLOBAL_ImportRange`, encabezados en la fila 1) y guardarlo **con este nombre exacto**, pisando el anterior:

```
Contexto/Pauta RRSS_GLOBAL.xlsx
```

El crudo se toma **tal como viene**. Si una fila tiene problemas, no es un problema de la carga: queda afuera y se puede ver el motivo en el archivo de verificación. Lo único que se exige es que el crudo respete las reglas del manual metodológico (encabezados con su nombre exacto, fechas reales, `TODAS LAS LOCALIDADES` en mayúsculas, etc.).

### 2. Tests (solo si se tocó código o alias)
```bash
python3 scripts/test_pauta_capital.py
node scripts/test_estado_pauta.mjs
```
Tienen que dar `61/61 casos OK` (o más, si se agregaron) y `18 casos OK`.

### 3. Verificar sin escribir nada
```bash
python3 scripts/generar_pauta_capital.py --solo-verificar
```
Lee el resumen y compará con la tabla "Cómo leer el resumen" (más abajo). Si algo llama la atención, resolverlo antes de seguir.

### 4. Generar el JSON
```bash
python3 scripts/generar_pauta_capital.py
```
Lee `Contexto/Pauta RRSS_GLOBAL.xlsx` y pisa `public/data/pautas_barrios.json` y `public/data/Filas_no_procesadas_pauta_capital.xlsx` (las filas que no entran, con su motivo, para mandarle al área). Imprime el resumen del documento; si no cuadra con el JSON se detiene. Si frena por bajas, ver "Frenos".

### 5. Control con fechas fijas
```bash
node scripts/control_pauta_capital.mjs 2026-10-14 2026-10-15
python3 scripts/verificacion_pauta_capital.py --fechas 2026-10-14 2026-10-15
```
El primero imprime las tarjetas con el código real del tablero. El segundo arma `Contexto/Verificacion_pauta_capital.xlsx`. Los totales de su hoja `Resumen` tienen que coincidir con los del primero. Conviene usar siempre las mismas dos fechas para poder comparar de una semana a la otra.

### 6. Lista para el área (solo si hay algo para confirmar)
```bash
python3 scripts/pendientes_pauta_capital.py
```
Genera `Contexto/Pendientes_de_confirmacion.xlsx` con tres hojas: alias de barrios pendientes, nombres de audiencia que no se reconocieron y reglas a confirmar. **Las filas pendientes no se le piden al área**: el crudo se toma como viene. Si el área confirma algo, ver "Cómo incorporar lo que confirma el área".

### 7. Build
```bash
npm run build
```
Tiene que compilar. Si falla, no seguir.

### 8. Commit de datos
Un solo commit con el crudo y el JSON (son los dos datos de la carga). Formato del mensaje, igual que en el interior:

```
data(pauta): carga semanal con crudo del DD/MM (N filas reales, N entradas)

Crudo: Contexto/Pauta RRSS_GLOBAL.xlsx, sha256 <hash>
Entradas: barrios N en N barrios, circuitos_sin_barrio N, toda_capital N
Estado: Vigente N, Finalizada N, Observada N, S/D N, Programada N
Bajas (campaña + título) respecto de la carga anterior: N
```

```bash
git add "Contexto/Pauta RRSS_GLOBAL.xlsx" public/data/pautas_barrios.json public/data/Filas_no_procesadas_pauta_capital.xlsx
git commit
```
El hash sale de `shasum -a 256 "Contexto/Pauta RRSS_GLOBAL.xlsx"`.

### 9. Push y chequeo del deploy
```bash
git push origin main
```
Vercel publica solo. Esperar a que figure "Ready" (`vercel ls tablero-electoral`) y mirar tres cosas en el tablero: la tarjeta "Pauta activa" (tiene que coincidir con el número del paso 5), una ficha de barrio con pauta y el mapa con la capa Pauta encendida.

## Cómo leer el resumen del paso 3
| Línea | Qué significa | Qué hacer |
|---|---|---|
| `Filas del crudo / descartadas / reales` | Renglones de la hoja, renglones sin CAMPAÑA ni TITULO (arrastre de fórmulas) y filas reales | Las reales deberían crecer o mantenerse. Si bajan mucho, revisar el crudo antes de seguir |
| `Filas por destino` | `entradas` (barrio o circuito), `toda_capital`, `excluido` (otro departamento) y `pendiente` (alcance que el crudo no deja decidir) | Un salto grande de `pendiente` o `excluido` merece mirar el archivo de verificación |
| `Entradas por estado` | Cuántas entradas hay en cada estado | `Programada` y estados nuevos pueden aparecer; se muestran tal cual |
| `AVISO: N ítems de audiencia sin resolver` | Nombres de barrio de las audiencias que no se reconocieron; **quedan afuera**, la fila entra con los demás | Normal. Van a la hoja "Ítems sin resolver" del paso 6 |
| `Entradas sin INICIO o sin FIN válidos` | Fechas vacías, escritas como texto o como número suelto | Normal si es parecido a la carga anterior; si sube mucho, el crudo cambió |
| `Piezas (campaña + título) dadas de baja: N` | Desaparecieron piezas que estaban en el JSON anterior | Ver "Frenos" |
| Error `KeyError` con un nombre de columna | Renombraron o borraron una columna del crudo | Parar. El generador lee por nombre exacto (incluidos los espacios finales de `INICIO ` y de `Inversión ejecutada `, y el acento de `UTM´S`) |

### Números de referencia (carga del 17/10, para comparar)
Con las reglas del 23/10 (clave de duplicado sin COD, seccional repartida en sus subcircuitos y TODAS LAS LOCALIDADES + PROVINCIA DE CÓRDOBA a toda_capital): filas del crudo 4.336, reales 4.104; entran 999, fuera de Capital 3.065, pendientes 8, duplicadas 32; 7.259 entradas (barrios 4.081 en 184 barrios, circuitos sin barrio 2.771, toda_capital 407); estados Finalizada 6.861, Vigente 195, S/D 134, Observada 69; con las fechas 14 y 15/10: 129 piezas únicas activas (68 + 61), 68 circuitos y 11 barrios cubiertos.

## Frenos
- **Bajas.** Si una pieza (CAMPAÑA + TITULO DE LA PIEZA, normalizados) que estaba en el JSON anterior ya no está en el crudo, el generador se detiene **sin escribir** y muestra la lista. Como el crudo es acumulado, una baja no es normal: avisar al área para que explique por qué desaparecieron esas piezas. Si confirman que es correcto (o si las bajas son consecuencia de una regla nueva que vos decidiste), repetir con `python3 scripts/generar_pauta_capital.py --aceptar-bajas` y dejar la lista en el mensaje del commit.
- **Documento de filas no procesadas que no cuadra.** Si el resumen del documento no coincide con las entradas y filas del JSON, el generador se detiene y no deja el documento: es un error del generador, no del crudo.
- **Alias que apunta a un barrio inexistente.** El generador se detiene al arrancar: corregir `scripts/config_pauta/alias_barrios.json`.

## Cómo incorporar lo que confirma el área
1. **Un alias de barrio confirmado:** en `scripts/config_pauta/alias_barrios.json`, pasarlo de `pendientes_de_confirmar` a `alias`. Agregar un caso en `scripts/test_pauta_capital.py` y correr los tests. Commit de **código** aparte.
2. **Un nombre que el área indica a qué barrio corresponde** (hoja "Ítems sin resolver"): se agrega como alias confirmado, igual que arriba.
3. **Una regla confirmada o cambiada:** se cambia el código (`scripts/generar_pauta_capital.py`), se agrega el test y se actualiza el manual. Commit de código aparte.
4. Después se repiten los pasos 4 a 9 y el commit de datos queda separado del de código.

Mientras el área no confirme, el alias o la regla **no se aplica** y el ítem queda afuera. No se adivina.

## Lo que no se hace
- No se edita `pautas_barrios.json` a mano ni se mezcla un fragmento: siempre se regenera completo.
- No se agrega el maestro a la carga ni se usa la skill (ya no existe).
- No se cambia una regla sin test y sin actualizar el manual.
- No se mezclan cambios de código y de datos en el mismo commit.

## Dónde vive cada cosa
| Qué | Dónde |
|---|---|
| Crudo (se pisa en cada carga, se versiona) | `Contexto/Pauta RRSS_GLOBAL.xlsx` |
| Generador (reglas) | `scripts/generar_pauta_capital.py` |
| Alias de barrios (confirmados y pendientes) y barrios a descartar | `scripts/config_pauta/alias_barrios.json` |
| Decisiones puntuales por fila | `scripts/config_pauta/decisiones_filas.json` |
| Tests | `scripts/test_pauta_capital.py`, `scripts/test_estado_pauta.mjs` |
| Conteos de control | `scripts/control_pauta_capital.mjs` |
| Archivo de verificación (se regenera, no se versiona) | `scripts/verificacion_pauta_capital.py` → `Contexto/Verificacion_pauta_capital.xlsx` |
| Lista para el área (se regenera, no se versiona) | `scripts/pendientes_pauta_capital.py` → `Contexto/Pendientes_de_confirmacion.xlsx` |
| "Activa", estados y cobertura dirigida (pantallas) | `lib/estadoPauta.js` |
| Salida | `public/data/pautas_barrios.json` |
| Filas no procesadas para el área (se versiona junto al JSON) | `public/data/Filas_no_procesadas_pauta_capital.xlsx` (lo escribe el generador) |
| Maestro viejo (solo referencia histórica) | `Contexto/historico/BASE_PAUTA_RRSS_CORDOBA_CAPITAL_2026-10-08.xlsx` |
| Manual para quienes cargan la planilla | "Manual metodológico — Pauta Digital, Córdoba Capital" |
