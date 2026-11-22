import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const outputDir = resolve(root, "artifacts/visual-smoke");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = resolve(root, relative);
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const content = await readFile(file);
    response.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    response.end(content);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await mkdir(outputDir, { recursive: true });
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
const baseUrl = "http://127.0.0.1:" + address.port;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("requestfailed", request => failedRequests.push(request.url() + " :: " + (request.failure()?.errorText || "failed")));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const waitForImages = async () => {
  await page.locator(".subject-media img, .module-hero-image img, .visual-gallery-card img").evaluateAll(images => {
    images.forEach(image => { image.loading = "eager"; });
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll(".subject-media img, .module-hero-image img, .visual-gallery-card img"))
    .every(image => image.naturalWidth > 0 || image.closest(".subject-media, .module-hero-image, .visual-gallery-card")?.classList.contains("is-image-missing")),
  null, { timeout: 8000 });
  const unresolved = await page.locator(".subject-media img, .module-hero-image img, .visual-gallery-card img").evaluateAll(images =>
    images.filter(image => image.naturalWidth === 0 &&
      !image.closest(".subject-media, .module-hero-image, .visual-gallery-card")?.classList.contains("is-image-missing")).length
  );
  assert(unresolved === 0, "Image neither loaded nor reached its fallback state");
};
const checkNoOverflow = async label => {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth
  }));
  assert(dimensions.document <= dimensions.viewport + 1,
    label + ": horizontal overflow (" + dimensions.document + "px > " + dimensions.viewport + "px)");
};
const sizes = [
  { name: "mobile-360", width: 360, height: 800 },
  { name: "tablet-768", width: 768, height: 900 },
  { name: "desktop-1280", width: 1280, height: 900 }
];

try {
  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.locator(".subject-card").first().waitFor();
    assert(await page.locator(".subject-card").count() === 3, "Dashboard must show all three subjects");
    await page.locator(".subject-card").last().scrollIntoViewIfNeeded();
    await waitForImages();
    await page.waitForTimeout(250);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(450);
    await checkNoOverflow("Dashboard " + size.name);
    await page.screenshot({ path: resolve(outputDir, "dashboard-" + size.name + ".png"), fullPage: true });
    console.log("Dashboard responsive check passed:", size.name);
  }

  for (const subject of ["english", "chess", "python"]) {
    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(baseUrl + "/#/" + subject, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector(".module-hero") || document.querySelector(".error-state"), null, { timeout: 10000 });
      const routeError = await page.locator(".error-state").innerText().catch(() => "");
      if (routeError) {
        const details = await page.evaluate(() => ({
          href: location.href,
          appText: document.querySelector("#app")?.innerText,
          appMarkup: document.querySelector("#app")?.innerHTML.slice(0, 2400)
        }));
        throw new Error(subject + " route rendered an error state: " + JSON.stringify({
          routeError, details, pageErrors, consoleErrors, failedRequests: failedRequests.slice(-12)
        }));
      }
      assert(await page.locator(".module-hero").count() === 1, subject + ": module hero was not rendered");
      assert(await page.locator(".visual-gallery-card").count() === 2, subject + ": expected two gallery cards");
      await page.locator(".visual-gallery-card").last().scrollIntoViewIfNeeded();
      await waitForImages();
      await page.waitForTimeout(350);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      await checkNoOverflow(subject + " " + size.name);

      const toggle = page.locator(".unit-group-toggle").first();
      if (await toggle.count()) {
        const before = await toggle.getAttribute("aria-expanded");
        await toggle.click();
        const after = await toggle.getAttribute("aria-expanded");
        assert(before !== after, subject + ": unit group toggle did not change state");
        await toggle.click();
        assert(await toggle.getAttribute("aria-expanded") === before, subject + ": unit group did not reopen");
        await page.waitForTimeout(500);
      }

      await page.screenshot({ path: resolve(outputDir, subject + "-" + size.name + ".png"), fullPage: true });
      console.log("Subject responsive check passed:", subject, size.name);
    }
  }

  await page.goto(baseUrl + "/#/english/en-a1-greetings/en-a1-greetings-01", { waitUntil: "domcontentloaded" });
  await page.locator("#english-answer").waitFor();
  await page.locator("#english-answer").fill("  HELLO  ");
  await page.locator("#check-answer").click();
  assert(await page.locator(".answer-feedback.is-correct").count() === 1,
    "Typed English answer should ignore case and surrounding spaces");
  await page.screenshot({ path: resolve(outputDir, "english-answer-correct.png"), fullPage: true });
  await page.locator('[data-rating="good"]').click();
  assert((await page.locator(".prompt-word").innerText()).trim() === "привет",
    "English SRS should advance to the next card after rating");
  await page.reload({ waitUntil: "domcontentloaded" });
  assert((await page.locator(".prompt-word").innerText()).trim() === "привет",
    "English session should resume the exact card after reload");
  await page.locator("#english-answer").fill("incorrect");
  await page.locator("#check-answer").click();
  assert(await page.locator(".answer-feedback.is-incorrect").count() === 1,
    "Incorrect English answer should show corrective feedback");
  await page.screenshot({ path: resolve(outputDir, "english-answer-incorrect.png"), fullPage: true });
  await page.locator('[data-rating="good"]').click();
  await page.goto(baseUrl + "/#/english", { waitUntil: "domcontentloaded" });
  await page.locator(".english-mistakes-panel").waitFor();
  assert((await page.locator(".english-mistakes-count").innerText()).trim() === "1",
    "Incorrect answers should be added to the English review list");
  await page.goto(baseUrl + "/#/english/en-a1-greetings/en-a1-greetings-01", { waitUntil: "domcontentloaded" });
  await page.locator("#english-answer").waitFor();
  assert((await page.locator(".prompt-word").innerText()).trim() === "привет",
    "Mistake review must include a card even while its SM-2 interval is in the future");
  await page.locator("#english-answer").fill("hi");
  await page.locator("#check-answer").click();
  assert(await page.locator(".answer-feedback.is-correct").count() === 1,
    "Corrected answer should be accepted during another pass");
  await page.goto(baseUrl + "/#/english", { waitUntil: "domcontentloaded" });
  assert(await page.locator(".english-mistakes-panel").count() === 0,
    "Corrected cards should leave the English review list");

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator("[data-profile-open]").waitFor();
  await page.locator("[data-profile-open]").click();
  await page.locator("#profile-dialog").waitFor({ state: "visible" });
  await page.locator("#profile-name").fill("Meridian Test");
  await page.locator("#profile-goal").selectOption("2");
  await page.locator("#profile-dialog button[type=submit]").click();
  assert((await page.locator(".profile-greeting h2").innerText()).includes("Meridian Test"),
    "Profile name was not saved");
  await page.evaluate(async () => {
    const profile = await import("/js/profile.js");
    profile.recordLessonCompletion("english", "en-browser-smoke-test");
    profile.recordLessonCompletion("english", "en-browser-smoke-test");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-profile-open]").waitFor();
  assert(await page.locator(".profile-metric strong").first().innerText() === "20",
    "XP reward must be idempotent");
  assert((await page.locator(".profile-goal-head strong").innerText()).trim() === "1 / 2",
    "Daily goal should reflect the completed lesson");
  assert((await page.locator(".profile-greeting h2").innerText()).includes("Meridian Test"),
    "Profile settings did not persist after reload");

  assert(pageErrors.length === 0, "Browser runtime errors: " + pageErrors.join(" | "));
  console.log("Responsive browser smoke tests and profile persistence checks passed.");
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
