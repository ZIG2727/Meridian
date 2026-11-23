import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runSafePython, normalizeEnglishAnswer, getLegalChessMoves, getChessPositionStatus } from "../js/modules/curriculum.js";
import { MODULE_VISUALS } from "../js/visuals.js";
import { highlightPythonCode, getPythonSuggestions, tracePythonRange } from "../js/python-editor.js";
import { parseChessPosition, applyChessMove, chessPositionToFen } from "../js/chess-engine.js";
import { normalizeProfile, calculateProfileStats, mergeCompletedLessons } from "../js/profile.js";

const root = process.cwd();
const modules = ["english", "chess", "python"];
const fail = message => { throw new Error(message); };
const readJSON = async path => JSON.parse(await readFile(resolve(root, path), "utf8"));
const unique = (values, label) => {
  if (new Set(values).size !== values.length) fail("Duplicate " + label);
};

const isAttacked = (board, targetX, targetY, byWhite) => {
  const pieceAt = (x, y) => x >= 0 && x < 8 && y >= 0 && y < 8 ? board[7 - y][x] : null;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const piece = pieceAt(x, y);
    if (!piece || (piece === piece.toUpperCase()) !== byWhite) continue;
    const type = piece.toLowerCase(), dx = targetX - x, dy = targetY - y;
    if (type === "p" && Math.abs(dx) === 1 && dy === (byWhite ? 1 : -1)) return true;
    if (type === "n" && ((Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1))) return true;
    if (type === "k" && Math.max(Math.abs(dx), Math.abs(dy)) === 1) return true;
    if (type === "b" || type === "r" || type === "q") {
      const diagonal = Math.abs(dx) === Math.abs(dy), straight = dx === 0 || dy === 0;
      if ((type === "b" && !diagonal) || (type === "r" && !straight) || (type === "q" && !diagonal && !straight)) continue;
      const stepX = Math.sign(dx), stepY = Math.sign(dy);
      let cx = x + stepX, cy = y + stepY, clear = true;
      while (cx !== targetX || cy !== targetY) {
        if (pieceAt(cx, cy)) { clear = false; break; }
        cx += stepX; cy += stepY;
      }
      if (clear) return true;
    }
  }
  return false;
};
const validFen = fen => {
  const fields = String(fen || "").split(" ");
  if (fields.length !== 6 || !["w", "b"].includes(fields[1]) || !/^(?:-|[KQkq]+)$/.test(fields[2]) ||
      !/^(?:-|[a-h][36])$/.test(fields[3]) || !/^\d+$/.test(fields[4]) || !/^[1-9]\d*$/.test(fields[5])) return false;
  const rows = fields[0].split("/");
  if (rows.length !== 8) return false;
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let row = 0; row < 8; row++) {
    let file = 0;
    for (const token of rows[row]) {
      if (/[1-8]/.test(token)) file += Number(token);
      else if ("prnbqkPRNBQK".includes(token) && file < 8) board[row][file++] = token;
      else return false;
    }
    if (file !== 8) return false;
  }
  if (board[0].some(piece => piece?.toLowerCase() === "p") || board[7].some(piece => piece?.toLowerCase() === "p")) return false;
  const findKing = symbol => {
    for (let row = 0; row < 8; row++) for (let file = 0; file < 8; file++) if (board[row][file] === symbol) return { x: file, y: 7 - row };
    return null;
  };
  const whiteKing = findKing("K"), blackKing = findKing("k");
  if (!whiteKing || !blackKing) return false;
  if (Math.max(Math.abs(whiteKing.x - blackKing.x), Math.abs(whiteKing.y - blackKing.y)) <= 1) return false;
  const sideWhite = fields[1] === "w", nonMovingKing = sideWhite ? blackKing : whiteKing;
  if (isAttacked(board, nonMovingKing.x, nonMovingKing.y, sideWhite)) return false;
  const has = (square, piece) => board[8 - Number(square[1])][square.charCodeAt(0) - 97] === piece;
  for (const right of fields[2] === "-" ? "" : fields[2]) {
    const pair = right === "K" ? ["e1", "K", "h1", "R"] : right === "Q" ? ["e1", "K", "a1", "R"] : right === "k" ? ["e8", "k", "h8", "r"] : ["e8", "k", "a8", "r"];
    if (!has(pair[0], pair[1]) || !has(pair[2], pair[3])) return false;
  }
  if (fields[3] !== "-") {
    const rank = Number(fields[3][1]), file = fields[3].charCodeAt(0) - 97;
    if ((sideWhite && rank !== 6) || (!sideWhite && rank !== 3) || board[8 - rank][file]) return false;
    if (sideWhite ? board[3][file] !== "p" : board[4][file] !== "P") return false;
  }
  return true;
};
let totals = { units: 0, lessons: 0, cards: 0 };

