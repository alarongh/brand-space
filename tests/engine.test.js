import test from 'node:test';
import assert from 'node:assert/strict';
import {Catalogue,DEFAULTS,rawId,normalize} from '../engine.js';
const BASELINE_RULES={blocked:'QWXJ',maxC:2,maxV:2,maxSame:2};
function brute(c){const out=[];const vowels=new Set(c.vowels);function valid(w){
const counts={},positions={};for(let i=0;i<w.length;i++){counts[w[i]]=(counts[w[i]]||0)+1;(positions[w[i]]??=[]).push(i);}
if(c.maxOccurrences!==null&&Object.values(counts).some(n=>n>c.maxOccurrences)||Object.keys(counts).length<c.minDistinct||c.maxDistinct!==null&&Object.keys(counts).length>c.maxDistinct)return false;
const gapOK=(ps,lo,hi)=>ps.every((p,i)=>i===0||(lo===null||p-ps[i-1]-1>=lo)&&(hi===null||p-ps[i-1]-1<=hi));
if(Object.values(positions).some(ps=>!gapOK(ps,c.minRepeatGap,c.maxRepeatGap)))return false;
for(const r of c.letterRules){const n=counts[r.letter]||0;if(n<r.min||r.max!==null&&n>r.max||!gapOK(positions[r.letter]||[],r.minGap,r.maxGap))return false;}
if(c.letterMasks.length&&!c.letterMasks.some(m=>m.length===w.length&&[...m].every((x,i)=>x==='?'||x===w[i])))return false;
for(let i=1;i<w.length;i++){const pair=w.slice(i-1,i+1),vs=[...pair].map(x=>vowels.has(x));if(vs.every(Boolean)&&c.allowedVowelPairs.length&&!c.allowedVowelPairs.includes(pair)||vs.every(x=>!x)&&c.allowedConsonantPairs.length&&!c.allowedConsonantPairs.includes(pair))return false;}
if(c.prefixes.length&&!c.prefixes.some(s=>w.startsWith(s))||c.suffixes.length&&!c.suffixes.some(s=>w.endsWith(s))||c.bannedPrefixes.some(s=>w.startsWith(s)))return false;
if(c.required.length&&!(c.requiredMode==='all'?c.required.every(s=>w.includes(s)):c.required.some(s=>w.includes(s))))return false;
for(const r of c.positionRules){if(Math.abs(r.position)>w.length)return false;const ch=w[r.position>0?r.position-1:w.length+r.position];if(r.allowed&&!r.allowed.includes(ch)||r.blocked.includes(ch))return false;}
if(c.prefix&&!w.startsWith(c.prefix)||c.suffix&&!w.endsWith(c.suffix)||!w.includes(c.contains)||c.stops.includes(w)||c.excluded.some(s=>w.includes(s))||c.bannedSuffixes.some(s=>w.endsWith(s)))return false;const pattern=[...w].map(ch=>vowels.has(ch)?'V':'C').join('');if(c.patterns.length&&!c.patterns.includes(pattern))return false;if(c.pattern&&(c.pattern.length!==w.length||[...c.pattern].some((ch,i)=>ch!=='?'&&ch!==pattern[i])))return false;const n=[...w].filter(ch=>vowels.has(ch)).length;if(n<c.minV||n>c.maxVowels||c.noInnerY&&w.slice(0,-1).includes('Y'))return false;let same=0,vr=0,cr=0,last='';for(const ch of w){same=ch===last?same+1:1;last=ch;vr=vowels.has(ch)?vr+1:0;cr=vowels.has(ch)?0:cr+1;if(c.maxSame!==null&&same>c.maxSame||c.maxV!==null&&vr>c.maxV||c.maxC!==null&&cr>c.maxC)return false;}return true;}const letters=[...c.allowed].filter(ch=>!c.blocked.includes(ch));function walk(w,n){if(w.length===n){if(valid(w))out.push(w);return;}for(const ch of letters)walk(w+ch,n);}for(const n of c.lengths)walk('',n);return out;}
function compare(config){const cat=new Catalogue(config),expected=brute(cat.config);assert.equal(cat.total(),BigInt(expected.length));const actual=[];let start='0';do{const p=cat.page(start,7);actual.push(...p.rows.map(r=>r.name));start=p.next;}while(start!==null);assert.deepEqual(actual,expected);assert.equal(new Set(actual).size,actual.length);for(let i=0;i<expected.length;i++){assert.equal(cat.select(i).name,expected[i]);assert.equal(cat.rankBefore(expected[i]),BigInt(i));assert.equal(cat.matches(expected[i]),true);}assert.equal(cat.select(expected.length),null);}
test('full unfiltered 4–6 universe is exactly 321254128; rejected legacy names remain',()=>{const c=new Catalogue({lengths:[4,5,6]});assert.equal(c.total(),321254128n);assert.equal(c.select(0).name,'AAAA');assert.equal(c.select(321254127n).name,'ZZZZZZ');assert(c.matches('QWJX'));assert(c.matches('AAAABB'));});
test('legacy configuration independently gives every known per-length count',()=>{const c=new Catalogue({...DEFAULTS,...BASELINE_RULES,lengths:[4,5,6]});assert.equal(c.countLength(4),96730n);assert.equal(c.countLength(5),1540880n);assert.equal(c.countLength(6),22209650n);assert.equal(c.total(),23847260n);assert.equal(c.matches('QWJX'),false);assert.equal(c.matches('AAAABB'),false);});
test('unfiltered lengths 1–12 preserve integer precision and support last-page seek',()=>{const c=new Catalogue({lengths:Array.from({length:12},(_,i)=>i+1)});let expected=0n;for(let n=1;n<=12;n++)expected+=26n**BigInt(n);assert.equal(c.total(),expected);assert(expected>BigInt(Number.MAX_SAFE_INTEGER));assert.equal(c.select(expected-1n).name,'ZZZZZZZZZZZZ');assert.equal(c.rankBefore('ZZZZZZZZZZZZ'),expected-1n);});
test('exhaustive small universes, overlapping automaton patterns, all hard rules',()=>{const base={allowed:'ABEY',lengths:[1,2,3,4,5],vowels:'AE'};const cases=[{},BASELINE_RULES,{maxC:1},{maxV:1},{maxSame:1},{maxSame:0},{maxC:0},{maxV:0},{minV:2,maxVowels:3},{excluded:['ABA','BAB','AA']},{suffix:'ABA',contains:'BA'},{contains:'AB',excluded:['BBA'],bannedSuffixes:['BA','Y']},{prefix:'A',suffix:'Y',noInnerY:true},{stops:['AB','ABAB','AAAA','Y']},{pattern:'CV??'},{contains:'YY',suffix:'Y'},{prefix:'AAA',lengths:[1,2]},{bannedSuffixes:['ABA','BA']},{excluded:['AB','BA'],contains:'ABA'}];for(const cfg of cases)compare({...base,...cfg});});
test('exact dictionary does not exclude longer words containing its entries',()=>{const c=new Catalogue({allowed:'AB',lengths:[2,3,4],stops:['AB']});assert(!c.matches('AB'));assert(c.matches('ABAB'));assert(c.matches('AAB'));compare(c.config);});
test('redundant X endings and identical triples do not double count exclusions',()=>{const a=new Catalogue({...BASELINE_RULES}),b=new Catalogue({...BASELINE_RULES,bannedSuffixes:['IX','EX','OX','ONIX']});assert.equal(a.total(),b.total());const x=new Catalogue({...BASELINE_RULES,maxSame:null});assert.equal(a.total(),x.total());});
test('seek absent and excluded words returns exact insertion position',()=>{const c=new Catalogue({allowed:'ABC',lengths:[1,2,3],excluded:['AB'],stops:['BCA']});const all=brute(c.config);for(const word of ['AB','BCA','BB','AAAA','A','Z','BCB'])assert.equal(c.rankBefore(word),BigInt(all.filter(w=>w.length<word.length||w.length===word.length&&w<word).length));});
test('stable raw IDs agree with independent base-26 encoding',()=>{for(const w of ['A','Z','AA','AB','ZZ','AAAA','ZZZZZZZZZZZZ']){let r=0n,offset=0n;for(let n=1;n<w.length;n++)offset+=26n**BigInt(n);for(const ch of w)r=r*26n+BigInt(ch.charCodeAt(0)-65);assert.equal(rawId(w),offset+r+1n);}});
test('annotations never discard names; Y and warning endings remain',()=>{const c=new Catalogue({lengths:[4]});for(const word of ['YATO','AATI','YASO','AAMO','YYAA'])assert(c.matches(word));assert.equal(c.select(c.rankBefore('YATO')).warningSuffix,'');const marked=new Catalogue({lengths:[4],warningSuffixes:['TO','ATO']});assert.equal(marked.total(),c.total());assert.equal(marked.select(marked.rankBefore('YATO')).warningSuffix,'ATO, TO');assert.equal(c.select(c.rankBefore('YATO')).innerY,true);assert.equal(c.select(c.rankBefore('YATO')).ngramFrequency,null);});
test('invalid configs and page positions fail clearly',()=>{for(const c of [{lengths:[0]},{lengths:[13]},{allowed:''},{excluded:['A*']},{pattern:'CCCX'},{maxSame:-1},{minV:3,maxVowels:2}])assert.throws(()=>normalize(c));const c=new Catalogue();assert.throws(()=>c.page('-1'));assert.throws(()=>c.page(0,6000));});

