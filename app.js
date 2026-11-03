import {DEFAULTS,normalize,features} from './engine.js?v=3';
import {restoreSettings} from './settings.js?v=3';
const $=id=>document.getElementById(id),number=s=>BigInt(s).toLocaleString('ru-RU'),split=s=>s.toUpperCase().split(/[\s,;]+/).filter(Boolean);
const STORAGE='brand-space-v2';
let stored=null,legacy=null;try{stored=localStorage.getItem(STORAGE);legacy=localStorage.getItem('brand-space-v1');}catch{}
const settings=restoreSettings(stored,legacy);
let favorites=settings.favorites,active=settings.config,page=null,worker=null,serial=0,pending=new Map(),exporting=false,exportCancelled=false;
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({schema:2,config:active,favorites,legacyConfig:settings.legacyConfig}));}catch{message('Браузер не сохранил настройки. Скачайте копию избранного.',true);}}
function message(text,error=false){$('status').textContent=text;$('status').className=error?'error':'';}
function spawn(){if(worker)worker.terminate();for(const {reject} of pending.values())reject(Error('Расчёт остановлен'));pending.clear();worker=new Worker(new URL('./worker.js?v=3',import.meta.url),{type:'module'});worker.onmessage=({data:m})=>{const p=pending.get(m.id);if(!p)return;pending.delete(m.id);if(m.error)p.reject(Error(m.error));else p.resolve(m);};worker.onerror=e=>{message('Ошибка вычислителя: '+e.message,true);for(const {reject} of pending.values())reject(Error(e.message));pending.clear();};}
function request(type,data={}){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});worker.postMessage({id,type,...data});});}
let positionSerial=0;
function addPosition(rule={position:1,allowed:'',blocked:''}){
  const row=document.createElement('div');row.className='position-rule';
  const id=++positionSerial;
  for(const [key,title] of [['position','Позиция'],['allowed','Можно'],['blocked','Нельзя']]){
    const label=document.createElement('label');label.textContent=title;
    const input=document.createElement('input');input.dataset.key=key;input.id='position-'+id+'-'+key;
    input.setAttribute('aria-label',title+' в правиле '+id);input.value=rule[key];
    if(key==='position'){input.type='number';input.min=-12;input.max=12;}else{input.placeholder='A–Z';input.spellcheck=false;}
    label.append(input);row.append(label);
  }
  const remove=document.createElement('button');remove.type='button';remove.textContent='Убрать';remove.className='text-button';remove.onclick=()=>{row.remove();markDraft();};row.append(remove);$('position-rules').append(row);
}
function formConfig(){
  const c={lengths:[...$('length-choices').querySelectorAll('input:checked')].map(el=>Number(el.value))};
  for(const key of ['allowed','vowels','blocked','prefix','contains','suffix','pattern','maxC','maxV','maxSame','minV','maxVowels','requiredMode'])c[key]=$(key).value;
  for(const [key,id] of [['excluded','excluded'],['bannedSuffixes','banned-suffixes'],['stops','stops'],['required','required'],['prefixes','prefixes'],['suffixes','suffixes'],['bannedPrefixes','banned-prefixes'],['warningSuffixes','warning-suffixes']])c[key]=split($(id).value);
  c.positionRules=[...$('position-rules').children].map(row=>Object.fromEntries([...row.querySelectorAll('input')].map(el=>[el.dataset.key,el.value]))).filter(rule=>rule.allowed.trim()||rule.blocked.trim());
  c.noInnerY=$('noInnerY').checked;return normalize(c);
}
function setForm(c){
  for(const input of $('length-choices').querySelectorAll('input'))input.checked=c.lengths.includes(Number(input.value));
  $('length-caption').textContent='Выбраны длины: '+c.lengths.join(', ');
  for(const key of ['allowed','vowels','blocked','prefix','contains','suffix','pattern','maxC','maxV','maxSame','minV','maxVowels','requiredMode'])$(key).value=c[key]??'';
  for(const [key,id] of [['excluded','excluded'],['bannedSuffixes','banned-suffixes'],['stops','stops'],['required','required'],['prefixes','prefixes'],['suffixes','suffixes'],['bannedPrefixes','banned-prefixes'],['warningSuffixes','warning-suffixes']])$(id).value=c[key].join(key==='stops'?'\n':', ');
  $('position-rules').replaceChildren();c.positionRules.forEach(addPosition);$('noInnerY').checked=c.noInnerY;
}
function markDraft(){$('draft-note').textContent='Изменения ещё не применены. Нажмите «Применить правила». ';}
function tags(){
  const c=active,t=[];if(c.blocked)t.push('Без '+c.blocked);if(c.allowed!==DEFAULTS.allowed)t.push('Алфавит '+c.allowed);
  for(const [key,label] of [['maxC','Согласных подряд'],['maxV','Гласных подряд'],['maxSame','Одинаковых подряд']])if(c[key]!==null)t.push(label+' ≤ '+c[key]);
  for(const [key,label] of [['prefix','Начало'],['contains','Содержит'],['suffix','Конец'],['pattern','Шаблон']])if(c[key])t.push(label+' '+c[key]);
  for(const [key,label] of [['excluded','Запрет сочетаний'],['bannedSuffixes','Запрет окончаний'],['bannedPrefixes','Запрет начал'],['prefixes','Допустимые начала'],['suffixes','Допустимые окончания'],['stops','Точные исключения']])if(c[key].length)t.push(label+': '+c[key].join(', '));
  if(c.required.length)t.push((c.requiredMode==='all'?'Содержит все: ':'Содержит любое: ')+c.required.join(', '));
  for(const r of c.positionRules)t.push('Позиция '+r.position+(r.allowed?' / можно '+r.allowed:'')+(r.blocked?' / нельзя '+r.blocked:''));
  if(c.minV||c.maxVowels<12)t.push(`Гласных ${c.minV}–${c.maxVowels}`);if(c.noInnerY)t.push('Y только в конце');
  if(!t.length)t.push('Все сочетания / фильтры выключены');
  $('active-rules').replaceChildren(...t.map(text=>{const e=document.createElement('span');e.textContent=text;return e;}));
}
function updateFavorites(){$('fav-count').textContent=Object.keys(favorites).length;}
function toggle(word){if(favorites[word])delete favorites[word];else favorites[word]={name:word,note:'',added:new Date().toISOString()};persist();updateFavorites();if(page)render(page);}
function render(p){page=p;$('total').textContent=number(p.total);$('raw').textContent=number(p.raw);$('range-label').textContent=`сочетаний / длины ${active.lengths.join(', ')}`;$('rows').replaceChildren();for(const row of p.rows){const tr=document.createElement('tr');const cell=(text,cls)=>{const td=document.createElement('td');td.textContent=text;if(cls)td.className=cls;tr.append(td);return td;};const b=document.createElement('button');b.textContent=favorites[row.name]?'Выбрано':'Выбрать';b.className=favorites[row.name]?'selected':'';b.setAttribute('aria-label',`${favorites[row.name]?'Убрать':'Сохранить'} ${row.name}`);b.onclick=()=>toggle(row.name);cell('').append(b);const name=cell(row.name,'name');name.title='Постоянный ID A–Z: '+row.id;cell(row.transcription);cell(row.structure,'mono');cell(row.vowels);cell([row.innerY?'Y внутри':'',row.warningSuffix?'Окончание '+row.warningSuffix:'',row.repeats?'Удвоение':''].filter(Boolean).join(' · ')||'—','feature');$('rows').append(tr);}
  $('empty').hidden=p.rows.length>0;$('empty').textContent=BigInt(p.total)>0n?'После этой позиции вариантов больше нет. Вернитесь назад или измените позицию.':'Под эти правила не подходит ни одно сочетание. Ослабьте условия поиска.';$('prev').disabled=BigInt(p.start)===0n;$('next').disabled=p.next===null;const end=BigInt(p.start)+BigInt(p.rows.length);$('page-label').textContent=p.rows.length?`${number(BigInt(p.start)+1n)}–${number(end)} из ${number(p.total)}`:(BigInt(p.total)>0n?'Конец выборки':'0 результатов');$('jump-position').value=String(BigInt(p.start)+1n);tags();}
