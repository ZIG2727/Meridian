import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runSafePython } from "../js/modules/curriculum.js";

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
    if (!Array.isArray(unit.lessonIds) || unit.lessonIds.length < 3 || unit.lessonIds.length > 4) fail(unit.unitId + ": expected 3–4 lesson IDs");
    const data = await readJSON("data/" + module + "/units/" + unit.unitId + ".json");
    if (data.unitId !== unit.unitId || data.lessons.length !== unit.lessonIds.length) fail(unit.unitId + ": unit data mismatch");
    unique(data.lessons.map(lesson => lesson.lessonId), unit.unitId + " lesson IDs");
    for (const lesson of data.lessons) {
      if (moduleLessonIds.has(lesson.lessonId)) fail(module + ": duplicate lesson ID " + lesson.lessonId);
      moduleLessonIds.add(lesson.lessonId);
    }
    for (let index = 0; index < data.lessons.length; index++) {
      const lesson = data.lessons[index];
      if (lesson.lessonId !== unit.lessonIds[index] || lesson.unitId !== unit.unitId || !lesson.title) fail(unit.unitId + ": lesson metadata mismatch");
      moduleLessons++;
      if (module === "english") {
        const cards = lesson.content?.cards;
        if (!Array.isArray(cards) || cards.length < 10) fail(lesson.lessonId + ": needs at least 10 flashcards");
        unique(cards.map(card => card.id), lesson.lessonId + " card IDs");
        for (const card of cards) {
          if (moduleCardIds.has(card.id)) fail("Duplicate English card ID " + card.id);
          moduleCardIds.add(card.id);
        }
        for (const card of cards) if (!card.id || !card.ru || !card.en || !card.example) fail(lesson.lessonId + ": incomplete flashcard");
        totals.cards += cards.length;
      } else if (module === "chess") {
        if (!validFen(lesson.fen)) fail(lesson.lessonId + ": invalid or illegal FEN position");
        const quiz = lesson.quiz?.[0];
        if (!quiz || quiz.options.length < 3 || quiz.options.length > 6 || !Number.isInteger(quiz.answer) || quiz.answer < 0 || quiz.answer >= quiz.options.length) fail(lesson.lessonId + ": invalid quiz");
      } else {
        if (typeof lesson.theory !== "string" || typeof lesson.starterCode !== "string" || typeof lesson.expectedOutput !== "string" || typeof lesson.hint !== "string") fail(lesson.lessonId + ": incomplete Python exercise");
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
const html = await readFile(resolve(root, "index.html"), "utf8");
if (/\bonclick\s*=/i.test(html)) fail("Inline onclick found");
console.log("V3 curriculum validation passed:", JSON.stringify(totals));

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
