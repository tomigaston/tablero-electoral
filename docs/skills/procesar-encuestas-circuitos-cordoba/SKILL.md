---
name: procesar-encuestas-circuitos-cordoba
description: Transforma los archivos crudos de encuestas de circuitos electorales de Córdoba Capital (excel convertido desde PDF con ilovepdf) en (1) el xlsx maestro de Power BI actualizado (BASE_CIRCUITOS_CORDOBA_CAPITAL.xlsx, con las filas nuevas ya sumadas) y (2) el JSON completo regenerado con el esquema de encuestas_circuitos.json para el tablero de Vercel. Usar cuando el usuario suba uno o varios archivos de encuesta crudos (nombres tipo "ENCUESTA_CIRCUITOS_CORDOBA_CAPITAL_dd-mm-aa.xlsx", "INFORME_CIRCUITOS_ELECTORALES..." o similares) y pida procesarlos, actualizar la base, o regenerar el tablero.
---

# Procesar encuestas de circuitos — Córdoba Capital

## Qué hace este skill

Toma:
1. El **xlsx maestro completo actual** (`BASE_CIRCUITOS_CORDOBA_CAPITAL.xlsx`, con todo lo procesado hasta ahora).
2. Uno o más **archivos crudos nuevos** (excel exportado de PDF vía ilovepdf).

Y devuelve:
1. El **xlsx maestro actualizado** (el mismo archivo + las filas nuevas ya sumadas al final, mismo esquema de columnas).
2. El **JSON completo regenerado desde cero** a partir de ese xlsx maestro actualizado — nunca un fragmento para mergear a mano.

**Importante — este skill NO puede correr sin el xlsx maestro actual.** Si el usuario sube solo el crudo nuevo sin adjuntar el xlsx maestro vigente, la skill debe pausar y pedirlo explícitamente antes de procesar nada. No generar un JSON parcial ni "sumarlo" a una copia vieja que el asistente tenga de otra sesión — el xlsx que trae el usuario en el mensaje es siempre la única fuente de verdad para esa corrida.

El usuario después reemplaza su xlsx maestro por el nuevo, y reemplaza `encuestas_circuitos.json` en el repo de Vercel por el nuevo (reemplazo directo, no merge — el JSON generado ya es el estado completo).

## Formato de entrada (raw)

- Hoja única, datos relevantes entre fila ~2 y ~100.
- Fila 1 casi siempre vacía (no hace falta borrarla, el parser no depende de eso).
- Una celda contiene el bloque de cabecera con `FECHA: dd/mm/aaaa` y el detalle de casos por circuito — puede estar en A1 o A2, combinada o no. **La fecha se toma siempre de este texto, nunca del nombre del archivo.**
- Esa misma celda de cabecera trae, en líneas separadas, la cantidad de respuestas por circuito con el patrón `CASOS <circuito>: N RESPUESTAS.` (ej. `CASOS 6C: 64 RESPUESTAS. CASOS 6D: 24 RESPUESTAS.`). **Este valor se extrae siempre de este texto, nunca se pide completar a mano ni se infiere de otra forma.**
- Cada pregunta es una celda en columna A (a veces combinada A:I) que empieza con el símbolo de viñeta (`\uf0b7`, aparece como reloj/cuadrito) seguido de la pregunta.
- Debajo de cada pregunta: una fila "RESPUESTAS" con los códigos de circuito en columnas C, D, E... (a veces como texto, a veces como número — tratar ambos igual).
- Debajo: una fila por categoría de respuesta, con el label en columna B (con viñeta `·` + espacios) y los porcentajes (como fracción 0-1) en las columnas de cada circuito.
- Puede haber filas vacías entre bloques de preguntas — se ignoran.
- El set de preguntas puede variar entre archivos (algunos no traen el bloque "Advierte mejoras en...", por ejemplo). Nunca asumir un set fijo de preguntas.

