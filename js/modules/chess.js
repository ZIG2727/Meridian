import { loadJSON, readStored, writeStored, isStringArray } from "../storage.js";
import { animateProgress, celebrate } from "../motion.js";

const lessonsUrl = new URL("../../data/chess-lessons.json", import.meta.url);
const SESSION_KEY = "mrd:chess:session";
const COMPLETED_KEY = "mrd:chess:completed";
const boardScriptUrl = new URL("../../lib/chessboard.min.js", import.meta.url);
let boardLoadPromise = null;

const pieceSymbols = {
  K:"♔", Q:"♕", R:"♖", B:"♗", N:"♘", P:"♙",
  k:"♚", q:"♛", r:"♜", b:"♝", n:"♞", p:"♟"
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function parsePosition(position) {
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
  const rows = String(position || "start").split(" ")[0] === "start"
    ? start.split("/") : String(position || start).split(" ")[0].split("/");
  const pieces = {};
  rows.forEach((row, rowIndex) => {
    let fileIndex = 0;
    for (const token of row) {
      if (/\d/.test(token)) fileIndex += Number(token);
      else {
        const square = "abcdefgh"[fileIndex] + String(8 - rowIndex);
        pieces[square] = token;
        fileIndex += 1;
      }
    }
  });
  return pieces;
}

function renderStaticBoard(container, position) {
  const pieces = parsePosition(position);
  const squares = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    for (let file = 0; file < 8; file += 1) {
      const square = "abcdefgh"[file] + rank;
      const piece = pieces[square];
      const symbol = pieceSymbols[piece] || "";
      const color = (rank + file) % 2 === 0 ? "light" : "dark";
      const pieceClass = piece && piece === piece.toUpperCase() ? "white-piece" : "black-piece";
      squares.push('<div class="chess-square ' + color + '" role="gridcell" aria-label="' + square + '">' +
        (symbol ? '<span class="' + pieceClass + '">' + symbol + '</span>' : "") + '</div>');
    }
  }
  container.innerHTML = squares.join("");
  container.setAttribute("role", "grid");
  container.setAttribute("aria-label", "Статичная шахматная доска");
}

function ensureBoardLibrary() {
  if (window.MeridianChessboard) return Promise.resolve(true);
  if (boardLoadPromise) return boardLoadPromise;

  boardLoadPromise = new Promise(resolve => {
    const script = document.createElement("script");
    script.src = boardScriptUrl.href;
    script.async = true;
    script.onload = () => resolve(Boolean(window.MeridianChessboard));
    script.onerror = () => resolve(false);
    document.head.append(script);
  });
  return boardLoadPromise;
}

function renderShell(app) {
  app.innerHTML = '<header class="site-header"><div class="header-inner">' +
    '<a class="brand" href="#/" aria-label="Meridian — главная"><img src="' + new URL("../../assets/icons/meridian.svg", import.meta.url).href + '" alt="Meridian"><span>Meridian</span></a>' +
    '<nav class="header-nav" aria-label="Навигация"><a class="button button-quiet" href="#/">На главную</a></nav></div></header>' +
    '<main class="page"><div class="page-heading"><div><p class="eyebrow">02 / Шахматы · RU</p><h1>Шахматные уроки</h1><p>Разберите правило, посмотрите пример и ответьте на вопрос.</p></div></div>' +
    '<section id="chess-content" aria-live="polite"></section></main><footer class="footer-inner">Шахматы · Пройденные уроки сохраняются автоматически</footer>';
}

