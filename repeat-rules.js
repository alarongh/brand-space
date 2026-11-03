const HEX='0123456789abcdef';
const value=(x,max,label)=>{if(x===null||x===undefined||x==='')return null;const n=Number(x);if(!Number.isInteger(n)||n<0||n>max)throw Error(`${label}: 0–${max} или пустое поле`);return n;};
export function normalizeRepeats(c){
  c.maxOccurrences=value(c.maxOccurrences,12,'Вхождений одной буквы');
  c.minRepeatGap=value(c.minRepeatGap,11,'Минимум букв между повторами');
  c.maxRepeatGap=value(c.maxRepeatGap,11,'Максимум букв между повторами');
  c.minDistinct=value(c.minDistinct,12,'Минимум разных букв')??0;
  c.maxDistinct=value(c.maxDistinct,12,'Максимум разных букв');
  if(c.maxDistinct!==null&&c.minDistinct>c.maxDistinct)throw Error('Минимум разных букв больше максимума');
  if(!Array.isArray(c.letterRules))throw Error('Правила отдельных букв: нужен список');
  c.letterRules=c.letterRules.map(r=>{
    const letter=String(r.letter??'').trim().toUpperCase();if(!/^[A-Z]$/.test(letter))throw Error('Для правила укажите одну букву A–Z');
    const min=value(r.min,12,'Минимум вхождений буквы')??0,max=value(r.max,12,'Максимум вхождений буквы');
    if(max!==null&&min>max)throw Error('Минимум вхождений буквы больше максимума');
    return {letter,min,max,minGap:value(r.minGap,11,'Минимальный интервал буквы'),maxGap:value(r.maxGap,11,'Максимальный интервал буквы')};
  });return c;
}

export class RepeatTracker {
  constructor(c,letters){
    this.c=c;const longest=Math.max(...c.lengths);
    this.countIndices=new Set();this.seenIndices=new Set();this.rules=Array.from({length:26},()=>[]);
    for(const r of c.letterRules)this.rules[r.letter.charCodeAt(0)-65].push(r);
    const globalCounts=c.maxOccurrences!==null&&c.maxOccurrences<longest||c.minDistinct>0||c.maxDistinct!==null&&c.maxDistinct<longest;
    this.bounds=Array.from({length:26},(_,i)=>{
      if(globalCounts||this.rules[i].some(r=>r.min>0||r.max!==null&&r.max<longest))this.countIndices.add(i);
      const lo=Math.max(c.minRepeatGap??0,...this.rules[i].map(r=>r.minGap??0));
      const limits=[c.maxRepeatGap,...this.rules[i].map(r=>r.maxGap)].filter(v=>v!==null&&v<longest-2);
      const hi=limits.length?Math.min(...limits):null;
      const forbidden=lo>longest-2||hi!==null&&lo>hi;
      if(lo>0||hi!==null)this.seenIndices.add(i);
      return {lo,hi,forbidden};
    });
    this.active=this.countIndices.size>0||this.seenIndices.size>0;
    // Only letters indistinguishable to every other hard rule may share a
    // histogram state. Actual identities remain in the path used by select().
    const fixed=new Set([c.prefix,c.suffix,c.contains,...c.required,...c.excluded,...c.bannedSuffixes,...c.prefixes,...c.suffixes,...c.bannedPrefixes,...c.stops,...c.letterMasks,...c.allowedConsonantPairs,...c.allowedVowelPairs].join('').replaceAll('?',''));
    for(const r of c.letterRules)fixed.add(r.letter);if(c.noInnerY)fixed.add('Y');
    const groups=new Map();
    for(const ch of letters){const i=ch.charCodeAt(0)-65;const key=fixed.has(ch)?'literal:'+ch:[c.vowels.includes(ch),this.countIndices.has(i),this.seenIndices.has(i),...c.positionRules.map(r=>(r.allowed?Number(r.allowed.includes(ch)):2)+':'+Number(r.blocked.includes(ch)))].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
    this.groups=[...groups.values()];
  }
  initial(){return [this.countIndices.size?'0'.repeat(26):'',this.seenIndices.size?'0'.repeat(26):''];}
  step(counts,seen,ch,depth,n){
    if(!this.active)return [counts,seen];
    const c=this.c,i=ch.charCodeAt(0)-65;
    let nextCounts=counts,nextSeen=seen;
    if(this.countIndices.has(i)){
      const count=parseInt(counts[i],16)+1;
      if(c.maxOccurrences!==null&&count>c.maxOccurrences||this.rules[i].some(r=>r.max!==null&&count>r.max))return null;
      nextCounts=counts.slice(0,i)+HEX[count]+counts.slice(i+1);
    }
    const remaining=n-depth-1;
    for(const rule of c.letterRules){const count=nextCounts?parseInt(nextCounts[rule.letter.charCodeAt(0)-65],16):0;if(count+remaining<rule.min)return null;}
    if(c.minDistinct||c.maxDistinct!==null){const distinct=[...nextCounts].filter(x=>x!=='0').length;if(c.maxDistinct!==null&&distinct>c.maxDistinct||distinct+remaining<c.minDistinct)return null;}
    if(this.seenIndices.has(i)){
      const before=seen[i],bounds=this.bounds[i];if(before==='x')return null;
      if(before!=='0'){const gap=depth-parseInt(before,16);if(gap<bounds.lo||bounds.hi!==null&&gap>bounds.hi)return null;}
      const a=[...seen];a[i]=HEX[depth+1];
      for(const j of this.seenIndices){if(a[j]==='0'||a[j]==='x')continue;const bound=this.bounds[j],nextGap=depth+1-parseInt(a[j],16);if(bound.forbidden||bound.hi!==null&&nextGap>bound.hi)a[j]='x';else if(bound.hi===null&&nextGap>=bound.lo)a[j]='0';}
      nextSeen=a.join('');
    }else if(seen){
      // Age tracked letters even when the newly placed letter has no gap rule.
      const a=[...seen];for(const j of this.seenIndices){if(a[j]==='0'||a[j]==='x')continue;const bound=this.bounds[j],nextGap=depth+1-parseInt(a[j],16);if(bound.forbidden||bound.hi!==null&&nextGap>bound.hi)a[j]='x';else if(bound.hi===null&&nextGap>=bound.lo)a[j]='0';}nextSeen=a.join('');
    }
    return [nextCounts,nextSeen];
  }
  accept(counts){const c=this.c;if(c.letterRules.some(r=>(counts?parseInt(counts[r.letter.charCodeAt(0)-65],16):0)<r.min))return false;return !c.minDistinct||[...counts].filter(x=>x!=='0').length>=c.minDistinct;}
  key(counts,seen,last){if(!this.active)return '';return this.groups.map(group=>group.map(i=>(counts[i]??'0')+(seen[i]??'0')+(last.charCodeAt(0)-65===i?'!':'.')).sort().join(',')).join('/');}
}

export function repetitionFeatures(word){
  const counts={},last={},gaps=[];
  for(let i=0;i<word.length;i++){const ch=word[i];counts[ch]=(counts[ch]||0)+1;if(last[ch]!==undefined)gaps.push(i-last[ch]-1);last[ch]=i;}
  return {maxOccurrences:Math.max(...Object.values(counts)),distinct:Object.keys(counts).length,minRepeatGap:gaps.length?Math.min(...gaps):null,maxRepeatGap:gaps.length?Math.max(...gaps):null};
}
