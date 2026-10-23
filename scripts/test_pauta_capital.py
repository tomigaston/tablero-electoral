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
caso("PROVINCIA + audiencia vacía -> toda_capital (decisión 23/10)", geo(PROVINCIA, "TODAS LAS LOCALIDADES", None)["destino"] == "toda_capital")
for aud in ["Audiencia de alto poder adquisitivo", "ABC1", "Circulo rojo sin distinción. Políticos de primer rango y funcionarios.", "IDN141XXXX/ AEN118XXXX", "Segmentar por intereses"]:
    caso(f"PROVINCIA + audiencia sin referencia geográfica ({aud[:25]}) -> toda_capital (decisión 23/10)", geo(PROVINCIA, "TODAS LAS LOCALIDADES", aud)["destino"] == "toda_capital")
caso("PROVINCIA + audiencia que nombra un barrio sin decir Capital -> pendiente (sigue la regla anterior)", geo(PROVINCIA, "TODAS LAS LOCALIDADES", "Barrio Los Naranjos 30 a 65")["destino"] == "pendiente")
caso("PROVINCIA + audiencia con lista de circuitos sin decir Capital -> pendiente", geo(PROVINCIA, "TODAS LAS LOCALIDADES", "5 G San Vicente, 5 C Empalme")["destino"] == "pendiente")
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
caso("lista con circuitos (filas 3617-3620): 3 barrios + la seccional 5 entera (5 y 5A…5I) como circuito_sin_barrio",
     sorted((e["destino"], e["circuito"], e["barrio"]) for e in r["entradas"]) ==
     [("barrio", "12B", "COLON"), ("barrio", "5C", "EMPALME"), ("barrio", "5G", "SAN VICENTE")] +
     [("circuito_sin_barrio", c, None) for c in ["5", "5A", "5B", "5C", "5D", "5E", "5F", "5G", "5H", "5I"]], str(r))
r = geo(CAPITAL, LOC_CAPITAL, "Barrrio Jorge Newbery de 30 a 60 años sin km agregados")
caso("alias: 'Jorge Newbery' -> PARQUE JORGE NEWBERY", barrios_de(r) == ["PARQUE JORGE NEWBERY"], str(r))
r = geo(CAPITAL, LOC_CAPITAL, "10 B Ciudedale, 10 H Parque Capital")
caso("POLÍTICA: un error de tipeo sin alias confirmado NO se adivina (Ciudedale queda afuera, con aviso)", "CIUDADELA" not in barrios_de(r) and any("Ciudedale" in a for a in r["avisos"]) and "PARQUE CAPITAL" in barrios_de(r), str(r))
r = geo(CAPITAL, LOC_CAPITAL, "Alta Córdoba, Quintas de Santa Ana, Cofico")
caso("POLÍTICA: un alias pendiente de confirmar NO se aplica, solo se sugiere en el aviso", "QUINTA SANTA ANA" not in barrios_de(r) and any("alias pendiente de confirmar: QUINTA SANTA ANA" in a for a in r["avisos"]), str(r))
r = geo(CAPITAL, LOC_CAPITAL, "Alta Córdoba, Cofico, Ayacucho, Zumarán, Kronfuss")
caso("lista sin números: los segmentos sin barrio reconocido se informan y los demás entran", barrios_de(r) == ["ALTA CORDOBA", "AYACUCHO", "COFICO"] and len(r["avisos"]) == 2, str(r))
r = geo(CAPITAL, LOC_CAPITAL, "Barrio Inventado de 30 a 60 años")
caso("POLÍTICA: audiencia que nombra un barrio que no se resuelve -> pendiente (no se asume toda_capital)", r["destino"] == "pendiente", str(r))
r = geo(CAPITAL, LOC_CAPITAL, "Córdoba Capital 30 a 60 años, Departamento Punilla de 18 a 65 años")
caso("un ítem dice Córdoba Capital aunque otro nombre otro departamento -> toda_capital (decisión 23/10, filas 979/1294/1295)", r["destino"] == "toda_capital", str(r))
r = geo(CAPITAL, LOC_CAPITAL, "Hombres y mujeres 30 a 60, Departamento Punilla de 18 a 65 años")
caso("POLÍTICA: audiencia que nombra otro departamento y ningún ítem dice Capital -> pendiente", r["destino"] == "pendiente", str(r))
r = geo(CAPITAL, LOC_CAPITAL, "Departamento Punilla 18 a 65 | Excluir Departamento Capital")
caso("'Excluir Departamento Capital' no cuenta como ítem que dice Capital -> pendiente", r["destino"] == "pendiente", str(r))
caso("con TODAS LAS LOCALIDADES la regla del ítem Capital no se aplica (sigue excluido)", geo(PROVINCIA, "TODAS LAS LOCALIDADES", "Hombres y mujeres de 20 a 60 años. Excluir Departamento Capital")["destino"] == "excluido")
r = geo(CAPITAL, "010M - AMPLIACION CABILDO, CÓRDOBA CAPITAL, ARGENTINA", "Barrio Ampliación Cabildo de 30 a 60 años sin Advantadge")
caso("'Barrio X' con X = nombre del circuito de LOCALIDAD -> circuito_sin_barrio de ese circuito (decisión 23/10, fila 1243)",
     [(e["destino"], e["circuito"], e["barrio"]) for e in r["entradas"]] == [("circuito_sin_barrio", "10M", None)], str(r))
