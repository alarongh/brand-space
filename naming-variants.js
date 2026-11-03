import {observations} from './company-analysis.js?v=6';
import {repetitionFeatures} from './repeat-rules.js?v=6';

// Every frequency is a document frequency, including joint letter anchors.
// No independent-position probabilities are multiplied to invent support.
export function namingVariants(companies,options,mask,{anchors=1,minSupport=2}={}){
  if(!Number.isInteger(anchors)||anchors<1||anchors>2)throw Error('Фиксированных позиций: 1 или 2');
  if(!Number.isInteger(minSupport)||minSupport<1)throw Error('Минимум компаний: положительное целое');
  const vowels=options.vowels??'AEIOU';
  const rows=observations(companies,options).filter(r=>[...r.value].map(x=>vowels.includes(x)?'V':'C').join('')===mask);
  const denominator=new Set(rows.map(r=>r.rank)).size,pool=new Map();
  const stats=Object.fromEntries(['maxOccurrences','distinct','minRepeatGap','maxRepeatGap'].map(k=>[k,new Map()]));
  const positionLetters=Array.from({length:mask.length},()=>new Map()),cc=new Map(),vv=new Map();
  const add=(map,key,row)=>{if(!map.has(key))map.set(key,new Set());map.get(key).add(row.rank);};
  for(const row of rows){
    const w=row.value,f=repetitionFeatures(w);
    for(const key of Object.keys(stats))add(stats[key],f[key],row);
    for(let i=0;i<w.length;i++)add(positionLetters[i],w[i],row);
    for(let i=1;i<w.length;i++){const pair=w.slice(i-1,i+1);if(mask.slice(i-1,i+1)==='CC')add(cc,pair,row);if(mask.slice(i-1,i+1)==='VV')add(vv,pair,row);}
    for(let i=0;i<w.length;i++)for(let j=anchors===1?i:i+1;j<(anchors===1?i+1:w.length);j++){
      const chars=Array(w.length).fill('?');chars[i]=w[i];chars[j]=w[j];const template=chars.join('');
      if(!pool.has(template))pool.set(template,{template,ids:new Set(),examples:[]});const item=pool.get(template);item.ids.add(row.rank);
      if(item.examples.length<5&&!item.examples.some(e=>e.rank===row.rank))item.examples.push({rank:row.rank,name:row.name,form:w});
    }
  }
  const table=map=>[...map].map(([value,ids])=>({value,companies:ids.size,share:denominator?ids.size/denominator:0})).sort((a,b)=>b.companies-a.companies||String(a.value).localeCompare(String(b.value),'en'));
  return {mask,denominator,observations:rows.length,positions:positionLetters.map(table),ccPairs:table(cc),vvPairs:table(vv),stats:Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,table(v)])),variants:[...pool.values()].filter(r=>r.ids.size>=minSupport).map(r=>({template:r.template,companies:r.ids.size,share:r.ids.size/denominator,examples:r.examples})).sort((a,b)=>b.companies-a.companies||a.template.localeCompare(b.template,'en'))};
}
