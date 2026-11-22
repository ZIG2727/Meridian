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
const microBound = new WeakSet();
export function bindMicroInteractions(root) {
  if (!root || microBound.has(root)) return;
  microBound.add(root);
  root.addEventListener("error", event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const frame = image.closest(".subject-media, .module-hero-image, .visual-gallery-card");
    if (!frame || frame.classList.contains("is-image-missing")) return;
    frame.classList.add("is-image-missing");
    const alt = image.alt;
    image.remove();
    const label = document.createElement("span");
    label.className = "image-fallback-label";
    label.textContent = alt || "Изображение временно недоступно";
    frame.append(label);
  }, true);
  root.addEventListener("pointerdown", event => {
    if (prefersReducedMotion()) return;
    const control = event.target.closest(".button, .rating-button, .quiz-option");
    if (!control || control.disabled || !root.contains(control)) return;
    const bounds = control.getBoundingClientRect();
    const diameter = Math.max(bounds.width, bounds.height) * 1.35;
    const ripple = document.createElement("span");
    ripple.className = "motion-ripple";
    ripple.style.width = diameter + "px";
    ripple.style.height = diameter + "px";
    ripple.style.left = (event.clientX - bounds.left - diameter / 2) + "px";
    ripple.style.top = (event.clientY - bounds.top - diameter / 2) + "px";
    control.append(ripple);
    window.setTimeout(() => ripple.remove(), 650);
  }, true);
}
