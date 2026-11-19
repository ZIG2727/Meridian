import { loadJSON, readStored, writeStored } from "../storage.js";
import { animateProgress, celebrate, prefersReducedMotion } from "../motion.js";

const MODULES = {
  english: { title: "Английский", subtitle: "RU → EN · интервальное повторение", color: "english" },
  chess: { title: "Шахматы", subtitle: "Правила · тактика · практика", color: "chess" },
  python: { title: "Python", subtitle: "Основы программирования", color: "python" }
};
const ROOT = new URL("../../data/", import.meta.url);
const cache = new Map();
const keys = module => ({
  completed: "mrd:" + module + ":completed",
  session: "mrd:" + module + ":session",
  srs: "mrd:english:srs",
  last: "mrd:lastLesson"
});
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const urlFor = (module, unitId, lessonId) => "#/" + module + (unitId ? "/" + unitId : "") + (lessonId ? "/" + lessonId : "");
function readCompleted(module) {
 const stored=readStored(keys(module).completed,[],value=>Array.isArray(value)&&value.every(item=>typeof item==="string"));
 const legacy={
  chess:{notation:"ch-basics-board-01",pieces:"ch-basics-knight-01",pawn:"ch-basics-pawn-01",mate:"ch-endgames-basic-mates-01"},
  python:{print:"py-basics-print-01",variables:"py-basics-variables-01",conditions:"py-control-if-01",loops:"py-control-loops-01"}
 };
 let changed=false;
 for(const [oldId,newId] of Object.entries(legacy[module]||{})){
  if(stored.includes(oldId)&&!stored.includes(newId)){stored.push(newId);changed=true;}
 }
 if(changed)writeStored(keys(module).completed,stored);
 return stored;
}