for (const module of modules) {
  const manifest = await readJSON("data/" + module + "/curriculum.json");
  if (manifest.module !== module || manifest.version !== 3) fail(module + ": invalid curriculum manifest");
  if (manifest.units.length !== 15) fail(module + ": expected 15 units, got " + manifest.units.length);
  unique(manifest.units.map(unit => unit.unitId), module + " unit IDs");
  const unitMap = new Map(manifest.units.map(unit => [unit.unitId, unit]));
  manifest.units.forEach((unit, index) => {
    if (unit.order !== index + 1) fail(module + ": units must have sequential order values");
    for (const prerequisite of unit.prerequisiteUnits || []) if (!unitMap.has(prerequisite)) fail(unit.unitId + ": missing prerequisite " + prerequisite);
  });
  let moduleLessons = 0;
  const moduleLessonIds = new Set();
  const moduleCardIds = new Set();
  for (const unit of manifest.units) {
    if (!Array.isArray(unit.lessonIds) || unit.lessonIds.length !== 4) fail(unit.unitId + ": expected exactly 4 lesson IDs");
    const data = await readJSON("data/" + module + "/units/" + unit.unitId + ".json");
    if (data.unitId !== unit.unitId || data.lessons.length !== unit.lessonIds.length) fail(unit.unitId + ": unit data mismatch");
    unique(data.lessons.map(lesson => lesson.lessonId), unit.unitId + " lesson IDs");
    for (const lesson of data.lessons) {
      if (moduleLessonIds.has(lesson.lessonId)) fail(module + ": duplicate lesson ID " + lesson.lessonId);
      moduleLessonIds.add(lesson.lessonId);
    }
    for (let index = 0; index < data.lessons.length; index++) {
      const lesson = data.lessons[index];
      if (lesson.lessonId !== unit.lessonIds[index] || lesson.unitId !== unit.unitId || !lesson.title ||
          !new RegExp("^" + ({ english: "en", chess: "ch", python: "py" })[module] + "-[a-z0-9-]+-\\d{2}$").test(lesson.lessonId) ||
          lesson.order !== index + 1 || !Number.isInteger(lesson.estimatedMinutes) ||
          lesson.estimatedMinutes < 5 || lesson.estimatedMinutes > 15 ||
          !Array.isArray(lesson.tags) || !lesson.tags.length) fail(unit.unitId + ": lesson metadata mismatch");
      moduleLessons++;
      if (module === "english") {
        const cards = lesson.content?.cards;
        if (!Array.isArray(cards) || cards.length < 10 || cards.length > 15) fail(lesson.lessonId + ": needs 10–15 flashcards");
        unique(cards.map(card => card.id), lesson.lessonId + " card IDs");
        for (const card of cards) {
          if (moduleCardIds.has(card.id)) fail("Duplicate English card ID " + card.id);
          moduleCardIds.add(card.id);
        }
        for (const card of cards) if (!card.id || !card.ru || !card.en || !card.example || !Array.isArray(card.tags) || !card.tags.length) fail(lesson.lessonId + ": incomplete flashcard");
        totals.cards += cards.length;
      } else if (module === "chess") {
        if (!validFen(lesson.fen)) fail(lesson.lessonId + ": invalid or illegal FEN position");
        if (typeof lesson.text !== "string" || !lesson.text.trim() || !Array.isArray(lesson.quiz) || !lesson.quiz.length) fail(lesson.lessonId + ": missing chess text or quiz");
        const quiz = lesson.quiz[0];
        if (!Array.isArray(quiz.options) || quiz.options.length < 3 || quiz.options.length > 6 || !Number.isInteger(quiz.answer) || quiz.answer < 0 || quiz.answer >= quiz.options.length) fail(lesson.lessonId + ": invalid quiz");
      } else {
        if (typeof lesson.theory !== "string" || !lesson.theory.trim() || typeof lesson.starterCode !== "string" || !lesson.starterCode.trim() || typeof lesson.expectedOutput !== "string" || typeof lesson.hint !== "string" || !lesson.hint.trim()) fail(lesson.lessonId + ": incomplete Python exercise");
        const starter = runSafePython(lesson.starterCode, lesson);
        if (!starter.ok) fail(lesson.lessonId + ": starter code rejected by safe runner: " + starter.error);
        const reference = runSafePython(lesson.solutionCode || lesson.starterCode, lesson);
        if (!reference.ok || reference.output !== lesson.expectedOutput) fail(lesson.lessonId + ": reference output does not match expectedOutput: " + (reference.error || reference.output));
      }
    }
  }
  if (moduleLessons < 50) fail(module + ": fewer than 50 lessons");
  totals.units += manifest.units.length;
  totals.lessons += moduleLessons;
}
if (totals.cards < 500) fail("English course needs at least 500 cards; got " + totals.cards);

