#!/usr/bin/env python3
"""
Lista de lo que el área tiene que confirmar para que entre al tablero.

Política: solo se aplica lo confirmado; lo que no se entiende o no respeta la regla queda
afuera. Este script junta, para una carga, todo lo que quedó afuera por esa razón:

  - Alias pendientes: correcciones de nombres de barrio que el generador conoce pero NO aplica
    (alias_barrios.json -> pendientes_de_confirmar), con cuántos ítems afectaría cada una.
  - Ítems sin resolver: nombres de las audiencias que no se pudieron asignar a un barrio.
  - Filas pendientes: filas cuyo alcance no se puede decidir.
  - Reglas a confirmar: reglas que se aplican hoy y que el área todavía no confirmó.

Uso:
    python3 scripts/pendientes_pauta_capital.py --crudo "<ruta>/Pauta RRSS_GLOBAL.xlsx" --salida Pendientes_de_confirmacion.xlsx

Cómo confirmar: un alias confirmado pasa de "pendientes_de_confirmar" a "alias" en
scripts/config_pauta/alias_barrios.json (commit de código con un caso de test); una fila
pendiente se resuelve completando la audiencia en la planilla fuente.
"""
import argparse
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generar_pauta_capital as g  # noqa: E402

REGLAS_A_CONFIRMAR = [
    ("Ítem de lista sin letra y con el nombre del circuito (ej. '5 Altamira')", "Va a circuito_sin_barrio: apunta al circuito entero. Con letra ('5 G San Vicente') se busca como barrio.", "Aplicada"),
    ("Audiencia que repite el texto de LOCALIDAD (ej. '007B - ALTA CORDOBA, CÓRDOBA CAPITAL, ARGENTINA sin advantage+…')", "El nombre es el del circuito, no un barrio: va a circuito_sin_barrio.", "Aplicada"),
    ("'Toda la provincia excluyendo X' con departamento 'Provincia de Córdoba'", "Va a toda_capital (decisión del 19/10).", "Aplicada"),
    ("Localidad Capital explícita y audiencia genérica ('Hombres y mujeres de 30 a 65 años', 'Cuadrante 4')", "Va a toda_capital (la skill dice: localidad Capital explícita = toda_capital).", "Aplicada"),
    ("'TODAS LAS LOCALIDADES' con departamento 'Provincia de Córdoba' y audiencia sin referencia geográfica", "Queda pendiente (afuera) hasta que el área complete la audiencia.", "Aplicada"),
    ("Código de circuito en LOCALIDAD con departamento u audiencia de otra ciudad", "El código manda: la fila va al circuito. Casos dudosos a revisar en la planilla.", "Aplicada, a revisar"),
    ("Audiencia de Capital que nombra otro departamento (ej. 'Departamento Punilla')", "Queda pendiente (afuera).", "Aplicada"),
    ("Audiencia que nombra 'barrio X' y X no se resuelve", "Queda pendiente (afuera). No se asume toda_capital ni circuito sin barrio.", "Aplicada"),
    ("Ítem de lista numerado que no es barrio ni el nombre del circuito", "Queda afuera con aviso; la fila entra con los demás ítems.", "Aplicada"),
]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--crudo", required=True)
    ap.add_argument("--salida", required=True)
    args = ap.parse_args(argv)

    ref = g.cargar_referencias()
    df = pd.read_excel(args.crudo, sheet_name="GLOBAL_ImportRange")
    _, _, avisos = g.generar(df, ref)

    # Ítems sin resolver, agrupados por texto
    items = Counter()
    sugerencia = {}
    filas_de = defaultdict(list)
    for fila, aviso in avisos:
        m = re.match(r"Sin match: (.*?)(?: \(alias pendiente de confirmar: (.*)\))?$", aviso)
        if not m:
            filas_de[("otro", aviso)].append(fila)
            items[("otro", aviso)] += 1
            continue
        nombre = m.group(1)
        k = g.normalizar_sin_puntos(nombre)
        items[(k, nombre)] += 1
        filas_de[(k, nombre)].append(fila)
        if m.group(2):
            sugerencia[(k, nombre)] = m.group(2)

    # Filas pendientes
    pendientes = []
    for idx, row in df[df.apply(g._fila_real, axis=1)].iterrows():
        aud = g.limpio(row["AUDIENCIA  (Barrios o publicos) "]) or ""
        r = g.clasificar_geografia_capital(row["DEPARTAMENTO"], row["LOCALIDAD / SUBCIRCUITO"], aud, ref)
        if r["destino"] == "pendiente":
            pendientes.append((int(idx) + 2, g.limpio(row["COD. CONTENIDO"]), g.limpio(row["CAMPAÑA"]), g.limpio(row["TITULO DE LA PIEZA"]),
                               g.limpio(row["ESTADO"]), g.limpio(row["LOCALIDAD / SUBCIRCUITO"]), aud, r["motivo"]))

    wb = Workbook()

    def hoja(titulo, cab, filas, anchos):
        ws = wb.create_sheet(titulo)
        ws.append(cab)
        for f in filas:
            ws.append(list(f))
        for c in ws[1]:
            c.font = Font(bold=True)
            c.fill = PatternFill("solid", fgColor="F2F2F2")
            c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        for i, w in enumerate(anchos, 1):
            ws.column_dimensions[get_column_letter(i)].width = w

    wb.remove(wb.active)
    pend_alias = ref["alias_pendientes"]
    afectados = Counter()
    for (k, _), n in items.items():
        if k in pend_alias:
            afectados[k] += n
    hoja("Alias pendientes", ["Texto en la audiencia (normalizado)", "Barrio sugerido", "Ítems afectados en esta carga", "¿Se confirma? (SI / NO / otro barrio)"],
         sorted(((k, v, afectados.get(k, 0), "") for k, v in pend_alias.items()), key=lambda x: -x[2]), [44, 36, 18, 30])
    hoja("Ítems sin resolver", ["Texto en la audiencia", "Veces en esta carga", "Alias pendiente sugerido", "Filas del crudo (primeras 8)", "Barrio correcto (completa el área)"],
         [(n if k != "otro" else n, c, sugerencia.get((k, n), ""), ", ".join(map(str, sorted(set(filas_de[(k, n)]))[:8])), "") for (k, n), c in items.most_common()], [48, 12, 34, 40, 34])
    hoja("Filas pendientes", ["Fila del crudo", "COD. CONTENIDO", "CAMPAÑA", "TITULO DE LA PIEZA", "ESTADO", "LOCALIDAD / SUBCIRCUITO", "AUDIENCIA", "Motivo", "Qué hace falta (completa el área)"],
         [p + ("",) for p in pendientes], [10, 13, 26, 40, 11, 32, 50, 60, 36])
    hoja("Reglas a confirmar", ["Caso", "Qué hace hoy el tablero", "Estado"], REGLAS_A_CONFIRMAR, [70, 80, 18])
    wb.save(args.salida)
    print(f"Escrito {args.salida}: {len(pend_alias)} alias pendientes, {len(items)} ítems distintos sin resolver ({sum(items.values())} apariciones), {len(pendientes)} filas pendientes")


if __name__ == "__main__":
    main()
