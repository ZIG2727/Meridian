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
        const fields = String(lesson.fen || "").split(" ");
        const placement = fields[0] || "";
        const ranks = placement.split("/");
        const allowed = "prnbqkPRNBQK";
        const widths = ranks.map(rank => [...rank].reduce((sum, token) => sum + (/[1-8]/.test(token) ? Number(token) : allowed.includes(token) ? 1 : 99), 0));
        if (fields.length !== 6 || ranks.length !== 8 || widths.some(width => width !== 8)) fail(lesson.lessonId + ": invalid FEN shape");
        if ((placement.match(/K/g) || []).length !== 1 || (placement.match(/k/g) || []).length !== 1) fail(lesson.lessonId + ": FEN must contain one king of each colour");
        const quiz = lesson.quiz?.[0];
        if (!quiz || quiz.options.length < 3 || quiz.options.length > 6 || !Number.isInteger(quiz.answer) || quiz.answer < 0 || quiz.answer >= quiz.options.length) fail(lesson.lessonId + ": invalid quiz");
      } else {
        if (typeof lesson.theory !== "string" || typeof lesson.starterCode !== "string" || typeof lesson.expectedOutput !== "string" || typeof lesson.hint !== "string") fail(lesson.lessonId + ": incomplete Python exercise");
        const run = runSafePython(lesson.starterCode, lesson);
        if (!run.ok) fail(lesson.lessonId + ": starter code rejected by safe runner: " + run.error);
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
];
for (const [index, test] of runnerCases.entries()) {
  const result = runSafePython(test.source, { exampleInput: test.exampleInput });
  if (!result.ok || result.output !== test.expected) fail("Safe Python runner test " + (index + 1) + " failed: " + (result.error || result.output));
}