### Variantes de formato ya vistas — el parser debe soportarlas sin intervención
- Códigos de circuito como texto ("4B") o como número (11, 4).
- Redacciones levemente distintas de la misma pregunta (ej. "...principal problema en tu barrio?" con o sin "(hasta dos opciones)" / "(hasta 2 respuestas)").
- Columna de "circuito" que en realidad es "CIRCUITO DD/MM" (ej. "11M 26/03", "11M 27/04") → significa **mismo circuito, distinta ronda/fecha**, no dos circuitos nuevos. Extraer el circuito real y usar esa fecha en vez de la fecha global del archivo, para esa columna únicamente.

### Variante "COMPARATIVA" (visto por primera vez 12/08/26, ej. `ENCUESTA_CIRCUITOS_CORDOBA_CAPITAL_dd-mm-aa_-_COMPARATIVA.xlsx`)
Formato distinto al crudo estándar — cada circuito trae **dos columnas** en vez de una: la ronda anterior (label de mes, ej. "Julio", "Abril" — sin día) y la ronda nueva ("Agosto"). Diferencias clave a tener en cuenta:
- **No trae el texto "FECHA: dd/mm/aaaa"** en ningún lado. La fecha de la ronda nueva hay que pedírsela al usuario (o inferirla del nombre del archivo y **confirmar explícitamente**, nunca asumir en silencio).
- El bloque de "CASOS <circuito>: N RESPUESTAS" trae **un solo N por circuito**, aunque haya dos rondas (vieja + nueva) en las columnas. Ese N corresponde a la ronda **nueva** (la de la derecha, "Agosto"); la ronda vieja normalmente ya está cargada en el maestro y no lleva `Cantidad_Respuestas` nuevo.
- **Antes de cargar nada:** comparar los valores de la columna "vieja" (Julio/Abril/etc.) contra el maestro para ese circuito. Si coinciden con una ronda ya cargada → esa columna es solo referencia visual, **no se agrega**. Si NO coinciden con ninguna ronda existente → es una ronda no cargada todavía, y como no trae día exacto, **hay que preguntarle la fecha al usuario antes de sumarla**.
- Puede haber **mismatch entre el código de circuito del encabezado de casos y el de la columna de datos** (visto: encabezado decía "10F", columna de datos decía "10L"). Nunca asumir cuál es el correcto — mostrar ambos y preguntar.

## Diccionario pregunta → Tipo_Pregunta / Pregunta_Normalizada

