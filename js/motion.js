export function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

export function celebrate(target, message, duration = 800) {
  if (!target) return null;
  const reduced = prefersReducedMotion();
  const boundedDuration = Math.min(1200, Math.max(600, Number(duration) || 800));
  const note = document.createElement("span");
  note.className = "celebration-note" + (reduced ? " is-static" : "");
  note.setAttribute("role", "status");
  note.textContent = message || "Урок завершён";
  target.append(note);
  if (!reduced) note.style.animationDuration = boundedDuration + "ms";
  window.setTimeout(() => note.remove(), reduced ? 4000 : boundedDuration + 300);
  return note;
}

export function animateProgress(track, percentage) {
  if (!track) return;
  const safeValue = Math.min(100, Math.max(0, Number(percentage) || 0));
  track.style.setProperty("--progress", safeValue + "%");
  window.requestAnimationFrame(() => track.classList.add("is-loaded"));
}