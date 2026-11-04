import {normalizeRepeats,RepeatTracker,repetitionFeatures} from './repeat-rules.js?v=11';
import {LiteralMasks} from './literal-masks.js?v=11';
/* Exact finite-state counting and rank/select over an implicit A–Z catalogue. */
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const DEFAULTS = {lengths:[3,4,5,6,7,8,9,10,11,12], allowed:ALPHABET, vowels:'AEIOU', blocked:'', maxC:null, maxV:null, maxSame:null, prefix:'', suffix:'', contains:'', excluded:[], bannedSuffixes:[], stops:[], minV:0,maxVowels:12,pattern:'', patterns:[], noInnerY:false,required:[],requiredMode:'all',prefixes:[],suffixes:[],bannedPrefixes:[],positionRules:[],warningSuffixes:[],maxOccurrences:null,minRepeatGap:null,maxRepeatGap:null,minDistinct:0,maxDistinct:null,letterRules:[],letterMasks:[],allowedConsonantPairs:[],allowedVowelPairs:[]};
const latin = (s, label) => {s=String(s??'').trim().toUpperCase();if(!/^[A-Z]*$/.test(s))throw Error(`${label}: допустимы только A–Z`);return s;};
export function normalize(raw={}) {
  const c={...DEFAULTS,...raw};
  c.lengths=[...new Set(c.lengths.map(Number))].sort((a,b)=>a-b);
  if(!c.lengths.length||c.lengths.some(n=>!Number.isInteger(n)||n<1||n>12))throw Error('Длины: целые числа от 1 до 12');
  for(const k of ['allowed','vowels','blocked','prefix','suffix','contains'])c[k]=latin(c[k],k);
  c.allowed=[...new Set(c.allowed)].sort().join('');c.vowels=[...new Set(c.vowels)].sort().join('');c.blocked=[...new Set(c.blocked)].sort().join('');
  if(!c.allowed)throw Error('Укажите хотя бы одну разрешённую букву');
  for(const k of ['maxC','maxV','maxSame']) {if(c[k]===''||c[k]===null)c[k]=null;else{c[k]=Number(c[k]);if(!Number.isInteger(c[k])||c[k]<0||c[k]>12)throw Error(`${k}: 0–12 или пустое поле`);}}
  for(const k of ['minV','maxVowels']) {c[k]=Number(c[k]);if(!Number.isInteger(c[k])||c[k]<0||c[k]>12)throw Error('Количество гласных: 0–12');}
  if(c.minV>c.maxVowels)throw Error('Минимум гласных больше максимума');
  for(const k of ['excluded','bannedSuffixes','stops','required','prefixes','suffixes','bannedPrefixes','warningSuffixes','allowedConsonantPairs','allowedVowelPairs']) {if(!Array.isArray(c[k]))throw Error(`${k}: нужен список строк`);c[k]=[...new Set(c[k].map(x=>latin(x,k)).filter(Boolean))].sort();}
  if(c.required.length>12)throw Error('Обязательных сочетаний может быть не более 12 в одном запросе');
  if(!['all','any'].includes(c.requiredMode))throw Error('Выберите «все» или «любое» обязательное сочетание');
  if(!Array.isArray(c.positionRules))throw Error('Правила позиций: нужен список');
  c.positionRules=c.positionRules.map(rule=>{const position=Number(rule.position);if(!Number.isInteger(position)||position===0||Math.abs(position)>12)throw Error('Позиция: 1–12 от начала или −1…−12 от конца');return {position,allowed:latin(rule.allowed,'Буквы в позиции'),blocked:latin(rule.blocked,'Запрет в позиции')};});
  c.pattern=String(c.pattern||'').trim().toUpperCase();if(!/^[CV?]*$/.test(c.pattern))throw Error('Шаблон: C, V и ?');
  if(!Array.isArray(c.patterns))throw Error('Набор масок: нужен список');
  c.patterns=[...new Set(c.patterns.map(s=>String(s).trim().toUpperCase()).filter(Boolean))].sort();
  if(c.patterns.some(s=>!/^([CV]){1,12}$/.test(s)))throw Error('Каждая маска набора: только C/V, длина 1–12');
  if([...c.allowedConsonantPairs,...c.allowedVowelPairs].some(x=>x.length!==2))throw Error('Допустимые пары должны состоять из двух букв');
  if(!Array.isArray(c.letterMasks))throw Error('Буквенные маски: нужен список');
  c.letterMasks=[...new Set(c.letterMasks.map(x=>String(x).trim().toUpperCase()).filter(Boolean))].sort();
  if(c.letterMasks.some(x=>! /^[A-Z?]{1,12}$/.test(x)))throw Error('Буквенные маски: A–Z и ?, длина 1–12');
  normalizeRepeats(c);
  c.noInnerY=Boolean(c.noInnerY);
  return c;
}
export function rawId(word) {
  let rank=0n,offset=0n,p=26n;
  for(let i=1;i<word.length;i++){offset+=p;p*=26n;}
  for(const ch of word)rank=rank*26n+BigInt(ALPHABET.indexOf(ch));
  return offset+rank+1n;
}
export function rawSize(lengths) {return lengths.reduce((a,n)=>a+26n**BigInt(n),0n);}

