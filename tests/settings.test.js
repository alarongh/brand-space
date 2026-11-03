import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreSettings} from '../settings.js';

test('migration keeps favorites and backs up old rules without reapplying them',()=>{
  const old={config:{lengths:[4,5,6],blocked:'QWXJ',maxC:2},favorites:{TORIN:{name:'TORIN',note:'Моя заметка'}}};
  const restored=restoreSettings(null,JSON.stringify(old));
  assert.deepEqual(restored.config.lengths,[3,4,5,6,7,8,9,10,11,12]);
  assert.equal(restored.config.blocked,'');assert.equal(restored.config.maxC,null);
  assert.deepEqual(restored.favorites,old.favorites);assert.deepEqual(restored.legacyConfig,old.config);assert(restored.migrated);
});
test('new custom settings preserve disjoint lengths and custom constraints',()=>{
  const restored=restoreSettings(JSON.stringify({schema:2,config:{lengths:[3,7,12],required:['AR','NO'],positionRules:[{position:-1,allowed:'AE',blocked:''}],maxOccurrences:2,minRepeatGap:1,letterMasks:['?A?'],allowedConsonantPairs:['ST'],letterRules:[{letter:'A',min:1,max:2,minGap:1}]},favorites:{}}),null);
  assert.deepEqual(restored.config.lengths,[3,7,12]);assert.deepEqual(restored.config.required,['AR','NO']);assert.equal(restored.config.positionRules[0].position,-1);assert(!restored.migrated);
  assert.equal(restored.config.maxOccurrences,2);assert.equal(restored.config.minRepeatGap,1);assert.deepEqual(restored.config.letterMasks,['?A?']);assert.deepEqual(restored.config.allowedConsonantPairs,['ST']);assert.deepEqual(restored.config.letterRules,[{letter:'A',min:1,max:2,minGap:1,maxGap:null}]);
});
test('invalid saved settings fall back to unrestricted catalogue and keep favorites',()=>{
  const restored=restoreSettings(JSON.stringify({schema:2,config:{lengths:[99]},favorites:{ABC:{name:'ABC',note:'Сохранить'}}}),null);
  assert.equal(restored.config.blocked,'');assert.equal(restored.favorites.ABC.note,'Сохранить');assert.equal(restored.config.lengths.at(-1),12);
});
test('malformed storage does not prevent startup',()=>{
  const restored=restoreSettings('{broken','{also broken');assert.equal(restored.config.lengths[0],3);assert.deepEqual(restored.favorites,{});
});
