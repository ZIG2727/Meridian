import { loadJSON, readStored, writeStored, removeStored } from "../storage.js";

const deckUrl = new URL("../../data/english-deck.json", import.meta.url);
const PROGRESS_KEY = "mrd:english:progress";
const SESSION_KEY = "mrd:english:session";

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function normalizeAnswer(value) {
  return String(value).trim().toLocaleLowerCase("en").replace(/\s+/g, " ").replace(/[?.!,]$/g, "");
}

function dueAt(progress, index) {
  const entry = progress[String(index)];
  return !entry || !Number.isFinite(entry.due) || entry.due <= Date.now();
}

function dueCards(deck, progress, filter) {
  return deck.map((card, index) => index).filter(index => filter === "all" || dueAt(progress, index));
}

function saveEnglishSession(currentCardIndex, deckFilter) {
  writeStored(SESSION_KEY, { currentCardIndex, deckFilter });
}

function updateSM2(progress, cardIndex, rating) {
  const previous = progress[String(cardIndex)] || { ease: 2.5, interval: 0, due: 0, repetitions: 0 };
  const quality = { again: 1, hard: 3, good: 4, easy: 5 }[rating];
  let ease = Number(previous.ease) || 2.5;
  let repetitions = Number(previous.repetitions) || 0;
  let interval = Number(previous.interval) || 0;

  ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.max(1, Math.round(interval * ease));
    repetitions += 1;
  }

  progress[String(cardIndex)] = {
    ease: Number(ease.toFixed(2)),
    interval,
    due: Date.now() + interval * 24 * 60 * 60 * 1000,
    repetitions
  };
}

function renderPageShell(app, count, filter) {
  app.innerHTML = '<header class="site-header"><div class="header-inner">' +
    '<a class="brand" href="#/" aria-label="Meridian — главная"><img src="' + new URL("../../assets/icons/meridian.svg", import.meta.url).href + '" alt="Meridian"><span>Meridian</span></a>' +
    '<nav class="header-nav" aria-label="Навигация"><a class="button button-quiet" href="#/">На главную</a></nav></div></header>' +
    '<main class="page"><div class="page-heading"><div><p class="eyebrow">01 / Английский · RU → EN</p><h1>Карточки слов и фраз</h1><p>Вспомните перевод, затем оцените, насколько легко он дался.</p></div>' +
    '<label><span class="field-label">Набор</span><select class="form-field" id="deck-filter" aria-label="Фильтр карточек"><option value="all">Все карточки</option><option value="due">Пора повторить</option></select></label></div>' +
    '<div class="subject-meta"><span id="card-counter">' + count + ' карточек к повторению</span><span>Интервалы SM-2</span></div>' +
    '<section id="english-content" aria-live="polite"></section></main>' +
    '<footer class="footer-inner">Английский · Прогресс сохраняется автоматически</footer>';
  app.querySelector("#deck-filter").value = filter;
}

