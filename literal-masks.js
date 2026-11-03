export class LiteralMasks {
  constructor(masks){this.nodes=[{next:{},end:false}];this.enabled=masks.length>0;this.cache=new Map();for(const mask of masks){let s=0;for(const ch of mask){if(this.nodes[s].next[ch]===undefined){this.nodes[s].next[ch]=this.nodes.length;this.nodes.push({next:{},end:false});}s=this.nodes[s].next[ch];}this.nodes[s].end=true;}}
  initial(){return this.enabled?'0':'-';}
  next(state,ch){if(state==='-')return '-';const key=state+':'+ch;if(this.cache.has(key))return this.cache.get(key);const next=new Set();for(const id of state.split(',').map(Number))for(const symbol of [ch,'?']){const node=this.nodes[id].next[symbol];if(node!==undefined)next.add(node);}const result=[...next].sort((a,b)=>a-b).join(',');this.cache.set(key,result);return result;}
  accept(state){return state==='-'||state.split(',').some(id=>this.nodes[Number(id)].end);}
}
