// Cliente de /api/planificador/parte (los dos mensajes del parte de obras del día).
async function pedir(opts) {
  const res = await fetch('/api/planificador/parte', opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(json.mensaje || json.error || `Error ${res.status}`); e.codigo = json.error; throw e; }
  return json;
}
export const cargarParte = () => pedir({ method: 'GET' });
export const guardarParte = (tipo, texto) => pedir({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, texto }) });
