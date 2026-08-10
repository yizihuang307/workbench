const { chromium } = require('playwright');
const path = require('path');

const root = __dirname;
const targets = [
  ['#xhs-01', 'xhs-01-cover.png'],
  ['#xhs-02', 'xhs-02-product-demo.png'],
  ['#wechat-21x9', 'wechat-21x9-cover.png'],
  ['#wechat-1x1', 'wechat-1x1-cover.png'],
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.goto(`file://${path.join(root, 'index.html')}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  for (const [selector, filename] of targets) {
    await page.locator(selector).screenshot({ path: path.join(root, 'output', filename) });
  }
  await browser.close();
})();
