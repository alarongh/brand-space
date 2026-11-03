import {writeFileSync} from 'node:fs';
import {Catalogue} from '../engine.js';
const scenarios=[{lengths:[12]},{lengths:[12],maxOccurrences:1},{lengths:[12],maxOccurrences:2},{lengths:[12],minRepeatGap:2},{lengths:[6],patterns:['CVCCVC'],letterMasks:['?A??A?'],maxOccurrences:2,minRepeatGap:2,allowedConsonantPairs:['BL','BT','CC','FR','LM','NK','NM','NT','PS','RG','RM','RP','RT','SD','SM','XC','YP']}];
const results=scenarios.map(config=>{const start=performance.now(),c=new Catalogue(config),total=c.total(),countMs=performance.now()-start;const seekStart=performance.now(),last=total?c.select(total-1n).name:null;return {config,total:String(total),memoizedStates:c.states,countMs:Number(countMs.toFixed(3)),lastSelectMs:Number((performance.now()-seekStart).toFixed(3)),last};});
const report={measuredAt:new Date().toISOString(),runtime:process.version,platform:process.platform,scope:'One local run. Timing is illustrative, not a guarantee for every device or configuration.',results};
writeFileSync(new URL('../reports/variant-profile.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