export async function renderChess(app) {
  const lessons = await loadJSON(lessonsUrl);
  if (!Array.isArray(lessons) || lessons.length < 6 || lessons.some(lesson =>
    !lesson.id || !lesson.title || !lesson.text || !Array.isArray(lesson.quiz) || lesson.quiz.length === 0
  )) throw new Error("Набор шахматных уроков имеет неверный формат.");

  const completed = readStored(COMPLETED_KEY, [], isStringArray);
  const savedLessonId = readStored(SESSION_KEY, null);
  renderShell(app);
  const content = app.querySelector("#chess-content");

  function renderList() {
    const done = lessons.filter(lesson => completed.includes(lesson.id)).length;
    content.innerHTML = '<section class="panel"><div class="subject-meta"><span>Прогресс раздела</span><strong>' + done + ' / ' + lessons.length + '</strong></div>' +
      '<div class="progress-track" id="chess-list-progress" style="--progress-color:var(--color-chess)"><div class="progress-fill"></div></div>' +
      '<div class="lesson-list" style="margin-top:20px">' + lessons.map((lesson, index) =>
        '<button class="lesson-link" type="button" data-open-lesson="' + escapeHTML(lesson.id) + '">' +
        '<span><strong>' + (index + 1) + '. ' + escapeHTML(lesson.title) + '</strong><small>' + (completed.includes(lesson.id) ? "Завершено" : "Урок") + '</small></span>' +
        '<span class="lesson-number ' + (completed.includes(lesson.id) ? "is-complete" : "") + '">' + (completed.includes(lesson.id) ? "✓" : String(index + 1)) + '</span></button>'
      ).join("") + '</div></section>';

    animateProgress(content.querySelector("#chess-list-progress"), lessons.length ? done / lessons.length * 100 : 0);
    content.querySelectorAll("[data-open-lesson]").forEach(button => {
      button.addEventListener("click", () => openLesson(button.dataset.openLesson));
    });
  }

  async function openLesson(lessonId) {
    const lesson = lessons.find(item => item.id === lessonId);
    if (!lesson) return;
    writeStored(SESSION_KEY, lesson.id);
    await renderLesson(lesson);
  }

  async function renderLesson(lesson) {
    const lessonIndex = lessons.findIndex(item => item.id === lesson.id);
    const quiz = lesson.quiz[0];
    const wasCompleted = completed.includes(lesson.id);
    content.innerHTML = '<div class="button-row" style="margin-bottom:16px"><button class="button button-secondary" id="chess-back" type="button">К списку уроков</button><span class="eyebrow">Урок ' + (lessonIndex + 1) + ' из ' + lessons.length + '</span></div>' +
      '<div class="module-layout"><article class="lesson-card"><p class="eyebrow">Правило</p><h2>' + escapeHTML(lesson.title) + '</h2><p>' + escapeHTML(lesson.text) + '</p></article>' +
      '<section class="panel"><p class="eyebrow">Позиция на доске</p><div id="chess-board" class="chess-board" aria-label="Шахматная позиция"></div>' +
      '<p class="board-caption" id="board-caption">' + escapeHTML(lesson.moveCaption || "Положение фигур для примера.") + '</p>' +
      '<div class="button-row" style="margin-top:12px"><button class="button button-secondary" type="button" id="show-chess-move">Показать ход</button></div>' +
      '<p class="code-note" id="board-fallback" hidden>Используется статичное представление позиции: интерактивная доска недоступна.</p></section></div>' +
      '<section class="panel" style="margin-top:24px"><p class="eyebrow">Проверка</p><p class="quiz-question">' + escapeHTML(quiz.q) + '</p>' +
      '<div class="quiz-options">' + quiz.options.map((option, index) =>
        '<button class="quiz-option" type="button" data-option="' + index + '" aria-pressed="false">' + escapeHTML(option) + '</button>'
      ).join("") + '</div><div class="button-row"><button class="button" type="button" id="check-chess-answer">Проверить</button>' +
      '<span class="status-line" id="chess-status" role="status"></span></div>' +
      '<div class="progress-track" id="chess-lesson-progress" style="--progress-color:var(--color-chess);margin-top:16px"><div class="progress-fill"></div></div>' +
      '<div class="button-row" style="margin-top:16px;justify-content:flex-end"><button class="button button-secondary" id="chess-next" type="button" hidden>Следующий урок</button></div></section>';

    const boardContainer = content.querySelector("#chess-board");
    const libraryReady = await ensureBoardLibrary();
    let board = null;
    if (libraryReady && window.MeridianChessboard) {
      try {
        board = window.MeridianChessboard.create(boardContainer, { position: lesson.position || "start" });
      } catch {
        renderStaticBoard(boardContainer, lesson.position || "start");
        content.querySelector("#board-fallback").hidden = false;
      }
    } else {
      renderStaticBoard(boardContainer, lesson.position || "start");
      content.querySelector("#board-fallback").hidden = false;
    }

    content.querySelector("#chess-back").addEventListener("click", renderList);
    content.querySelector("#show-chess-move").addEventListener("click", () => {
      if (board) {
        board.position(lesson.position || "start");
        (lesson.moves || []).forEach(move => board.movePiece(move, { animate: true }));
      } else {
        const boardState = parsePosition(lesson.position || "start");
        (lesson.moves || []).forEach(move => {
          if (boardState[move.from]) {
            boardState[move.to] = boardState[move.from];
            delete boardState[move.from];
          }
        });
        renderStaticBoard(boardContainer, "8/8/8/8/8/8/8/8");
        const squares = boardContainer.querySelectorAll(".chess-square");
        const ordered = [];
        for (let rank = 8; rank >= 1; rank -= 1) {
          for (let file = 0; file < 8; file += 1) ordered.push("abcdefgh"[file] + rank);
        }
        squares.forEach((square, index) => {
          const piece = boardState[ordered[index]];
          square.innerHTML = piece ? '<span class="' + (piece === piece.toUpperCase() ? "white-piece" : "black-piece") + '">' + (pieceSymbols[piece] || "") + '</span>' : "";
        });
      }
    });

    let selectedOption = null;
    let answeredCorrectly = wasCompleted;
    const status = content.querySelector("#chess-status");
    const progressTrack = content.querySelector("#chess-lesson-progress");
    if (wasCompleted) {
      status.textContent = "Этот урок уже отмечен как завершённый.";
      animateProgress(progressTrack, 100);
      content.querySelector("#chess-next").hidden = lessonIndex >= lessons.length - 1;
    }

    content.querySelectorAll("[data-option]").forEach(button => {
      button.addEventListener("click", () => {
        if (answeredCorrectly) return;
        selectedOption = Number(button.dataset.option);
        content.querySelectorAll("[data-option]").forEach(option => {
          option.setAttribute("aria-pressed", String(option === button));
        });
      });
    });

    content.querySelector("#check-chess-answer").addEventListener("click", () => {
      if (selectedOption === null) {
        status.className = "status-line feedback error";
        status.textContent = "Сначала выберите один из трёх вариантов.";
        return;
      }
      if (selectedOption !== quiz.answer) {
        status.className = "status-line feedback error";
        status.textContent = "Ответ неверный. Вернитесь к объяснению и попробуйте ещё раз.";
        return;
      }

      status.className = "status-line feedback success";
      status.textContent = "Ответ верный.";
      answeredCorrectly = true;
      if (!completed.includes(lesson.id)) {
        completed.push(lesson.id);
        writeStored(COMPLETED_KEY, completed);
        animateProgress(progressTrack, 100);
        const moduleComplete = lessons.every(item => completed.includes(item.id));
        celebrate(status, moduleComplete ? "Раздел шахмат завершён." : "Урок завершён.", 800);
      } else {
        animateProgress(progressTrack, 100);
      }
      content.querySelectorAll("[data-option]").forEach(option => { option.disabled = true; });
      content.querySelector("#chess-next").hidden = lessonIndex >= lessons.length - 1;
    });

    content.querySelector("#chess-next").addEventListener("click", () => {
      const next = lessons[lessonIndex + 1];
      if (next) openLesson(next.id);
      else renderList();
    });
  }

  if (lessons.some(lesson => lesson.id === savedLessonId)) await openLesson(savedLessonId);
  else renderList();
}