r = geo(CAPITAL, "010C - COMERCIAL, CÓRDOBA CAPITAL, ARGENTINA", "Barrio Comercial de 30 a 60 años")
caso("si el nombre del circuito también es un barrio oficial (COMERCIAL), gana el barrio", [(e["destino"], e["circuito"], e["barrio"]) for e in r["entradas"]] == [("barrio", "10C", "COMERCIAL")], str(r))
for aud, esperado in [("Barrio Teódoro Fells de 30 a 60 años", "TEODORO FELS"), ("Barrio Villa Quizquizacate de 30 a 60 años", "VILLA QUISQUIZACATE")]:
    caso(f"alias confirmado el 23/10: {aud[:28]} -> {esperado}", esperado in barrios_de(geo(CAPITAL, LOC_CAPITAL, aud)))
caso("'Pueyrredón' sigue sin aplicarse (alias pendiente: 'Cuadrante 8' puede incluir AMPLIACION PUEYRREDON)", "GENERAL PUEYRREDON" not in barrios_de(geo(CAPITAL, LOC_CAPITAL, "Pueyrredón, Alta Córdoba")))
caso("'Ampliación Pueyrredón' sigue siendo AMPLIACION PUEYRREDON (el nombre oficial gana al alias)", barrios_de(geo(CAPITAL, LOC_CAPITAL, "Ampliación Pueyrredón, Alta Córdoba")) == ["ALTA CORDOBA", "AMPLIACION PUEYRREDON"])
r = geo(CAPITAL, LOC_CAPITAL, "Todo el departamento con exclusiones de los subcircuitos a los que ya estamos llegando")
caso("'Todo el departamento…' con localidad Capital explícita NO se confunde con otro departamento -> toda_capital", r["destino"] == "toda_capital", str(r))
r = geo(CAPITAL, "010C - COMERCIAL, CÓRDOBA CAPITAL, ARGENTINA", 'Barrio Felipe Varela de 30 a 60 años sin km agregados')
caso("POLÍTICA: con código de circuito pero un barrio sin resolver -> pendiente (maestro fila 3755)", r["destino"] == "pendiente", str(r))
r = geo(CAPITAL, "010C - COMERCIAL, CÓRDOBA CAPITAL, ARGENTINA", '010C - COMERCIAL, CÓRDOBA CAPITAL, ARGENTINA sin advantage+ de 30 a 65 años')
caso("con código y sin barrio nombrado -> circuito_sin_barrio", [(e["destino"], e["barrio"]) for e in r["entradas"]] == [("circuito_sin_barrio", None)], str(r))
r = geo(CAPITAL, LOC_CAPITAL, "Hombres y mujeres de 30 a 65 años")
caso("localidad Capital explícita y audiencia genérica -> toda_capital", r["destino"] == "toda_capital", str(r))
r = geo(CAPITAL, LOC_CAPITAL, "3 Seccional Tercera, 7 B Alta Córdoba")
caso("ítem sin letra con nombre de circuito -> circuito_sin_barrio; con letra y barrio -> barrio", sorted((e["destino"], e["circuito"], e["barrio"]) for e in r["entradas"]) == [("barrio", "7B", "ALTA CORDOBA"), ("circuito_sin_barrio", "3", None)], str(r))
r = geo(CAPITAL, LOC_CAPITAL, "9 Nombre Inventado, 7 B Alta Córdoba")
caso("POLÍTICA: ítem numerado que no es barrio ni el nombre del circuito queda afuera, con aviso", [(e["barrio"]) for e in r["entradas"]] == ["ALTA CORDOBA"] and len(r["avisos"]) == 1, str(r))
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
print("CASO 8 - duplicados: clave (campaña, título, plataforma, destino, INICIO, FIN, link, tipo, audiencia); COD. CONTENIDO no decide")
base = {"LOCALIDAD / SUBCIRCUITO": "TODAS LAS LOCALIDADES", "LINK MATERIAL": "https://ejemplo/1", "TIPO DE MATERIAL": "REEL", "AUDIENCIA  (Barrios o publicos) ": "Capital 30 a 60"}
sal, st, _ = generar(fila(**base, **{"FECHA DE ENVÍO": pd.Timestamp("2026-10-01"), "Impresiones Ejecutada META": 10}),
                     fila(**base, **{"FECHA DE ENVÍO": pd.Timestamp("2026-10-05"), "Impresiones Ejecutada META": 20}))
