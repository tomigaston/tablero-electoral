// CSS del reporte imprimible. Se inyecta en la propia página del tablero y rige SOLO al
// imprimir (@media print): el resto del tablero se oculta y queda únicamente el reporte.
// Se redefinen los tokens CSS que usan los componentes de la UI (var(--text-primary), etc.)
// para que se rendericen igual, y se anulan los comportamientos interactivos (scroll
// interno, sticky, botones, selects) que no tienen sentido en papel.

const escCss = (t) => String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');

// Devuelve { pagina, reglas }: @page no puede ir dentro de @media, por eso va aparte.
export function estilosReporte({ territorio, fechaGenerado }) {
  const cab = escCss(`Diagnóstico Territorial · ${territorio}`);
  const pie = escCss(`Diagnóstico Territorial – ${territorio} · Generado el ${fechaGenerado}`);
  const pagina = `
@page{
  size:A4 portrait;margin:14mm 13mm 16mm 13mm;
  @top-left{content:"${cab}";font:bold 9pt/1 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1a1a1a;vertical-align:bottom;padding-bottom:3mm}
  @top-right{content:"Generado el ${escCss(fechaGenerado)}";font:8pt/1 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#777;vertical-align:bottom;padding-bottom:3mm}
  @bottom-left{content:"${pie}";font:8pt/1 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#777;vertical-align:top;padding-top:4mm}
  @bottom-right{content:"Página " counter(page) " de " counter(pages);font:8pt/1 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#777;vertical-align:top;padding-top:4mm}
}
/* La primera hoja ya lleva el encabezado completo (.rp-cab): el de las demás hojas no se repite acá. */
@page :first{@top-left{content:none}@top-right{content:none}}`;
  const reglas = `
:root{--bg-primary:#fff;--bg-secondary:#f3f4f6;--text-primary:#1a1a1a;--text-secondary:#555;--text-tertiary:#777;--border:#d9d9d9}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0;background:#fff;color:var(--text-primary);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:11.5px;line-height:1.35}

/* Encabezado compacto de la primera hoja (no es una portada: el contenido sigue enseguida) */
.rp-cab{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:2px solid #1976D2;padding-bottom:8px;margin-bottom:14px}
.rp-cab h1{font-size:19px;font-weight:700;margin:0}
.rp-cab .rp-terr{font-size:13px;color:var(--text-secondary);margin-top:2px}
.rp-cab .rp-meta{font-size:10px;color:var(--text-tertiary);text-align:right;max-width:55%}

/* Secciones */
.rp-sec{margin:0 0 20px}
.rp-sec.rp-nueva-pagina{break-before:page;page-break-before:always}
.rp-h2{font-size:15px;font-weight:700;margin:0 0 4px;padding-bottom:5px;border-bottom:1px solid #1976D2;break-after:avoid;page-break-after:avoid}
.rp-sub{font-size:11px;color:var(--text-secondary);margin:0 0 10px}
.rp-h3{font-size:12.5px;font-weight:700;margin:14px 0 6px;break-after:avoid;page-break-after:avoid}
.rp-datos{font-size:9px;color:var(--text-tertiary);margin:8px 0 0}
.rp-aviso{font-size:10.5px;color:#8a5a00;background:#fff4dc;border:1px solid #f0d28a;border-radius:6px;padding:6px 9px;margin:0 0 10px;break-inside:avoid}
.rp-nota{font-size:11px;color:var(--text-tertiary);margin:4px 0;break-inside:avoid;page-break-inside:avoid}
.rp-body p{orphans:3;widows:3}
.rp-stack{display:flex;flex-direction:column;gap:16px}
.rp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.rp-kpi{background:var(--bg-secondary);border-radius:8px;padding:10px 12px;break-inside:avoid}
.rp-kpi .k{font-size:10px;color:var(--text-secondary)}
.rp-kpi .v{font-size:19px;font-weight:700;margin-top:2px}
.rp-kpi .s{font-size:9.5px;color:var(--text-tertiary);margin-top:1px}

/* Anular lo interactivo de los componentes de la UI */
.rp-body button,.rp-body select,.rp-body input,.rp-body textarea{display:none !important}
.rp-body label:has(> input){display:none !important}
.rp-body [style*="max-height"]{max-height:none !important;overflow:visible !important}
.rp-body [style*="overflow-x"]{overflow:visible !important}
.rp-body thead,.rp-body [style*="sticky"]{position:static !important}
.rp-body [style*="cursor"]{cursor:default !important}
.rp-body svg{max-width:100%}
.rp-body [style*="flex: 1 1 140px"]{flex:1 1 118px !important}

/* Cortes de página: nada de cards, barras ni filas partidas, ni títulos huérfanos */
.rp-body table{width:100%;border-collapse:collapse}
.rp-body thead{display:table-header-group}
.rp-body tr{break-inside:avoid;page-break-inside:avoid}
.rp-body h2,.rp-body h3,.rp-body h4{break-after:avoid;page-break-after:avoid}
.rp-body [style*="border-radius"]{break-inside:avoid;page-break-inside:avoid}
.rp-body [style*="border-radius"][style*="overflow:hidden"]{break-inside:auto}
.rp-unida{break-inside:avoid;page-break-inside:avoid}
.rp-evitar{break-inside:avoid;page-break-inside:avoid}
/* Comparativas electorales: 3 cards + tendencias miden más que una hoja a tamaño normal y, al ser
   "unida", saltaba entera a la hoja 2 dejando la 1 con solo el encabezado. Reducida entra completa
   en la primera hoja, debajo del encabezado. */
.rp-sec[data-seccion="comparativas"] .rp-body{zoom:.82}

/* Tablas largas (119 circuitos): filas compactas */
.rp-compacta td{padding-top:2px !important;padding-bottom:2px !important;font-size:10px}
.rp-compacta td span{padding:1px 7px !important;font-size:9px !important}

/* Utilidades usadas por los helpers que devuelven HTML-string (pauta, obras…) */
.text-right{text-align:right}.text-center{text-align:center}
.green{color:#2E7D32}.red{color:#C62828}
.badge{display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:600}

/* Tablas generadas como HTML-string (visitas, pauta, obras…) */
table.rp-tabla{font-size:10.5px}
.rp-tabla th{padding:6px 7px;text-align:left;background:var(--bg-secondary);font-weight:600;font-size:10px;color:var(--text-secondary)}
.rp-tabla td{padding:6px 7px;border-top:1px solid var(--border);vertical-align:top}
.rp-tabla .num{text-align:right;white-space:nowrap}
.rp-tabla .fecha{white-space:nowrap;width:68px}
.rp-tabla .tipo{width:84px}
.rp-tabla .barrio{width:112px;overflow-wrap:anywhere}
.rp-tabla .c{text-align:center}
.rp-tabla .estrecha{width:72px}
.rp-tabla .detalle{width:auto}
.rp-tabla .vig{white-space:nowrap}
`;
  return { pagina, reglas };
}
