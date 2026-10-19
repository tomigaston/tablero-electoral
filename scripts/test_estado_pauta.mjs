// Test del predicado único de "activa" y de los estados (lib/estadoPauta.js).
// Mismos casos que el interior (esPiezaPDViva en lib/semaforo.js). Correr:
//     node scripts/test_estado_pauta.mjs
import assert from 'node:assert/strict';
import {
  pautaEstaVigente, estadoMostradoPauta, normalizarEstadoPauta, esPautaDirigida, cuentaParaCobertura, parsearFechaISOPauta,
} from '../lib/estadoPauta.js';

const hoy = (iso) => parsearFechaISOPauta(iso);
const pieza = (estado, inicio, fin, destino = 'barrio') => ({ estado, inicio, fin, destino_tablero: destino });
let casos = 0;
const caso = (nombre, fn) => { fn(); casos += 1; console.log(`  ok  ${nombre}`); };

console.log('CASO 1 - normalización de estados (nuevos y del JSON anterior)');
caso('ACTIVO/INACTIVO/OBSERVADO/PROGRAMADO del JSON anterior', () => {
  assert.equal(normalizarEstadoPauta('ACTIVO'), 'Vigente');
  assert.equal(normalizarEstadoPauta('inactivo'), 'Finalizada');
  assert.equal(normalizarEstadoPauta('OBSERVADO'), 'Observada');
  assert.equal(normalizarEstadoPauta('PROGRAMADO'), 'Programada');
});
caso('estados nuevos pasan tal cual; vacío o null -> S/D; valor raro -> tal cual', () => {
  assert.equal(normalizarEstadoPauta('Vigente'), 'Vigente');
  assert.equal(normalizarEstadoPauta(''), 'S/D');
  assert.equal(normalizarEstadoPauta(null), 'S/D');
  assert.equal(normalizarEstadoPauta('En revisión'), 'En revisión');
});

console.log('CASO 2 - activa = estado Vigente e INICIO <= hoy <= FIN (ejemplos del manual, fecha de control 15/10/2026)');
const h = hoy('2026-10-15');
caso('Vigente 01/10-31/10: activa', () => assert.equal(pautaEstaVigente(pieza('Vigente', '2026-10-01', '2026-10-31'), h), true));
caso('Vigente con FIN vencido: no activa', () => assert.equal(pautaEstaVigente(pieza('Vigente', '2026-09-01', '2026-10-10'), h), false));
caso('Vigente sin FIN: no activa', () => assert.equal(pautaEstaVigente(pieza('Vigente', '2026-10-01', null), h), false));
caso('Vigente sin INICIO: no activa', () => assert.equal(pautaEstaVigente(pieza('Vigente', null, '2026-10-31'), h), false));
caso('Vigente que todavía no empezó (INICIO futuro): no activa', () => assert.equal(pautaEstaVigente(pieza('Vigente', '2026-10-20', '2026-10-30'), h), false));
caso('Finalizada con fechas en curso: no activa', () => assert.equal(pautaEstaVigente(pieza('Finalizada', '2026-10-01', '2026-10-31'), h), false));
caso('Observada con fechas en curso: no activa', () => assert.equal(pautaEstaVigente(pieza('Observada', '2026-10-01', '2026-10-31'), h), false));
caso('Programada con INICIO ya pasado: no activa', () => assert.equal(pautaEstaVigente(pieza('Programada', '2026-10-12', '2026-10-19'), h), false));
caso('S/D con fechas en curso: no activa', () => assert.equal(pautaEstaVigente(pieza('S/D', '2026-10-01', '2026-10-31'), h), false));
caso('bordes inclusivos: INICIO = hoy y FIN = hoy son activas', () => {
  assert.equal(pautaEstaVigente(pieza('Vigente', '2026-10-15', '2026-10-31'), h), true);
  assert.equal(pautaEstaVigente(pieza('Vigente', '2026-10-01', '2026-10-15'), h), true);
});
caso('el JSON anterior (ACTIVO) sigue funcionando', () => assert.equal(pautaEstaVigente(pieza('ACTIVO', '2026-10-01', '2026-10-31'), h), true));
caso('fecha con sufijo de hora se lee igual', () => assert.equal(pautaEstaVigente(pieza('Vigente', '2026-10-01 00:00:00', '2026-10-31 00:00:00'), h), true));
caso('el día después del FIN deja de ser activa', () => assert.equal(pautaEstaVigente(pieza('Vigente', '2026-10-01', '2026-10-15'), hoy('2026-10-16')), false));

console.log('CASO 3 - etiqueta mostrada');
caso('estadoMostradoPauta devuelve la etiqueta normalizada', () => {
  assert.equal(estadoMostradoPauta({ estado: 'ACTIVO' }), 'Vigente');
  assert.equal(estadoMostradoPauta({}), 'S/D');
});

console.log('CASO 4 - cobertura dirigida: toda_capital puede estar activa pero no cuenta como cobertura');
caso('barrio y circuito_sin_barrio son dirigidas; toda_capital no', () => {
  assert.equal(esPautaDirigida({ destino_tablero: 'barrio' }), true);
  assert.equal(esPautaDirigida({ destino_tablero: 'circuito_sin_barrio' }), true);
  assert.equal(esPautaDirigida({ destino_tablero: 'toda_capital' }), false);
});
caso('activa y dirigida cuenta; activa de toda_capital no; dirigida no activa no', () => {
  assert.equal(cuentaParaCobertura(pieza('Vigente', '2026-10-01', '2026-10-31', 'barrio'), h), true);
  assert.equal(cuentaParaCobertura(pieza('Vigente', '2026-10-01', '2026-10-31', 'toda_capital'), h), false);
  assert.equal(cuentaParaCobertura(pieza('Finalizada', '2026-10-01', '2026-10-31', 'barrio'), h), false);
});

console.log(`\n${casos} casos OK`);
