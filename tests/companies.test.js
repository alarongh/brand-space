import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeCompanies} from '../company-analysis.js';
const data=JSON.parse(readFileSync(new URL('../data/company-patterns-2026-11-03.json',import.meta.url)));
const baseline=JSON.parse(readFileSync(new URL('../reports/company-analysis.json',import.meta.url))).baseline;
test('frozen source covers exactly ranks 1–1000, with 1000 different source identifiers',()=>{
  assert.deepEqual(data.companies.map(c=>c.rank),Array.from({length:1000},(_,i)=>i+1));
  assert.equal(new Set(data.companies.map(c=>c.symbol)).size,1000);
  assert.equal(new Set(data.companies.map(c=>c.source_name)).size,1000);
  assert.equal(data.meta.quality.market_cap_inversions,0);
});
test('independent JavaScript aggregation reproduces all Python frequencies and denominators',()=>{
  for(const [key,expected] of Object.entries(baseline)){
    const actual=analyzeCompanies(data.companies,{mode:key==='single_mixed'?'single':key,typography:key==='single_mixed'?'mixed':'all'});
    assert.equal(actual.denominator,expected.denominator,key);assert.equal(actual.observations,expected.observations,key);
    assert.deepEqual(actual.flags,expected.flags,key);
    for(const kind of Object.keys(expected.tables)){
      const counts=Object.fromEntries(actual.tables[kind].map(r=>[r.value,r.companies]));
      assert.deepEqual(counts,Object.fromEntries(expected.tables[kind].map(r=>[r.value,r.companies])),key+'/'+kind);
      for(const row of actual.tables[kind])assert.equal(row.share,row.companies/actual.denominator);
    }
  }
});
test('document frequency counts a company once despite repeated tokens and n-grams',()=>{
  const companies=[{rank:1,name:'fixture',word_count:3,form:'ABAABAACA',uppercase:false,words:[{value:'ABA',uppercase:false},{value:'ABA',uppercase:false},{value:'ACA',uppercase:false}]}];
  const result=analyzeCompanies(companies,{mode:'tokens'});
  assert.equal(result.denominator,1);assert.equal(result.observations,2);
  assert.equal(result.tables.masks[0].value,'VCV');assert.equal(result.tables.masks[0].companies,1);
  assert(result.tables.bigram.every(r=>r.companies===1&&r.share===1));
});
test('Y convention and selected length affect masks explicitly; an empty group stays empty',()=>{
  const companies=[{rank:1,name:'YAY',word_count:1,form:'YAY',uppercase:true,words:[{value:'YAY',uppercase:true}]}];
  assert.equal(analyzeCompanies(companies).tables.masks[0].value,'CVC');
  assert.equal(analyzeCompanies(companies,{vowels:'AEIOUY'}).tables.masks[0].value,'VVV');
  const empty=analyzeCompanies(companies,{length:6});assert.equal(empty.denominator,0);assert.deepEqual(empty.tables.masks,[]);
});
