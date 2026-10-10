#!/usr/bin/env python3
"""Valida los escenarios de intención de voto para Gobernador de encuestas_circuitos.json.

Pensado para correrse al final de cada carga de encuestas (skill procesar-encuestas-circuitos-cordoba),
ANTES de reemplazar el JSON del repo. No modifica ningún archivo ni recalcula porcentajes: solo
informa. Usa únicamente la librería estándar; el cruce contra el xlsx maestro es opcional y
requiere openpyxl.

Uso:
  python3 scripts/validar_escenarios_gobernador.py \
      [--json public/data/encuestas_circuitos.json] \
      [--meta public/data/encuestas_metadata.json] \
      [--circuitos public/data/circuitos_completo.json] \
      [--xlsx /ruta/BASE_CIRCUITOS_CORDOBA_CAPITAL.xlsx]

Código de salida: 0 sin errores (puede haber avisos), 1 si hay errores.

Qué valida
  ERROR  escenario sin candidatos (pregunta vacía)
  ERROR  porcentaje que no es número o fuera de 0-100
  ERROR  (con --xlsx) valor del JSON distinto del que figura en el maestro
  AVISO  escenario que no está en el registro de encuestas_metadata.json (escenario nuevo: hay que
         nombrarlo y registrarlo, con la lista exacta de candidatos)
  AVISO  candidato que no está en el registro ni es un alias conocido (posible typo o candidato nuevo)
  AVISO  candidato escrito con un alias (se informa a qué nombre canónico corresponde)
  AVISO  circuito que no existe entre los circuitos del tablero (posible typo de la encuestadora)
  INFO   suma de porcentajes fuera de 95-105 (puede haber NS/NC u opciones omitidas: se muestra tal cual)
"""
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

ERR, AVISO, INFO = 'ERROR', 'AVISO', 'INFO'


