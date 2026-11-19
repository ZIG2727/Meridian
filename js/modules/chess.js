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


function getPieceTargets(square, piece, pieces) {
  const file = "abcdefgh".indexOf(square[0]);
  const rank = Number(square[1]);
  const knight = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
  const targets = [];
  const add = (df, dr) => {
    const f = file + df, r = rank + dr;
    if (f < 0 || f > 7 || r < 1 || r > 8) return false;
    const target = "abcdefgh"[f] + r;
    const occupant = pieces[target];
    if (!occupant || (occupant === occupant.toUpperCase()) !== (piece === piece.toUpperCase())) targets.push(target);
    return !occupant;
  };
  if (piece.toLowerCase() === "n") {
    knight.forEach(([df, dr]) => add(df, dr));
  } else if (["b", "r"].includes(piece.toLowerCase())) {
    const directions = piece.toLowerCase() === "b"
      ? [[1,1],[1,-1],[-1,1],[-1,-1]]
      : [[1,0],[-1,0],[0,1],[0,-1]];
    directions.forEach(([df, dr]) => {
      let f = file + df, r = rank + dr;
      while (f >= 0 && f < 8 && r >= 1 && r <= 8) {
        const target = "abcdefgh"[f] + r;
        const occupant = pieces[target];
        if (!occupant) targets.push(target);
        else {
          if ((occupant === occupant.toUpperCase()) !== (piece === piece.toUpperCase())) targets.push(target);
          break;
        }
        f += df; r += dr;
      }
    });
  }
  return targets;
}

function enablePieceHints(container, board, position, status) {
  let selected = null;
  const readPieces = () => board ? board.position() : parsePosition(position);
  const clear = () => container.querySelectorAll(".is-move-target,.is-selected-piece").forEach(node =>
    node.classList.remove("is-move-target", "is-selected-piece"));
  const selectSquare = square => {
    const pieces = readPieces();
    const piece = pieces[square];
    clear();
    if (!piece || !["n", "b", "r"].includes(piece.toLowerCase())) {
      selected = null;
      status.textContent = "Выберите коня, слона или ладью.";
      return;
    }
    selected = square;
    const source = container.querySelector('[data-square="' + square + '"], [aria-label="' + square + '"]');
    source?.classList.add("is-selected-piece");
    const targets = getPieceTargets(square, piece, pieces);
    targets.forEach(target => container.querySelector('[data-square="' + target + '"], [aria-label="' + target + '"]')?.classList.add("is-move-target"));
    status.textContent = square + ": доступные по правилам фигуры поля подсвечены. Это подсказка движения, не проверка шаха.";
  };
  container.addEventListener("click", event => {
    const squareNode = event.target.closest("[data-square], [aria-label]");
    const square = squareNode?.dataset.square || squareNode?.getAttribute("aria-label");
    if (!square || !/^[a-h][1-8]$/.test(square)) return;
    if (selected && getPieceTargets(selected, readPieces()[selected], readPieces()).includes(square)) {
      if (board) board.movePiece({ from: selected, to: square }, { animate: true });
      else {
        const pieces = readPieces(); pieces[square] = pieces[selected]; delete pieces[selected];
        const fen = position;
        renderStaticBoard(container, piecesToFen(pieces, fen));
      }
      selected = null; clear(); status.textContent = "Фигура перемещена на " + square + ".";
      return;
    }
    selectSquare(square);
  });
  container.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const square = event.target.dataset.square || event.target.getAttribute("aria-label");
    if (square) { event.preventDefault(); selectSquare(square); }
  });
}

function piecesToFen(pieces, sourceFen) {
  const rows = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let row = "", empty = 0;
    for (const file of "abcdefgh") {
      const piece = pieces[file + rank];
      if (piece) { if (empty) row += empty; row += piece; empty = 0; }
      else empty += 1;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const parts = String(sourceFen || "start").split(" ");
  return rows.join("/") + " " + (parts[1] || "w") + " " + (parts[2] || "-") + " " + (parts[3] || "-") + " " + (parts[4] || "0") + " " + (parts[5] || "1");
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
      '<p class="code-note" id="piece-hint-status" role="status">Нажмите на коня, слона или ладью, чтобы увидеть возможные поля.</p><div class="button-row" style="margin-top:12px"><button class="button button-secondary" type="button" id="show-chess-move">Показать ход</button></div>' +
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
        board = window.MeridianChessboard.create(boardContainer, { position: lesson.fen || lesson.position || "start" });
      } catch {
        renderStaticBoard(boardContainer, lesson.fen || lesson.position || "start");
        content.querySelector("#board-fallback").hidden = false;
      }
    } else {
      renderStaticBoard(boardContainer, lesson.fen || lesson.position || "start");
      content.querySelector("#board-fallback").hidden = false;
    }

    enablePieceHints(boardContainer, board, lesson.fen || lesson.position || "start", content.querySelector("#piece-hint-status"));
    content.querySelector("#chess-back").addEventListener("click", renderList);
    content.querySelector("#show-chess-move").addEventListener("click", () => {
      if (board) {
        board.position(lesson.fen || lesson.position || "start");
        (lesson.moves || []).forEach(move => board.movePiece(move, { animate: true }));
      } else {
        const boardState = parsePosition(lesson.fen || lesson.position || "start");
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
        if (moduleComplete) celebrate(status, "Раздел шахмат завершён.", 800);
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