| Pregunta original (tal cual aparece, sin viñeta) | Tipo_Pregunta | Pregunta_Normalizada |
|---|---|---|
| ¿Cuál es el principal problema en tu barrio? [variantes con "(hasta dos opciones)" / "(hasta 2 respuestas)" / sin nada] | Problemas | Problemas principales |
| ¿Cómo calificas el funcionamiento del Centro Vecinal? | Imagen_Institucion | Funcionamiento Centro Vecinal |
| ¿Cómo calificas el funcionamiento del CPC al que pertenece tu barrio? | Imagen_Institucion | Funcionamiento CPC |
| ¿Tu barrio tiene el servicio de CORDOBESES EN ALERTA? | Servicio | Cordobeses en Alerta (existencia) |
| ¿Cómo calificas el servicio de CORDOBESES EN ALERTA? | Imagen_Institucion | Calificación Cordobeses en Alerta |
| ¿Cómo calificas la gestión del intendente Passerini? | Imagen_Funcionario | Gestión del Intendente |
| ¿Cómo califica la gestión del gobernador Llaryora? | Imagen_Funcionario | Gestión del Gobernador |
| ¿Cómo califica la gestión del presidente Milei? | Imagen_Funcionario | Gestión del Presidente |
| En términos generales ¿Aprueba o desaprueba la gestión de Passerini? | Aprobacion | Aprobación Intendente |
| ¿En términos general aprueba o desaprueba la gestión del gobernador Llaryora? | Aprobacion | Aprobación Gobernador |
| ¿En términos generales aprueba o desaprueba la gestión del presidente Milei? | Aprobacion | Aprobación Presidente |
| ¿Si el gobernador Llaryora se presentara a la re elección lo votaría? | Reeleccion | Reelección Llaryora |
| ¿Si el presidente Milei se presentara a la re elección lo votaría? | Reeleccion | Reelección Milei |
| ¿Advierte mejoras en bacheos en su barrio? | Mejoras | Mejoras en bacheos |
| ¿Advierte mejoras en alumbrado público en su barrio? | Mejoras | Mejoras en alumbrado público |
| ¿Advierte mejoras en el estado de los espacios públicos en su barrio? | Mejoras | Mejoras en espacios públicos |
| ¿Advierte mejoras en el ordenamiento de naranjitas y limpiavidrios? | Mejoras | Mejoras en ordenamiento naranjitas y limpiavidrios |
| De la siguiente lista ¿A quién votaría para gobernador de Córdoba? [candidatos: Llaryora, Juez, Bornoroni, De Loredo, Spaccesi, Olivero, Otro] | Intencion_Voto_Gobernador | Intención voto Gobernador - Todos los candidatos |
| De la siguiente lista ¿A quién votaría para gobernador de Córdoba? [candidatos: Llaryora, Bornoroni, Spaccesi, Olivero, Otro] | Intencion_Voto_Gobernador | Intención voto Gobernador - Llaryora vs Bornoroni |
| De la siguiente lista ¿A quién votaría para gobernador de Córdoba? [candidatos: Llaryora, Juez, Spaccesi, Olivero, Otro] | Intencion_Voto_Gobernador | Intención voto Gobernador - Llaryora vs Juez |
| De la siguiente lista ¿A quién votaría para gobernador de Córdoba? [candidatos: Llaryora, De Loredo, Spaccesi, Olivero, Otro] | Intencion_Voto_Gobernador | Intención voto Gobernador - Llaryora vs De Loredo |
| De la siguiente lista ¿A quién votaría para gobernador de Córdoba? [candidatos: Llaryora, Juez, Bornoroni, De Loredo, Spaccesi, Olivero — sin "Otro"] | Intencion_Voto_Gobernador | Intención voto Gobernador - Llaryora, Juez, Bornoroni y De Loredo |
| De la siguiente lista ¿A quién votaría para gobernador de Córdoba? [candidatos: Llaryora, Juez, Bornoroni, De Loredo, Olivero, De la Sota, Hernández Maqueda, El Presto, No lo sé] (agregado 01/10/26) | Intencion_Voto_Gobernador | Intención voto Gobernador - Llaryora, Juez, Bornoroni, De Loredo, Olivero y De la Sota |
| De la siguiente lista ¿A quién votaría para gobernador de Córdoba? [candidatos: Llaryora, Juez, Bornoroni, De Loredo, Spaccesi, De la Sota, Hernández Maqueda, El Presto, No lo sé] (agregado 01/10/26) | Intencion_Voto_Gobernador | Intención voto Gobernador - Llaryora, Juez, Bornoroni, De Loredo, Spaccesi y De la Sota |
| De la siguiente lista ¿A quién votaría para gobernador de Córdoba? [candidatos: Llaryora, Bornoroni, Spaccesi, Olivero, Hernández Maqueda, El Presto — sin "Otro"] (agregado 01/10/26) | Intencion_Voto_Gobernador | Intención voto Gobernador - Llaryora vs Bornoroni (sin Otro) |

**Nota sobre "De la siguiente lista..." (agregado 12/08/26):** esta pregunta puede aparecer varias veces en un mismo archivo con el **mismo texto** pero **distinta lista de candidatos ofrecidos** (distintos escenarios de ballotage/binomio). Como el texto es idéntico, **nunca clasificar por el texto de la pregunta solo** — identificar el escenario por el conjunto exacto de candidatos que trae cada bloque y matchear contra esta tabla. Si aparece una combinación de candidatos que no está en esta lista, es un escenario nuevo: avisar al usuario con el texto exacto y la lista de candidatos, y pedir cómo nombrar la `Pregunta_Normalizada` (no inventar el nombre solo).

