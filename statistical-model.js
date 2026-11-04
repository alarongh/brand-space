import {observations} from './company-analysis.js?v=11';
import {repetitionFeatures} from './repeat-rules.js?v=11';

export const MODEL_VERSION='company-language-1';
export const SMOOTHING_BETA=50;
export const WEIGHTS={language:3,position:0.7,structure:1,repetition:0.5,length:0.3,novelty:2.5};
export const COMPONENT_LABELS={language:'Буквенные переходы',position:'Позиции букв',structure:'C/V-структура',repetition:'Повторы',length:'Длина',novelty:'Отличие от источников'};
const ABC='ABCDEFGHIJKLMNOPQRSTUVWXYZ',SYMBOLS=ABC+'$';
export const orderWords=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
export function normalizeWeights(raw={}){const w={...WEIGHTS,...raw};for(const k of Object.keys(WEIGHTS)){w[k]=Number(w[k]);if(!Number.isFinite(w[k])||w[k]<0||w[k]>10)throw Error('Вес «'+COMPONENT_LABELS[k]+'»: число 0–10');}if(!Object.values(w).some(x=>x>0))throw Error('Включите хотя бы один вес оценки');return w;}
export function editDistance(a,b){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+Number(a[i-1]!==b[j-1]));row=next;}return row[b.length];}

