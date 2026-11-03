import {Catalogue} from './engine.js';
let catalogue=null;
self.onmessage=({data:m})=>{const started=performance.now();try{
  if(m.type==='init')catalogue=new Catalogue(m.config);
  if(!catalogue)throw Error('Сначала примените настройки');
  let result;
  if(m.type==='init'||m.type==='page')result=catalogue.page(m.start??'0',m.limit??100);
  else if(m.type==='seek'){const start=catalogue.rankBefore(m.word);result={...catalogue.page(start,100),exact:catalogue.matches(m.word)};}
  else throw Error('Неизвестная операция');
  self.postMessage({id:m.id,result,ms:performance.now()-started});
}catch(e){self.postMessage({id:m.id,error:e.message,ms:performance.now()-started});}};
