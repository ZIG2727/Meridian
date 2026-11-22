const PROFILE_KEY = "mrd:v3:profile";
const DEFAULT_PROFILE = Object.freeze({
  name: "Ученик",
  dailyGoal: 1,
  xp: 0,
  completedLessonIds: [],
  activity: {}
});

const clampInteger = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.floor(number))) : fallback;
};
const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
};
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, character =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character])
);

export function normalizeProfile(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const activity = {};
  if (source.activity && typeof source.activity === "object" && !Array.isArray(source.activity)) {
    for (const [date, item] of Object.entries(source.activity)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !item || typeof item !== "object") continue;
      activity[date] = {
        lessons: clampInteger(item.lessons, 0, 10000, 0),
        xp: clampInteger(item.xp, 0, 1000000, 0)
      };
    }
  }
  const completedLessonIds = Array.isArray(source.completedLessonIds)
    ? [...new Set(source.completedLessonIds.filter(item => typeof item === "string" && item.length <= 160))].slice(-5000)
    : [];
  return {
    name: typeof source.name === "string" && source.name.trim()
      ? source.name.trim().slice(0, 24)
      : DEFAULT_PROFILE.name,
    dailyGoal: clampInteger(source.dailyGoal, 1, 10, DEFAULT_PROFILE.dailyGoal),
    xp: clampInteger(source.xp, 0, 100000000, 0),
    completedLessonIds,
    activity
  };
}

function storage() {
  try { return typeof window !== "undefined" ? window.localStorage : null; }
  catch { return null; }
}
export function readProfile() {
  const store = storage();
  if (!store) return normalizeProfile(DEFAULT_PROFILE);
  try { return normalizeProfile(JSON.parse(store.getItem(PROFILE_KEY) || "null")); }
  catch { return normalizeProfile(DEFAULT_PROFILE); }
}
export function saveProfile(value) {
  const profile = normalizeProfile(value);
  const store = storage();
  if (store) {
    try { store.setItem(PROFILE_KEY, JSON.stringify(profile)); }
    catch { /* Private browsing or storage quota: keep the current session usable. */ }
  }
  return profile;
}
export function recordLessonCompletion(module, lessonId, now = new Date()) {
  if (!["english", "chess", "python"].includes(module) || typeof lessonId !== "string" || !lessonId) return false;
  const profile = readProfile();
  if (profile.completedLessonIds.includes(lessonId)) return false;
  const date = localDateKey(now);
  const day = profile.activity[date] || { lessons: 0, xp: 0 };
  const reward = 20;
  profile.completedLessonIds.push(lessonId);
  profile.xp += reward;
  profile.activity[date] = { lessons: day.lessons + 1, xp: day.xp + reward };
  saveProfile(profile);
  return true;
}

export function calculateProfileStats(profileValue, completedCount = 0, now = new Date()) {
  const profile = normalizeProfile(profileValue);
  const today = localDateKey(now);
  const activity = profile.activity;
  const todayLessons = activity[today]?.lessons || 0;
  const week = [];
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const key = localDateKey(date);
    week.push({
      key,
      label: new Intl.DateTimeFormat("ru", { weekday: "short" }).format(date).replace(".", ""),
      lessons: activity[key]?.lessons || 0
    });
  }
  const activeDate = activity[today]?.lessons ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) :
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  let streak = 0;
  for (let offset = 0; offset < 366; offset++) {
    const date = new Date(activeDate.getFullYear(), activeDate.getMonth(), activeDate.getDate() - offset);
    if (!(activity[localDateKey(date)]?.lessons > 0)) break;
    streak++;
  }
  return {
    todayLessons,
    dailyGoal: profile.dailyGoal,
    goalPercent: Math.min(100, Math.round(todayLessons / profile.dailyGoal * 100)),
    streak,
    week,
    weekLessons: week.reduce((sum, day) => sum + day.lessons, 0),
    completedCount: clampInteger(completedCount, 0, 100000, 0),
    xp: profile.xp
  };
}

