import { loadJSON, readStored, writeStored, isStringArray } from "./storage.js";
import { renderEnglish } from "./modules/english.js";
import { renderChess } from "./modules/chess.js";
import { renderPython } from "./modules/python.js";
import { animateProgress, bindMicroInteractions } from "./motion.js";

const dataUrls = {
  english: new URL("../data/english/curriculum.json", import.meta.url),
  chess: new URL("../data/chess/curriculum.json", import.meta.url),
  python: new URL("../data/python/curriculum.json", import.meta.url)
};
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
}
async function loadDashboardData() {
  const entries = await Promise.all(Object.entries(dataUrls).map(async ([key,url]) => {
    try { const value=await loadJSON(url); return [key,value&&Array.isArray(value.units)?value.units:null]; }
    catch { return [key,null]; }
  }));
  return Object.fromEntries(entries);
}
function subjectCard(subject,title,description,count,total,percentage,continuation,error) {
  const paths={english:"../assets/icons/english.svg",chess:"../assets/icons/chess.svg",python:"../assets/icons/python.svg"};
  const visuals={
    english:{src:"https://images.unsplash.com/photo-1769794371055-54436b54577e?auto=format&fit=crop&w=1200&q=82",alt:"Рабочий стол с книгами, конспектами и материалами для изучения языков",credit:"Yen Vu",url:"https://unsplash.com/photos/desk-with-open-book-laptop-and-study-materials-HNjWq8WPyoY"},
    chess:{src:"https://images.unsplash.com/photo-1727572337691-966f05cbf6fe?auto=format&fit=crop&w=1200&q=82",alt:"Шахматная доска с фигурами во время партии",credit:"Heriberto Murrieta",url:"https://unsplash.com/photos/a-close-up-of-a-chess-board-with-pieces-on-it-eHClqseTUWc"},
    python:{src:"https://images.unsplash.com/photo-1778146476147-5f8d4bd03c79?auto=format&fit=crop&w=1200&q=82",alt:"Ноутбук с открытым редактором кода на рабочем столе",credit:"Bayu Syaits",url:"https://unsplash.com/photos/laptop-and-phone-on-a-desk-with-coding-software-open-oYzjGQ7LCVE"}
  };
  const visual=visuals[subject],iconUrl=new URL(paths[subject],import.meta.url).href;
  const progressText=error?"Данные недоступны":count+" / "+total+" уроков";
  const status=error?'<p class="status-line">Не удалось загрузить материалы. Откройте раздел позже.</p>':
    '<div class="subject-meta"><span>Прогресс</span><strong>'+progressText+'</strong></div><div class="progress-track" data-progress="'+percentage+'" style="--progress-color:var(--color-'+subject+')"><div class="progress-fill"></div></div>';
  const continueButton=continuation?'<a class="button button-secondary button-full" href="'+continuation.href+'">'+escapeHTML(continuation.label)+'</a>':'<a class="button button-full" href="#/'+subject+'">Открыть раздел</a>';
  return '<article class="subject-card" data-subject="'+subject+'"><a class="subject-media" href="'+visual.url+'" target="_blank" rel="noopener noreferrer" aria-label="Открыть фотографию: '+escapeHTML(visual.alt)+'"><img src="'+visual.src+'" alt="'+escapeHTML(visual.alt)+'" loading="lazy" decoding="async"><span class="subject-media-label">'+(subject==="english"?"ЯЗЫК":"")+(subject==="chess"?"СТРАТЕГИЯ":"")+(subject==="python"?"ПРОГРАММИРОВАНИЕ":"")+'</span></a><div class="subject-card-body"><div class="subject-topline"><img class="subject-icon" src="'+iconUrl+'" alt="" aria-hidden="true"><span class="eyebrow">'+(subject==="english"?"01 / Язык":subject==="chess"?"02 / Стратегия":"03 / Код")+'</span></div><h2>'+title+'</h2><p>'+description+'</p>'+status+'<div class="button-row dashboard-actions">'+continueButton+'</div><a class="photo-credit" href="'+visual.url+'" target="_blank" rel="noopener noreferrer">Фото: '+visual.credit+' / Unsplash</a></div></article>';
}
function readCompleted(module) {
 const key="mrd:v3:"+module+":completed",versioned=readStored(key,null,isStringArray);
 if(versioned)return versioned;
 const legacy=readStored("mrd:"+module+":completed",[],isStringArray);
 const maps={chess:{notation:"ch-basics-board-01",pieces:"ch-basics-knight-01",pawn:"ch-basics-pawn-01",mate:"ch-endgames-basic-mates-01"},python:{print:"py-basics-print-01",variables:"py-basics-variables-01",conditions:"py-control-if-01",loops:"py-control-loops-01"}};
 const migrated=legacy.slice();
 for(const [oldId,newId] of Object.entries(maps[module]||{}))if(legacy.includes(oldId)&&!migrated.includes(newId))migrated.push(newId);
 if(legacy.length)writeStored(key,migrated);
 return migrated;
}
function readSession(module) {
 const key="mrd:v3:"+module+":session",current=readStored(key,null);
 if(current)return current;
 const legacy=readStored("mrd:"+module+":session",null);
 if(!legacy)return null;
 let next=null;
 if(module==="python"&&typeof legacy==="object"){
  const map={print:["py-basics-print","py-basics-print-01"],variables:["py-basics-variables","py-basics-variables-01"],conditions:["py-control-if","py-control-if-01"],loops:["py-control-loops","py-control-loops-01"]};
  const item=map[legacy.lessonId];
  if(item)next={unitId:item[0],lessonId:item[1],draftCode:legacy.draftCode||legacy.code||""};
  else if(legacy.unitId&&legacy.lessonId)next=legacy;
 }else if(module==="chess"&&typeof legacy==="string"){
  const map={notation:["ch-basics-board","ch-basics-board-01"],pieces:["ch-basics-knight","ch-basics-knight-01"],pawn:["ch-basics-pawn","ch-basics-pawn-01"],mate:["ch-endgames-basic-mates","ch-endgames-basic-mates-01"]};
  const item=map[legacy];if(item)next={unitId:item[0],lessonId:item[1]};
 }else if(module==="english"&&legacy?.unitId&&legacy?.lessonId)next=legacy;
 if(next)writeStored(key,next);
 return next;
}
function findResume(module,units,session) {
  if(!session||typeof session.unitId!=="string"||typeof session.lessonId!=="string")return null;
  const unit=units.find(item=>item.unitId===session.unitId);
  if(!unit)return null;
  const lessonIndex=unit.lessonIds.indexOf(session.lessonId);
  if(lessonIndex<0)return null;
  return {label:"Продолжить "+(module==="english"?"английский":module==="chess"?"шахматы":"Python"),detail:unit.title+" · урок "+(lessonIndex+1),href:"#/"+module+"/"+unit.unitId+"/"+session.lessonId};
}
async function renderDashboard(app) {
  app.innerHTML='<header class="site-header"><div class="header-inner"><a class="brand" href="#/" aria-label="Meridian — главная"><img src="'+new URL("../assets/icons/meridian.svg",import.meta.url).href+'" alt="Meridian"><span>Meridian</span></a><nav class="header-nav" aria-label="Разделы"><a class="button button-quiet" href="#/english">Английский</a><a class="button button-quiet" href="#/chess">Шахматы</a><a class="button button-quiet" href="#/python">Python</a></nav></div></header><main class="page"><section class="dashboard-intro"><p class="eyebrow">Учебное пространство</p><h1>Три предмета. Один маршрут.</h1><p>Выберите занятие или продолжите с того места, где остановились.</p></section><section class="subject-grid" aria-label="Учебные разделы"><div class="empty-state">Загружаем учебные маршруты…</div></section></main><footer class="footer-inner">Meridian · Прогресс хранится в этом браузере</footer>';
  const data=await loadDashboardData(),grid=app.querySelector(".subject-grid");if(!grid)return;
  const english=data.english||[],chess=data.chess||[],python=data.python||[];
  const englishCompleted=readCompleted("english");
  const chessCompleted=readCompleted("chess");
  const pythonCompleted=readCompleted("python");
  const englishSession=readSession("english");
  const chessSession=readSession("chess");
  const pythonSession=readSession("python");
  const countLessons=units=>units.reduce((sum,unit)=>sum+unit.lessonIds.length,0);
  const countDone=(units,done)=>units.reduce((sum,unit)=>sum+unit.lessonIds.filter(id=>done.includes(id)).length,0);
  const eTotal=countLessons(english),cTotal=countLessons(chess),pTotal=countLessons(python);
  const eDone=countDone(english,englishCompleted),cDone=countDone(chess,chessCompleted),pDone=countDone(python,pythonCompleted);
  const resumes=[findResume("english",english,englishSession),findResume("chess",chess,chessSession),findResume("python",python,pythonSession)].filter(Boolean);
  const resumeBlock=resumes.length?'<section class="resume-panel" aria-label="Продолжить занятие"><div><p class="eyebrow">Продолжить</p><h2>Вы остановились здесь</h2></div>'+resumes.map(item=>'<a class="resume-link" href="'+item.href+'"><span><strong>'+escapeHTML(item.label)+'</strong><small>'+escapeHTML(item.detail)+'</small></span><span aria-hidden="true">→</span></a>').join("")+'</section>':"";
  grid.innerHTML=[
    subjectCard("english","Английский","15 юнитов · карточки с интервальным повторением.",eDone,eTotal,eTotal?eDone/eTotal*100:0,findResume("english",english,englishSession),!data.english),
    subjectCard("chess","Шахматы","15 юнитов · правила, тактика, окончания и дебюты.",cDone,cTotal,cTotal?cDone/cTotal*100:0,findResume("chess",chess,chessSession),!data.chess),
    subjectCard("python","Python","15 юнитов · основы языка и безопасная практика.",pDone,pTotal,pTotal?pDone/pTotal*100:0,findResume("python",python,pythonSession),!data.python)
  ].join("");
  grid.innerHTML=resumeBlock+grid.innerHTML;
  grid.querySelectorAll("[data-progress]").forEach(track=>animateProgress(track,Number(track.dataset.progress)));
}
function showRouteError(app,error) {
  app.innerHTML='<main class="page"><a class="brand" href="#/">Meridian</a><section class="error-state"><h1>Не удалось открыть раздел</h1><p>'+String(error?.message||"Обновите страницу и попробуйте ещё раз.").replace(/[&<>"']/g,"")+'</p><a class="button" href="#/">На главную</a></section></main>';
}
export function initRouter(app) {
  bindMicroInteractions(app);
  async function renderRoute() {
    const route=(window.location.hash||"#/").replace(/^#/,"");
    try {
      if(route==="/"||route==="")await renderDashboard(app);
      else if(route==="/english"||route.startsWith("/english/"))await renderEnglish(app);
      else if(route==="/chess"||route.startsWith("/chess/"))await renderChess(app);
      else if(route==="/python"||route.startsWith("/python/"))await renderPython(app);
      else window.location.hash="#/";
    } catch(error) { showRouteError(app,error); }
  }
  if(!window.location.hash)window.location.hash="#/";
  window.addEventListener("hashchange",renderRoute);
  renderRoute();
}