p = plano(sal)
caso("misma clave: 1 colapsada, gana la FECHA DE ENVÍO más reciente y las métricas no se suman",
     len(p) == 1 and p[0][2]["metricas_ejecutadas"]["alcance_o_visualizaciones"] == 20 and st["entradas_colapsadas_por_dedup"] == 1)
sal, _, _ = generar(fila(**base, ESTADO="INACTIVO"), fila(**base, ESTADO="ACTIVO"))
caso("empate de fecha: gana ESTADO=ACTIVO", len(plano(sal)) == 1 and plano(sal)[0][2]["estado"] == "Vigente")
sal, _, _ = generar(fila(**base, **{"Impresiones Ejecutada META": 1}), fila(**base, **{"Impresiones Ejecutada META": 2}))
caso("empate total: queda la primera de la planilla", plano(sal)[0][2]["fila_origen"] == 2)
sal, _, _ = generar(fila(**base, **{"COD. CONTENIDO": "A00001"}), fila(**base, **{"COD. CONTENIDO": "A00002"}))
caso("COD. CONTENIDO distinto no impide unificar (no participa de la clave)", len(plano(sal)) == 1)
sal, _, _ = generar(fila(**base, **{"COD. CONTENIDO": "A00001"}), fila(**base, **{"COD. CONTENIDO": "A00001", "TITULO DE LA PIEZA": "Otro título"}))
caso("mismo COD. CONTENIDO con distinto título: NO se unifican", len(plano(sal)) == 2)
sal, _, _ = generar(fila(**base), fila(**base))
caso("sin COD. CONTENIDO también se deduplica", len(plano(sal)) == 1)
sal, _, _ = generar(fila(**base), fila(**base, **{"CAMPAÑA": "  campaña DE prueba ", "TITULO DE LA PIEZA": "Piéza de prueba"}))
caso("la comparación está normalizada (espacios, mayúsculas, tildes)", len(plano(sal)) == 1)
for campo, valor in [("PLATAFORMA", "Youtube"), ("FIN", pd.Timestamp("2026-11-30")), ("INICIO ", pd.Timestamp("2026-09-30")), ("LINK MATERIAL", "https://ejemplo/2"),
                     ("TIPO DE MATERIAL", "CARRUSEL"), ("AUDIENCIA  (Barrios o publicos) ", "Audiencia de alto nivel adquisitivo")]:
    sal, _, _ = generar(fila(**base), fila(**{**base, campo: valor}))
    caso(f"distinto {campo.strip()}: NO se unifican", len(plano(sal)) == 2)
sal, _, _ = generar(fila(**{"LOCALIDAD / SUBCIRCUITO": LOC_CAPITAL, "AUDIENCIA  (Barrios o publicos) ": "Alta Córdoba, Cofico"}),
                    fila(**{"LOCALIDAD / SUBCIRCUITO": LOC_CAPITAL, "AUDIENCIA  (Barrios o publicos) ": "Alta Córdoba, Cofico"}))
caso("se compara después de repartir la geografía: 2 filas x 2 barrios = 2 entradas", sorted(k for _, k, _ in plano(sal)) == ["ALTA CORDOBA", "COFICO"])

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

# --- CASO 12: seccional -> una entrada por subcircuito ----------------------------------------
print("CASO 12 - seccional (código sin letra): circuito_sin_barrio en la seccional y en cada subcircuito")
r = geo(CAPITAL, "0014 - ARGUELLO, CÓRDOBA CAPITAL, ARGENTINA", None)
subs14 = ["14"] + [f"14{l}" for l in "ABCDEFGHIJKLMNOPQ"]
caso("0014 - ARGUELLO -> 14 y 14A…14Q (18 entradas)", [e["circuito"] for e in r["entradas"]] == subs14 and {e["destino"] for e in r["entradas"]} == {"circuito_sin_barrio"}, str(r))
r = geo(CAPITAL, "005 - ALTAMIRA, CÓRDOBA CAPITAL, ARGENTINA", None)
caso("005 (seccional numerada 1 a 9) -> 5 y 5A…5I", [e["circuito"] for e in r["entradas"]] == ["5"] + [f"5{l}" for l in "ABCDEFGHI"], str(r))
for sec in ("1", "2", "3"):
    r = geo(CAPITAL, f"00{sec} - SECCIONAL, CÓRDOBA CAPITAL, ARGENTINA", None)
    caso(f"seccional {sec} sin subcircuitos con letra -> queda en sí misma", [e["circuito"] for e in r["entradas"]] == [sec], str(r))
