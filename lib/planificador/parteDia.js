// Parte de obras del día, en sus dos mensajes de difusión: "obras en ejecución" y "obras finalizadas".
// Se pegan en el tablero tal cual se difunden (se guardan en la base, ver pages/api/planificador/parte.js) y se leen acá.
// Es independiente de lib/parteObras (el parser del tablero principal, que no se toca).
//
// Formato de cada mensaje (se tolera lo que se vio en los mensajes reales):
//   ENCABEZADO DE TIPO            p. ej. "BACHEO EN FRIO", "Mantenimiento de calles de tierra", "RAMPAS"
//   EN EJECUCIÓN / TERMINADOS     (opcional, se ignora: el estado lo da el mensaje)
//   1. Nombre o calle -14A        número de orden opcional; al final " -<circuito>" (p. ej. -7A, -14, -5G)
//      "... BARRIO:Jardin Claret -14G"      el barrio, si viene
//      "Catamarca x Salta · 5 rampas -1"    las rampas traen la cantidad
//   https://docs.google.com/...   un link suelto en la línea siguiente se asigna a la obra anterior

const RE_LINK = /https?:\/\/\S+/gi;
const RE_ORDEN = /^\s*\d+\s*[.)]\s*/;
const RE_ESTADO = /^\s*(en\s+ejecuci[oó]n|terminad[oa]s?|finalizad[oa]s?)\s*$/i;
// Circuito al final de la línea: "-14A", "- 8C", "-4(Nocturno)", "-13G."
const RE_CIRCUITO = /-\s*(\d{1,2}[A-Za-z]?)\s*(\([^)]*\))?\s*\.?\s*$/;
const RE_CIRCUITO_SUELTO = /\s(\d{1,2}[A-Za-z])\s*$/;
const RE_FECHA = /(\d{1,2})\s*[/–-]\s*(\d{1,2})\s*[/–-]\s*(\d{4})/;

const limpiar = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const oracion = (s) => { const t = limpiar(s).toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };

/**
 * @param {string} texto mensaje completo
 * @param {'ejecucion'|'finalizada'} estado estado que tienen todas las obras de ese mensaje
 * @returns {{ estado, fecha: string|null, puestos: number|null, items: Array<{tipo, nombre, barrio, circuito, cantidad, estado, links}> }}
 */
export function parsearParteDia(texto, estado) {
  const items = [];
  let tipo = '';
  let fecha = null;
  let puestos = null;
  let ultimo = null;

  String(texto || '').split(/\r?\n/).forEach((cruda) => {
    const linea = cruda.replace(/\t/g, ' ').trim();
    if (!linea) return;

    const links = linea.match(RE_LINK) || [];
    const sinLinks = limpiar(linea.replace(RE_LINK, ' '));

    // Línea que es solo un link: se asigna a la obra anterior.
    if (!sinLinks) { if (ultimo) ultimo.links.push(...links); return; }

    if (RE_ESTADO.test(sinLinks)) return;

    const numerada = RE_ORDEN.test(sinLinks);
    // Si no trae el " -circuito" del final, en las líneas numeradas se acepta un código suelto al final ("… B° El Mirador 5C").
    const reCircuito = RE_CIRCUITO.test(sinLinks) || !numerada ? RE_CIRCUITO : RE_CIRCUITO_SUELTO;
    const m = sinLinks.match(reCircuito);

    // Sin circuito y sin número de orden: encabezado (o dato suelto del mensaje: fecha, puestos de trabajo).
    if (!m && !numerada) {
      const f = sinLinks.match(RE_FECHA);
      if (f && !fecha) fecha = `${f[3]}-${f[2].padStart(2, '0')}-${f[1].padStart(2, '0')}`;
      const p = sinLinks.match(/puestos[^\d]*(\d[\d.]*)/i);
      if (p) { puestos = Number(p[1].replace(/\./g, '')); return; }
      if (f || /^(lista de difusi|calle por calle|obras\s+(finalizadas|en ejecuci))/i.test(sinLinks)) return;
      tipo = oracion(sinLinks.replace(/\s+en\s+ejecuci[oó]n\s*$/i, ''));
      return;
    }

    let resto = sinLinks.replace(RE_ORDEN, '');
    let circuito = null;
    if (m) { circuito = m[1].toUpperCase(); resto = limpiar(resto.slice(0, resto.search(reCircuito))); }

    let barrio = '';
    const b = resto.match(/\bBARRIO\s*:?\s*(.+)$/i);
    if (b) { barrio = limpiar(b[1]); resto = limpiar(resto.slice(0, b.index)); }

    let cantidad = null;
    const r = resto.match(/[·•]\s*(\d+)\s*rampas?\s*$/i);
    if (r) { cantidad = Number(r[1]); resto = limpiar(resto.slice(0, r.index)); }

    const obra = { tipo, nombre: resto, barrio, circuito, cantidad, estado, links: [...links] };
    items.push(obra);
    ultimo = obra;
  });

  return { estado, fecha, puestos, items };
}

/**
 * Une los dos mensajes y los reparte por circuito.
 * @returns {{ ejecucion, finalizadas, porCircuito: Record<string, {ejecucion: object[], finalizadas: object[]}>, sinCircuito: object[] }}
 */
export function armarParteDia(textoEjecucion, textoFinalizadas) {
  const ejecucion = parsearParteDia(textoEjecucion, 'ejecucion');
  const finalizadas = parsearParteDia(textoFinalizadas, 'finalizada');
  const porCircuito = {};
  const sinCircuito = [];
  [...ejecucion.items, ...finalizadas.items].forEach((o) => {
    if (!o.circuito) { sinCircuito.push(o); return; }
    const c = (porCircuito[o.circuito] = porCircuito[o.circuito] || { ejecucion: [], finalizadas: [] });
    (o.estado === 'ejecucion' ? c.ejecucion : c.finalizadas).push(o);
  });
  return { ejecucion, finalizadas, porCircuito, sinCircuito };
}