**El número al final de la pregunta ("...gobernador de Córdoba? 4")** (visto 01/10/26): es un **correlativo** que la encuestadora agrega cuando repite la misma pregunta varias veces en el informe (1 a 6 en el informe del 01/10/26). Identifica la posición del escenario en ese informe, **no** es parte de la pregunta ni del nombre del escenario: se descarta del texto de `Pregunta_Original` (que queda "De la siguiente lista ¿A quién votaría para gobernador de Córdoba?") y el escenario se sigue identificando por su lista exacta de candidatos. Los informes de septiembre repiten la pregunta sin numerarla: ahí "Escenario N" = orden de aparición. El tablero numera los escenarios por orden de aparición en la ronda, que coincide con el correlativo del informe del 01/10/26.

**Si aparece una pregunta que no está en esta lista:** NO inventar una categorización. Avisar al usuario con el texto exacto de la pregunta y preguntar cómo clasificarla (Tipo_Pregunta + Pregunta_Normalizada). Una vez que el usuario confirme, se puede sumar a esta tabla para la próxima vez.

## Escenarios de intención de voto — Gobernador (`Intencion_Voto_Gobernador`)

Cada escenario es **una pregunta** del JSON: `"Intención voto Gobernador - <nombre del escenario>"`, con una categoría por candidato. El tablero los muestra en una tabla por escenario (circuito → solapa Encuestas) y en el reporte PDF; su registro vive en `public/data/encuestas_metadata.json` → `escenarios_gobernador`.

Reglas:
1. **Identidad = lista exacta de candidatos**, nunca el texto de la pregunta (es siempre el mismo). Una lista que no esté en el diccionario de arriba es un **escenario nuevo**: pausar, mostrar al usuario el texto exacto y los candidatos, y pedir el nombre. Después sumarlo al diccionario de esta skill **y** al registro `escenarios_gobernador.escenarios` del metadata.
2. **Porcentajes tal cual vienen**: no normalizar ni recalcular a 100%. Si el informe no trae "Otro" o NS/NC, no agregarlos.
3. **No hay "n" por escenario**: el informe trae un solo N por circuito y ronda (`Cantidad_Respuestas`), que aplica a todos los escenarios de esa ronda.
4. **Nombres de candidatos**: se unifican con el mapa `alias_candidatos` del metadata (acentos y mayúsculas: "Agustín Spaccesi" → "Agustin Spaccesi", "Hernández Maqueda" → "Hernandez Maqueda", "Natalia De la Sota" → "Natalia De La Sota", "No sé/No se" → "No lo sé"). Los nombres canónicos guardados son los de la tabla `candidatos` (con su nombre para mostrar con acentos). Un nombre que no sea claramente el mismo candidato **no se unifica**: avisar al usuario. Typos de la encuestadora ya vistos: "Axel Kiciloff" → "Axel Kicillof" (Intención de voto Presidente).
5. **Validación obligatoria al final** (ver paso 5 del flujo): `python3 scripts/validar_escenarios_gobernador.py --xlsx <maestro actualizado>` (script del repo `tablero-electoral`). Avisa: escenario sin candidatos, porcentajes fuera de 0-100, escenarios o candidatos no registrados, alias sin unificar y circuitos que no matchean. Si devuelve errores, **no entregar** hasta resolverlos.

### Tipos presentes en el maestro que esta tabla todavía no documenta
`Privatizacion`, `Percepcion_Provincia`, `Modelo_Gestion` e `Intencion_Voto_Presidente` ya están cargados en el maestro (ronda 01/10/26) pero no figuran en el diccionario de arriba. Pendiente documentarlos acá antes de la próxima carga.

## Categorías de respuesta esperadas por Tipo_Pregunta

El tablero de Vercel lee las categorías de respuesta por su nombre exacto (`Positiva`, `Regular`, etc. — ver `encuestas_metadata.json` del proyecto), así que cada `Tipo_Pregunta` tiene un set de categorías canónico fijo que las filas finales SIEMPRE deben usar, más allá de cómo vengan escritas en el crudo:

| Tipo_Pregunta | Categorías canónicas |
|---|---|
| Imagen_Funcionario / Imagen_Institucion | Positiva, Regular, Negativa, Ns/Nc |
| Servicio | Si, No |
| Aprobacion | Apruebo, Desapruebo |
| Reeleccion | Si, No |
| Problemas | libre (barrios/temas variables, no se valida contra un set fijo) |
| Intencion_Voto_Gobernador | libre (candidatos variables según el escenario); los nombres se unifican con `alias_candidatos` y se validan contra `escenarios_gobernador.candidatos` del metadata |

**Por qué importa:** la encuestadora no siempre usa la misma escala de respuesta para la misma pregunta. Ya se vio, por ejemplo, que "Imagen_Funcionario"/"Imagen_Institucion" a veces llega como escala de 5 puntos (`Muy buena / Buena / Regular / Mala / No se`) en vez de la de 4 que espera el tablero (`Positiva / Regular / Negativa / Ns/Nc`). Si el crudo trae una variante de la escala en vez del set canónico, **hay que mapearla al set canónico antes de escribir la fila** — nunca copiar la etiqueta cruda tal cual solo porque "es la que trae el archivo". Ver tabla de mapeo abajo y la regla 4 de "Reglas de transformación".

### Variantes crudas conocidas → categoría canónica (Imagen_Funcionario / Imagen_Institucion)

| Categoría cruda | Categoría canónica |
|---|---|
| Muy buena | Positiva |
| Buena | Positiva |
| Regular | Regular |
| Mala | Negativa |
| No se / No sabe | Ns/Nc |

**"Muy buena" + "Buena" se funden en una sola fila `Positiva`**, sumando sus dos porcentajes — no es un simple cambio de nombre, es un merge: de 5 filas crudas (Muy buena, Buena, Regular, Mala, No se) salen 4 filas finales (Positiva, Regular, Negativa, Ns/Nc). El resto de campos (Cantidad_Respuestas, Pregunta_Original, etc.) se toman igual que en las demás filas de ese Circuito+Fecha+Pregunta.

## Reglas de transformación

1. **Limpieza de texto:** quitar el símbolo de viñeta de preguntas (`\uf0b7` + espacios) y de categorías (`·` + espacios).
2. **Porcentaje:** el valor crudo viene como fracción (0.119) → multiplicar por 100 y redondear a 1 decimal (11.9). Si el valor viene como texto tipo "39,4%" (raro, ver más abajo), convertirlo directamente sin volver a multiplicar por 100.
3. **Orden_Categoria / Orden_Agrupada:**
   - Si `Tipo_Pregunta == "Problemas"` → siempre `99` (así está en la base existente).
   - Si no → orden secuencial según el orden en que aparecen las categorías en el excel (1, 2, 3...).
4. **Categoria_Agrupada** (para `Tipo_Pregunta` con categorías canónicas — ver tabla arriba):
   - Si las categorías del crudo YA coinciden con el set canónico → `Categoria_Agrupada` = `Categoria_Respuesta`, sin cambios (comportamiento de siempre).
   - Si las categorías del crudo son una variante conocida (tabla de mapeo de arriba) → traducir cada una a su categoría canónica, fusionando/sumando filas cuando el mapeo lo requiera (ej. Muy buena+Buena → Positiva), y escribir la categoría **canónica** tanto en `Categoria_Respuesta` como en `Categoria_Agrupada` — nunca la cruda.
   - Si aparece una categoría que no está ni en el set canónico ni en la tabla de variantes conocidas → es un caso nuevo, no decidir sola (ver caso 5 de "Siempre pausar" más abajo).
   - Para `Tipo_Pregunta` sin categorías canónicas (Problemas, Intencion_Voto_Gobernador) → `Categoria_Agrupada` = `Categoria_Respuesta`, como siempre.
5. **Pregunta_Original:** el texto de la pregunta ya limpio (sin viñeta), tal cual aparece en el archivo.
6. **Fecha:** siempre `YYYY-MM-DD`, tomada del texto "FECHA: dd/mm/aaaa" del encabezado — salvo en columnas tipo "CIRCUITO DD/MM" (ver más arriba), donde esa fecha reemplaza a la global solo para esa columna.