async function curriculum(module) {
  const url = new URL(module + "/curriculum.json", ROOT);
  const data = await loadJSON(url);
  if (!data || data.module !== module || !Array.isArray(data.units)) throw new Error("Повреждён список учебных юнитов.");
  const ids = new Set();
  for (const unit of data.units) {
    if (!unit.unitId || ids.has(unit.unitId) || !Array.isArray(unit.lessonIds) || unit.lessonIds.length < 3 || unit.lessonIds.length > 4) throw new Error("Неверная структура юнита " + (unit.unitId || ""));
    ids.add(unit.unitId);
  }
  return data;
}
async function unitData(module, unitId) {
  const key = module + ":" + unitId;
  if (!cache.has(key)) cache.set(key, loadJSON(new URL(module + "/units/" + unitId + ".json", ROOT)));
  const data = await cache.get(key);
  if (data.unitId !== unitId || !Array.isArray(data.lessons)) throw new Error("Не удалось проверить содержимое юнита.");
  return data;
}
function unitStats(unit, completed) {
  const done = unit.lessonIds.filter(id => completed.includes(id)).length;
  return { done, total: unit.lessonIds.length, status: done === 0 ? "not-started" : done === unit.lessonIds.length ? "completed" : "in-progress" };
}
function header(module, crumbs = []) {
  const meta = MODULES[module];
  return '<header class="site-header"><div class="header-inner"><a class="brand" href="#/" aria-label="Meridian — главная"><img src="' + new URL("../../assets/icons/meridian.svg", import.meta.url).href + '" alt="Meridian"><span>Meridian</span></a><nav class="header-nav" aria-label="Навигация"><a class="button button-quiet" href="#/">На главную</a></nav></div></header>' +
  '<main class="page"><nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="' + urlFor(module) + '">' + esc(meta.title) + '</a>' + crumbs.map((c,i)=>'<span aria-hidden="true">/</span>' + (c.href ? '<a href="'+c.href+'">'+esc(c.label)+'</a>' : '<span aria-current="page">'+esc(c.label)+'</span>')).join("") + '</nav>';
}
function footer(module) { return '</main><footer class="footer-inner">' + esc(MODULES[module].title) + ' · Прогресс сохраняется в этом браузере</footer>'; }
function writeLast(module, unitId, lessonId) {
  writeStored(keys(module).last, { module, unitId, lessonId });
  const previous = readStored(keys(module).session, null);
  const session = { unitId, lessonId };
  if (module === "python" && previous?.lessonId === lessonId && typeof previous.draftCode === "string") session.draftCode = previous.draftCode;
  if (module === "english" && previous?.lessonId === lessonId && Number.isInteger(previous.cardIndex)) session.cardIndex = previous.cardIndex;
  writeStored(keys(module).session, session);
}
function validLesson(unit, lesson) {
  return lesson && lesson.unitId === unit.unitId && unit.lessonIds.includes(lesson.lessonId) && Number.isInteger(lesson.order) && lesson.order > 0 && typeof lesson.title === "string";
}
function renderModule(app,module,data,completed) {
 const total=data.units.reduce((sum,u)=>sum+u.lessonIds.length,0),done=data.units.reduce((sum,u)=>sum+unitStats(u,completed).done,0);
 const last=readStored(keys(module).last,null);
 const groups=[...new Set(data.units.map(unit=>unit.level))];
 const renderCard=unit=>{const stats=unitStats(unit,completed);return '<article class="unit-card" data-unit="'+esc(unit.unitId)+'"><a class="unit-card-link" href="'+urlFor(module,unit.unitId)+'"><div class="unit-card-top"><span class="eyebrow">'+esc(unit.level)+'</span><span class="unit-status status-'+stats.status+'">'+(stats.status==="completed"?"Завершён":stats.status==="in-progress"?"В процессе":"Не начат")+'</span></div><h3>'+esc(unit.title)+'</h3><p>'+esc(unit.description)+'</p><div class="subject-meta"><span>'+stats.done+' / '+stats.total+' уроков</span><span>'+unit.estimatedMinutes+' мин</span></div><div class="progress-track" data-progress="'+(stats.done/stats.total*100)+'"><div class="progress-fill"></div></div></a></article>';};
 app.innerHTML=header(module)+'<section class="curriculum-heading"><div><p class="eyebrow">'+esc(MODULES[module].subtitle)+'</p><h1>'+esc(MODULES[module].title)+'</h1><p>Учебная программа: тематические юниты и короткие занятия.</p></div><div class="curriculum-total"><strong>'+done+' / '+total+'</strong><span>уроков завершено</span></div></section>'+
 (last&&data.units.some(u=>u.unitId===last.unitId&&u.lessonIds.includes(last.lessonId))?'<a class="button button-secondary" href="'+urlFor(module,last.unitId,last.lessonId)+'">Продолжить последний урок →</a>':'')+
 '<div class="curriculum-tools"><label class="curriculum-search"><span class="field-label">Поиск по урокам и темам</span><input class="form-field" id="curriculum-search" type="search" placeholder="Название урока или тег"></label></div>'+
 '<section class="unit-groups" id="unit-groups" aria-label="Учебные юниты">'+groups.map(level=>'<section class="unit-level-group" data-level-group="'+esc(level)+'"><h2>'+esc(level)+'</h2><div class="unit-level-grid">'+data.units.filter(u=>u.level===level).map(renderCard).join("")+'</div></section>').join("")+'</section><p class="empty-state" id="unit-search-empty" hidden>По этому запросу уроков не найдено.</p>'+footer(module);
 const searchInput=app.querySelector("#curriculum-search");let searchVersion=0;
 searchInput.addEventListener("input",async()=>{
  const query=searchInput.value.trim().toLocaleLowerCase("ru"),version=++searchVersion;
  if(!query){app.querySelectorAll(".unit-card").forEach(card=>card.hidden=false);app.querySelectorAll("[data-level-group]").forEach(group=>group.hidden=false);app.querySelector("#unit-search-empty").hidden=true;return;}
  const matches=await Promise.all(data.units.map(async unit=>{
   try{const content=await unitData(module,unit.unitId);const text=unit.title+" "+unit.description+" "+unit.level+" "+content.lessons.map(lesson=>lesson.title+" "+(lesson.tags||[]).join(" ")).join(" ");return [unit.unitId,text.toLocaleLowerCase("ru").includes(query)];}
   catch{return [unit.unitId,false];}
  }));
  if(version!==searchVersion)return;
  const matchMap=new Map(matches);let visible=0;
  app.querySelectorAll(".unit-card").forEach(card=>{const show=Boolean(matchMap.get(card.dataset.unit));card.hidden=!show;if(show)visible++;});
  app.querySelectorAll("[data-level-group]").forEach(group=>{group.hidden=!group.querySelector(".unit-card:not([hidden])");});
  app.querySelector("#unit-search-empty").hidden=visible!==0;
 });
 app.querySelectorAll("[data-progress]").forEach(node=>animateProgress(node,Number(node.dataset.progress)));
}
function renderUnit(app,module,data,unit,unitContent,completed) {
  const stats=unitStats(unit,completed);
  app.innerHTML=header(module,[{label:unit.title}])+'<section class="curriculum-heading"><div><p class="eyebrow">'+esc(unit.level)+'</p><h1>'+esc(unit.title)+'</h1><p>'+esc(unit.description)+'</p></div><div class="curriculum-total"><strong>'+stats.done+' / '+stats.total+'</strong><span>уроков завершено</span></div></section>'+
  '<div class="progress-track" data-progress="'+(stats.done/stats.total*100)+'"><div class="progress-fill"></div></div>'+
  (unit.prerequisiteUnits?.length ? '<p class="code-note">Рекомендуется сначала пройти: '+unit.prerequisiteUnits.map(id=>esc(data.units.find(u=>u.unitId===id)?.title||id)).join(", ")+'. Это рекомендация, переход не заблокирован.</p>' : '')+
  '<ol class="curriculum-lessons">'+unit.lessonIds.map((id,i)=>{const done=completed.includes(id);const lesson=unitContent.lessons.find(x=>x.lessonId===id);return '<li><a class="curriculum-lesson '+(done?'is-complete':'')+'" href="'+urlFor(module,unit.unitId,id)+'"><span class="lesson-number">'+(done?'✓':i+1)+'</span><span class="curriculum-lesson-title"><strong>'+esc(lesson?.title||("Урок "+(i+1)))+'</strong><small>'+(done?'Завершено':'Занятие')+'</small></span><span class="lesson-duration">'+(lesson?.estimatedMinutes||8)+' мин</span></a></li>';}).join("")+'</ol>'+footer(module);
  animateProgress(app.querySelector("[data-progress]"),stats.done/stats.total*100);
}
function markComplete(module,unit,lessonId,completed) {
  if(!completed.includes(lessonId)){completed.push(lessonId);writeStored(keys(module).completed,completed);}
  return unit.lessonIds.every(id=>completed.includes(id));
}
function renderEnglishLesson(app,module,unit,lesson,completed) {
 const cards=lesson.content?.cards;
 if(!Array.isArray(cards)||cards.length<10||cards.some(c=>!c.id||!c.ru||!c.en||!c.example))throw new Error("В английском уроке отсутствуют карточки или обязательные поля.");
 const srs=readStored("mrd:english:srs",{});
 const dueCards=cards.filter(card=>!srs[card.id]||!Number.isFinite(srs[card.id].due)||srs[card.id].due<=Date.now());
 if(!dueCards.length){
  if(cards.every(card=>srs[card.id]&&Number.isFinite(srs[card.id].due))&&!completed.includes(lesson.lessonId))markComplete(module,unit,lesson.lessonId,completed);
  app.innerHTML=header(module,[{label:unit.title,href:urlFor(module,unit.unitId)},{label:lesson.title}])+'<section class="empty-state"><h1>Повторение пока не требуется</h1><p>Все карточки этого урока уже оценены. Следующий интервал повторения ещё не наступил.</p><a class="button" href="'+urlFor(module,unit.unitId)+'">Вернуться к юниту</a></section>'+footer(module);
  return;
 }
 const saved=readStored(keys(module).session,null);
 let index=saved?.lessonId===lesson.lessonId&&Number.isInteger(saved.cardIndex)?Math.min(saved.cardIndex,dueCards.length-1):0;
 let revealed=false;
 const draw=()=>{
  const card=dueCards[index],entry=srs[card.id];
  writeStored(keys(module).session,{unitId:unit.unitId,lessonId:lesson.lessonId,cardIndex:index});
  app.innerHTML=header(module,[{label:unit.title,href:urlFor(module,unit.unitId)},{label:lesson.title}])+
  '<section class="curriculum-lesson-focus"><p class="eyebrow">К повторению · карточка '+(index+1)+' из '+dueCards.length+'</p><h1>'+esc(lesson.title)+'</h1><div class="study-card"><p class="eyebrow">Переведите на английский</p><h2 class="prompt-word">'+esc(card.ru)+'</h2>'+
  (revealed?'<div class="english-answer"><h2>'+esc(card.en)+'</h2><p>'+esc(card.example)+'</p></div>':'<button class="button" id="reveal-answer">Показать ответ</button>')+
  (revealed?'<p class="field-label">Насколько легко вспомнили?</p><div class="rating-row">'+[['again','Снова'],['hard','Трудно'],['good','Хорошо'],['easy','Легко']].map(([v,l])=>'<button class="rating-button" data-rating="'+v+'">'+l+'</button>').join("")+'</div>':'')+
  '<p class="code-note">'+(entry?'Срок повторения наступил.':'Новая карточка.')+'</p></div></section>'+footer(module);
  app.querySelector("#reveal-answer")?.addEventListener("click",()=>{revealed=true;draw();});
  app.querySelectorAll("[data-rating]").forEach(button=>button.addEventListener("click",()=>{
   const rating=button.dataset.rating,quality={again:1,hard:3,good:4,easy:5}[rating],old=srs[card.id]||{ease:2.5,interval:0,reps:0};
   const ease=Math.max(1.3,old.ease+0.1-(5-quality)*(0.08+(5-quality)*0.02));
   const interval=quality<3?1:old.reps===0?1:old.reps===1?6:Math.max(1,Math.round(old.interval*ease));
   srs[card.id]={ease:Number(ease.toFixed(2)),interval,due:Date.now()+interval*86400000,reps:quality<3?0:old.reps+1};
   writeStored("mrd:english:srs",srs);index++;revealed=false;
   if(index>=dueCards.length){
    const wasCompleted=completed.includes(lesson.lessonId);
    const allReviewed=cards.every(item=>srs[item.id]&&Number.isFinite(srs[item.id].due));
    const unitFinished=allReviewed?markComplete(module,unit,lesson.lessonId,completed):false;
    const nextIndex=unit.lessonIds.indexOf(lesson.lessonId)+1,nextLesson=unit.lessonIds[nextIndex];
    if(nextLesson)writeLast(module,unit.unitId,nextLesson);
    else{writeStored(keys(module).session,null);writeStored(keys(module).last,null);}
    app.innerHTML=header(module,[{label:unit.title,href:urlFor(module,unit.unitId)},{label:lesson.title}])+'<section class="empty-state"><h1>Урок завершён</h1><p>Вы оценили '+dueCards.length+' карточек, интервалы повторения сохранены.</p><p class="lesson-feedback status-line" role="status"></p><a class="button" href="'+urlFor(module,unit.unitId)+'">Вернуться к юниту</a>'+(nextLesson?'<a class="button button-secondary" href="'+urlFor(module,unit.unitId,nextLesson)+'">Следующий урок →</a>':'')+'</section>'+footer(module);
    if(!wasCompleted&&unitFinished)celebrate(app.querySelector(".lesson-feedback"),"Юнит завершён",800);
   } else draw();
  }));
 };
 draw();
}
function fenBoard(fen) {
 const symbols={K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙",k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"};
 const ranks=fen.split(" ")[0].split("/");
 if(ranks.length!==8) return null;
 const cells=[];
 for(let r=0;r<8;r++){let f=0;for(const token of ranks[r]){if(/[1-8]/.test(token)){for(let n=0;n<Number(token);n++)cells.push("");f+=Number(token);}else if(symbols[token]){cells.push(symbols[token]);f++;}else{return null;}}if(f!==8)return null;}
 return cells;
}
function nextLessonNavigation(module,unit,lesson) {
 const index=unit.lessonIds.indexOf(lesson.lessonId),next=unit.lessonIds[index+1];
 if(next){writeLast(module,unit.unitId,next);return '<a class="button" href="'+urlFor(module,unit.unitId,next)+'">Следующий урок →</a>';}
 writeStored(keys(module).session,null);writeStored(keys(module).last,null);
 return '<a class="button button-secondary" href="'+urlFor(module,unit.unitId)+'">Вернуться к юниту</a>';
}
function renderChessLesson(app,module,unit,lesson,completed) {
 const cells=fenBoard(lesson.fen);if(!cells||!Array.isArray(lesson.quiz)||!lesson.quiz.length)throw new Error("Неверная шахматная позиция или тест.");
 const q=lesson.quiz[0];let choice=null,answered=completed.includes(lesson.lessonId);
 app.innerHTML=header(module,[{label:unit.title,href:urlFor(module,unit.unitId)},{label:lesson.title}])+'<section class="curriculum-lesson-focus"><p class="eyebrow">Шахматы · '+lesson.order+' из '+unit.lessonIds.length+'</p><h1>'+esc(lesson.title)+'</h1><article class="lesson-card"><p>'+esc(lesson.text)+'</p></article><section class="panel"><p class="eyebrow">Позиция из FEN</p><div class="chess-board curriculum-board" role="grid" aria-label="Шахматная позиция">'+cells.map((piece,i)=>'<div class="chess-square '+((Math.floor(i/8)+i%8)%2?'dark':'light')+'" role="gridcell">'+esc(piece)+'</div>').join("")+'</div><p class="code-note">Доска показана по FEN, указанному в данных урока.</p></section><section class="panel"><p class="eyebrow">Проверка</p><p class="quiz-question">'+esc(q.q)+'</p><div class="quiz-options">'+q.options.map((o,i)=>'<button class="quiz-option" data-choice="'+i+'" aria-pressed="false">'+esc(o)+'</button>').join("")+'</div><button class="button" id="check-answer" '+(answered?'disabled':'')+'>Проверить</button><p class="lesson-feedback status-line" role="status">'+(answered?'Урок уже завершён.':'')+'</p><div id="lesson-next">'+(answered?nextLessonNavigation(module,unit,lesson):'')+'</div></section></section>'+footer(module);
 app.querySelectorAll("[data-choice]").forEach(btn=>btn.addEventListener("click",()=>{if(answered)return;choice=Number(btn.dataset.choice);app.querySelectorAll("[data-choice]").forEach(x=>x.setAttribute("aria-pressed",String(x===btn)));}));
 app.querySelector("#check-answer").addEventListener("click",()=>{const status=app.querySelector(".lesson-feedback");if(choice===null){status.textContent="Сначала выберите вариант.";return;}if(choice!==q.answer){status.textContent="Пока неверно. Вернитесь к объяснению и попробуйте ещё раз.";return;}answered=true;const unitFinished=markComplete(module,unit,lesson.lessonId,completed);status.textContent=q.explanation||"Верно. Урок завершён.";if(unitFinished)celebrate(status,"Юнит завершён",800);app.querySelector("#lesson-next").innerHTML=nextLessonNavigation(module,unit,lesson);app.querySelector("#check-answer").disabled=true;});
}
function runSafePython(source,lesson) {
 const lines=String(source).replace(/\r/g,"").split("\n");
 if(lines.length>300||lines.some(line=>/\b(import|exec|eval|open|__|os\.|sys\.|subprocess)\b/.test(line)))return {ok:false,error:"Эта учебная среда поддерживает только безопасные базовые конструкции Python."};
 const vars={},out=[],functions={};
 const repr=x=>x===true?"True":x===false?"False":x instanceof Set?"{"+[...x].map(String).join(", ")+"}":Array.isArray(x)?(x.__tuple?"("+x.map(String).join(", ")+")":"["+x.map(y=>typeof y==="string"?"'"+y+"'":String(y)).join(", ")+"]"):(x&&typeof x==="object"?"{"+Object.entries(x).map(([k,v])=>"'"+k+"': "+(typeof v==="string"?"'"+v+"'":String(v))).join(", ")+"}":String(x));
 const value=raw=>{
  const s=raw.trim();
  if(/^(['"]).*\1$/.test(s))return s.slice(1,-1);
  if(s==="input()")return String(lesson.exampleInput??"");
  if(s==="int(input())")return Number(lesson.exampleInput??0);
  if(s==="float(input())")return Number(lesson.exampleInput??0);
  if(s==="True")return true;if(s==="False")return false;
  if(/^-?\d+(?:\.\d+)?$/.test(s))return Number(s);
  let m=s.match(/^([A-Za-z_]\w*)\s*([+*\-/])\s*([A-Za-z_]\w*|\d+(?:\.\d+)?)$/);
  if(m){const a=Number(value(m[1])),b=Number(value(m[3]));if(!Number.isFinite(a)||!Number.isFinite(b))throw new Error("Для арифметики нужны числа.");return m[2]==="+"?a+b:m[2]==="-"?a-b:m[2]==="*"?a*b:a/b;}
  m=s.match(/^len\(([A-Za-z_]\w*)\)$/);
  if(m&&vars[m[1]]&&typeof vars[m[1]]==="object")return Array.isArray(vars[m[1]])?vars[m[1]].length:vars[m[1]] instanceof Set?vars[m[1]].size:Object.keys(vars[m[1]]).length;
  m=s.match(/^([A-Za-z_]\w*)\[(\d+)\]$/);if(m&&Array.isArray(vars[m[1]]))return vars[m[1]][Number(m[2])];
  m=s.match(/^([A-Za-z_]\w*)\[(["'])(.*?)\2\]$/);if(m&&vars[m[1]]&&typeof vars[m[1]]==="object")return vars[m[1]][m[3]];
  m=s.match(/^([A-Za-z_]\w*)\((.*)\)$/);if(m&&functions[m[1]])return callFunction(m[1],m[2]?m[2].split(",").map(x=>value(x)):[]);
  if(Object.prototype.hasOwnProperty.call(vars,s))return vars[s];
  if(s.startsWith("[")&&s.endsWith("]")){const body=s.slice(1,-1).trim();return body?body.split(",").map(part=>value(part)):[];}
  if(s.startsWith("(")&&s.endsWith(")")){const body=s.slice(1,-1).trim(),tuple=body?body.split(",").map(part=>value(part)):[];tuple.__tuple=true;return tuple;}
  if(s.startsWith("{")&&s.endsWith("}")){const body=s.slice(1,-1).trim();if(!body)return {};if(!body.includes(":"))return new Set(body.split(",").map(part=>value(part)));const obj={};for(const pair of body.split(",")){const p=pair.split(":");if(p.length!==2)throw new Error("Проверь пары ключ: значение.");obj[String(value(p[0]))]=value(p[1]);}return obj;}
  throw new Error("Не удалось разобрать выражение: "+s);
 };
 const printLine=line=>{const m=line.match(/^print\((.*)\)$/);if(!m)throw new Error("Поддерживается print() с одним значением.");out.push(repr(value(m[1])));if(out.length>200)throw new Error("Превышен лимит вывода.");};
 function callFunction(name,args) {
  const fn=functions[name];if(!fn)throw new Error("Функция "+name+" не определена.");
  const saved={};const localNames=[];
  fn.params.forEach((param,index)=>{const p=param.split("=")[0].trim();localNames.push(p);saved[p]=Object.prototype.hasOwnProperty.call(vars,p)?vars[p]:undefined;vars[p]=index<args.length?args[index]:param.includes("=")?value(param.split("=").slice(1).join("=")):undefined;});
  let result;
  for(const statement of fn.body){let m=statement.match(/^return\s+(.+)$/);if(m){result=value(m[1]);break;}m=statement.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);if(m){if(!localNames.includes(m[1])){localNames.push(m[1]);saved[m[1]]=Object.prototype.hasOwnProperty.call(vars,m[1])?vars[m[1]]:undefined;}vars[m[1]]=value(m[2]);continue;}if(statement.startsWith("print(")){printLine(statement);continue;}throw new Error("В функции поддерживаются присваивание, print() и return.");}
  localNames.forEach(key=>{if(saved[key]===undefined)delete vars[key];else vars[key]=saved[key];});
  return result;
 }
 try{
  for(let i=0;i<lines.length;i++){
   const line=lines[i];if(!line.trim()||line.trim().startsWith("#"))continue;
   let m=line.match(/^def\s+([A-Za-z_]\w*)\((.*)\):$/);
   if(m){const body=[];let j=i+1;while(j<lines.length&&/^\s{4}/.test(lines[j])){body.push(lines[j].slice(4));j++;}if(!body.length)throw new Error("Добавь тело функции с отступом.");functions[m[1]]={params:m[2].trim()?m[2].split(",").map(x=>x.trim()):[],body};i=j-1;continue;}
   m=line.match(/^([A-Za-z_]\w*)\s*=\s*lambda\s+([A-Za-z_]\w*)\s*:\s*(.+)$/);
   if(m){functions[m[1]]={params:[m[2]],body:["return "+m[3]]};continue;}
   m=line.match(/^([A-Za-z_]\w*),\s*([A-Za-z_]\w*)\s*=\s*(.+)$/);
   if(m){const tuple=value(m[3]);if(!Array.isArray(tuple)||tuple.length!==2)throw new Error("Для распаковки нужны ровно два значения.");vars[m[1]]=tuple[0];vars[m[2]]=tuple[1];continue;}
   m=line.match(/^([A-Za-z_]\w*)\[(["'])(.*?)\2\]\s*=\s*(.+)$/);
   if(m&&vars[m[1]]&&typeof vars[m[1]]==="object"){vars[m[1]][m[3]]=value(m[4]);continue;}
   m=line.match(/^([A-Za-z_]\w*)\.add\((.*)\)$/);if(m&&vars[m[1]] instanceof Set){vars[m[1]].add(value(m[2]));continue;}
   m=line.match(/^([A-Za-z_]\w*)\.append\((.*)\)$/);if(m&&Array.isArray(vars[m[1]])){vars[m[1]].push(value(m[2]));continue;}
   m=line.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);if(m){vars[m[1]]=value(m[2]);continue;}
   if(/^print\(/.test(line)){printLine(line);continue;}
   m=line.match(/^([A-Za-z_]\w*)\((.*)\)$/);if(m&&functions[m[1]]){callFunction(m[1],m[2]?m[2].split(",").map(x=>value(x)):[]);continue;}
   m=line.match(/^for\s+([A-Za-z_]\w*)\s+in\s+range\((\d+),\s*(\d+)\):$/);
   if(m){const body=lines[i+1];if(!body||!/^\s{4}print\(\w+\)$/.test(body))throw new Error("В учебном цикле добавь print(имя) с отступом в четыре пробела.");for(let n=Number(m[2]);n<Number(m[3]);n++){vars[m[1]]=n;out.push(String(n));}i++;continue;}
   m=line.match(/^if\s+([A-Za-z_]\w*)\s*(==|!=|<=|>=|<|>)\s*(-?\d+(?:\.\d+)?):$/);
   if(m){const yes=lines[i+1],no=lines[i+2],els=lines[i+3];if(!yes||!no||!els||!/^else:$/.test(no.trim()))throw new Error("Для if используй блоки if и else с отступами.");const a=Number(vars[m[1]]),b=Number(m[3]);const result={"==":a===b,"!=":a!==b,"<":a<b,">":a>b,"<=":a<=b,">=":a>=b}[m[2]];const selected=result?yes:els;if(!/^\s{4}print\(/.test(selected))throw new Error("Внутри if/else нужен print() с отступом.");printLine(selected.trim());i+=3;continue;}
   m=line.match(/^while\s+([A-Za-z_]\w*)\s*(<|<=|>|>=|==|!=)\s*(\d+):$/);
   if(m){const body=lines[i+1],increment=lines[i+2];if(!body||body.trim()!=="print("+m[1]+")"||!increment||increment.trim()!==m[1]+" = "+m[1]+" + 1")throw new Error("Для while нужны print(счётчик) и увеличение счётчика на 1.");let guard=0;const limit=Number(m[3]),test=n=>({"<":n<limit,"<=":n<=limit,">":n>limit,">=":n>=limit,"==":n===limit,"!=":n!==limit}[m[2]]);while(test(Number(vars[m[1]]))&&guard++<100){out.push(String(vars[m[1]]));vars[m[1]]=Number(vars[m[1]])+1;}if(guard>=100)throw new Error("Цикл остановлен: превышен безопасный лимит.");i+=2;continue;}
   throw new Error("Строка пока не входит в безопасный учебный Python: "+line.trim());
  }
  return {ok:true,output:out.join("\n")};
 }catch(error){return {ok:false,error:error.message};}
}
function renderPythonLesson(app,module,unit,lesson,completed) {
 let draft=readStored("mrd:python:session",null);let code=draft?.lessonId===lesson.lessonId?draft.draftCode:lesson.starterCode;
 const done=completed.includes(lesson.lessonId);
 const draw=()=>{app.innerHTML=header(module,[{label:unit.title,href:urlFor(module,unit.unitId)},{label:lesson.title}])+'<section class="curriculum-lesson-focus"><p class="eyebrow">Python · '+lesson.estimatedMinutes+' мин</p><h1>'+esc(lesson.title)+'</h1><article class="lesson-card"><p>'+esc(lesson.theory)+'</p></article><section class="panel"><label class="field-label" for="python-code">Ваш код</label><textarea class="code-editor" id="python-code" spellcheck="false">'+esc(code)+'</textarea><div class="button-row"><button class="button" id="run-python">Запустить</button><button class="button button-secondary" id="show-hint">Подсказка</button></div><p class="code-note" id="python-hint" hidden>'+esc(lesson.hint)+'</p><div class="python-output"><div><p class="eyebrow">Ожидаемый вывод</p><pre>'+esc(lesson.expectedOutput)+'</pre></div><div><p class="eyebrow">Ваш вывод</p><pre id="actual-output">—</pre></div></div><p class="lesson-feedback status-line" role="status">'+(done?'Урок уже завершён.':'')+'</p><div id="lesson-next">'+(done?nextLessonNavigation(module,unit,lesson):'')+'</div></section></section>'+footer(module);
 const editor=app.querySelector("#python-code");editor.addEventListener("input",()=>{code=editor.value;writeStored("mrd:python:session",{unitId:unit.unitId,lessonId:lesson.lessonId,draftCode:code});});
 app.querySelector("#show-hint").addEventListener("click",()=>{app.querySelector("#python-hint").hidden=false;});
 app.querySelector("#run-python").addEventListener("click",()=>{const result=runSafePython(editor.value,lesson);const output=app.querySelector("#actual-output"),status=app.querySelector(".lesson-feedback");output.textContent=result.ok?result.output:result.error;if(!result.ok){status.textContent=result.error;return;}if(result.output===lesson.expectedOutput){status.textContent="Вывод совпадает. Урок завершён.";if(!completed.includes(lesson.lessonId)){const unitFinished=markComplete(module,unit,lesson.lessonId,completed);if(unitFinished)celebrate(status,"Юнит завершён",800);app.querySelector("#lesson-next").innerHTML=nextLessonNavigation(module,unit,lesson);}}else status.textContent="Вывод отличается от ожидаемого. Проверьте строки и значения.";});
 };draw();
}
export async function renderCurriculum(app,module) {
 const meta=MODULES[module];if(!meta)throw new Error("Неизвестный учебный модуль.");
 const parts=(window.location.hash||"#/"+module).replace(/^#\//,"").split("/");
 const unitId=parts[1]||null,lessonId=parts[2]||null;
 const data=await curriculum(module),completed=readCompleted(module);
 if(!unitId){renderModule(app,module,data,completed);return;}
 const unit=data.units.find(u=>u.unitId===unitId);if(!unit){window.location.hash="#/"+module;return;}
 const unitContent=await unitData(module,unitId);
 if(unitContent.lessons.length!==unit.lessonIds.length||unitContent.lessons.some(l=>!validLesson(unit,l)))throw new Error("Список уроков не совпадает с файлом юнита.");
 if(!lessonId){renderUnit(app,module,data,unit,unitContent,completed);return;}
 const lesson=unitContent.lessons.find(l=>l.lessonId===lessonId);if(!lesson){window.location.hash=urlFor(module,unitId);return;}
 writeLast(module,unitId,lessonId);
 if(module==="english")renderEnglishLesson(app,module,unit,lesson,completed);
 else if(module==="chess")renderChessLesson(app,module,unit,lesson,completed);
 else renderPythonLesson(app,module,unit,lesson,completed);
}