r = geo(CAPITAL, "014A - ARGUELLO NORTE, CÓRDOBA CAPITAL, ARGENTINA", None)
caso("código con letra -> solo ese subcircuito", [e["circuito"] for e in r["entradas"]] == ["14A"], str(r))
sal, _, _ = generar(fila(**{"LOCALIDAD / SUBCIRCUITO": "0014 - ARGUELLO, CÓRDOBA CAPITAL, ARGENTINA", "Inversión ejecutada ": 1000.0}))
caso("una entrada por subcircuito con las métricas repetidas completas",
     len(plano(sal)) == 18 and all(x[2]["metricas_ejecutadas"]["inversion"] == 1000.0 for x in plano(sal)) and set(sal["circuitos_sin_barrio"]) == set(subs14))

# --- CASO 13: documento de filas no procesadas ------------------------------------------------------
print("CASO 13 - documento de filas no procesadas: cuadra con el JSON y falla si no")
import json as _json, tempfile as _tmp
base = {"LOCALIDAD / SUBCIRCUITO": "TODAS LAS LOCALIDADES", "LINK MATERIAL": "https://ejemplo/1"}
filas = [fila(**base, **{"Impresiones Ejecutada META": 5}), fila(**base, **{"Impresiones Ejecutada META": 5}),  # repetición genuina
         fila(**base, **{"TITULO DE LA PIEZA": "b", "Impresiones Ejecutada META": 5}), fila(**base, **{"TITULO DE LA PIEZA": "b", "Impresiones Ejecutada META": 9}),  # a confirmar
         fila(**{"TITULO DE LA PIEZA": "c", "LOCALIDAD / SUBCIRCUITO": "TODAS LAS LOCALIDADES"}), fila(**{"TITULO DE LA PIEZA": "c", "LOCALIDAD / SUBCIRCUITO": "TODAS LAS LOCALIDADES"}),  # sin métricas
         fila(**{"LOCALIDAD / SUBCIRCUITO": LOC_CAPITAL, "AUDIENCIA  (Barrios o publicos) ": "Barrio Inventado de 30 a 60 años"}),  # pendiente
         fila(**{"DEPARTAMENTO": "DEPARTAMENTO RIO CUARTO, PROVINCIA DE CÓRDOBA, ARGENTINA", "LOCALIDAD / SUBCIRCUITO": "TODAS LAS LOCALIDADES"}),  # fuera
         fila(**{"CAMPAÑA": None, "TITULO DE LA PIEZA": None})]  # vacía
df_doc = pd.DataFrame(filas, columns=COLUMNAS)
sal, st, _ = g.generar(df_doc, REF)
with _tmp.TemporaryDirectory() as d:
    jp, xp = Path(d) / "p.json", Path(d) / "n.xlsx"
    jp.write_text(_json.dumps(sal, ensure_ascii=False))
    res = dict(g.escribir_no_procesadas(xp, df_doc, st))
    g.cuadrar_no_procesadas(xp, list(res.items()), jp, st)
    caso("resumen: 9 renglones, 1 vacía, 8 reales, 3 entran, 1 fuera, 1 pendiente, 3 duplicadas (1 por bloque)",
         (res["Renglones de la planilla (sin el encabezado)"], res["Descartadas por vacías (sin CAMPAÑA ni TITULO DE LA PIEZA)"], res["Filas reales"], res["Entran al tablero"],
          res["Fuera de Capital"], res["Pendientes"], res["Duplicadas (todas sus entradas se unificaron con otra fila)"],
          res["   Duplicadas: repetición genuina"], res["   Duplicadas: sin métricas"], res["   Duplicadas: a confirmar por el área"]) == (9, 1, 8, 3, 1, 1, 3, 1, 1, 1), str(res))
    sal["toda_capital"]["pautas"].pop()
    jp.write_text(_json.dumps(sal, ensure_ascii=False))
    try:
        g.cuadrar_no_procesadas(xp, list(res.items()), jp, st)
        fallo = False
    except SystemExit:
        fallo = True
    caso("si el JSON no coincide con el resumen, falla y no deja el documento", fallo and not xp.exists())

print(f"\n{CASOS - len(FALLOS)}/{CASOS} casos OK")
if FALLOS:
    print("FALLARON:", FALLOS)
    sys.exit(1)