// BK tree performs an exact metric query within radius 2. Larger distances have
// zero penalty; they are deliberately NOT reported as an exact nearest name.
class Neighbours{
  constructor(words){this.root=null;for(const word of [...new Set(words)].sort()){const node={word,children:new Map()};if(!this.root){this.root=node;continue;}let at=this.root;while(true){const d=editDistance(word,at.word);if(!at.children.has(d)){at.children.set(d,node);break;}at=at.children.get(d);}}}
  query(word){let best=3,closest=null;const visit=node=>{const d=editDistance(word,node.word);if(d<best||d===best&&closest!==null&&node.word<closest){best=d;closest=node.word;}const radius=Math.min(2,best);for(const [edge,child] of node.children)if(edge>=d-radius&&edge<=d+radius)visit(child);};if(this.root)visit(this.root);return best<=2?{word:closest,distance:best}:{word:null,distance:null};}
}
class Chain{
  constructor(rows,beta){this.beta=beta;this.uni=new Float64Array(27);this.total=0;this.contexts=new Map();for(const {value,weight=1} of rows){let ctx='^^';for(const ch of value+'$'){const i=SYMBOLS.indexOf(ch);this.uni[i]+=weight;this.total+=weight;for(const key of [ctx.slice(-1),ctx]){if(!this.contexts.has(key))this.contexts.set(key,{total:0,counts:new Float64Array(27)});const r=this.contexts.get(key);r.counts[i]+=weight;r.total+=weight;}ctx=(ctx+ch).slice(-2);}}this.cache=new Map();}
  probability(ch,ctx='^^'){const i=SYMBOLS.indexOf(ch);let p=(this.uni[i]+0.2)/(this.total+27*0.2);for(const key of [ctx.slice(-1),ctx.slice(-2)]){const row=this.contexts.get(key);if(row)p=(row.counts[i]+this.beta*p)/(row.total+this.beta);}return p;}
  cost(ch,ctx='^^'){const key=ctx+ch;if(!this.cache.has(key))this.cache.set(key,-Math.log(this.probability(ch,ctx)));return this.cache.get(key);}
}
const add=(map,key,weight)=>map.set(key,(map.get(key)||0)+weight);
function attributes(word,vowels){const f=repetitionFeatures(word);return {mask:[...word].map(ch=>vowels.includes(ch)?'V':'C').join(''),...f};}
export function trainingRows(companies,options={mode:'single',typography:'mixed'}){
  const rows=observations(companies,options),counts=new Map();for(const r of rows)add(counts,r.rank,1);
  return rows.map(r=>({...r,weight:1/counts.get(r.rank)}));
}
export class NamingModel{
  constructor(rows,{vowels='AEIOU',beta=SMOOTHING_BETA,identityWords=null}={}){
    if(!rows.length)throw Error('Обучающая группа пуста');
    this.vowels=vowels;this.beta=beta;this.rows=rows;this.forward=new Chain(rows,beta);this.reverse=new Chain(rows.map(r=>({...r,value:[...r.value].reverse().join('')})),beta);
    this.total=rows.reduce((s,r)=>s+(r.weight??1),0);this.lengths=new Map();this.masks=Array.from({length:13},()=>new Map());this.repeats=Array.from({length:13},()=>Object.fromEntries(['maxOccurrences','distinct','minRepeatGap','maxRepeatGap'].map(k=>[k,new Map()])));
    this.positions=Array.from({length:13},()=>[]);this.globalPositions=new Map();this.identityWords=[...new Set(identityWords??rows.map(r=>r.value))].sort();this.neighbours=new Neighbours(this.identityWords);this.nearCache=new Map();
    for(const row of rows){const {value:w,weight=1}=row,n=w.length,f=attributes(w,vowels);add(this.lengths,n,weight);add(this.masks[n],f.mask,weight);for(const key of Object.keys(this.repeats[n]))add(this.repeats[n][key],f[key],weight);
      for(let d=0;d<n;d++){this.positions[n][d]??=new Map();add(this.positions[n][d],w[d],weight);const bucket=Math.min(4,Math.floor(d/Math.max(1,n-1)*4));if(!this.globalPositions.has(bucket))this.globalPositions.set(bucket,new Map());add(this.globalPositions.get(bucket),w[d],weight);}
    }
    this.globalChars=new Map([...ABC].map((ch,i)=>[ch,this.forward.uni[i]]));this.globalCharTotal=[...this.globalChars.values()].reduce((a,b)=>a+b,0);
    this.maskPrefixMax=this.masks.map(map=>{const result=new Map();for(const [mask,count] of map)for(let d=0;d<=mask.length;d++){const key=mask.slice(0,d);result.set(key,Math.max(result.get(key)||0,count));}return result;});this.boundCache=new Map();
    this.meta={version:MODEL_VERSION,observations:rows.length,companies:new Set(rows.map(r=>r.rank)).size,forms:new Set(rows.map(r=>r.value)).size,beta,vowels};
  }
  // All language/position terms are additive and nonnegative. Reverse trigrams
  // become known when the third character of the original window is appended.
  step(ctx,depth,ch,n,w){let cost=0;const next=(ctx+ch).slice(-2);
    if(w.language){let lm=this.forward.cost(ch,ctx);if(depth===n-1)lm+=this.forward.cost('$',next);
      if(depth>=2)lm+=this.reverse.cost(ctx[0],ch+ctx[1]);
      if(depth===n-1){lm+=this.reverse.cost(ch,'^^');if(n>=2)lm+=this.reverse.cost(ctx[1],'^'+ch);}
      if(depth===1)lm+=this.reverse.cost('$',ch+ctx[1]);else if(n===1)lm+=this.reverse.cost('$','^'+ch);
      cost+=w.language*lm/(2*(n+1));
    }
    if(w.position){const bucket=Math.min(4,Math.floor(depth/Math.max(1,n-1)*4)),global=this.globalPositions.get(bucket),globalTotal=global?[...global.values()].reduce((a,b)=>a+b,0):0;
      const uni=((this.globalChars.get(ch)||0)+0.2)/(this.globalCharTotal+26*0.2),backoff=((global?.get(ch)||0)+10*uni)/(globalTotal+10),position=this.positions[n][depth],p=((position?.get(ch)||0)+10*backoff)/((this.lengths.get(n)||0)+10);cost+=w.position*-Math.log(p)/n;
    }return cost;
  }
  structural(mask,n){return -Math.log(((this.masks[n].get(mask)||0)+0.5)/((this.lengths.get(n)||0)+0.5*2**n))/n;}
  repetition(f,n){let cost=0;for(const key of Object.keys(this.repeats[n])){const bins=key==='maxOccurrences'||key==='distinct'?n:Math.max(1,n);cost+=-Math.log(((this.repeats[n][key].get(f[key])||0)+0.5)/((this.lengths.get(n)||0)+0.5*bins))/4;}return cost;}
  lengthCost(n){return -Math.log(((this.lengths.get(n)||0)+0.5)/(this.total+6));}
  minima(n,w,prefix=''){
    const total=this.lengths.get(n)||0,f=prefix?attributes(prefix,this.vowels):{mask:'',maxOccurrences:0,distinct:0,minRepeatGap:null,maxRepeatGap:null},remaining=n-prefix.length;
    const signature=[n,f.mask,f.maxOccurrences,f.distinct,f.minRepeatGap,f.maxRepeatGap].join(':');let costs=this.boundCache.get(signature);
    if(!costs){const maxMask=this.maskPrefixMax[n].get(f.mask)||0;let repetition=0;
      for(const key of Object.keys(this.repeats[n])){let max=0;for(const [v,count] of this.repeats[n][key]){const possible=key==='maxOccurrences'?v>=Math.max(1,f.maxOccurrences)&&v<=f.maxOccurrences+remaining:key==='distinct'?v>=Math.max(1,f.distinct)&&v<=f.distinct+remaining:key==='minRepeatGap'?f.minRepeatGap===null||v!==null&&v<=f.minRepeatGap:f.maxRepeatGap===null||v!==null&&v>=f.maxRepeatGap;if(possible)max=Math.max(max,count);}repetition+=-Math.log((max+0.5)/(total+0.5*n))/4;}
      costs={structure:-Math.log((maxMask+0.5)/(total+0.5*2**n))/n,repetition,length:this.lengthCost(n)};this.boundCache.set(signature,costs);
    }return w.structure*costs.structure+w.repetition*costs.repetition+w.length*costs.length;
  }
  near(word){if(!this.nearCache.has(word)){const close=this.neighbours.query(word);this.nearCache.set(word,{...close,cost:close.distance===null?0:((3-close.distance)/3)**2});}return this.nearCache.get(word);}
  finish(word,w){const n=word.length,f=attributes(word,this.vowels);return w.structure*this.structural(f.mask,n)+w.repetition*this.repetition(f,n)+w.length*this.lengthCost(n)+(w.novelty?w.novelty*this.near(word).cost:0);}
  explain(word,rawWeights={}){const w=normalizeWeights(rawWeights),n=word.length,f=attributes(word,this.vowels);let ctx='^^',language=0,position=0;
    for(let d=0;d<n;d++){language+=this.step(ctx,d,word[d],n,{language:1,position:0});position+=this.step(ctx,d,word[d],n,{language:0,position:1});ctx=(ctx+word[d]).slice(-2);}
    const near=this.near(word),costs={language,position,structure:this.structural(f.mask,n),repetition:this.repetition(f,n),length:this.lengthCost(n),novelty:near.cost},cost=Object.entries(costs).reduce((s,[k,v])=>s+w[k]*v,0),sum=Object.values(w).reduce((a,b)=>a+b,0);
    return {name:word,cost,score:100*Math.exp(-cost/(sum||1)),components:Object.fromEntries(Object.entries(costs).map(([k,v])=>[k,{label:COMPONENT_LABELS[k],cost:v,weight:w[k],contribution:w[k]*v,score:100*Math.exp(-v)}])),nearest:near.word,editDistance:near.distance,sourceExact:near.distance===0,mask:f.mask};
  }
}

