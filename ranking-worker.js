import {NamingModel,trainingRows,SMOOTHING_BETA} from './statistical-model.js?v=11';
import {StatisticalSearch} from './statistical-search.js?v=11';
let source=null,search=null,model=null;
self.onmessage=async({data:m})=>{const started=performance.now();try{
  let result;
  if(m.type==='init'){
    if(!source){const response=await fetch('./data/company-patterns-2026-11-03.json');if(!response.ok)throw Error('Не удалось загрузить обучающую выборку');source=await response.json();if(source.companies.length!==1000)throw Error('Неполная обучающая выборка');}
    const rows=m.customWords?.length?m.customWords.map((value,i)=>({value,rank:i+1,weight:1})):trainingRows(source.companies,m.options);
    if(rows.some(r=>!/^[A-Z]{1,12}$/.test(r.value)))throw Error('Обучающие формы: A–Z, длина 1–12');
    const identityWords=source.companies.flatMap(c=>[c.form,...c.words.map(r=>r.value)]).filter(w=>w&&/^[A-Z]{1,12}$/.test(w));
    model=new NamingModel(rows,{vowels:m.config.vowels,beta:SMOOTHING_BETA,identityWords:[...identityWords,...rows.map(r=>r.value)]});
    search=new StatisticalSearch(model,m.config,m.weights);result={meta:model.meta,status:search.status()};
  }else if(m.type==='step'){
    if(!search)throw Error('Сначала запустите подбор');
    if(m.maxFrontier){search.maxFrontier=m.maxFrontier;if(search.heap.items.length<search.maxFrontier)search.halted=false;}
    result=search.advance(m.budget??3000,m.target??500);
  }else if(m.type==='score'){
    if(!model)throw Error('Сначала обучите модель кнопкой подбора');
    const word=String(m.word??'').trim().toUpperCase();if(!/^[A-Z]{1,12}$/.test(word))throw Error('Название: A–Z, длина 1–12');result=model.explain(word,m.weights);
  }else throw Error('Неизвестная операция модели');
  self.postMessage({id:m.id,result,ms:performance.now()-started});
}catch(e){self.postMessage({id:m.id,error:e.message});}};
