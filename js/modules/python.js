import { loadJSON, readStored, writeStored, isStringArray } from "../storage.js";
import { animateProgress, celebrate } from "../motion.js";

const lessonsUrl = new URL("../../data/python-lessons.json", import.meta.url);
const SESSION_KEY = "mrd:python:session";
const COMPLETED_KEY = "mrd:python:completed";
const ATTEMPTS_KEY = "mrd:python:attempts";

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function savePythonSession(lessonId, code) {
  writeStored(SESSION_KEY, { lessonId, code });
}

function normalizeLines(value) {
  return String(value).replace(/\r\n?/g, "\n").split("\n").map(line => line.trimEnd()).join("\n").trim();
}

function parseLiteral(source) {
  const value = source.trim();
  if (/^(['"]).*\1$/.test(value)) return value.slice(1, -1);
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return undefined;
}

function runSafePython(source) {
  const lines = normalizeLines(source).split("\n");
  const variables = Object.create(null);
  const output = [];
  let index = 0;
  const readValue = expression => {
    const literal = parseLiteral(expression);
    if (literal !== undefined) return literal;
    if (/^[A-Za-z_]\w*$/.test(expression.trim()) && Object.hasOwn(variables, expression.trim())) return variables[expression.trim()];
    throw new Error("Неизвестное значение: " + expression.trim());
  };
  const executeBlock = (block, scope = {}) => {
    for (const line of block) {
      const statement = line.trim();
      if (!statement) continue;
      let match = statement.match(/^print\((.*)\)$/);
      if (match) {
        const value = readValue(match[1]);
        output.push(String(value));
        continue;
      }
      match = statement.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
      if (match) {
        variables[match[1]] = readValue(match[2]);
        continue;
      }
      throw new Error("Поддерживаются только присваивание, print(), if/else и for range().");
    }
  };

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    let match = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.+)$/);
    if (match) { variables[match[1]] = readValue(match[2]); index += 1; continue; }
    match = line.match(/^\s*print\((.*)\)\s*$/);
    if (match) { output.push(String(readValue(match[1]))); index += 1; continue; }
    match = line.match(/^if\s+([A-Za-z_]\w*)\s*(<|>|==|!=|<=|>=)\s*(-?\d+(?:\.\d+)?)\s*:$/);
    if (match) {
      const left = variables[match[1]];
      if (typeof left !== "number") throw new Error("В условии должна использоваться числовая переменная.");
      const right = Number(match[3]);
      const result = ({ "<": left < right, ">": left > right, "==": left === right, "!=": left !== right, "<=": left <= right, ">=": left >= right })[match[2]];
      index += 1;
      const yes = [], no = [];
      while (index < lines.length && /^    /.test(lines[index])) yes.push(lines[index++].slice(4));
      if (lines[index]?.trim() === "else:") {
        index += 1;
        while (index < lines.length && /^    /.test(lines[index])) no.push(lines[index++].slice(4));
      }
      executeBlock(result ? yes : no);
      continue;
    }
    match = line.match(/^for\s+([A-Za-z_]\w*)\s+in\s+range\((\d+),\s*(\d+)\)\s*:$/);
    if (match) {
      const variable = match[1], start = Number(match[2]), end = Number(match[3]);
      index += 1;
      const body = [];
      while (index < lines.length && /^    /.test(lines[index])) body.push(lines[index++].slice(4));
      if (end - start > 100) throw new Error("Слишком большой диапазон для учебного примера.");
      for (let value = start; value < end; value += 1) { variables[variable] = value; executeBlock(body); }
      continue;
    }
    throw new Error("Строка " + (index + 1) + ": проверьте синтаксис учебной конструкции.");
  }
  return output.join("\n");
}

function renderShell(app) {
  app.innerHTML = '<header class="site-header"><div class="header-inner">' +
    '<a class="brand" href="' + new URL("../../assets/icons/meridian.svg", import.meta.url).href + '" aria-label="Meridian — главная"><img src="' + new URL("../../assets/icons/meridian.svg", import.meta.url).href + '" alt="Meridian"><span>Meridian</span></a>' +
    '<nav class="header-nav" aria-label="Навигация"><a class="button button-quiet" href="#/">На главную</a></nav></div></header>' +
    '<main class="page"><div class="page-heading"><div><p class="eyebrow">03 / Python</p><h1>Основы Python</h1><p>Короткая теория и практика в редакторе.</p></div></div>' +
    '<section id="python-content" aria-live="polite"></section></main><footer class="footer-inner">Python · Черновик сохраняется автоматически</footer>';
}

