// Cliente de /api/planificador/fichas.
async function pedir(opts) {
  const res = await fetch('/api/planificador/fichas', opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(json.mensaje || json.error || `Error ${res.status}`); e.codigo = json.error; throw e; }
  return json;
}
export const cargarFichas = () => pedir({ method: 'GET' });
export const enviarOperacion = (circuito, op) => pedir({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ circuito, op }) });