async function load(type,data={}){$('cancel').hidden=false;message('Вычисление точного результата…');try{const m=await request(type,data);render(m.result);$('timing').textContent=`${(m.ms/1000).toLocaleString('ru-RU',{maximumFractionDigits:3})} с · ${number(m.result.states)} состояний · точное количество`;message(m.result.exact===false?(m.result.rows.length?'Точного совпадения под этими правилами нет. Показана ближайшая следующая позиция.':'Точного совпадения нет. Следующих вариантов в выборке нет; используйте «Назад».'):'');return m.result;}catch(e){message(e.message,true);}finally{$('cancel').hidden=true;}}
async function apply(config){try{active=normalize(config);$('draft-note').textContent='';setForm(active);persist();spawn();page=null;$('rows').replaceChildren();$('total').textContent='Вычисление…';$('prev').disabled=$('next').disabled=true;if(innerWidth<=720)$('filter-panel').open=false;await load('init',{config:active});}catch(e){message(e.message,true);}}
$('filters').onsubmit=e=>{e.preventDefault();try{apply(formConfig());}catch(e){message(e.message,true);}};
$('reset').onclick=()=>apply(DEFAULTS);$('cancel').onclick=()=>{worker?.terminate();for(const {reject} of pending.values())reject(Error('Расчёт остановлен. Измените правила и примените их снова.'));pending.clear();$('cancel').hidden=true;};
$('next').onclick=()=>page?.next&&load('page',{start:page.next});$('prev').onclick=()=>page&&load('page',{start:String(BigInt(page.start)>100n?BigInt(page.start)-100n:0n)});
$('jump').onclick=()=>{try{const n=BigInt($('jump-position').value.replace(/\s/g,''));if(n<1n||!page||n>BigInt(page.total))throw Error('Позиция вне выборки');load('page',{start:String(n-1n)});}catch(e){message(e.message,true);}};
$('seek').onclick=()=>{try{const word=$('seek-word').value.trim().toUpperCase();if(!/^[A-Z]{1,12}$/.test(word))throw Error('Введите название A–Z длиной 1–12');load('seek',{word});}catch(e){message(e.message,true);}};
$('seek-word').onkeydown=e=>{if(e.key==='Enter')$('seek').click();};
function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
$('save-rules').onclick=()=>{try{download('brand-space-rules.json',JSON.stringify(formConfig(),null,2));}catch(e){message(e.message,true);}};
$('load-rules').onchange=async e=>{try{const file=e.target.files[0];if(file)await apply(normalize(JSON.parse(await file.text())));}catch(e){message(e.message,true);}e.target.value='';};
$('dictionary').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const text=await file.text();const words=text.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));if(words.some(w=>!/^[a-z]+$/i.test(w)))throw Error('TXT-словарь: одно точное название A–Z в строке, комментарии начинаются с #');const list=[...new Set([...split($('stops').value),...words.map(s=>s.toUpperCase())])];$('stops').value=list.join('\n');$('dictionary-info').textContent=`Загружено точных исключений: ${list.length}. Нажмите «Применить правила».`;}catch(e){message(e.message,true);}e.target.value='';};
function showFavorites(){const container=$('favorite-list');container.replaceChildren();for(const item of Object.values(favorites).sort((a,b)=>a.name.localeCompare(b.name))){const row=features(item.name,active.vowels,active.warningSuffixes),div=document.createElement('div');div.className='favorite-item';const head=document.createElement('div');head.className='section-head';const title=document.createElement('strong');title.textContent=item.name;const detail=document.createElement('span');detail.textContent=row.transcription+' / '+row.structure;const remove=document.createElement('button');remove.textContent='Убрать';remove.onclick=()=>{toggle(item.name);showFavorites();};head.append(title,detail,remove);const note=document.createElement('textarea');note.placeholder='Заметка';note.value=item.note||'';note.setAttribute('aria-label','Заметка к '+item.name);note.oninput=()=>{favorites[item.name].note=note.value;persist();};div.append(head,note);container.append(div);}if(!container.children.length)container.textContent='Сохранённых названий пока нет.';}
$('favorites').onclick=()=>{showFavorites();$('favorites-dialog').showModal();};$('close-favorites').onclick=()=>$('favorites-dialog').close();
$('backup-favorites').onclick=()=>download('brand-space-favorites.json',JSON.stringify({version:1,favorites:Object.values(favorites)},null,2));
$('restore-favorites').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const data=JSON.parse(await file.text());if(data.version!==1||!Array.isArray(data.favorites))throw Error('Неверный формат избранного');const additions={};for(const item of data.favorites){if(!/^[A-Z]{1,12}$/.test(item.name)||typeof item.note!=='string')throw Error('Некорректная запись избранного');additions[item.name]={name:item.name,note:item.note,added:String(item.added||'')};}favorites={...favorites,...additions};persist();updateFavorites();showFavorites();if(page)render(page);}catch(e){message(e.message,true);}e.target.value='';};

