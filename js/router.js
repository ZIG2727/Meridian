import { loadJSON, readStored, isStringArray } from "./storage.js";
import { renderEnglish } from "./modules/english.js";
import { renderChess } from "./modules/chess.js";
import { renderPython } from "./modules/python.js";
import { animateProgress } from "./motion.js";

const dataUrls = {
  english: new URL("../data/english-deck.json", import.meta.url),
  chess: new URL("../data/chess-lessons.json", import.meta.url),
  python: new URL("../data/python-lessons.json", import.meta.url)
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function validEnglishSession(session, deck, progress) {
  return Boolean(session && Number.isInteger(session.currentCardIndex) &&
    session.currentCardIndex >= 0 && session.currentCardIndex < deck.length &&
    ["all", "due"].includes(session.deckFilter) &&
    (session.deckFilter !== "due" || !progress[String(session.currentCardIndex)] || !Number.isFinite(progress[String(session.currentCardIndex)].due) || progress[String(session.currentCardIndex)].due <= Date.now()));
}

async function loadDashboardData() {
  const entries = await Promise.all(Object.entries(dataUrls).map(async ([key, url]) => {
    try {
      const value = await loadJSON(url);
      return [key, Array.isArray(value) ? value : null];
    } catch {
      return [key, null];
    }
  }));
  return Object.fromEntries(entries);
}

function subjectCard(subject, title, description, count, total, percentage, continuation, error) {
  const paths = {
    english: "../assets/icons/english.svg",
    chess: "../assets/icons/chess.svg",
    python: "../assets/icons/python.svg"
  };
  const iconUrl = new URL(paths[subject], import.meta.url).href;
  const progressText = error ? "Данные недоступны" : count + " / " + total + " завершено";
  const status = error
    ? '<p class="status-line">Не удалось загрузить материалы. Откройте раздел позже.</p>'
    : '<div class="subject-meta"><span>Прогресс</span><strong>' + progressText + '</strong></div>' +
      '<div class="progress-track" data-progress="' + percentage + '" style="--progress-color:var(--color-' + subject + ')"><div class="progress-fill"></div></div>';
  const continueButton = continuation
    ? '<a class="button button-secondary button-full" href="#/' + subject + '">' + escapeHTML(continuation) + '</a>'
    : '<a class="button button-full" href="#/' + subject + '">Открыть раздел</a>';
  return '<article class="subject-card" data-subject="' + subject + '">' +
    '<div class="subject-topline"><img class="subject-icon" src="' + iconUrl + '" alt="" aria-hidden="true">' +
    '<span class="eyebrow">' + (subject === "english" ? "01 / Язык" : subject === "chess" ? "02 / Стратегия" : "03 / Код") + '</span></div>' +
    '<h2>' + title + '</h2><p>' + description + '</p>' + status +
    '<div class="button-row dashboard-actions">' + continueButton + '</div></article>';
}

async function renderDashboard(app) {
  app.innerHTML = '<header class="site-header"><div class="header-inner">' +
    '<a class="brand" href="#/" aria-label="Meridian — главная"><img src="' + new URL("../assets/icons/meridian.svg", import.meta.url).href + '" alt="Meridian"><span>Meridian</span></a>' +
    '<nav class="header-nav" aria-label="Разделы"><a class="button button-quiet" href="#/english">Английский</a><a class="button button-quiet" href="#/chess">Шахматы</a><a class="button button-quiet" href="#/python">Python</a></nav></div></header>' +
    '<main class="page"><section class="dashboard-intro"><p class="eyebrow">Учебное пространство</p><h1>Три предмета. Один маршрут.</h1><p>Выберите занятие или продолжите с того места, где остановились.</p></section>' +
    '<section class="subject-grid" aria-label="Учебные разделы"><div class="empty-state">Загружаем учебные маршруты…</div></section></main>' +
    '<footer class="footer-inner">Meridian · Прогресс хранится в этом браузере</footer>';

  const data = await loadDashboardData();
  const grid = app.querySelector(".subject-grid");
  if (!grid) return;

  const english = data.english || [];
  const chess = data.chess || [];
  const python = data.python || [];
  const englishProgress = readStored("mrd:english:progress", {});
  const chessCompleted = readStored("mrd:chess:completed", [], isStringArray);
  const pythonCompleted = readStored("mrd:python:completed", [], isStringArray);
  const englishSession = readStored("mrd:english:session", null);
  const chessSession = readStored("mrd:chess:session", null);
  const pythonSession = readStored("mrd:python:session", null);
  const reviewed = Object.values(englishProgress).filter(item => item && Number(item.repetitions) > 0).length;
  const chessDone = chess.filter(item => chessCompleted.includes(item.id)).length;
  const pythonDone = python.filter(item => pythonCompleted.includes(item.id)).length;
  const englishValid = english.length > 0 && validEnglishSession(englishSession, english, englishProgress);
  const chessValid = chess.some(item => item.id === chessSession);
  const pythonValid = python.some(item => item.id === pythonSession?.lessonId) && typeof pythonSession?.code === "string";
  const todayDue = english.filter((_, index) => !englishProgress[String(index)] || !Number.isFinite(englishProgress[String(index)].due) || englishProgress[String(index)].due <= Date.now()).length;

  const resumeItems = [];
  if (englishValid) {
    const dueIndices = englishSession.deckFilter === "all" ? english.map((_, index) => index) : english.map((_, index) => index).filter(index => !englishProgress[String(index)] || !Number.isFinite(englishProgress[String(index)].due) || englishProgress[String(index)].due <= Date.now());
    const position = Math.max(0, dueIndices.indexOf(englishSession.currentCardIndex));
    resumeItems.push({ label: "Английский", detail: "Карточка " + (position + 1) + " из " + dueIndices.length, href: "#/english" });
  }
  if (chessValid) {
    const index = chess.findIndex(item => item.id === chessSession);
    resumeItems.push({ label: "Шахматы", detail: "Урок " + (index + 1) + " — " + chess[index].title, href: "#/chess" });
  }
  if (pythonValid) {
    const index = python.findIndex(item => item.id === pythonSession.lessonId);
    resumeItems.push({ label: "Python", detail: "Урок " + (index + 1) + " — " + python[index].title, href: "#/python" });
  }
  const resumeBlock = resumeItems.length
    ? '<section class="resume-panel" aria-label="Продолжить занятие"><div><p class="eyebrow">Продолжить</p><h2>Вы остановились здесь</h2></div>' +
      resumeItems.map(item => '<a class="resume-link" href="' + item.href + '"><span><strong>' + item.label + '</strong><small>' + escapeHTML(item.detail) + '</small></span><span aria-hidden="true">→</span></a>').join("") + '</section>'
    : "";
  grid.innerHTML = [
    subjectCard("english", "Английский", "Переводите слова и фразы. Сегодня к изучению: "+ todayDue +".", reviewed, english.length, english.length ? reviewed / english.length * 100 : 0, englishValid ? "Продолжить английский" : null, !data.english),
    subjectCard("chess", "Шахматы", "Разбирайте правила и тактические задачи. Не завершено: "+ (chess.length - chessDone) +".", chessDone, chess.length, chess.length ? chessDone / chess.length * 100 : 0, chessValid ? "Продолжить шахматы" : null, !data.chess),
    subjectCard("python", "Python", "Читайте теорию и сверяйте код. Доступно уроков: "+ (python.length - pythonDone) +".", pythonDone, python.length, python.length ? pythonDone / python.length * 100 : 0, pythonValid ? "Продолжить Python" : null, !data.python)
  ].join("");
  grid.innerHTML = resumeBlock + grid.innerHTML;

  grid.querySelectorAll("[data-progress]").forEach(track => {
    animateProgress(track, Number(track.dataset.progress));
  });
}

function showRouteError(app, error) {
  app.innerHTML = '<main class="page"><a class="brand" href="#/">Meridian</a><section class="error-state"><h1>Не удалось открыть раздел</h1><p>' +
    String(error?.message || "Обновите страницу и попробуйте ещё раз.").replace(/[&<>"']/g, "") +
    '</p><a class="button" href="#/">На главную</a></section></main>';
}

export function initRouter(app) {
  async function renderRoute() {
    const route = (window.location.hash || "#/").replace(/^#/, "");
    try {
      if (route === "/" || route === "") await renderDashboard(app);
      else if (route === "/english") await renderEnglish(app);
      else if (route === "/chess") await renderChess(app);
      else if (route === "/python") await renderPython(app);
      else window.location.hash = "#/";
    } catch (error) {
      showRouteError(app, error);
    }
  }

  if (!window.location.hash) window.location.hash = "#/";
  window.addEventListener("hashchange", renderRoute);
  renderRoute();
}