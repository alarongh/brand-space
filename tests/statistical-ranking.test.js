import test from 'node:test';
import assert from 'node:assert/strict';
import {NamingModel,trainingRows,diversify,similarity,normalizeWeights} from '../statistical-model.js';
import {StatisticalSearch} from '../statistical-search.js';
import {Catalogue} from '../engine.js';
const rows=['ABBA','BEAR','CAB','CABA','BEAC','ABCE','EBC','ACE'].map((value,rank)=>({value,rank:rank+1,weight:1}));
const model=new NamingModel(rows,{vowels:'AE'});
function exhaust(search){for(let i=0;i<10000;i++){const r=search.advance(100,10000);if(r.exhausted||r.halted)return r;}throw Error('Search failed to finish');}
test('bidirectional additive factors equal independently evaluated forward and reversed chains',()=>{
 for(const word of ['A','AB','ABA','ABCE','BACEAB']){const chainCost=(chain,s)=>{let ctx='^^',cost=0;for(const ch of s+'$'){cost+=-Math.log(chain.probability(ch,ctx));ctx=(ctx+ch).slice(-2);}return cost;};const expected=(chainCost(model.forward,word)+chainCost(model.reverse,[...word].reverse().join('')))/(2*(word.length+1));assert(Math.abs(model.explain(word).components.language.cost-expected)<1e-12);}
});
test('branch-and-bound is an exact complete ranking, including soft penalties and hard rules',()=>{
 const configs=[{allowed:'ABC',lengths:[1,2,3,4]},{allowed:'ABCE',lengths:[2,3,4],maxOccurrences:2,minRepeatGap:1},{allowed:'ABCE',lengths:[3,4],letterMasks:['A??','?B??'],required:['A'],suffixes:['A','B']},{allowed:'ABCE',lengths:[3,4],patterns:['VCV','VCCV'],positionRules:[{position:-1,allowed:'AE'}]},{allowed:'ABC',lengths:[2,3],prefix:'AB',suffix:'C'},{allowed:'ABC',lengths:[2,3],letterRules:[{letter:'A',min:2,max:2}]},{allowed:'ABC',lengths:[2],prefix:'ABC'}];
 for(const config of configs){const c=new Catalogue(config),expected=c.page(0,5000).rows.map(r=>model.explain(r.name)),search=new StatisticalSearch(model,config),actual=exhaust(search).rows;assert.equal(actual.length,expected.length);assert.deepEqual(new Set(actual.map(r=>r.name)),new Set(expected.map(r=>r.name)));const sorted=expected.map(r=>r.cost).sort((a,b)=>a-b);for(let i=0;i<sorted.length;i++)assert(Math.abs(actual[i].cost-sorted[i])<1e-9);assert.equal(new Set(actual.map(r=>r.name)).size,actual.length);}
});
test('every suffix bound is admissible and ranked results resume deterministically',()=>{
 const search=new StatisticalSearch(model,{allowed:'ABC',lengths:[3]});let first=search.advance(4,2);while(first.rows.length<2)first=search.advance(4,2);const prefix=first.rows.map(r=>r.name);const final=exhaust(search);assert.deepEqual(final.rows.slice(0,2).map(r=>r.name),prefix);const again=exhaust(new StatisticalSearch(model,{allowed:'ABC',lengths:[3]}));assert.deepEqual(final.rows.map(r=>r.name),again.rows.map(r=>r.name));
 for(const word of ['AAA','ABC','CBA']){let ctx='^^';for(let d=0;d<3;d++){let actual=0,cx=ctx;for(let j=d;j<3;j++){actual+=model.step(cx,j,word[j],3,search.weights);cx=(cx+word[j]).slice(-2);}assert(search.future(3,d,ctx)<=actual+1e-12);ctx=(ctx+word[d]).slice(-2);}}
});
test('soft penalties change scores without excluding any candidates',()=>{
 const config={allowed:'ABCE',lengths:[4]},a=exhaust(new StatisticalSearch(model,config,{novelty:0})),b=exhaust(new StatisticalSearch(model,config,{novelty:10}));assert.equal(a.rows.length,b.rows.length);assert(b.rows.some(r=>r.name==='ABBA'));assert(model.explain('ABBA',{novelty:10}).cost>model.explain('ABBA',{novelty:0}).cost);assert.equal(model.explain('ABBA').sourceExact,true);assert.equal(model.explain('ZZZZZZZZZZZZ').editDistance,null);for(const w of [{language:-1},{novelty:Infinity},Object.fromEntries(Object.keys(normalizeWeights()).map(k=>[k,0]))])assert.throws(()=>normalizeWeights(w));
});
test('diversity is deterministic, reduces clones, and never invents or drops pool records when all are requested',()=>{
 const pool=['DARGEN','DARGON','DARMEN','DARMON','SANDEX','MINTURE','PROGEN','FORESTRA'].map((name,i)=>({name,cost:i/10,score:90-i}));const pure=diversify(pool,4,0),mixed=diversify(pool,4,1);const mean=xs=>{let sum=0,k=0;for(let i=0;i<xs.length;i++)for(let j=0;j<i;j++){sum+=similarity(xs[i].name,xs[j].name);k++;}return sum/k;};assert(mean(mixed)<mean(pure));assert.deepEqual(diversify(pool,4,1),mixed);assert.deepEqual(new Set(diversify(pool,pool.length,1).map(r=>r.name)),new Set(pool.map(r=>r.name)));
});
test('a memory stop is explicit and can resume without losing any branches',()=>{const config={allowed:'ABCE',lengths:[3,4]},s=new StatisticalSearch(model,config,{},{maxFrontier:4});const r=s.advance(100,100);assert(r.halted);assert(!r.exhausted);assert(r.frontier>=4);s.maxFrontier=10000;s.halted=false;const resumed=exhaust(s);assert.deepEqual(resumed.rows.map(r=>r.name),exhaust(new StatisticalSearch(model,config)).rows.map(r=>r.name));});
test('each company has unit total training weight even in token mode',()=>{const c=[{rank:1,name:'A B',word_count:2,form:'AB',uppercase:false,words:[{value:'A',uppercase:false},{value:'B',uppercase:false}]},{rank:2,name:'C',word_count:1,form:'C',uppercase:false,words:[{value:'C',uppercase:false}]}];const r=trainingRows(c,{mode:'tokens',typography:'mixed'});assert.equal(r.filter(x=>x.rank===1).reduce((s,x)=>s+x.weight,0),1);});
