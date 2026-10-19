#!/usr/bin/env python3
"""
Tests de regresión de scripts/generar_pauta_capital.py (pauta digital de Capital).

Mismo espíritu que scripts/test_pauta_digital.py del tablero del interior: casos
numerados, cada uno con el motivo de la regla. Cualquier cambio a la lógica de
clasificación, estado, fechas o duplicados DEBE correr esto antes de mergear:

    python3 scripts/test_pauta_capital.py

No lee el crudo real: arma filas sintéticas con las columnas del crudo. Los
nombres de barrio y circuito son los reales (barrios_geo.json y
circuitos_completo.json del repo).
"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generar_pauta_capital as g  # noqa: E402

REF = g.cargar_referencias()

COLUMNAS = [
    "CAMPAÑA", "TITULO DE LA PIEZA", "EJE", "MINISTERIO", "DEPARTAMENTO", "LOCALIDAD / SUBCIRCUITO",
    "AUDIENCIA  (Barrios o publicos) ", "COD. CONTENIDO", "PLATAFORMA", "OBJETIVO DE CAMPAÑA", "TIPO DE PAUTA",
    "SOLICITADO POR", "LINK MATERIAL", "UTM´S", "TIPO DE MATERIAL", "IG", "FB", "YT", "FECHA DE ENVÍO",
    "INICIO ", "FIN", "DURACIÓN", "ESTADO", "Impresiones Ejecutada META", "Frecuencia (Meta) Ejecutada",
    "CPM Real META", "Visualizaciones Ejecutadas GOOGLE", "CPV Real GOOGLE", "Inversión ejecutada ",
]
CAPITAL = "DEPARTAMENTO CAPITAL, PROVINCIA DE CÓRDOBA, ARGENTINA"
PROVINCIA = "PROVINCIA DE CÓRDOBA, ARGENTINA"
LOC_CAPITAL = "CÓRDOBA CAPITAL, DEPARTAMENTO CAPITAL, PROVINCIA DE CÓRDOBA, ARGENTINA"
FALLOS = []
CASOS = 0


def fila(**kw):
    base = {c: None for c in COLUMNAS}
    base.update({"CAMPAÑA": "Campaña de prueba", "TITULO DE LA PIEZA": "Pieza de prueba", "DEPARTAMENTO": CAPITAL,
                 "PLATAFORMA": "Meta", "ESTADO": "ACTIVO", "INICIO ": pd.Timestamp("2026-10-01"), "FIN": pd.Timestamp("2026-10-31")})
    base.update(kw)
    return base


def generar(*filas, dedup=True):
    df = pd.DataFrame(filas, columns=COLUMNAS)
    return g.generar(df, REF, dedup=dedup)


def plano(salida):
    return [(b, k, p) for b, k, p in g.entradas_de(salida)]


def caso(nombre, condicion, detalle=""):
    global CASOS
    CASOS += 1
    if condicion:
        print(f"  ok  {nombre}")
    else:
        FALLOS.append(nombre)
        print(f"  FALLA  {nombre} {detalle}")


def geo(depto, loc, aud=None):
    return g.clasificar_geografia_capital(depto, loc, aud, REF)


def barrios_de(res):
    return sorted(e["barrio"] for e in res["entradas"] if e["barrio"])


# --- CASO 1: estado directo del crudo (decisión 19/10: igual que el interior) --------------
print("CASO 1 - ESTADO directo del crudo, nunca descarta la fila")
for crudo, esperado in [("ACTIVO", "Vigente"), ("inactivo", "Finalizada"), ("OBSERVADO", "Observada"),
                        ("PROGRAMADO", "Programada"), (None, "S/D"), ("OTRO", "OTRO")]:
    caso(f"ESTADO {crudo!r} -> {esperado}", g.estado_pauta_desde_crudo(crudo) == esperado)
sal, _, _ = generar(*[fila(**{"TITULO DE LA PIEZA": f"t{i}", "ESTADO": e, "LOCALIDAD / SUBCIRCUITO": "TODAS LAS LOCALIDADES"})
                      for i, e in enumerate(["ACTIVO", "INACTIVO", "OBSERVADO", "PROGRAMADO", None])])
caso("las 5 filas entran al tablero, ninguna se descarta por estado", len(plano(sal)) == 5)

# --- CASO 2: fila real ---------------------------------------------------------------------
print("CASO 2 - fila real: CAMPAÑA o TITULO")
_, st, _ = generar(fila(), fila(**{"CAMPAÑA": None, "TITULO DE LA PIEZA": "-"}), fila(**{"CAMPAÑA": None}))
caso("1 fila arrastrada se descarta, 2 son reales", st["filas_descartadas"] == 1 and st["filas_reales"] == 2)

# --- CASO 3: código de circuito -----------------------------------------------------------
print("CASO 3 - código de circuito en LOCALIDAD / SUBCIRCUITO")
for loc, esperado in [("010A - CABILDO, CÓRDOBA CAPITAL, ARGENTINA", "10A"), ("0010 - BELLA VISTA", "10"), ("001 - SECCIONAL PRIMERA", "1"), ("014P - VILLA RIVERA INDARTE", "14P")]:
    r = geo(CAPITAL, loc, None)
    caso(f"{loc[:22]} -> circuito {esperado}", r["destino"] == "entradas" and r["entradas"][0]["circuito"] == esperado, str(r))
r = geo(CAPITAL, "10 - ALGO", None)
caso("código de 2 dígitos no se reconoce como circuito", r["destino"] == "excluido")

# --- CASO 4: circuito + audiencia ---------------------------------------------------------
print("CASO 4 - circuito con y sin barrio en AUDIENCIA")
r = geo(CAPITAL, "011G - PARQUE REPUBLICA, CÓRDOBA CAPITAL, ARGENTINA", "Barrio Industrial Oeste de 30 a 60 años sin km agregados")
caso("nombra un barrio -> barrio INDUSTRIAL OESTE con circuito 11G", [(e["destino"], e["circuito"], e["barrio"]) for e in r["entradas"]] == [("barrio", "11G", "INDUSTRIAL OESTE")], str(r))
r = geo(CAPITAL, "007B - ALTA CORDOBA, CÓRDOBA CAPITAL, ARGENTINA", "007B - ALTA CORDOBA, CÓRDOBA CAPITAL, ARGENTINA sin advantage+ ni km agregados de 30 a 65 años")
caso("la audiencia repite la localidad (nombre del circuito) -> circuito_sin_barrio, no barrio", [(e["destino"], e["barrio"]) for e in r["entradas"]] == [("circuito_sin_barrio", None)], str(r))
r = geo("DEPARTAMENTO DE PUNILLA, PROVINCIA DE CÓRDOBA, ARGENTINA", "011D - LOS NARANJOS", "Carlos Paz - 30 a 65 años")
caso("el código manda sobre DEPARTAMENTO (maestro fila 19: se mantiene, queda para revisión del área)", r["destino"] == "entradas" and r["entradas"][0]["destino"] == "circuito_sin_barrio")

# --- CASO 5: TODAS LAS LOCALIDADES --------------------------------------------------------
print("CASO 5 - TODAS LAS LOCALIDADES: decide DEPARTAMENTO")
caso("departamento Capital -> toda_capital", geo(CAPITAL, "TODAS LAS LOCALIDADES", "Hombres y mujeres de 30 a 65")["destino"] == "toda_capital")
caso("otro departamento -> excluido", geo("DEPARTAMENTO RIO CUARTO, PROVINCIA DE CÓRDOBA, ARGENTINA", "TODAS LAS LOCALIDADES", None)["destino"] == "excluido")
caso("departamento con 'DE' (DEPARTAMENTO DE COLÓN) -> excluido", geo("DEPARTAMENTO DE COLÓN, PROVINCIA DE CÓRDOBA, ARGENTINA", "TODAS LAS LOCALIDADES", None)["destino"] == "excluido")
caso("otra provincia (sin 'Córdoba') -> excluido", geo("Provincia de Santa Fe", "TODAS LAS LOCALIDADES", None)["destino"] == "excluido")
caso("'Todas las localidades' en minúscula NO es el valor literal: no cae en toda_capital", geo(CAPITAL, "Todas las localidades", None)["destino"] == "excluido")
caso("PROVINCIA + audiencia con Córdoba -> toda_capital", geo(PROVINCIA, "TODAS LAS LOCALIDADES", "Provincia de Córdoba de 30 a 60 años. Sin advantage +")["destino"] == "toda_capital")
caso("PROVINCIA + audiencia vacía -> pendiente", geo(PROVINCIA, "TODAS LAS LOCALIDADES", None)["destino"] == "pendiente")
caso("PROVINCIA + audiencia sin referencia geográfica -> pendiente", geo(PROVINCIA, "TODAS LAS LOCALIDADES", "Audiencia de alto poder adquisitivo")["destino"] == "pendiente")
caso("PROVINCIA + 'Departamento Punilla' -> excluido", geo(PROVINCIA, "TODAS LAS LOCALIDADES", "Departamento Punilla")["destino"] == "excluido")
caso("'Toda la provincia excluyendo X' -> toda_capital (decisión 19/10)", geo(PROVINCIA, "TODAS LAS LOCALIDADES", "Toda la provincia excluyendo San Alberto")["destino"] == "toda_capital")

# --- CASO 6: CÓRDOBA CAPITAL, audiencia con barrios --------------------------------------------
print("CASO 6 - CÓRDOBA CAPITAL: AUDIENCIA decide barrio / circuito / toda_capital")
r = geo(CAPITAL, LOC_CAPITAL, "Córdoba Capital de 30 a 60 años sin km agregados ni Advantage +")
caso("audiencia genérica -> toda_capital", r["destino"] == "toda_capital", str(r))
r = geo(CAPITAL, LOC_CAPITAL, "Barrio Los Naranjos - 30 a 65 años")
caso("un barrio -> 1 entrada de barrio", barrios_de(r) == ["LOS NARANJOS"], str(r))
r = geo(CAPITAL, LOC_CAPITAL, "Alta Córdoba, Cofico, Ayacucho")
caso("lista de barrios -> una entrada por barrio", barrios_de(r) == ["ALTA CORDOBA", "AYACUCHO", "COFICO"], str(r))
r = geo(CAPITAL, LOC_CAPITAL, "5 G San Vicente, 5 C Empalme, 12 B Colón, 5 Altamira")
caso("lista con circuitos (filas 3617-3620): 3 barrios + 1 circuito_sin_barrio",
     sorted((e["destino"], e["circuito"], e["barrio"]) for e in r["entradas"]) ==
     [("barrio", "12B", "COLON"), ("barrio", "5C", "EMPALME"), ("barrio", "5G", "SAN VICENTE"), ("circuito_sin_barrio", "5", None)], str(r))
r = geo(CAPITAL, LOC_CAPITAL, "Barrrio Jorge Newbery de 30 a 60 años sin km agregados")
caso("alias: 'Jorge Newbery' -> PARQUE JORGE NEWBERY", barrios_de(r) == ["PARQUE JORGE NEWBERY"], str(r))
r = geo(CAPITAL, LOC_CAPITAL, "10 B Ciudedale, 10 H Parque Capital")
caso("error de tipeo corregido (aproximado/alias): Ciudedale -> CIUDADELA", "CIUDADELA" in barrios_de(r), str(r))
r = geo(CAPITAL, LOC_CAPITAL, "Procrear Liceo, Alta Córdoba")
caso("barrio de la lista 'descartar' (PROCREAR LICEO) no genera entrada y los demás sí", barrios_de(r) == ["ALTA CORDOBA"], str(r))
r = geo(CAPITAL, LOC_CAPITAL, "Quintas de Santa Ana, A.T. E, Caseros")
caso("sigla con punto: 'A.T. E' coincide con 'A.T. E.'", "A.T. E." in barrios_de(r), str(r))
r = geo(CAPITAL, LOC_CAPITAL, "10 B Barrio Inventado Sur, 10 H Parque Capital")
caso("ítem sin resolver: queda en avisos y la fila entra con el resto", any("Barrio Inventado" in a for a in r["avisos"]) and "PARQUE CAPITAL" in barrios_de(r), str(r))

# --- CASO 7: otra localidad y reglas por fila ---------------------------------------------
print("CASO 7 - fuera de Capital")
caso("otra localidad -> excluido", geo("DEPARTAMENTO DE COLÓN, PROVINCIA DE CÓRDOBA, ARGENTINA", "SALDAN, DEPARTAMENTO DE COLÓN, PROVINCIA DE CÓRDOBA, ARGENTINA", None)["destino"] == "excluido")
caso("regla por fila (decisiones_filas.json): 'Pautar a barrios:' -> excluido", geo(CAPITAL, LOC_CAPITAL, "Pautar a barrios: MONTE CRISTO\nPIQUILLÍN")["destino"] == "excluido")

# --- CASO 8: duplicados -----------------------------------------------------------------------
print("CASO 8 - duplicados: clave (COD, campaña, título, destino); sin código no se deduplica")
base = {"COD. CONTENIDO": "A00001", "LOCALIDAD / SUBCIRCUITO": "TODAS LAS LOCALIDADES"}
sal, st, _ = generar(fila(**base, **{"FECHA DE ENVÍO": pd.Timestamp("2026-10-01"), "FIN": pd.Timestamp("2026-10-10")}),
                     fila(**base, **{"FECHA DE ENVÍO": pd.Timestamp("2026-10-05"), "FIN": pd.Timestamp("2026-10-20")}))
p = plano(sal)
caso("misma clave: 1 colapsada y gana la FECHA DE ENVÍO más reciente", len(p) == 1 and p[0][2]["fin"] == "2026-10-20" and st["entradas_colapsadas_por_dedup"] == 1)
sal, _, _ = generar(fila(**base, ESTADO="INACTIVO", FIN=pd.Timestamp("2026-10-10")), fila(**base, ESTADO="ACTIVO", FIN=pd.Timestamp("2026-10-20")))
caso("empate de fecha: gana ESTADO=ACTIVO", plano(sal)[0][2]["estado"] == "Vigente")
sal, _, _ = generar(fila(**base), fila(**base, **{"TITULO DE LA PIEZA": "Otro título"}))
caso("mismo código con distinto título: NO se unifican", len(plano(sal)) == 2)
sal, _, _ = generar(fila(**{"LOCALIDAD / SUBCIRCUITO": "TODAS LAS LOCALIDADES"}), fila(**{"LOCALIDAD / SUBCIRCUITO": "TODAS LAS LOCALIDADES"}))
caso("sin COD. CONTENIDO nunca se deduplica", len(plano(sal)) == 2)
sal, _, _ = generar(fila(**{"COD. CONTENIDO": 139, "LOCALIDAD / SUBCIRCUITO": "TODAS LAS LOCALIDADES"}), fila(**{"COD. CONTENIDO": "139", "LOCALIDAD / SUBCIRCUITO": "TODAS LAS LOCALIDADES"}))
caso("la comparación de códigos es literal: 139 (número) y '139' (texto) son distintos", len(plano(sal)) == 2)

# --- CASO 9: expansión multi-barrio ---------------------------------------------------------
print("CASO 9 - una fila con N barrios = N entradas con las métricas completas")
sal, st, _ = generar(fila(**{"LOCALIDAD / SUBCIRCUITO": LOC_CAPITAL, "AUDIENCIA  (Barrios o publicos) ": "Alta Córdoba, Cofico, Ayacucho", "Inversión ejecutada ": 1000.0, "Impresiones Ejecutada META": 500}))
p = plano(sal)
caso("3 entradas, misma fila_origen, inversión 1000 en cada una (no se reparte)", len(p) == 3 and {x[2]["fila_origen"] for x in p} == {2} and all(x[2]["metricas_ejecutadas"]["inversion"] == 1000.0 for x in p))

# --- CASO 10: fechas y métricas -----------------------------------------------------------
print("CASO 10 - fechas y métricas")
caso("fecha real de Excel -> ISO", g.fecha_iso(pd.Timestamp("2026-10-07")) == "2026-10-07")
caso("espacio, '#ERROR!' y NaN -> None", g.fecha_iso(" ") is None and g.fecha_iso("#ERROR!") is None and g.fecha_iso(float("nan")) is None)
caso("número suelto (serial de Excel) -> None, no 1970", g.fecha_iso(46295) is None)
sal, _, _ = generar(fila(**{"LOCALIDAD / SUBCIRCUITO": "TODAS LAS LOCALIDADES", "INICIO ": " ", "FIN": None}))
caso("sin fechas válidas la fila igual entra, con inicio y fin null", plano(sal)[0][2]["inicio"] is None and plano(sal)[0][2]["fin"] is None)
sal, _, _ = generar(fila(**{"LOCALIDAD / SUBCIRCUITO": "TODAS LAS LOCALIDADES", "PLATAFORMA": "Meta", "Impresiones Ejecutada META": 100, "Frecuencia (Meta) Ejecutada": "#DIV/0!", "CPM Real META": 5.5, "Inversión ejecutada ": "-"}),
                    fila(**{"LOCALIDAD / SUBCIRCUITO": "TODAS LAS LOCALIDADES", "TITULO DE LA PIEZA": "g", "PLATAFORMA": "Youtube", "Visualizaciones Ejecutadas GOOGLE": 70, "CPV Real GOOGLE": 1.5}))
m, y = plano(sal)[0][2], plano(sal)[1][2]
caso("Meta: impresiones/CPM de META; '#DIV/0!' y '-' -> null", m["plataforma"] == "META" and m["metricas_ejecutadas"] == {"alcance_o_visualizaciones": 100, "frecuencia": None, "costo_unitario": 5.5, "inversion": None}, str(m["metricas_ejecutadas"]))
caso("Youtube -> GOOGLE con visualizaciones/CPV y plataforma_origen conservada", y["plataforma"] == "GOOGLE" and y["plataforma_origen"] == "Youtube" and y["metricas_ejecutadas"]["alcance_o_visualizaciones"] == 70)

# --- CASO 11: esquema de salida -------------------------------------------------------------
print("CASO 11 - esquema de salida")
sal, _, _ = generar(fila(**{"LOCALIDAD / SUBCIRCUITO": "TODAS LAS LOCALIDADES", "COD. CONTENIDO": "A00002"}))
p = plano(sal)[0][2]
caso("la entrada trae cod_contenido y fecha_envio (nuevos) y no trae campos internos", p["cod_contenido"] == "A00002" and "fecha_envio" in p and not any(k.startswith("_") for k in p), str(sorted(p)))
caso("total_pautas consistente en cada bucket", sal["toda_capital"]["total_pautas"] == len(sal["toda_capital"]["pautas"]))

print(f"\n{CASOS - len(FALLOS)}/{CASOS} casos OK")
if FALLOS:
    print("FALLARON:", FALLOS)
    sys.exit(1)