## ⚠️ Casos que SIEMPRE requieren pausar y preguntar al usuario (nunca decidir solo)

### 0. Falta el xlsx maestro completo
Si el usuario pide procesar un crudo nuevo pero no adjuntó el xlsx maestro vigente en el mensaje (ni está disponible en el proyecto de forma confiablemente actualizada), **pausar y pedirlo antes de generar cualquier salida.** Nunca asumir que una copia del maestro vista en una sesión anterior sigue vigente.

### 1. Texto corrupto por OCR en valores numéricos
Cuando el excel viene de una conversión PDF→Excel (ilovepdf), a veces el OCR confunde dígitos con letras. Visto hasta ahora: **9 → G** (ej. "G,1%" en vez de "9,1%", "3G,4%" en vez de "39,4%"). Puede haber otras confusiones similares (0→O, 1→l, etc.) en archivos futuros.

**Acción:** detectar cualquier celda de datos que sea texto en vez de número (más allá de los headers de circuito, que sí son texto válido), listar cada caso con su ubicación exacta (archivo, fila, columna, circuito, pregunta) y el valor sospechado, y **preguntar al usuario si confirma la corrección antes de aplicarla**. No asumir que la regla de una sesión anterior (ej. "G siempre es 9") aplica automáticamente a un valor nuevo sin confirmar — cada archivo se audita de nuevo.

### 2. Fecha del nombre de archivo vs. fecha del contenido no coinciden
**Acción:** avisar la discrepancia explícitamente (mostrar ambas fechas) y preguntar cuál usar. (Nota: en la práctica, hasta ahora el usuario siempre eligió la fecha del contenido — pero igual hay que preguntar cada vez, no asumir.)

### 3. Pregunta no reconocida en el diccionario
Ver arriba — nunca clasificar por cuenta propia.

### 4. Circuito que no existe en el maestro de 119 circuitos
Si conviene, validar contra `circuitos_cordoba.json` / `circuitos_completo.json` del proyecto. Si un código de circuito no matchea, avisar (podría ser un typo de la encuestadora).

### 5. Categoría de respuesta no reconocida para el Tipo_Pregunta
Cuando una pregunta de `Tipo_Pregunta` con categorías canónicas (Imagen_Funcionario, Imagen_Institucion, Servicio, Aprobacion, Reeleccion — ver tabla en "Categorías de respuesta esperadas") trae etiquetas que no están ni en el set canónico ni en la tabla de variantes conocidas, es exactamente el mismo tipo de caso que una pregunta no reconocida (caso 3): **no inventar el mapeo por cuenta propia.**

**Acción:** avisar al usuario con el texto exacto de las categorías encontradas, la pregunta (`Pregunta_Normalizada`), y el circuito/fecha donde aparecieron, y preguntar a qué categoría canónica corresponde cada una antes de sumarlas al maestro. Una vez que el usuario confirme, sumar la variante a la tabla de "Variantes crudas conocidas" para la próxima vez — así este skill aprende variantes nuevas en vez de asumir en silencio que la escala de siempre sigue aplicando (esto es justamente lo que falló la primera vez: se asumió que el crudo ya traía las categorías canónicas sin validarlo, y una escala de 5 puntos se coló sin que nadie lo notara hasta que alguien miró el tablero).

## Esquema — filas Power BI (xlsx maestro)

Columnas exactas (en este orden): `Circuito, Fecha, Tipo_Pregunta, Pregunta_Normalizada, Categoria_Respuesta, Porcentaje, Pregunta_Original, Orden_Categoria, Categoria_Agrupada, Orden_Agrupada, Cantidad_Respuestas`

- `Cantidad_Respuestas`: cantidad de encuestados para ese Circuito+Fecha (el "N" de la encuesta), extraída del patrón `CASOS <circuito>: N RESPUESTAS.` en la cabecera del crudo. Es un dato a nivel de **Circuito+Fecha** (una encuesta = un N), por lo tanto **el mismo valor se repite en todas las filas de ese Circuito+Fecha** (todas las categorías/preguntas de esa ronda). Nunca se completa a mano: si el crudo no trae el dato para algún circuito, dejar la celda vacía y avisar en el resumen — no inventar ni copiar de otra ronda.
- Filas históricas cargadas antes de que este skill incorporara esta columna pueden tener `Cantidad_Respuestas` vacío — eso es esperado, no es un error a corregir por este skill (Tomás las completa manualmente con los crudos originales si quiere el dato retroactivo).

