import { loadJSON, readStored, writeStored, isStringArray } from "../storage.js";
import { animateProgress, celebrate } from "../motion.js";

const lessonsUrl = new URL("../../data/python-lessons.json", import.meta.url);
const SESSION_KEY = "mrd:python:session";
const COMPLETED_KEY = "mrd:python:completed";

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function savePythonSession(lessonId, code) {
  writeStored(SESSION_KEY, { lessonId, code });
}

function renderShell(app) {
  app.innerHTML = '<header class="site-header"><div class="header-inner">' +
    '<a class="brand" href="#/" aria-label="Meridian — главная"><img src="' + new URL("../../assets/icons/meridian.svg", import.meta.url).href + '" alt="Meridian"><span>Meridian</span></a>' +
    '<nav class="header-nav" aria-label="Навигация"><a class="button button-quiet" href="#/">На главную</a></nav></div></header>' +
    '<main class="page"><div class="page-heading"><div><p class="eyebrow">03 / Python</p><h1>Основы Python</h1><p>Короткая теория и практика в редакторе.</p></div></div>' +
    '<section id="python-content" aria-live="polite"></section></main><footer class="footer-inner">Python · Черновик сохраняется автоматически</footer>';
}

export async function renderPython(app) {
  const lessons = await loadJSON(lessonsUrl);
  if (!Array.isArray(lessons) || lessons.length < 4 || lessons.some(lesson =>
    !lesson.id || !lesson.title || !lesson.theory || typeof lesson.starterCode !== "string" || typeof lesson.expectedOutput !== "string"
  )) throw new Error("Набор Python-уроков имеет неверный формат.");

  const completed = readStored(COMPLETED_KEY, [], isStringArray);
  const session = readStored(SESSION_KEY, null);
  let currentLesson = lessons.find(lesson => lesson.id === session?.lessonId) || null;
  let draftCode = currentLesson && typeof session?.code === "string" ? session.code : "";
  renderShell(app);
  const content = app.querySelector("#python-content");

  function renderList() {
    const done = lessons.filter(lesson => completed.includes(lesson.id)).length;
    const percent = lessons.length ? done / lessons.length * 100 : 0;
    content.innerHTML = '<section class="panel"><div class="subject-meta"><span>Прогресс раздела</span><strong>' + done + ' / ' + lessons.length + '</strong></div>' +
      '<div class="progress-track" id="python-list-progress" style="--progress-color:var(--color-python)"><div class="progress-fill"></div></div>' +
      '<div class="lesson-list" style="margin-top:20px">' + lessons.map((lesson, index) =>
        '<button class="lesson-link" type="button" data-open-lesson="' + escapeHTML(lesson.id) + '">' +
        '<span><strong>' + (index + 1) + '. ' + escapeHTML(lesson.title) + '</strong><small>' + (completed.includes(lesson.id) ? "Завершено" : "Урок") + '</small></span>' +
        '<span class="lesson-number ' + (completed.includes(lesson.id) ? "is-complete" : "") + '">' + (completed.includes(lesson.id) ? "✓" : String(index + 1)) + '</span></button>'
      ).join("") + '</div></section>';

    animateProgress(content.querySelector("#python-list-progress"), percent);
    content.querySelectorAll("[data-open-lesson]").forEach(button => {
      button.addEventListener("click", () => openLesson(button.dataset.openLesson));
    });
  }

  function openLesson(lessonId) {
    currentLesson = lessons.find(lesson => lesson.id === lessonId);
    if (!currentLesson) return;
    const previous = readStored(SESSION_KEY, null);
    draftCode = previous?.lessonId === lessonId && typeof previous.code === "string"
      ? previous.code : currentLesson.starterCode;
    savePythonSession(lessonId, draftCode);
    renderLesson();
  }

  function renderLesson() {
    if (!currentLesson) return renderList();
    const lessonIndex = lessons.findIndex(lesson => lesson.id === currentLesson.id);
    content.innerHTML = '<div class="button-row" style="margin-bottom:16px"><button class="button button-secondary" id="python-back" type="button">К списку уроков</button><span class="eyebrow">Урок ' + (lessonIndex + 1) + ' из ' + lessons.length + '</span></div>' +
      '<div class="python-layout"><section class="panel"><p class="eyebrow">Теория</p><h2>' + escapeHTML(currentLesson.title) + '</h2><p>' + escapeHTML(currentLesson.theory).replace(/\n/g, "<br>") + '</p>' +
      '<p class="code-note">Проверка сравнивает ваш текст с эталонным решением. Код Python здесь не запускается.</p></section>' +
      '<section class="panel"><label class="field-label" for="python-editor">Редактор кода</label><textarea class="code-editor" id="python-editor" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Редактор кода Python"></textarea>' +
      '<div class="button-row" style="margin-top:12px"><button class="button" id="python-check" type="button">Проверить</button><button class="button button-secondary" id="python-reset" type="button">Вернуть заготовку</button></div>' +
      '<div class="status-line" id="python-status" role="status"></div><div class="progress-track" id="python-lesson-progress" style="--progress-color:var(--color-python);margin-top:16px"><div class="progress-fill"></div></div></section></div>' +
      '<div class="button-row" style="margin-top:20px;justify-content:flex-end"><button class="button button-secondary" id="python-next" type="button">Следующий урок</button></div>';

    const editor = content.querySelector("#python-editor");
    const status = content.querySelector("#python-status");
    const progressTrack = content.querySelector("#python-lesson-progress");
    editor.value = draftCode || currentLesson.starterCode;
    if (completed.includes(currentLesson.id)) {
      status.textContent = "Урок уже отмечен как завершённый.";
      animateProgress(progressTrack, 100);
    }

    editor.addEventListener("input", () => {
      draftCode = editor.value;
      savePythonSession(currentLesson.id, draftCode);
    });

    content.querySelector("#python-back").addEventListener("click", renderList);
    content.querySelector("#python-reset").addEventListener("click", () => {
      editor.value = currentLesson.starterCode;
      draftCode = editor.value;
      savePythonSession(currentLesson.id, draftCode);
      status.textContent = "Заготовка восстановлена.";
      status.className = "status-line";
    });

    content.querySelector("#python-check").addEventListener("click", () => {
      const matches = editor.value.trim() === currentLesson.expectedOutput.trim();
      draftCode = editor.value;
      savePythonSession(currentLesson.id, draftCode);
      if (!matches) {
        status.className = "status-line feedback error";
        status.textContent = "Текст отличается от эталонного решения. Проверьте отступы, кавычки и названия переменных.";
        return;
      }

      const wasCompleted = completed.includes(currentLesson.id);
      if (!wasCompleted) {
        completed.push(currentLesson.id);
        writeStored(COMPLETED_KEY, completed);
      }
      editor.classList.remove("is-correct");
      void editor.offsetWidth;
      editor.classList.add("is-correct");
      status.className = "status-line feedback success";
      status.textContent = "Код совпадает с эталонным решением.";
      animateProgress(progressTrack, 100);
      if (!wasCompleted) {
        const moduleComplete = lessons.every(lesson => completed.includes(lesson.id));
        celebrate(status, moduleComplete ? "Раздел Python завершён." : "Урок завершён.", 800);
      }
    });

    content.querySelector("#python-next").addEventListener("click", () => {
      const next = lessons[lessonIndex + 1];
      if (next) openLesson(next.id);
      else renderList();
    });
  }

  if (currentLesson) renderLesson();
  else renderList();
}