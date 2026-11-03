import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {namingVariants} from '../naming-variants.js';
import {Catalogue,features} from '../engine.js';
const companies=JSON.parse(readFileSync(new URL('../data/company-patterns-2026-11-03.json',import.meta.url))).companies;
const group={mode:'single',typography:'mixed',vowels:'AEIOU'};
const mask='CVCCVC';
const reference=companies.filter(c=>c.word_count===1&&!c.uppercase&&c.form&&c.form.length===mask.length&&[...c.form].map(ch=>group.vowels.includes(ch)?'V':'C').join('')===mask);
test('empirical joint letter masks and repeat distributions match direct source rows',()=>{
 for(const anchors of [1,2]){
  const result=namingVariants(companies,group,mask,{anchors,minSupport:1});assert.equal(result.denominator,19);
  const expected=new Map();for(const row of reference)for(let i=0;i<6;i++)for(let j=anchors===1?i:i+1;j<(anchors===1?i+1:6);j++){const t=Array(6).fill('?');t[i]=row.form[i];t[j]=row.form[j];const template=t.join('');if(!expected.has(template))expected.set(template,new Set());expected.get(template).add(row.rank);}
  assert.equal(result.variants.length,expected.size);
  for(const row of result.variants){assert.equal(row.companies,expected.get(row.template).size);assert.equal(row.share,row.companies/19);assert.equal([...row.template].filter(x=>x!=='?').length,anchors);for(const e of row.examples)assert([...row.template].every((ch,i)=>ch==='?'||ch===e.form[i]));}
  for(const [key,table] of Object.entries(result.stats)){const count=new Map();for(const c of reference){const f=features(c.form);count.set(f[key],(count.get(f[key])||0)+1);}assert.equal(table.reduce((s,r)=>s+r.companies,0),19);for(const r of table)assert.equal(r.companies,count.get(r.value));}
  const filtered=namingVariants(companies,group,mask,{anchors,minSupport:3});assert.deepEqual(filtered.variants,result.variants.filter(r=>r.companies>=3));
 }
});
test('every observed name remains in its transferred C/V and literal family, without a shortlist cap',()=>{
 const result=namingVariants(companies,group,mask,{anchors:2,minSupport:2});
 for(const row of result.variants){const c=new Catalogue({lengths:[6],patterns:[mask],letterMasks:[row.template],vowels:group.vowels});for(const example of row.examples)assert(c.matches(example.form));assert(c.total()>BigInt(row.companies));}
});
test('token mode frequencies count companies once, and empty families are explicit',()=>{
 const fixture=[{rank:1,name:'BABA BACA',word_count:2,form:'BABABACA',uppercase:false,words:[{value:'BABA',uppercase:false},{value:'BACA',uppercase:false}]},{rank:2,name:'DABA',word_count:1,form:'DABA',uppercase:false,words:[{value:'DABA',uppercase:false}]}];
 const r=namingVariants(fixture,{mode:'tokens'},'CVCV',{anchors:2,minSupport:1});assert.equal(r.observations,3);assert.equal(r.denominator,2);assert.equal(r.variants.find(x=>x.template==='?A?A').companies,2);assert.equal(r.stats.maxOccurrences.find(x=>x.value===2).companies,2);
 const empty=namingVariants(companies,group,'VVVVVVVVVVVV');assert.equal(empty.denominator,0);assert.deepEqual(empty.variants,[]);assert.throws(()=>namingVariants(companies,group,mask,{anchors:3}));
});
test('repeat feature distances are intervening letters between consecutive appearances',()=>{
 assert.deepEqual([features('AA'),features('ABA'),features('ABCA')].map(f=>[f.minRepeatGap,f.maxRepeatGap]),[[0,0],[1,1],[2,2]]);
 const f=features('ABACA');assert.equal(f.maxOccurrences,3);assert.equal(f.distinct,3);assert.equal(f.minRepeatGap,1);assert.equal(f.maxRepeatGap,1);assert.equal(features('ABCD').minRepeatGap,null);
});
