// Parser del Parte de Obras diario ("lista de difusión" que circula por WhatsApp).
//
// PORT del artefacto original (parte_obras_fuente.html): la lógica de parseo está copiada
// sin cambios de comportamiento — solo se sacó lo que dependía del DOM y se agregó
// `estadoNorm` a cada item. No se lee desde el link del artefacto (devuelve una página
// vacía, ver docs/planificador.md): el upstream real es el TEXTO diario del parte.
//
// Uso:
//   const parte = parsearParte(textoDelParte);
//   parte.meta  -> { fecha, declarado, puestos }
//   parte.items -> [{ tipo, tipoLabel, estado, estadoNorm, barrio, dir, ck (circuito), circ, conf, link, ... }]
// El Planificador lo consume vía obrasInaugurablesDeCircuito (lib/planificador/obras.js).
import { BARRIO_CIRCUITO } from './parteObrasBarrios';

const ROWS = BARRIO_CIRCUITO;

const SMALL=new Set(['de','del','la','las','los','el','y','e','al','a','en','con']);
const FIX={OMBU:'Ombú',CORDOBA:'Córdoba',VELEZ:'Vélez',RIO:'Río',MARTIN:'Martín',PLATANOS:'Plátanos',AMPLIACION:'Ampliación',JARDIN:'Jardín',JOSE:'José',DIAZ:'Díaz',ESTACION:'Estación',AERONAUTICO:'Aeronáutico',REPUBLICA:'República',PARAISOS:'Paraísos',ITUZAINGO:'Ituzaingó',YAPEYU:'Yapeyú',ARGUELLO:'Argüello','GUIÑAZU':'Guiñazú',SECCION:'Sección',AMERICA:'América',PRIMERA:'Primera',TERCERA:'Tercera',LIBERTADOR:'Libertador',BELGRANO:'Belgrano',CABRERA:'Cabrera',RIVADAVIA:'Rivadavia',NUEVA:'Nueva',MARQUES:'Márquez'.replace('Márquez','Marqués'),CENTENARIO:'Centenario',PAJAS:'Pajas',CAMINO:'Camino',MARIA:'María',AMERICAS:'Américas',MEJIA:'Mejía'};
const cap=w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase();
function tc(s){
  return s.split(/(\s+)/).map((w,i,a)=>{
    if(/^\s+$/.test(w)||!w) return w;
    const core=w.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g,'');
    if(core.length<2 || core!==core.toUpperCase()) return w;
    if(/^\d+[A-Z]$/.test(w)) return w;
    const first=a.slice(0,i).every(x=>/^\s*$/.test(x));
    const lw=w.toLowerCase();
    if(!first&&SMALL.has(lw)) return lw;
    if(w==='GRAL') return 'Gral.';
    if(FIX[w]) return FIX[w];
    if(/^[IVX]+$/.test(w)&&w.length<=4&&!first) return w;
    return w.split('-').map(cap).join('-');
  }).join('');
}
function tca(s){
  s=s.replace(/\s+n\s*(?=\d)/gi,' N° ').replace(/\besq\b\.?/gi,'esq.');
  return s.split(/(\s+)/).map((w,i,a)=>{
    if(!w||/^\s+$/.test(w))return w;
    const first=a.slice(0,i).every(x=>/^\s*$/.test(x));
    const lw=w.toLowerCase();
    if(lw==='esq.')return lw;
    if(w==='N°'||lw==='e/')return w;
    if(!first&&SMALL.has(lw)&&(w===lw||w===w.toUpperCase()))return lw;
    const core=w.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g,'');
    if(core.length<2)return w;
    const fx=FIX[core.toUpperCase()];
    if(fx&&(core===core.toUpperCase()||core===core.toLowerCase()||core===cap(core)))return w.replace(core,fx);
    if(/^[A-ZÁÉÍÓÚÑ]{2,}[a-záéíóúñ]+$/.test(core))return w.replace(core,cap(core));
    if(core===core.toUpperCase()){if(/^[IVX]+$/.test(core)&&core.length<=4&&!first)return w;return w.split('-').map(cap).join('-')}
    if(core===core.toLowerCase())return w.split('-').map(cap).join('-');
    return w;
  }).join('');
}
const sentence=s=>{s=s.trim().toLowerCase();return s.charAt(0).toUpperCase()+s.slice(1)};
function norm(s){
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
    .replace(/(\d)\s*(?:RA|ERA|DA|A)?\s*[ªº°]/g,'$1A')
    .replace(/(\d)(RA|ERA|DA)\b/g,'$1A')
    .replace(/\bGRAL\b/g,'GENERAL').replace(/AZALAIS/g,'AZALAIZ')
    .replace(/[^A-Z0-9]+/g,' ').trim();
}
const codeOrder=c=>{const m=/^(\d+)([A-Z]*)$/.exec(c);return m?[+m[1],m[2]]:[999,c]};
const cmpCode=(a,b)=>{const x=codeOrder(a),y=codeOrder(b);return x[0]-y[0]||x[1].localeCompare(y[1])};