export function renderProfilePanel(completedCount = 0, profileValue = readProfile(), now = new Date()) {
  const profile = normalizeProfile(profileValue);
  const stats = calculateProfileStats(profile, completedCount, now);
  const initial = escapeHTML(Array.from(profile.name)[0]?.toUpperCase() || "У");
  const bars = stats.week.map(day => {
    const height = day.lessons ? Math.max(8, Math.round(day.lessons / Math.max(1, ...stats.week.map(item => item.lessons)) * 100)) : 3;
    const today = day.key === localDateKey(now);
    return '<div class="profile-day' + (today ? ' is-today' : '') + '" aria-label="' + escapeHTML(day.label + ': ' + day.lessons + ' уроков') + '"><div class="profile-bar-track"><span style="--bar-height:' + height + '%"></span></div><small>' + escapeHTML(day.label) + '</small></div>';
  }).join("");
  const goalMessage = stats.todayLessons >= stats.dailyGoal
    ? "Дневная цель выполнена — отличный темп!"
    : "Ещё " + (stats.dailyGoal - stats.todayLessons) + " " + (stats.dailyGoal - stats.todayLessons === 1 ? "урок" : stats.dailyGoal - stats.todayLessons < 5 ? "урока" : "уроков") + " до цели";
  const lessonWord = value => value % 10 === 1 && value % 100 !== 11 ? "урок" :
    value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 12 || value % 100 > 14) ? "урока" : "уроков";
  const options = [1, 2, 3, 4, 5, 7, 10].map(value =>
    '<option value="' + value + '"' + (profile.dailyGoal === value ? ' selected' : '') + '>' + value + ' ' + lessonWord(value) + ' в день</option>'
  ).join("");
  return '<section class="profile-panel" aria-label="Профиль и статистика">' +
    '<div class="profile-identity"><div class="profile-avatar" aria-hidden="true">' + initial + '</div><div class="profile-greeting"><p class="eyebrow">ТВОЁ ПРОСТРАНСТВО</p><h2>Привет, ' + escapeHTML(profile.name) + '!</h2><p>Каждое занятие приближает к цели.</p></div><button class="button button-secondary profile-edit" type="button" data-profile-open>Настроить профиль</button></div>' +
    '<div class="profile-metrics"><div class="profile-metric"><strong>' + stats.xp.toLocaleString("ru-RU") + '</strong><span>опыта</span></div><div class="profile-metric"><strong>' + stats.completedCount + '</strong><span>уроков пройдено</span></div><div class="profile-metric"><strong>' + stats.streak + ' <small>дн.</small></strong><span>серия занятий</span></div></div>' +
    '<div class="profile-activity"><div class="profile-activity-head"><div><p class="eyebrow">ПОСЛЕДНИЕ 7 ДНЕЙ</p><h3>Твоя активность</h3></div><span>' + stats.weekLessons + ' уроков</span></div><div class="profile-week-chart">' + bars + '</div></div>' +
    '<div class="profile-goal"><div class="profile-goal-head"><span>Цель на сегодня</span><strong>' + stats.todayLessons + ' / ' + stats.dailyGoal + '</strong></div><div class="profile-goal-track" role="progressbar" aria-label="Выполнение дневной цели" aria-valuemin="0" aria-valuemax="' + stats.dailyGoal + '" aria-valuenow="' + Math.min(stats.todayLessons, stats.dailyGoal) + '"><span style="width:' + stats.goalPercent + '%"></span></div><p>' + goalMessage + '</p></div>' +
    '</section>' +
    '<dialog class="profile-dialog" id="profile-dialog" aria-labelledby="profile-dialog-title"><form class="profile-form" data-profile-form><div class="profile-dialog-head"><div><p class="eyebrow">ПЕРСОНАЛИЗАЦИЯ</p><h2 id="profile-dialog-title">Настройки профиля</h2></div><button class="profile-dialog-close" type="button" data-profile-close aria-label="Закрыть">×</button></div><label for="profile-name">Как к тебе обращаться?</label><input class="form-field" id="profile-name" name="name" maxlength="24" value="' + escapeHTML(profile.name) + '" required><label for="profile-goal">Дневная цель</label><select class="form-field" id="profile-goal" name="dailyGoal">' + options + '</select><div class="profile-form-actions"><button class="button button-secondary" type="button" data-profile-close>Отмена</button><button class="button" type="submit">Сохранить</button></div></form></dialog>';
}

export function bindProfilePanel(root, onUpdate = () => {}) {
  const dialog = root?.querySelector("#profile-dialog");
  const form = root?.querySelector("[data-profile-form]");
  if (!dialog || !form) return;
  root.querySelector("[data-profile-open]")?.addEventListener("click", () => dialog.showModal());
  dialog.querySelectorAll("[data-profile-close]").forEach(button => button.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(form);
    const current = readProfile();
    saveProfile({
      ...current,
      name: String(data.get("name") || "").trim() || DEFAULT_PROFILE.name,
      dailyGoal: Number(data.get("dailyGoal"))
    });
    dialog.close();
    onUpdate();
  });
}