test('default catalogue spans 3–12 with no preset restrictions or suffix annotations',()=>{const c=new Catalogue();let expected=0n;for(let n=3;n<=12;n++)expected+=26n**BigInt(n);assert.equal(c.total(),expected);assert.deepEqual(c.config.lengths,[3,4,5,6,7,8,9,10,11,12]);assert.equal(c.config.blocked,'');assert.equal(c.config.maxC,null);assert.deepEqual(c.config.warningSuffixes,[]);assert.equal(c.select(0).name,'AAA');assert(c.matches('QWX'));assert(c.matches('AAAAAAAAAAAA'));});
test('custom required groups, prefix/suffix alternatives and position rules exhaustively match brute force',()=>{const base={allowed:'ABEY',vowels:'AE',lengths:[1,2,3,4,5]};const cases=[
{required:['AB','BA']},{required:['ABA','BAB'],requiredMode:'any'},{required:['A','AA','AAA']},{required:['AB','Y'],requiredMode:'all'},
{prefixes:['A','BE']},{prefixes:['ABA'],bannedPrefixes:['ABAB']},{bannedPrefixes:['AB','BA']},{suffixes:['A','BY']},{suffixes:['ABA','BA'],bannedSuffixes:['EBA']},
{prefixes:['AB','BA'],suffixes:['Y','AE'],required:['A','B'],bannedPrefixes:['BAB']},
{positionRules:[{position:1,allowed:'AE',blocked:''}]},{positionRules:[{position:-1,allowed:'BY',blocked:'Y'}]},
{positionRules:[{position:2,allowed:'AE',blocked:'A'},{position:-2,allowed:'E',blocked:''}]},
{positionRules:[{position:1,allowed:'A',blocked:''},{position:1,allowed:'B',blocked:''}]},
{positionRules:[{position:5,allowed:'AB',blocked:''}],required:['AA','BE'],requiredMode:'any',prefixes:['A'],suffixes:['B']},
{positionRules:[{position:-1,allowed:'A',blocked:''}],required:['B'],excluded:['BBB'],maxSame:2,stops:['BA']}
];for(const config of cases)compare({...base,...config});});
test('invalid positional and required rules fail without partial results',()=>{for(const c of [{requiredMode:'other'},{required:Array.from({length:13},(_,i)=>'A'+String.fromCharCode(65+i))},{positionRules:[{position:0}]},{positionRules:[{position:13}]},{positionRules:[{position:-13}]},{positionRules:[{position:1,allowed:'*'}]}])assert.throws(()=>normalize(c));});

