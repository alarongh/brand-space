// Frequencies are distinct-company counts, never market-cap weighted scores.
export function observations(companies,{mode='full',typography='all',length=null}={}) {
  const result=[];
  for(const c of companies){
    if(mode==='single'&&c.word_count!==1)continue;
    const candidates=mode==='tokens'?c.words:[{value:c.form,uppercase:c.uppercase}];
    const seen=new Set();
    for(const t of candidates){
      const v=t.value;if(!v||v.length<1||v.length>12||length&&v.length!==Number(length))continue;
      if(typography==='mixed'&&t.uppercase||typography==='upper'&&!t.uppercase)continue;
      if(seen.has(v))continue;seen.add(v);result.push({rank:c.rank,name:c.name,value:v});
    }
  }return result;
}
export function analyzeCompanies(companies,options={}) {
  const {vowels='AEIOU'}=options,rows=observations(companies,options);
  const kinds=['masks','lengths','prefix2','prefix3','suffix2','suffix3','bigram','trigram','words'];
  const pools=Object.fromEntries(kinds.map(k=>[k,new Map()])),flags={};
  const add=(kind,value,row)=>{let item=pools[kind].get(value);if(!item){item={value,ids:new Set(),examples:[]};pools[kind].set(value,item);}item.ids.add(row.rank);if(item.examples.length<5&&!item.examples.some(x=>x.rank===row.rank))item.examples.push({name:row.name,form:row.value,rank:row.rank});};
  for(const row of rows){
    const v=row.value,mask=[...v].map(ch=>vowels.includes(ch)?'V':'C').join('');
    add('masks',mask,row);add('lengths',v.length,row);add('words',v,row);
    for(const size of [2,3])if(v.length>=size){add('prefix'+size,v.slice(0,size),row);add('suffix'+size,v.slice(-size),row);for(let i=0;i<=v.length-size;i++)add(size===2?'bigram':'trigram',v.slice(i,i+size),row);}
    for(const [key,condition] of Object.entries({three_consonants:mask.includes('CCC'),three_vowels:mask.includes('VVV'),double_letters:/(.)\1/.test(v),inner_y:v.slice(0,-1).includes('Y'),starts_vowel:mask.startsWith('V'),ends_vowel:mask.endsWith('V')}))if(condition){flags[key]??=new Set();flags[key].add(row.rank);}
  }
  const denominator=new Set(rows.map(r=>r.rank)).size;
  const tables=Object.fromEntries(kinds.map(k=>[k,[...pools[k].values()].map(item=>({value:item.value,companies:item.ids.size,share:denominator?item.ids.size/denominator:0,examples:item.examples})).sort((a,b)=>b.companies-a.companies||String(a.value).localeCompare(String(b.value),'en'))]));
  return {denominator,observations:rows.length,tables,flags:Object.fromEntries(Object.entries(flags).map(([k,v])=>[k,v.size]))};
}
