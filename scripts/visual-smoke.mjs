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
page.on("pageerror", error => pageErrors.push(error.message));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const waitForImages = async () => {
  await page.waitForFunction(() => Array.from(document.querySelectorAll(".subject-media img, .module-hero-image img, .visual-gallery-card img"))
    .every(image => image.complete || image.closest(".subject-media, .module-hero-image, .visual-gallery-card")?.classList.contains("is-image-missing")),
  null, { timeout: 15000 });
  const broken = await page.locator(".subject-media img, .module-hero-image img, .visual-gallery-card img").evaluateAll(images =>
    images.filter(image => image.complete && image.naturalWidth === 0 &&
      !image.closest(".subject-media, .module-hero-image, .visual-gallery-card")?.classList.contains("is-image-missing")).length
  );
  assert(broken === 0, "Broken image without fallback detected");
  const pending = await page.locator(".subject-media img, .module-hero-image img, .visual-gallery-card img").evaluateAll(images => images.filter(image => !image.complete).length);
  assert(pending === 0, "Images did not settle before screenshot: " + pending);
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
    await waitForImages();
    await checkNoOverflow("Dashboard " + size.name);
    await page.screenshot({ path: resolve(outputDir, "dashboard-" + size.name + ".png"), fullPage: true });
    console.log("Dashboard responsive check passed:", size.name);
  }

  for (const subject of ["english", "chess", "python"]) {
    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(baseUrl + "/#/" + subject, { waitUntil: "domcontentloaded" });
      await page.locator(".module-hero").waitFor();
      assert(await page.locator(".visual-gallery-card").count() === 2, subject + ": expected two gallery cards");
      await waitForImages();
      await checkNoOverflow(subject + " " + size.name);

      const toggle = page.locator(".unit-group-toggle").first();
      if (await toggle.count()) {
        const before = await toggle.getAttribute("aria-expanded");
        await toggle.click();
        const after = await toggle.getAttribute("aria-expanded");
        assert(before !== after, subject + ": unit group toggle did not change state");
      }

      await page.screenshot({ path: resolve(outputDir, subject + "-" + size.name + ".png"), fullPage: true });
      console.log("Subject responsive check passed:", subject, size.name);
    }
  }

  assert(pageErrors.length === 0, "Browser runtime errors: " + pageErrors.join(" | "));
  console.log("Responsive browser smoke tests passed: 12 page/viewport combinations.");
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