Las filas nuevas se **agregan al final** del xlsx maestro recibido (nunca se reemplazan filas existentes, nunca se recrea el archivo desde cero salvo que el usuario lo pida explícitamente).

## Esquema — JSON (encuestas_circuitos.json)

```json
{
  "CIRCUITO": {
    "nombre_circuito": "CIRCUITO",
    "cantidad_rondas": N,
    "tiene_comparativo": true/false,
    "rondas": [
      { "fecha": "YYYY-MM-DD", "casos": N | null, "preguntas": { "Pregunta Normalizada": { "Categoria": pct, ... }, ... } }
    ]
  }
}
```

- `casos`: igual a `Cantidad_Respuestas` del xlsx maestro para ese Circuito+Fecha. `null` si esa ronda no tiene el dato cargado (crudo histórico previo a esta columna, o crudo que no traía el detalle de casos).
- `tiene_comparativo` = `true` si `cantidad_rondas > 1`.
- Este JSON se **regenera siempre completo** a partir de la totalidad del xlsx maestro actualizado (agrupando por Circuito → Fecha → Pregunta), nunca como un fragmento incremental para mergear a mano. El archivo que se entrega ya es el estado final completo, listo para reemplazar el `encuestas_circuitos.json` del repo tal cual.

## Flujo de trabajo esperado

1. Usuario sube: el **xlsx maestro completo vigente** + 1 o más archivos crudos nuevos.
   - Si falta el xlsx maestro → pausar y pedirlo (ver sección "Casos que siempre requieren pausar", punto 0).
2. Inspeccionar cada archivo crudo (estructura, fecha interna vs nombre, headers de circuito, posibles valores corruptos).
3. Si hay algún caso de la sección "⚠️ Siempre pausar" → preguntar antes de seguir. No generar output parcial mezclando datos confirmados con dudosos sin avisar cuáles son cuáles.
4. Una vez resueltas las dudas: sumar las filas nuevas al xlsx maestro (al final, sin tocar lo existente) y regenerar el JSON completo desde ese xlsx actualizado.
5. **Autochequeo antes de entregar (obligatorio):** recorrer el JSON recién regenerado — TODAS las rondas de TODOS los circuitos — y para cada pregunta de `Tipo_Pregunta` con categorías canónicas (Imagen_Funcionario, Imagen_Institucion, Servicio, Aprobacion, Reeleccion) verificar que el set de categorías presentes sea **exactamente** el canónico (ni de más ni de menos — ver tabla en "Categorías de respuesta esperadas"). Si alguna ronda tiene categorías fuera de ese set (una variante cruda que se coló sin mapear, un typo, lo que sea), **detenerse y reportarlo antes de entregar** en vez de entregar el output con el problema adentro sin avisar. Este chequeo es justamente el que hubiera atrapado a tiempo el bug de la escala de 5 puntos (Muy buena/Buena/Regular/Mala/No se) que en su momento pasó desapercibido porque nada lo validaba.
   Además, **correr el validador de escenarios** (`scripts/validar_escenarios_gobernador.py`, ver sección "Escenarios de intención de voto") y reportar su resumen: cuántas rondas/escenarios/circuitos quedaron con datos y qué hallazgos hubo.
6. Entregar dos archivos: el **xlsx maestro actualizado** y el **JSON completo regenerado**, más un resumen: fecha(s) usada(s), circuitos y rondas nuevas, cantidad de filas agregadas, y cualquier corrección aplicada (con detalle auditable).
7. El usuario reemplaza su xlsx maestro y su `encuestas_circuitos.json` del repo por estos dos archivos (reemplazo directo, no merge manual — ya vienen completos).
