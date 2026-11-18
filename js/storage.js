const PREFIX = "mrd:";

export function readStored(key, fallback, validate) {
  if (!key.startsWith(PREFIX)) throw new Error("Ключи Meridian должны начинаться с mrd:");
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw);
    return typeof validate === "function" && !validate(value) ? fallback : value;
  } catch {
    return fallback;
  }
}

export function writeStored(key, value) {
  if (!key.startsWith(PREFIX)) throw new Error("Ключи Meridian должны начинаться с mrd:");
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStored(key) {
  if (!key.startsWith(PREFIX)) throw new Error("Ключи Meridian должны начинаться с mrd:");
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export async function loadJSON(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error("Не удалось загрузить учебные данные. Проверьте подключение к серверу.");
  return response.json();
}

export function isStringArray(value) {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}