test('multiple C/V masks are an exact union with other filters and support rank/select',()=>{
const base={allowed:'ABEY',lengths:[1,2,3,4,5],vowels:'AE'};
for(const cfg of [{patterns:['C','CV','CVC']},{patterns:['CVCCV','VCVCV'],required:['A']},{patterns:['VCV','CCV'],maxC:1},{patterns:['CVC','CVC'],suffix:'A'},{patterns:['VCV','CVC'],pattern:'?V?'},{patterns:['CVCVC'],positionRules:[{position:-1,allowed:'BE',blocked:''}]}])compare({...base,...cfg});
});
test('mask union has no arbitrary result cap and no duplicate counting',()=>{
const c=new Catalogue({patterns:['CVCCVC','CVCCVC']});assert.equal(c.total(),4862025n);
assert.equal(c.select(c.total()-1n).structure,'CVCCVC');
const masks=[];for(let n=1;n<=5;n++)for(let bits=0;bits<2**n;bits++)masks.push(Array.from({length:n},(_,i)=>(bits&(1<<i))?'V':'C').join(''));
const all=new Catalogue({lengths:[1,2,3,4,5],patterns:masks});assert.equal(all.total(),[1,2,3,4,5].reduce((s,n)=>s+26n**BigInt(n),0n));
assert.throws(()=>normalize({patterns:['CV?']}));assert.throws(()=>normalize({patterns:'CVC'}));
});

