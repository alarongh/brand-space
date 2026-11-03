import {mountVariants} from './variants-ui.js?v=7';
import {analyzeCompanies} from './company-analysis.js?v=7';

const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const pct=n=>(100*n).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%';
export async function mountCompanies(root,onTransfer){
  root.textContent='Загружается зафиксированная выборка 1000 компаний…';
  try{
    const response=await fetch(new URL('./data/company-patterns-2026-11-03.json',import.meta.url));
    if(!response.ok)throw Error('Данные недоступны: HTTP '+response.status);
    const data=await response.json();if(data.meta.schema!==1||data.companies.length!==1000)throw Error('Неполная выборка');
    root.replaceChildren();const q=data.meta.quality;
    root.append(element('p','Топ-1000 по капитализации в рейтинге CompaniesMarketCap. Срез 03.11.2026. Каждая компания имеет одинаковый вес; капитализация используется для отбора, а не для взвешивания масок.','company-note'));
    root.append(element('p',`В исходной тысяче: ${q.single_word} однословных и ${q.multi_word} составных названий. ${q.az_forms_1_12} полные A–Z формы укладываются в 1–12 букв; ${q.az_forms_over_12} длиннее 12; ${q.with_digits} содержат цифры и не превращаются в A–Z слова удалением цифр.`,'company-note'));
    const links=element('p',undefined,'company-links');
    for(const [label,url,download] of [['Рейтинг-источник','https://companiesmarketcap.com/',false],['1000 исходных строк CSV','./data/companies-top1000-2026-11-03.csv',true],['Методика и ограничения','./research/README.md',false]]){const a=element('a',label);a.href=url;if(download)a.download='';else{a.target='_blank';a.rel='noopener';}links.append(a);}
    root.append(links);
    const controls=element('div',undefined,'company-controls');
    const select=(id,label,options)=>{const field=element('label',label),s=element('select');s.id=id;for(const [value,text] of options){const o=element('option',text);o.value=value;s.append(o);}field.append(s);controls.append(field);return s;};
    const mode=select('company-mode','Что сравнивать',[['full','Полные A–Z формы'],['single','Только однословные названия'],['tokens','Отдельные слова названий']]);
    const typography=select('company-typography','Написание в источнике',[['all','Любой регистр'],['mixed','Без полностью прописных'],['upper','Только полностью прописные']]);
    const vowelModel=select('company-vowels','Гласные для C/V',[['AEIOU','AEIOU; Y — согласная'],['AEIOUY','AEIOUY; Y — гласная']]);
    const length=select('company-length','Длина формы',[['','Все 1–12'],...Array.from({length:12},(_,i)=>[String(i+1),String(i+1)])]);
    root.append(controls);
    root.append(element('p','Полная форма склеивает слова после удаления пробелов и пунктуации. Дополнения в скобках не участвуют, исходное название сохранено. Прописные буквы — категория написания, а не доказательство аббревиатуры. В режиме отдельных слов одна компания может входить в несколько строк.','company-note'));
    const facts=element('div',undefined,'company-facts'),chart=element('div',undefined,'company-chart');
    const heading=element('h3','Частоты масок C/V'),description=element('p',undefined,'company-note');
    const searchLabel=element('label','Найти маску в таблице'),search=element('input');search.id='company-mask-search';search.placeholder='Например: CVCCVC';searchLabel.append(search);
    const selection=element('p',undefined,'company-note');selection.id='company-selection';
    const apply=element('button','Перенести выбранные маски в поиск','primary');apply.type='button';apply.id='company-transfer-masks';apply.disabled=true;
    const replaceLabel=element('label',undefined,'check'),replace=element('input');replace.type='checkbox';replace.checked=true;replace.id='company-adjust-range';replaceLabel.append(replace,document.createTextNode('Выбрать длины этих масок и гласные анализа'));
    const clear=element('button','Снять выбор','text-button');clear.type='button';
    const actions=element('div',undefined,'actions');actions.append(apply,clear);
    const maskWrap=element('div',undefined,'table-shell company-table'),maskTable=element('table');maskTable.innerHTML='<thead><tr><th>Выбор</th><th>Маска</th><th>Длина</th><th>Компаний</th><th>Доля</th><th>Примеры из источника</th></tr></thead>';
    const tbody=element('tbody');maskTable.append(tbody);maskWrap.append(maskTable);
    root.append(facts,chart,heading,description,searchLabel,selection,replaceLabel,actions,maskWrap);
    root.append(element('p','Выбор масок сам по себе не меняет генератор. После переноса нажмите основную кнопку «Применить правила». Набор масок действует через ИЛИ, остальные условия поиска — совместно с ним. Частота не оценивает благозвучие, оригинальность или причины успеха компании.','company-note'));
    const more=element('details',undefined,'company-more');more.append(element('summary','Начала, окончания и повторяющиеся сочетания'));
    const tables=element('div',undefined,'company-feature-tables');more.append(tables);root.append(more);
    const status=element('p',undefined,'company-note');status.id='company-transfer-status';status.setAttribute('role','status');root.append(status);
    const variantRoot=element('section');root.insertBefore(variantRoot,facts);const updateVariants=mountVariants(variantRoot,data.companies,onTransfer);
    let model=null;const selected=new Set();
    const updateSelection=()=>{selection.textContent='Выбрано масок: '+selected.size;apply.disabled=!selected.size;};
    const transfer=(kind,values)=>{onTransfer({kind,values,vowels:vowelModel.value,adjustRange:replace.checked});status.textContent='Перенесено в настройки поиска. Нажмите «Применить правила», чтобы пересчитать варианты.';};
    apply.onclick=()=>transfer('patterns',[...selected]);clear.onclick=()=>{selected.clear();renderMasks();};
    function renderMasks(){tbody.replaceChildren();const query=search.value.trim().toUpperCase();
      for(const row of model.tables.masks){if(query&&!row.value.includes(query))continue;const tr=element('tr'),td=element('td'),check=element('input');check.type='checkbox';check.checked=selected.has(row.value);check.setAttribute('aria-label','Маска '+row.value);check.onchange=()=>{if(check.checked)selected.add(row.value);else selected.delete(row.value);updateSelection();};const target=element('label',undefined,'company-pick');target.append(check);td.append(target);tr.append(td);
        for(const [value,cls] of [[row.value,'mono'],[row.value.length,''],[row.companies,''],[pct(row.share),''],[row.examples.map(e=>e.name).join(' · '),'company-examples']])tr.append(element('td',value,cls));tbody.append(tr);
      }updateSelection();}
    function featureTable(title,key,kind){
      const block=element('div',undefined,'company-feature'),h=element('h4',title);block.append(h);
      const table=element('table');table.innerHTML='<thead><tr><th>Буквы</th><th>Компаний</th><th>Доля</th><th>В поиск</th></tr></thead>';
      const body=element('tbody');for(const row of model.tables[key].slice(0,15)){const tr=element('tr');tr.append(element('td',row.value,'mono'),element('td',row.companies),element('td',pct(row.share)));const cell=element('td'),button=element('button','Добавить');button.type='button';button.setAttribute('aria-label',`Добавить ${row.value}: ${title}`);button.onclick=()=>transfer(kind,[row.value]);cell.append(button);tr.append(cell);body.append(tr);}table.append(body);block.append(table);return block;
    }
    function render(){
      const options={mode:mode.value,typography:typography.value,vowels:vowelModel.value,length:length.value?Number(length.value):null};
      model=analyzeCompanies(data.companies,options);updateVariants(options,model);facts.replaceChildren();
      for(const [label,value] of [['Компаний в расчёте',model.denominator+' / 1000'],['Различных масок',model.tables.masks.length],['С 3+ согласными подряд',(model.flags.three_consonants||0)+' · '+(model.denominator?pct((model.flags.three_consonants||0)/model.denominator):'—')]]){const div=element('div');div.append(element('span',label),element('strong',value));facts.append(div);}
      description.textContent=`C — согласная, V — гласная (${vowelModel.value}). Доля считается от ${model.denominator} подходящих компаний. ${mode.value==='tokens'?'Каждая компания учитывается один раз на маску; доли разных строк могут пересекаться.':'Одна форма на компанию; строки масок не пересекаются.'}`;
      if(!model.denominator)description.textContent='В этой группе нет подходящих названий. Измените длину или параметры анализа.';
      chart.replaceChildren(element('h3','Длины в выбранной группе'));
      const list=element('ol',undefined,'company-bars');list.setAttribute('aria-label','Число компаний по длине формы');const max=Math.max(1,...model.tables.lengths.map(r=>r.companies));
      for(const row of [...model.tables.lengths].sort((a,b)=>a.value-b.value)){const li=element('li'),name=element('span',row.value+' букв'),track=element('span',undefined,'company-bar-track'),bar=element('span',undefined,'company-bar');bar.style.width=(row.companies/max*100)+'%';track.append(bar);const count=element('span',`${row.companies} · ${pct(row.share)}`);li.append(name,track,count);list.append(li);}chart.append(list);
      chart.append(element('p',mode.value==='tokens'?'Число компаний с подходящим словом этой длины; категории могут пересекаться.':'Число компаний. Каждая компания входит в одну категорию длины.','company-note'));
      tables.replaceChildren();for(const spec of [['Начало: 2 буквы','prefix2','prefixes'],['Начало: 3 буквы','prefix3','prefixes'],['Конец: 2 буквы','suffix2','suffixes'],['Конец: 3 буквы','suffix3','suffixes'],['Сочетание: 2 буквы','bigram','required'],['Сочетание: 3 буквы','trigram','required']])tables.append(featureTable(...spec));
      more.querySelectorAll('.company-note').forEach(e=>e.remove());more.append(element('p','Показаны 15 наиболее частых строк в каждой таблице; это обзор статистики, не ограничение генератора. Считаются компании, содержащие сочетание, а не общее число повторов. Начала и окончания отражают буквы, а не доказанное словообразование. «Добавить» переносит буквы в соответствующее пользовательское поле.','company-note'));
      renderMasks();
    }
    search.oninput=renderMasks;for(const s of [mode,typography,length])s.onchange=render;
    vowelModel.onchange=()=>{selected.clear();render();};render();
  }catch(e){root.replaceChildren(element('p','Не удалось загрузить анализ: '+e.message,'company-note'));}
}