export function similarity(a,b){const edit=1-editDistance(a,b)/Math.max(a.length,b.length),grams=s=>new Set(Array.from({length:Math.max(0,s.length-2)},(_,i)=>s.slice(i,i+3))),ga=grams(a),gb=grams(b);let common=0;for(const g of ga)if(gb.has(g))common++;const dice=ga.size+gb.size?2*common/(ga.size+gb.size):0;return 0.65*edit+0.2*dice+0.075*Number(a.slice(0,2)===b.slice(0,2))+0.075*Number(a.slice(-2)===b.slice(-2));}
export function diversify(rows,count=40,strength=0.65){if(!Number.isFinite(strength)||strength<0||strength>1)throw Error('Разнообразие: 0–1');const pool=rows.map(r=>({...r,redundancy:0})),selected=[],prefixes=new Map(),suffixes=new Map(),masks=new Map();
  const family=r=>(prefixes.get(r.name.slice(0,2))||0)+(suffixes.get(r.name.slice(-2))||0)+0.25*(masks.get(r.mask)||0);
  const utility=r=>r.score-strength*(60*r.redundancy+4*family(r));
  while(pool.length&&selected.length<count){let best=0;for(let i=1;i<pool.length;i++){if(utility(pool[i])>utility(pool[best])+1e-10||Math.abs(utility(pool[i])-utility(pool[best]))<=1e-10&&(pool[i].cost<pool[best].cost||pool[i].cost===pool[best].cost&&orderWords(pool[i].name,pool[best].name)<0))best=i;}
    const row=pool.splice(best,1)[0];row.selectionScore=utility(row);selected.push(row);add(prefixes,row.name.slice(0,2),1);add(suffixes,row.name.slice(-2),1);add(masks,row.mask,1);for(const r of pool)r.redundancy=Math.max(r.redundancy,similarity(r.name,row.name));
  }return selected;
}
