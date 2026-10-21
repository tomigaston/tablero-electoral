// Almacenamiento de las fichas (notas, decisiones, seguimiento) — SOLO servidor.
//
// Compartido, persistente y con atribución. Backends, en orden:
//  1) Google Sheets vía Apps Script: se activa con PLANIFICADOR_SHEETS_URL + PLANIFICADOR_SHEETS_TOKEN
//     (la URL de la aplicación web del script y su token). Las fichas quedan en una planilla de Drive:
//     hoja "Acciones" (una fila por recomendación) y hoja "Notas" (una fila por circuito). Ver docs/persistencia-google-sheets.md.
//  2) Redis REST (Upstash / Vercel KV): se activa con KV_REST_API_URL + KV_REST_API_TOKEN
//     (los que inyecta la integración de Vercel KV) o UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
//     Una sola clave tipo hash: campo = CircuitoKey, valor = ficha en JSON. Sin dependencias: fetch.
//  3) Archivo local `.data/planificador-fichas.json`: solo para desarrollo (fuera de Vercel).
//  4) Nada configurado en Vercel: `modo()` devuelve null y el endpoint responde 503.
import fs from 'fs';
import path from 'path';

const HASH = 'planificador:fichas';
const ARCHIVO = path.join(process.cwd(), '.data', 'planificador-fichas.json');

const urlSheets = () => process.env.PLANIFICADOR_SHEETS_URL || null;
const tokenSheets = () => process.env.PLANIFICADOR_SHEETS_TOKEN || null;
const urlRest = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || null;
const tokenRest = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || null;

export function modo() {
  if (urlSheets() && tokenSheets()) return 'sheets';
  if (urlRest() && tokenRest()) return 'redis';
  if (!process.env.VERCEL) return 'archivo';
  return null;
}

// Apps Script: POST con el token en el cuerpo (texto plano, sin preflight). Responde con una redirección que fetch sigue.
async function sheets(accion, datos = {}) {
  const res = await fetch(urlSheets(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: tokenSheets(), accion, ...datos }),
    redirect: 'follow',
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.ok) throw new Error(`Sheets: ${(json && json.error) || res.status}`);
  return json;
}

async function redis(comando) {
  const res = await fetch(urlRest(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenRest()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(comando),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(`Redis: ${json.error || res.status}`);
  return json.result;
}

const leerArchivo = () => { try { return JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')); } catch (e) { return {}; } };
const escribirArchivo = (obj) => { fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true }); fs.writeFileSync(ARCHIVO, JSON.stringify(obj, null, 2)); };

export async function leerTodas() {
  if (modo() === 'sheets') return (await sheets('leerTodas')).fichas || {};
  if (modo() === 'redis') {
    const plano = (await redis(['HGETALL', HASH])) || [];
    const out = {};
    for (let i = 0; i < plano.length; i += 2) { try { out[plano[i]] = JSON.parse(plano[i + 1]); } catch (e) { /* ficha corrupta: se ignora */ } }
    return out;
  }
  return leerArchivo();
}

export async function leerUna(circuito) {
  if (modo() === 'sheets') return (await sheets('leerUna', { circuito })).ficha || null;
  if (modo() === 'redis') {
    const v = await redis(['HGET', HASH, circuito]);
    return v ? JSON.parse(v) : null;
  }
  return leerArchivo()[circuito] || null;
}

export async function guardar(circuito, ficha) {
  if (modo() === 'sheets') { await sheets('guardar', { circuito, ficha }); return; }
  if (modo() === 'redis') { await redis(['HSET', HASH, circuito, JSON.stringify(ficha)]); return; }
  const todas = leerArchivo(); todas[circuito] = ficha; escribirArchivo(todas);
}
