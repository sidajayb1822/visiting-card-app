import { chromium } from "playwright";
const Y4M = process.env.Y4M, B = process.env.BASE;
const browser = await chromium.launch({ args:["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream",`--use-file-for-fake-video-capture=${Y4M}`] });

// Real-world visible heights once browser chrome eats into the screen.
const sizes = [
  { name: "iPhone SE, Safari toolbars",  w: 375, h: 553 },
  { name: "iPhone 12, Safari toolbars",  w: 390, h: 664 },
  { name: "iPhone 12, standalone PWA",   w: 390, h: 844 },
  { name: "Pixel 5, Chrome toolbar",     w: 393, h: 727 },
  { name: "small Android, Chrome",       w: 360, h: 560 },
];

console.log("viewport                        page h   visible h   controls in view?");
console.log("-".repeat(78));
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport:{width:s.w,height:s.h}, permissions:["camera"], baseURL:B });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.fill('input[type="password"]', "1234");
  await page.click('button:has-text("Unlock")');
  await page.waitForSelector('button[aria-label="Capture card"]', { timeout: 15000 });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const link = [...document.querySelectorAll("button")].find(b => b.textContent.includes("Choose an existing photo"));
    const box = link?.getBoundingClientRect();
    return {
      scrollH: document.documentElement.scrollHeight,
      viewH: window.innerHeight,
      linkBottom: box ? Math.round(box.bottom) : null,
    };
  });
  const cut = r.linkBottom === null ? "MISSING" : (r.linkBottom <= r.viewH ? "yes" : `NO — ${r.linkBottom - r.viewH}px below fold`);
  const overflow = r.scrollH > r.viewH ? ` (overflows ${r.scrollH - r.viewH}px)` : "";
  console.log(`${s.name.padEnd(31)} ${String(r.scrollH).padEnd(8)} ${String(r.viewH).padEnd(11)} ${cut}${overflow}`);
  await ctx.close();
}
await browser.close();
