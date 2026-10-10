# Skills del proyecto (copia versionada)

Estas son las copias de referencia de las skills que se usan para cargar datos al tablero. La skill
**instalada en Claude.ai es una copia aparte**: cuando se cambia acá, hay que volver a subirla a mano.

## procesar-encuestas-circuitos-cordoba

- Versión vigente: `docs/skills/procesar-encuestas-circuitos-cordoba/SKILL.md` (empaquetada en
  `docs/skills/procesar-encuestas-circuitos-cordoba.skill`).
- Cambios de esta versión: escenarios de intención de voto para Gobernador (3 escenarios nuevos del 01/10/26,
  significado del número final de la pregunta, alias de nombres de candidatos) y el paso de correr el validador
  `scripts/validar_escenarios_gobernador.py` en cada ronda nueva.
- **Acción manual pendiente (no se puede hacer desde el repo):** en Claude.ai, reemplazar la skill por este
  archivo:

  `/Users/tomasgaston/Documents/Documentos - Laptop de Tomas/Tablero electoral/tablero-electoral/docs/skills/procesar-encuestas-circuitos-cordoba.skill`

  (Configuración → Capacidades/Skills → subir el .skill; reemplaza la versión anterior del mismo nombre.)
- No hay `transform.py`: la transformación la hace la propia skill siguiendo el SKILL.md; el único script
  del repo asociado es el validador.
