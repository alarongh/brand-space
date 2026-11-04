import {Catalogue,features} from './engine.js?v=11';
import {normalizeWeights,orderWords} from './statistical-model.js?v=11';

const compare=(a,b)=>a.bound-b.bound||a.n-b.n||(a.word<b.word?-1:a.word>b.word?1:0);
class Heap{
  constructor(){this.items=[];}
  push(node){const a=this.items;a.push(node);let i=a.length-1;while(i){const p=(i-1)>>1;if(compare(a[p],node)<=0)break;a[i]=a[p];i=p;}a[i]=node;}
  pop(){const a=this.items;if(!a.length)return null;const first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&compare(a[j+1],a[j])<0)j++;if(compare(last,a[j])<=0)break;a[i]=a[j];i=j;}a[i]=last;}return first;}
}
export class StatisticalSearch{
  constructor(model,config={},weights={}, {maxFrontier=250000}={}){
    this.model=model;this.catalogue=new Catalogue(config);this.weights=normalizeWeights(weights);this.terminalWeights={...this.weights,novelty:0};this.heap=new Heap();this.results=[];this.expanded=0;this.visited=0;this.bounds=new Map();this.transitions=new Map();this.positionLetters=new Map();this.rootMin=new Map();this.maxFrontier=maxFrontier;this.halted=false;
    const c=this.catalogue.config;this.letters=this.catalogue.letters;
    for(const n of c.lengths){if(c.prefix.length>n||c.suffix.length>n||c.contains.length>n||c.pattern&&c.pattern.length!==n||c.patterns.length&&!c.patterns.some(m=>m.length===n)||c.letterMasks.length&&!c.letterMasks.some(m=>m.length===n)||c.positionRules.some(r=>Math.abs(r.position)>n)||c.minDistinct>n)continue;
      const root=this.model.minima(n,this.weights);this.rootMin.set(n,root);const future=this.future(n,0,'^^');if(Number.isFinite(future))this.heap.push({word:'',n,cost:0,bound:root+future,done:false});
    }
  }
  lettersAt(n,d){const key=n+':'+d;if(this.positionLetters.has(key))return this.positionLetters.get(key);const c=this.catalogue.config;const letters=this.letters.filter(ch=>{if(c.prefix[d]&&c.prefix[d]!==ch)return false;if(c.suffix&&d>=n-c.suffix.length&&ch!==c.suffix[d-(n-c.suffix.length)])return false;const p=c.pattern[d];if(p&&p!=='?'&&p!==(c.vowels.includes(ch)?'V':'C'))return false;for(const r of c.positionRules)if(r.position===d+1||r.position===d-n)if(r.allowed&&!r.allowed.includes(ch)||r.blocked.includes(ch))return false;return true;});this.positionLetters.set(key,letters);return letters;}
  transition(n,d,ctx,ch){const key=n+':'+d+':'+ctx+':'+ch;if(!this.transitions.has(key))this.transitions.set(key,this.model.step(ctx,d,ch,n,this.weights));return this.transitions.get(key);}
  future(n,d,ctx){if(d===n)return 0;const key=n+':'+d+':'+ctx;if(this.bounds.has(key))return this.bounds.get(key);let best=Infinity;for(const ch of this.lettersAt(n,d))best=Math.min(best,this.transition(n,d,ctx,ch)+this.future(n,d+1,(ctx+ch).slice(-2)));this.bounds.set(key,best);return best;}
  advance(budget=5000,target=500){if(!Number.isInteger(budget)||budget<1||budget>20000||!Number.isInteger(target)||target<1)throw Error('Некорректный бюджет поиска');let steps=0;
    while(this.heap.items.length&&this.results.length<target&&steps<budget&&!this.halted){const node=this.heap.pop();steps++;this.visited++;
      if(node.done){const row=this.model.explain(node.word,this.weights);this.results.push({...features(node.word,this.catalogue.config.vowels),...row,modelRank:this.results.length+1});continue;}
      if(node.terminal){node.bound+=this.weights.novelty?this.weights.novelty*this.model.near(node.word).cost:0;node.done=true;this.heap.push(node);continue;}
      this.expanded++;const d=node.word.length;let state=this.catalogue.initial();for(const ch of node.word)state=this.catalogue.next(state,ch,node.n);const ctx=('^^'+node.word).slice(-2);
      for(const ch of this.lettersAt(node.n,d)){const next=this.catalogue.next(state,ch,node.n);if(!next)continue;const word=node.word+ch,cost=node.cost+this.transition(node.n,d,ctx,ch),done=word.length===node.n;
        if(done&&this.catalogue.countState(node.n,next)!==1n)continue;
        const bound=done?cost+this.model.finish(word,this.terminalWeights):cost+this.model.minima(node.n,this.weights,word)+this.future(node.n,d+1,(ctx+ch).slice(-2));
        if(Number.isFinite(bound))this.heap.push({word,n:node.n,cost,bound,done:false,terminal:done});
      }
      if(this.heap.items.length>=this.maxFrontier)this.halted=true;
    }return this.status();
  }
  status(){return {rows:this.results,expanded:this.expanded,visited:this.visited,frontier:this.heap.items.length,exhausted:this.heap.items.length===0,halted:this.halted,frontierBound:this.heap.items[0]?.bound??null,boundStates:this.bounds.size,ordering:'Exact top prefix by the configured model; diversity only reranks the computed pool.'};}
}