/* ---------- barrio -> circuito ---------- */
const MAP=new Map();
for(const [b,c,n] of ROWS){const k=norm(b);const cur=MAP.get(k);if(!cur||(!cur.n&&n))MAP.set(k,{code:c,n})}
const byCode=new Map();for(const [b,c,n] of ROWS)if(n&&!byCode.has(c))byCode.set(c,n);
const ncode=c=>{const m=/^0*(\d+)([A-Za-z]?)$/.exec(c.trim());return m?m[1]+m[2].toUpperCase():c.toUpperCase()};
const ALIAS={'CIUDAD JUAN PABLO II':'CIUDAD DE JUAN PABLO II'};
const REVISAR=new Set(['LA FLORESTA SUR','LA FLORESTA NORTE','POLICIAL']);
function lookup(barrio){
  let k=norm(barrio.replace(/^(B°|B\.|BARRIO)\s*/i,'')).replace(/\s+ETAPA\s+[IVX\d]+$/,'');
  let hit=MAP.get(k),how='ok';
  if(!hit&&ALIAS[k]){k=ALIAS[k];hit=MAP.get(k)}
  if(!hit)for(const p of['LA ','EL ','LOS ','LAS ']){if(MAP.has(p+k)){k=p+k;hit=MAP.get(k);break}}
  if(!hit){const k2=k.replace(/^(EL|LA|LOS|LAS)\s+/,'');if(k2!==k&&MAP.has(k2)){k=k2;hit=MAP.get(k);how='revisar'}}
  if(!hit) return {circ:null,conf:'none'};
  if(REVISAR.has(k)) how='revisar';
  return {circ:{code:hit.code,name:hit.n?tc(hit.n):''},conf:how,matched:k};
}

/* ---------- parser del mensaje ---------- */
const TIPOS={
  bacheo:{short:'Bacheo asfalto',cls:'t-bacheo'},rehab:{short:'Rehab. asfalto',cls:'t-rehab'},hormigon:{short:'Hormigón',cls:'t-hormigon'},
  pav:{short:'Pavimentación',cls:'t-pav'},frio:{short:'Bacheo en frío',cls:'t-frio'},plaza:{short:'Plazas',cls:'t-plaza'},rampa:{short:'Rampas',cls:'t-rampa'},mant:{short:'Mant. de calles',cls:'t-mant'}};
function tipoKey(t){const n=norm(t);
  if(n.includes('RAMPA'))return'rampa';if(n.includes('PLAZA'))return'plaza';if(n.includes('MANTENIM'))return'mant';if(n.includes('HORMIG'))return'hormigon';
  if(n.includes('BACHEO')&&n.includes('FRIO'))return'frio';if(n.includes('REHABILIT')&&n.includes('ASFALT'))return'rehab';if(n.includes('BACHEO')&&n.includes('ASFALT'))return'bacheo';
  if(n.includes('PAVIMENT'))return'pav';return'o:'+n}