// Aho–Corasick states retain every suffix needed by forbidden substrings,
// the required substring and the terminal suffix, so no whole word is in a DP key.
function automaton(c) {
  const nodes=[{next:{},fail:0,bad:false,found:false,ending:!c.suffix,anyEnd:!c.suffixes.length,mask:0}];
  function insert(s,flag,bit=0){let state=0;for(const ch of s){if(nodes[state].next[ch]===undefined){nodes[state].next[ch]=nodes.length;nodes.push({next:{},fail:0,bad:false,found:false,ending:false,anyEnd:false,mask:0});}state=nodes[state].next[ch];}if(flag==='mask')nodes[state].mask|=bit;else nodes[state][flag]=true;}
  c.excluded.forEach(s=>insert(s,'bad'));c.bannedSuffixes.forEach(s=>insert(s,'badEnd'));if(c.contains)insert(c.contains,'found');if(c.suffix)insert(c.suffix,'ending');
  c.suffixes.forEach(s=>insert(s,'anyEnd'));c.required.forEach((s,i)=>insert(s,'mask',1<<i));
  const queue=[];
  for(const ch of ALPHABET){const child=nodes[0].next[ch];if(child!==undefined)queue.push(child);else nodes[0].next[ch]=0;}
  for(let i=0;i<queue.length;i++){const v=queue[i],node=nodes[v],failure=nodes[node.fail];node.bad ||= failure.bad;node.badEnd ||= failure.badEnd;node.found ||= failure.found;node.ending ||= failure.ending;node.anyEnd ||= failure.anyEnd;node.mask|=failure.mask;
    for(const ch of ALPHABET){const child=node.next[ch];if(child!==undefined){nodes[child].fail=failure.next[ch];queue.push(child);}else node.next[ch]=failure.next[ch];}}
  return nodes;
}
function stopTrie(stops) {const nodes=[{next:{},end:false}];for(const word of stops){let s=0;for(const ch of word){if(nodes[s].next[ch]===undefined){nodes[s].next[ch]=nodes.length;nodes.push({next:{},end:false});}s=nodes[s].next[ch];}nodes[s].end=true;}return nodes;}
function prefixTrie(c){const nodes=[{next:{},allow:false,deny:false}];for(const [words,flag] of [[c.prefixes,'allow'],[c.bannedPrefixes,'deny']])for(const word of words){let state=0;for(const ch of word){if(nodes[state].next[ch]===undefined){nodes[state].next[ch]=nodes.length;nodes.push({next:{},allow:false,deny:false});}state=nodes[state].next[ch];}nodes[state][flag]=true;}return nodes;}