export async function renderPython(app) {
  const lessons = await loadJSON(lessonsUrl);
  if (!Array.isArray(lessons) || lessons.length !== 4 || lessons.some(lesson =>
    !lesson.id || !lesson.title || !lesson.theory || typeof lesson.starterCode !== "string" ||
    typeof lesson.expectedOutput !== "string" || typeof lesson.hint !== "string"
  )) throw new Error("Набор Python-уроков имеет неверный формат.");

  const completed = readStored(COMPLETED_KEY, [], isStringArray);
  const session = readStored(SESSION_KEY, null);
  const attempts = readStored(ATTEMPTS_KEY, {});
  let currentLesson = lessons.find(lesson => lesson.id === session?.lessonId) || null;
  let draftCode = currentLesson && typeof session?.code === "string" ? session.code : "";
  renderShell(app);
  const content = app.querySelector("#python-content");

  function renderList() {
    currentLesson = null;
    const done = lessons.filter(lesson => completed.includes(lesson.id)).length;
    content.innerHTML = '<section class="panel"><div class="subject-meta"><span>Прогресс раздела</span><strong>' + done + ' / ' + lessons.length + '</strong></div>' +
      '<div class="progress-track" id="python-list-progress" style="--progress-color:var(--color-python)"><div class="progress-fill"></div></div>' +
      '<div class="lesson-list" style="margin-top:20px">' + lessons.map((lesson, index) =>
        '<button class="lesson-link" type="button" data-open-lesson="' + escapeHTML(lesson.id) + '">' +
        '<span><strong>' + (index + 1) + '. ' + escapeHTML(lesson.title) + '</strong><small>' + (completed.includes(lesson.id) ? "Завершено" : "Урок") + '</small></span>' +
        '<span class="lesson-number ' + (completed.includes(lesson.id) ? "is-complete" : "") + '">' + (completed.includes(lesson.id) ? "✓" : String(index + 1)) + '</span></button>'
      ).join("") + '</div></section>';
    animateProgress(content.querySelector("#python-list-progress"), done / lessons.length * 100);
    content.querySelectorAll("[data-open-lesson]").forEach(button => button.addEventListener("click", () => openLesson(button.dataset.openLesson)));
  }

  function openLesson(lessonId) {
    currentLesson = lessons.find(lesson => lesson.id === lessonId);
    if (!currentLesson) return;
    const previous = readStored(SESSION_KEY, null);
    draftCode = previous?.lessonId === lessonId && typeof previous.code === "string" ? previous.code : currentLesson.starterCode;
    savePythonSession(lessonId, draftCode);
    renderLesson();
  }

  function renderLesson() {
    if (!currentLesson) return renderList();
    const lessonIndex = lessons.findIndex(lesson => lesson.id === currentLesson.id);
    content.innerHTML = '<div class="button-row" style="margin-bottom:16px"><button class="button button-secondary" id="python-back" type="button">К списку уроков</button><span class="eyebrow">Урок ' + (lessonIndex + 1) + ' из ' + lessons.length + '</span></div>' +
      '<div class="python-layout"><section class="panel"><p class="eyebrow">Теория</p><h2>' + escapeHTML(currentLesson.title) + '</h2><p>' + escapeHTML(currentLesson.theory).replace(/\n/g, "<br>") + '</p>' +
      '<p class="code-note">Нажмите «Запустить», чтобы увидеть вывод. Выполняется только небольшой безопасный набор учебных конструкций — произвольный Python-код не запускается.</p>' +
      (currentLesson.id === "loops" ? '<p class="code-note">Ожидаемый вывод: <strong>1<br>2<br>3</strong></p>' : '') + '</section>' +
      '<section class="panel"><label class="field-label" for="python-editor">Редактор кода</label><textarea class="code-editor" id="python-editor" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Редактор кода Python"></textarea>' +
      '<div class="button-row" style="margin-top:12px"><button class="button" id="python-check" type="button">Запустить и проверить</button><button class="button button-secondary" id="python-reset" type="button">Вернуть заготовку</button><button class="button button-quiet" id="python-hint" type="button" hidden>Подсказка</button></div>' +
      '<p class="code-note" id="python-hint-text" hidden></p><div class="status-line" id="python-status" role="status"></div>' +
      '<div class="python-output"><p class="eyebrow">Вывод программы</p><pre id="python-actual-output" aria-live="polite">(пока пусто)</pre></div>' +
      '<div class="progress-track" id="python-lesson-progress" style="--progress-color:var(--color-python);margin-top:16px"><div class="progress-fill"></div></div></section></div>' +
      '<div class="button-row" style="margin-top:20px;justify-content:flex-end"><button class="button button-secondary" id="python-next" type="button">Следующий урок</button></div>';

    const editor = content.querySelector("#python-editor");
    const status = content.querySelector("#python-status");
    const output = content.querySelector("#python-actual-output");
    const progressTrack = content.querySelector("#python-lesson-progress");
    editor.value = draftCode || currentLesson.starterCode;
    if (completed.includes(currentLesson.id)) { status.textContent = "Урок уже отмечен как завершённый."; animateProgress(progressTrack, 100); }
    const hintButton = content.querySelector("#python-hint");
    const hintText = content.querySelector("#python-hint-text");
    let failedAttempts = Number(attempts[currentLesson.id]) || 0;
    hintButton.hidden = failedAttempts < 1;
    hintButton.addEventListener("click", () => { hintText.textContent = currentLesson.hint; hintText.hidden = false; });
    editor.addEventListener("input", () => { draftCode = editor.value; savePythonSession(currentLesson.id, draftCode); });
    content.querySelector("#python-back").addEventListener("click", renderList);
    content.querySelector("#python-reset").addEventListener("click", () => {
      editor.value = currentLesson.starterCode; draftCode = editor.value; savePythonSession(currentLesson.id, draftCode);
      output.textContent = "(пока пусто)"; status.textContent = "Заготовка восстановлена."; status.className = "status-line";
    });
    content.querySelector("#python-check").addEventListener("click", () => {
      draftCode = editor.value; savePythonSession(currentLesson.id, draftCode);
      let actual;
      try { actual = runSafePython(editor.value); }
      catch (error) {
        actual = "Ошибка: " + error.message;
        status.className = "status-line feedback error"; status.textContent = error.message;
        output.textContent = actual;
        failedAttempts += 1; attempts[currentLesson.id] = failedAttempts; writeStored(ATTEMPTS_KEY, attempts); hintButton.hidden = false;
        return;
      }
      output.textContent = actual || "(нет вывода)";
      const expected = normalizeLines(currentLesson.expectedOutput);
      const actualLines = normalizeLines(actual).split("\n");
      const expectedLines = expected.split("\n");
      if (normalizeLines(actual) !== expected) {
        failedAttempts += 1; attempts[currentLesson.id] = failedAttempts; writeStored(ATTEMPTS_KEY, attempts); hintButton.hidden = false;
        const mismatch = Array.from({ length: Math.max(expectedLines.length, actualLines.length) }, (_, index) => index).find(index => expectedLines[index] !== actualLines[index]) ?? 0;
        status.className = "status-line feedback error";
        status.textContent = "Первое расхождение в строке " + (mismatch + 1) + ". Ожидалось: «" + (expectedLines[mismatch] ?? "конец вывода") + "», получено: «" + (actualLines[mismatch] ?? "нет строки") + "».";
        return;
      }
      const wasCompleted = completed.includes(currentLesson.id);
      if (!wasCompleted) { completed.push(currentLesson.id); writeStored(COMPLETED_KEY, completed); }
      editor.classList.remove("is-correct"); void editor.offsetWidth; editor.classList.add("is-correct");
      window.setTimeout(() => editor.classList.remove("is-correct"), 600);
      status.className = "status-line feedback success"; status.textContent = "Вывод совпадает с ожидаемым.";
      window.setTimeout(() => animateProgress(progressTrack, 100), 600);
      if (!wasCompleted && lessons.every(lesson => completed.includes(lesson.id))) celebrate(status, "Раздел Python завершён.", 800);
    });
    content.querySelector("#python-next").addEventListener("click", () => {
      const next = lessons[lessonIndex + 1];
      if (next) openLesson(next.id); else renderList();
    });
  }

  if (currentLesson) renderLesson(); else renderList();
}