const curriculumSource = await readFile(resolve(root, "js/modules/curriculum.js"), "utf8");
if (!curriculumSource.includes("mrd:v3:")) fail("V3 storage namespace missing");
if (/\beval\s*\(/.test(curriculumSource) || /new\s+Function\s*\(/.test(curriculumSource)) fail("Unsafe dynamic execution found");
const chessEngineSource = await readFile(resolve(root, "js/chess-engine.js"), "utf8");
if (!chessEngineSource.includes("pseudoMoves") || !chessEngineSource.includes("applyChessMove") || !curriculumSource.includes("data-square")) fail("Interactive chess move engine missing");
if (!curriculumSource.includes("firstOutputDifference")) fail("Python output difference feedback missing");
const html = await readFile(resolve(root, "index.html"), "utf8");
if (/\bonclick\s*=/i.test(html)) fail("Inline onclick found");
console.log("V3 curriculum validation passed:", JSON.stringify(totals));

const highlightedPython = highlightPythonCode('def greet(name):\n    # comment\n    print("hello", 42)');
const loopTrace = tracePythonRange("for i in range(1, 4):\\n    doubled = i * 2\\n    print(doubled)");\nif (loopTrace.length !== 6 || loopTrace[0].variables.i !== 1 || loopTrace[0].variables.doubled !== 2 || loopTrace[1].output !== "2" || loopTrace[5].output !== "6" || tracePythonRange("while True:").length !== 0) fail("Python range-loop trace failed");\nconst suggestions = getPythonSuggestions("pri", 3);
if (!suggestions.some(item => item.label === "print") || getPythonSuggestions("print", 5).length !== 0 ||
    getPythonSuggestions("x = pri", 7)[0]?.label !== "print") fail("Python autocomplete prefix matching failed");
const repeatedHighlight = highlightPythonCode('print("again")');
if (!repeatedHighlight.includes('class="python-builtin">print</span>') ||
    !highlightPythonCode('print("third")').includes('class="python-builtin">print</span>')) fail("Python syntax highlighting must reset between editor updates");
if (!highlightedPython.includes('class="python-keyword">def</span>') ||
    !highlightedPython.includes('class="python-comment"># comment</span>') ||
    !highlightedPython.includes('class="python-builtin">print</span>') ||
    !highlightedPython.includes('class="python-string">"hello"</span>') ||
    !highlightedPython.includes('class="python-number">42</span>')) fail("Python syntax highlighting tokens missing");
const escapedPython = highlightPythonCode('<img src=x onerror=alert(1)>');
if (escapedPython.includes("<img") || !escapedPython.includes("&lt;img")) fail("Python editor highlight must escape HTML");
const lineDiagnostic = runSafePython('print("ok")\nunknown_call()', {});
if (lineDiagnostic.ok || !lineDiagnostic.error.startsWith("Строка 2:")) fail("Python error diagnostics must include source line number");

const runnerCases = [
  { source: 'print("Hello")', expected: "Hello" },
  { source: 'name = input()\nprint(name)', exampleInput: "Mira", expected: "Mira" },
  { source: 'age = int(input())\nprint(age)', exampleInput: "15", expected: "15" },
  { source: 'ready = True\nprint(ready)', expected: "True" },
  { source: 'items = ["red", "blue"]\nitems.append("green")\nprint(len(items))', expected: "3" },
  { source: 'scores = {"Mira": 10}\nscores["Mira"] = 12\nprint(scores["Mira"])', expected: "12" },
  { source: 'x, y = (3, 5)\nprint(y)', expected: "5" },
  { source: 'items = {1, 2}\nitems.add(3)\nprint(len(items))', expected: "3" },
  { source: 'value = 2\nif value < 3:\n    print("yes")\nelse:\n    print("no")', expected: "yes" },
  { source: 'for n in range(1, 4):\n    print(n)', expected: "1\n2\n3" },
  { source: 'count = 1\nwhile count < 4:\n    print(count)\n    count = count + 1', expected: "1\n2\n3" },
  { source: 'def double(number):\n    return number + number\nprint(double(4))', expected: "8" },
  { source: 'def greet(name="Mira"):\n    print(name)\ngreet()', expected: "Mira" },
  { source: 'double = lambda x: x * 2\nprint(double(4))', expected: "8" }
  ,
  { source: `items = ["red", "blue", "green", "black"]\nprint(items[1:3])`, expected: "['blue', 'green']" },
  { source: `first = {1, 2}\nsecond = {2, 3}\ncombined = first | second\nprint(len(combined))`, expected: "3" },
  { source: `score = 72\nif score >= 90:\n    print("Excellent")\nelif score >= 60:\n    print("Pass")\nelse:\n    print("Try again")`, expected: "Pass" },
  { source: `for number in range(1, 6):\n    if number == 3:\n        continue\n    if number == 5:\n        break\n    print(number)`, expected: ["1", "2", "4"].join("\n") }
  ,
  { source: 'raw = "not a number"\ntry:\n    print(int(raw))\nexcept ValueError:\n    print("Enter a whole number")', expected: "Enter a whole number" }
];
for (const [index, test] of runnerCases.entries()) {
  const result = runSafePython(test.source, { exampleInput: test.exampleInput });
  if (!result.ok || result.output !== test.expected) fail("Safe Python runner test " + (index + 1) + " failed: " + (result.error || result.output));
}



if (normalizeEnglishAnswer("  HELLO   WORLD! ") !== "hello world" ||
    normalizeEnglishAnswer("I’m fine.") !== "i'm fine") fail("English answer normalization failed");

const startPosition = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
if (getLegalChessMoves(startPosition, "e2").sort().join(",") !== "e3,e4") fail("Chess legal pawn moves failed");
const pinnedPosition = "k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1";
const pinnedMoves = getLegalChessMoves(pinnedPosition, "e2");
if (!pinnedMoves.includes("e3") || pinnedMoves.includes("d2")) fail("Chess king-safety filter failed");
const mateStatus = getChessPositionStatus("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1");
if (!mateStatus.valid || !mateStatus.check || !mateStatus.checkmate || mateStatus.stalemate) fail("Chess checkmate detection failed");
const stalemateStatus = getChessPositionStatus("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
if (!stalemateStatus.valid || stalemateStatus.check || stalemateStatus.checkmate || !stalemateStatus.stalemate) fail("Chess stalemate detection failed");

const castleFen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
const castleMoves = getLegalChessMoves(castleFen, "e1");
if (!castleMoves.includes("g1") || !castleMoves.includes("c1")) fail("Chess castling moves missing");
const castleState = parseChessPosition(castleFen);
const castleResult = applyChessMove(castleState, "e1", "g1");
if (!castleResult || castleResult.state.board[60] || castleResult.state.board[62] !== "♔" ||
    castleResult.state.board[61] !== "♖" || castleResult.state.castling.includes("K") || castleResult.state.castling.includes("Q")) {
  fail("Chess kingside castling application failed");
}
const epFen = "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1";
if (!getLegalChessMoves(epFen, "e5").includes("d6")) fail("Chess en passant move missing");
const epResult = applyChessMove(epFen, "e5", "d6");
if (!epResult || epResult.state.board[27] || epResult.state.board[19] !== "♙" || !epResult.move.enPassant) fail("Chess en passant capture failed");
const promotionFen = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1";
if (!getLegalChessMoves(promotionFen, "a7").includes("a8")) fail("Chess promotion move missing");
const promotionResult = applyChessMove(promotionFen, "a7", "a8", "n");
if (!promotionResult || promotionResult.state.board[0] !== "♘" || promotionResult.move.promotion !== "n") fail("Chess underpromotion selection failed");
if (!chessPositionToFen(castleResult.state).includes(" b ")) fail("Chess FEN serialization failed");
const normalizedProfile = normalizeProfile({
  name: "  Meridian Learner  ",
  dailyGoal: 99,
  xp: -10,
  completedLessonIds: ["en-1", "en-1", 3],
  activity: { "2026-11-22": { lessons: 2, xp: 40 }, invalid: { lessons: 99 } }
});
if (normalizedProfile.name !== "Meridian Learner" || normalizedProfile.dailyGoal !== 10 ||
    normalizedProfile.xp !== 0 || normalizedProfile.completedLessonIds.length !== 1 ||
    Object.keys(normalizedProfile.activity).length !== 1) fail("Profile normalization failed");
const profileStats = calculateProfileStats({
  name: "Ученик", dailyGoal: 2, xp: 60, completedLessonIds: ["a", "b", "c"],
  activity: { "2026-11-21": { lessons: 1, xp: 20 }, "2026-11-22": { lessons: 2, xp: 40 } }
}, 3, new Date(2026, 10, 22, 12));
if (profileStats.todayLessons !== 2 || profileStats.goalPercent !== 100 ||
    profileStats.streak !== 2 || profileStats.weekLessons !== 3 || profileStats.xp !== 60) {
  fail("Profile analytics calculation failed");
}
const migratedProfile = mergeCompletedLessons({ xp: 0, completedLessonIds: [] }, ["en-old-1", "ch-old-1", "en-old-1"]);
if (migratedProfile.xp !== 40 || migratedProfile.completedLessonIds.length !== 2) fail("Legacy completion migration failed");
console.log("Profile and analytics validated");

const visualModules = Object.keys(MODULE_VISUALS).sort();
if (visualModules.join(",") !== modules.slice().sort().join(",")) fail("Visual assets must exist for every learning module");
for (const module of modules) {
  const visual = MODULE_VISUALS[module];
  if (!visual.src.startsWith("https://images.unsplash.com/") || !visual.alt || !visual.url.startsWith("https://unsplash.com/") ||
      !Array.isArray(visual.gallery) || visual.gallery.length < 2) fail(module + ": missing hero image or supporting gallery");
  for (const [index, item] of visual.gallery.entries()) {
    if (!item.src.startsWith("https://images.unsplash.com/") || !item.alt || !item.label || !item.url.startsWith("https://unsplash.com/")) {
      fail(module + ": invalid gallery image " + (index + 1));
    }
  }
}
console.log("Visual assets validated:", modules.length, "routes,", modules.reduce((sum, module) => sum + MODULE_VISUALS[module].gallery.length, 0), "gallery images");

const motionSource = await readFile(resolve(root, "js/motion.js"), "utf8");
const componentStyles = await readFile(resolve(root, "css/components.css"), "utf8");
const curriculumStyles = await readFile(resolve(root, "css/curriculum.css"), "utf8");
if (!motionSource.includes('image.closest(".subject-media, .module-hero-image, .visual-gallery-card")') ||
    !motionSource.includes('label.className = "image-fallback-label"') ||
    !componentStyles.includes(".is-image-missing") || !curriculumStyles.includes(".module-hero-image.is-image-missing")) {
  fail("External image failure fallback is missing");
}
console.log("Image fallback behavior validated");
