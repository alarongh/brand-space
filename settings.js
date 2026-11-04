import {DEFAULTS,normalize} from './engine.js?v=11';

// Keep old settings as a downloadable backup, but do not reapply retired presets.
export function restoreSettings(currentText,legacyText) {
  const parse=text=>{try{return JSON.parse(text||'null');}catch{return null;}};
  const current=parse(currentText),legacy=parse(legacyText);
  if(current?.schema===2){
    try{return {config:normalize(current.config),favorites:current.favorites||{},legacyConfig:current.legacyConfig||null,migrated:false};}catch{}
  }
  return {config:normalize(DEFAULTS),favorites:current?.favorites||legacy?.favorites||{},legacyConfig:current?.legacyConfig||legacy?.config||null,migrated:Boolean(legacy?.config||current)};
}