export function parsearParte(raw){raw=raw.replace(/BARIRIO/gi,"BARRIO").replace(/[ \t]{4,}(?=(?:PAVIMENTACI|PLAZAS EN|BACHEO|REHABILITACI|MANTENIMIENTO))/g,"\n");
  const lines=raw.replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
  const meta={fecha:'',declarado:null,puestos:null};let tipo=null,estado=null,ctx=null;const items=[];const tipoSeen=[];
  for(let l of lines){
    let inl=null;{const mu=/^(.+?)\s*(https?:\/\/\S+)\s*$/.exec(l);if(mu){l=mu[1];inl=mu[2]}}
    if(/^https?:\/\/\S+$/i.test(l)){if(items.length)items[items.length-1].link=l;continue}
    if(/^(?:[*•\-–]\s+|\d{1,3}[.)]\s*)/.test(l)){
      if(!tipo)continue;
      let t=l.replace(/^(?:[*•\-–]\s+|\d{1,3}[.)]\s*)/,'').trim(),barrio='',dir='',nota='',src=null;
      t=t.replace(/\s(\d{1,3})-([A-Za-z])\s*$/,' -$1$2');
      t=t.replace(/^\d+\s*[´'’`]\s*\/\s*(?:\d+\s+)?/,'');
      t=t.replace(/\s*-{2,}\s*(?=\d)/,' -');
      const mc=/\s*-\s*(0*\d{1,3}[A-Za-z]?)\s*$/.exec(t);
      if(mc){src=ncode(mc[1]);t=t.slice(0,mc.index).trim()}
      else if(!ctx&&!/\bBARRIO\b/i.test(t)&&!t.includes(':')){const m2=/\s(\d{1,3}[A-Za-z])$/.exec(t);if(m2){src=ncode(m2[1]);t=t.slice(0,m2.index).trim()}}
      const m=/BARRIO\s*:\s*(.*)$/i.exec(t)||/\sBARRIO\s+(.*)$/i.exec(t);
      if(m){barrio=m[1].trim();dir=t.slice(0,m.index).trim()}
      else if(t.includes(':')){const i=t.lastIndexOf(':');dir=t.slice(0,i).trim();barrio=t.slice(i+1).trim()}
      else if(ctx&&tipoKey(tipo)!=='mant'){dir=t;barrio=ctx.barrio;if(!src)src=ctx.code}
      else if(tipoKey(tipo)==='rampa'){dir=t;barrio=''}
      else{barrio=t;dir=''}
      let cnt=null;{const mx=/\s+X\s*(\d+)\s*$/i;let q;if((q=mx.exec(barrio))){cnt=+q[1];barrio=barrio.slice(0,q.index).trim()}else if((q=mx.exec(dir))){cnt=+q[1];dir=dir.slice(0,q.index).trim()}}
      const mi=/\s+(\d+\s*(?:ra|da|era|ª|º|°)?\s*intervenci[oó]n)$/i.exec(barrio);
      if(mi){nota=mi[1];barrio=barrio.slice(0,mi.index).trim()}
      if(cnt)nota=cnt+(cnt===1?' rampa':' rampas');
      barrio=barrio.replace(/^(?:B[°.]\s*|B\s+|BARRIO\s+)/i,'').replace(/INDUSTIAL/gi,'Industrial');
      if(!src){const m3=/\s(\d{1,2}[A-Za-z])$/.exec(barrio);if(m3){src=ncode(m3[1]);barrio=barrio.slice(0,m3.index).trim()}}
      const tk=tipoKey(tipo);
      const lk=lookup(barrio);
      items.push({tipo:tk,tipoLabel:tk in TIPOS?TIPOS[tk].short:tipo,tipoLong:tipo,estado:estado||'En ejecución',estadoInf:!estado,
        dirRaw:dir,barrio:tca(barrio),bkey:norm(barrio),nota,src,lk,idx:items.length,link:inl});
      continue;
    }
    const h=l.replace(/^[*_~\s]+|[*_~\s]+$/g,'');
    let m;
    if((m=/^BARRIO\s+([^:]+?)\s*-\s*(0*\d{1,3}[A-Za-z]?)$/i.exec(h))){ctx={barrio:m[1].trim(),code:ncode(m[2])};continue}
    if((m=/^PUESTOS DE TRABAJOS?\s+DIRECTOS?[^\d]*(\d[\d.,]*)/i.exec(h))){meta.puestos=+m[1].replace(/[.,]/g,'');continue}
    if((m=/^LISTA DE DIFUSI[OÓ]N\s*(.*)$/i.exec(h))){meta.fecha=m[1];continue}
    if((m=/^OBRAS EN EJECUCI[OÓ]N[\s:]*(?:HOY[\s:]*)?(\d+)?/i.exec(h))){meta.declarado=m[1]?+m[1]:null;continue}
    if(/^(EN EJECUCI[OÓ]N|EN OBRA|FINALIZADAS?|TERMINADAS?|PR[OÓ]XIMAS?|A INICIAR|EN LICITACI[OÓ]N|LICITACI[OÓ]N|PARALIZADAS?)\s*:?$/i.test(h)){estado=sentence(h.replace(/:$/,''));if(norm(estado)==='EN EJECUCION')estado='En ejecución';continue}
    if(/\s+EN EJECUCI[OÓ]N$/i.test(h)){tipo=sentence(h.replace(/\s+EN EJECUCI[OÓ]N$/i,''));estado='En ejecución'}
    else{tipo=sentence(h);estado=null}
    ctx=null;
    const k=tipoKey(tipo);if(!tipoSeen.includes(k))tipoSeen.push(k);
  }
  for(const it of items)if(!it.barrio){const o=items.find(x=>x.barrio&&x.src&&x.src===it.src);if(o){it.barrio=o.barrio;it.bkey=o.bkey}}
  const codeOf=new Map();for(const it of items){if(it.src&&!codeOf.has(it.bkey))codeOf.set(it.bkey,it.src)}
  for(const it of items){
    it.dir=it.dirRaw?tca(it.dirRaw):'';it.entre='';it.calle=it.dir;it.cross1='';
    let m=/^(.*?)\s+(?:e\/|entre)\s*(.*)$/i.exec(it.dirRaw);
    if(!m)m=/^(.*?)\s+e\s+(.+\s+y\s+.+)$/.exec(it.dirRaw);
    if(m){it.calle=tca(m[1]);it.entre=m[2]?'entre '+tca(m[2]):'';it.cross1=tca(m[2].split(/\s+y\s+/i)[0])}
    let code=it.src,how='ok';
    if(!code&&codeOf.has(it.bkey)){code=codeOf.get(it.bkey);how='inferido'}
    if(code){it.circ={code,name:byCode.has(code)?tc(byCode.get(code)):''};it.conf=how}
    else{it.circ=it.lk.circ;it.conf=it.lk.conf}
    it.ck=it.circ?it.circ.code:'?';
    it.estadoNorm=norm(it.estado);
  }
  // el barrio se muestra con la primera grafía que aparece
  const first=new Map();for(const it of items){if(!first.has(it.bkey))first.set(it.bkey,it.barrio);it.barrio=first.get(it.bkey)}
  return{meta,items,tipoOrder:tipoSeen};
}