def circuito_existe(clave, claves_validas):
    """Mismo criterio que buscarEncuestaCircuito() del tablero: match directo o con número/letra invertidos."""
    if clave in claves_validas:
        return True
    import re
    m = re.match(r'^(\d+)([A-Za-z]+)$', clave) or re.match(r'^([A-Za-z]+)(\d+)$', clave)
    return bool(m and f'{m.group(2)}{m.group(1)}' in claves_validas)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--json', default='public/data/encuestas_circuitos.json')
    ap.add_argument('--meta', default='public/data/encuestas_metadata.json')
    ap.add_argument('--circuitos', default='public/data/circuitos_completo.json')
    ap.add_argument('--xlsx')
    a = ap.parse_args()

    data = json.loads(Path(a.json).read_text(encoding='utf-8'))
    meta = json.loads(Path(a.meta).read_text(encoding='utf-8')).get('escenarios_gobernador')
    if not meta:
        print('ERROR: encuestas_metadata.json no tiene el bloque "escenarios_gobernador".')
        return 1
    prefijo = meta['prefijo_pregunta']
    alias = meta.get('alias_candidatos', {})
    candidatos_ok = set(meta.get('candidatos', {}))
    escenarios_ok = set(meta.get('escenarios', {}))

    circ_raw = json.loads(Path(a.circuitos).read_text(encoding='utf-8'))
    filas = circ_raw if isinstance(circ_raw, list) else list(circ_raw.values())
    claves_validas = {str(f.get('CircuitoKey')) for f in filas}

    hallazgos = []  # (nivel, texto)
    resumen = defaultdict(lambda: defaultdict(set))  # fecha -> escenario -> {circuitos}
    sin_escenarios = []
    alias_usados = defaultdict(set)

    for circ, info in data.items():
        if not circuito_existe(circ, claves_validas):
            hallazgos.append((AVISO, f'Circuito "{circ}" no coincide con ningún circuito del tablero.'))
        tiene = False
        for ronda in info.get('rondas', []):
            fecha = ronda.get('fecha')
            for pregunta, cats in ronda.get('preguntas', {}).items():
                if not pregunta.startswith(prefijo):
                    continue
                tiene = True
                esc = pregunta[len(prefijo):]
                resumen[fecha][esc].add(circ)
                donde = f'{circ} · {fecha} · "{esc}"'
                if esc not in escenarios_ok:
                    hallazgos.append((AVISO, f'{donde}: escenario NO registrado. Candidatos exactos: {list(cats)}. Hay que nombrarlo y sumarlo a encuestas_metadata.json.'))
                if not cats:
                    hallazgos.append((ERR, f'{donde}: escenario sin candidatos.'))
                    continue
                total = 0.0
                for cand, val in cats.items():
                    nombre = cand.strip()
                    if nombre in alias:
                        alias_usados[nombre].add(alias[nombre])
                        hallazgos.append((AVISO, f'{donde}: "{cand}" es un alias de "{alias[nombre]}" (en el JSON debería figurar el nombre canónico).'))
                    elif nombre not in candidatos_ok:
                        hallazgos.append((AVISO, f'{donde}: candidato "{cand}" no está en el registro ni es un alias conocido.'))
                    if not isinstance(val, (int, float)) or isinstance(val, bool) or val < 0 or val > 100:
                        hallazgos.append((ERR, f'{donde}: porcentaje inválido para "{cand}": {val!r}.'))
                    else:
                        total += val
                if total < 95 or total > 105:
                    hallazgos.append((INFO, f'{donde}: los porcentajes suman {total:.1f} (se muestran tal cual, sin recalcular).'))
        if not tiene:
            sin_escenarios.append(circ)

    # Cruce opcional contra el xlsx maestro
    if a.xlsx:
        try:
            import openpyxl
        except ImportError:
            hallazgos.append((AVISO, 'No se pudo cruzar con el xlsx: falta openpyxl (pip install openpyxl).'))
        else:
            ws = openpyxl.load_workbook(a.xlsx, read_only=True, data_only=True).worksheets[0]
            filas_x = ws.iter_rows(values_only=True)
            hdr = next(filas_x)
            ix = {h: i for i, h in enumerate(hdr)}
            n_xlsx = 0
            for r in filas_x:
                if r[ix['Tipo_Pregunta']] != 'Intencion_Voto_Gobernador':
                    continue
                n_xlsx += 1
                circ, fecha = str(r[ix['Circuito']]), str(r[ix['Fecha']])[:10]
                pregunta, cat, pct = r[ix['Pregunta_Normalizada']], r[ix['Categoria_Respuesta']], r[ix['Porcentaje']]
                ronda = next((x for x in data.get(circ, {}).get('rondas', []) if x['fecha'] == fecha), None)
                val = ronda['preguntas'].get(pregunta, {}).get(cat) if ronda else None
                if val is None or abs(float(val) - float(pct)) > 0.05:
                    hallazgos.append((ERR, f'xlsx ≠ JSON en {circ} · {fecha} · {pregunta} · {cat}: xlsx={pct} json={val}.'))
            print(f'Cruce con xlsx: {n_xlsx} filas de Intencion_Voto_Gobernador revisadas.')

    # Resumen
    print('\n== Escenarios cargados por ronda ==')
    for fecha in sorted(resumen):
        escs = resumen[fecha]
        circs = sorted({c for s in escs.values() for c in s})
        print(f'{fecha}: {len(escs)} escenarios · {len(circs)} circuitos con datos ({", ".join(circs)})')
        for orden, (esc, cs) in enumerate(escs.items(), 1):
            print(f'   {orden}. {esc}  [{len(cs)} circuitos]')
    print(f'\nCircuitos sin ningún escenario en ninguna ronda: {len(sin_escenarios)} de {len(data)}')

    print('\n== Hallazgos ==')
    orden = {ERR: 0, AVISO: 1, INFO: 2}
    for nivel, texto in sorted(hallazgos, key=lambda h: orden[h[0]]):
        print(f'[{nivel}] {texto}')
    if not hallazgos:
        print('Sin hallazgos.')
    errores = sum(1 for n, _ in hallazgos if n == ERR)
    print(f'\nResultado: {errores} errores, {sum(1 for n, _ in hallazgos if n == AVISO)} avisos, {sum(1 for n, _ in hallazgos if n == INFO)} informativos.')
    return 1 if errores else 0


if __name__ == '__main__':
    sys.exit(main())