export class Catalogue {
  constructor(raw={}) {
    this.config=normalize(raw);this.signature=JSON.stringify(this.config);this.ac=automaton(this.config);this.trie=stopTrie(this.config.stops);this.stopSet=new Set(this.config.stops);
    this.prefixTrie=prefixTrie(this.config);this.requiredMask=(1<<this.config.required.length)-1;
    this.patternTrie=stopTrie(this.config.patterns);
    this.letters=[...this.config.allowed].filter(ch=>!this.config.blocked.includes(ch));this.vowels=new Set(this.config.vowels);this.memo=new Map();this.counts=new Map();this.states=0;
    this.literalMasks=new LiteralMasks(this.config.letterMasks);this.repeatTracker=new RepeatTracker(this.config,this.letters);this.keepLast=this.config.maxSame!==null||this.config.allowedConsonantPairs.length>0||this.config.allowedVowelPairs.length>0;this.ccPairs=new Set(this.config.allowedConsonantPairs);this.vvPairs=new Set(this.config.allowedVowelPairs);
  }
  initial(){return [0,0,0,0,0,'',0,!this.config.contains,0,0,0,!this.config.prefixes.length,this.config.patterns.length?0:-1,this.literalMasks.initial(),...this.repeatTracker.initial()];}
  next(state,ch,n){
    const c=this.config,[depth,ac,cr,vr,same,last,nv,found,stop,mask,prefixState,prefixFound,cvState]=state;
    if(c.prefix[depth]&&c.prefix[depth]!==ch)return null;
    if(c.noInnerY&&ch==='Y'&&depth<n-1)return null;
    for(const rule of c.positionRules)if(rule.position===depth+1||rule.position===depth-n){if(rule.allowed&&!rule.allowed.includes(ch)||rule.blocked.includes(ch))return null;}
    const pNode=prefixState<0?-1:(this.prefixTrie[prefixState].next[ch]??-1);
    if(pNode>=0&&this.prefixTrie[pNode].deny)return null;
    const pFound=prefixFound||(pNode>=0&&this.prefixTrie[pNode].allow);
    if(!pFound&&pNode<0)return null;
    const v=this.vowels.has(ch),p=c.pattern[depth];
    if(p&&p!=='?'&&p!==(v?'V':'C'))return null;
    const cvNext=cvState<0?-1:(this.patternTrie[cvState].next[v?'V':'C']??-1);
    if(cvState>=0&&cvNext<0)return null;
    if(last){const lv=this.vowels.has(last),pair=last+ch;if(v&&lv&&this.vvPairs.size&&!this.vvPairs.has(pair)||!v&&!lv&&this.ccPairs.size&&!this.ccPairs.has(pair))return null;}
    const literalNext=this.literalMasks.next(state[13],ch);if(!literalNext)return null;
    const cRun=v?0:cr+1,vRun=v?vr+1:0,sRun=ch===last?same+1:1,vCount=nv+Number(v);
    if(c.maxC!==null&&cRun>c.maxC||c.maxV!==null&&vRun>c.maxV||c.maxSame!==null&&sRun>c.maxSame||vCount>c.maxVowels||vCount+n-depth-1<c.minV)return null;
    const a=this.ac[ac].next[ch];if(this.ac[a].bad)return null;
    const repeatNext=this.repeatTracker.step(state[14],state[15],ch,depth,n);if(!repeatNext)return null;
    // Collapse unused dimensions; otherwise even an unrestricted catalogue
    // would unnecessarily create distinct states for every last letter/run.
    return [depth+1,a,c.maxC===null?0:cRun,c.maxV===null?0:vRun,c.maxSame===null?0:sRun,this.keepLast?ch:'',(c.minV===0&&c.maxVowels>=n)?0:vCount,found||this.ac[a].found,stop<0?-1:(this.trie[stop].next[ch]??-1),mask|this.ac[a].mask,pNode,pFound,cvNext,literalNext,...repeatNext];
  }
  countState(n,state){
    const c=this.config,[depth,a,,,,,nv,found,stop,mask,,prefixFound,cvState]=state;
    const requiredOK=!this.requiredMask||(c.requiredMode==='all'?mask===this.requiredMask:mask!==0);
    if(depth===n)return BigInt(this.literalMasks.accept(state[13])&&this.repeatTracker.accept(state[14])&&found&&this.ac[a].ending&&this.ac[a].anyEnd&&!this.ac[a].badEnd&&requiredOK&&prefixFound&&(!c.patterns.length||cvState>=0&&this.patternTrie[cvState].end)&&nv>=c.minV&&nv<=c.maxVowels&&!(stop>=0&&this.trie[stop].end));
    const key=n+'|'+state.slice(0,14).join(':')+'|'+this.repeatTracker.key(state[14],state[15],state[5]);const cached=this.memo.get(key);if(cached!==undefined)return cached;
    let total=0n;for(const ch of this.letters){const s=this.next(state,ch,n);if(s)total+=this.countState(n,s);}
    this.memo.set(key,total);this.states++;if(this.states>2000000)throw Error('Слишком сложный набор правил: более 2 млн состояний. Упростите правила или разделите расчёт по длинам.');
    return total;
  }
  countLength(n){if(!this.counts.has(n)){const c=this.config;this.counts.set(n,(c.prefix.length>n||c.suffix.length>n||c.contains.length>n||c.pattern&&c.pattern.length!==n||c.patterns.length&&!c.patterns.some(mask=>mask.length===n)||c.positionRules.some(rule=>Math.abs(rule.position)>n)||c.letterMasks.length&&!c.letterMasks.some(mask=>mask.length===n)||c.minDistinct>n)?0n:this.countState(n,this.initial()));}return this.counts.get(n);}
  total(){let t=0n;for(const n of this.config.lengths)t+=this.countLength(n);return t;}
  select(ordinal){
    ordinal=BigInt(ordinal);if(ordinal<0n)throw Error('Позиция должна быть неотрицательной');
    for(const n of this.config.lengths){const count=this.countLength(n);if(ordinal>=count){ordinal-=count;continue;}let word='',state=this.initial();
      for(let depth=0;depth<n;depth++){for(const ch of this.letters){const next=this.next(state,ch,n);if(!next)continue;const block=this.countState(n,next);if(ordinal>=block){ordinal-=block;continue;}word+=ch;state=next;break;}}
      return features(word,this.config.vowels,this.config.warningSuffixes);
    }return null;
  }
  // Keyset seek: number of matching names strictly before the given raw word.
  rankBefore(word){
    word=latin(word,'Название');let result=0n;
    for(const n of this.config.lengths){if(n<word.length){result+=this.countLength(n);continue;}if(n>word.length)break;if(this.countLength(n)===0n)continue;
      let state=this.initial();for(let d=0;d<n;d++){let chosen=null;for(const ch of this.letters){const next=this.next(state,ch,n);if(!next)continue;if(ch<word[d])result+=this.countState(n,next);else if(ch===word[d])chosen=next;else break;}if(!chosen)return result;state=chosen;}
    }return result;
  }
  matches(word){word=latin(word,'Название');if(!this.config.lengths.includes(word.length)||this.stopSet.has(word)||this.countLength(word.length)===0n)return false;if(!this.config.lengths.includes(word.length)||this.config.prefix.length>word.length||this.config.suffix.length>word.length||this.config.contains.length>word.length||this.config.pattern&&this.config.pattern.length!==word.length)return false;let state=this.initial();for(const ch of word){if(!this.letters.includes(ch))return false;state=this.next(state,ch,word.length);if(!state)return false;}return this.countState(word.length,state)===1n;}
  page(start='0',limit=100){start=BigInt(start);if(start<0n)throw Error('Неверная позиция');limit=Number(limit);if(!Number.isInteger(limit)||limit<1||limit>5000)throw Error('Размер страницы: 1–5000');const total=this.total(),rows=[];for(let i=start;i<total&&rows.length<limit;i++)rows.push(this.select(i));return {rows,total:String(total),start:String(start),next:start+BigInt(rows.length)<total?String(start+BigInt(rows.length)):null,states:this.states,raw:String(rawSize(this.config.lengths))};}
}
const TR={A:'А',B:'Б',C:'К',D:'Д',E:'Э',F:'Ф',G:'Г',H:'Х',I:'И',J:'ДЖ',K:'К',L:'Л',M:'М',N:'Н',O:'О',P:'П',Q:'К',R:'Р',S:'С',T:'Т',U:'У',V:'В',W:'В',X:'КС',Y:'Й',Z:'З'};
export function features(word,vowels='AEIOU',warningSuffixes=[]) {const v=[...word].filter(ch=>vowels.includes(ch)).length;return {...repetitionFeatures(word),id:String(rawId(word)),name:word,length:word.length,vowels:v,structure:[...word].map(ch=>vowels.includes(ch)?'V':'C').join(''),transcription:[...word].map(ch=>TR[ch]).join(''),innerY:word.slice(0,-1).includes('Y'),warningSuffix:warningSuffixes.filter(s=>word.endsWith(s)).join(', '),repeats:/(.)\1/.test(word),ngramFrequency:null};}
