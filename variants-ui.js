import {namingVariants} from './naming-variants.js?v=6';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const percent=n=>(n*100).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%';
export function mountVariants(root,companies,onTransfer){
  root.className='variant-builder';root.id='variant-builder';
  root.append(el('h3','Из частой маски — в варианты названий'));
  root.append(el('p','Выберите структуру, затем одну или две фиксированные буквы. Частота шаблона — число компаний, где эти буквы одновременно стоят в указанных позициях. Варианты сортируются по частоте; это не оценка качества названия.','company-note'));
  const controls=el('div',undefined,'company-controls');
  function select(id,title,options){const label=el('label',title),input=el('select');input.id=id;for(const [value,text] of options){const o=el('option',text);o.value=value;input.append(o);}label.append(input);controls.append(label);return input;}
  const family=select('variant-family','Маска C/V',[]),anchors=select('variant-anchors','Фиксированных букв',[['1','Одна позиция'],['2','Две позиции одновременно']]);
  const supportLabel=el('label','Не менее компаний'),support=el('input');support.type='number';support.min=1;support.value=2;support.id='variant-support';supportLabel.append(support);controls.append(supportLabel);root.append(controls);
  const facts=el('p',undefined,'company-note');facts.id='variant-facts';root.append(facts);
  const settings=el('details');settings.append(el('summary','Условия повторов и чтения для переноса'));
  settings.append(el('p','Пустые поля сохраняют текущие правила поиска. Числа — дополнительные жёсткие ограничения. Интервал — число букв между соседними вхождениями одной буквы; правило не требует наличия повтора. Читаемость здесь регулируется составом букв, C/V и разрешёнными парами, произношение не гарантируется.','company-note'));
  const grid=el('div',undefined,'variant-settings');const fields={};
  for(const [key,title,max] of [['maxOccurrences','Вхождений одной буквы ≤',12],['maxSame','Одинаковых подряд ≤',12],['minRepeatGap','Интервал между повторами ≥',11],['maxRepeatGap','Интервал между повторами ≤',11],['minDistinct','Разных букв ≥',12],['maxDistinct','Разных букв ≤',12],['maxC','Согласных подряд ≤',12],['maxV','Гласных подряд ≤',12]]){const label=el('label',title),input=el('input');input.type='number';input.min=0;input.max=max;input.placeholder='Сохранить текущее';input.id='variant-'+key;fields[key]=input;label.append(input);grid.append(label);}settings.append(grid);
  const pairLabel=el('label',undefined,'check'),pairCheck=el('input');pairCheck.type='checkbox';pairCheck.id='variant-pairs';pairLabel.append(pairCheck,document.createTextNode('Разрешить только наблюдавшиеся здесь пары CC и VV'));settings.append(pairLabel);
  const pairNote=el('p',undefined,'company-note');settings.append(pairNote);root.append(settings);
  const statistics=el('div',undefined,'variant-statistics');root.append(statistics);
  const searchLabel=el('label','Поиск буквенного шаблона'),search=el('input');search.id='variant-search';search.placeholder='Например: ?A';searchLabel.append(search);root.append(searchLabel);
  const tableWrap=el('div',undefined,'table-shell company-table'),table=el('table');table.innerHTML='<thead><tr><th>Шаблон A–Z/?</th><th>Компаний</th><th>Доля внутри маски</th><th>Примеры из источника</th><th>В поиск</th></tr></thead>';
  const body=el('tbody');table.append(body);tableWrap.append(table);root.append(tableWrap);
  const plain=el('button','Перенести всю маску без фиксированных букв','outline');plain.type='button';plain.id='variant-transfer-family';root.append(plain);
  root.append(el('p','«В фильтр» заменяет набор масок C/V, буквенные шаблоны и выбранные длины одним вариантом, переносит гласные анализа и заполненные условия выше. Остальные ваши правила сохраняются. Затем нажмите «Применить правила». Все подходящие сочетания доступны в основном каталоге.','company-note'));
  const status=el('p',undefined,'company-note');status.id='variant-status';status.setAttribute('role','status');root.append(status);
  let options={},model=null;
  function transfer(template){try{
    const patch={patterns:[family.value],letterMasks:template?[template]:[],lengths:[family.value.length],vowels:options.vowels};
    for(const [key,input] of Object.entries(fields))if(input.value!==''){const n=Number(input.value);if(!Number.isInteger(n)||n<0||n>Number(input.max))throw Error('Проверьте числовые условия');patch[key]=n;}
    if(pairCheck.checked){patch.allowedConsonantPairs=model.ccPairs.map(r=>r.value);patch.allowedVowelPairs=model.vvPairs.map(r=>r.value);}
    onTransfer({kind:'variant',patch});status.textContent='Вариант перенесён. Нажмите основную кнопку «Применить правила».';
  }catch(e){status.textContent=e.message;}}
  plain.onclick=()=>transfer('');
  function renderRows(){body.replaceChildren();const query=search.value.trim().toUpperCase();for(const row of model.variants){if(query&&!row.template.includes(query))continue;const tr=el('tr');tr.append(el('td',row.template,'mono'),el('td',row.companies),el('td',percent(row.share)),el('td',row.examples.map(e=>e.name).join(' · '),'company-examples'));const td=el('td'),button=el('button','В фильтр');button.type='button';button.setAttribute('aria-label','В фильтр '+row.template);button.onclick=()=>transfer(row.template);td.append(button);tr.append(td);body.append(tr);}if(!body.children.length){const tr=el('tr'),td=el('td','Подходящих шаблонов нет. Измените порог, число позиций или поиск.');td.colSpan=5;tr.append(td);body.append(tr);}}
  function render(){
    const minSupport=Number(support.value);if(!Number.isInteger(minSupport)||minSupport<1){facts.textContent='Минимум компаний должен быть положительным целым.';return;}
    model=namingVariants(companies,options,family.value,{anchors:Number(anchors.value),minSupport});
    facts.textContent=`Маска ${family.value||'—'}: ${model.denominator} компаний. Буквенных шаблонов с порогом ${minSupport}: ${model.variants.length}. ? — любая буква; это отдельная маска, буквы C и V в ней означают сами буквы.`;
    plain.disabled=!model.denominator;
    pairNote.textContent='Пары CC: '+(model.ccPairs.map(r=>r.value).join(', ')||'нет в этой структуре')+'. Пары VV: '+(model.vvPairs.map(r=>r.value).join(', ')||'нет в этой структуре')+'. Пустой список пар не ограничивает поиск.';
    statistics.replaceChildren();for(const [key,title,field] of [['maxOccurrences','Максимум вхождений одной буквы','maxOccurrences'],['distinct','Количество разных букв','maxDistinct'],['minRepeatGap','Минимальный интервал','minRepeatGap'],['maxRepeatGap','Максимальный интервал','maxRepeatGap']]){
      const block=el('div');block.append(el('h4',title));const text=el('p',undefined,'company-note');text.textContent=model.stats[key].map(r=>`${r.value===null?'без повторов':r.value}: ${r.companies} (${percent(r.share)})`).join(' · ')||'Нет данных';block.append(text);
      const choices=el('div',undefined,'stat-choices');for(const r of model.stats[key]){const label=r.value===null?'Без повторов':key==='distinct'?`Ровно ${r.value} разных`:key==='minRepeatGap'?`Интервал ≥ ${r.value}`:key==='maxRepeatGap'?`Интервал ≤ ${r.value}`:`Вхождений ≤ ${r.value}`;const button=el('button',label,'text-button');button.type='button';button.onclick=()=>{if(r.value===null)fields.maxOccurrences.value='1';else{fields[field].value=r.value;if(key==='distinct')fields.minDistinct.value=r.value;}settings.open=true;status.textContent='Условие «'+label+'» заполнено выше. Перенесите выбранный вариант в фильтр.';};choices.append(button);}block.append(choices);statistics.append(block);
    }
    renderRows();
  }
  search.oninput=()=>{if(model)renderRows();};for(const input of [family,anchors,support])input.onchange=render;
  return (nextOptions,analysis)=>{options=nextOptions;const previous=family.value;family.replaceChildren();for(const row of analysis.tables.masks){const o=el('option',`${row.value} · ${row.companies} компаний`);o.value=row.value;family.append(o);}if(analysis.tables.masks.some(r=>r.value===previous))family.value=previous;render();};
}