export async function renderEnglish(app) {
  const deck = await loadJSON(deckUrl);
  if (!Array.isArray(deck) || deck.length < 12 || deck.some(card =>
    typeof card.ru !== "string" || typeof card.en !== "string" || typeof card.example !== "string"
  )) throw new Error("Набор английских карточек имеет неверный формат.");

  const progress = readStored(PROGRESS_KEY, {});
  const savedSession = readStored(SESSION_KEY, null);
  let deckFilter = ["all", "due"].includes(savedSession?.deckFilter) ? savedSession.deckFilter : "all";
  let currentCardIndex = Number.isInteger(savedSession?.currentCardIndex) &&
    savedSession.currentCardIndex >= 0 && savedSession.currentCardIndex < deck.length
    ? savedSession.currentCardIndex : 0;
  let cardIndices = dueCards(deck, progress, deckFilter);
  if (deckFilter === "due" && cardIndices.length === 0) deckFilter = "all";
  cardIndices = dueCards(deck, progress, deckFilter);
  saveEnglishSession(currentCardIndex, deckFilter);

  renderPageShell(app, cardIndices.length, deckFilter);
  const content = app.querySelector("#english-content");
  const counter = app.querySelector("#card-counter");
  const filterSelect = app.querySelector("#deck-filter");

  function renderComplete() {
    removeStored(SESSION_KEY);
    content.innerHTML = '<section class="empty-state"><p class="eyebrow">Сессия завершена</p><h2>На сегодня достаточно</h2><p>Карточки пройдены. Возвращайтесь к повторению, когда подойдёт следующий интервал.</p><a class="button" href="#/">На главную</a></section>';
    counter.textContent = "Карточки этой сессии пройдены";
  }

  function renderCard() {
    cardIndices = dueCards(deck, progress, deckFilter);
    if (cardIndices.length === 0) {
      content.innerHTML = '<section class="empty-state"><h2>Пока нечего повторять</h2><p>Карточки с будущей датой повторения ещё не наступили. Можно пройти весь набор.</p><button class="button button-secondary" id="show-all-cards" type="button">Показать все карточки</button></section>';
      counter.textContent = "Нет карточек с наступившим сроком";
      content.querySelector("#show-all-cards").addEventListener("click", () => {
        deckFilter = "all";
        currentCardIndex = 0;
        filterSelect.value = deckFilter;
        saveEnglishSession(currentCardIndex, deckFilter);
        renderCard();
      });
      return;
    }

    const position = cardIndices.indexOf(currentCardIndex);
    if (position < 0) currentCardIndex = cardIndices[0];
    const card = deck[currentCardIndex];
    const cardPosition = cardIndices.indexOf(currentCardIndex) + 1;
    const itemProgress = progress[String(currentCardIndex)];
    const intervalText = itemProgress?.interval ? "Следующий интервал: " + itemProgress.interval + " дн." : "Новая карточка";
    counter.textContent = cardPosition + " из " + cardIndices.length + " · " + intervalText;
    saveEnglishSession(currentCardIndex, deckFilter);

    content.innerHTML = '<section class="study-card" aria-label="Карточка для перевода">' +
      '<div class="flashcard-stage" id="flashcard-stage"><div class="flashcard-inner">' +
      '<div class="flashcard-front"><p class="eyebrow">Переведите на английский</p><h2 class="prompt-word">' + escapeHTML(card.ru) + '</h2>' +
      '<form id="answer-form"><label class="field-label" for="english-answer">Ваш перевод</label><input class="form-field" id="english-answer" name="answer" autocomplete="off" autocapitalize="none" spellcheck="false" required aria-label="Введите перевод на английском">' +
      '<div class="button-row" style="justify-content:center;margin-top:16px"><button class="button answer-check" type="submit">Проверить</button></div></form></div>' +
      '<div class="flashcard-back" inert><p class="eyebrow">Ответ</p><h2 class="prompt-word">' + escapeHTML(card.en) + '</h2>' +
      '<div id="answer-feedback" class="feedback" aria-live="polite"></div><p class="example-text">' + escapeHTML(card.example) + '</p>' +
      '<p class="field-label" style="text-align:center;margin-top:20px">Насколько легко вспомнили?</p>' +
      '<div class="rating-row">' +
      '<button class="rating-button" type="button" data-rating="again"><strong>Again</strong><small>Снова</small></button>' +
      '<button class="rating-button" type="button" data-rating="hard"><strong>Hard</strong><small>Трудно</small></button>' +
      '<button class="rating-button" type="button" data-rating="good"><strong>Good</strong><small>Хорошо</small></button>' +
      '<button class="rating-button" type="button" data-rating="easy"><strong>Easy</strong><small>Легко</small></button></div></div>' +
      '</div></div></section>';

    const stage = content.querySelector("#flashcard-stage");
    const form = content.querySelector("#answer-form");
    const answerInput = content.querySelector("#english-answer");
    let checked = false;
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (checked) return;
      checked = true;
      const correct = normalizeAnswer(answerInput.value) === normalizeAnswer(card.en);
      stage.classList.add("is-revealed");
      stage.querySelector(".flashcard-front").setAttribute("inert", "");
      stage.querySelector(".flashcard-back").removeAttribute("inert");
      answerInput.disabled = true;
      const checkButton = content.querySelector(".answer-check");
      checkButton.disabled = true;
      const feedback = content.querySelector("#answer-feedback");
      feedback.className = "feedback " + (correct ? "success" : "error");
      feedback.textContent = correct
        ? "Верно. Теперь оцените, насколько легко вспомнили перевод."
        : "Ответ отличается от нужного варианта. Сравните написание и порядок слов.";

      content.querySelectorAll(".rating-button").forEach(button => {
        button.addEventListener("click", () => {
          updateSM2(progress, currentCardIndex, button.dataset.rating);
          writeStored(PROGRESS_KEY, progress);
          const currentPosition = cardIndices.indexOf(currentCardIndex);
          const nextPosition = currentPosition + 1;
          if (nextPosition >= cardIndices.length) {
            removeStored(SESSION_KEY);
            renderComplete();
            return;
          }
          currentCardIndex = cardIndices[nextPosition];
          saveEnglishSession(currentCardIndex, deckFilter);
          renderCard();
        }, { once: true });
      });
      if (correct) checkButton.classList.add("is-correct");
    });
    if (position < 0) answerInput.focus();
  }

  filterSelect.addEventListener("change", () => {
    deckFilter = filterSelect.value === "due" ? "due" : "all";
    currentCardIndex = 0;
    saveEnglishSession(currentCardIndex, deckFilter);
    renderCard();
  });

  renderCard();
}