test('total occurrences, consecutive-repeat gaps, distinct counts and per-letter rules match independent enumeration',()=>{
 const base={allowed:'ABCE',vowels:'AE',lengths:[1,2,3,4,5]};
 const cases=[{maxOccurrences:0},{maxOccurrences:1},{maxOccurrences:2},{minRepeatGap:0},{minRepeatGap:1},{minRepeatGap:2},{minRepeatGap:11},{maxRepeatGap:0},{maxRepeatGap:1},{minRepeatGap:2,maxRepeatGap:1},{minRepeatGap:1,maxRepeatGap:2},{minDistinct:3},{maxDistinct:2},{minDistinct:2,maxDistinct:2},{maxDistinct:0},{maxOccurrences:2,maxSame:1,minRepeatGap:1},{letterRules:[{letter:'A',min:2,max:3,minGap:1,maxGap:2}]},{letterRules:[{letter:'A',max:0},{letter:'C',min:1}]},{letterRules:[{letter:'B',min:2},{letter:'B',max:2}]},{maxOccurrences:2,letterRules:[{letter:'A',min:1}],maxRepeatGap:2}];
 for(const cfg of cases)compare({...base,...cfg});
});
test('repeat memoization preserves literal identity under every other hard rule',()=>{
 const base={allowed:'ABCE',vowels:'AE',lengths:[3,4,5],maxOccurrences:2,minRepeatGap:1};
 for(const cfg of [{prefix:'B'},{suffix:'A'},{contains:'BE'},{excluded:['AB','EE']},{required:['BA','E'],requiredMode:'any'},{prefixes:['AB','CE'],suffixes:['A','B']},{stops:['ABC','BCA','EBCE']},{letterMasks:['A??','?B??','??A??']},{positionRules:[{position:2,allowed:'AB',blocked:'B'}]},{patterns:['CVC','VCVC','CVCCV']},{maxSame:1},{allowedConsonantPairs:['BC'],allowedVowelPairs:['AE','EA']},{noInnerY:true,allowed:'ABEY'}])compare({...base,...cfg});
});
test('overlapping literal wildcard masks form a deduplicated union, independent of C/V masks',()=>{
 const base={allowed:'ABCE',lengths:[1,2,3,4],vowels:'AE'};
 for(const cfg of [{letterMasks:['A??','?B?','???','AB?']},{letterMasks:['A?','?B','ABC?'],patterns:['VC','CV','VCCC']},{letterMasks:['??A?','A???'],maxOccurrences:2,maxRepeatGap:1}])compare({...base,...cfg});
 for(const cfg of [{allowedVowelPairs:['AE']},{allowedConsonantPairs:['BC','CC']},{allowedVowelPairs:['AE'],allowedConsonantPairs:['BC'],maxSame:1}])compare({...base,...cfg});
});
test('A–Z length 12 with no repeated letters equals the falling factorial and remains seekable',()=>{
 const c=new Catalogue({lengths:[12],maxOccurrences:1});let expected=1n;for(let n=26;n>14;n--)expected*=BigInt(n);assert.equal(c.total(),expected);assert.equal(c.select(0).name,'ABCDEFGHIJKL');assert.equal(c.select(expected-1n).name,'ZYXWVUTSRQPO');assert(c.states<10000);
});
test('large occurrence and spacing counts agree with independent combinatorial formulas',()=>{
 const factorial=n=>{let p=1n;for(let i=2;i<=n;i++)p*=BigInt(i);return p;};const choose=(n,k)=>factorial(n)/(factorial(k)*factorial(n-k));
 let expected=0n;for(let pairs=0;pairs<=6;pairs++)expected+=choose(26,pairs)*choose(26-pairs,12-2*pairs)*factorial(12)/(2n**BigInt(pairs));
 const c=new Catalogue({lengths:[12],maxOccurrences:2});assert.equal(c.total(),expected);assert(c.states<10000);assert.equal(new Catalogue({lengths:[12],minRepeatGap:2}).total(),26n*25n*24n**10n);
});
test('new invalid rules fail clearly',()=>{for(const c of [{maxOccurrences:13},{minRepeatGap:-1},{minDistinct:3,maxDistinct:2},{letterRules:[{letter:'AB'}]},{letterRules:[{letter:'A',min:3,max:2}]},{letterMasks:['A*']},{allowedConsonantPairs:['ABC']}])assert.throws(()=>normalize(c));});
