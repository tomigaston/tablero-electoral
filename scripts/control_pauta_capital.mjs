// Conteos de control de la capa Pauta de Capital con el código REAL de lib/ y los datos de
// public/data/, para una o más fechas de control fijas. Mismo propósito que las
// "verificaciones" del interior. Uso:
//     node scripts/control_pauta_capital.mjs 2026-10-14 2026-10-15
//     PAUTAS_JSON=/ruta/al/nuevo.json node scripts/control_pauta_capital.mjs 2026-10-19
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fechas = process.argv.slice(2);
if (!fechas.length) { console.error('Uso: node scripts/control_pauta_capital.mjs AAAA-MM-DD [AAAA-MM-DD ...]'); process.exit(1); }

// lib/ usa imports sin extensión (webpack); para correrlo en node se copia a un temporal con .mjs.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pauta-capital-'));
for (const f of ['estadoPauta', 'pautaPorCircuito', 'pautaResumen']) {
  const src = fs.readFileSync(path.join(raiz, 'lib', f + '.js'), 'utf8').replace(/from '\.\/([A-Za-z]+)'/g, "from './$1.mjs'");
  fs.writeFileSync(path.join(tmp, f + '.mjs'), src);
}
const imp = (f) => import(pathToFileURL(path.join(tmp, f + '.mjs')).href);
const { derivarPautaPorCircuito } = await imp('pautaPorCircuito');
const { resumirPauta } = await imp('pautaResumen');
const { pautaEstaVigente } = await imp('estadoPauta');

const J = (f) => JSON.parse(fs.readFileSync(path.join(raiz, 'public', 'data', f), 'utf8'));
// PAUTAS_JSON permite verificar un JSON recién generado antes de copiarlo a public/data/.
const pautas = process.env.PAUTAS_JSON ? JSON.parse(fs.readFileSync(process.env.PAUTAS_JSON, 'utf8')) : J('pautas_barrios.json'), datos = J('circuitos_completo.json'), geo = J('barrios_geo.json'), cruce = J('circuito_barrios_cruce.json');
const entradas = [
  ...Object.values(pautas.barrios).flatMap((v) => v.pautas),
  ...Object.values(pautas.circuitos_sin_barrio).flatMap((v) => v.pautas),
  ...pautas.toda_capital.pautas,
];
const por = (arr, fn) => arr.reduce((m, x) => ((m[fn(x)] = (m[fn(x)] || 0) + 1), m), {});
// Campaña como la cuenta el manual: CAMPAÑA (o el título si está vacía), sin distinguir mayúsculas, tildes ni espacios.
const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
const nivel = (arr) => `${new Set(arr.map((p) => p.fila_origen)).size} filas / ${arr.length} entradas / ${new Set(arr.map((p) => norm(p.campania || p.titulo_pieza))).size} campañas`;
const dirigida = (p) => p.destino_tablero === 'barrio' || p.destino_tablero === 'circuito_sin_barrio';
console.log('Filas que entran:', new Set(entradas.map((p) => p.fila_origen)).size, '| entradas:', entradas.length, '| por bucket:', JSON.stringify(por(entradas, (p) => p.destino_tablero)));

for (const fecha of fechas) {
  const [y, m, d] = fecha.split('-').map(Number);
  const hoy = new Date(y, m - 1, d); hoy.setHours(0, 0, 0, 0);
  const der = derivarPautaPorCircuito({ pautasBarriosData: pautas, datos, barriosGeoData: geo, cruceData: cruce, hoy });
  const res = resumirPauta(der, cruce);
  const activas = entradas.filter((p) => pautaEstaVigente(p, hoy));
  console.log(`\n=== Fecha de control ${fecha}`);
  console.log('Entradas:', entradas.length, '| por estado:', JSON.stringify(por(entradas, (p) => p.estado)));
  console.log('Entradas activas (estado Vigente e INICIO<=hoy<=FIN):', activas.length, '| filas únicas:', new Set(activas.map((p) => p.fila_origen)).size);
  console.log('Activas por bucket:', JSON.stringify(por(activas, (p) => p.destino_tablero)));
  console.log('Nivel 1 (ESTADO activo):', nivel(entradas.filter((p) => p.estado === 'Vigente')));
  console.log('Nivel 2 (activas):', nivel(activas));
  console.log('Nivel 3 (activas dirigidas):', nivel(activas.filter(dirigida)));
  console.log('Piezas derivadas:', der.control.piezasEnCircuitos + der.control.piezasCapital + der.control.piezasSinResolver, '| sin circuito resuelto:', der.control.piezasSinResolver);
  console.log('Tarjeta "Pauta activa":', res.activa.total, `(${res.activa.generales} generales + ${res.activa.especificas} específicas)`);
  console.log('Circuitos cubiertos:', res.circuitos.cubiertos, 'de', res.circuitos.total, '| barrios cubiertos:', res.barrios.cubiertos);
}
fs.rmSync(tmp, { recursive: true, force: true });
