// Base de datos del Planificador en Google Sheets (Apps Script, script vinculado a la planilla).
// Recibe pedidos del SERVIDOR del tablero (Vercel) y guarda las fichas en esta planilla:
//   hoja "Acciones": una fila por recomendación   ·   hoja "Notas": una fila por circuito.
// Protocolo (POST, JSON en el cuerpo): { token, accion: 'leerTodas' | 'leerUna' | 'guardar', circuito?, ficha? }
// El token vive en las "Propiedades del script" (TOKEN), nunca en el código. Ver docs/persistencia-google-sheets.md.

const HOJA_ACCIONES = 'Acciones';
const COLS_ACCIONES = ['circuito', 'id', 'tipo', 'texto', 'estado', 'creada_por', 'creada_en', 'estado_por', 'estado_en', 'hecha_por', 'hecha_en'];
const HOJA_NOTAS = 'Notas';
const COLS_NOTAS = ['circuito', 'notas', 'actualizado_por', 'actualizado_en'];

// Ejecutar UNA vez a mano: crea las hojas y genera el token si todavía no existe.
function inicializar() {
  hoja_(HOJA_ACCIONES, COLS_ACCIONES);
  hoja_(HOJA_NOTAS, COLS_NOTAS);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN')) {
    props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
}

function hoja_(nombre, cols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#E3F2FD');
    sh.setFrozenRows(1);
  }
  return sh;
}

// Todo se guarda como texto: evita que Sheets convierta fechas ISO o claves como "10" en otros tipos.
const texto_ = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
};

function leerFilas_(sh, cols) {
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues().map((fila) => {
    const o = {};
    cols.forEach((c, i) => { o[c] = texto_(fila[i]); });
    return o;
  }).filter((o) => o.circuito !== '');
}

const fichaVacia_ = () => ({ notas: '', acciones: [], actualizado_por: null, actualizado_en: null });

function leerTodas_() {
  const fichas = {};
  leerFilas_(hoja_(HOJA_NOTAS, COLS_NOTAS), COLS_NOTAS).forEach((n) => {
    fichas[n.circuito] = { notas: n.notas, acciones: [], actualizado_por: n.actualizado_por || null, actualizado_en: n.actualizado_en || null };
  });
  leerFilas_(hoja_(HOJA_ACCIONES, COLS_ACCIONES), COLS_ACCIONES).forEach((a) => {
    if (!fichas[a.circuito]) fichas[a.circuito] = fichaVacia_();
    fichas[a.circuito].acciones.push({
      id: a.id, tipo: a.tipo, texto: a.texto, estado: a.estado,
      creada_por: a.creada_por, creada_en: a.creada_en,
      estado_por: a.estado_por, estado_en: a.estado_en,
      hecha_por: a.hecha_por || null, hecha_en: a.hecha_en || null,
    });
  });
  return fichas;
}

function guardar_(circuito, ficha) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    // Acciones: se reemplazan todas las filas de ese circuito (conservan su orden).
    const shA = hoja_(HOJA_ACCIONES, COLS_ACCIONES);
    const actuales = shA.getLastRow() > 1 ? shA.getRange(2, 1, shA.getLastRow() - 1, COLS_ACCIONES.length).getValues() : [];
    const resto = actuales.map((f) => f.map(texto_)).filter((f) => f[0] !== circuito && f[0] !== '');
    const nuevas = (ficha.acciones || []).map((a) => COLS_ACCIONES.map((c) => (c === 'circuito' ? circuito : texto_(a[c]))));
    const todas = resto.concat(nuevas);
    if (shA.getLastRow() > 1) shA.getRange(2, 1, shA.getLastRow() - 1, COLS_ACCIONES.length).clearContent();
    if (todas.length) {
      const r = shA.getRange(2, 1, todas.length, COLS_ACCIONES.length);
      r.setNumberFormat('@');
      r.setValues(todas);
    }

    // Notas: una fila por circuito (se actualiza o se agrega).
    const shN = hoja_(HOJA_NOTAS, COLS_NOTAS);
    const fila = [circuito, texto_(ficha.notas), texto_(ficha.actualizado_por), texto_(ficha.actualizado_en)];
    const claves = shN.getLastRow() > 1 ? shN.getRange(2, 1, shN.getLastRow() - 1, 1).getValues().map((f) => texto_(f[0])) : [];
    const i = claves.indexOf(circuito);
    const destino = shN.getRange(i >= 0 ? i + 2 : shN.getLastRow() + 1, 1, 1, COLS_NOTAS.length);
    destino.setNumberFormat('@');
    destino.setValues([fila]);
  } finally {
    lock.releaseLock();
  }
}

const salida_ = (obj) => ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || d.token !== token) return salida_({ ok: false, error: 'no_autorizado' });
    switch (d.accion) {
      case 'leerTodas':
        return salida_({ ok: true, fichas: leerTodas_() });
      case 'leerUna': {
        const f = leerTodas_()[String(d.circuito)];
        return salida_({ ok: true, ficha: f || null });
      }
      case 'guardar':
        if (!d.circuito || !d.ficha) return salida_({ ok: false, error: 'datos_incompletos' });
        guardar_(String(d.circuito), d.ficha);
        return salida_({ ok: true });
      default:
        return salida_({ ok: false, error: 'accion_desconocida' });
    }
  } catch (err) {
    return salida_({ ok: false, error: String(err) });
  }
}

// Abrir la URL en el navegador solo muestra que está vivo; no devuelve datos.
function doGet() {
  return salida_({ ok: true, mensaje: 'Base del Planificador activa. Los datos solo se piden por POST con token.' });
}
