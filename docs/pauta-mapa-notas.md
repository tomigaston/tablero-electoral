# Capa Pauta del mapa — criterio y notas (2026-10-10)

Regla: una estrella = "acá hay pauta PROPIA ACTIVA" (de barrio o de circuito). Sale de la misma
derivación que las tarjetas y la pestaña (`derivarPautaPorCircuito` -> `pieza.vigente`, o sea
`pautaEstaVigente`). Lo general (`toda_capital`) y lo inactivo NO van al mapa.

## Cómo estaba (antes)
- `pautaBarrioMarkers`: estrella en el centroide de cada barrio con pauta en el bucket `barrios`
  (activa o inactiva, esta última en gris) + barrios con obras de Mesa de Capital.
- `pautaCapitalMarkers`: una estrella por cada uno de los 119 circuitos (promedio de centroides
  de sus barrios), activa si alguna de las ~48 generales estaba vigente -> manto de 119 estrellas
  y estrella con contador en 0 (caso 13K).
- `circuitos_sin_barrio` no tenía estrella.
- Leyenda "Pauta activa / Pauta expirada" con filtro (`filtroTipoPauta`): dependía de la estrella
  inactiva. Se eliminó junto con ella.

## Ahora (`lib/pautaMapa.js`)
- Estrella de barrio en su centroide, solo si cae en un circuito al que la pieza se asigna.
- Estrella de circuito (punto interior del polígono) para circuitos con pieza propia sin barrio, o
  cuya estrella de barrio caería en otro circuito (ej. Los Robles: centroide en 11G, pieza en 11F).
- Invariante verificado: estrella en la zona del circuito <=> "Pauta activa en este circuito" > 0.
- Mesa de Capital ya no decide si un barrio lleva estrella (solo se lista en el popup).