const csvHeader='id,name,length,vowels,structure,transcription,inner_y,warning_suffix,repeats,ngram_frequency\r\n';
const csvRows=rows=>rows.map(r=>[r.id,r.name,r.length,r.vowels,r.structure,r.transcription,r.innerY,r.warningSuffix,r.repeats,''].map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\r\n')+(rows.length?'\r\n':'');
async function exportData(directoryMode){if(exporting)return;let ew,writable=null;try{
  if(!page)throw Error('Сначала примените правила');const config=structuredClone(active),total=BigInt(page.total),partSize=Number($('split').value);let at=BigInt($('export-start').value.replace(/\s/g,''))-1n;if(at<0n||at>=total)throw Error('Начальная позиция вне выборки');if(!Number.isInteger(partSize)||partSize<1||partSize>1000000)throw Error('Размер части: 1–1 000 000');
  let directory;if(directoryMode){if(!window.showDirectoryPicker)throw Error('Этот браузер не поддерживает запись в папку. Используйте «Скачать часть CSV» и продолжайте с сохранённой позиции.');directory=await window.showDirectoryPicker({mode:'readwrite'});}
  exporting=true;exportCancelled=false;$('export-stop').hidden=false;$('export-directory').disabled=$('export-part').disabled=true;
  ew=new Worker(new URL('./worker.js?v=3',import.meta.url),{type:'module'});let eid=0;
  const ask=(type,data)=>new Promise((resolve,reject)=>{ew.onmessage=({data:m})=>m.error?reject(Error(m.error)):resolve(m.result);ew.onerror=e=>reject(Error(e.message));ew.postMessage({id:++eid,type,...data});});
  await ask('init',{config,limit:1});
  do {const start=at,end=at+BigInt(partSize)<total?at+BigInt(partSize):total;const filename=`names_${start+1n}-${end}.csv`;let chunks=['\ufeff'+csvHeader];
    if(directory){const file=await directory.getFileHandle(filename,{create:true});if((await file.getFile()).size>0)throw Error('Файл '+filename+' уже существует. Выберите другую папку, чтобы сохранить старый экспорт.');writable=await file.createWritable();await writable.write(chunks[0]);chunks=[];}
    while(at<end&&!exportCancelled){const batch=await ask('page',{start:String(at),limit:Number(end-at>1000n?1000n:end-at)});if(exportCancelled)break;const text=csvRows(batch.rows);if(writable)await writable.write(text);else chunks.push(text);at+=BigInt(batch.rows.length);$('export-status').textContent=`Подготовлено ${number(at-start)} строк этой части / всего ${number(total)}. Позиция ${number(at+1n)}.`;if(!batch.rows.length)throw Error('Неожиданно пустая часть');}
    if(exportCancelled){if(writable){await writable.abort();writable=null;}at=start;break;}
    if(writable){await writable.close();writable=null;}else download(filename,chunks.join(''),'text/csv;charset=utf-8');
    $('export-start').value=String(at+1n);try{localStorage.setItem('brand-space-export',JSON.stringify({config,start:String(at),total:String(total)}));}catch{}
    if(!directory)break;
  }while(at<total&&!exportCancelled);
  $('export-status').textContent=exportCancelled?'Экспорт остановлен. Частичная часть не сохранена. Точка продолжения указана выше.':at===total?'Вся выборка экспортирована.':`Часть готова. Следующая начнётся с позиции ${number(at+1n)}. Нажмите «Скачать часть CSV» снова.`;
}catch(e){$('export-status').textContent=e.name==='AbortError'?'Выбор папки отменён.':e.message;if(writable)await writable.abort().catch(()=>{});}finally{ew?.terminate();exporting=false;$('export-stop').hidden=true;$('export-directory').disabled=$('export-part').disabled=false;}}
$('export-directory').onclick=()=>exportData(true);$('export-part').onclick=()=>exportData(false);$('export-stop').onclick=()=>{exportCancelled=true;$('export-status').textContent='Остановка после текущего блока…';};
const resumeExport=document.createElement('button');resumeExport.className='text-button';resumeExport.textContent='Восстановить точку прошлого экспорта';resumeExport.onclick=async()=>{try{const last=JSON.parse(localStorage.getItem('brand-space-export')||'null');if(!last)throw Error('Сохранённого экспорта пока нет');const config=normalize(last.config);await apply(config);$('export-start').value=String(BigInt(last.start)+1n);$('export-status').textContent='Восстановлены правила и точка продолжения. Выберите папку или скачайте следующую часть.';}catch(e){$('export-status').textContent=e.message;}};$('export-status').before(resumeExport);
for(let n=1;n<=12;n++){const label=document.createElement('label');label.className='length-choice';const input=document.createElement('input');input.type='checkbox';input.value=n;input.name='length';input.setAttribute('form','filters');input.setAttribute('aria-label','Длина '+n);const text=document.createElement('span');text.textContent=n;label.append(input,text);$('length-choices').append(label);}
$('length-choices').addEventListener('input',()=>{const selected=[...$('length-choices').querySelectorAll('input:checked')].map(el=>el.value);$('length-caption').textContent=selected.length?'Выбраны длины: '+selected.join(', '):'Выберите хотя бы одну длину';markDraft();});
$('filters').addEventListener('input',markDraft);
$('add-position').onclick=()=>{addPosition();markDraft();};
if(settings.migrated){$('migration-notice').hidden=false;}
$('download-legacy').hidden=!settings.legacyConfig;
$('download-legacy').onclick=()=>download('brand-space-previous-rules.json',JSON.stringify(settings.legacyConfig,null,2));
setForm(active);updateFavorites();apply(active);

addEventListener('resize',()=>{if(innerWidth>720)$('filter-panel').open=true;});
